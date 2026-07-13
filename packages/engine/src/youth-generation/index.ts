/** F25 — Deterministic annual youth generation (pure engine). */

export { YOUTH_GENERATION_SCHEMA_VERSION, YouthGenerationError } from './types.js';
export type * from './types.js';

export {
  buildDefaultCountryYouthProfile,
  validateCountryYouthProfile,
  canonicalizeCountryYouthProfile,
} from './config.js';

export {
  seededUnit,
  seededNormal,
  seededBoundedNormal,
  seededBoundedInt,
  pickWeightedKey,
} from './distributions.js';

export {
  validateAndNormalizeNamePool,
  normalizeNameToken,
  hashNamePool,
  pickNamePair,
} from './names.js';
export type { NormalizedNamePool } from './names.js';

export { generateBirthDate, pickAge } from './ages.js';
export type { YouthAge } from './ages.js';

export { pickPosition, pickHandedness } from './positions.js';
export { generatePhysical } from './physical.js';
export {
  pickQualityTier,
  generatePotentialCeiling,
  generateAbilityTarget,
  generateDevelopmentRate,
} from './quality.js';
export {
  generateSkaterAttributes,
  generateGoalieAttributes,
  reconcileAttributesToAbilityBand,
  generateProfileExtras,
} from './attributes.js';

export {
  planCohortSize,
  generateYouthPlayer,
  generateYouthCohort,
  generateYouthRun,
} from './cohort.js';

export {
  hashCountryYouthProfile,
  hashYouthNamePool,
  hashGeneratedYouthPlayer,
  hashYouthCohort,
  hashYouthGenerationInput,
  hashYouthGenerationResult,
} from './hashing.js';

export {
  reconcileYouthGeneration,
  assertYouthReconciliation,
} from './reconciliation.js';
export type { YouthReconciliationIssue } from './reconciliation.js';

export { evaluateYouthGenerationReadiness } from './readiness.js';
export type {
  YouthReadinessStatus,
  YouthReadinessCheck,
  YouthReadinessResult,
} from './readiness.js';
