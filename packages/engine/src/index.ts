/**
 * @fhm/engine — pure simulation/generation package (no I/O, no Fastify/Prisma/React).
 */

export const ENGINE_NAME = '@fhm/engine' as const;
export const ENGINE_VERSION = '0.1.0' as const;

/** Smoke-test helper proving the package builds and imports correctly. */
export function getEngineInfo(): { name: typeof ENGINE_NAME; version: typeof ENGINE_VERSION } {
  return { name: ENGINE_NAME, version: ENGINE_VERSION };
}

export {
  derivePlayerModel,
  deriveSkaterModel,
  deriveSkaterRole,
  deriveSkaterRatings,
  getHiddenPotential,
  PlayerModelValidationError,
  validateSkaterAttributes,
  validateGoalieAttributes,
  validateProfile,
  SKATER_ATTRIBUTE_KEYS,
  GOALIE_ATTRIBUTE_KEYS,
  PLAYER_MODEL_CONFIG,
} from './players/index.js';

export type * from './players/types.js';

export { deriveGoalieModel, deriveGoalieRole } from './goalies/index.js';
export { deriveGoalieRatings, computeRoleRating, weightedRating } from './players/ratings.js';

export {
  evaluateTeamReadiness,
  summarizeRoster,
  TEAM_READINESS_THRESHOLDS,
  isAvailableForReadiness,
  positionGroup,
} from './team-setup/index.js';

export type {
  TeamReadinessStatus,
  TeamReadinessRosterMember,
  TeamReadinessInput,
  TeamReadinessCheck,
  TeamReadinessCounts,
  TeamReadinessResult,
  RosterPositionGroup,
} from './team-setup/index.js';
