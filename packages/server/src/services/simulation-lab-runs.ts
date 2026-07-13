import { createHash, randomUUID } from 'node:crypto';
import {
  canonicalizeSimulationInput,
  compareLabAggregates,
  computeBatchHash,
  deriveGameSeed,
  detectLabAnomalies,
  F14_SIMULATION_MODE,
  FHM_ENGINE_VERSION,
  reduceGameSummaries,
  resolveSideOrientation,
  runLabBatch,
  simulateCompleteMatch,
  toLabGameSummary,
  enrichPlayerNames,
  type BalanceConfig,
  type LabBatchResult,
  type LabGameSummary,
  type LabSideMode,
  type LabSimulationCount,
  type SimulationInput,
} from '@fhm/engine';
import { SIMULATION_LAB_LIMITS } from './simulation-lab-config.js';
import { buildSimulationInput, SimulationHttpError } from './simulation-input.js';

export type LabRunStatus = 'QUEUED' | 'RUNNING' | 'COMPLETED' | 'FAILED' | 'CANCELLED';

export interface LabRunBalanceMeta {
  versionId: string;
  versionNumber: number;
  configHash: string;
  presetName: string;
}

export interface LabRunRecord {
  id: string;
  status: LabRunStatus;
  createdAt: number;
  startedAt: number | null;
  completedAt: number | null;
  cancelRequested: boolean;
  progress: { completed: number; total: number };
  request: {
    teamAId: string;
    teamBId: string;
    baseSeed: string;
    simulationCount: LabSimulationCount;
    sideMode: LabSideMode;
    baselineBalanceVersionId: string;
    comparisonBalanceVersionId: string | null;
    includeGameSummaries: boolean;
    includePlayerAggregates: boolean;
    includeLineAggregates: boolean;
    simulationRandomness: number | null;
  };
  baselineBalance: LabRunBalanceMeta;
  comparisonBalance: LabRunBalanceMeta | null;
  result: LabBatchResult | null;
  error: { code: string; message: string } | null;
  isPartial: boolean;
}

export interface CreateLabRunParams {
  teamAId: string;
  teamBId: string;
  baseSeed: string;
  simulationCount: LabSimulationCount;
  sideMode: LabSideMode;
  baselineBalanceVersionId: string;
  baselineBalance: LabRunBalanceMeta;
  baselineConfig: BalanceConfig;
  comparisonBalanceVersionId: string | null;
  comparisonBalance: LabRunBalanceMeta | null;
  comparisonConfig: BalanceConfig | null;
  includeGameSummaries: boolean;
  includePlayerAggregates: boolean;
  includeLineAggregates: boolean;
  simulationRandomness: number | null;
}

const runs = new Map<string, LabRunRecord>();

function yieldEventLoop(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve));
}

function cleanupExpiredRuns(now = Date.now()): void {
  const { retentionMs, maxRetained } = SIMULATION_LAB_LIMITS;
  for (const [id, run] of runs) {
    if (now - run.createdAt > retentionMs) {
      runs.delete(id);
    }
  }
  if (runs.size <= maxRetained) return;
  const ordered = [...runs.values()].sort((a, b) => a.createdAt - b.createdAt);
  const overflow = ordered.length - maxRetained;
  for (let i = 0; i < overflow; i += 1) {
    const run = ordered[i];
    if (run.status === 'QUEUED' || run.status === 'RUNNING') continue;
    runs.delete(run.id);
  }
}

function countActiveRuns(): number {
  let n = 0;
  for (const run of runs.values()) {
    if (run.status === 'QUEUED' || run.status === 'RUNNING') n += 1;
  }
  return n;
}

function applyRandomnessOverride(config: BalanceConfig, simulationRandomness: number | null): BalanceConfig {
  if (simulationRandomness == null) return config;
  return {
    ...config,
    randomness: {
      ...config.randomness,
      simulationRandomness,
    },
  };
}

function recomputeFingerprint(draft: Omit<SimulationInput, 'inputFingerprint'>): SimulationInput {
  const fingerprint = createHash('sha256')
    .update(canonicalizeSimulationInput({ ...draft, inputFingerprint: 'placeholder' }), 'utf8')
    .digest('hex');
  return { ...draft, inputFingerprint: fingerprint };
}

function cloneInputWithSeed(template: SimulationInput, seed: string, matchId: string): SimulationInput {
  const { inputFingerprint: _fp, ...rest } = template;
  return recomputeFingerprint({
    ...structuredClone(rest),
    seed,
    matchId,
  });
}

