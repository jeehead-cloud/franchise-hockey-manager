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

describe('F18 Regular Season', () => {
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
    backupDir = mkdtempSync(join(tmpdir(), 'fhm-f18-bak-'));
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

  async function activateEditionWithStage() {
    const created = await app.inject({
      method: 'POST',
      url: `/api/commissioner/competitions/${competitionId}/editions`,
      headers: commissionerHeaders,
      payload: {
        worldSeasonId,
        displayName: 'F18 Test Edition',
        templateKey: 'SIMPLE_LEAGUE',
        reason: 'Create F18 test edition',
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

  it('previews and generates a deterministic schedule', async () => {
    await activateEditionWithStage();

    const preview1 = await app.inject({
      method: 'POST',
      url: `/api/commissioner/competition-stages/${stageId}/schedule-preview`,
      headers: commissionerHeaders,
      payload: { seed: 'f18-seed-a' },
    });
    expect(preview1.statusCode).toBe(200);
    expect(preview1.json().item.persisted).toBe(false);
    const hash = preview1.json().item.scheduleHash as string;
    expect(hash).toBeTruthy();

    const beforeCount = await prisma.match.count({ where: { competitionStageId: stageId } });
    expect(beforeCount).toBe(0);

    const preview2 = await app.inject({
      method: 'POST',
      url: `/api/commissioner/competition-stages/${stageId}/schedule-preview`,
      headers: commissionerHeaders,
      payload: { seed: 'f18-seed-a' },
    });
    expect(preview2.json().item.scheduleHash).toBe(hash);

    const gen = await app.inject({
      method: 'POST',
      url: `/api/commissioner/competition-stages/${stageId}/generate-schedule`,
      headers: commissionerHeaders,
      payload: {
        expectedUpdatedAt: stageUpdatedAt,
        seed: 'f18-seed-a',
        reason: 'Generate F18 schedule',
      },
    });
    expect(gen.statusCode).toBe(200);
    expect(gen.json().item.scheduleHash).toBe(hash);
    expect(gen.json().item.status).toBe('SCHEDULED');

    const matches = await prisma.match.findMany({
      where: { competitionStageId: stageId, source: 'COMPETITION' },
    });
    expect(matches.length).toBeGreaterThan(0);
    expect(matches.every((m) => m.status === 'PREPARED')).toBe(true);
    expect(new Set(matches.map((m) => m.scheduleKey)).size).toBe(matches.length);

    stageUpdatedAt = (
      await prisma.competitionStage.findUniqueOrThrow({ where: { id: stageId } })
    ).updatedAt.toISOString();
  });

  it('simulates the full stage, completes standings, and locks schedule', async () => {
    const start = await app.inject({
      method: 'POST',
      url: `/api/competition-stages/${stageId}/simulate`,
      payload: { baseSeed: 'f18-full-run', mode: 'ALL_REMAINING', confirmBackup: true },
    });
    expect(start.statusCode).toBe(202);
    const runId = start.json().item.id as string;
    expect(start.json().item.backup?.relativeDisplayPath).toBeTruthy();

    let status = start.json().item.status as string;
    for (let i = 0; i < 120 && (status === 'QUEUED' || status === 'RUNNING'); i += 1) {
      await new Promise((r) => setTimeout(r, 100));
      const poll = await app.inject({
        method: 'GET',
        url: `/api/competition-stages/${stageId}/simulation-run/${runId}`,
      });
      status = poll.json().item.status;
      if (status === 'FAILED') {
        throw new Error(JSON.stringify(poll.json().item.error));
      }
    }
    expect(status).toBe('COMPLETED');

    const stage = await prisma.competitionStage.findUniqueOrThrow({ where: { id: stageId } });
    expect(stage.status).toBe('COMPLETED');
    expect(stage.scheduleStatus).toBe('LOCKED');

    const standings = await app.inject({
      method: 'GET',
      url: `/api/competition-stages/${stageId}/standings`,
    });
    expect(standings.statusCode).toBe(200);
    expect(standings.json().item.source).toBe('FINAL');
    expect(standings.json().item.standings.rows.length).toBeGreaterThanOrEqual(2);

    const qual = await app.inject({
      method: 'GET',
      url: `/api/competition-stages/${stageId}/qualification`,
    });
    expect(qual.statusCode).toBe(200);
    expect(qual.json().item.qualifiedParticipantIds.length).toBe(2);

    const snapCount = await prisma.competitionStageStanding.count({
      where: { competitionStageId: stageId },
    });
    expect(snapCount).toBeGreaterThan(0);

    const regen = await app.inject({
      method: 'POST',
      url: `/api/commissioner/competition-stages/${stageId}/regenerate-schedule`,
      headers: commissionerHeaders,
      payload: {
        expectedUpdatedAt: stage.updatedAt.toISOString(),
        seed: 'other',
        reason: 'Should fail after results',
      },
    });
    expect(regen.statusCode).toBe(409);
    expect(regen.json().error).toBe('ScheduleLockedByResults');
  });
});
