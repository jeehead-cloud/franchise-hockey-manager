import type { LabAnomaly, LabAggregate, LabComparisonResult, LabGameSummary } from './types.js';

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`).join(',')}}`;
}

/** Pure deterministic 64-hex digest (FNV-1a 64-bit × 4 lanes). Browser-safe — no node:crypto. */
export function stableDigest(text: string): string {
  const lanes = [0xcbf29ce484222325n, 0x100000001b3n, 0x84222325cbf29ce4n, 0x1b3n << 32n];
  const primes = [0x100000001b3n, 0x100000001b3n, 0xcbf29ce484222325n, 0x100000001b3n];
  for (let i = 0; i < text.length; i += 1) {
    const c = BigInt(text.charCodeAt(i));
    for (let lane = 0; lane < 4; lane += 1) {
      lanes[lane] = BigInt.asUintN(64, (lanes[lane]! ^ (c + BigInt(lane))) * primes[lane]!);
    }
  }
  return lanes.map((n) => n.toString(16).padStart(16, '0')).join('');
}

/** Deterministic batch hash — excludes wall-clock timestamps and run IDs. */
export function computeBatchHash(payload: {
  baseSeed: string;
  simulationCount: number;
  sideMode: string;
  engineVersion: string;
  baselineBalanceHash: string;
  comparisonBalanceHash: string | null;
  aggregate: LabAggregate;
  anomalies: LabAnomaly[];
  comparison: LabComparisonResult | null;
  gameSummaries: LabGameSummary[] | null;
}): string {
  const normalized = {
    baseSeed: payload.baseSeed,
    simulationCount: payload.simulationCount,
    sideMode: payload.sideMode,
    engineVersion: payload.engineVersion,
    baselineBalanceHash: payload.baselineBalanceHash,
    comparisonBalanceHash: payload.comparisonBalanceHash,
    aggregate: payload.aggregate,
    anomalies: payload.anomalies.map((a) => ({
      code: a.code,
      severity: a.severity,
      metric: a.metric,
      observedValue: a.observedValue,
    })),
    comparisonDeltas: payload.comparison?.deltas ?? null,
    pairedOutcomeChanges: payload.comparison?.pairedOutcomeChanges ?? null,
    gameSummaries: payload.gameSummaries
      ? payload.gameSummaries.map((g) => ({
          gameIndex: g.gameIndex,
          seed: g.seed,
          winner: g.winner,
          decisionType: g.decisionType,
          teamAScore: g.teamAScore,
          teamBScore: g.teamBScore,
          traceHash: g.traceHash,
          teamAWasHome: g.teamAWasHome,
        }))
      : null,
  };
  return stableDigest(stableStringify(normalized));
}