async function buildOrientationTemplates(opts: {
  teamAId: string;
  teamBId: string;
  balanceVersionId: string;
  config: BalanceConfig;
  simulationRandomness: number | null;
}): Promise<{ aHome: SimulationInput; bHome: SimulationInput }> {
  const balanceConfig = applyRandomnessOverride(opts.config, opts.simulationRandomness);
  const common = {
    forPlayableMatch: true as const,
    balanceVersionId: opts.balanceVersionId,
    balanceConfig,
    completionRules: {
      overtimeEnabled: false,
      shootoutEnabled: false,
      tiesAllowed: true,
    },
  };
  const [aHome, bHome] = await Promise.all([
    buildSimulationInput({
      ...common,
      homeTeamId: opts.teamAId,
      awayTeamId: opts.teamBId,
      seed: 'lab-template-a-home',
      matchId: `lab-template-${opts.teamAId}-${opts.teamBId}`,
    }),
    buildSimulationInput({
      ...common,
      homeTeamId: opts.teamBId,
      awayTeamId: opts.teamAId,
      seed: 'lab-template-b-home',
      matchId: `lab-template-${opts.teamBId}-${opts.teamAId}`,
    }),
  ]);
  return { aHome, bHome };
}

type OrientationTemplates = { aHome: SimulationInput; bHome: SimulationInput };

/**
 * Async lab batch execution.
 * Small batches call engine `runLabBatch` directly.
 * Larger batches mirror that path in chunks with setImmediate yields so cancel can interrupt.
 */
