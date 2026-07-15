import type { PlayerTruth, ScoutingObservation, ScoutingReconciliationResult, ScoutingReport } from './types.js';
import { hashObservation, hashPlayerState, hashReport } from './hashing.js';

const bounded = (value: number) => Number.isFinite(value) && value >= 0 && value <= 1;
function validEstimate(estimate: { estimate: number | null; low: number | null; high: number | null; confidence: number }): boolean {
  return bounded(estimate.confidence) && (estimate.estimate === null || (estimate.low !== null && estimate.high !== null && estimate.low <= estimate.estimate && estimate.estimate <= estimate.high));
}
export function reconcileScouting(
  truthsBefore: readonly PlayerTruth[],
  truthsAfter: readonly PlayerTruth[],
  observations: readonly ScoutingObservation[],
  reports: readonly ScoutingReport[],
): ScoutingReconciliationResult {
  const issues: ScoutingReconciliationResult['issues'] = [];
  const after = new Map(truthsAfter.map((truth) => [truth.playerId, truth]));
  for (const truth of truthsBefore) if (!after.has(truth.playerId) || hashPlayerState(truth) !== hashPlayerState(after.get(truth.playerId)!)) issues.push({ code: 'TruthMutated', message: `Truth changed for ${truth.playerId}` });
  for (const observation of observations) {
    const { observationId, ...body } = observation;
    if (hashObservation(body) !== observationId || !bounded(observation.confidence)) issues.push({ code: 'InvalidObservation', message: `Invalid observation ${observationId}` });
    for (const estimate of [...Object.values(observation.attributes), observation.currentAbility, observation.potential]) {
      if (!validEstimate(estimate)) issues.push({ code: 'InvalidRange', message: `Invalid observation range ${observationId}` });
    }
  }
  for (const report of reports) {
    const { reportHash, ...body } = report;
    if (hashReport(body) !== reportHash || !bounded(report.confidence) || !validEstimate(report.currentAbility) || !validEstimate(report.potential) || Object.values(report.attributes).some((estimate) => !validEstimate(estimate))) issues.push({ code: 'InvalidReport', message: `Invalid report ${report.playerId}` });
  }
  return { valid: issues.length === 0, issues };
}

export function assertScoutingReconciliation(result: ScoutingReconciliationResult): void {
  if (!result.valid) throw new Error(result.issues.map((issue) => issue.message).join('; '));
}
