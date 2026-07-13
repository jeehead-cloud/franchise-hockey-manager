import { seededBoundedInt } from './distributions.js';
import type { CountryYouthProfile, YouthPosition } from './types.js';

export function generatePhysical(input: {
  profile: CountryYouthProfile;
  position: YouthPosition;
  baseSeed: string;
  countryKey: string;
  generationIndex: number;
}): { heightCm: number; weightKg: number } {
  const h = input.profile.physical.heightCmByPosition[input.position];
  const w = input.profile.physical.weightKgByPosition[input.position];
  const heightCm = seededBoundedInt(
    `${input.baseSeed}:country:${input.countryKey}:player:${input.generationIndex}:height`,
    h.mean,
    h.standardDeviation,
    h.minimum,
    h.maximum,
  );
  // Mild height/weight correlation via height residual.
  const residual = (heightCm - h.mean) * 0.4;
  const weightKg = seededBoundedInt(
    `${input.baseSeed}:country:${input.countryKey}:player:${input.generationIndex}:weight`,
    w.mean + residual,
    w.standardDeviation,
    w.minimum,
    w.maximum,
  );
  return { heightCm, weightKg };
}
