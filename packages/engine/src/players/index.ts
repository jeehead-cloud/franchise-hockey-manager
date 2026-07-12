import { deriveSkaterRatings } from './ratings.js';
import { deriveSkaterRole } from './roles.js';
import type {
  CompletePlayerModelInput,
  CompleteSkaterInput,
  DerivedPlayerModel,
  DerivedSkaterModel,
  HiddenPotential,
  SkaterAttributes,
} from './types.js';
import {
  PlayerModelValidationError,
  validateProfile,
  validateSkaterAttributes,
} from './validation.js';
import { deriveGoalieModel } from '../goalies/index.js';

export function deriveSkaterModel(input: CompleteSkaterInput): DerivedSkaterModel {
  const issues = [
    ...validateSkaterAttributes(input.skaterAttributes),
    ...validateProfile(input),
  ];
  if (!['LW', 'RW', 'C', 'LD', 'RD'].includes(input.primaryPosition)) {
    issues.push('Skater model requires LW/RW/C/LD/RD');
  }
  if (issues.length) throw new PlayerModelValidationError(issues);

  const ratingsBase = deriveSkaterRatings(input.skaterAttributes);
  const role = deriveSkaterRole(input.primaryPosition, input.skaterAttributes);

  return {
    kind: 'skater',
    modelStatus: 'COMPLETE',
    attributes: { ...input.skaterAttributes } as SkaterAttributes,
    ratings: {
      currentAbility: ratingsBase.currentAbility,
      offensiveRating: ratingsBase.offensiveRating,
      defensiveRating: ratingsBase.defensiveRating,
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

export function derivePlayerModel(input: CompletePlayerModelInput): DerivedPlayerModel {
  if (input.primaryPosition === 'G') {
    if (!('goalieAttributes' in input)) {
      throw new PlayerModelValidationError(['Goalie requires goalieAttributes']);
    }
    if ('skaterAttributes' in input && (input as { skaterAttributes?: unknown }).skaterAttributes) {
      throw new PlayerModelValidationError(['Goalie must not include skaterAttributes']);
    }
    return deriveGoalieModel(input);
  }

  if (!('skaterAttributes' in input)) {
    throw new PlayerModelValidationError(['Skater requires skaterAttributes']);
  }
  if ('goalieAttributes' in input && (input as { goalieAttributes?: unknown }).goalieAttributes) {
    throw new PlayerModelValidationError(['Skater must not include goalieAttributes']);
  }
  return deriveSkaterModel(input);
}

/** Extract hidden potential for internal use only — never put on public DTOs. */
export function getHiddenPotential(input: CompletePlayerModelInput): HiddenPotential {
  return {
    potentialFloor: input.potentialFloor,
    potentialCeiling: input.potentialCeiling,
    developmentRisk: input.developmentRisk,
  };
}

export * from './types.js';
export * from './validation.js';
export * from './ratings.js';
export { deriveSkaterRole } from './roles.js';
