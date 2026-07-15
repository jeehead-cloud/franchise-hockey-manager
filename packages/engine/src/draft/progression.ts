import type { DraftPickRecord, PickStatus, ProgressionInput, ProgressionResult } from './types.js';

/**
 * Pure draft progression helper. The server owns persistence; this module
 * answers: given the current pick list and the set of AVAILABLE players, which
 * pick is on the clock, and is the draft complete?
 *
 * "On the clock" is state only — there is no real-time timer in F27.
 */
export function evaluateProgression(input: ProgressionInput): ProgressionResult {
  const picks = input.picks;
  const completedSelections = picks.filter((p) => p.status === 'COMPLETED').length;
  const remainingPicks = picks.filter((p) => p.status === 'PENDING' || p.status === 'ON_THE_CLOCK').length;

  // Find the first PENDING pick to mark as on-the-clock. Picks already
  // persisted as ON_THE_CLOCK take precedence so the caller can record state.
  let current: DraftPickRecord | null = null;
  const onClock = picks.find((p) => p.status === 'ON_THE_CLOCK');
  if (onClock) {
    current = onClock;
  } else {
    const nextPending = picks.find((p) => p.status === 'PENDING');
    if (nextPending) {
      current = { ...nextPending };
      current.status = 'ON_THE_CLOCK' as PickStatus;
    }
  }

  const noAvailableProspects = input.availablePlayerIds.length === 0;
  const completed = remainingPicks === 0 || (current === null && noAvailableProspects) || noAvailableProspects;

  return {
    currentPick: current,
    completed,
    remainingPicks,
    completedSelections,
  };
}

/**
 * Return the next pick that should become ON_THE_CLOCK after a completion.
 * Pure projection; the server persists the transition inside its transaction.
 */
export function nextPickAfter(picks: DraftPickRecord[], completedOverallPick: number): DraftPickRecord | null {
  return picks.find((p) => p.overallPick > completedOverallPick && (p.status === 'PENDING' || p.status === 'ON_THE_CLOCK')) ?? null;
}
