/** Thin RNG helpers — all randomness is frozen by callers at generation time. */

export function randFloat(min: number, max: number, rng: () => number = Math.random): number {
  return rng() * (max - min) + min;
}

export function randInt(min: number, max: number, rng: () => number = Math.random): number {
  return Math.floor(randFloat(min, max + 1, rng));
}

export function pickOne<T>(items: readonly T[], rng: () => number = Math.random): T {
  if (items.length === 0) {
    throw new Error('pickOne: empty array');
  }
  return items[Math.floor(rng() * items.length)]!;
}

/** Draw a value uniformly between `low` and `high` (order-independent). */
export function randBetween(a: number, b: number, rng: () => number = Math.random): number {
  const low = Math.min(a, b);
  const high = Math.max(a, b);
  return randFloat(low, high, rng);
}
