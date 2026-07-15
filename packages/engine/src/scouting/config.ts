import type { ScoutingConfig } from './types.js';
import { SCOUTING_SCHEMA_VERSION } from './types.js';

export class ScoutingConfigError extends Error {}

export function defaultScoutingConfig(): ScoutingConfig {
  return {
    schemaVersion: SCOUTING_SCHEMA_VERSION,
    observation: {
      minDurationDays: 1,
      maxDurationDays: 90,
      maximumPlayersPerAssignment: 50,
      maximumObservationsPerScoutPlayerState: 3,
      baseNoise: 4.5,
      unknownConfidence: 0.12,
      potentialUncertaintyMultiplier: 1.7,
    },
    confidence: { durationCapDays: 30, repeatDiminishing: 0.62, diversityBonus: 0.08 },
    reporting: { strengthThreshold: 12, weaknessThreshold: 8, maxHighlights: 3 },
  };
}

function finite(value: unknown, label: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new ScoutingConfigError(`${label} must be finite`);
  return value;
}
function onlyKeys(value: Record<string, unknown>, keys: readonly string[], label: string): void {
  if (Object.keys(value).some((key) => !keys.includes(key))) throw new ScoutingConfigError(`Unknown ${label} field`);
}

/** Strictly parse versioned, fictional scouting calibration. */
export function validateScoutingConfig(raw: unknown): ScoutingConfig {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new ScoutingConfigError('Config must be an object');
  const config = raw as Record<string, unknown>;
  const allowed = ['schemaVersion', 'observation', 'confidence', 'reporting'];
  if (Object.keys(config).some((key) => !allowed.includes(key))) throw new ScoutingConfigError('Unknown config field');
  if (config.schemaVersion !== SCOUTING_SCHEMA_VERSION) throw new ScoutingConfigError('Unsupported schemaVersion');
  const observation = config.observation as Record<string, unknown>;
  const confidence = config.confidence as Record<string, unknown>;
  const reporting = config.reporting as Record<string, unknown>;
  if (!observation || !confidence || !reporting) throw new ScoutingConfigError('Missing config section');
  onlyKeys(observation, ['minDurationDays', 'maxDurationDays', 'maximumPlayersPerAssignment', 'maximumObservationsPerScoutPlayerState', 'baseNoise', 'unknownConfidence', 'potentialUncertaintyMultiplier'], 'observation');
  onlyKeys(confidence, ['durationCapDays', 'repeatDiminishing', 'diversityBonus'], 'confidence');
  onlyKeys(reporting, ['strengthThreshold', 'weaknessThreshold', 'maxHighlights'], 'reporting');
  const result: ScoutingConfig = {
    schemaVersion: SCOUTING_SCHEMA_VERSION,
    observation: {
      minDurationDays: finite(observation.minDurationDays, 'minDurationDays'),
      maxDurationDays: finite(observation.maxDurationDays, 'maxDurationDays'),
      maximumPlayersPerAssignment: finite(observation.maximumPlayersPerAssignment, 'maximumPlayersPerAssignment'),
      maximumObservationsPerScoutPlayerState: finite(observation.maximumObservationsPerScoutPlayerState, 'maximumObservationsPerScoutPlayerState'),
      baseNoise: finite(observation.baseNoise, 'baseNoise'),
      unknownConfidence: finite(observation.unknownConfidence, 'unknownConfidence'),
      potentialUncertaintyMultiplier: finite(observation.potentialUncertaintyMultiplier, 'potentialUncertaintyMultiplier'),
    },
    confidence: {
      durationCapDays: finite(confidence.durationCapDays, 'durationCapDays'),
      repeatDiminishing: finite(confidence.repeatDiminishing, 'repeatDiminishing'),
      diversityBonus: finite(confidence.diversityBonus, 'diversityBonus'),
    },
    reporting: {
      strengthThreshold: finite(reporting.strengthThreshold, 'strengthThreshold'),
      weaknessThreshold: finite(reporting.weaknessThreshold, 'weaknessThreshold'),
      maxHighlights: finite(reporting.maxHighlights, 'maxHighlights'),
    },
  };
  if (
    result.observation.minDurationDays < 1 ||
    result.observation.maxDurationDays < result.observation.minDurationDays ||
    !Number.isInteger(result.observation.maximumPlayersPerAssignment) ||
    result.observation.maximumPlayersPerAssignment < 1 ||
    !Number.isInteger(result.observation.maximumObservationsPerScoutPlayerState) ||
    result.observation.maximumObservationsPerScoutPlayerState < 1 ||
    result.observation.baseNoise < 0 ||
    result.observation.unknownConfidence < 0 ||
    result.observation.unknownConfidence > 1 ||
    result.confidence.durationCapDays <= 0 ||
    result.confidence.repeatDiminishing <= 0 ||
    result.confidence.repeatDiminishing > 1 ||
    result.confidence.diversityBonus < 0 ||
    result.reporting.maxHighlights < 1
  ) throw new ScoutingConfigError('Invalid scouting calibration bounds');
  return result;
}
