import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import type { PrismaClient } from '@prisma/client';
import { join } from 'node:path';
import {
  cleanupTempDir,
  createTempDatabaseUrl,
  migrateTempDatabase,
} from './helpers/db.js';
import { getRepoRoot } from '../src/initialization/paths.js';
import { COMMISSIONER_HEADER, COMMISSIONER_HEADER_VALUE } from '../src/commissioner/gate.js';

const fixtureDir = join(getRepoRoot(), 'data', 'fixtures', 'f3-minimal-world');
const headers = { [COMMISSIONER_HEADER]: COMMISSIONER_HEADER_VALUE };

describe('F7 coaches, tactics, and team setup', () => {
  let app: FastifyInstance;
  let prisma: PrismaClient;
  let tempDir: string;
  let frostTeamId = '';
  let cedarTeamId = '';
  let assignedCoachId = '';
  let unassignedCoachId = '';
  let playerId = '';

  beforeAll(async () => {
    const { url, dir } = createTempDatabaseUrl();
    tempDir = dir;
    process.env.DATABASE_URL = url;
    process.env.FHM_DATASET_DIR = fixtureDir;
    process.env.FHM_COMMISSIONER_WRITES_ENABLED = 'true';
    migrateTempDatabase(url);

    const db = await import('../src/db/client.js');
    prisma = db.prisma;
    const { initializeSetup } = await import('../src/initialization/index.js');
    await prisma.appMeta.upsert({
      where: { id: 'default' },
      create: { id: 'default', worldInitialized: false },
      update: { worldInitialized: false },
    });
    await initializeSetup(prisma, fixtureDir);

    frostTeamId = (await prisma.team.findFirstOrThrow({ where: { externalId: 'team-frostbite' } })).id;
    cedarTeamId = (await prisma.team.findFirstOrThrow({ where: { externalId: 'team-cedar' } })).id;
    assignedCoachId = (
      await prisma.coach.findFirstOrThrow({ where: { externalId: 'coach-rowan-pike' } })
    ).id;
    unassignedCoachId = (
      await prisma.coach.findFirstOrThrow({ where: { externalId: 'coach-elise-quinn' } })
    ).id;
    playerId = (
      await prisma.player.findFirstOrThrow({ where: { currentTeamId: frostTeamId } })
    ).id;

    const { buildApp } = await import('../src/app.js');
    app = await buildApp({ logger: false });
    await app.ready();
  });

  beforeEach(() => {
    process.env.FHM_COMMISSIONER_WRITES_ENABLED = 'true';
  });

  afterAll(async () => {
    if (app) await app.close();
    if (prisma) await prisma.$disconnect();
    if (tempDir) cleanupTempDir(tempDir);
  });

  it('imports schemaVersion 3 coach ratings and team tactics', async () => {
    const coach = await prisma.coach.findUniqueOrThrow({ where: { id: assignedCoachId } });
    expect(coach.overallCoaching).toBe(14);
    expect(coach.playerDevelopment).toBe(13);
    const team = await prisma.team.findUniqueOrThrow({ where: { id: frostTeamId } });
    expect(team.tacticalStyle).toBe('SYSTEM');
  });

  it('lists coaches with pagination and filters', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/coaches?page=1&pageSize=10&assignment=unassigned',
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.total).toBe(1);
    expect(body.items[0].currentTeamId).toBeNull();
    expect(body.items[0].overallCoaching).toBeTypeOf('number');
  });

  it('team detail includes readiness and tactical style', async () => {
    const res = await app.inject({ method: 'GET', url: `/api/teams/${frostTeamId}` });
    expect(res.statusCode).toBe(200);
    const item = res.json().item;
    expect(item.tacticalStyle).toBe('SYSTEM');
    expect(item.readiness.status).toBe('NOT_READY');
    expect(item.readiness.checks.some((c: { code: string }) => c.code === 'AVAILABLE_FORWARDS')).toBe(
      true,
    );
  });

  it('world summary includes readiness aggregates', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/world' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.structure.teamsWithoutCoaches).toBeGreaterThanOrEqual(1);
    expect(body.structure.notReadyTeams).toBeGreaterThanOrEqual(1);
    expect(body.structure.readyTeams).toBeTypeOf('number');
    expect(body.structure.teamsWithoutTacticalStyle).toBeTypeOf('number');
  });

  it('rejects commissioner coach detail without header', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/api/commissioner/coaches/${assignedCoachId}`,
    });
    expect(res.statusCode).toBe(403);
  });

  it('edits coach ratings with audit', async () => {
    const coach = await prisma.coach.findUniqueOrThrow({ where: { id: assignedCoachId } });
    const res = await app.inject({
      method: 'PATCH',
      url: `/api/commissioner/coaches/${assignedCoachId}`,
      headers,
      payload: {
        expectedUpdatedAt: coach.updatedAt.toISOString(),
        reason: 'Tune offense rating',
        identity: {
          firstName: coach.firstName,
          lastName: coach.lastName,
          nationalityCountryId: coach.nationalityCountryId,
        },
        styles: {
          coachingStyle: coach.coachingStyle,
          tacticalStyle: coach.tacticalStyle,
        },
        ratings: {
          overallCoaching: coach.overallCoaching,
          playerDevelopment: coach.playerDevelopment,
          offense: 15,
          defense: coach.defense,
        },
        currentTeamId: coach.currentTeamId,
      },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().item.offense).toBe(15);
    const audit = await prisma.commissionerAuditLog.findFirst({
      where: { entityType: 'COACH', entityId: assignedCoachId },
      orderBy: { createdAt: 'desc' },
    });
    expect(audit?.action).toBe('COACH_UPDATED');
  });

  it('creates an unassigned coach', async () => {
    const country = await prisma.country.findFirstOrThrow();
    const res = await app.inject({
      method: 'POST',
      url: '/api/commissioner/coaches',
      headers,
      payload: {
        reason: 'Add free agent coach',
        identity: {
          firstName: 'Nora',
          lastName: 'Vale',
          nationalityCountryId: country.id,
        },
        styles: { coachingStyle: 'DEMOCRATIC', tacticalStyle: 'COMBINATIONAL' },
        ratings: {
          overallCoaching: 12,
          playerDevelopment: 12,
          offense: 11,
          defense: 12,
        },
        currentTeamId: null,
      },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().item.currentTeamId).toBeNull();
    expect(res.json().item.id).toBeTruthy();
    expect(res.json().item.firstName).toBe('Nora');
  });

  it('rejects silent coach move without moveFromOtherTeam', async () => {
    const coach = await prisma.coach.findUniqueOrThrow({ where: { id: assignedCoachId } });
    const res = await app.inject({
      method: 'PATCH',
      url: `/api/commissioner/teams/${cedarTeamId}/setup`,
      headers,
      payload: {
        expectedUpdatedAt: (await prisma.team.findUniqueOrThrow({ where: { id: cedarTeamId } }))
          .updatedAt.toISOString(),
        reason: 'silent move',
        headCoachId: assignedCoachId,
        tacticalStyle: 'PHYSICAL',
        replaceExisting: false,
        moveFromOtherTeam: false,
      },
    });
    expect(res.statusCode).toBe(409);
    expect(res.json().error).toBe('CoachAssignedElsewhere');
    void coach;
  });

  it('assigns unassigned coach to cedar with tactics update', async () => {
    const team = await prisma.team.findUniqueOrThrow({ where: { id: cedarTeamId } });
    const res = await app.inject({
      method: 'PATCH',
      url: `/api/commissioner/teams/${cedarTeamId}/setup`,
      headers,
      payload: {
        expectedUpdatedAt: team.updatedAt.toISOString(),
        reason: 'Assign Elise Quinn',
        headCoachId: unassignedCoachId,
        tacticalStyle: 'FORECHECKING',
        replaceExisting: false,
        moveFromOtherTeam: false,
      },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().item.coach.id).toBe(unassignedCoachId);
    expect(res.json().item.tacticalStyle).toBe('FORECHECKING');
    expect(res.json().item.readiness.hasHeadCoach ?? res.json().item.readiness.checks).toBeTruthy();
  });

  it('unassigns coach', async () => {
    const team = await prisma.team.findUniqueOrThrow({ where: { id: cedarTeamId } });
    const res = await app.inject({
      method: 'PATCH',
      url: `/api/commissioner/teams/${cedarTeamId}/setup`,
      headers,
      payload: {
        expectedUpdatedAt: team.updatedAt.toISOString(),
        reason: 'Unassign coach',
        headCoachId: null,
        tacticalStyle: 'FORECHECKING',
      },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().item.coach).toBeNull();
  });

  it('changes roster status and audits player', async () => {
    const player = await prisma.player.findUniqueOrThrow({ where: { id: playerId } });
    const res = await app.inject({
      method: 'PATCH',
      url: `/api/commissioner/teams/${frostTeamId}/roster-status`,
      headers,
      payload: {
        playerId,
        rosterStatus: 'UNAVAILABLE',
        expectedUpdatedAt: player.updatedAt.toISOString(),
        reason: 'Injury placeholder',
      },
    });
    expect(res.statusCode).toBe(200);
    const updated = await prisma.player.findUniqueOrThrow({ where: { id: playerId } });
    expect(updated.rosterStatus).toBe('UNAVAILABLE');
    const audit = await prisma.commissionerAuditLog.findFirst({
      where: { entityType: 'PLAYER', entityId: playerId, action: 'PLAYER_ROSTER_STATUS_CHANGED' },
    });
    expect(audit).toBeTruthy();
  });

  it('ordinary team detail does not expose audit arrays', async () => {
    const res = await app.inject({ method: 'GET', url: `/api/teams/${frostTeamId}` });
    expect(res.json().item.audit).toBeUndefined();
    expect(res.json().item.audits).toBeUndefined();
  });

  it('rejects invalid coach rating', async () => {
    const coach = await prisma.coach.findUniqueOrThrow({ where: { id: assignedCoachId } });
    const res = await app.inject({
      method: 'PATCH',
      url: `/api/commissioner/coaches/${assignedCoachId}`,
      headers,
      payload: {
        expectedUpdatedAt: coach.updatedAt.toISOString(),
        reason: 'bad rating',
        identity: {
          firstName: coach.firstName,
          lastName: coach.lastName,
          nationalityCountryId: coach.nationalityCountryId,
        },
        styles: {
          coachingStyle: coach.coachingStyle,
          tacticalStyle: coach.tacticalStyle,
        },
        ratings: {
          overallCoaching: 99,
          playerDevelopment: coach.playerDevelopment,
          offense: coach.offense,
          defense: coach.defense,
        },
        currentTeamId: coach.currentTeamId,
      },
    });
    expect(res.statusCode).toBe(400);
  });
});
