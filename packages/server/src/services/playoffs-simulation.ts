import { prisma } from '../db/client.js';
import { simulateMatch } from './match-simulation.js';
import { createSqliteSafetyBackup } from './sqlite-backup.js';
import { PlayoffHttpError } from './playoff-errors.js';
import { deriveSeriesGameSeed } from './playoffs-progression.js';
import {
  createStageRun,
  getActiveStageRun,
  getStageRun,
  requestCancelStageRun,
  yieldEventLoop,
  type StageRunRecord,
} from './regular-season-runs.js';
import { serializeRun as serializeBaseRun } from './regular-season-simulation.js';

// Re-export serialize with playoff note
export function serializePlayoffRun(run: StageRunRecord) {
  return {
    ...serializeBaseRun(run),
    note:
      'Cancellation stops future playoff games only. Already completed MatchResults remain official.',
  };
}

async function nextPreparedPlayoffMatch(stageId: string) {
  return prisma.match.findFirst({
    where: {
      competitionStageId: stageId,
      playoffSeriesId: { not: null },
      status: { in: ['PREPARED', 'FAILED'] },
      currentResultId: null,
    },
    include: { playoffSeries: true },
    orderBy: [
      { playoffSeries: { roundNumber: 'asc' } },
      { playoffSeries: { seriesOrder: 'asc' } },
      { playoffGameNumber: 'asc' },
    ],
  });
}

export async function simulateNextPlayoffGame(seriesId: string, baseSeed?: string) {
  const series = await prisma.playoffSeries.findUnique({
    where: { id: seriesId },
    include: { stage: true },
  });
  if (!series) throw new PlayoffHttpError(404, 'PlayoffSeriesNotFound', 'Playoff series not found');
  if (series.status === 'COMPLETED') {
    throw new PlayoffHttpError(409, 'SeriesAlreadyCompleted', 'Series is already completed');
  }
  if (series.stage.status === 'COMPLETED') {
    throw new PlayoffHttpError(409, 'StageNotPlayoff', 'Playoff stage is completed');
  }

  const match = await prisma.match.findFirst({
    where: {
      playoffSeriesId: seriesId,
      status: { in: ['PREPARED', 'FAILED'] },
      currentResultId: null,
    },
    orderBy: { playoffGameNumber: 'asc' },
  });
  if (!match) {
    throw new PlayoffHttpError(409, 'SeriesAlreadyCompleted', 'No prepared playoff game to simulate');
  }

  const seed =
    baseSeed && series.stage.bracketHash
      ? deriveSeriesGameSeed(
          baseSeed,
          series.stage.bracketHash,
          series.roundNumber,
          series.bracketSlot,
          match.playoffGameNumber ?? 1,
        )
      : undefined;

  return simulateMatch(match.id, seed);
}

export async function simulatePlayoffSeries(seriesId: string, baseSeed: string) {
  const series = await prisma.playoffSeries.findUnique({
    where: { id: seriesId },
    include: { stage: true },
  });
  if (!series) throw new PlayoffHttpError(404, 'PlayoffSeriesNotFound', 'Playoff series not found');
  if (series.status === 'COMPLETED') {
    throw new PlayoffHttpError(409, 'SeriesAlreadyCompleted', 'Series is already completed');
  }

  const results = [];
  for (let i = 0; i < series.winsRequired * 2; i += 1) {
    const current = await prisma.playoffSeries.findUniqueOrThrow({ where: { id: seriesId } });
    if (current.status === 'COMPLETED') break;
    const next = await simulateNextPlayoffGame(seriesId, baseSeed);
    results.push(next);
    await yieldEventLoop();
  }
  return {
    seriesId,
    gamesSimulated: results.length,
    status: (await prisma.playoffSeries.findUniqueOrThrow({ where: { id: seriesId } })).status,
  };
}

