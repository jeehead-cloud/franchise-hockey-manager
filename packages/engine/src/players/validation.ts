import playerModelConfig from '../config/player-model.json' with { type: 'json' };
import type {
  GoalieAttributeKey,
  GoalieAttributes,
  PlayerModelProfileInput,
  SkaterAttributeKey,
  SkaterAttributes,
  SkaterPosition,
  GoaliePosition,
} from './types.js';
import { GOALIE_ATTRIBUTE_KEYS, SKATER_ATTRIBUTE_KEYS } from './types.js';

export const PLAYER_MODEL_CONFIG = Object.freeze(playerModelConfig);

export class PlayerModelValidationError extends Error {
  readonly issues: string[];

  constructor(issues: string[]) {
    super(issues.join('; '));
    this.name = 'PlayerModelValidationError';
    this.issues = issues;
  }
}

function isIntInRange(value: unknown, min: number, max: number): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= min && value <= max;
}

function isNumberInRange(value: unknown, min: number, max: number): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max;
}

export function validateSkaterAttributes(attrs: SkaterAttributes): string[] {
  const issues: string[] = [];
  const { attributeMin, attributeMax } = PLAYER_MODEL_CONFIG;
  for (const key of SKATER_ATTRIBUTE_KEYS) {
    if (!isIntInRange(attrs[key], attributeMin, attributeMax)) {
      issues.push(`${key} must be an integer ${attributeMin}–${attributeMax}`);
    }
  }
  return issues;
}

export function validateGoalieAttributes(attrs: GoalieAttributes): string[] {
  const issues: string[] = [];
  const { attributeMin, attributeMax } = PLAYER_MODEL_CONFIG;
  for (const key of GOALIE_ATTRIBUTE_KEYS) {
    if (!isIntInRange(attrs[key], attributeMin, attributeMax)) {
      issues.push(`${key} must be an integer ${attributeMin}–${attributeMax}`);
    }
  }
  return issues;
}

export function validateProfile(profile: PlayerModelProfileInput): string[] {
  const issues: string[] = [];
  const c = PLAYER_MODEL_CONFIG;
  if (!isIntInRange(profile.heroRating, c.heroRatingMin, c.heroRatingMax)) {
    issues.push(`heroRating must be an integer ${c.heroRatingMin}–${c.heroRatingMax}`);
  }
  if (!isIntInRange(profile.stability, c.stabilityMin, c.stabilityMax)) {
    issues.push(`stability must be an integer ${c.stabilityMin}–${c.stabilityMax}`);
  }
  if (!isNumberInRange(profile.developmentRate, c.developmentRateMin, c.developmentRateMax)) {
    issues.push(
      `developmentRate must be between ${c.developmentRateMin} and ${c.developmentRateMax}`,
    );
  }
  if (!isNumberInRange(profile.developmentRisk, c.developmentRiskMin, c.developmentRiskMax)) {
    issues.push(
      `developmentRisk must be between ${c.developmentRiskMin} and ${c.developmentRiskMax}`,
    );
  }
  if (!isIntInRange(profile.potentialFloor, c.ratingMin, c.ratingMax)) {
    issues.push(`potentialFloor must be an integer ${c.ratingMin}–${c.ratingMax}`);
  }
  if (!isIntInRange(profile.potentialCeiling, c.ratingMin, c.ratingMax)) {
    issues.push(`potentialCeiling must be an integer ${c.ratingMin}–${c.ratingMax}`);
  }
  if (
    isIntInRange(profile.potentialFloor, c.ratingMin, c.ratingMax) &&
    isIntInRange(profile.potentialCeiling, c.ratingMin, c.ratingMax) &&
    profile.potentialFloor > profile.potentialCeiling
  ) {
    issues.push('potentialFloor must be <= potentialCeiling');
  }
  return issues;
}

export function assertSkaterPosition(position: string): asserts position is SkaterPosition {
  if (!['LW', 'RW', 'C', 'LD', 'RD'].includes(position)) {
    throw new PlayerModelValidationError([`Expected skater position, got ${position}`]);
  }
}

export function assertGoaliePosition(position: string): asserts position is GoaliePosition {
  if (position !== 'G') {
    throw new PlayerModelValidationError([`Expected goalie position G, got ${position}`]);
  }
}

export function attrValue(
  attrs: Record<string, number>,
  key: SkaterAttributeKey | GoalieAttributeKey,
): number {
  return attrs[key]!;
}
