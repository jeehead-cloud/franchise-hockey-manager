import { stableDigest } from '../simulation/batch/hash.js';

/** Deterministic unit float in [0,1). */
export function seededUnit(seedMaterial: string): number {
  const hex = stableDigest(seedMaterial).slice(0, 8);
  return Number.parseInt(hex, 16) / 0x1_0000_0000;
}

/** Box-Muller-ish via two seeded units → approximate normal, then clamp. */
export function seededNormal(
  seedMaterial: string,
  mean: number,
  standardDeviation: number,
): number {
  const u1 = Math.max(1e-12, seededUnit(`${seedMaterial}:n1`));
  const u2 = seededUnit(`${seedMaterial}:n2`);
  const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  return mean + z * standardDeviation;
}

export function seededBoundedNormal(
  seedMaterial: string,
  mean: number,
  standardDeviation: number,
  minimum: number,
  maximum: number,
): number {
  const v = seededNormal(seedMaterial, mean, standardDeviation);
  return Math.max(minimum, Math.min(maximum, v));
}

export function seededBoundedInt(
  seedMaterial: string,
  mean: number,
  standardDeviation: number,
  minimum: number,
  maximum: number,
): number {
  return Math.round(
    seededBoundedNormal(seedMaterial, mean, standardDeviation, minimum, maximum),
  );
}

export function pickWeightedKey<T extends string>(
  seedMaterial: string,
  weights: Record<T, number>,
): T {
  const entries = (Object.entries(weights) as Array<[T, number]>).filter(([, w]) => w > 0);
  if (entries.length === 0) {
    throw new Error('No positive weights');
  }
  const total = entries.reduce((s, [, w]) => s + w, 0);
  let r = seededUnit(seedMaterial) * total;
  for (const [key, w] of entries) {
    r -= w;
    if (r < 0) return key;
  }
  return entries[entries.length - 1]![0];
}
