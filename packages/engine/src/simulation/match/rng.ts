/**
 * Deterministic Mulberry32 PRNG.
 * Seed normalization: string seeds are hashed to uint32 via FNV-1a.
 * No Math.random usage.
 */

export interface RngState {
  algorithm: 'mulberry32';
  seed: number;
  state: number;
}

function hashSeed(input: string | number): number {
  if (typeof input === 'number' && Number.isFinite(input)) {
    return input >>> 0;
  }
  const str = String(input);
  let hash = 2166136261;
  for (let i = 0; i < str.length; i += 1) {
    hash ^= str.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function mulberry32(state: number): { value: number; next: number } {
  let t = (state += 0x6d2b79f5);
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  const value = ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  return { value, next: state >>> 0 };
}

export function createRng(seed: string | number): RngState {
  const normalized = hashSeed(seed);
  return { algorithm: 'mulberry32', seed: normalized, state: normalized };
}

export function restoreRng(state: RngState): RngState {
  if (state.algorithm !== 'mulberry32') {
    throw new Error('Unsupported RNG algorithm');
  }
  return { ...state };
}

export function nextFloat(rng: RngState): { rng: RngState; value: number } {
  const step = mulberry32(rng.state);
  return { rng: { ...rng, state: step.next }, value: step.value };
}

export function nextInt(rng: RngState, min: number, max: number): { rng: RngState; value: number } {
  if (!Number.isFinite(min) || !Number.isFinite(max) || min > max) {
    throw new Error('Invalid nextInt bounds');
  }
  const { rng: r2, value } = nextFloat(rng);
  return { rng: r2, value: min + Math.floor(value * (max - min + 1)) };
}

export function chance(rng: RngState, probability: number): { rng: RngState; value: boolean } {
  if (probability < 0 || probability > 1) throw new Error('Probability out of range');
  const { rng: r2, value } = nextFloat(rng);
  return { rng: r2, value: value < probability };
}

export function pick<T>(rng: RngState, items: readonly T[]): { rng: RngState; value: T } {
  if (items.length === 0) throw new Error('Cannot pick from empty array');
  const { rng: r2, value: idx } = nextInt(rng, 0, items.length - 1);
  return { rng: r2, value: items[idx]! };
}

export function weightedPick<T extends string>(
  rng: RngState,
  weights: Record<T, number>,
): { rng: RngState; value: T } {
  const entries = Object.entries(weights) as [T, number][];
  const total = entries.reduce((s, [, w]) => s + w, 0);
  if (!(total > 0)) throw new Error('Weights must sum to a positive value');
  const { rng: r2, value: roll } = nextFloat(rng);
  let cursor = roll * total;
  for (const [key, weight] of entries) {
    if (weight <= 0) continue;
    cursor -= weight;
    if (cursor <= 0) return { rng: r2, value: key };
  }
  return { rng: r2, value: entries[entries.length - 1]![0] };
}
