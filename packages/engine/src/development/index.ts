/** F24 — Deterministic annual player development (pure engine). */

export { PLAYER_DEVELOPMENT_SCHEMA_VERSION, PlayerDevelopmentError } from './types.js';
export type * from './types.js';

export {
  getDefaultPlayerDevelopmentConfig,
  validatePlayerDevelopmentConfig,
  canonicalizePlayerDevelopmentConfig,
} from './config.js';

export { ageOnEffectiveDate, classifyAgeBand } from './age.js';
export type { AgeBand } from './age.js';

export { calculateDevelopmentBudget, seededUnit, seededSigned } from './budget.js';
export { allocateAttributeBudget } from './allocation.js';
export { developSkaterAttributes } from './skater.js';
export { developGoalieAttributes } from './goalie.js';
export { updateAnnualForm } from './form.js';
export { evaluateRetirement } from './retirement.js';
export { recalculateCurrentAbility, deriveRoleAfter } from './role.js';
export { developPlayer, developPlayers } from './process.js';

export {
  hashPlayerDevelopmentConfig,
  hashDevelopmentPlayerInput,
  hashDevelopmentRunInput,
  hashPlayerDevelopmentResult,
  hashDevelopmentRunResult,
} from './hashing.js';

export {
  reconcileDevelopmentResults,
  assertReconciliation,
} from './reconciliation.js';
export type { ReconciliationIssue } from './reconciliation.js';

export { evaluateDevelopmentReadiness } from './readiness.js';
export type {
  DevelopmentReadinessStatus,
  DevelopmentReadinessCheck,
  DevelopmentReadinessResult,
} from './readiness.js';
