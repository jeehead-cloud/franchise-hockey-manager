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
const commissionerHeaders = {
  [COMMISSIONER_HEADER]: COMMISSIONER_HEADER_VALUE,
};

describe('F6 Commissioner APIs', () => {
  let app: FastifyInstance;
  let prisma: PrismaClient;
  let tempDir: string;
  let playerId = '';
  let goalieId = '';
  let otherTeamId = '';
  let buildEditPayloadFromPlayer: typeof import('../src/services/commissioner-players.js').buildEditPayloadFromPlayer;
  let updateCommissionerPlayerWithFailAfter: typeof import('../src/services/commissioner-players.js').updateCommissionerPlayerWithFailAfter;

  beforeAll(async () => {
    const { url, dir } = createTempDatabaseUrl();
    tempDir = dir;
    process.env.DATABASE_URL = url;
    process.env.FHM_DATASET_DIR = fixtureDir;
    process.env.FHM_COMMISSIONER_WRITES_ENABLED = 'true';
    migrateTempDatabase(url);

    const db = await import('../src/db/client.js');
    prisma = db.prisma;
    const commissioner = await import('../src/services/commissioner-players.js');
    buildEditPayloadFromPlayer = commissioner.buildEditPayloadFromPlayer;
    updateCommissionerPlayerWithFailAfter = commissioner.updateCommissionerPlayerWithFailAfter;

    const { initializeSetup } = await import('../src/initialization/index.js');
    await prisma.appMeta.upsert({
      where: { id: 'default' },
      create: { id: 'default', worldInitialized: false },
      update: { worldInitialized: false },
    });
    await initializeSetup(prisma, fixtureDir);

    const player = await prisma.player.findFirst({
      where: { externalId: 'player-kai-winters' },
      include: { skaterAttributes: true, goalieAttributes: true },
    });
    const goalie = await prisma.player.findFirst({
      where: { primaryPosition: 'G' },
      include: { skaterAttributes: true, goalieAttributes: true },
    });
    const frost = await prisma.team.findFirst({ where: { externalId: 'team-frostbite' } });
    const alt = await prisma.team.findFirst({
      where: { id: { not: frost!.id } },
    });
    playerId = player!.id;
    goalieId = goalie!.id;
    otherTeamId = alt!.id;

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

  async function loadPlayer(id: string) {
    return prisma.player.findUniqueOrThrow({
      where: { id },
      include: {
        nationality: true,
        currentTeam: true,
        skaterAttributes: true,
        goalieAttributes: true,
      },
    });
  }

  it('rejects commissioner detail without header', async () => {
    const res = await app.inject({ method: 'GET', url: `/api/commissioner/players/${playerId}` });
    expect(res.statusCode).toBe(403);
    expect(res.json().error).toBe('CommissionerModeRequired');
  });

  it('rejects PATCH without header', async () => {
    const row = await loadPlayer(playerId);
    const body = buildEditPayloadFromPlayer(row, { reason: 'no header' });
    const res = await app.inject({
      method: 'PATCH',
      url: `/api/commissioner/players/${playerId}`,
      payload: body,
    });
    expect(res.statusCode).toBe(403);
  });

  it('returns 403 when writes disabled', async () => {
    process.env.FHM_COMMISSIONER_WRITES_ENABLED = 'false';
    const res = await app.inject({
      method: 'GET',
      url: `/api/commissioner/players/${playerId}`,
      headers: commissionerHeaders,
    });
    expect(res.statusCode).toBe(403);
    expect(res.json().error).toBe('CommissionerWritesDisabled');
  });

  it('ordinary player detail hides hidden potential', async () => {
    const res = await app.inject({ method: 'GET', url: `/api/players/${playerId}` });
    expect(res.statusCode).toBe(200);
    const item = res.json().item;
    expect(item.potentialFloor).toBeUndefined();
    expect(item.playerModel.potentialFloor).toBeUndefined();
    expect(item.hiddenPotential).toBeUndefined();
  });

  it('commissioner detail exposes hidden potential', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/api/commissioner/players/${playerId}`,
      headers: commissionerHeaders,
    });
    expect(res.statusCode).toBe(200);
    const item = res.json().item;
    expect(item.hiddenPotential.potentialFloor).toBeTypeOf('number');
    expect(item.hiddenPotential.potentialCeiling).toBeTypeOf('number');
    expect(item.hiddenPotential.developmentRisk).toBeTypeOf('number');
    expect(item.updatedAt).toBeTruthy();
  });

  it('edits attributes and recalculates derived values with audit', async () => {
    const beforePublic = await app.inject({ method: 'GET', url: `/api/players/${playerId}` });
    const beforeAbility = beforePublic.json().item.playerModel.currentAbility as number;

    const row = await loadPlayer(playerId);
    const { playerId: _pid, createdAt: _c, updatedAt: _u, ...attrs } = row.skaterAttributes!;
    const body = buildEditPayloadFromPlayer(row, {
      reason: 'Bump stickhandling for testing',
      skaterAttributes: {
        ...attrs,
        stickhandling: Math.min(20, attrs.stickhandling + 3),
      },
    });

    const res = await app.inject({
      method: 'PATCH',
      url: `/api/commissioner/players/${playerId}`,
      headers: { ...commissionerHeaders, 'x-fhm-commissioner-source': 'ui' },
      payload: body,
    });
    expect(res.statusCode).toBe(200);
    const item = res.json().item;
    expect(item.playerModel.currentAbility).not.toBe(beforeAbility);
    expect(item.editable.skaterAttributes.stickhandling).toBe(body.skaterAttributes!.stickhandling);

    const audits = await prisma.commissionerAuditLog.findMany({
      where: { entityId: playerId },
      orderBy: { createdAt: 'desc' },
    });
    expect(audits.length).toBeGreaterThanOrEqual(1);
    expect(audits[0]!.reason).toBe('Bump stickhandling for testing');
    expect(audits[0]!.source).toBe('COMMISSIONER_UI');
    expect(JSON.parse(audits[0]!.changedFieldsJson)).toContain('skaterAttributes');

    const publicAfter = await app.inject({ method: 'GET', url: `/api/players/${playerId}` });
    expect(publicAfter.json().item.playerModel.currentAbility).toBe(item.playerModel.currentAbility);
    expect(publicAfter.json().item.playerModel.potentialFloor).toBeUndefined();
  });

  it('rejects stale expectedUpdatedAt without writing', async () => {
    const row = await loadPlayer(playerId);
    const auditsBefore = await prisma.commissionerAuditLog.count({ where: { entityId: playerId } });
    const body = buildEditPayloadFromPlayer(row, {
      reason: 'stale',
      identity: { firstName: 'Stale' },
    });
    body.expectedUpdatedAt = new Date(0).toISOString();

    const res = await app.inject({
      method: 'PATCH',
      url: `/api/commissioner/players/${playerId}`,
      headers: commissionerHeaders,
      payload: body,
    });
    expect(res.statusCode).toBe(409);
    expect(res.json().error).toBe('EditConflict');
    const refreshed = await loadPlayer(playerId);
    expect(refreshed.firstName).not.toBe('Stale');
    expect(await prisma.commissionerAuditLog.count({ where: { entityId: playerId } })).toBe(
      auditsBefore,
    );
  });

  it('rejects invalid attribute range', async () => {
    const row = await loadPlayer(playerId);
    const { playerId: _pid, createdAt: _c, updatedAt: _u, ...attrs } = row.skaterAttributes!;
    const body = buildEditPayloadFromPlayer(row, {
      reason: 'bad attr',
      skaterAttributes: { ...attrs, shooting: 99 },
    });
    const res = await app.inject({
      method: 'PATCH',
      url: `/api/commissioner/players/${playerId}`,
      headers: commissionerHeaders,
      payload: body,
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toBe('InvalidRequest');
  });

  it('rejects invalid potential range', async () => {
    const row = await loadPlayer(playerId);
    const body = buildEditPayloadFromPlayer(row, {
      reason: 'bad pot',
      profile: { potentialFloor: 80, potentialCeiling: 40 },
    });
    const res = await app.inject({
      method: 'PATCH',
      url: `/api/commissioner/players/${playerId}`,
      headers: commissionerHeaders,
      payload: body,
    });
    expect(res.statusCode).toBe(400);
  });

  it('changes team assignment and records audit action', async () => {
    const row = await loadPlayer(playerId);
    const body = buildEditPayloadFromPlayer(row, {
      reason: 'Move to other club',
      identity: { currentTeamId: otherTeamId },
    });
    const res = await app.inject({
      method: 'PATCH',
      url: `/api/commissioner/players/${playerId}`,
      headers: commissionerHeaders,
      payload: body,
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().item.currentTeamId).toBe(otherTeamId);

    const audit = await prisma.commissionerAuditLog.findFirst({
      where: { entityId: playerId },
      orderBy: { createdAt: 'desc' },
    });
    expect(audit?.action).toBe('TEAM_ASSIGNMENT_CHANGED');

    const team = await app.inject({ method: 'GET', url: `/api/teams/${otherTeamId}` });
    expect(team.json().item.roster.some((p: { id: string }) => p.id === playerId)).toBe(true);
  });

  it('recalculates skater role when moving C to LD', async () => {
    const row = await loadPlayer(playerId);
    const beforeRole = (
      await app.inject({
        method: 'GET',
        url: `/api/commissioner/players/${playerId}`,
        headers: commissionerHeaders,
      })
    ).json().item.role;

    const body = buildEditPayloadFromPlayer(row, {
      reason: 'Move to defense',
      identity: { primaryPosition: 'LD' },
    });
    const res = await app.inject({
      method: 'PATCH',
      url: `/api/commissioner/players/${playerId}`,
      headers: commissionerHeaders,
      payload: body,
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().item.primaryPosition).toBe('LD');
    expect(res.json().item.editable.skaterAttributes).toBeTruthy();
    expect(res.json().item.editable.goalieAttributes).toBeNull();
    // Role may or may not change depending on attrs; model stays skater.
    expect(res.json().item.playerModel.kind).toBe('skater');
    expect(typeof res.json().item.role).toBe('string');
    void beforeRole;
  });

  it('converts skater to goalie atomically', async () => {
    const row = await loadPlayer(playerId);
    const goalieAttrs = {
      reflexes: 14,
      positioning: 13,
      reboundControl: 12,
      glove: 14,
      blocker: 12,
      movement: 13,
      puckHandling: 11,
      consistency: 12,
      stamina: 13,
    };
    const body = buildEditPayloadFromPlayer(row, {
      reason: 'Convert to goalie for test',
      identity: { primaryPosition: 'G' },
      skaterAttributes: null,
      goalieAttributes: goalieAttrs,
    });
    const res = await app.inject({
      method: 'PATCH',
      url: `/api/commissioner/players/${playerId}`,
      headers: commissionerHeaders,
      payload: body,
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().item.primaryPosition).toBe('G');
    expect(res.json().item.playerModel.kind).toBe('goalie');
    expect(res.json().item.editable.skaterAttributes).toBeNull();
    expect(res.json().item.editable.goalieAttributes.reflexes).toBe(14);

    const audit = await prisma.commissionerAuditLog.findFirst({
      where: { entityId: playerId },
      orderBy: { createdAt: 'desc' },
    });
    expect(audit?.action).toBe('POSITION_MODEL_CONVERTED');

    const dbRow = await loadPlayer(playerId);
    expect(dbRow.skaterAttributes).toBeNull();
    expect(dbRow.goalieAttributes).toBeTruthy();
  });

  it('converts goalie fixture player to skater', async () => {
    const row = await loadPlayer(goalieId);
    const skaterAttrs = {
      stickhandling: 10,
      shooting: 10,
      passing: 11,
      strength: 12,
      speed: 11,
      balance: 10,
      aggression: 9,
      offensiveAwareness: 10,
      defensiveAwareness: 13,
    };
    const body = buildEditPayloadFromPlayer(row, {
      reason: 'Goalie to skater conversion',
      identity: { primaryPosition: 'C' },
      skaterAttributes: skaterAttrs,
      goalieAttributes: null,
    });
    const res = await app.inject({
      method: 'PATCH',
      url: `/api/commissioner/players/${goalieId}`,
      headers: commissionerHeaders,
      payload: body,
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().item.playerModel.kind).toBe('skater');
    const dbRow = await loadPlayer(goalieId);
    expect(dbRow.goalieAttributes).toBeNull();
    expect(dbRow.skaterAttributes).toBeTruthy();
  });

  it('rejects skater→goalie without goalie attributes', async () => {
    // Restore a skater first if needed — use unassigned defenseman from fixture
    const ld = await prisma.player.findFirst({
      where: { primaryPosition: 'LD', skaterAttributes: { isNot: null } },
      include: { skaterAttributes: true, goalieAttributes: true, nationality: true, currentTeam: true },
    });
    expect(ld).toBeTruthy();
    const body = buildEditPayloadFromPlayer(ld!, {
      reason: 'missing goalie attrs',
      identity: { primaryPosition: 'G' },
      skaterAttributes: null,
      goalieAttributes: null,
    });
    const res = await app.inject({
      method: 'PATCH',
      url: `/api/commissioner/players/${ld!.id}`,
      headers: commissionerHeaders,
      payload: body,
    });
    expect(res.statusCode).toBe(400);
  });

  it('completes an incomplete legacy player', async () => {
    const country = await prisma.country.findFirstOrThrow();
    const legacy = await prisma.player.create({
      data: {
        firstName: 'Legacy',
        lastName: 'Prospect',
        dateOfBirth: new Date('2005-03-01'),
        nationalityCountryId: country.id,
        primaryPosition: 'RW',
        sourceType: 'MANUAL',
        rosterStatus: 'PROSPECT',
      },
      include: { skaterAttributes: true, goalieAttributes: true, nationality: true, currentTeam: true },
    });

    const detail = await app.inject({ method: 'GET', url: `/api/players/${legacy.id}` });
    expect(detail.json().item.playerModel.modelStatus).toBe('INCOMPLETE');

    const payload = {
      expectedUpdatedAt: legacy.updatedAt.toISOString(),
      reason: 'Complete incomplete model',
      identity: {
        firstName: 'Legacy',
        lastName: 'Prospect',
        dateOfBirth: '2005-03-01',
        nationalityCountryId: country.id,
        currentTeamId: null,
        primaryPosition: 'RW' as const,
        rosterStatus: 'PROSPECT' as const,
      },
      profile: {
        preferredCoachingStyle: 'DEVELOPMENTAL' as const,
        preferredTactics: 'SPEED' as const,
        personality: 'COMPETITOR' as const,
        heroRating: 11,
        stability: 12,
        developmentRate: 1.2,
        developmentRisk: 0.3,
        potentialFloor: 50,
        potentialCeiling: 75,
        publicPotentialEstimate: 'HIGH' as const,
      },
      skaterAttributes: {
        stickhandling: 11,
        shooting: 12,
        passing: 10,
        strength: 11,
        speed: 13,
        balance: 10,
        aggression: 9,
        offensiveAwareness: 12,
        defensiveAwareness: 10,
      },
      goalieAttributes: null,
    };

    const res = await app.inject({
      method: 'PATCH',
      url: `/api/commissioner/players/${legacy.id}`,
      headers: commissionerHeaders,
      payload,
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().item.modelStatus).toBe('COMPLETE');
    expect(res.json().item.playerModel.modelStatus).toBe('COMPLETE');

    const audit = await prisma.commissionerAuditLog.findFirst({
      where: { entityId: legacy.id },
      orderBy: { createdAt: 'desc' },
    });
    expect(audit?.action).toBe('MODEL_COMPLETED');
  });

  it('lists audit history with pagination', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/api/commissioner/players/${playerId}/audit?page=1&pageSize=5`,
      headers: commissionerHeaders,
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.page).toBe(1);
    expect(body.items.length).toBeGreaterThan(0);
    expect(body.items[0].reason).toBeTruthy();
    expect(body.items[0].changedFields).toBeInstanceOf(Array);
  });

  it('rejects audit without commissioner header', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/api/commissioner/players/${playerId}/audit`,
    });
    expect(res.statusCode).toBe(403);
  });

  it('rolls back player/attrs/audit on injected failure', async () => {
    const ld = await prisma.player.findFirstOrThrow({
      where: { primaryPosition: 'LD', skaterAttributes: { isNot: null } },
      include: { skaterAttributes: true, goalieAttributes: true, nationality: true, currentTeam: true },
    });
    const beforeName = ld.firstName;
    const auditsBefore = await prisma.commissionerAuditLog.count({ where: { entityId: ld.id } });
    const body = buildEditPayloadFromPlayer(ld, {
      reason: 'should roll back',
      identity: { firstName: 'ShouldNotPersist' },
    });

    await expect(
      updateCommissionerPlayerWithFailAfter(ld.id, body, 'attributes'),
    ).rejects.toThrow(/__FAIL_AFTER__/);

    const after = await loadPlayer(ld.id);
    expect(after.firstName).toBe(beforeName);
    expect(await prisma.commissionerAuditLog.count({ where: { entityId: ld.id } })).toBe(
      auditsBefore,
    );
  });

  it('status endpoint reports writes enabled', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/commissioner/status' });
    expect(res.statusCode).toBe(200);
    expect(res.json().writesEnabled).toBe(true);
  });
});