async function runLabBatchChunked(opts: {
  baseSeed: string;
  simulationCount: LabSimulationCount;
  sideMode: LabSideMode;
  teamAId: string;
  teamBId: string;
  baselineTemplates: OrientationTemplates;
  comparisonTemplates: OrientationTemplates | null;
  baselineBalanceMeta: LabRunBalanceMeta;
  comparisonBalanceMeta: LabRunBalanceMeta | null;
  includeGameSummaries: boolean;
  includePlayerAggregates: boolean;
  includeLineAggregates: boolean;
  shouldCancel: () => boolean;
  onProgress: (completed: number, total: number) => void;
  runId: string;
}): Promise<{ result: LabBatchResult; cancelled: boolean }> {
  const chunkSize = SIMULATION_LAB_LIMITS.chunkSize;
  const progressTotal =
    opts.comparisonBalanceMeta && opts.comparisonTemplates
      ? opts.simulationCount * 2
      : opts.simulationCount;

  const buildInput = ({
    seed,
    homeTeamId,
    awayTeamId,
    balance,
  }: {
    seed: string;
    homeTeamId: string;
    awayTeamId: string;
    balance: 'baseline' | 'comparison';
  }): SimulationInput => {
    const templates =
      balance === 'comparison' && opts.comparisonTemplates
        ? opts.comparisonTemplates
        : opts.baselineTemplates;
    const template = homeTeamId === opts.teamAId ? templates.aHome : templates.bHome;
    if (template.homeTeam.teamId !== homeTeamId || template.awayTeam.teamId !== awayTeamId) {
      throw new Error('Lab orientation template mismatch');
    }
    return cloneInputWithSeed(template, seed, `lab-${opts.runId}-${seed}`);
  };

  // Prefer the engine entrypoint when the whole batch fits in one chunk (no mid-run yield needed).
  if (opts.simulationCount <= chunkSize && !opts.shouldCancel()) {
    await yieldEventLoop();
    if (opts.shouldCancel()) {
      return {
        cancelled: true,
        result: {
          metadata: {
            engineVersion: FHM_ENGINE_VERSION,
            simulationMode: F14_SIMULATION_MODE,
            baseSeed: opts.baseSeed,
            simulationCount: opts.simulationCount,
            completedGames: 0,
            sideMode: opts.sideMode,
            isPartial: true,
            baselineBalance: opts.baselineBalanceMeta,
            comparisonBalance: opts.comparisonBalanceMeta ?? null,
          },
          aggregate: reduceGameSummaries([]),
          comparison: null,
          anomalies: [],
          gameSummaries: opts.includeGameSummaries ? [] : null,
          batchHash: '',
        },
      };
    }
    const output = runLabBatch({
      baseSeed: opts.baseSeed,
      simulationCount: opts.simulationCount,
      sideMode: opts.sideMode,
      teamAId: opts.teamAId,
      teamBId: opts.teamBId,
      baselineBalanceMeta: opts.baselineBalanceMeta,
      comparisonBalanceMeta: opts.comparisonBalanceMeta ?? undefined,
      comparisonEnabled: Boolean(opts.comparisonBalanceMeta),
      includeGameSummaries: opts.includeGameSummaries,
      includePlayerAggregates: opts.includePlayerAggregates,
      includeLineAggregates: opts.includeLineAggregates,
      shouldCancel: opts.shouldCancel,
      onProgress: opts.onProgress,
      buildInput,
      simulate: (input) => simulateCompleteMatch(input),
    });
    await yieldEventLoop();
    return output;
  }

  async function runSide(balance: 'baseline' | 'comparison'): Promise<{
    games: LabGameSummary[];
    failed: number;
    cancelled: boolean;
  }> {
    const games: LabGameSummary[] = [];
    let failed = 0;
    let cancelled = false;
    const progressOffset = balance === 'comparison' ? opts.simulationCount : 0;

    for (let i = 0; i < opts.simulationCount; i += 1) {
      if (opts.shouldCancel()) {
        cancelled = true;
        break;
      }

      const seed = deriveGameSeed(opts.baseSeed, i);
      const orientation = resolveSideOrientation(opts.sideMode, i, opts.teamAId, opts.teamBId);
      try {
        const input = buildInput({
          seed,
          homeTeamId: orientation.homeTeamId,
          awayTeamId: orientation.awayTeamId,
          balance,
        });
        const raw = simulateCompleteMatch(input);
        if (!raw.reconciliation.ok) failed += 1;
        let summary = toLabGameSummary({
          gameIndex: i,
          seed,
          teamAWasHome: orientation.teamAWasHome,
          teamAId: opts.teamAId,
          teamBId: opts.teamBId,
          inputForStrength: input,
          result: raw,
        });
        summary = {
          ...summary,
          playerContributions: enrichPlayerNames(summary.playerContributions, input),
        };
        games.push(summary);
      } catch {
        failed += 1;
      }

      opts.onProgress(progressOffset + i + 1, progressTotal);

      if ((i + 1) % chunkSize === 0) {
        await yieldEventLoop();
      }
    }

    return { games, failed, cancelled };
  }

  const baselineRun = await runSide('baseline');
  const baselineAgg = reduceGameSummaries(baselineRun.games, {
    includePlayerAggregates: opts.includePlayerAggregates,
    includeLineAggregates: opts.includeLineAggregates,
  });
  baselineAgg.failedGames = baselineRun.failed;

  let comparison: LabBatchResult['comparison'] = null;
  if (opts.comparisonBalanceMeta && opts.comparisonTemplates && !baselineRun.cancelled) {
    await yieldEventLoop();
    const comparisonRun = await runSide('comparison');
    const comparisonAgg = reduceGameSummaries(comparisonRun.games, {
      includePlayerAggregates: opts.includePlayerAggregates,
      includeLineAggregates: opts.includeLineAggregates,
    });
    comparisonAgg.failedGames = comparisonRun.failed;
    comparison = compareLabAggregates(baselineAgg, comparisonAgg, {
      baseline: baselineRun.games,
      comparison: comparisonRun.games,
    });
  }

  const anomalies = detectLabAnomalies(baselineAgg, {
    requestedCount: opts.simulationCount,
  });

  const gameSummaries = opts.includeGameSummaries ? baselineRun.games : null;
  const batchHash = computeBatchHash({
    baseSeed: opts.baseSeed,
    simulationCount: opts.simulationCount,
    sideMode: opts.sideMode,
    engineVersion: FHM_ENGINE_VERSION,
    baselineBalanceHash: opts.baselineBalanceMeta.configHash,
    comparisonBalanceHash: opts.comparisonBalanceMeta?.configHash ?? null,
    aggregate: baselineAgg,
    anomalies,
    comparison,
    gameSummaries,
  });

  return {
    cancelled: baselineRun.cancelled,
    result: {
      metadata: {
        engineVersion: FHM_ENGINE_VERSION,
        simulationMode: F14_SIMULATION_MODE,
        baseSeed: opts.baseSeed,
        simulationCount: opts.simulationCount,
        completedGames: baselineRun.games.length,
        sideMode: opts.sideMode,
        isPartial: baselineRun.cancelled,
        baselineBalance: opts.baselineBalanceMeta,
        comparisonBalance: opts.comparisonBalanceMeta ?? null,
      },
      aggregate: baselineAgg,
      comparison,
      anomalies,
      gameSummaries,
      batchHash,
    },
  };
}

