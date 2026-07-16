import type {
  TradePickEligibilityInput,
  TradePlayerEligibilityInput,
  TradeRightEligibilityInput,
  TradeEligibilityResult,
} from './types.js';

const retired = (s: string) => s === 'RETIRED';
const fail = (reason: string): TradeEligibilityResult => ({ eligible: false, reasons: [reason] });
const ok = (): TradeEligibilityResult => ({ eligible: true, reasons: [] });

/** Signed-player trade eligibility (PLAYER_CONTRACT asset). */
export function assertPlayerTradeEligibility(input: TradePlayerEligibilityInput): TradeEligibilityResult {
  if (retired(input.rosterStatus)) return fail('Player is retired');
  if (input.currentTeamId !== input.sourceTeamId) return fail('Player is not currently owned by the source team');
  if (!input.activeContractId || !input.activeContractTeamId) return fail('Player has no active contract');
  if (input.activeContractTeamId !== input.sourceTeamId) return fail('Active contract is not held by the source team');
  if (input.currentTeamId !== input.activeContractTeamId) return fail('Active contract ownership does not match current team');
  if (input.hasFutureContract && input.futureContractTeamId && input.futureContractTeamId !== input.sourceTeamId) {
    return fail('Future contract is held by a different team');
  }
  return ok();
}

/**
 * Draft-pick trade eligibility. F29 simplification: only PENDING picks may be
 * traded, and once a DraftEvent is IN_PROGRESS pick trades are blocked entirely.
 * Completed picks are historical and never tradeable.
 */
export function assertPickTradeEligibility(input: TradePickEligibilityInput): TradeEligibilityResult {
  if (input.pickStatus === 'COMPLETED' || input.pickStatus === 'PASSED' || input.pickStatus === 'CANCELLED') {
    return fail('Draft pick is no longer pending (historical/completed picks cannot be traded)');
  }
  if (input.pickStatus === 'ON_THE_CLOCK') return fail('Draft pick is on the clock and cannot be traded');
  if (input.draftEventStatus === 'IN_PROGRESS') return fail('Draft event is in progress; pick trades are blocked');
  if (input.draftEventStatus === 'COMPLETED' || input.draftEventStatus === 'CANCELLED') {
    return fail('Draft event is not active');
  }
  if (input.currentTeamId !== input.sourceTeamId) return fail('Draft pick is not currently owned by the source team');
  return ok();
}

/** ACTIVE draft-right trade eligibility. Converted/expired/renounced rights are blocked. */
export function assertRightTradeEligibility(input: TradeRightEligibilityInput): TradeEligibilityResult {
  if (input.status !== 'ACTIVE') return fail('Draft right is not active (converted/expired/renounced rights cannot be traded)');
  if (input.teamId !== input.sourceTeamId) return fail('Draft right is not currently held by the source team');
  if (input.playerCurrentTeamId !== null) return fail('Player is already signed; the right should no longer be active');
  return ok();
}

/** True when an eligibility result failed (convenience for tests). */
export const isEligible = (r: TradeEligibilityResult) => r.eligible;
