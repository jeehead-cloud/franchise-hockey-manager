import ratingWeights from '../config/rating-weights.json' with { type: 'json' };
import { PLAYER_MODEL_CONFIG } from './validation.js';
import type { GoalieAttributes, SkaterAttributes } from './types.js';

function clampRating(n: number): number {
  const { ratingMin, ratingMax } = PLAYER_MODEL_CONFIG;
  return Math.min(ratingMax, Math.max(ratingMin, Math.round(n)));
}

/**
 * Map attribute (1–20) toward 0–100 presentation via linear scale:
 * rating ≈ ((attr - 1) / 19) * 100
 */
export function attributeToRatingContribution(attr: number): number {
  const { attributeMin, attributeMax } = PLAYER_MODEL_CONFIG;
  const span = attributeMax - attributeMin;
  return ((attr - attributeMin) / span) * PLAYER_MODEL_CONFIG.ratingMax;
}

export function weightedRating(
  attrs: Record<string, number>,
  weights: Record<string, number>,
): number {
  let sum = 0;
  let totalWeight = 0;
  for (const [key, weight] of Object.entries(weights)) {
    const value = attrs[key];
    if (value === undefined) continue;
    sum += attributeToRatingContribution(value) * weight;
    totalWeight += weight;
  }
  if (totalWeight <= 0) return 0;
  return clampRating(sum / totalWeight);
}

export function deriveSkaterRatings(attrs: SkaterAttributes): {
  currentAbility: number;
  offensiveRating: number;
  defensiveRating: number;
} {
  return {
    currentAbility: weightedRating(attrs, ratingWeights.skater.currentAbility),
    offensiveRating: weightedRating(attrs, ratingWeights.skater.offensive),
    defensiveRating: weightedRating(attrs, ratingWeights.skater.defensive),
  };
}

export function deriveGoalieRatings(attrs: GoalieAttributes): { currentAbility: number } {
  return {
    currentAbility: weightedRating(attrs, ratingWeights.goalie.currentAbility),
  };
}

export function computeRoleRating(
  attrs: Record<string, number>,
  roleAttrs: string[],
  weights: number[],
): number {
  let sum = 0;
  let totalWeight = 0;
  for (let i = 0; i < roleAttrs.length; i += 1) {
    const key = roleAttrs[i]!;
    const weight = weights[i] ?? 0;
    const value = attrs[key];
    if (value === undefined) continue;
    sum += attributeToRatingContribution(value) * weight;
    totalWeight += weight;
  }
  if (totalWeight <= 0) return 0;
  return clampRating(sum / totalWeight);
}
