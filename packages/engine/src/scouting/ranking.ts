import type { SuggestedRanking, SuggestedRankingInput } from './types.js';

/** Ranks only published scouting estimates; it deliberately has no player-truth parameter. */
export function suggestScoutingRanking(inputs: readonly SuggestedRankingInput[]): SuggestedRanking[] {
  return inputs.map((input) => {
    const ca = input.report.currentAbility.estimate ?? 0;
    const potential = input.report.potential.estimate ?? ca;
    const confidence = input.report.confidence;
    const manual = input.manualPriority ?? 0;
    const score = Math.round((ca * 0.35 + potential * 0.65) * (0.5 + confidence * 0.5) + manual * 5);
    return {
      playerId: input.playerId,
      score,
      reason: `Potential ${potential}, current ability ${ca}, confidence ${Math.round(confidence * 100)}%, manual priority ${manual}`,
    };
  }).sort((a, b) => b.score - a.score || a.playerId.localeCompare(b.playerId));
}
