import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import type { PrismaClient } from '@prisma/client';
import { join } from 'node:path';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
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
  'x-fhm-commissioner-source': 'api',
};

async function ensureAggregatedRoster(prisma: PrismaClient, teamId: string, tag: string) {
  const players = await prisma.player.findMany({
    where: { currentTeamId: teamId, rosterStatus: 'ACTIVE' },
  });
  const skaters = players.filter((p) => p.primaryPosition !== 'G');
  const goalies = players.filter((p) => p.primaryPosition === 'G');
  const countryId = (await prisma.country.findFirstOrThrow()).id;

  for (let i = skaters.length; i < 8; i += 1) {
    const player = await prisma.player.create({
      data: {
        firstName: `Agg${tag}`,
        lastName: `S${i}`,
        dateOfBirth: new Date('1999-01-01'),
        nationalityCountryId: countryId,
        currentTeamId: teamId,
        primaryPosition: i % 2 === 0 ? 'C' : 'LD',
        sourceType: 'MANUAL',
        rosterStatus: 'ACTIVE',
      },
    });
    await prisma.skaterAttributes.create({
      data: {
        playerId: player.id,
        stickhandling: 10 + (i % 5),
        shooting: 11,
        passing: 10,
        strength: 10,
        speed: 11,
        balance: 10,
        aggression: 9,
        offensiveAwareness: 11,
        defensiveAwareness: 10,
      },
    });
  }

  if (goalies.length < 1) {
    const player = await prisma.player.create({
      data: {
        firstName: `Agg${tag}`,
        lastName: 'G',
        dateOfBirth: new Date('1998-01-01'),
        nationalityCountryId: countryId,
        currentTeamId: teamId,
        primaryPosition: 'G',
        sourceType: 'MANUAL',
        rosterStatus: 'ACTIVE',
      },
    });
    await prisma.goalieAttributes.create({
      data: {
        playerId: player.id,
        reflexes: 12,
        positioning: 11,
        reboundControl: 10,
        glove: 11,
        blocker: 10,
        movement: 11,
        puckHandling: 9,
        consistency: 11,
        stamina: 12,
      },
    });
  }
}

