import { pickWeightedKey, seededBoundedInt, seededBoundedNormal } from './distributions.js';
import type { YouthAge } from './ages.js';
import type { CountryYouthProfile, YouthQualityTier } from './types.js';

export function pickQualityTier(input: {
  profile: CountryYouthProfile;
  baseSeed: string;
  countryKey: string;
  generationIndex: number;
}): YouthQualityTier {
  return pickWeightedKey(
    `${input.baseSeed}:country:${input.countryKey}:player:${input.generationIndex}:tier`,
    input.profile.qualityTiers,
  );
}

const TIER_POTENTIAL_SHIFT: Record<YouthQualityTier, number> = {
  ELITE: 18,
  HIGH: 10,
  AVERAGE: 0,
  LOW: -8,
  LONG_SHOT: -14,
};

const TIER_ABILITY_SHIFT: Record<YouthQualityTier, number> = {
  ELITE: 2.5,
  HIGH: 1.2,
  AVERAGE: 0,
  LOW: -1.2,
  LONG_SHOT: -2,
};

const TIER_DEV_SHIFT: Record<YouthQualityTier, number> = {
  ELITE: 0.25,
  HIGH: 0.12,
  AVERAGE: 0,
  LOW: -0.1,
  LONG_SHOT: 0.05,
};

const AGE_ABILITY_SHIFT: Record<YouthAge, number> = {
  15: -1.2,
  16: -0.4,
  17: 0.5,
};

export function generatePotentialCeiling(input: {
  profile: CountryYouthProfile;
  tier: YouthQualityTier;
  baseSeed: string;
  countryKey: string;
  generationIndex: number;
}): number {
  const p = input.profile.potential;
  return seededBoundedInt(
    `${input.baseSeed}:country:${input.countryKey}:player:${input.generationIndex}:pot`,
    p.mean + TIER_POTENTIAL_SHIFT[input.tier],
    p.standardDeviation,
    p.minimum,
    p.maximum,
  );
}

export function generateAbilityTarget(input: {
  profile: CountryYouthProfile;
  tier: YouthQualityTier;
  age: YouthAge;
  baseSeed: string;
  countryKey: string;
  generationIndex: number;
}): number {
  const a = input.profile.ability;
  return seededBoundedNormal(
    `${input.baseSeed}:country:${input.countryKey}:player:${input.generationIndex}:abi`,
    a.mean + TIER_ABILITY_SHIFT[input.tier] + AGE_ABILITY_SHIFT[input.age],
    a.standardDeviation,
    a.minimum,
    a.maximum,
  );
}

export function generateDevelopmentRate(input: {
  profile: CountryYouthProfile;
  tier: YouthQualityTier;
  age: YouthAge;
  baseSeed: string;
  countryKey: string;
  generationIndex: number;
}): number {
  const d = input.profile.developmentRate;
  const ageBoost = input.age === 15 ? 0.08 : input.age === 16 ? 0.04 : 0;
  const raw = seededBoundedNormal(
    `${input.baseSeed}:country:${input.countryKey}:player:${input.generationIndex}:dev`,
    d.mean + TIER_DEV_SHIFT[input.tier] + ageBoost,
    d.standardDeviation,
    d.minimum,
    d.maximum,
  );
  return Math.round(raw * 100) / 100;
}
