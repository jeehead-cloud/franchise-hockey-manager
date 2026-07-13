import { evaluatePlayerEligibility } from './eligibility.js';
import {
  positionGroupFromPosition,
  type NationalTeamEligibilityRules,
  type NationalTeamPlayerInput,
  type RankedCandidate,
} from './types.js';

/**
 * Deterministic ranking of eligible candidates.
 * Score = effectivePerformance (primary) + mild currentAbility + position weight.
 * No hidden potential.
 */
export function rankEligibleCandidates(input: {
  players: NationalTeamPlayerInput[];
  countryId: string;
  rules: NationalTeamEligibilityRules;
}): RankedCandidate[] {
  const eligible: RankedCandidate[] = [];
  for (const player of input.players) {
    const evaluation = evaluatePlayerEligibility({
      player,
      countryId: input.countryId,
      rules: input.rules,
    });
    if (evaluation.status !== 'ELIGIBLE') continue;
    const group = positionGroupFromPosition(player.position);
    const positionBoost = group === 'GOALIE' ? 0.05 : group === 'DEFENSE' ? 0.02 : 0;
    const handednessBoost =
      player.shoots === 'L' || player.shoots === 'R' ? 0.001 : 0;
    const rankingScore =
      player.effectivePerformance * 1.0 +
      player.currentAbility * 0.15 +
      positionBoost +
      handednessBoost;
    eligible.push({
      playerId: player.playerId,
      rankingScore,
      rankingOrder: 0,
      positionGroup: group,
      evaluation,
    });
  }

  eligible.sort((a, b) => {
    if (b.rankingScore !== a.rankingScore) return b.rankingScore - a.rankingScore;
    return a.playerId.localeCompare(b.playerId);
  });
  return eligible.map((c, i) => ({ ...c, rankingOrder: i + 1 }));
}
