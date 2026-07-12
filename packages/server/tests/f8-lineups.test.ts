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

describe('F8 lineups and secondary positions', () => {
  let app: FastifyInstance;
  let prisma: PrismaClient;
  let tempDir: string;
  let frostId = '';
  let cedarId = '';

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

    frostId = (await prisma.team.findFirstOrThrow({ where: { externalId: 'team-frostbite' } })).id;
    cedarId = (await prisma.team.findFirstOrThrow({ where: { externalId: 'team-cedar' } })).id;

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

  it('imports schemaVersion 4 with secondary positions and expanded frostbite roster', async () => {
    const frostPlayers = await prisma.player.count({ where: { currentTeamId: frostId } });
    expect(frostPlayers).toBeGreaterThanOrEqual(20);
    expect(await prisma.playerSecondaryPosition.count()).toBeGreaterThan(0);
  });

  it('returns absent lineup for team with no lineup row', async () => {
    const res = await app.inject({ method: 'GET', url: `/api/teams/${cedarId}/lineup` });
    expect(res.statusCode).toBe(200);
    expect(res.json().item.exists).toBe(false);
    expect(res.json().item.presence).toBe('ABSENT');
  });

  it('rejects lineup write without commissioner header', async () => {
    const res = await app.inject({
      method: 'PUT',
      url: `/api/commissioner/teams/${frostId}/lineup`,
      payload: { expectedUpdatedAt: null, reason: 'x', assignments: [] },
    });
    expect(res.statusCode).toBe(403);
  });

  it('saves a partial lineup and returns INCOMPLETE', async () => {
    const players = await prisma.player.findMany({
      where: { currentTeamId: frostId, primaryPosition: 'C', rosterStatus: 'ACTIVE' },
      take: 1,
    });
    const res = await app.inject({
      method: 'PUT',
      url: `/api/commissioner/teams/${frostId}/lineup`,
      headers,
      payload: {
        expectedUpdatedAt: null,
        reason: 'Partial opening night',
        assignments: [{ slot: 'F1_C', playerId: players[0]!.id }],
      },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().validation.status).toBe('INCOMPLETE');
    expect(res.json().item.presence).toBe('INCOMPLETE');
  });

  it('rejects duplicate player assignment', async () => {
    const lineup = await app.inject({
      method: 'GET',
      url: `/api/commissioner/teams/${frostId}/lineup`,
      headers,
    });
    const expectedUpdatedAt = lineup.json().item.updatedAt;
    const playerId = lineup.json().item.assignments[0].playerId;
    const res = await app.inject({
      method: 'PUT',
      url: `/api/commissioner/teams/${frostId}/lineup`,
      headers,
      payload: {
        expectedUpdatedAt,
        reason: 'dup',
        assignments: [
          { slot: 'F1_C', playerId },
          { slot: 'F2_C', playerId },
        ],
      },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toBe('InvalidLineup');
  });

  it('REPLACE auto-fill completes 20 slots on frostbite', async () => {
    const lineup = await app.inject({
      method: 'GET',
      url: `/api/commissioner/teams/${frostId}/lineup`,
      headers,
    });
    const res = await app.inject({
      method: 'POST',
      url: `/api/commissioner/teams/${frostId}/lineup/auto-fill`,
      headers,
      payload: {
        expectedUpdatedAt: lineup.json().item.updatedAt,
        mode: 'REPLACE',
        reason: 'Generate opening lineup',
      },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().validation.status).toBe('VALID');
    expect(res.json().item.assignments).toHaveLength(20);
    expect(res.json().auto.unfilledSlots).toHaveLength(0);
  });

  it('FILL_EMPTY preserves existing F1_C assignment', async () => {
    const lineup = await app.inject({
      method: 'GET',
      url: `/api/commissioner/teams/${frostId}/lineup`,
      headers,
    });
    const f1c = lineup.json().item.assignments.find((a: { slot: string }) => a.slot === 'F1_C');
    const clear = await app.inject({
      method: 'PUT',
      url: `/api/commissioner/teams/${frostId}/lineup`,
      headers,
      payload: {
        expectedUpdatedAt: lineup.json().item.updatedAt,
        reason: 'Keep only F1_C',
        assignments: [{ slot: 'F1_C', playerId: f1c.playerId }],
      },
    });
    expect(clear.statusCode).toBe(200);
    const fill = await app.inject({
      method: 'POST',
      url: `/api/commissioner/teams/${frostId}/lineup/auto-fill`,
      headers,
      payload: {
        expectedUpdatedAt: clear.json().item.updatedAt,
        mode: 'FILL_EMPTY',
        reason: 'Fill remaining',
      },
    });
    expect(fill.statusCode).toBe(200);
    const kept = fill.json().item.assignments.find((a: { slot: string }) => a.slot === 'F1_C');
    expect(kept.playerId).toBe(f1c.playerId);
    expect(fill.json().item.assignments.length).toBe(20);
  });

  it('returns 409 on stale expectedUpdatedAt', async () => {
    const res = await app.inject({
      method: 'PUT',
      url: `/api/commissioner/teams/${frostId}/lineup`,
      headers,
      payload: {
        expectedUpdatedAt: '2000-01-01T00:00:00.000Z',
        reason: 'stale',
        assignments: [],
      },
    });
    expect(res.statusCode).toBe(409);
  });

  it('invalidates lineup when assigned player becomes UNAVAILABLE without deleting assignment', async () => {
    const lineup = await app.inject({
      method: 'GET',
      url: `/api/commissioner/teams/${frostId}/lineup`,
      headers,
    });
    const assignment = lineup.json().item.assignments[0];
    const player = await prisma.player.findUniqueOrThrow({ where: { id: assignment.playerId } });
    const statusRes = await app.inject({
      method: 'PATCH',
      url: `/api/commissioner/teams/${frostId}/roster-status`,
      headers,
      payload: {
        playerId: player.id,
        rosterStatus: 'UNAVAILABLE',
        expectedUpdatedAt: player.updatedAt.toISOString(),
        reason: 'Injury — keep assignment for audit',
      },
    });
    expect(statusRes.statusCode).toBe(200);
    const after = await app.inject({ method: 'GET', url: `/api/teams/${frostId}/lineup` });
    expect(after.json().item.assignments.some((a: { playerId: string }) => a.playerId === player.id)).toBe(
      true,
    );
    expect(after.json().item.validation.status).toBe('INVALID');
    expect(after.json().item.presence).toBe('INVALID');
  });

  it('secondary position edit on commissioner player', async () => {
    const skater = await prisma.player.findFirstOrThrow({
      where: { currentTeamId: frostId, primaryPosition: 'LW', rosterStatus: { not: 'UNAVAILABLE' } },
      include: {
        skaterAttributes: true,
        goalieAttributes: true,
        secondaryPositions: true,
        nationality: true,
        currentTeam: true,
      },
    });
    const { buildEditPayloadFromPlayer } = await import('../src/services/commissioner-players.js');
    const payload = buildEditPayloadFromPlayer(skater as never, {
      identity: { secondaryPositions: ['C', 'RW'] },
      reason: 'Add secondary positions',
    });
    const res = await app.inject({
      method: 'PATCH',
      url: `/api/commissioner/players/${skater.id}`,
      headers,
      payload,
    });
    expect(res.statusCode).toBe(200);
    const secs = await prisma.playerSecondaryPosition.findMany({ where: { playerId: skater.id } });
    expect(secs.map((s) => s.position).sort()).toEqual(['C', 'RW']);
  });

  it('cedar thin roster auto-fill is partial', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/api/commissioner/teams/${cedarId}/lineup/auto-fill`,
      headers,
      payload: { expectedUpdatedAt: null, mode: 'REPLACE', reason: 'Thin roster test' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().item.assignments.length).toBeLessThan(20);
    expect(res.json().auto.unfilledSlots.length).toBeGreaterThan(0);
  });

  it('ordinary lineup endpoint excludes audit arrays', async () => {
    const res = await app.inject({ method: 'GET', url: `/api/teams/${frostId}/lineup` });
    expect(res.json().item.audit).toBeUndefined();
    expect(res.json().item.audits).toBeUndefined();
  });

  it('lineup audit history is available', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/api/commissioner/teams/${frostId}/lineup/audit`,
      headers,
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().items.length).toBeGreaterThan(0);
  });
});
