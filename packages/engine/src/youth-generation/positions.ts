import { pickWeightedKey } from './distributions.js';
import type { WeightedHandedness, WeightedPositions, YouthHandedness, YouthPosition } from './types.js';

export function pickPosition(input: {
  positions: WeightedPositions;
  baseSeed: string;
  countryKey: string;
  generationIndex: number;
}): YouthPosition {
  return pickWeightedKey(
    `${input.baseSeed}:country:${input.countryKey}:player:${input.generationIndex}:pos`,
    input.positions,
  );
}

export function pickHandedness(input: {
  handedness: WeightedHandedness;
  baseSeed: string;
  countryKey: string;
  generationIndex: number;
}): YouthHandedness {
  return pickWeightedKey(
    `${input.baseSeed}:country:${input.countryKey}:player:${input.generationIndex}:hand`,
    input.handedness,
  );
}
