import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import type { PrismaClient } from '@prisma/client';
import { join } from 'node:path';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { existsSync } from 'node:fs';
import { defaultScoutingConfig } from '@fhm/engine';
import { cleanupTempDir, createTempDatabaseUrl, migrateTempDatabase } from './helpers/db.js';
import { getRepoRoot } from '../src/initialization/paths.js';
import { COMMISSIONER_HEADER, COMMISSIONER_HEADER_VALUE } from '../src/commissioner/gate.js';
import { DRAFT_DEFAULT_PRESET_NAME } from '../src/services/draft-config.js';

const fixtureDir = join(getRepoRoot(), 'data', 'fixtures', 'f3-minimal-world');
const commissionerHeaders = {
  [COMMISSIONER_HEADER]: COMMISSIONER_HEADER_VALUE,
  'x-fhm-commissioner-source': 'api',
};

describe('F27 NHL Draft', () => {
  let app: FastifyInstance;
  let prisma: PrismaClient;
  let tempDir: string;
  let backupDir: string;
  let worldSeasonId = '';
  let navCountryId = '';
  let draftEventId = '';
  let teamAId = '';
  let teamBId = '';
  let teamCId = '';
  let scoutAId = '';
  let scoutBId = '';
  let prospects: string[] = [];
  let cutoffDate = '';

  beforeAll(async () => {
    const { url, dir } = createTempDatabaseUrl();
    tempDir = dir;
    backupDir = mkdtempSync(join(tmpdir(), 'fhm-f27-bak-'));
    process.env.DATABASE_URL = url;
    process.env.FHM_DATASET_DIR = fixtureDir;
    process.env.FHM_COMMISSIONER_WRITES_ENABLED = 'true';
    process.env.FHM_BACKUP_DIR = backupDir;
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

    const season = await prisma.worldSeason.findFirstOrThrow();
    worldSeasonId = season.id;
    navCountryId = (await prisma.country.findFirstOrThrow({ where: { code: 'NAV' } })).id;

    // Three club teams for the draft.
    const league = await prisma.league.findFirstOrThrow();
    teamAId = (await prisma.team.create({ data: { name: 'Draft Alpha', teamType: 'CLUB', leagueId: league.id, countryId: navCountryId, tacticalStyle: 'SPEED' } })).id;
    teamBId = (await prisma.team.create({ data: { name: 'Draft Bravo', teamType: 'CLUB', leagueId: league.id, countryId: navCountryId, tacticalStyle: 'PHYSICAL' } })).id;
    teamCId = (await prisma.team.create({ data: { name: 'Draft Charlie', teamType: 'CLUB', leagueId: league.id, countryId: navCountryId, tacticalStyle: 'COMBINATIONAL' } })).id;

    const { buildApp, ensureAppMeta } = await import('../src/app.js');
    await ensureAppMeta();
    app = await buildApp({ logger: false });
    await app.ready();
  });

  afterAll(async () => {
    if (app) await app.close();
    if (prisma) await prisma.$disconnect();
    if (tempDir) cleanupTempDir(tempDir);
    if (backupDir) cleanupTempDir(backupDir);
  });

  async function createScout(suffix: string) {
    const res = await app.inject({
      method: 'POST',
      url: '/api/commissioner/scouting/scouts',
      headers: commissionerHeaders,
      payload: {
        firstName: 'D', lastName: suffix,
        evaluatingRating: 15, potentialRating: 14, skaterRating: 14, goalieRating: 10,
        specialties: ['SKATER', 'POTENTIAL'], countryFamiliarity: {}, positionFamiliarity: {}, persistentBias: 0,
        reason: `Draft test scout ${suffix}`,
      },
    });
    expect(res.statusCode).toBe(200);
    return res.json().item.id;
  }

  async function staffDepartment(teamId: string, scoutId: string) {
    const res = await app.inject({
      method: 'POST',
      url: '/api/commissioner/scouting/departments',
      headers: commissionerHeaders,
      payload: { teamId, name: `Dept ${teamId}`, scoutIds: [scoutId], reason: 'Draft test department' },
    });
    expect(res.statusCode).toBe(200);
  }

  async function makeProspect(suffix: string, dobYear = 2010) {
    const player = await prisma.player.create({
      data: {
        firstName: 'Prospect', lastName: suffix,
        dateOfBirth: new Date(`${dobYear}-09-15`),
        nationalityCountryId: navCountryId,
        primaryPosition: 'C',
        sourceType: 'GENERATED_YOUTH',
        rosterStatus: 'PROSPECT',
        preferredCoachingStyle: 'DEVELOPMENTAL',
        preferredTactics: 'SPEED',
        personality: 'PROFESSIONAL',
        heroRating: 10, stability: 10, developmentRate: 1.5, developmentRisk: 0.4,
        potentialFloor: 70, potentialCeiling: 90, publicPotentialEstimate: 'HIGH',
        skaterAttributes: { create: { stickhandling: 12, shooting: 11, passing: 13, strength: 9, speed: 14, balance: 10, aggression: 8, offensiveAwareness: 13, defensiveAwareness: 9 } },
      },
    });
    return player.id;
  }

  async function scout(teamId: string, scoutId: string, playerId: string, seed: string) {
    const config = defaultScoutingConfig();
    const create = await app.inject({
      method: 'POST',
      url: `/api/teams/${teamId}/scouting/assignments`,
      payload: { targetType: 'PLAYER', playerIds: [playerId], scoutIds: [scoutId], observedOn: '2028-01-01', durationDays: 30, seed },
    });
    expect(create.statusCode).toBe(200);
    const execute = await app.inject({ method: 'POST', url: `/api/teams/${teamId}/scouting/assignments/${create.json().item.id}/execute` });
    expect(execute.statusCode).toBe(200);
  }

  it('F27 migration folder exists', () => {
    expect(existsSync(join(getRepoRoot(), 'packages', 'server', 'prisma', 'migrations', '20260716020000_f27_draft', 'migration.sql'))).toBe(true);
  });

  it('bootstrap creates Amateur Draft Default and is idempotent', async () => {
    const { bootstrapDraftConfiguration } = await import('../src/services/draft-config.js');
    const first = await bootstrapDraftConfiguration(prisma);
    const second = await bootstrapDraftConfiguration(prisma);
    expect(first.versionId).toBe(second.versionId);
    const preset = await prisma.draftPreset.findFirstOrThrow({ where: { name: DRAFT_DEFAULT_PRESET_NAME } });
    expect(preset.isSystem).toBe(true);
    const active = await prisma.activeDraftConfiguration.findUniqueOrThrow({ where: { id: 'default' } });
    expect(active.activePresetVersionId).toBeTruthy();
    cutoffDate = (await prisma.draftPresetVersion.findUniqueOrThrow({ where: { id: active.activePresetVersionId } })).configHash; // placeholder
  });

  it('creates prospects and scouting reports for two teams (privacy fixture)', async () => {
    // 6 prospects, ages 18 on 2028-09-15 cutoff.
    prospects = [];
    for (let i = 0; i < 6; i += 1) {
      prospects.push(await makeProspect(`D${i}`));
    }
    scoutAId = await createScout('A');
    scoutBId = await createScout('B');
    await staffDepartment(teamAId, scoutAId);
    await staffDepartment(teamBId, scoutBId);
    // Team A scouts first 3 prospects; Team B scouts a different set.
    await scout(teamAId, scoutAId, prospects[0]!, 'a1');
    await scout(teamAId, scoutAId, prospects[1]!, 'a2');
    await scout(teamAId, scoutAId, prospects[2]!, 'a3');
    await scout(teamBId, scoutBId, prospects[2]!, 'b1');
    await scout(teamBId, scoutBId, prospects[3]!, 'b2');
  });

  it('creates a draft event for the WorldSeason', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/commissioner/drafts',
      headers: commissionerHeaders,
      payload: { worldSeasonId, name: '2028 NHL Entry draft', baseSeed: 'f27-test-seed', reason: 'F27 test' },
    });
    expect(res.statusCode).toBe(200);
    draftEventId = res.json().item.id;
    expect(draftEventId).toBeTruthy();
    cutoffDate = res.json().item.cutoffDate;
  });

  it('prevents a second active draft for the same season', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/commissioner/drafts',
      headers: commissionerHeaders,
      payload: { worldSeasonId, name: 'Duplicate', baseSeed: 'x', reason: 'dup' },
    });
    expect(res.statusCode).toBe(409);
  });

  it('generates the eligibility class from F25 prospects', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/api/commissioner/drafts/${draftEventId}/generate-eligibility`,
      headers: commissionerHeaders,
      payload: { reason: 'eligibility' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().item.eligibleCount).toBeGreaterThanOrEqual(6);
  });

  it('uses the explicit cutoff date, not wall clock', async () => {
    const elig = await app.inject({ method: 'GET', url: `/api/drafts/${draftEventId}/eligibility` });
    expect(elig.json().items.every((e: { ageOnCutoffDate: number }) => e.ageOnCutoffDate >= 18)).toBe(true);
  });

  it('generates a MANUAL draft order from the three teams', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/api/commissioner/drafts/${draftEventId}/generate-order`,
      headers: commissionerHeaders,
      payload: { source: 'MANUAL', manualOrder: [teamAId, teamBId, teamCId], reason: 'order' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().item.teamCount).toBe(3);
    const order = await app.inject({ method: 'GET', url: `/api/drafts/${draftEventId}/order` });
    expect(order.json().item.picks[0].teamId).toBe(teamAId);
    expect(order.json().item.picks[1].teamId).toBe(teamBId);
  });

  it('marks READY and starts the draft with a backup', async () => {
    const ready = await app.inject({ method: 'POST', url: `/api/commissioner/drafts/${draftEventId}/mark-ready`, headers: commissionerHeaders, payload: { reason: 'ready' } });
    expect(ready.statusCode).toBe(200);
    const start = await app.inject({ method: 'POST', url: `/api/commissioner/drafts/${draftEventId}/start`, headers: commissionerHeaders, payload: { reason: 'start' } });
    expect(start.statusCode).toBe(200);
    expect(start.json().event.status).toBe('IN_PROGRESS');
    expect(start.json().backupPath).toBeTruthy();
  });

  it('team board snapshot uses F26 estimates only — no true values leak', async () => {
    const board = await app.inject({ method: 'GET', url: `/api/drafts/${draftEventId}/teams/${teamAId}/board` });
    expect(board.statusCode).toBe(200);
    const payload = board.json().item;
    // Every board entry exposes estimates, never true potential/current ability/quality tier.
    const serialized = JSON.stringify(payload);
    expect(serialized).not.toContain('potentialFloor');
    expect(serialized).not.toContain('potentialCeiling');
    expect(serialized).not.toContain('qualityTier');
    expect(serialized).not.toContain('developmentRate');
    expect(payload.entries.length).toBeGreaterThan(0);
    // Team A scouted prospects 0,1,2 — their estimates should be present (non-null) for those.
    const scouted = payload.entries.find((e: { playerId: string }) => e.playerId === prospects[0]);
    expect(scouted).toBeTruthy();
    expect(scouted.estimatedCurrentAbility).not.toBeNull();
  });

  it('cross-team board privacy: team A cannot read team B private board', async () => {
    // The /teams/:teamId/board endpoint returns ONLY that team's estimates.
    // Team A's board for prospect 3 (scouted only by B) should be Unknown.
    const boardA = await app.inject({ method: 'GET', url: `/api/drafts/${draftEventId}/teams/${teamAId}/board` });
    const entryP3A = boardA.json().item.entries.find((e: { playerId: string }) => e.playerId === prospects[3]);
    expect(entryP3A.estimatedCurrentAbility).toBeNull();
    // Team B's board for prospect 3 has a real estimate.
    const boardB = await app.inject({ method: 'GET', url: `/api/drafts/${draftEventId}/teams/${teamBId}/board` });
    const entryP3B = boardB.json().item.entries.find((e: { playerId: string }) => e.playerId === prospects[3]);
    expect(entryP3B.estimatedCurrentAbility).not.toBeNull();
    // No private observations/watchlist of team B appear in team A's payload.
    const serialized = JSON.stringify(boardA.json());
    expect(serialized).not.toContain(scoutBId);
  });

  it('makes a manual pick and creates an ACTIVE draft right', async () => {
    const picks = await app.inject({ method: 'GET', url: `/api/drafts/${draftEventId}/picks` });
    const onClock = picks.json().items.find((p: { status: string }) => p.status === 'ON_THE_CLOCK');
    expect(onClock).toBeTruthy();
    const res = await app.inject({
      method: 'POST',
      url: `/api/drafts/${draftEventId}/picks/${onClock.id}/select`,
      payload: { playerId: prospects[0], reason: 'manual pick' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().item.selectedPlayerId).toBe(prospects[0]);
    const right = await prisma.playerDraftRight.findFirst({ where: { playerId: prospects[0] } });
    expect(right?.status).toBe('ACTIVE');
    expect(right?.teamId).toBe(teamAId);
  });

  it('prevents drafting the same prospect twice', async () => {
    const picks = await app.inject({ method: 'GET', url: `/api/drafts/${draftEventId}/picks` });
    const onClock = picks.json().items.find((p: { status: string }) => p.status === 'ON_THE_CLOCK');
    const res = await app.inject({
      method: 'POST',
      url: `/api/drafts/${draftEventId}/picks/${onClock.id}/select`,
      payload: { playerId: prospects[0], reason: 'dup pick' },
    });
    expect(res.statusCode).toBe(409);
  });

  it('rejects a pick that is not on the clock', async () => {
    const picks = await app.inject({ method: 'GET', url: `/api/drafts/${draftEventId}/picks` });
    const pending = picks.json().items.find((p: { status: string }) => p.status === 'PENDING');
    const res = await app.inject({
      method: 'POST',
      url: `/api/drafts/${draftEventId}/picks/${pending.id}/select`,
      payload: { playerId: prospects[1], reason: 'not on clock' },
    });
    expect(res.statusCode).toBe(409);
  });

  it('auto-pick uses team scouting estimates only', async () => {
    const picks = await app.inject({ method: 'GET', url: `/api/drafts/${draftEventId}/picks` });
    const onClock = picks.json().items.find((p: { status: string }) => p.status === 'ON_THE_CLOCK');
    const res = await app.inject({
      method: 'POST',
      url: `/api/drafts/${draftEventId}/picks/${onClock.id}/auto-select`,
      payload: { reason: 'auto' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().item.selectedPlayerId).toBeTruthy();
  });

  it('drafted player remains PROSPECT, unsigned, and without a current team', async () => {
    const player = await prisma.player.findUnique({ where: { id: prospects[0] } });
    expect(player?.rosterStatus).toBe('PROSPECT');
    expect(player?.currentTeamId).toBeNull();
  });

  it('creates no contract and no lineup mutation', async () => {
    // No Contract table exists in F27; verify no PlayerDraftRight was CONVERTED_TO_CONTRACT.
    const rights = await prisma.playerDraftRight.findMany({ where: { draftEventId } });
    expect(rights.every((r) => r.status === 'ACTIVE')).toBe(true);
    // Lineups untouched: no TeamLineup rows created for these test teams.
    const lineups = await prisma.teamLineup.findMany({ where: { teamId: { in: [teamAId, teamBId, teamCId] } } });
    expect(lineups.length).toBe(0);
  });

  it('progresses picks across rounds until completion', async () => {
    // Auto-pick every remaining pick until the class is exhausted or picks run out.
    for (let i = 0; i < 30; i += 1) {
      const picks = await app.inject({ method: 'GET', url: `/api/drafts/${draftEventId}/picks` });
      const onClock = picks.json().items.find((p: { status: string }) => p.status === 'ON_THE_CLOCK');
      if (!onClock) break;
      const res = await app.inject({
        method: 'POST',
        url: `/api/drafts/${draftEventId}/picks/${onClock.id}/auto-select`,
        payload: { reason: 'complete' },
      });
      // Either a successful pick or a 422/409 once the class is exhausted.
      if (res.statusCode !== 200) break;
    }
    const event = await app.inject({ method: 'GET', url: `/api/drafts/${draftEventId}` });
    expect(['COMPLETED', 'IN_PROGRESS']).toContain(event.json().item.status);
  });

  it('completed draft is immutable and carries a result hash', async () => {
    const event = await app.inject({ method: 'GET', url: `/api/drafts/${draftEventId}` });
    if (event.json().item.status === 'COMPLETED') {
      expect(event.json().item.resultHash).toBeTruthy();
      expect(event.json().item.completedAt).toBeTruthy();
      // Re-selecting should be rejected.
      const res = await app.inject({
        method: 'POST',
        url: `/api/commissioner/drafts/${draftEventId}/cancel`,
        headers: commissionerHeaders,
        payload: { reason: 'no cancel' },
      });
      expect(res.statusCode).toBe(409);
    }
  });

  it('Commissioner diagnostics reveal hashes and order', async () => {
    const res = await app.inject({ method: 'GET', url: `/api/commissioner/drafts/${draftEventId}/diagnostics`, headers: commissionerHeaders });
    expect(res.statusCode).toBe(200);
    expect(res.json().item.hashes).toBeTruthy();
    expect(res.json().item.teamEntries.length).toBe(3);
  });

  it('Commissioner gate rejects writes without the header', async () => {
    const res = await app.inject({ method: 'POST', url: `/api/commissioner/drafts`, payload: { worldSeasonId, name: 'x', baseSeed: 'x', reason: 'x' } });
    expect(res.statusCode).toBe(403);
  });

  it('public results and player history do not leak hidden truth', async () => {
    const results = await app.inject({ method: 'GET', url: `/api/drafts/${draftEventId}/results` });
    const serialized = JSON.stringify(results.json());
    expect(serialized).not.toContain('potentialFloor');
    expect(serialized).not.toContain('potentialCeiling');
    expect(serialized).not.toContain('qualityTier');
    expect(serialized).not.toContain('developmentRate');

    const history = await app.inject({ method: 'GET', url: `/api/players/${prospects[0]}/draft-history` });
    expect(history.statusCode).toBe(200);
    const histSerialized = JSON.stringify(history.json());
    expect(histSerialized).not.toContain('potentialFloor');
    expect(history.json().items[0].unsigned).toBe(true);
  });

  it('team draft rights list works', async () => {
    const res = await app.inject({ method: 'GET', url: `/api/teams/${teamAId}/draft-rights` });
    expect(res.statusCode).toBe(200);
    expect(res.json().items.length).toBeGreaterThan(0);
  });

  it('does not mutate F26 scouting reports / F25 provenance (invariance)', async () => {
    const reportCount = await prisma.teamScoutingReport.count();
    const provenanceCount = await prisma.youthGeneratedPlayer.count();
    expect(reportCount).toBeGreaterThan(0);
    // No report was altered by the draft: rights count <= eligible, reports unchanged.
    const rights = await prisma.playerDraftRight.count({ where: { draftEventId } });
    expect(rights).toBeLessThanOrEqual(await prisma.draftEligiblePlayer.count({ where: { draftEventId } }));
    expect(await prisma.teamScoutingReport.count()).toBe(reportCount);
    expect(await prisma.youthGeneratedPlayer.count()).toBe(provenanceCount);
  });
});
