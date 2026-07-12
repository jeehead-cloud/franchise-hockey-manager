import { SLOT_REQUIRED_POSITION, isSkaterPosition } from './slots.js';
import type {
  LineupCandidate,
  LineupPosition,
  LineupSlot,
  LineupValidationIssue,
} from './types.js';

export type PositionFit = 'PRIMARY' | 'SECONDARY' | 'NONE';

export function validateSecondaryPositions(
  primary: LineupPosition,
  secondary: LineupPosition[],
): LineupValidationIssue[] {
  const errors: LineupValidationIssue[] = [];
  if (primary === 'G') {
    if (secondary.length > 0) {
      errors.push({
        code: 'GOALIE_SECONDARY',
        severity: 'error',
        message: 'Goalies may not have secondary positions.',
      });
    }
    return errors;
  }
  const seen = new Set<string>();
  for (const pos of secondary) {
    if (!isSkaterPosition(pos)) {
      errors.push({
        code: 'INVALID_SECONDARY',
        severity: 'error',
        message: `Secondary position ${pos} is not allowed.`,
      });
      continue;
    }
    if (pos === primary) {
      errors.push({
        code: 'SECONDARY_DUPLICATES_PRIMARY',
        severity: 'error',
        message: 'Secondary position must not duplicate primary position.',
      });
    }
    if (seen.has(pos)) {
      errors.push({
        code: 'DUPLICATE_SECONDARY',
        severity: 'error',
        message: `Duplicate secondary position ${pos}.`,
      });
    }
    seen.add(pos);
  }
  return errors;
}

export function positionFit(candidate: LineupCandidate, slot: LineupSlot): PositionFit {
  const required = SLOT_REQUIRED_POSITION[slot];
  if (required === 'G') {
    return candidate.primaryPosition === 'G' ? 'PRIMARY' : 'NONE';
  }
  if (candidate.primaryPosition === 'G') return 'NONE';
  if (candidate.primaryPosition === required) return 'PRIMARY';
  if (candidate.secondaryPositions.includes(required)) return 'SECONDARY';
  return 'NONE';
}

export function isEligibleForLineup(candidate: LineupCandidate): boolean {
  if (candidate.rosterStatus === 'PROSPECT' || candidate.rosterStatus === 'UNAVAILABLE') {
    return false;
  }
  if (candidate.modelStatus !== 'COMPLETE') return false;
  return true;
}

export function eligibilityRejectionReason(candidate: LineupCandidate): string | null {
  if (candidate.rosterStatus === 'PROSPECT') return 'PROSPECT players cannot be assigned to the main lineup.';
  if (candidate.rosterStatus === 'UNAVAILABLE') {
    return 'UNAVAILABLE players cannot be assigned to the main lineup.';
  }
  if (candidate.modelStatus !== 'COMPLETE') return 'Incomplete player model cannot be assigned.';
  return null;
}

/** Stable ranking: ability desc, roleRating desc, id asc. */
export function compareCandidates(a: LineupCandidate, b: LineupCandidate): number {
  const ca = a.currentAbility ?? -1;
  const cb = b.currentAbility ?? -1;
  if (cb !== ca) return cb - ca;
  const ra = a.roleRating ?? -1;
  const rb = b.roleRating ?? -1;
  if (rb !== ra) return rb - ra;
  return a.id.localeCompare(b.id);
}
