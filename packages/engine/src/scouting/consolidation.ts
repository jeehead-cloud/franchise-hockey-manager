import type { AttributeEstimate, ScoutingConfig, ScoutingObservation, ScoutingReport } from './types.js';
import { SCOUTING_SCHEMA_VERSION } from './types.js';
import { consolidatedConfidence } from './confidence.js';
import { hashReport } from './hashing.js';

function combine(estimates: AttributeEstimate[]): AttributeEstimate {
  const known = estimates.filter((entry) => entry.estimate !== null);
  const confidence = known.length ? known.reduce((sum, entry) => sum + entry.confidence, 0) / known.length : 0;
  if (!known.length) return { estimate: null, low: null, high: null, confidence };
  const total = known.reduce((sum, entry) => sum + entry.confidence, 0);
  const estimate = Math.round(known.reduce((sum, entry) => sum + entry.estimate! * entry.confidence, 0) / total);
  return {
    estimate,
    low: Math.min(...known.map((entry) => entry.low!)),
    high: Math.max(...known.map((entry) => entry.high!)),
    confidence,
  };
}

export function consolidateScoutingObservations(
  config: ScoutingConfig,
  observations: readonly ScoutingObservation[],
): ScoutingReport {
  if (!observations.length) throw new Error('At least one observation is required');
  const ordered = [...observations].sort((a, b) => a.observationId.localeCompare(b.observationId));
  const first = ordered[0]!;
  if (
    ordered.some(
      (item) =>
        item.playerId !== first.playerId ||
        item.playerKind !== first.playerKind ||
        item.teamId !== first.teamId ||
        item.sourcePlayerStateHash !== first.sourcePlayerStateHash,
    )
  ) {
    throw new Error('Observations must belong to one team, player, and player-state snapshot');
  }
  const keys = [...new Set(ordered.flatMap((item) => Object.keys(item.attributes)))].sort();
  const attributes = Object.fromEntries(keys.map((key) => [key, combine(ordered.map((item) => item.attributes[key]).filter(Boolean))]));
  const strengthEntries = Object.entries(attributes).filter(([, item]) => item.estimate !== null);
  const strengths = strengthEntries.filter(([, item]) => item.estimate! >= config.reporting.strengthThreshold).sort((a, b) => b[1].estimate! - a[1].estimate! || a[0].localeCompare(b[0])).slice(0, config.reporting.maxHighlights).map(([key]) => key);
  const weaknesses = strengthEntries.filter(([, item]) => item.estimate! <= config.reporting.weaknessThreshold).sort((a, b) => a[1].estimate! - b[1].estimate! || a[0].localeCompare(b[0])).slice(0, config.reporting.maxHighlights).map(([key]) => key);
  const base = {
    schemaVersion: SCOUTING_SCHEMA_VERSION, playerId: first.playerId, playerKind: first.playerKind, observations: ordered.length,
    attributes, currentAbility: combine(ordered.map((item) => item.currentAbility)), potential: combine(ordered.map((item) => item.potential)),
    confidence: consolidatedConfidence(ordered, config), strengths, weaknesses, sourcePlayerStateHash: first.sourcePlayerStateHash,
  } as const;
  return { ...base, reportHash: hashReport(base) };
}
