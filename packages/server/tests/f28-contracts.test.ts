import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import type { PrismaClient } from '@prisma/client';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { cleanupTempDir, createTempDatabaseUrl, migrateTempDatabase } from './helpers/db.js';
import { getRepoRoot } from '../src/initialization/paths.js';
import { COMMISSIONER_HEADER, COMMISSIONER_HEADER_VALUE } from '../src/commissioner/gate.js';

const fixtureDir = join(getRepoRoot(), 'data', 'fixtures', 'f3-minimal-world');
const commissionerHeaders = {
  [COMMISSIONER_HEADER]: COMMISSIONER_HEADER_VALUE,
  'x-fhm-commissioner-source': 'api',
};

describe('F28 contracts and free agency', () => {
  let app: FastifyInstance;
  let prisma: PrismaClient;
  let tempDir = '';
  let seasonId = '';
  let nextSeasonId = '';
  let laterSeasonId = '';
  let teamId = '';
  let playerId = '';
  let secondPlayerId = '';

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
    await prisma.appMeta.upsert({
      where: { id: 'default' },
      create: { id: 'default', worldInitialized: false },
      update: { worldInitialized: false },
    });
    await initializeSetup(prisma, fixtureDir);
    const current = await prisma.worldSeason.findFirstOrThrow();
    seasonId = current.id;
    nextSeasonId = (await prisma.worldSeason.create({ data: {
      label: `${current.startYear + 1}/${String(current.endYear + 1).slice(-2)}`,
      startYear: current.startYear + 1, endYear: current.endYear + 1,
      phase: 'SEASON_PREPARATION', status: 'PLANNED',
    } })).id;
    laterSeasonId = (await prisma.worldSeason.create({ data: {
      label: `${current.startYear + 2}/${String(current.endYear + 2).slice(-2)}`,
      startYear: current.startYear + 2, endYear: current.endYear + 2,
      phase: 'SEASON_PREPARATION', status: 'PLANNED',
    } })).id;
    const players = await prisma.player.findMany({
      where: { currentTeamId: { not: null }, rosterStatus: { not: 'RETIRED' } }, take: 2,
    });
    playerId = players[0]!.id;
    secondPlayerId = players[1]!.id;
    teamId = players[0]!.currentTeamId!;
    const { buildApp, ensureAppMeta } = await import('../src/app.js');
    await ensureAppMeta();
    app = await buildApp({ logger: false });
    await app.ready();
  });

  afterAll(async () => {
    if (app) await app.close();
    if (prisma) await prisma.$disconnect();
    cleanupTempDir(tempDir);
  });

  it('has the migration and idempotent default configuration', async () => {
    expect(existsSync(join(getRepoRoot(), 'packages/server/prisma/migrations/20260716030000_f28_contracts/migration.sql'))).toBe(true);
    const { bootstrapContractConfiguration } = await import('../src/services/contract-config.js');
    const a = await bootstrapContractConfiguration(prisma);
    const b = await bootstrapContractConfiguration(prisma);
    expect(a.versionId).toBe(b.versionId);
    expect(await prisma.contractPreset.count()).toBe(1);
  });

  it('previews without writes and publishes compatibility contracts atomically', async () => {
    const preview = await app.inject({ method: 'POST', url: '/api/commissioner/contracts/initial-preview', headers: commissionerHeaders, payload: { worldSeasonId: seasonId } });
    expect(preview.statusCode).toBe(200);
    expect(preview.json().item.totalContracts).toBeGreaterThan(1);
    expect(await prisma.playerContract.count()).toBe(0);
    const prepared = await app.inject({ method: 'POST', url: '/api/commissioner/contracts/initial-prepare', headers: commissionerHeaders, payload: { worldSeasonId: seasonId, reason: 'F28 initialization test' } });
    const executed = await app.inject({ method: 'POST', url: `/api/commissioner/contracts/initial-runs/${prepared.json().item.id}/execute`, headers: commissionerHeaders, payload: { reason: 'Publish initial contracts' } });
    expect(executed.statusCode).toBe(200);
    expect((await prisma.appMeta.findUniqueOrThrow({ where: { id: 'default' } })).contractsInitializedAt).not.toBeNull();
    expect((await prisma.playerContract.findFirstOrThrow({ where: { playerId, status: 'ACTIVE' } })).teamId).toBe(teamId);
  });

  it('accepts an extension and activates it through idempotent expiration', async () => {
    const rec = await app.inject({ method: 'POST', url: `/api/teams/${teamId}/players/${playerId}/contract-recommendation` });
    const draft = await app.inject({ method: 'POST', url: `/api/teams/${teamId}/players/${playerId}/extension-offers`, payload: {
      startWorldSeasonId: nextSeasonId, endWorldSeasonId: laterSeasonId,
      annualSalary: rec.json().item.recommendedSalary, reason: 'Retain player',
    } });
    const submitted = await app.inject({ method: 'POST', url: `/api/teams/${teamId}/contract-offers/${draft.json().item.id}/submit`, payload: { expectedUpdatedAt: draft.json().item.updatedAt } });
    const accepted = await app.inject({ method: 'POST', url: `/api/contract-offers/${draft.json().item.id}/accept`, payload: { reason: 'Accept extension', expectedUpdatedAt: submitted.json().item.updatedAt } });
    expect(accepted.json().item.status).toBe('FUTURE');
    const prep = await app.inject({ method: 'POST', url: '/api/commissioner/contracts/expiration-prepare', headers: commissionerHeaders, payload: { worldSeasonId: nextSeasonId, reason: 'Advance boundary' } });
    const url = `/api/commissioner/contracts/expiration-runs/${prep.json().item.id}/execute`;
    expect((await app.inject({ method: 'POST', url, headers: commissionerHeaders })).statusCode).toBe(200);
    expect((await app.inject({ method: 'POST', url, headers: commissionerHeaders })).statusCode).toBe(200);
    expect(await prisma.playerContract.count({ where: { playerId, status: 'ACTIVE' } })).toBe(1);
    expect((await prisma.player.findUniqueOrThrow({ where: { id: secondPlayerId } })).currentTeamId).toBeNull();
  });

  it('resolves competing free-agent offers atomically and release preserves history', async () => {
    const teams = await prisma.team.findMany({ where: { teamType: 'CLUB' }, take: 2 });
    const offers: any[] = [];
    for (const [i, team] of teams.entries()) {
      const draft = await app.inject({ method: 'POST', url: `/api/teams/${team.id}/free-agent-offers`, payload: {
        playerId: secondPlayerId, startWorldSeasonId: seasonId, endWorldSeasonId: seasonId,
        annualSalary: 1_000_000 + i * 50_000, reason: 'Free-agent bid',
      } });
      expect(draft.statusCode).toBe(200);
      const submitted = await app.inject({ method: 'POST', url: `/api/teams/${team.id}/contract-offers/${draft.json().item.id}/submit`, payload: { expectedUpdatedAt: draft.json().item.updatedAt } });
      offers.push(submitted.json().item);
    }
    const accepted = await app.inject({ method: 'POST', url: `/api/contract-offers/${offers[1].id}/accept`, payload: { reason: 'Best offer', expectedUpdatedAt: offers[1].updatedAt } });
    expect(accepted.statusCode).toBe(200);
    expect((await prisma.contractOffer.findUniqueOrThrow({ where: { id: offers[0].id } })).status).toBe('REJECTED');
    const active = await prisma.playerContract.findFirstOrThrow({ where: { playerId: secondPlayerId, status: 'ACTIVE' } });
    const release = await app.inject({ method: 'POST', url: `/api/teams/${active.teamId}/contracts/${active.id}/release`, payload: { reason: 'Roster decision', expectedUpdatedAt: active.updatedAt.toISOString() } });
    expect(release.statusCode).toBe(200);
    expect((await prisma.player.findUniqueOrThrow({ where: { id: secondPlayerId } })).currentTeamId).toBeNull();
    expect(await prisma.contractTransaction.count({ where: { playerId: secondPlayerId, transactionType: 'PLAYER_RELEASED' } })).toBe(1);
  });

  it('signs only the rights-held prospect and preserves draft history', async () => {
    const country = await prisma.country.findFirstOrThrow();
    const draftConfig = await prisma.activeDraftConfiguration.findUniqueOrThrow({ where: { id: 'default' } });
    const season = await prisma.worldSeason.findUniqueOrThrow({ where: { id: seasonId } });
    const prospect = await prisma.player.create({ data: {
      firstName: 'Rights', lastName: 'Prospect', dateOfBirth: new Date(`${season.startYear - 18}-01-01`),
      nationalityCountryId: country.id, primaryPosition: 'C', sourceType: 'GENERATED_YOUTH', rosterStatus: 'PROSPECT',
      preferredCoachingStyle: 'DEVELOPMENTAL', preferredTactics: 'SPEED', personality: 'PROFESSIONAL',
      heroRating: 10, stability: 10, developmentRate: 1.5, developmentRisk: .3,
      potentialFloor: 60, potentialCeiling: 85, publicPotentialEstimate: 'HIGH',
      skaterAttributes: { create: { stickhandling: 10, shooting: 10, passing: 10, strength: 10, speed: 10, balance: 10, aggression: 10, offensiveAwareness: 10, defensiveAwareness: 10 } },
    } });
    const event = await prisma.draftEvent.create({ data: { worldSeasonId: season.id, name: 'F28 Rights Fixture', status: 'COMPLETED', presetVersionId: draftConfig.activePresetVersionId, configHash: 'fixture', cutoffDate: `${season.startYear}-09-15`, baseSeed: 'fixture', totalRounds: 1, totalPicks: 1 } });
    const eligible = await prisma.draftEligiblePlayer.create({ data: { draftEventId: event.id, playerId: prospect.id, playerNameSnapshot: 'Rights Prospect', birthDateSnapshot: prospect.dateOfBirth.toISOString(), ageOnCutoffDate: 18, countrySnapshot: country.code, positionSnapshot: 'C', lifecycleSnapshot: 'PROSPECT', sourceTypeSnapshot: 'GENERATED_YOUTH', eligibilityHash: 'fixture', status: 'DRAFTED' } });
    const pick = await prisma.draftPick.create({ data: { draftEventId: event.id, roundNumber: 1, pickInRound: 1, overallPick: 1, originalTeamId: teamId, currentTeamId: teamId, teamNameSnapshot: 'Fixture Team', status: 'COMPLETED', selectedPlayerId: eligible.id, selectedPlayerNameSnapshot: 'Rights Prospect', selectionSource: 'MANUAL' } });
    const right = await prisma.playerDraftRight.create({ data: { playerId: prospect.id, teamId, draftEventId: event.id, draftPickId: pick.id, playerNameSnapshot: 'Rights Prospect', teamNameSnapshot: 'Fixture Team' } });
    const wrongTeam = (await prisma.team.findFirstOrThrow({ where: { teamType: 'CLUB', id: { not: teamId } } })).id;
    expect((await app.inject({ method: 'POST', url: `/api/teams/${wrongTeam}/free-agent-offers`, payload: { playerId: prospect.id, startWorldSeasonId: seasonId, endWorldSeasonId: seasonId, annualSalary: 650_000 } })).statusCode).toBe(409);
    const draft = await app.inject({ method: 'POST', url: `/api/teams/${teamId}/draft-rights/${right.id}/contract-offers`, payload: { playerId: prospect.id, startWorldSeasonId: seasonId, endWorldSeasonId: seasonId, annualSalary: 650_000, reason: 'Entry contract' } });
    const submitted = await app.inject({ method: 'POST', url: `/api/teams/${teamId}/contract-offers/${draft.json().item.id}/submit`, payload: { expectedUpdatedAt: draft.json().item.updatedAt } });
    expect((await app.inject({ method: 'POST', url: `/api/contract-offers/${draft.json().item.id}/accept`, payload: { reason: 'Sign prospect', expectedUpdatedAt: submitted.json().item.updatedAt } })).statusCode).toBe(200);
    expect((await prisma.playerDraftRight.findUniqueOrThrow({ where: { id: right.id } })).status).toBe('CONVERTED_TO_CONTRACT');
    expect((await prisma.player.findUniqueOrThrow({ where: { id: prospect.id } })).currentTeamId).toBe(teamId);
    expect(await prisma.draftPick.count({ where: { id: pick.id } })).toBe(1);
  });

  it('does not leak hidden truth or create trade/cap tables', async () => {
    const body = (await app.inject({ method: 'GET', url: '/api/free-agents' })).body;
    expect(body).not.toContain('potentialFloor');
    expect(body).not.toContain('developmentRate');
    const tables = await prisma.$queryRaw<Array<{ name: string }>>`SELECT name FROM sqlite_master WHERE type='table'`;
    expect(tables.some((t) => /trade|salarycap|caphit/i.test(t.name))).toBe(false);
  });
});
