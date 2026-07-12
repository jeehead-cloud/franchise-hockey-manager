import { getChemistryWeights, type ChemistryRuntimeConfig } from './config.js';
import type { ChemistryPlayerInput } from './types.js';

export function computeBaseAbility(
  players: ChemistryPlayerInput[],
  chemistryConfig?: ChemistryRuntimeConfig,
): number {
  if (players.length === 0) return 0;
  const avgAbility = players.reduce((s, p) => s + p.currentAbility, 0) / players.length;
  const avgRole = players.reduce((s, p) => s + p.roleRating, 0) / players.length;
  const contribution = getChemistryWeights(chemistryConfig).roleRatingBaseContribution;
  const adjusted = avgAbility + (avgRole - 50) * contribution;
  return Math.round(Math.min(100, Math.max(0, adjusted)) * 10) / 10;
}

export function computeEffectivePerformance(
  opts: {
    baseAbility: number;
    chemistry0to100: number | null;
    coachFitNeg1To1: number;
    tacticalFitNeg1To1: number;
  },
  chemistryConfig?: ChemistryRuntimeConfig,
): {
  chemistryContribution: number;
  coachFitContribution: number;
  tacticalFitContribution: number;
  totalModifier: number;
  effectivePerformance: number;
} {
  const caps = getChemistryWeights(chemistryConfig).caps;
  const chemistryContribution =
    opts.chemistry0to100 === null
      ? 0
      : ((opts.chemistry0to100 - 50) / 50) * caps.chemistry;
  const coachFitContribution = opts.coachFitNeg1To1 * caps.coachFit;
  const tacticalFitContribution = opts.tacticalFitNeg1To1 * caps.tacticalFit;
  const raw = chemistryContribution + coachFitContribution + tacticalFitContribution;
  const totalModifier = Math.min(caps.totalMax, Math.max(caps.totalMin, raw));
  const effectivePerformance = Math.max(
    0,
    Math.round(opts.baseAbility * (1 + totalModifier) * 10) / 10,
  );
  return {
    chemistryContribution,
    coachFitContribution,
    tacticalFitContribution,
    totalModifier,
    effectivePerformance,
  };
}
