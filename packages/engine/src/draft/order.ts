import { hashDraftOrder } from './hashing.js';
import type { DraftConfig, DraftOrderResult, DraftOrderTeamInput, DraftPickSlot } from './types.js';
import { DraftError } from './types.js';

/**
 * Build the initial multi-round draft order.
 *
 * REVERSE_STANDINGS: worst team picks first; order is taken from final standing
 * ranks supplied by the caller (the server guarantees those are final — never
 * derived here from mutable standings). If any team lacks a standing rank the
 * build falls back to a stable Team-ID-sorted tail so order stays deterministic.
 *
 * MANUAL: teams are taken in the supplied order (Commissioner-controlled).
 *
 * `repeatSameOrderEachRound`: every round uses the same sequence (default true).
 * When false, rounds snake (odd rounds forward, even rounds reversed).
 *
 * This function does NOT implement pick trades — F27 keeps currentTeamId ==
 * originalTeamId.
 */
export function buildDraftOrder(
  config: DraftConfig,
  teams: DraftOrderTeamInput[],
): DraftOrderResult {
  if (teams.length === 0) {
    throw new DraftError('InvalidDraftInput', 'At least one participating team is required');
  }
  const seen = new Set<string>();
  for (const t of teams) {
    if (!t.teamId) throw new DraftError('InvalidDraftInput', 'teamId is required on every entry');
    if (seen.has(t.teamId)) {
      throw new DraftError('InvalidDraftInput', `Duplicate participating team ${t.teamId}`);
    }
    seen.add(t.teamId);
  }

  const orderedTeamIds = orderTeams(config, teams);
  const orderedNames = new Map(teams.map((t) => [t.teamId, t.teamName]));
  const rounds = config.rounds;
  const picks: DraftPickSlot[] = [];
  let overall = 0;
  for (let round = 1; round <= rounds; round += 1) {
    const sequence = computeRoundSequence(orderedTeamIds, round, config.order.repeatSameOrderEachRound);
    let pickInRound = 0;
    for (const teamId of sequence) {
      pickInRound += 1;
      overall += 1;
      picks.push({
        roundNumber: round,
        pickInRound,
        overallPick: overall,
        teamId,
        teamName: orderedNames.get(teamId) ?? teamId,
      });
    }
  }

  const result: DraftOrderResult = {
    picks,
    orderHash: '',
    source: config.order.source,
  };
  result.orderHash = hashDraftOrder(result);
  return result;
}

function orderTeams(config: DraftConfig, teams: DraftOrderTeamInput[]): string[] {
  if (config.order.source === 'MANUAL') {
    return teams.map((t) => t.teamId);
  }
  // REVERSE_STANDINGS: worst rank first. Teams missing a standing rank are
  // appended in stable team-id order so determinism holds when the Commissioner
  // has not supplied a source stage.
  const withRank = teams.filter((t) => t.standingRank != null) as Array<{
    teamId: string;
    standingRank: number;
  }>;
  const noRank = teams
    .filter((t) => t.standingRank == null)
    .map((t) => t.teamId)
    .sort((a, b) => a.localeCompare(b));

  const ranks = new Set(withRank.map((t) => t.standingRank));
  if (ranks.size !== withRank.length) {
    throw new DraftError('InvalidDraftInput', 'Duplicate standing ranks among participating teams');
  }
  withRank.sort((a, b) => {
    // Higher standing rank number = worse team = earlier pick.
    if (b.standingRank !== a.standingRank) return b.standingRank - a.standingRank;
    return a.teamId.localeCompare(b.teamId);
  });
  return [...withRank.map((t) => t.teamId), ...noRank];
}

function computeRoundSequence(
  baseOrder: string[],
  round: number,
  repeatSameOrderEachRound: boolean,
): string[] {
  if (repeatSameOrderEachRound || round % 2 === 1) {
    return baseOrder;
  }
  return [...baseOrder].reverse();
}
