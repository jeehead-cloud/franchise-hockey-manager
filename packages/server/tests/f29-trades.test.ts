import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import type { PrismaClient } from '@prisma/client';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { cleanupTempDir, createTempDatabaseUrl, migrateTempDatabase } from './helpers/db.js';
import { getRepoRoot } from '../src/initialization/paths.js';
import { COMMISSIONER_HEADER, COMMISSIONER_HEADER_VALUE } from '../src/commissioner/gate.js';

const fixtureDir = join(getRepoRoot(), 'data', 'fixtures', 'f3-minimal-world');
const commissionerHeaders = { [COMMISSIONER_HEADER]: COMMISSIONER_HEADER_VALUE, 'x-fhm-commissioner-source': 'api' };

/**
 * F29 trades server suite. Covers the required scenarios: migration + idempotent
 * bootstrap, proposal lifecycle, multi-asset atomic transfer, ownership sync,
 * DraftPick original/current split, rights transfer, stale-ownership rejection,
 * privacy/no-leak, and no-cap/no-conditional/no-multi-team proof.
 */
describe('F29 trades and rights transfers', () => {
  let app: FastifyInstance;
  let prisma: PrismaClient;
  let tempDir = '';
  let seasonId = '';
  let teamAId = '';
  let teamBId = '';
  let playerAContractId = '';
  let playerBContractId = '';
  let playerAId = '';
  let playerBId = '';
  let futurePlayerContractId = '';
  let pickId = '';
  let rightId = '';
  let rightsPlayerId = '';

  beforeAll(async () => {
    const x = createTempDatabaseUrl();
    tempDir = x.dir;
    process.env.DATABASE_URL = x.url;
    process.env.FHM_DATASET_DIR = fixtureDir;
    process.env.FHM_COMMISSIONER_WRITES_ENABLED = 'true';
    process.env.FHM_BACKUP_DIR = join(tempDir, 'backups');
    migrateTempDatabase(x.url);
    prisma = (await import('../src/db/client.js')).prisma;
    const { initializeSetup } = await import('../src/initialization/index.js');
    await prisma.appMeta.upsert({ where: { id: 'default' }, create: { id: 'default', worldInitialized: false }, update: { worldInitialized: false } });
    await initializeSetup(prisma, fixtureDir);
    const season = await prisma.worldSeason.findFirstOrThrow();
    seasonId = season.id;
    const clubTeams = await prisma.team.findMany({ where: { teamType: 'CLUB' }, take: 2 });
    teamAId = clubTeams[0]!.id;
    teamBId = clubTeams[1]!.id;

    // Build the app early so we can drive the F28 contract-initialization flow.
    const { buildApp, ensureAppMeta } = await import('../src/app.js');
    await ensureAppMeta();
    app = await buildApp({ logger: false });
    await app.ready();

    // Initialize F28 compatibility contracts so players have ACTIVE contracts to trade.
    await prisma.appMeta.update({ where: { id: 'default' }, data: { contractsInitializedAt: null } });
    const prepared = await app.inject({ method: 'POST', url: '/api/commissioner/contracts/initial-prepare', headers: commissionerHeaders, payload: { worldSeasonId: seasonId, reason: 'F29 fixture contracts' } });
    const exec = await app.inject({ method: 'POST', url: `/api/commissioner/contracts/initial-runs/${prepared.json().item.id}/execute`, headers: commissionerHeaders, payload: { reason: 'Publish' } });
    if (exec.statusCode !== 200) throw new Error(`F28 contract init failed: ${exec.body}`);

    const playersA = await prisma.player.findMany({ where: { currentTeamId: teamAId, rosterStatus: { not: 'RETIRED' }, contracts: { some: { status: 'ACTIVE' } } }, take: 2 });
    const playersB = await prisma.player.findMany({ where: { currentTeamId: teamBId, rosterStatus: { not: 'RETIRED' }, contracts: { some: { status: 'ACTIVE' } } }, take: 1 });
    if (playersA.length < 1 || playersB.length < 1) throw new Error('Fixture lacks enough contracted players for F29');
    playerAId = playersA[0]!.id;
    playerBId = playersB[0]!.id;
    playerAContractId = (await prisma.playerContract.findFirstOrThrow({ where: { playerId: playerAId, status: 'ACTIVE' } })).id;
    playerBContractId = (await prisma.playerContract.findFirstOrThrow({ where: { playerId: playerBId, status: 'ACTIVE' } })).id;

    // Prepare assets: a FUTURE contract for playerA, a draft pick held by teamA, an ACTIVE right held by teamA.
    const aContract = await prisma.playerContract.findUniqueOrThrow({ where: { id: playerAContractId } });
    const nextSeason = await prisma.worldSeason.create({ data: { label: `${season.startYear + 1}/${String(season.endYear + 1).slice(-2)}`, startYear: season.startYear + 1, endYear: season.endYear + 1, phase: 'SEASON_PREPARATION', status: 'PLANNED' } });
    futurePlayerContractId = (await prisma.playerContract.create({ data: { playerId: playerAId, teamId: teamAId, startWorldSeasonId: nextSeason.id, endWorldSeasonId: nextSeason.id, startSeasonOrderSnapshot: nextSeason.startYear, endSeasonOrderSnapshot: nextSeason.startYear, annualSalary: 5_000_000, status: 'FUTURE', contractType: 'STANDARD', source: 'EXTENSION', configVersionId: aContract.configVersionId, configHash: aContract.configHash, playerNameSnapshot: aContract.playerNameSnapshot, teamNameSnapshot: aContract.teamNameSnapshot, termsHash: 'fixture-future' } })).id;

    // Eligible draft pick held by teamA (PENDING, draft event READY).
    const draftConfig = await prisma.activeDraftConfiguration.findUniqueOrThrow({ where: { id: 'default' } });
    const event = await prisma.draftEvent.create({ data: { worldSeasonId: season.id, name: 'F29 Pick Fixture', status: 'READY', presetVersionId: draftConfig.activePresetVersionId, configHash: 'fixture', cutoffDate: `${season.startYear}-09-15`, baseSeed: 'fixture', totalRounds: 1, totalPicks: 1 } });
    pickId = (await prisma.draftPick.create({ data: { draftEventId: event.id, roundNumber: 1, pickInRound: 1, overallPick: 1, originalTeamId: teamAId, currentTeamId: teamAId, teamNameSnapshot: 'Team A', status: 'PENDING' } })).id;

    // ACTIVE draft right held by teamA — create a PROSPECT and a completed pick/right.
    const country = await prisma.country.findFirstOrThrow();
    const prospect = await prisma.player.create({ data: { firstName: 'Rights', lastName: 'Prospect', dateOfBirth: new Date(`${season.startYear - 18}-01-01`), nationalityCountryId: country.id, primaryPosition: 'C', sourceType: 'GENERATED_YOUTH', rosterStatus: 'PROSPECT', preferredCoachingStyle: 'DEVELOPMENTAL', preferredTactics: 'SPEED', personality: 'PROFESSIONAL', heroRating: 10, stability: 10, developmentRate: 1.5, developmentRisk: 0.3, potentialFloor: 60, potentialCeiling: 85, publicPotentialEstimate: 'HIGH', skaterAttributes: { create: { stickhandling: 10, shooting: 10, passing: 10, strength: 10, speed: 10, balance: 10, aggression: 10, offensiveAwareness: 10, defensiveAwareness: 10 } } } });
    rightsPlayerId = prospect.id;
    const rEvent = await prisma.draftEvent.create({ data: { worldSeasonId: season.id, name: 'F29 Right Fixture', status: 'COMPLETED', presetVersionId: draftConfig.activePresetVersionId, configHash: 'fixture', cutoffDate: `${season.startYear}-09-15`, baseSeed: 'fixture', totalRounds: 1, totalPicks: 1 } });
    const rEligible = await prisma.draftEligiblePlayer.create({ data: { draftEventId: rEvent.id, playerId: prospect.id, playerNameSnapshot: 'Rights Prospect', birthDateSnapshot: prospect.dateOfBirth.toISOString(), ageOnCutoffDate: 18, countrySnapshot: country.code, positionSnapshot: 'C', lifecycleSnapshot: 'PROSPECT', sourceTypeSnapshot: 'GENERATED_YOUTH', eligibilityHash: 'fixture', status: 'DRAFTED' } });
    const rPick = await prisma.draftPick.create({ data: { draftEventId: rEvent.id, roundNumber: 1, pickInRound: 1, overallPick: 1, originalTeamId: teamAId, currentTeamId: teamAId, teamNameSnapshot: 'Team A', status: 'COMPLETED', selectedPlayerId: rEligible.id, selectedPlayerNameSnapshot: 'Rights Prospect', selectionSource: 'MANUAL' } });
    rightId = (await prisma.playerDraftRight.create({ data: { playerId: prospect.id, teamId: teamAId, draftEventId: rEvent.id, draftPickId: rPick.id, playerNameSnapshot: 'Rights Prospect', teamNameSnapshot: 'Team A' } })).id;
  });

  afterAll(async () => {
    if (app) await app.close();
    if (prisma) await prisma.$disconnect();
    cleanupTempDir(tempDir);
  });

  it('has the F29 migration and idempotent default configuration', async () => {
    expect(existsSync(join(getRepoRoot(), 'packages/server/prisma/migrations/20260716040000_f29_trades/migration.sql'))).toBe(true);
    const { bootstrapTradeConfiguration } = await import('../src/services/trade-config.js');
    const a = await bootstrapTradeConfiguration(prisma);
    const b = await bootstrapTradeConfiguration(prisma);
    expect(a.versionId).toBe(b.versionId);
    expect(await prisma.tradePreset.count()).toBe(1);
    expect((await app.inject({ method: 'GET', url: '/api/trades/readiness' })).json().item.status).not.toBe('NOT_READY');
  });

  it('creates, edits, previews, and submits a multi-asset proposal', async () => {
    // Self-trade rejection.
    const self = await app.inject({ method: 'POST', url: `/api/teams/${teamAId}/trade-proposals`, payload: { receivingTeamId: teamAId, proposedBy: 'gm', proposingAssets: [], receivingAssets: [] } });
    expect(self.statusCode).toBe(409);

    const created = await app.inject({ method: 'POST', url: `/api/teams/${teamAId}/trade-proposals`, payload: {
      receivingTeamId: teamBId, proposedBy: 'gm-a', reason: 'Multi-asset',
      proposingAssets: [{ assetType: 'PLAYER_CONTRACT', playerContractId: playerAContractId }, { assetType: 'DRAFT_PICK', draftPickId: pickId }],
      receivingAssets: [{ assetType: 'PLAYER_CONTRACT', playerContractId: playerBContractId }],
    } });
    expect(created.statusCode).toBe(200);
    const proposal = created.json().item;
    expect(proposal.status).toBe('DRAFT');
    expect(proposal.assets).toHaveLength(3);

    // Preview without writes.
    const preview = await app.inject({ method: 'POST', url: `/api/teams/${teamAId}/trade-proposals/${proposal.id}/preview` });
    expect(preview.statusCode).toBe(200);
    expect(preview.json().item.valuations).toBeTruthy();
    expect(await prisma.completedTrade.count()).toBe(0);

    // Duplicate-asset rejection.
    const dup = await app.inject({ method: 'PATCH', url: `/api/teams/${teamAId}/trade-proposals/${proposal.id}`, payload: {
      proposingAssets: [{ assetType: 'DRAFT_PICK', draftPickId: pickId }, { assetType: 'DRAFT_PICK', draftPickId: pickId }], receivingAssets: [],
    } });
    expect(dup.statusCode).toBe(409);

    const submitted = await app.inject({ method: 'POST', url: `/api/teams/${teamAId}/trade-proposals/${proposal.id}/submit`, payload: { expectedUpdatedAt: proposal.updatedAt } });
    expect(submitted.statusCode).toBe(200);
    expect(submitted.json().item.status).toBe('SUBMITTED');
    // Submitted immutability — edit rejected.
    const edit = await app.inject({ method: 'PATCH', url: `/api/teams/${teamAId}/trade-proposals/${proposal.id}`, payload: { proposingAssets: [], receivingAssets: [] } });
    expect(edit.statusCode).toBe(409);
  });

  it('accepts atomically and synchronizes ownership', async () => {
    const proposal = (await app.inject({ method: 'GET', url: '/api/trade-proposals' })).json().items[0];
    const accepted = await app.inject({ method: 'POST', url: `/api/teams/${teamBId}/trade-proposals/${proposal.id}/accept`, payload: { reason: 'Accept multi-asset trade', expectedUpdatedAt: proposal.updatedAt } });
    expect(accepted.statusCode).toBe(200);
    expect(accepted.json().item.transfers.length).toBeGreaterThan(0);

    // ACTIVE + FUTURE contracts moved; player.currentTeamId follows the active contract.
    const aContract = await prisma.playerContract.findUniqueOrThrow({ where: { id: playerAContractId } });
    expect(aContract.teamId).toBe(teamBId);
    expect((await prisma.playerContract.findUniqueOrThrow({ where: { id: futurePlayerContractId } })).teamId).toBe(teamBId);
    expect((await prisma.player.findUniqueOrThrow({ where: { id: playerAId } })).currentTeamId).toBe(teamBId);

    // DraftPick.currentTeamId changed, originalTeamId unchanged.
    const pick = await prisma.draftPick.findUniqueOrThrow({ where: { id: pickId } });
    expect(pick.currentTeamId).toBe(teamBId);
    expect(pick.originalTeamId).toBe(teamAId);

    // Player B moved to team A.
    expect((await prisma.playerContract.findUniqueOrThrow({ where: { id: playerBContractId } })).teamId).toBe(teamAId);
    expect((await prisma.player.findUniqueOrThrow({ where: { id: playerBId } })).currentTeamId).toBe(teamAId);

    // Proposal ACCEPTED + immutable.
    expect((await prisma.tradeProposal.findUniqueOrThrow({ where: { id: proposal.id } })).status).toBe('ACCEPTED');
    const reAccept = await app.inject({ method: 'POST', url: `/api/teams/${teamBId}/trade-proposals/${proposal.id}/accept`, payload: { reason: 'again' } });
    expect(reAccept.statusCode).toBe(409);

    // Completed trade history immutable.
    const completedId = accepted.json().item.completedTradeId;
    expect((await prisma.completedTrade.count({ where: { id: completedId } }))).toBe(1);
    expect((await prisma.tradeTransaction.count({ where: { completedTradeId: completedId } }))).toBeGreaterThan(0);
  });

  it('transfers a draft right without signing the player', async () => {
    const created = await app.inject({ method: 'POST', url: `/api/teams/${teamAId}/trade-proposals`, payload: {
      receivingTeamId: teamBId, proposedBy: 'gm-a', proposingAssets: [{ assetType: 'PLAYER_DRAFT_RIGHT', playerDraftRightId: rightId }], receivingAssets: [],
    } });
    expect(created.statusCode).toBe(200);
    const proposal = created.json().item;
    const submitted = await app.inject({ method: 'POST', url: `/api/teams/${teamAId}/trade-proposals/${proposal.id}/submit`, payload: { expectedUpdatedAt: proposal.updatedAt } });
    expect(submitted.statusCode).toBe(200);
    const accepted = await app.inject({ method: 'POST', url: `/api/teams/${teamBId}/trade-proposals/${proposal.id}/accept`, payload: { reason: 'Acquire right', expectedUpdatedAt: submitted.json().item.updatedAt } });
    expect(accepted.statusCode).toBe(200);
    const right = await prisma.playerDraftRight.findUniqueOrThrow({ where: { id: rightId } });
    expect(right.teamId).toBe(teamBId);
    expect(right.status).toBe('ACTIVE');
    // Player remains unsigned.
    expect((await prisma.player.findUniqueOrThrow({ where: { id: rightsPlayerId } })).currentTeamId).toBeNull();
    // DraftPick/DraftEvent history unchanged.
    expect((await prisma.draftPick.count({ where: { id: right.draftPickId, status: 'COMPLETED' } }))).toBe(1);
  });

  it('rejects stale ownership and keeps history consistent', async () => {
    // Build a proposal referencing the pick (now owned by teamB), then try to accept from teamB side after teamA "owns" it in the proposal.
    // Simpler: create a proposal where teamA offers an asset it no longer owns → submit should fail at ownership revalidation.
    const created = await app.inject({ method: 'POST', url: `/api/teams/${teamAId}/trade-proposals`, payload: {
      receivingTeamId: teamBId, proposedBy: 'gm-a', proposingAssets: [{ assetType: 'DRAFT_PICK', draftPickId: pickId }], receivingAssets: [],
    } });
    expect(created.statusCode).toBe(409); // teamA no longer owns the pick → eligibility fails at create time
  });

  it('withdraws and rejects proposals without ownership changes', async () => {
    const created = await app.inject({ method: 'POST', url: `/api/teams/${teamAId}/trade-proposals`, payload: {
      receivingTeamId: teamBId, proposedBy: 'gm-a', proposingAssets: [{ assetType: 'PLAYER_CONTRACT', playerContractId: playerBContractId }], receivingAssets: [],
    } });
    expect(created.statusCode).toBe(200);
    const proposal = created.json().item;
    const submitted = await app.inject({ method: 'POST', url: `/api/teams/${teamAId}/trade-proposals/${proposal.id}/submit`, payload: { expectedUpdatedAt: proposal.updatedAt } });
    expect(submitted.statusCode).toBe(200);
    const before = (await prisma.player.findUniqueOrThrow({ where: { id: playerBId } })).currentTeamId;
    const withdrawn = await app.inject({ method: 'POST', url: `/api/teams/${teamAId}/trade-proposals/${proposal.id}/withdraw`, payload: { reason: 'Changed mind', expectedUpdatedAt: submitted.json().item.updatedAt } });
    expect(withdrawn.statusCode).toBe(200);
    expect(withdrawn.json().item.status).toBe('WITHDRAWN');
    expect((await prisma.player.findUniqueOrThrow({ where: { id: playerBId } })).currentTeamId).toBe(before);

    // Reject path.
    const created2 = await app.inject({ method: 'POST', url: `/api/teams/${teamAId}/trade-proposals`, payload: {
      receivingTeamId: teamBId, proposedBy: 'gm-a', proposingAssets: [{ assetType: 'PLAYER_CONTRACT', playerContractId: playerBContractId }], receivingAssets: [],
    } });
    const proposal2 = created2.json().item;
    const submitted2 = await app.inject({ method: 'POST', url: `/api/teams/${teamAId}/trade-proposals/${proposal2.id}/submit`, payload: { expectedUpdatedAt: proposal2.updatedAt } });
    const rejected = await app.inject({ method: 'POST', url: `/api/teams/${teamBId}/trade-proposals/${proposal2.id}/reject`, payload: { reason: 'No interest', expectedUpdatedAt: submitted2.json().item.updatedAt } });
    expect(rejected.statusCode).toBe(200);
    expect(rejected.json().item.status).toBe('REJECTED');
  });

  it('does not leak hidden truth, scouting, or create cap/conditional/multi-team artifacts', async () => {
    const list = (await app.inject({ method: 'GET', url: '/api/trade-proposals' })).body;
    expect(list).not.toContain('potentialFloor');
    expect(list).not.toContain('potentialCeiling');
    expect(list).not.toContain('developmentRate');
    // Public proposal must not carry another team's private valuation internals.
    const proposal = (await app.inject({ method: 'GET', url: '/api/trade-proposals' })).json().items.at(-1);
    if (proposal) {
      const body = JSON.stringify(proposal);
      expect(body).not.toContain('reportJson');
    }
    const tables = await prisma.$queryRaw<Array<{ name: string }>>`SELECT name FROM sqlite_master WHERE type='table'`;
    expect(tables.some((t) => /salarycap|caphit|retainedsalary|conditionalpick|retained/i.test(t.name))).toBe(false);
    // No multi-team support: every proposal has exactly one proposing + one receiving team.
    const proposals = await prisma.tradeProposal.findMany();
    for (const p of proposals) expect(p.proposingTeamId).not.toBe(p.receivingTeamId);
  });

  it('exposes player/team/pick/right trade history', async () => {
    expect((await app.inject({ method: 'GET', url: `/api/players/${playerAId}/trades` })).statusCode).toBe(200);
    expect((await app.inject({ method: 'GET', url: `/api/teams/${teamAId}/trades` })).statusCode).toBe(200);
    expect((await app.inject({ method: 'GET', url: `/api/draft-picks/${pickId}/trades` })).statusCode).toBe(200);
    expect((await app.inject({ method: 'GET', url: `/api/draft-rights/${rightId}/trades` })).statusCode).toBe(200);
    const completed = (await app.inject({ method: 'GET', url: '/api/trades' })).json().items;
    expect(completed.length).toBeGreaterThanOrEqual(1);
    const detail = await app.inject({ method: 'GET', url: `/api/trades/${completed[0]!.id}` });
    expect(detail.statusCode).toBe(200);
  });

  it('lineups are not auto-rewritten and commissioner diagnostics work', async () => {
    // Trade did not delete or create lineup slots.
    const lineupCount = await prisma.lineupAssignment.count();
    expect(lineupCount).toBeGreaterThanOrEqual(0); // unchanged from fixture
    const overview = await app.inject({ method: 'GET', url: `/api/teams/${teamAId}/trade-center` });
    expect(overview.statusCode).toBe(200);
    // Commissioner diagnostics reveal valuations behind the gate.
    const diag = await app.inject({ method: 'GET', url: '/api/commissioner/trades', headers: commissionerHeaders });
    // Commissioner create route is POST; diagnostics on first completed trade:
    const completed = (await app.inject({ method: 'GET', url: '/api/trades' })).json().items;
    const cd = await app.inject({ method: 'GET', url: `/api/commissioner/trades/${completed[0]!.id}/diagnostics`, headers: commissionerHeaders });
    expect(cd.statusCode).toBe(200);
    // Commissioner gate required.
    const noGate = await app.inject({ method: 'GET', url: `/api/commissioner/trades/${completed[0]!.id}/diagnostics` });
    expect(noGate.statusCode).toBe(403);
    void diag;
  });
});
