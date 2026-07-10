export type {
  AttrCode,
  CoachingStyle,
  GeneratePlayerOptions,
  GeneratedPlayer,
  GoalieAttributes,
  NamePool,
  Nationality,
  Personality,
  Position,
  SkaterAttributes,
  Tactics,
} from './players/types.js';

export { generatePlayer } from './players/generate.js';
export { getAgeAdjustment, getAgingCurve } from './players/aging.js';
export { deriveRole, computeRoleRating, getRoleThresholds } from './players/roles.js';
export { randFloat, randInt, pickOne, randBetween } from './players/rng.js';
