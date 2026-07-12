import { compareCandidates, isEligibleForLineup, positionFit } from './eligibility.js';
import {
  DEFENSE_LD_SLOTS,
  DEFENSE_RD_SLOTS,
  FORWARD_C_SLOTS,
  FORWARD_LW_SLOTS,
  FORWARD_RW_SLOTS,
  GOALIE_SLOTS,
  LINEUP_SLOTS,
  SLOT_REQUIRED_POSITION,
} from './slots.js';
import { validateLineup } from './validation.js';
import type {
  AutoLineupExplanation,
  AutoLineupMode,
  AutoLineupResult,
  LineupAssignmentInput,
  LineupCandidate,
  LineupSlot,
  LineupValidationIssue,
} from './types.js';

export interface AutoLineupInput {
  candidates: LineupCandidate[];
  mode: AutoLineupMode;
  /** Existing assignments (used for FILL_EMPTY; ignored for REPLACE). */
  existingAssignments?: LineupAssignmentInput[];
}

function sortByStrength(ids: string[], byId: Map<string, LineupCandidate>): string[] {
  return [...ids].sort((a, b) => {
    const ca = byId.get(a)!;
    const cb = byId.get(b)!;
    return compareCandidates(ca, cb);
  });
}

function pickForSlots(
  slots: readonly LineupSlot[],
  pool: LineupCandidate[],
  used: Set<string>,
  preferPrimary: boolean,
): { assignments: LineupAssignmentInput[]; explanation: AutoLineupExplanation[] } {
  const assignments: LineupAssignmentInput[] = [];
  const explanation: AutoLineupExplanation[] = [];

  const ranked = [...pool]
    .filter((c) => !used.has(c.id) && isEligibleForLineup(c))
    .sort(compareCandidates);

  // Prefer primary-fit players for higher lines first.
  const primaryFirst = ranked.filter((c) =>
    slots.some((slot) => positionFit(c, slot) === 'PRIMARY'),
  );
  const secondaryOnly = ranked.filter(
    (c) =>
      !primaryFirst.includes(c) &&
      slots.some((slot) => positionFit(c, slot) === 'SECONDARY'),
  );
  const ordered = preferPrimary ? [...primaryFirst, ...secondaryOnly] : ranked;

  const selected: string[] = [];
  for (const candidate of ordered) {
    if (selected.length >= slots.length) break;
    const canFit = slots.some((slot) => positionFit(candidate, slot) !== 'NONE');
    if (!canFit) continue;
    selected.push(candidate.id);
  }

  const orderedSelected = sortByStrength(selected, new Map(pool.map((c) => [c.id, c])));

  for (let i = 0; i < slots.length; i += 1) {
    const slot = slots[i]!;
    const playerId = orderedSelected[i];
    if (!playerId) {
      explanation.push({
        slot,
        selectedPlayerId: null,
        reasons: [`No eligible ${SLOT_REQUIRED_POSITION[slot]} remaining.`],
      });
      continue;
    }
    const candidate = pool.find((c) => c.id === playerId)!;
    const fit = positionFit(candidate, slot);
    used.add(playerId);
    assignments.push({ slot, playerId });
    explanation.push({
      slot,
      selectedPlayerId: playerId,
      reasons: [
        `Ranked by current ability then role rating (ability=${candidate.currentAbility ?? 'n/a'}).`,
        fit === 'PRIMARY' ? 'Primary-position fit.' : 'Secondary-position fit.',
        `Assigned to ${slot} by strength order among selected ${SLOT_REQUIRED_POSITION[slot]} pool.`,
      ],
    });
  }

  return { assignments, explanation };
}

/**
 * Deterministic auto-lineup. Same candidate set + mode + existing assignments → same output.
 */
export function generateAutoLineup(input: AutoLineupInput): AutoLineupResult {
  const byId = new Map(input.candidates.map((c) => [c.id, c]));
  const used = new Set<string>();
  const assignments: LineupAssignmentInput[] = [];
  const explanation: AutoLineupExplanation[] = [];
  const warnings: LineupValidationIssue[] = [];

  if (input.mode === 'FILL_EMPTY' && input.existingAssignments?.length) {
    const validation = validateLineup({
      assignments: input.existingAssignments,
      candidatesById: byId,
    });
    // Preserve only non-error assignments; drop invalid ones from the preserved set
    // but do not mutate DB here — FILL_EMPTY fills around valid existing slots.
    const errorSlots = new Set(
      validation.errors.filter((e) => e.slot).map((e) => e.slot as LineupSlot),
    );
    for (const row of input.existingAssignments) {
      if (errorSlots.has(row.slot)) {
        warnings.push({
          code: 'EXISTING_INVALID_SKIPPED',
          severity: 'warning',
          slot: row.slot,
          playerId: row.playerId,
          message: `Existing assignment for ${row.slot} is invalid and was not preserved for fill.`,
        });
        continue;
      }
      if (used.has(row.playerId)) continue;
      used.add(row.playerId);
      assignments.push(row);
      explanation.push({
        slot: row.slot,
        selectedPlayerId: row.playerId,
        reasons: ['Preserved existing assignment (FILL_EMPTY).'],
      });
    }
  }

  const filled = new Set(assignments.map((a) => a.slot));
  const need = (slots: readonly LineupSlot[]) => slots.filter((s) => !filled.has(s));

  const steps: { slots: readonly LineupSlot[]; filter: (c: LineupCandidate) => boolean }[] = [
    {
      slots: need(GOALIE_SLOTS),
      filter: (c) => c.primaryPosition === 'G',
    },
    {
      slots: need(FORWARD_C_SLOTS),
      filter: (c) => positionFit(c, 'F1_C') !== 'NONE',
    },
    {
      slots: need(FORWARD_LW_SLOTS),
      filter: (c) => positionFit(c, 'F1_LW') !== 'NONE',
    },
    {
      slots: need(FORWARD_RW_SLOTS),
      filter: (c) => positionFit(c, 'F1_RW') !== 'NONE',
    },
    {
      slots: need(DEFENSE_LD_SLOTS),
      filter: (c) => positionFit(c, 'D1_LD') !== 'NONE',
    },
    {
      slots: need(DEFENSE_RD_SLOTS),
      filter: (c) => positionFit(c, 'D1_RD') !== 'NONE',
    },
  ];

  for (const step of steps) {
    if (step.slots.length === 0) continue;
    const pool = input.candidates.filter(step.filter);
    const result = pickForSlots(step.slots, pool, used, true);
    assignments.push(...result.assignments);
    explanation.push(...result.explanation);
  }

  // Ensure explanation covers every slot for REPLACE/FILL completeness reporting
  const explained = new Set(explanation.map((e) => e.slot));
  for (const slot of LINEUP_SLOTS) {
    if (!explained.has(slot) && !assignments.some((a) => a.slot === slot)) {
      explanation.push({
        slot,
        selectedPlayerId: null,
        reasons: ['Slot left empty.'],
      });
    }
  }

  explanation.sort((a, b) => a.slot.localeCompare(b.slot));
  assignments.sort((a, b) => a.slot.localeCompare(b.slot));

  const unfilledSlots = LINEUP_SLOTS.filter((s) => !assignments.some((a) => a.slot === s));
  for (const slot of unfilledSlots) {
    warnings.push({
      code: 'UNFILLED_SLOT',
      severity: 'warning',
      slot,
      message: `Auto-lineup could not fill ${slot}.`,
    });
  }

  return { assignments, unfilledSlots: [...unfilledSlots], warnings, explanation };
}
