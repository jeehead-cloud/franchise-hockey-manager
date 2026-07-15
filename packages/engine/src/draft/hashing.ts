import { sortJsonValue } from '../balance/canonicalize.js';
import { stableDigest } from '../simulation/batch/hash.js';
import type {
  DraftBoardSnapshot,
  DraftConfig,
  DraftEligiblePlayer,
  DraftOrderResult,
  DraftPickRecord,
  LotteryResult,
} from './types.js';

/** Deterministic digest for any draft value. */
export function stableDraftHash(value: unknown): string {
  return stableDigest(JSON.stringify(sortJsonValue(value)));
}

export function hashDraftConfig(config: DraftConfig): string {
  return stableDraftHash(config);
}

export function hashEligiblePlayer(player: DraftEligiblePlayer): string {
  return stableDraftHash({
    playerId: player.playerId,
    displayName: player.displayName,
    dateOfBirth: player.dateOfBirth,
    ageOnCutoffDate: player.ageOnCutoffDate,
    lifecycleStatus: player.lifecycleStatus,
    sourceType: player.sourceType,
    countrySnapshot: player.countrySnapshot,
    positionSnapshot: player.positionSnapshot,
  });
}

export function hashEligibilityClass(players: DraftEligiblePlayer[]): string {
  return stableDraftHash({
    count: players.length,
    playerHashes: players.map((p) => p.eligibilityHash).sort(),
  });
}

export function hashDraftOrder(order: DraftOrderResult): string {
  return stableDraftHash({
    source: order.source,
    picks: order.picks.map((p) => ({
      roundNumber: p.roundNumber,
      pickInRound: p.pickInRound,
      overallPick: p.overallPick,
      teamId: p.teamId,
    })),
  });
}

export function hashLottery(lottery: LotteryResult): string {
  return stableDraftHash({
    draws: lottery.draws.map((d) => ({
      drawNumber: d.drawNumber,
      winningTeamId: d.winningTeamId,
      originalPosition: d.originalPosition,
      newPosition: d.newPosition,
      weightSnapshot: d.weightSnapshot,
      seedFragment: d.seedFragment,
    })),
    finalFirstRoundOrder: lottery.finalFirstRoundOrder,
  });
}

export function hashDraftBoard(board: DraftBoardSnapshot): string {
  return stableDraftHash({
    teamId: board.teamId,
    entries: board.entries.map((e) => ({
      playerId: e.playerId,
      estimatedCurrentAbility: e.estimatedCurrentAbility,
      estimatedPotential: e.estimatedPotential,
      projectedRole: e.projectedRole,
      confidence: e.confidence,
      stale: e.stale,
      risk: e.risk,
      watchlistPriority: e.watchlistPriority,
      manualRank: e.manualRank,
      suggestedRank: e.suggestedRank,
      drafted: e.drafted,
    })),
  });
}

/** Result hash — recomputed at completion from pick outcomes. */
export function hashDraftResult(input: {
  draftEventId: string;
  picks: DraftPickRecord[];
}): string {
  return stableDraftHash({
    draftEventId: input.draftEventId,
    selections: input.picks
      .filter((p) => p.status === 'COMPLETED' && p.selectedPlayerId)
      .map((p) => ({
        overallPick: p.overallPick,
        teamId: p.teamId,
        selectedPlayerId: p.selectedPlayerId,
        selectionSource: p.selectionSource,
      }))
      .sort((a, b) => a.overallPick - b.overallPick),
  });
}
