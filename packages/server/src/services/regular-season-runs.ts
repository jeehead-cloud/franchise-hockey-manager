import { randomUUID } from 'node:crypto';

export type StageRunStatus = 'QUEUED' | 'RUNNING' | 'COMPLETED' | 'FAILED' | 'CANCELLED';

export interface StageRunRecord {
  id: string;
  stageId: string;
  status: StageRunStatus;
  createdAt: number;
  startedAt: number | null;
  completedAt: number | null;
  cancelRequested: boolean;
  progress: {
    completed: number;
    total: number;
    currentMatchId: string | null;
    currentScheduleOrder: number | null;
  };
  baseSeed: string;
  mode: 'ALL_REMAINING';
  backup: {
    relativeDisplayPath: string;
    createdAt: string;
    bytes: number;
  } | null;
  error: { code: string; message: string } | null;
  /** Official results persist on cancel — this flag documents partial official progress. */
  isPartialOfficial: boolean;
}

const runs = new Map<string, StageRunRecord>();
const activeByStage = new Map<string, string>();

const RETENTION_MS = 60 * 60 * 1000;
const MAX_RETAINED = 40;

function cleanup(now = Date.now()) {
  for (const [id, run] of runs) {
    if (now - run.createdAt > RETENTION_MS) {
      runs.delete(id);
      if (activeByStage.get(run.stageId) === id) activeByStage.delete(run.stageId);
    }
  }
  if (runs.size <= MAX_RETAINED) return;
  const ordered = [...runs.values()].sort((a, b) => a.createdAt - b.createdAt);
  for (const run of ordered) {
    if (runs.size <= MAX_RETAINED) break;
    if (run.status === 'QUEUED' || run.status === 'RUNNING') continue;
    runs.delete(run.id);
    if (activeByStage.get(run.stageId) === run.id) activeByStage.delete(run.stageId);
  }
}

export function getActiveStageRun(stageId: string): StageRunRecord | null {
  const id = activeByStage.get(stageId);
  if (!id) return null;
  return runs.get(id) ?? null;
}

export function getStageRun(runId: string): StageRunRecord | null {
  return runs.get(runId) ?? null;
}

export function createStageRun(opts: {
  stageId: string;
  baseSeed: string;
  total: number;
}): StageRunRecord {
  cleanup();
  const existing = getActiveStageRun(opts.stageId);
  if (existing && (existing.status === 'QUEUED' || existing.status === 'RUNNING')) {
    throw Object.assign(new Error('A simulation run is already active for this stage'), {
      statusCode: 409,
      code: 'StageSimulationAlreadyRunning',
      name: 'StageSimulationAlreadyRunning',
    });
  }

  const run: StageRunRecord = {
    id: randomUUID(),
    stageId: opts.stageId,
    status: 'QUEUED',
    createdAt: Date.now(),
    startedAt: null,
    completedAt: null,
    cancelRequested: false,
    progress: {
      completed: 0,
      total: opts.total,
      currentMatchId: null,
      currentScheduleOrder: null,
    },
    baseSeed: opts.baseSeed,
    mode: 'ALL_REMAINING',
    backup: null,
    error: null,
    isPartialOfficial: false,
  };
  runs.set(run.id, run);
  activeByStage.set(opts.stageId, run.id);
  return run;
}

export function requestCancelStageRun(runId: string): StageRunRecord | null {
  const run = runs.get(runId);
  if (!run) return null;
  if (run.status === 'QUEUED' || run.status === 'RUNNING') {
    run.cancelRequested = true;
  }
  return run;
}

export function yieldEventLoop(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve));
}
