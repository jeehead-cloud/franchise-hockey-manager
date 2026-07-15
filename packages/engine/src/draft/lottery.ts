import { createRng, nextFloat } from '../simulation/match/rng.js';
import { hashDraftOrder, hashLottery } from './hashing.js';
import type {
  DraftConfig,
  DraftOrderResult,
  LotteryDrawResult,
  LotteryResult,
} from './types.js';
import { DraftError } from './types.js';

/**
 * Simplified deterministic development draft lottery.
 *
 * Lottery-eligible teams are the worst `eligibleTeamCount` clubs. In a reverse-
 * standings order they occupy the first `eligibleCount` slots of round 1
 * (position 0 = worst team = highest default weight). Each draw:
 *   1. picks one still-eligible team weighted by `config.lottery.weights`
 *      (no repeat winners);
 *   2. the winner jumps forward to the next free lottery slot, but never more
 *      than `maximumMoveUp` positions above its *current* position. Earlier
 *      winners take the earlier slots.
 *
 * Teams that do not win retain their relative order. Non-lottery teams are
 * untouched. This is a bounded, fictional lottery — it does NOT claim exact
 * NHL fidelity.
 *
 * `seed` must be the DraftEvent base seed (or a fragment of it). The same
 * order + config + seed always reproduce the same outcome.
 */
export function runDraftLottery(
  config: DraftConfig,
  order: DraftOrderResult,
  seed: string,
): LotteryResult {
  if (!config.lottery.enabled) {
    throw new DraftError('InvalidLotteryConfiguration', 'Lottery is disabled in the active config');
  }
  const eligibleCount = config.lottery.eligibleTeamCount;
  const drawCount = config.lottery.drawCount;
  const maximumMoveUp = config.lottery.maximumMoveUp;
  const weights = config.lottery.weights;

  const firstRound = order.picks.filter((p) => p.roundNumber === 1).map((p) => p.teamId);
  if (firstRound.length === 0) {
    throw new DraftError('InvalidLotteryConfiguration', 'No first-round picks available for lottery');
  }
  const participating = Math.min(eligibleCount, firstRound.length);
  if (participating < eligibleCount) {
    throw new DraftError(
      'InvalidLotteryConfiguration',
      `Lottery eligible count ${eligibleCount} exceeds first-round size ${firstRound.length}`,
    );
  }

  let rng = createRng(`${seed}:lottery`);
  const draws: LotteryDrawResult[] = [];
  // Current arrangement starts identical to the input first-round order.
  let arrangement = firstRound.slice();
  const alreadyWon = new Set<string>();
  // Next free slot is filled by each successive winner.
  let nextFreeSlot = 0;

  for (let drawNumber = 1; drawNumber <= drawCount; drawNumber += 1) {
    // Pool: lottery-eligible teams still in the eligible zone that have not won.
    // The eligible zone is positions [0, participating). Their weight index is
    // their *original* position in the input order.
    const pool: Array<{ teamId: string; originalWeightIndex: number; currentPos: number }> = [];
    for (let pos = 0; pos < participating; pos += 1) {
      const teamId = arrangement[pos]!;
      if (alreadyWon.has(teamId)) continue;
      const weight = weights[pos] ?? 0;
      if (weight > 0) {
        pool.push({ teamId, originalWeightIndex: pos, currentPos: pos });
      }
    }
    if (pool.length === 0) break;

    const total = pool.reduce((s, p) => s + (weights[p.originalWeightIndex] ?? 0), 0);
    if (!(total > 0)) break;

    const roll = nextFloat(rng);
    rng = roll.rng;
    let cursor = roll.value * total;
    let winner = pool[pool.length - 1]!;
    for (const candidate of pool) {
      cursor -= weights[candidate.originalWeightIndex] ?? 0;
      if (cursor <= 0) {
        winner = candidate;
        break;
      }
    }

    // Target slot is the next free slot, but the winner may not move up more
    // than maximumMoveUp. (For the worst teams near the top, the move is small.)
    const targetSlot = Math.max(nextFreeSlot, winner.currentPos - maximumMoveUp);
    arrangement = slideUp(arrangement, winner.currentPos, targetSlot);
    alreadyWon.add(winner.teamId);
    nextFreeSlot += 1;

    const seedFragment = `${seed}:lottery:draw:${drawNumber}`;
    const draw: LotteryDrawResult = {
      drawNumber,
      winningTeamId: winner.teamId,
      originalPosition: winner.currentPos,
      newPosition: targetSlot,
      weightSnapshot: weights[winner.originalWeightIndex] ?? 0,
      seedFragment,
      drawHash: '',
    };
    draw.drawHash = hashLottery({
      draws: [draw],
      finalFirstRoundOrder: arrangement,
      diagnostics: {
        eligibleTeamCount: participating,
        drawCount,
        maximumMoveUp,
        movedUp: [],
      },
      lotteryHash: '',
    });
    draws.push(draw);
  }

  const result: LotteryResult = {
    draws,
    finalFirstRoundOrder: arrangement,
    diagnostics: {
      eligibleTeamCount: participating,
      drawCount,
      maximumMoveUp,
      movedUp: draws.map((d) => ({ teamId: d.winningTeamId, from: d.originalPosition, to: d.newPosition })),
    },
    lotteryHash: '',
  };
  result.lotteryHash = hashLottery(result);
  return result;
}

function slideUp(arr: string[], from: number, to: number): string[] {
  if (to >= from) return arr.slice();
  const next = arr.slice();
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved!);
  return next;
}

/**
 * Apply a completed lottery to a draft order, producing a new order whose
 * first round matches the lottery's final order and whose later rounds follow
 * the config's `repeatSameOrderEachRound` rule.
 */
export function applyLotteryToOrder(
  config: DraftConfig,
  order: DraftOrderResult,
  lottery: LotteryResult,
): DraftOrderResult {
  const firstRoundTeams = lottery.finalFirstRoundOrder;
  const nameByTeam = new Map(order.picks.map((p) => [p.teamId, p.teamName]));
  const picks = order.picks.map((p) => ({ ...p }));
  const teamsPerRound = firstRoundTeams.length;
  for (let i = 0; i < picks.length; i += 1) {
    const overall = picks[i]!.overallPick;
    const round = Math.ceil(overall / teamsPerRound) || picks[i]!.roundNumber;
    const pickInRound = ((overall - 1) % teamsPerRound) + 1;
    const baseOrder = round === 1
      ? firstRoundTeams
      : config.order.repeatSameOrderEachRound
        ? firstRoundTeams
        : round % 2 === 1
          ? firstRoundTeams
          : [...firstRoundTeams].reverse();
    const teamId = baseOrder[pickInRound - 1] ?? picks[i]!.teamId;
    picks[i] = {
      ...picks[i]!,
      roundNumber: round,
      pickInRound,
      teamId,
      teamName: nameByTeam.get(teamId) ?? teamId,
    };
  }
  const result: DraftOrderResult = { picks, orderHash: '', source: order.source };
  result.orderHash = hashDraftOrder(result);
  return result;
}
