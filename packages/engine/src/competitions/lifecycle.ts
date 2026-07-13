import type { CompetitionEditionStatus } from './types.js';
import { CompetitionValidationError } from './types.js';

/** First-version allowed transitions. COMPLETED/ARCHIVED are reserved for later milestones but supported for manual lifecycle testing. */
const ALLOWED: Record<CompetitionEditionStatus, CompetitionEditionStatus[]> = {
  PLANNED: ['PREPARING', 'CANCELLED'],
  PREPARING: ['PLANNED', 'READY', 'CANCELLED'],
  READY: ['PREPARING', 'ACTIVE', 'CANCELLED'],
  ACTIVE: ['COMPLETED'],
  COMPLETED: ['ARCHIVED'],
  ARCHIVED: [],
  CANCELLED: [],
};

export function listAllowedEditionTransitions(
  from: CompetitionEditionStatus,
): CompetitionEditionStatus[] {
  return [...(ALLOWED[from] ?? [])];
}

export function canTransitionEditionStatus(
  from: CompetitionEditionStatus,
  to: CompetitionEditionStatus,
): boolean {
  return listAllowedEditionTransitions(from).includes(to);
}

export function assertEditionTransition(
  from: CompetitionEditionStatus,
  to: CompetitionEditionStatus,
): void {
  if (!canTransitionEditionStatus(from, to)) {
    throw new CompetitionValidationError(
      'INVALID_TRANSITION',
      `Cannot transition edition from ${from} to ${to}`,
    );
  }
}

/** Structural edits allowed only in PLANNED / PREPARING. READY requires revert to PREPARING. */
export function isEditionStructurallyEditable(status: CompetitionEditionStatus): boolean {
  return status === 'PLANNED' || status === 'PREPARING';
}

export function assertEditionStructurallyEditable(status: CompetitionEditionStatus): void {
  if (!isEditionStructurallyEditable(status)) {
    throw new CompetitionValidationError(
      'EDITION_LOCKED',
      `Edition status ${status} does not allow structural edits`,
    );
  }
}

/** Transitions that require a passing readiness check. */
export function transitionRequiresReadiness(to: CompetitionEditionStatus): boolean {
  return to === 'READY' || to === 'ACTIVE';
}
