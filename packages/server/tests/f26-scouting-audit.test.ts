import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import type { PrismaClient } from '@prisma/client';
import { join } from 'node:path';
import { defaultScoutingConfig } from '@fhm/engine';
import { cleanupTempDir, createTempDatabaseUrl, migrateTempDatabase } from './helpers/db.js';
import { getRepoRoot } from '../src/initialization/paths.js';
import { COMMISSIONER_HEADER, COMMISSIONER_HEADER_VALUE } from '../src/commissioner/gate.js';

const fixtureDir = join(getRepoRoot(), 'data', 'fixtures', 'f3-minimal-world');
const commissionerHeaders = {
  [COMMISSIONER_HEADER]: COMMISSIONER_HEADER_VALUE,
  'x-fhm-commissioner-source': 'api',
};
const scoutPayload = {
  firstName: 'Audit',
  lastName: 'Scout',
  evaluatingRating: 12,
  potentialRating: 13,
  skaterRating: 11,
  goalieRating: 10,
  specialties: ['GENERAL'],
  countryFamiliarity: {},
  positionFamiliarity: {},
  persistentBias: 0,
};

describe('F26 scouting audit coverage', () => {
  let app: FastifyInstance;
  let prisma: PrismaClient;
  let tempDir: string;

  beforeAll(async () => {
    const database = createTempDatabaseUrl();
    tempDir = database.dir;
    process.env.DATABASE_URL = database.url;
    process.env.FHM_DATASET_DIR = fixtureDir;
    process.env.FHM_COMMISSIONER_WRITES_ENABLED = 'true';
    migrateTempDatabase(database.url);

    prisma = (await import('../src/db/client.js')).prisma;
    const { initializeSetup } = await import('../src/initialization/index.js');
    await prisma.appMeta.upsert({
      where: { id: 'default' },
      create: { id: 'default', worldInitialized: false },
      update: { worldInitialized: false },
    });
    await initializeSetup(prisma, fixtureDir);
    const { buildApp, ensureAppMeta } = await import('../src/app.js');
    await ensureAppMeta();
    app = await buildApp({ logger: false });
    await app.ready();
  });

  afterAll(async () => {
    if (app) await app.close();
    if (prisma) await prisma.$disconnect();
    if (tempDir) cleanupTempDir(tempDir);
  });

  it('audits Commissioner boundaries and normal assignment actions atomically', async () => {
    const initialAudits = await prisma.commissionerAuditLog.count();
    const denied = await app.inject({
      method: 'POST',
      url: '/api/commissioner/scouting/scouts',
      headers: commissionerHeaders,
      payload: scoutPayload,
    });
    expect(denied.statusCode).toBe(400);
    expect(await prisma.commissionerAuditLog.count()).toBe(initialAudits);

    const created = await app.inject({
      method: 'POST',
      url: '/api/commissioner/scouting/scouts',
      headers: commissionerHeaders,
      payload: { ...scoutPayload, reason: 'Create audit scout' },
    });
    expect(created.statusCode).toBe(200);
    const scout = created.json().item;
    expect(
      await prisma.commissionerAuditLog.count({
        where: { entityType: 'SCOUT', entityId: scout.id, action: 'SCOUT_CREATED' },
      }),
    ).toBe(1);

    const auditCountBeforeConflict = await prisma.commissionerAuditLog.count();
    const conflict = await app.inject({
      method: 'PATCH',
      url: `/api/commissioner/scouting/scouts/${scout.id}`,
      headers: commissionerHeaders,
      payload: {
        lastName: 'Changed',
        expectedUpdatedAt: '2000-01-01T00:00:00.000Z',
        reason: 'Stale edit',
      },
    });
    expect(conflict.statusCode).toBe(409);
    expect(conflict.json().error).toBe('EditConflict');
    expect(await prisma.commissionerAuditLog.count()).toBe(auditCountBeforeConflict);

    const updated = await app.inject({
      method: 'PATCH',
      url: `/api/commissioner/scouting/scouts/${scout.id}`,
      headers: commissionerHeaders,
      payload: {
        lastName: 'Changed',
        expectedUpdatedAt: scout.updatedAt,
        reason: 'Correct scout surname',
      },
    });
    expect(updated.statusCode).toBe(200);

    const team = await prisma.team.findFirstOrThrow({ where: { teamType: 'CLUB' } });
    const departmentResponse = await app.inject({
      method: 'POST',
      url: '/api/commissioner/scouting/departments',
      headers: commissionerHeaders,
      payload: {
        teamId: team.id,
        name: 'Audit Department',
        scoutIds: [scout.id],
        reason: 'Create audit department',
      },
    });
    expect(departmentResponse.statusCode).toBe(200);
    const department = departmentResponse.json().item;

    const player = await prisma.player.findFirstOrThrow({ select: { id: true } });
    const config = defaultScoutingConfig();
    const assignmentResponse = await app.inject({
      method: 'POST',
      url: `/api/teams/${team.id}/scouting/assignments`,
      payload: {
        targetType: 'PLAYER',
        playerIds: [player.id],
        scoutIds: [scout.id],
        observedOn: '2027-01-10',
        durationDays: config.observation.minDurationDays,
        seed: 'audit-assignment',
      },
    });
    expect(assignmentResponse.statusCode).toBe(200);
    const assignment = assignmentResponse.json().item;
    expect(
      await prisma.commissionerAuditLog.count({
        where: {
          entityType: 'SCOUTING_ASSIGNMENT',
          entityId: assignment.id,
          action: 'SCOUTING_ASSIGNMENT_CREATED',
        },
      }),
    ).toBe(1);

    const executed = await app.inject({
      method: 'POST',
      url: `/api/teams/${team.id}/scouting/assignments/${assignment.id}/execute`,
    });
    expect(executed.statusCode).toBe(200);
    expect(
      await prisma.commissionerAuditLog.count({
        where: {
          entityType: 'SCOUTING_ASSIGNMENT',
          entityId: assignment.id,
          action: 'SCOUTING_ASSIGNMENT_EXECUTED',
        },
      }),
    ).toBe(1);

    const cancellableResponse = await app.inject({
      method: 'POST',
      url: `/api/teams/${team.id}/scouting/assignments`,
      payload: {
        targetType: 'PLAYER',
        playerIds: [player.id],
        scoutIds: [scout.id],
        observedOn: '2027-01-11',
        durationDays: config.observation.minDurationDays,
        seed: 'audit-assignment-cancel',
      },
    });
    expect(cancellableResponse.statusCode).toBe(200);
    const cancellable = cancellableResponse.json().item;

    const beforeRejectedDelete = await prisma.commissionerAuditLog.count();
    const departmentDelete = await app.inject({
      method: 'DELETE',
      url: `/api/commissioner/scouting/departments/${department.id}`,
      headers: commissionerHeaders,
      payload: { reason: 'Remove historical department' },
    });
    expect(departmentDelete.statusCode).toBe(409);
    expect(departmentDelete.json().error).toBe('ScoutingDepartmentHasAssignmentHistory');
    expect(await prisma.commissionerAuditLog.count()).toBe(beforeRejectedDelete);

    const scoutDelete = await app.inject({
      method: 'DELETE',
      url: `/api/commissioner/scouting/scouts/${scout.id}`,
      headers: commissionerHeaders,
      payload: { reason: 'Retire historical scout' },
    });
    expect(scoutDelete.statusCode).toBe(200);
    expect(scoutDelete.json().item.status).toBe('INACTIVE');
    expect(await prisma.scout.findUniqueOrThrow({ where: { id: scout.id } })).toMatchObject({
      status: 'INACTIVE',
    });

    const cancelled = await app.inject({
      method: 'DELETE',
      url: `/api/teams/${team.id}/scouting/assignments/${cancellable.id}`,
    });
    expect(cancelled.statusCode).toBe(204);
    expect(await prisma.scoutingAssignment.findUniqueOrThrow({ where: { id: cancellable.id } })).toMatchObject({
      status: 'CANCELLED',
    });
    expect(
      await prisma.commissionerAuditLog.count({
        where: {
          entityType: 'SCOUTING_ASSIGNMENT',
          entityId: cancellable.id,
          action: 'SCOUTING_ASSIGNMENT_CANCELLED',
        },
      }),
    ).toBe(1);
  });

  it('audits scouting config creation, versioning, and activation', async () => {
    const config = defaultScoutingConfig();
    const presetResponse = await app.inject({
      method: 'POST',
      url: '/api/commissioner/scouting/configurations',
      headers: commissionerHeaders,
      payload: { name: 'Audit Config', config, reason: 'Create audit configuration' },
    });
    expect(presetResponse.statusCode).toBe(200);
    const preset = presetResponse.json().item;
    expect(
      await prisma.commissionerAuditLog.count({
        where: { entityType: 'SCOUTING_CONFIG', entityId: preset.id, action: 'SCOUTING_CONFIG_CREATED' },
      }),
    ).toBe(1);

    const versionResponse = await app.inject({
      method: 'POST',
      url: `/api/commissioner/scouting/configurations/${preset.id}/versions`,
      headers: commissionerHeaders,
      payload: { config, reason: 'Create audit configuration version' },
    });
    expect(versionResponse.statusCode).toBe(200);
    const version = versionResponse.json().item;

    const activationResponse = await app.inject({
      method: 'POST',
      url: `/api/commissioner/scouting/configuration-versions/${version.id}/activate`,
      headers: commissionerHeaders,
      payload: { reason: 'Activate audit configuration' },
    });
    expect(activationResponse.statusCode).toBe(200);
    const actions = await prisma.commissionerAuditLog.findMany({
      where: { entityType: 'SCOUTING_CONFIG_VERSION', entityId: version.id },
      select: { action: true },
    });
    expect(actions.map((row) => row.action).sort()).toEqual([
      'SCOUTING_CONFIG_ACTIVATED',
      'SCOUTING_CONFIG_VERSION_CREATED',
    ]);
  });
});
