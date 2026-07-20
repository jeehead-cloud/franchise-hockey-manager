import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import type { PrismaClient } from '@prisma/client';
import { join } from 'node:path';
import { cleanupTempDir, createTempDatabaseUrl, migrateTempDatabase } from './helpers/db.js';
import { getRepoRoot } from '../src/initialization/paths.js';
import { COMMISSIONER_HEADER, COMMISSIONER_HEADER_VALUE } from '../src/commissioner/gate.js';

const fixtureDir = join(getRepoRoot(), 'data', 'fixtures', 'f3-minimal-world');
const headers = { [COMMISSIONER_HEADER]: COMMISSIONER_HEADER_VALUE, 'x-fhm-commissioner-source': 'ui' };

/**
 * Regression coverage for the Team Setup panel UI (Findings 2 & 3). The UI
 * depends on the existing `GET/PATCH /api/commissioner/teams/:id/setup`
 * contract. This suite locks the parts of that contract that the new edit
 * panel relies on and that are not already asserted by f7-team-setup.test.ts:
 * the GET setup shape (used to seed the form), replace-existing head-coach
 * replacement, tactics-only update through the setup endpoint, and the stale
 * edit-conflict (409) path that the UI surfaces as "reopen to edit".
 *
 * Reuses existing services/routes only — no new server endpoint.
 */
