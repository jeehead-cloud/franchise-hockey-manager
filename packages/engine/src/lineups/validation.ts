import {
  LINEUP_REQUIRED_SLOT_COUNT,
  LINEUP_SLOTS,
  isLineupSlot,
  SLOT_REQUIRED_POSITION,
} from './slots.js';
import {
  eligibilityRejectionReason,
  isEligibleForLineup,
  positionFit,
} from './eligibility.js';
import type {
  LineupAssignmentInput,
  LineupCandidate,
  LineupSlot,
  LineupValidationIssue,
  LineupValidationResult,
} from './types.js';

export interface ValidateLineupInput {
  assignments: LineupAssignmentInput[];
  /** Team roster candidates keyed by id (must include assigned players). */
  candidatesById: Map<string, LineupCandidate>;
}

/**
 * Validates a lineup snapshot. Does not mutate input.
 * Assignment order does not affect the result (sorted internally for determinism).
 */
export function validateLineup(input: ValidateLineupInput): LineupValidationResult {
  const errors: LineupValidationIssue[] = [];
  const warnings: LineupValidationIssue[] = [];

  const bySlot = new Map<LineupSlot, string>();
  const playerSlots = new Map<string, LineupSlot[]>();

  const sorted = [...input.assignments].sort((a, b) => a.slot.localeCompare(b.slot));

  for (const row of sorted) {
    if (!isLineupSlot(row.slot)) {
      errors.push({
        code: 'UNKNOWN_SLOT',
        severity: 'error',
        message: `Unknown lineup slot: ${row.slot}`,
      });
      continue;
    }
    if (bySlot.has(row.slot)) {
      errors.push({
        code: 'DUPLICATE_SLOT',
        severity: 'error',
        slot: row.slot,
        message: `Slot ${row.slot} is assigned more than once.`,
      });
      continue;
    }
    bySlot.set(row.slot, row.playerId);

    const slots = playerSlots.get(row.playerId) ?? [];
    slots.push(row.slot);
    playerSlots.set(row.playerId, slots);
  }

  for (const [playerId, slots] of playerSlots) {
    if (slots.length > 1) {
      errors.push({
        code: 'DUPLICATE_PLAYER',
        severity: 'error',
        playerId,
        message: `Player ${playerId} occupies multiple slots: ${slots.join(', ')}.`,
      });
    }
  }

  for (const [slot, playerId] of bySlot) {
    const candidate = input.candidatesById.get(playerId);
    if (!candidate) {
      errors.push({
        code: 'UNKNOWN_PLAYER',
        severity: 'error',
        slot,
        playerId,
        message: `Unknown or non-roster player ${playerId} in ${slot}.`,
      });
      continue;
    }

    const reject = eligibilityRejectionReason(candidate);
    if (reject) {
      errors.push({
        code:
          candidate.rosterStatus === 'PROSPECT'
            ? 'PROSPECT_ASSIGNED'
            : candidate.rosterStatus === 'UNAVAILABLE'
              ? 'UNAVAILABLE_ASSIGNED'
              : 'INCOMPLETE_MODEL_ASSIGNED',
        severity: 'error',
        slot,
        playerId,
        message: reject,
      });
      continue;
    }

    if (!isEligibleForLineup(candidate)) {
      errors.push({
        code: 'INELIGIBLE_PLAYER',
        severity: 'error',
        slot,
        playerId,
        message: `Player ${playerId} is not eligible for the main lineup.`,
      });
      continue;
    }

    const fit = positionFit(candidate, slot);
    if (fit === 'NONE') {
      const required = SLOT_REQUIRED_POSITION[slot];
      errors.push({
        code: 'POSITION_MISMATCH',
        severity: 'error',
        slot,
        playerId,
        message: `Player ${playerId} is incompatible with ${slot} (requires ${required}).`,
      });
      continue;
    }

    if (fit === 'SECONDARY') {
      warnings.push({
        code: 'SECONDARY_POSITION_USED',
        severity: 'warning',
        slot,
        playerId,
        message: `Player uses secondary position for ${slot}.`,
      });
    }
    if (candidate.rosterStatus === 'RESERVE') {
      warnings.push({
        code: 'RESERVE_USED',
        severity: 'warning',
        slot,
        playerId,
        message: `Reserve player assigned to ${slot}.`,
      });
    }
  }

  const filledSlots = bySlot.size;
  const emptySlots = LINEUP_SLOTS.filter((s) => !bySlot.has(s));
  if (emptySlots.length > 0 && errors.length === 0) {
    for (const slot of emptySlots) {
      warnings.push({
        code: 'EMPTY_SLOT',
        severity: 'warning',
        slot,
        message: `Slot ${slot} is empty.`,
      });
    }
  }

  let eligiblePlayerCount = 0;
  for (const c of input.candidatesById.values()) {
    if (isEligibleForLineup(c)) eligiblePlayerCount += 1;
  }

  let status: LineupValidationResult['status'] = 'VALID';
  if (errors.length > 0) status = 'INVALID';
  else if (filledSlots < LINEUP_REQUIRED_SLOT_COUNT) status = 'INCOMPLETE';

  return {
    status,
    errors,
    warnings,
    filledSlots,
    requiredSlots: LINEUP_REQUIRED_SLOT_COUNT,
    eligiblePlayerCount,
  };
}