export async function startFullPlayoffsSimulation(
  stageId: string,
  opts: { baseSeed: string },
): Promise<StageRunRecord> {
  const stage = await prisma.competitionStage.findUnique({ where: { id: stageId } });
  if (!stage) throw new PlayoffHttpError(404, 'CompetitionStageNotFound', 'Stage not found');
  if (stage.stageType !== 'BEST_OF_SERIES' && stage.stageType !== 'KNOCKOUT') {
    throw new PlayoffHttpError(409, 'StageNotPlayoff', 'Not a playoff stage');
  }
  if (stage.status === 'COMPLETED') {
    throw new PlayoffHttpError(409, 'StageNotPlayoff', 'Playoff stage already completed');
  }
  if (!stage.bracketHash) {
    throw new PlayoffHttpError(409, 'StageNotPlayoff', 'Bracket has not been generated');
  }

  const existing = getActiveStageRun(stageId);
  if (existing && (existing.status === 'QUEUED' || existing.status === 'RUNNING')) {
    throw new PlayoffHttpError(409, 'PlayoffSimulationAlreadyRunning', 'A playoff run is already active');
  }

  const anyCompleted = await prisma.match.count({
    where: {
      competitionStageId: stageId,
      playoffSeriesId: { not: null },
      status: 'COMPLETED',
    },
  });

  let backupMeta: StageRunRecord['backup'] = null;
  if (anyCompleted === 0) {
    try {
      const backup = await createSqliteSafetyBackup({ label: `playoffs-${stageId.slice(0, 8)}` });
      backupMeta = {
        relativeDisplayPath: backup.relativeDisplayPath,
        createdAt: backup.createdAt,
        bytes: backup.bytes,
      };
    } catch (err) {
      throw new PlayoffHttpError(
        503,
        'BackupFailed',
        err instanceof Error ? err.message : 'Pre-run backup failed',
      );
    }
  }

  // Estimate remaining: count prepared + potential future is unknown; use prepared for now and refresh
  const prepared = await prisma.match.count({
    where: {
      competitionStageId: stageId,
      playoffSeriesId: { not: null },
      status: { in: ['PREPARED', 'FAILED'] },
      currentResultId: null,
    },
  });

  const run = createStageRun({ stageId, baseSeed: opts.baseSeed, total: Math.max(1, prepared) });
  run.backup = backupMeta;
  void executePlayoffRun(run.id).catch(() => undefined);
  return run;
}

async function executePlayoffRun(runId: string) {
  const run = getStageRun(runId);
  if (!run) return;
  run.status = 'RUNNING';
  run.startedAt = Date.now();

  try {
    const stage = await prisma.competitionStage.findUniqueOrThrow({ where: { id: run.stageId } });
    let safety = 0;
    while (safety < 500) {
      safety += 1;
      if (run.cancelRequested) {
        run.status = 'CANCELLED';
        run.completedAt = Date.now();
        run.isPartialOfficial = run.progress.completed > 0;
        return;
      }
      const refreshed = await prisma.competitionStage.findUniqueOrThrow({ where: { id: run.stageId } });
      if (refreshed.status === 'COMPLETED') break;

      const match = await nextPreparedPlayoffMatch(run.stageId);
      if (!match || !match.playoffSeries) {
        // Wait for progression to create next game
        await yieldEventLoop();
        const still = await nextPreparedPlayoffMatch(run.stageId);
        if (!still) {
          const stageNow = await prisma.competitionStage.findUniqueOrThrow({ where: { id: run.stageId } });
          if (stageNow.status === 'COMPLETED') break;
          // No prepared games and not complete — may be mid-progression race
          await yieldEventLoop();
          continue;
        }
      }
      const current = await nextPreparedPlayoffMatch(run.stageId);
      if (!current?.playoffSeries) break;

      run.progress.currentMatchId = current.id;
      run.progress.total = Math.max(run.progress.total, run.progress.completed + 1);
      const seed = deriveSeriesGameSeed(
        run.baseSeed,
        stage.bracketHash!,
        current.playoffSeries.roundNumber,
        current.playoffSeries.bracketSlot,
        current.playoffGameNumber ?? 1,
      );
      await simulateMatch(current.id, seed);
      run.progress.completed += 1;
      await yieldEventLoop();
    }

    run.progress.currentMatchId = null;
    run.status = 'COMPLETED';
    run.completedAt = Date.now();
  } catch (err) {
    run.status = 'FAILED';
    run.completedAt = Date.now();
    run.isPartialOfficial = run.progress.completed > 0;
    run.error = {
      code: err instanceof PlayoffHttpError ? err.code : 'PlayoffSimulationFailed',
      message: err instanceof Error ? err.message : 'Playoff simulation failed',
    };
  }
}

export function getPlayoffSimulationRun(stageId: string, runId: string) {
  const run = getStageRun(runId);
  if (!run || run.stageId !== stageId) {
    throw new PlayoffHttpError(404, 'CompetitionStageNotFound', 'Simulation run not found');
  }
  return serializePlayoffRun(run);
}

export function cancelPlayoffSimulation(stageId: string, runId: string) {
  const run = getStageRun(runId);
  if (!run || run.stageId !== stageId) {
    throw new PlayoffHttpError(404, 'CompetitionStageNotFound', 'Simulation run not found');
  }
  requestCancelStageRun(runId);
  return serializePlayoffRun(run);
}
