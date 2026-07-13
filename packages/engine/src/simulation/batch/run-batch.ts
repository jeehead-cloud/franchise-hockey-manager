import { F14_SIMULATION_MODE, FHM_ENGINE_VERSION } from '../match/constants.js';
import type { FinalMatchResult, SimulationInput, SimulationResult } from '../match/types.js';
import { reduceGameSummaries } from './aggregate.js';
import { detectLabAnomalies } from './anomalies.js';
import { compareLabAggregates } from './comparison.js';
import { computeBatchHash } from './hash.js';
import { deriveGameSeed, resolveSideOrientation } from './seeds.js';
import { enrichPlayerNames, toLabGameSummary } from './summarize.js';
import type {
  LabBatchResult,
  LabGameSummary,
  LabSideMode,
  LabSimulationCount,
} from './types.js';

type CompleteOutput = SimulationResult & { finalResult: FinalMatchResult };

export interface LabBatchRunOptions {
  baseSeed: string;
  simulationCount: LabSimulationCount;
  sideMode: LabSideMode;
  teamAId: string;
  teamBId: string;
  buildInput: (args: {
    seed: string;
    homeTeamId: string;
    awayTeamId: string;
    balance: 'baseline' | 'comparison';
  }) => SimulationInput;
  simulate: (input: SimulationInput) => CompleteOutput;
  includeGameSummaries?: boolean;
  includePlayerAggregates?: boolean;
  includeLineAggregates?: boolean;
  comparisonEnabled?: boolean;
  baselineBalanceMeta: LabBatchResult['metadata']['baselineBalance'];
  comparisonBalanceMeta?: LabBatchResult['metadata']['comparisonBalance'];
  shouldCancel?: () => boolean;
  onProgress?: (completed: number, total: number) => void;
}

export interface LabBatchRunOutput {
  result: LabBatchResult;
  cancelled: boolean;
}

function runSide(
  opts: LabBatchRunOptions,
  balance: 'baseline' | 'comparison',
): { games: LabGameSummary[]; failed: number; cancelled: boolean } {
  const games: LabGameSummary[] = [];
  let failed = 0;
  let cancelled = false;

  for (let i = 0; i < opts.simulationCount; i += 1) {
    if (opts.shouldCancel?.()) {
      cancelled = true;
      break;
    }
    const seed = deriveGameSeed(opts.baseSeed, i);
    const orientation = resolveSideOrientation(opts.sideMode, i, opts.teamAId, opts.teamBId);
    try {
      const input = opts.buildInput({
        seed,
        homeTeamId: orientation.homeTeamId,
        awayTeamId: orientation.awayTeamId,
        balance,
      });
      const raw = opts.simulate(input);
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
    opts.onProgress?.(i + 1, opts.simulationCount);
  }

  return { games, failed, cancelled };
}

export function runLabBatch(opts: LabBatchRunOptions): LabBatchRunOutput {
  const includeSummaries = opts.includeGameSummaries ?? opts.simulationCount <= 100;
  const baselineRun = runSide(opts, 'baseline');
  const baselineAgg = reduceGameSummaries(baselineRun.games, {
    includePlayerAggregates: opts.includePlayerAggregates ?? true,
    includeLineAggregates: opts.includeLineAggregates ?? true,
  });
  baselineAgg.failedGames = baselineRun.failed;

  let comparison: LabBatchResult['comparison'] = null;
  let comparisonGames: LabGameSummary[] | null = null;
  if (opts.comparisonEnabled && opts.comparisonBalanceMeta && !baselineRun.cancelled) {
    const comparisonRun = runSide(opts, 'comparison');
    comparisonGames = comparisonRun.games;
    const comparisonAgg = reduceGameSummaries(comparisonRun.games, {
      includePlayerAggregates: opts.includePlayerAggregates ?? true,
      includeLineAggregates: opts.includeLineAggregates ?? true,
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

  const gameSummaries = includeSummaries ? baselineRun.games : null;
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
