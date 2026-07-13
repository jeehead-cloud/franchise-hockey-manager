import { stableDigest } from '../simulation/batch/hash.js';
import { ageOnEffectiveDate, classifyAgeBand } from './age.js';
import type {
  BudgetBreakdown,
  DevelopmentPlayerInput,
  PlayerDevelopmentConfig,
} from './types.js';

/** Deterministic unit float in [0,1) from seed material. */
export function seededUnit(seedMaterial: string): number {
  const hex = stableDigest(seedMaterial).slice(0, 8);
  return Number.parseInt(hex, 16) / 0x1_0000_0000;
}

/** Signed variance in [-spread, +spread]. */
export function seededSigned(seedMaterial: string, spread: number): number {
  return (seededUnit(seedMaterial) * 2 - 1) * spread;
}

export function calculateDevelopmentBudget(input: {
  player: DevelopmentPlayerInput;
  config: PlayerDevelopmentConfig;
  effectiveDate: string;
  baseSeed: string;
}): BudgetBreakdown {
  const { player, config, effectiveDate, baseSeed } = input;
  const age = ageOnEffectiveDate(player.birthDate, effectiveDate);
  const curve =
    player.playerType === 'GOALIE' ? config.ageCurves.goalie : config.ageCurves.skater;
  const band = classifyAgeBand(age, curve);

  let baseBudget = config.annualBudget.primeBase;
  if (band === 'YOUNG') baseBudget = config.annualBudget.youngBase;
  else if (band === 'DECLINE') baseBudget = config.annualBudget.declineBase;
  else if (band === 'STEEP_DECLINE') baseBudget = config.annualBudget.steepDeclineBase;

  const ageModifier = 0;
  const gap = player.potentialCeiling - player.currentAbility;
  let potentialModifier = 0;
  if (baseBudget > 0) {
    if (gap <= config.potential.overPotentialTolerance) {
      potentialModifier = -baseBudget; // cancel growth near/over ceiling
    } else if (gap < 10) {
      potentialModifier = -Math.ceil(baseBudget * (1 - config.potential.ceilingSoftness));
    } else if (gap > 40) {
      potentialModifier = Math.round(
        baseBudget * (1 - config.potential.lowPotentialGrowthPenalty) * 0.15,
      );
    }
  }

  const rate = player.developmentRate ?? 1;
  const usageModifier = Math.round((rate - 1) * 1.5);

  const spread =
    baseBudget >= 0
      ? config.variance.developmentRandomness
      : config.variance.declineRandomness;
  const varianceModifier = Math.round(
    seededSigned(
      `${baseSeed}:budget:${player.playerId}:${effectiveDate}`,
      Math.max(1, Math.abs(baseBudget)) * spread,
    ),
  );

  let finalBudget =
    baseBudget + ageModifier + potentialModifier + usageModifier + varianceModifier;
  finalBudget = Math.max(
    config.annualBudget.minimum,
    Math.min(config.annualBudget.maximum, finalBudget),
  );
  finalBudget = Math.trunc(finalBudget);

  return {
    baseBudget,
    ageModifier,
    potentialModifier,
    usageModifier,
    varianceModifier,
    finalBudget,
  };
}