describe('F21 Aggregated League', () => {
  let app: FastifyInstance;
  let prisma: PrismaClient;
  let tempDir: string;
  let backupDir: string;
  let competitionId = '';
  let worldSeasonId = '';
  let leagueId = '';
  let editionId = '';
  let stageId = '';
  let stageUpdatedAt = '';

  beforeAll(async () => {
    const { url, dir } = createTempDatabaseUrl();
    tempDir = dir;
    backupDir = mkdtempSync(join(tmpdir(), 'fhm-f21-bak-'));
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
    competitionId = (await prisma.competition.findFirstOrThrow()).id;
    worldSeasonId = (await prisma.worldSeason.findFirstOrThrow()).id;
    leagueId = (await prisma.league.findFirstOrThrow()).id;
    await prisma.competitionEdition.deleteMany({ where: { competitionId } });

    const teams = await prisma.team.findMany({ where: { leagueId } });
    for (const [i, team] of teams.entries()) {
      await ensureAggregatedRoster(prisma, team.id, String(i));
    }

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

  async function activateAggregatedEdition() {
    const patched = await app.inject({
      method: 'PATCH',
      url: `/api/commissioner/competitions/${competitionId}`,
      headers: commissionerHeaders,
      payload: {
        expectedUpdatedAt: (
          await prisma.competition.findUniqueOrThrow({ where: { id: competitionId } })
        ).updatedAt.toISOString(),
        reason: 'Mark competition AGGREGATED for F21',
        simulationLevel: 'AGGREGATED',
      },
    });
    expect(patched.statusCode).toBe(200);

    const created = await app.inject({
      method: 'POST',
      url: `/api/commissioner/competitions/${competitionId}/editions`,
      headers: commissionerHeaders,
      payload: {
        worldSeasonId,
        displayName: 'F21 Aggregated Edition',
        templateKey: 'SIMPLE_LEAGUE',
        reason: 'Create F21 test edition',
      },
    });
    expect(created.statusCode).toBe(201);
    editionId = created.json().item.id;
    let updatedAt = created.json().item.updatedAt as string;

    const fromLeague = await app.inject({
      method: 'POST',
      url: `/api/commissioner/competition-editions/${editionId}/participants/from-league`,
      headers: commissionerHeaders,
      payload: {
        expectedUpdatedAt: updatedAt,
        leagueId,
        status: 'CONFIRMED',
        reason: 'Add league teams',
      },
    });
    expect(fromLeague.statusCode).toBe(200);
    updatedAt = (await prisma.competitionEdition.findUniqueOrThrow({ where: { id: editionId } }))
      .updatedAt.toISOString();

    const stage = await app.inject({
      method: 'POST',
      url: `/api/commissioner/competition-editions/${editionId}/stages`,
      headers: commissionerHeaders,
      payload: {
        expectedUpdatedAt: updatedAt,
        reason: 'Add RS stage',
        name: 'Aggregated Regular Season',
        stageType: 'REGULAR_SEASON',
        stageOrder: 1,
        participantSource: 'EDITION_PARTICIPANTS',
        config: {
          scheduleFormat: 'ROUND_ROBIN',
          homeAwayMode: 'BALANCED',
          allowBackToBack: true,
          minimumRestSlots: 0,
          qualifiersCount: 0,
        },
      },
    });
    expect(stage.statusCode).toBe(201);
    stageId = stage.json().item.id;
    stageUpdatedAt = stage.json().item.updatedAt;

    updatedAt = (await prisma.competitionEdition.findUniqueOrThrow({ where: { id: editionId } }))
      .updatedAt.toISOString();
    const ready = await app.inject({
      method: 'POST',
      url: `/api/commissioner/competition-editions/${editionId}/transition`,
      headers: commissionerHeaders,
      payload: { expectedUpdatedAt: updatedAt, targetStatus: 'READY', reason: 'Mark ready' },
    });
    expect(ready.statusCode).toBe(200);
    updatedAt = ready.json().item.updatedAt;

    const active = await app.inject({
      method: 'POST',
      url: `/api/commissioner/competition-editions/${editionId}/transition`,
      headers: commissionerHeaders,
      payload: { expectedUpdatedAt: updatedAt, targetStatus: 'ACTIVE', reason: 'Activate' },
    });
    expect(active.statusCode).toBe(200);

    stageUpdatedAt = (
      await prisma.competitionStage.findUniqueOrThrow({ where: { id: stageId } })
    ).updatedAt.toISOString();
  }

  it('rejects detailed competitions on aggregated endpoints', async () => {
    const detailedComp = await prisma.competition.create({
      data: {
        name: 'Detailed Only',
        type: 'LEAGUE',
        simulationLevel: 'DETAILED',
        shortName: 'DET',
      },
    });
    const ed = await prisma.competitionEdition.create({
      data: {
        competitionId: detailedComp.id,
        worldSeasonId,
        displayName: 'Det Ed',
        status: 'ACTIVE',
        rulesSnapshotText: '{}',
        rulesHash: 'x',
      },
    });
    const st = await prisma.competitionStage.create({
      data: {
        competitionEditionId: ed.id,
        name: 'RS',
        stageType: 'REGULAR_SEASON',
        stageOrder: 1,
        status: 'READY',
        configText: '{}',
        configHash: 'x',
      },
    });
    const res = await app.inject({
      method: 'POST',
      url: `/api/commissioner/competition-stages/${st.id}/aggregated-preview`,
      headers: commissionerHeaders,
      payload: {},
    });
    expect(res.statusCode).toBe(409);
    expect(res.json().error).toBe('CompetitionNotAggregated');
  });

  it('previews, prepares, simulates, and archives without detailed match rows', async () => {
    await activateAggregatedEdition();

    const matchBefore = await prisma.match.count();
    const eventBefore = await prisma.matchEvent.count();
    const resultBefore = await prisma.matchResult.count();
    const pgsBefore = await prisma.playerGameStat.count();

    const preview = await app.inject({
      method: 'POST',
      url: `/api/commissioner/competition-stages/${stageId}/aggregated-preview`,
      headers: commissionerHeaders,
      payload: {},
    });
    expect(preview.statusCode).toBe(200);
    expect(preview.json().item.persisted).toBe(false);
    expect(preview.json().item.scheduleGames).toBeGreaterThan(0);
    const previewInputHash = preview.json().item.inputHash as string;

    const prepare = await app.inject({
      method: 'POST',
      url: `/api/commissioner/competition-stages/${stageId}/prepare-aggregated-season`,
      headers: commissionerHeaders,
      payload: {
        expectedUpdatedAt: stageUpdatedAt,
        seed: 'f21-seed-a',
        reason: 'Prepare F21 aggregated season',
      },
    });
    expect(prepare.statusCode).toBe(200);
    const runId = prepare.json().item.run.id as string;
    expect(prepare.json().item.run.inputHash).toBeTruthy();
    expect(prepare.json().item.run.status).toBe('PREPARED');

    const sim = await app.inject({
      method: 'POST',
      url: `/api/competition-stages/${stageId}/simulate-aggregated-season`,
      payload: { runId, confirmation: true },
    });
    expect(sim.statusCode).toBe(200);
    expect(sim.json().item.resultHash).toBeTruthy();
    expect(sim.json().item.championName).toBeTruthy();
    expect(sim.json().item.backup).toBeTruthy();

    const stage = await prisma.competitionStage.findUniqueOrThrow({ where: { id: stageId } });
    expect(stage.status).toBe('COMPLETED');
    expect(stage.championParticipantId).toBeTruthy();
    expect(stage.simulationModeSnapshot).toBe('AGGREGATED');

    const standings = await prisma.competitionStageStanding.count({
      where: { competitionStageId: stageId },
    });
    expect(standings).toBeGreaterThanOrEqual(2);
    const summaries = await prisma.aggregatedMatchSummary.count({
      where: { runId, competitionStageId: stageId },
    });
    expect(summaries).toBeGreaterThan(0);
    const teamStats = await prisma.competitionStageTeamStat.count({
      where: { competitionStageId: stageId },
    });
    const playerStats = await prisma.competitionStagePlayerStat.count({
      where: { competitionStageId: stageId },
    });
    expect(teamStats).toBeGreaterThan(0);
    expect(playerStats).toBeGreaterThan(0);

    expect(await prisma.match.count()).toBe(matchBefore);
    expect(await prisma.matchEvent.count()).toBe(eventBefore);
    expect(await prisma.matchResult.count()).toBe(resultBefore);
    expect(await prisma.playerGameStat.count()).toBe(pgsBefore);

    const status = await app.inject({
      method: 'GET',
      url: `/api/competition-stages/${stageId}/aggregated-status`,
    });
    expect(status.statusCode).toBe(200);
    expect(status.json().item.label).toContain('Aggregated');

    const matches = await app.inject({
      method: 'GET',
      url: `/api/competition-stages/${stageId}/aggregated-matches?page=1&pageSize=50`,
    });
    expect(matches.statusCode).toBe(200);
    expect(matches.json().total).toBe(summaries);

    // Determinism: same seed on a fresh prepare is blocked after completion
    const rerun = await app.inject({
      method: 'POST',
      url: `/api/competition-stages/${stageId}/simulate-aggregated-season`,
      payload: { runId, confirmation: true },
    });
    expect(rerun.statusCode).toBe(409);

    let editionUpdatedAt = (
      await prisma.competitionEdition.findUniqueOrThrow({ where: { id: editionId } })
    ).updatedAt.toISOString();
    const complete = await app.inject({
      method: 'POST',
      url: `/api/commissioner/competition-editions/${editionId}/transition`,
      headers: commissionerHeaders,
      payload: {
        expectedUpdatedAt: editionUpdatedAt,
        targetStatus: 'COMPLETED',
        reason: 'Complete aggregated edition',
      },
    });
    expect(complete.statusCode).toBe(200);
    editionUpdatedAt = complete.json().item.updatedAt;

    const archive = await app.inject({
      method: 'POST',
      url: `/api/commissioner/competition-editions/${editionId}/archive`,
      headers: commissionerHeaders,
      payload: {
        expectedUpdatedAt: editionUpdatedAt,
        reason: 'Archive F21 aggregated edition',
      },
    });
    expect([200, 201]).toContain(archive.statusCode);
    expect(archive.json().item.archive.simulationLevelSnapshot).toBe('AGGREGATED');

    const archived = await prisma.competitionArchive.findFirst({
      where: { competitionEditionId: editionId, isCurrent: true },
    });
    expect(archived).toBeTruthy();
    expect(archived?.simulationLevelSnapshot).toBe('AGGREGATED');
    expect(archived?.matchCount).toBe(summaries);
    expect(archived?.championNameSnapshot).toBeTruthy();

    // Preview hash uses different seed ('preview-only') so differs from prepared — just sanity
    expect(previewInputHash).toBeTruthy();
  });
});
