import { deriveGoalieRatings } from '../players/ratings.js';
import type { DerivedGoalieModel, GoalieAttributes } from '../players/types.js';
import {
  PlayerModelValidationError,
  validateGoalieAttributes,
  validateProfile,
} from '../players/validation.js';
import type { CompleteGoalieInput } from '../players/types.js';
import { deriveGoalieRole } from './roles.js';

export function deriveGoalieModel(input: CompleteGoalieInput): DerivedGoalieModel {
  const issues = [
    ...validateGoalieAttributes(input.goalieAttributes),
    ...validateProfile(input),
  ];
  if (input.primaryPosition !== 'G') {
    issues.push('Goalie model requires primaryPosition G');
  }
  if (issues.length) throw new PlayerModelValidationError(issues);

  const ratingsBase = deriveGoalieRatings(input.goalieAttributes);
  const role = deriveGoalieRole(input.primaryPosition, input.goalieAttributes);

  return {
    kind: 'goalie',
    modelStatus: 'COMPLETE',
    attributes: { ...input.goalieAttributes } as GoalieAttributes,
    ratings: {
      currentAbility: ratingsBase.currentAbility,
      roleRating: role.roleRating,
    },
    role,
    publicPotentialEstimate: input.publicPotentialEstimate,
    preferredCoachingStyle: input.preferredCoachingStyle,
    preferredTactics: input.preferredTactics,
    personality: input.personality,
    heroRating: input.heroRating,
    stability: input.stability,
    developmentRate: input.developmentRate,
  };
}

export { deriveGoalieRole } from './roles.js';
