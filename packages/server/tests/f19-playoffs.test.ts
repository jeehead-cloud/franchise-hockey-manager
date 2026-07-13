import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import type { PrismaClient } from '@prisma/client';
import { buildTestSimulationInput } from '@fhm/engine';
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

describe('F19 Playoffs', () => {
  let app: FastifyInstance;
  let prisma: PrismaClient;
  let tempDir: string;
  let backupDir: string;
  let competitionId = '';
  let worldSeasonId = '';
  let leagueId = '';
  let rsStageId = '';
  let playoffStageId = '';
  let editionId = '';

  beforeAll(async () => {
    const { url, dir } = createTempDatabaseUrl();
    tempDir = dir;
    backupDir = mkdtempSync(join(tmpdir(), 'fhm-f19-bak-'));
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

    const simulationInputMod = await import('../src/services/simulation-input.js');
    vi.spyOn(simulationInputMod, 'assertTeamSimulationReady').mockResolvedValue(undefined);
    vi.spyOn(simulationInputMod, 'buildSimulationInput').mockImplementation(async (opts) => {
      const input = buildTestSimulationInput(opts.seed, { mode: 'F14' });
      input.matchId = opts.matchId ?? `match-${opts.homeTeamId}-${opts.awayTeamId}`;
      input.homeTeam.teamId = opts.homeTeamId;
      input.awayTeam.teamId = opts.awayTeamId;
      if (opts.completionRules) {
        input.rules = {
          ...input.rules,
          overtimeEnabled: opts.completionRules.overtimeEnabled,
          shootoutEnabled: opts.completionRules.shootoutEnabled,
          tiesAllowed: opts.completionRules.tiesAllowed,
        };
      }
      input.inputFingerprint = `mock-${opts.homeTeamId}-${opts.awayTeamId}-${opts.seed}`;
      return input;
    });

    const { buildApp, ensureAppMeta } = await import('../src/app.js');
    await ensureAppMeta();
    app = await buildApp({ logger: false });
    await app.ready();
  });

  afterAll(async () => {
    vi.restoreAllMocks();
    if (app) await app.close();
    if (prisma) await prisma.$disconnect();
    if (tempDir) cleanupTempDir(tempDir);
    if (backupDir) cleanupTempDir(backupDir);
  });

  async function pollRun(stageId: string, runId: string) {
    let status = 'QUEUED';
    for (let i = 0; i < 200 && (status === 'QUEUED' || status === 'RUNNING'); i += 1) {
      await new Promise((r) => setTimeout(r, 50));
      const poll = await app.inject({
        method: 'GET',
        url: `/api/competition-stages/${stageId}/simulation-run/${runId}`,
      });
      // F18 uses simulation-run; F19 full playoffs may use simulation-runs
      if (poll.statusCode === 404) {
        const poll2 = await app.inject({
          method: 'GET',
          url: `/api/competition-stages/${stageId}/simulation-runs/${runId}`,
        });
        status = poll2.json().item.status;
        if (status === 'FAILED') throw new Error(JSON.stringify(poll2.json().item.error));
      } else {
        status = poll.json().item.status;
        if (status === 'FAILED') throw new Error(JSON.stringify(poll.json().item.error));
      }
    }
    return status;
  }

  it('imports qualifiers, generates bracket, simulates playoffs, and crowns a champion', async () => {
    const created = await app.inject({
      method: 'POST',
      url: `/api/commissioner/competitions/${competitionId}/editions`,
      headers: commissionerHeaders,
      payload: {
        worldSeasonId,
        displayName: 'F19 Test Edition',
        templateKey: 'SIMPLE_LEAGUE',
        reason: 'Create F19 test edition',
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
        reason: 'Add teams',
      },
    });
    expect(fromLeague.statusCode).toBe(200);
    updatedAt = (await prisma.competitionEdition.findUniqueOrThrow({ where: { id: editionId } }))
      .updatedAt.toISOString();

    const rs = await app.inject({
      method: 'POST',
      url: `/api/commissioner/competition-editions/${editionId}/stages`,
      headers: commissionerHeaders,
      payload: {
        expectedUpdatedAt: updatedAt,
        reason: 'Add regular season stage',
        name: 'Regular Season',
        stageType: 'REGULAR_SEASON',
        stageOrder: 1,
        participantSource: 'EDITION_PARTICIPANTS',
        config: {
          scheduleFormat: 'ROUND_ROBIN',
          homeAwayMode: 'BALANCED',
          allowBackToBack: true,
          minimumRestSlots: 0,
          qualifiersCount: 2,
        },
      },
    });
    expect(rs.statusCode).toBe(201);
    rsStageId = rs.json().item.id;
    updatedAt = (await prisma.competitionEdition.findUniqueOrThrow({ where: { id: editionId } }))
      .updatedAt.toISOString();

    const po = await app.inject({
      method: 'POST',
      url: `/api/commissioner/competition-editions/${editionId}/stages`,
      headers: commissionerHeaders,
      payload: {
        expectedUpdatedAt: updatedAt,
        reason: 'Add playoff stage',
        name: 'Playoffs',
        stageType: 'BEST_OF_SERIES',
        stageOrder: 2,
        participantSource: 'PREVIOUS_STAGE_QUALIFIERS',
        sourceStageId: rsStageId,
        expectedQualifierCount: 2,
        config: {
          winsRequired: 1,
          reseeding: false,
          homePattern: '1',
          qualificationCount: 2,
          bracketMode: 'FIXED',
          sourceStageId: rsStageId,
          matchRules: { tiesAllowed: false, overtimeEnabled: true, shootoutEnabled: false },
        },
      },
    });
    expect(po.statusCode).toBe(201);
    playoffStageId = po.json().item.id;

    updatedAt = (await prisma.competitionEdition.findUniqueOrThrow({ where: { id: editionId } }))
      .updatedAt.toISOString();
    let t = await app.inject({
      method: 'POST',
      url: `/api/commissioner/competition-editions/${editionId}/transition`,
      headers: commissionerHeaders,
      payload: { expectedUpdatedAt: updatedAt, targetStatus: 'READY', reason: 'ready' },
    });
    expect(t.statusCode).toBe(200);
    updatedAt = t.json().item.updatedAt;
    t = await app.inject({
      method: 'POST',
      url: `/api/commissioner/competition-editions/${editionId}/transition`,
      headers: commissionerHeaders,
      payload: { expectedUpdatedAt: updatedAt, targetStatus: 'ACTIVE', reason: 'active' },
    });
    expect(t.statusCode).toBe(200);

    let stageUpdatedAt = (
      await prisma.competitionStage.findUniqueOrThrow({ where: { id: rsStageId } })
    ).updatedAt.toISOString();
    const gen = await app.inject({
      method: 'POST',
      url: `/api/commissioner/competition-stages/${rsStageId}/generate-schedule`,
      headers: commissionerHeaders,
      payload: {
        expectedUpdatedAt: stageUpdatedAt,
        seed: 'f19-rs',
        reason: 'RS schedule',
      },
    });
    expect(gen.statusCode).toBe(200);

    const sim = await app.inject({
      method: 'POST',
      url: `/api/competition-stages/${rsStageId}/simulate`,
      payload: { baseSeed: 'f19-rs-sim', mode: 'ALL_REMAINING' },
    });
    expect(sim.statusCode).toBe(202);
    expect(await pollRun(rsStageId, sim.json().item.id)).toBe('COMPLETED');

    const rsDone = await prisma.competitionStage.findUniqueOrThrow({ where: { id: rsStageId } });
    expect(rsDone.status).toBe('COMPLETED');

    stageUpdatedAt = (
      await prisma.competitionStage.findUniqueOrThrow({ where: { id: playoffStageId } })
    ).updatedAt.toISOString();
    const imported = await app.inject({
      method: 'POST',
      url: `/api/commissioner/competition-stages/${playoffStageId}/import-qualified-participants`,
      headers: commissionerHeaders,
      payload: {
        expectedUpdatedAt: stageUpdatedAt,
        sourceStageId: rsStageId,
        qualificationCount: 2,
        reason: 'Import finalists',
      },
    });
    expect(imported.statusCode).toBe(200);
    expect(imported.json().item.importedCount).toBe(2);

    stageUpdatedAt = (
      await prisma.competitionStage.findUniqueOrThrow({ where: { id: playoffStageId } })
    ).updatedAt.toISOString();
    const preview = await app.inject({
      method: 'POST',
      url: `/api/commissioner/competition-stages/${playoffStageId}/bracket-preview`,
      headers: commissionerHeaders,
      payload: { seed: 'playoffs-2026' },
    });
    expect(preview.statusCode).toBe(200);
    expect(preview.json().item.persisted).toBe(false);
    const hash = preview.json().item.bracketHash;

    const bracket = await app.inject({
      method: 'POST',
      url: `/api/commissioner/competition-stages/${playoffStageId}/generate-bracket`,
      headers: commissionerHeaders,
      payload: {
        expectedUpdatedAt: stageUpdatedAt,
        seed: 'playoffs-2026',
        reason: 'Generate bracket',
      },
    });
    expect(bracket.statusCode).toBe(200);
    expect(bracket.json().item.bracketHash).toBe(hash);
    expect(bracket.json().item.seriesCount).toBe(1);

    const series = await prisma.playoffSeries.findFirstOrThrow({
      where: { competitionStageId: playoffStageId },
    });
    const next = await app.inject({
      method: 'POST',
      url: `/api/playoff-series/${series.id}/simulate-next`,
      payload: { baseSeed: 'playoffs-2026' },
    });
    expect(next.statusCode).toBe(200);

    const stage = await prisma.competitionStage.findUniqueOrThrow({ where: { id: playoffStageId } });
    expect(stage.status).toBe('COMPLETED');
    expect(stage.championParticipantId).toBeTruthy();
    expect(stage.championTeamNameSnapshot).toBeTruthy();

    const readiness = await app.inject({
      method: 'GET',
      url: `/api/competition-editions/${editionId}/completion-readiness`,
    });
    expect(readiness.statusCode).toBe(200);
    expect(readiness.json().item.canCompleteEdition).toBe(true);

    const view = await app.inject({
      method: 'GET',
      url: `/api/competition-stages/${playoffStageId}/bracket`,
    });
    expect(view.statusCode).toBe(200);
    expect(view.json().item.stage.championParticipantId).toBe(stage.championParticipantId);

    const regen = await app.inject({
      method: 'POST',
      url: `/api/commissioner/competition-stages/${playoffStageId}/regenerate-bracket`,
      headers: commissionerHeaders,
      payload: {
        expectedUpdatedAt: stage.updatedAt.toISOString(),
        seed: 'other',
        reason: 'Should fail',
      },
    });
    expect(regen.statusCode).toBe(409);
    expect(regen.json().error).toBe('BracketLockedByResults');
  });
});
