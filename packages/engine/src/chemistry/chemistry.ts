import { chemistryLabel, getChemistryWeights, type ChemistryRuntimeConfig } from './config.js';
import { personalityCompatibilityScore } from './personality.js';
import { roleCompatibilityScore } from './role-compatibility.js';
import type { ChemistryFactor, ChemistryPlayerInput } from './types.js';

/** Map [-1,1] compatibility average to 0–100 presentation score. */
export function toPresentationScore(normNeg1To1: number): number {
  return Math.round(Math.min(100, Math.max(0, (normNeg1To1 + 1) * 50)));
}

export function computeBaseCompatibility(
  players: ChemistryPlayerInput[],
  chemistryConfig?: ChemistryRuntimeConfig,
): {
  roleCompatibility: number;
  personalityCompatibility: number;
  baseCompatibility: number;
  currentChemistry: number;
  label: ReturnType<typeof chemistryLabel>;
  factors: ChemistryFactor[];
} {
  const weights = getChemistryWeights(chemistryConfig).weights;
  const role = roleCompatibilityScore(players, chemistryConfig);
  const personality = personalityCompatibilityScore(players, chemistryConfig);
  const combinedNorm =
    role.score * weights.roleCompatibility + personality.score * weights.personalityCompatibility;
  const baseCompatibility = toPresentationScore(combinedNorm);
  return {
    roleCompatibility: toPresentationScore(role.score),
    personalityCompatibility: toPresentationScore(personality.score),
    baseCompatibility,
    currentChemistry: baseCompatibility,
    label: chemistryLabel(baseCompatibility, chemistryConfig),
    factors: [...role.factors, ...personality.factors],
  };
}
