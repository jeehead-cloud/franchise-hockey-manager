import agingCurve from '../config/aging-curve.json' with { type: 'json' };

export interface AgingCurveEntry {
  age: number;
  yearlyDelta: number;
  cumulativeAdj: number;
}

const byAge = new Map<number, AgingCurveEntry>(
  (agingCurve as AgingCurveEntry[]).map((e) => [e.age, e]),
);

/** Look up cumulative age adjustment (Age adj.) for a given age. */
export function getAgeAdjustment(age: number): number {
  const entry = byAge.get(age);
  if (!entry) {
    // Clamp to nearest known age for out-of-range values
    if (age < 15) return byAge.get(15)!.cumulativeAdj;
    if (age > 42) return byAge.get(42)!.cumulativeAdj;
    throw new Error(`No aging-curve entry for age ${age}`);
  }
  return entry.cumulativeAdj;
}

export function getAgingCurve(): readonly AgingCurveEntry[] {
  return agingCurve as AgingCurveEntry[];
}