describe('Team Setup panel contract (Findings 2 & 3 regression)', () => {
  let app: FastifyInstance;
  let prisma: PrismaClient;
  let tempDir = '';
  let frostTeamId = '';
  let cedarTeamId = '';
  let assignedCoachId = '';
  let unassignedCoachId = '';

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
    assignedCoachId = (await prisma.coach.findFirstOrThrow({ where: { externalId: 'coach-rowan-pike' } })).id;
    unassignedCoachId = (await prisma.coach.findFirstOrThrow({ where: { externalId: 'coach-elise-quinn' } })).id;
    const { buildApp } = await import('../src/app.js');
    app = await buildApp({ logger: false });
    await app.ready();
  });

  afterAll(async () => {
    if (app) await app.close();
    if (prisma) await prisma.$disconnect();
    if (tempDir) cleanupTempDir(tempDir);
  });

  it('GET /api/commissioner/teams/:id/setup returns the shape the edit panel seeds from', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/api/commissioner/teams/${frostTeamId}/setup`,
      headers,
    });
    expect(res.statusCode).toBe(200);
    const body = res.json().item;
    expect(body).toHaveProperty('id', frostTeamId);
    expect(body).toHaveProperty('tacticalStyle');
    expect(body).toHaveProperty('updatedAt');
    expect(body).toHaveProperty('coach');
    expect(body).toHaveProperty('readiness');
    expect(body.readiness).toHaveProperty('status');
  });

  it('rejects the setup write without the Commissioner header (403)', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: `/api/commissioner/teams/${frostTeamId}/setup`,
      headers: {},
      payload: { expectedUpdatedAt: '1970-01-01T00:00:00.000Z', reason: 'x', headCoachId: null, tacticalStyle: 'SYSTEM' },
    });
    expect(res.statusCode).toBe(403);
  });

  it('replaces the current head coach when replaceExisting is set', async () => {
    // cedar currently has the assigned coach (rowan-pike) — confirm baseline.
    const before = await app.inject({
      method: 'GET',
      url: `/api/commissioner/teams/${cedarTeamId}/setup`,
      headers,
    });
    expect(before.statusCode).toBe(200);
    const beforeCoachId = (before.json().item.coach?.id) ?? null;

    const res = await app.inject({
      method: 'PATCH',
      url: `/api/commissioner/teams/${cedarTeamId}/setup`,
      headers,
      payload: {
        expectedUpdatedAt: before.json().item.updatedAt,
        reason: 'UI: replace head coach',
        headCoachId: unassignedCoachId,
        tacticalStyle: before.json().item.tacticalStyle,
        replaceExisting: true,
      },
    });
    expect(res.statusCode).toBe(200);
    const after = res.json().item;
    expect(after.coach?.id).toBe(unassignedCoachId);
    // The previous coach is no longer the head coach of this team.
    expect(after.coach?.id).not.toBe(beforeCoachId);

    // Audit row recorded as a head-coach assignment.
    const audit = await prisma.commissionerAuditLog.findFirst({
      where: { entityType: 'TEAM', entityId: cedarTeamId, action: 'HEAD_COACH_ASSIGNED' },
    });
    expect(audit).toBeTruthy();

    // The displaced prior coach's currentTeamId was cleared.
    if (beforeCoachId) {
      const displaced = await prisma.coach.findUniqueOrThrow({ where: { id: beforeCoachId } });
      expect(displaced.currentTeamId).toBeNull();
    }
  });

  it('rejects replacing the head coach without replaceExisting (409 HeadCoachAlreadyAssigned)', async () => {
    const setup = await app.inject({
      method: 'GET',
      url: `/api/commissioner/teams/${cedarTeamId}/setup`,
      headers,
    });
    const res = await app.inject({
      method: 'PATCH',
      url: `/api/commissioner/teams/${cedarTeamId}/setup`,
      headers,
      payload: {
        expectedUpdatedAt: setup.json().item.updatedAt,
        reason: 'should fail',
        headCoachId: assignedCoachId,
        tacticalStyle: setup.json().item.tacticalStyle,
        // replaceExisting intentionally omitted
      },
    });
    expect(res.statusCode).toBe(409);
    expect(res.json().error).toMatch(/HeadCoachAlreadyAssigned/);
  });

  it('updates tactics only through the setup endpoint and audits TEAM_TACTICS_UPDATED', async () => {
    const setup = await app.inject({
      method: 'GET',
      url: `/api/commissioner/teams/${frostTeamId}/setup`,
      headers,
    });
    const currentCoachId = setup.json().item.coach?.id ?? null;
    const res = await app.inject({
      method: 'PATCH',
      url: `/api/commissioner/teams/${frostTeamId}/setup`,
      headers,
      payload: {
        expectedUpdatedAt: setup.json().item.updatedAt,
        reason: 'UI: tactics change',
        headCoachId: currentCoachId,
        tacticalStyle: 'FORECHECKING',
      },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().item.tacticalStyle).toBe('FORECHECKING');
    const audit = await prisma.commissionerAuditLog.findFirst({
      where: { entityType: 'TEAM', entityId: frostTeamId, action: 'TEAM_TACTICS_UPDATED' },
    });
    expect(audit).toBeTruthy();
  });

  it('rejects a stale setup update with 409 EditConflict (UI surfaces reopen hint)', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: `/api/commissioner/teams/${frostTeamId}/setup`,
      headers,
      payload: {
        expectedUpdatedAt: '1970-01-01T00:00:00.000Z', // intentionally stale
        reason: 'stale',
        headCoachId: null,
        tacticalStyle: 'SYSTEM',
      },
    });
    expect(res.statusCode).toBe(409);
    expect(res.json().error).toMatch(/EditConflict/);
  });

  it('rejects an invalid tacticalStyle with 400 (strict schema preserved)', async () => {
    const setup = await app.inject({
      method: 'GET',
      url: `/api/commissioner/teams/${frostTeamId}/setup`,
      headers,
    });
    const res = await app.inject({
      method: 'PATCH',
      url: `/api/commissioner/teams/${frostTeamId}/setup`,
      headers,
      payload: {
        expectedUpdatedAt: setup.json().item.updatedAt,
        reason: 'bad tactics',
        headCoachId: null,
        tacticalStyle: 'NOT_A_REAL_STYLE',
      },
    });
    expect(res.statusCode).toBe(400);
  });

  it('normal mode (no header) cannot read commissioner setup detail', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/api/commissioner/teams/${frostTeamId}/setup`,
      headers: {},
    });
    expect(res.statusCode).toBe(403);
  });
});
