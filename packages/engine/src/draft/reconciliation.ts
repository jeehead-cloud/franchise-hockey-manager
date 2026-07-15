import type {
  DraftEligiblePlayer,
  DraftPickRecord,
  DraftReconciliationResult,
  DraftReconciliationIssue,
  PlayerDraftRightDto,
} from './types.js';
import { DraftError } from './types.js';

/**
 * Reconcile a completed (or in-progress) draft against its invariants before
 * the server publishes the result atomically. Used to refuse a corrupt draft
 * rather than persist partial state.
 *
 * Invariants:
 *   - pick numbers unique within the event;
 *   - one completed pick selects at most one player;
 *   - a player is drafted at most once;
 *   - every completed pick has exactly one matching ACTIVE right and vice versa;
 *   - selected players must be AVAILABLE (not already drafted) in the class.
 */
export function reconcileDraft(input: {
  picks: DraftPickRecord[];
  eligibilityClass: DraftEligiblePlayer[];
  rights: PlayerDraftRightDto[];
}): DraftReconciliationResult {
  const issues: DraftReconciliationIssue[] = [];

  // Unique overall pick numbers.
  const overallSeen = new Set<number>();
  for (const pick of input.picks) {
    if (overallSeen.has(pick.overallPick)) {
      issues.push({ code: 'DUPLICATE_OVERALL', message: `Duplicate overall pick ${pick.overallPick}` });
    }
    overallSeen.add(pick.overallPick);
  }
  // Unique (round, pickInRound).
  const slotSeen = new Set<string>();
  for (const pick of input.picks) {
    const key = `${pick.roundNumber}:${pick.pickInRound}`;
    if (slotSeen.has(key)) {
      issues.push({ code: 'DUPLICATE_SLOT', message: `Duplicate round/pick ${key}` });
    }
    slotSeen.add(key);
  }

  // One player drafted at most once.
  const draftedPlayers = new Map<string, DraftPickRecord>();
  for (const pick of input.picks) {
    if (pick.status === 'COMPLETED' && pick.selectedPlayerId) {
      if (draftedPlayers.has(pick.selectedPlayerId)) {
        issues.push({
          code: 'DUPLICATE_DRAFTED_PLAYER',
          message: `Player ${pick.selectedPlayerId} drafted more than once`,
        });
      }
      draftedPlayers.set(pick.selectedPlayerId, pick);
    }
  }

  // Selected players must be in the eligibility class.
  const classIds = new Set(input.eligibilityClass.map((p) => p.playerId));
  for (const [playerId] of draftedPlayers) {
    if (!classIds.has(playerId)) {
      issues.push({ code: 'PLAYER_NOT_ELIGIBLE', message: `Drafted player ${playerId} not in eligibility class` });
    }
  }

  // Completed picks ↔ ACTIVE rights (one-to-one).
  const activeRightsByPlayer = new Map<string, PlayerDraftRightDto>();
  for (const right of input.rights) {
    if (right.status !== 'ACTIVE') continue;
    if (activeRightsByPlayer.has(right.playerId)) {
      issues.push({
        code: 'DUPLICATE_ACTIVE_RIGHT',
        message: `Player ${right.playerId} has more than one ACTIVE draft right`,
      });
    }
    activeRightsByPlayer.set(right.playerId, right);
  }
  for (const [playerId, pick] of draftedPlayers) {
    if (!activeRightsByPlayer.has(playerId)) {
      issues.push({
        code: 'PICK_WITHOUT_RIGHT',
        message: `Completed pick ${pick.overallPick} (${playerId}) has no ACTIVE right`,
      });
    }
  }
  for (const [playerId, right] of activeRightsByPlayer) {
    if (!draftedPlayers.has(playerId)) {
      issues.push({
        code: 'RIGHT_WITHOUT_PICK',
        message: `ACTIVE right ${right.id} for ${playerId} has no matching completed pick`,
      });
    }
  }

  return { valid: issues.length === 0, issues };
}

export function assertDraftReconciliation(input: Parameters<typeof reconcileDraft>[0]): void {
  const result = reconcileDraft(input);
  if (!result.valid) {
    throw new DraftError(
      'DraftReconciliationFailed',
      `Reconciliation failed with ${result.issues.length} issue(s)`,
      result.issues,
    );
  }
}