async function executeRun(runId: string, params: CreateLabRunParams): Promise<void> {
  const run = runs.get(runId);
  if (!run) return;

  run.status = 'RUNNING';
  run.startedAt = Date.now();
  await yieldEventLoop();

  try {
    if (run.cancelRequested) {
      run.status = 'CANCELLED';
      run.completedAt = Date.now();
      run.isPartial = true;
      return;
    }

    const baselineTemplates = await buildOrientationTemplates({
      teamAId: params.teamAId,
      teamBId: params.teamBId,
      balanceVersionId: params.baselineBalanceVersionId,
      config: params.baselineConfig,
      simulationRandomness: params.simulationRandomness,
    });

    let comparisonTemplates: OrientationTemplates | null = null;
    if (params.comparisonBalanceVersionId && params.comparisonConfig && params.comparisonBalance) {
      await yieldEventLoop();
      comparisonTemplates = await buildOrientationTemplates({
        teamAId: params.teamAId,
        teamBId: params.teamBId,
        balanceVersionId: params.comparisonBalanceVersionId,
        config: params.comparisonConfig,
        simulationRandomness: params.simulationRandomness,
      });
    }

    await yieldEventLoop();
    if (run.cancelRequested) {
      run.status = 'CANCELLED';
      run.completedAt = Date.now();
      run.isPartial = true;
      return;
    }

    const output = await runLabBatchChunked({
      baseSeed: params.baseSeed,
      simulationCount: params.simulationCount,
      sideMode: params.sideMode,
      teamAId: params.teamAId,
      teamBId: params.teamBId,
      baselineTemplates,
      comparisonTemplates,
      baselineBalanceMeta: params.baselineBalance,
      comparisonBalanceMeta: params.comparisonBalance,
      includeGameSummaries: params.includeGameSummaries,
      includePlayerAggregates: params.includePlayerAggregates,
      includeLineAggregates: params.includeLineAggregates,
      shouldCancel: () => Boolean(runs.get(runId)?.cancelRequested),
      onProgress: (completed, total) => {
        const current = runs.get(runId);
        if (current) current.progress = { completed, total };
      },
      runId,
    });

    const current = runs.get(runId);
    if (!current) return;

    if (output.cancelled || current.cancelRequested) {
      current.status = 'CANCELLED';
      current.result = output.result;
      current.isPartial = true;
      current.completedAt = Date.now();
      current.progress = {
        completed: output.result.metadata.completedGames,
        total: current.progress.total,
      };
      return;
    }

    current.status = 'COMPLETED';
    current.result = output.result;
    current.isPartial = output.result.metadata.isPartial;
    current.completedAt = Date.now();
    current.progress = {
      completed: output.result.metadata.completedGames,
      total: params.simulationCount,
    };
  } catch (err) {
    const current = runs.get(runId);
    if (!current) return;
    current.status = 'FAILED';
    current.completedAt = Date.now();
    if (err instanceof SimulationHttpError) {
      current.error = { code: err.code, message: err.message };
    } else {
      current.error = {
        code: 'SimulationFailed',
        message: err instanceof Error ? err.message : 'Lab run failed',
      };
    }
  } finally {
    cleanupExpiredRuns();
  }
}

export function createRun(params: CreateLabRunParams): LabRunRecord {
  cleanupExpiredRuns();
  if (countActiveRuns() >= SIMULATION_LAB_LIMITS.maxConcurrent) {
    throw new SimulationHttpError(
      409,
      'SimulationLabCapacityExceeded',
      `At most ${SIMULATION_LAB_LIMITS.maxConcurrent} concurrent Simulation Lab runs are allowed`,
    );
  }

  const id = randomUUID();
  const total =
    params.comparisonBalance != null ? params.simulationCount * 2 : params.simulationCount;

  const record: LabRunRecord = {
    id,
    status: 'QUEUED',
    createdAt: Date.now(),
    startedAt: null,
    completedAt: null,
    cancelRequested: false,
    progress: { completed: 0, total },
    request: {
      teamAId: params.teamAId,
      teamBId: params.teamBId,
      baseSeed: params.baseSeed,
      simulationCount: params.simulationCount,
      sideMode: params.sideMode,
      baselineBalanceVersionId: params.baselineBalanceVersionId,
      comparisonBalanceVersionId: params.comparisonBalanceVersionId,
      includeGameSummaries: params.includeGameSummaries,
      includePlayerAggregates: params.includePlayerAggregates,
      includeLineAggregates: params.includeLineAggregates,
      simulationRandomness: params.simulationRandomness,
    },
    baselineBalance: params.baselineBalance,
    comparisonBalance: params.comparisonBalance,
    result: null,
    error: null,
    isPartial: false,
  };

  runs.set(id, record);
  setImmediate(() => {
    void executeRun(id, params);
  });
  return record;
}

export function getRun(runId: string): LabRunRecord | null {
  cleanupExpiredRuns();
  return runs.get(runId) ?? null;
}

export function cancelRun(runId: string): LabRunRecord {
  cleanupExpiredRuns();
  const run = runs.get(runId);
  if (!run) {
    throw new SimulationHttpError(404, 'SimulationLabRunNotFound', 'Simulation Lab run not found', {
      runId,
    });
  }
  if (run.status === 'COMPLETED' || run.status === 'FAILED' || run.status === 'CANCELLED') {
    return run;
  }
  run.cancelRequested = true;
  if (run.status === 'QUEUED') {
    run.status = 'CANCELLED';
    run.completedAt = Date.now();
    run.isPartial = true;
  }
  return run;
}

/** Test helper — clears in-memory registry. */
export function resetLabRunsForTests(): void {
  runs.clear();
}
