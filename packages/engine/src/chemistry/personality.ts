import { getPersonalityPairScore } from './config.js';
import type { ChemistryFactor, ChemistryPlayerInput } from './types.js';

/** Average pairwise personality contribution in [-1, 1]. Order-independent. */
export function personalityCompatibilityScore(players: ChemistryPlayerInput[]): {
  score: number;
  factors: ChemistryFactor[];
} {
  const sorted = [...players].sort((a, b) => a.id.localeCompare(b.id));
  const factors: ChemistryFactor[] = [];
  if (sorted.length < 2) return { score: 0, factors };

  const pairScores: number[] = [];
  for (let i = 0; i < sorted.length; i += 1) {
    for (let j = i + 1; j < sorted.length; j += 1) {
      const a = sorted[i]!;
      const b = sorted[j]!;
      const score = getPersonalityPairScore(a.personality, b.personality);
      pairScores.push(score);
      factors.push({
        code: 'PERSONALITY_PAIR',
        label: 'Personality mix',
        impact: score,
        direction: score > 0.15 ? 'POSITIVE' : score < -0.05 ? 'NEGATIVE' : 'NEUTRAL',
        details: `${a.personality} + ${b.personality}: ${score.toFixed(2)}`,
      });
    }
  }
  return {
    score: pairScores.reduce((s, n) => s + n, 0) / pairScores.length,
    factors,
  };
}
