import { getRolePairScore } from './config.js';
import type { ChemistryFactor, ChemistryPlayerInput } from './types.js';

/** Average pairwise role compatibility in [-1, 1]. Order-independent. */
export function roleCompatibilityScore(players: ChemistryPlayerInput[]): {
  score: number;
  factors: ChemistryFactor[];
} {
  const sorted = [...players].sort((a, b) => a.id.localeCompare(b.id));
  const factors: ChemistryFactor[] = [];
  if (sorted.length < 2) {
    return { score: 0, factors };
  }

  const pairScores: number[] = [];
  for (let i = 0; i < sorted.length; i += 1) {
    for (let j = i + 1; j < sorted.length; j += 1) {
      const a = sorted[i]!;
      const b = sorted[j]!;
      const score = getRolePairScore(a.role, b.role);
      pairScores.push(score);
      const direction = score > 0.15 ? 'POSITIVE' : score < -0.15 ? 'NEGATIVE' : 'NEUTRAL';
      factors.push({
        code:
          score > 0.15
            ? 'ROLE_COMPLEMENTARY'
            : score < -0.15
              ? 'ROLE_REDUNDANT'
              : 'ROLE_NEUTRAL',
        label:
          score > 0.15
            ? 'Complementary roles'
            : score < -0.15
              ? 'Redundant or conflicting roles'
              : 'Neutral role pairing',
        impact: score,
        direction,
        details: `${a.role} + ${b.role}: ${score.toFixed(2)}`,
      });
    }
  }
  const score = pairScores.reduce((s, n) => s + n, 0) / pairScores.length;
  return { score, factors };
}
