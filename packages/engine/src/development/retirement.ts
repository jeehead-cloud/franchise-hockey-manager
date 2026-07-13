import { seededUnit } from './budget.js';
import type {
  DevelopmentPlayerInput,
  PlayerDevelopmentConfig,
  RetirementDecision,
} from './types.js';

export function evaluateRetirement(input: {
  player: DevelopmentPlayerInput;
  age: number;
  currentAbilityAfter: number;
  config: PlayerDevelopmentConfig;
  baseSeed: string;
  effectiveDate: string;
}): RetirementDecision {
  const { player, age, config } = input;
  const minAge =
    player.playerType === 'GOALIE'
      ? config.retirement.minimumEvaluationAgeGoalie
      : config.retirement.minimumEvaluationAgeSkater;

  if (age >= config.retirement.forcedRetirementAge) {
    return {
      retired: true,
      forced: true,
      probability: 1,
      sample: 1,
      reasonText: `Forced retirement at age ${age}`,
    };
  }

  if (age < minAge) {
    return {
      retired: false,
      forced: false,
      probability: 0,
      sample: 0,
      reasonText: `Below minimum evaluation age ${minAge}`,
    };
  }

  let probability =
    config.retirement.baseProbabilityAtMinimumAge +
    (age - minAge) * config.retirement.annualProbabilityGrowth;
  if (input.currentAbilityAfter < 45) {
    probability += config.retirement.lowAbilityModifier;
  }
  if (player.contractStatus === 'UNSIGNED') {
    probability += config.retirement.unsignedModifier;
  }
  probability = Math.max(0, Math.min(1, probability));

  const sample = seededUnit(
    `${input.baseSeed}:retire:${player.playerId}:${input.effectiveDate}`,
  );
  const retired = sample < probability;
  return {
    retired,
    forced: false,
    probability: Math.round(probability * 1000) / 1000,
    sample: Math.round(sample * 1000) / 1000,
    reasonText: retired
      ? `Sample ${sample.toFixed(3)} < probability ${probability.toFixed(3)} at age ${age}`
      : `Sample ${sample.toFixed(3)} ≥ probability ${probability.toFixed(3)} at age ${age}`,
  };
}
