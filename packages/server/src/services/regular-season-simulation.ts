import { deriveMatchSimulationSeed } from '@fhm/engine';
import { prisma } from '../db/client.js';
import { simulateMatch } from './match-simulation.js';
import { createSqliteSafetyBackup } from './sqlite-backup.js';
import { loadRegularSeasonStageContext } from './regular-season-schedule.js';
import { completeRegularSeasonStage, getStageProgress } from './regular-season-aggregates.js';
import { RegularSeasonHttpError } from './regular-season-errors.js';
import {
  createStageRun,
  getActiveStageRun,
  getStageRun,
  requestCancelStageRun,
  yieldEventLoop,
  type StageRunRecord,
} from './regular-season-runs.js';

async function listRemainingMatches(stageId: string) {
  return prisma.match.findMany({
    where: {
      competitionStageId: stageId,
      source: 'COMPETITION',
      status: { in: ['PREPARED', 'FAILED'] },
      currentResultId: null,
    },
    orderBy: { scheduleOrder: 'asc' },
    select: {
      id: true,
      scheduleOrder: true,
      scheduleKey: true,
      status: true,
    },
  });
}

export async function startRegularSeasonSimulation(
  stageId: string,
  opts: { baseSeed: string; mode?: 'ALL_REMAINING'; confirmBackup?: boolean },
): Promise<StageRunRecord> {
  const ctx = await loadRegularSeasonStageContext(stageId);

  if (ctx.edition.status !== 'ACTIVE') {
    throw new RegularSeasonHttpError(409, 'StageNotReady', 'Edition must be ACTIVE');
  }
  if (
    ctx.stage.status !== 'SCHEDULED' &&
    ctx.stage.status !== 'IN_PROGRESS' &&
    ctx.stage.status !== 'ACTIVE'
  ) {
    throw new RegularSeasonHttpError(
      409,
      'StageNotReady',
      `Stage status ${ctx.stage.status} cannot start simulation`,
    );
  }
  if (!ctx.stage.scheduleHash || !ctx.stage.scheduleSeed) {
    throw new RegularSeasonHttpError(409, 'StageNotReady', 'Schedule has not been generated');
  }

  const remaining = await listRemainingMatches(stageId);
  if (remaining.length === 0) {
    // Possibly already all done — try complete
    const progress = await getStageProgress(stageId);
    if (progress.remainingMatches === 0 && progress.completedMatches > 0) {
      await completeRegularSeasonStage(stageId);
      throw new RegularSeasonHttpError(
        409,
        'StageNotReady',
        'No remaining matches; stage completion attempted',
      );
    }
    throw new RegularSeasonHttpError(409, 'StageNotReady', 'No remaining matches to simulate');
  }

  const existing = getActiveStageRun(stageId);
  if (existing && (existing.status === 'QUEUED' || existing.status === 'RUNNING')) {
    throw new RegularSeasonHttpError(
      409,
      'StageSimulationAlreadyRunning',
      'A simulation run is already active for this stage',
    );
  }

  // Backup only before the first match of the stage is simulated
  const anyCompleted = await prisma.match.count({
    where: {
      competitionStageId: stageId,
      source: 'COMPETITION',
      status: 'COMPLETED',
    },
  });

  let backupMeta: StageRunRecord['backup'] = null;
  if (anyCompleted === 0) {
    try {
      const backup = await createSqliteSafetyBackup({ label: `stage-${stageId.slice(0, 8)}`, sourceOperationType: 'REGULAR_SEASON_SIMULATION', sourceOperationId: stageId });
      backupMeta = {
        relativeDisplayPath: backup.relativeDisplayPath,
        createdAt: backup.createdAt,
        bytes: backup.bytes,
      };
    } catch (err) {
      throw new RegularSeasonHttpError(
        503,
        'BackupFailed',
        err instanceof Error ? err.message : 'Pre-run backup failed',
      );
    }
  }

  const run = createStageRun({
    stageId,
    baseSeed: opts.baseSeed,
    total: remaining.length,
  });
  run.backup = backupMeta;

  // Fire-and-forget async execution
  void executeStageRun(run.id).catch(() => {
    /* errors recorded on run */
  });

  return run;
}

async function executeStageRun(runId: string): Promise<void> {
  const run = getStageRun(runId);
  if (!run) return;

  run.status = 'RUNNING';
  run.startedAt = Date.now();

  try {
    const ctx = await loadRegularSeasonStageContext(run.stageId);
    if (ctx.stage.status === 'SCHEDULED') {
      await prisma.competitionStage.update({
        where: { id: run.stageId },
        data: {
          status: 'IN_PROGRESS',
          simulationStartedAt: ctx.stage.simulationStartedAt ?? new Date(),
          scheduleStatus: 'LOCKED',
        },
      });
    } else if (!ctx.stage.simulationStartedAt) {
      await prisma.competitionStage.update({
        where: { id: run.stageId },
        data: {
          simulationStartedAt: new Date(),
          scheduleStatus: 'LOCKED',
        },
      });
    }

    const remaining = await listRemainingMatches(run.stageId);
    run.progress.total = remaining.length;

    for (const match of remaining) {
      if (run.cancelRequested) {
        run.status = 'CANCELLED';
        run.completedAt = Date.now();
        run.isPartialOfficial = run.progress.completed > 0;
        run.progress.currentMatchId = null;
        return;
      }

      run.progress.currentMatchId = match.id;
      run.progress.currentScheduleOrder = match.scheduleOrder;

      const seed = deriveMatchSimulationSeed(
        run.baseSeed,
        ctx.stage.scheduleHash!,
        match.scheduleOrder ?? 0,
      );

      await simulateMatch(match.id, seed);
      run.progress.completed += 1;
      await yieldEventLoop();
    }

    run.progress.currentMatchId = null;
    await completeRegularSeasonStage(run.stageId);
    run.status = 'COMPLETED';
    run.completedAt = Date.now();
  } catch (err) {
    run.status = 'FAILED';
    run.completedAt = Date.now();
    run.isPartialOfficial = run.progress.completed > 0;
    run.error = {
      code: err instanceof RegularSeasonHttpError ? err.code : 'StageSimulationFailed',
      message: err instanceof Error ? err.message : 'Stage simulation failed',
    };
  }
}

export function getRegularSeasonSimulationRun(stageId: string, runId: string) {
  const run = getStageRun(runId);
  if (!run || run.stageId !== stageId) {
    throw new RegularSeasonHttpError(404, 'CompetitionStageNotFound', 'Simulation run not found');
  }
  return serializeRun(run);
}

export function cancelRegularSeasonSimulation(stageId: string, runId: string) {
  const run = getStageRun(runId);
  if (!run || run.stageId !== stageId) {
    throw new RegularSeasonHttpError(404, 'CompetitionStageNotFound', 'Simulation run not found');
  }
  requestCancelStageRun(runId);
  return serializeRun(run);
}

export function serializeRun(run: StageRunRecord) {
  return {
    id: run.id,
    stageId: run.stageId,
    status: run.status,
    createdAt: new Date(run.createdAt).toISOString(),
    startedAt: run.startedAt ? new Date(run.startedAt).toISOString() : null,
    completedAt: run.completedAt ? new Date(run.completedAt).toISOString() : null,
    progress: run.progress,
    baseSeed: run.baseSeed,
    mode: run.mode,
    backup: run.backup,
    error: run.error,
    isPartialOfficial: run.isPartialOfficial,
    cancelRequested: run.cancelRequested,
    note:
      'Cancellation stops future matches only. Already completed MatchResults remain official competition history.',
  };
}
