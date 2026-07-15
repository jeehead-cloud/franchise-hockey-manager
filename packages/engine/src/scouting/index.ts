/** F26 — pure deterministic scouting. */
export { SCOUTING_SCHEMA_VERSION } from './types.js';
export type * from './types.js';
export { defaultScoutingConfig, validateScoutingConfig, ScoutingConfigError } from './config.js';
export { scoutSkill, positionGroup, clamp01 } from './scout-skill.js';
export { observationConfidence, consolidatedConfidence } from './confidence.js';
export { createScoutingObservation } from './observation.js';
export { consolidateScoutingObservations } from './consolidation.js';
export { suggestScoutingRanking } from './ranking.js';
export { assessScoutingStaleness } from './staleness.js';
export { stableScoutingHash, hashPlayerState, hashObservation, hashReport } from './hashing.js';
export { reconcileScouting, assertScoutingReconciliation } from './reconciliation.js';
