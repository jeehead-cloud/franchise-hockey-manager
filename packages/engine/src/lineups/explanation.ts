import type { AutoLineupExplanation, LineupValidationResult } from './types.js';

/** Human-readable auto-lineup summary for audit / UI (no chemistry claims). */
export function summarizeAutoLineupExplanation(explanation: AutoLineupExplanation[]): string {
  const filled = explanation.filter((e) => e.selectedPlayerId).length;
  const empty = explanation.length - filled;
  return `Auto-lineup filled ${filled} of ${explanation.length} slots (${empty} empty). Selection used position fit, current ability, role rating tie-break, and stable player id — not chemistry.`;
}

export function summarizeValidation(result: LineupValidationResult): string {
  return `status=${result.status}; filled=${result.filledSlots}/${result.requiredSlots}; errors=${result.errors.length}; warnings=${result.warnings.length}`;
}
