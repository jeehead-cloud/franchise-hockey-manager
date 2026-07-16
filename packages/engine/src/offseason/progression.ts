import type {
  OffseasonConfig,
  OffseasonPhaseState,
  OffseasonPhaseStatus,
  OffseasonPhaseType,
  OffseasonRunState,
  OffseasonRunStatus,
} from './types.js';
import { OffseasonError } from './types.js';
import { dependenciesMet, unmetDependencies } from './dependencies.js';

/**
 * F30 progression — state-machine transitions for run + phase rows.
 *
 * The engine only validates and computes the resulting status; persistence is
 * the server's job. Every transition is deterministic from the inputs and
 * idempotent — calling `transitionPhase` to a status the phase already holds
 * returns the same status without raising.
 *
 * Invariants enforced here:
 * - COMPLETED phases are immutable;
 * - SKIPPED phases cannot be unskipped;
 * - required phases cannot be skipped;
 * - a phase cannot start before its dependencies complete;
 * - run cannot be completed if required phases are unfinished or a blocker
 *   remains;
 * - run COMPLETED is terminal.
 */

const TERMINAL_RUN = new Set<OffseasonRunStatus>(['COMPLETED', 'CANCELLED', 'FAILED']);

// ---------------------------------------------------------------------------
// Phase transitions
// ---------------------------------------------------------------------------

export function canTransitionPhase(
  from: OffseasonPhaseStatus | undefined,
  to: OffseasonPhaseStatus,
  required: boolean,
  allowSkip: boolean,
): boolean {
  if (from === to) return true;
  if (from === 'COMPLETED') return false;
  if (from === 'SKIPPED') return false;
  switch (to) {
    case 'READY':
      return from === 'PENDING' || from === 'BLOCKED';
    case 'IN_PROGRESS':
      return from === 'READY' || from === 'PENDING' || from === 'BLOCKED';
    case 'COMPLETED':
      return from === 'IN_PROGRESS' || from === 'READY' || from === 'PENDING';
    case 'SKIPPED':
      if (required || !allowSkip) return false;
      return from === 'READY' || from === 'PENDING' || from === 'BLOCKED';
    case 'FAILED':
      return from === 'IN_PROGRESS';
    case 'BLOCKED':
      return from === 'PENDING' || from === 'READY' || from === 'IN_PROGRESS';
    case 'PENDING':
      // Only allow a FAILED phase to be reset back to a retryable state via retry.
      return from === 'FAILED';
    default:
      return false;
  }
}

export interface PhaseTransitionInput {
  phaseType: OffseasonPhaseType;
  to: OffseasonPhaseStatus;
  phases: OffseasonPhaseState[];
  config: OffseasonConfig;
}

export function assertPhaseTransition(input: PhaseTransitionInput): void {
  const { phaseType, to, phases, config } = input;
  const def = config.phases.find((p) => p.type === phaseType);
  if (!def) throw new OffseasonError('UnknownOffseasonPhase', `Unknown phase type ${phaseType}`);
  const row = phases.find((p) => p.phaseType === phaseType);
  if (!row) {
    throw new OffseasonError('OffseasonPhaseNotFound', `Phase ${phaseType} not found in run`);
  }
  if (to === 'SKIPPED' && (def.required || !def.allowSkip)) {
    throw new OffseasonError(
      'OffseasonPhaseCannotSkip',
      `Phase ${phaseType} is required and cannot be skipped`,
    );
  }
  if (row.status === 'COMPLETED') {
    throw new OffseasonError('OffseasonPhaseCompleted', `Phase ${phaseType} is already completed`);
  }
  if (row.status === 'SKIPPED') {
    throw new OffseasonError('OffseasonPhaseCompleted', `Phase ${phaseType} is already skipped`);
  }
  // Dependency gate — a phase cannot start before its dependencies complete.
  if (to === 'IN_PROGRESS' || to === 'COMPLETED') {
    const unmet = unmetDependencies(config, phaseType, phases);
    if (unmet.length > 0) {
      throw new OffseasonError(
        'OffseasonPhaseDependencyIncomplete',
        `Phase ${phaseType} requires phases to complete first: ${unmet.join(', ')}`,
        { unmet },
      );
    }
  }
  if (!canTransitionPhase(row.status, to, def.required, def.allowSkip)) {
    throw new OffseasonError(
      'OffseasonPhaseNotReady',
      `Phase ${phaseType} cannot transition ${row.status} → ${to}`,
    );
  }
}

// ---------------------------------------------------------------------------
// Run transitions
// ---------------------------------------------------------------------------

export function canTransitionRun(from: OffseasonRunStatus, to: OffseasonRunStatus): boolean {
  if (from === to) return true;
  if (from === 'COMPLETED') return false;
  if (from === 'CANCELLED') return false;
  switch (to) {
    case 'READY':
      return from === 'PLANNED';
    case 'IN_PROGRESS':
      return from === 'PLANNED' || from === 'READY' || from === 'BLOCKED';
    case 'BLOCKED':
      return from === 'IN_PROGRESS' || from === 'READY';
    case 'COMPLETED':
      return from === 'IN_PROGRESS' || from === 'READY' || from === 'BLOCKED';
    case 'CANCELLED':
      return from !== 'FAILED';
    case 'FAILED':
      return from === 'IN_PROGRESS' || from === 'BLOCKED';
    default:
      return false;
  }
}

export function assertRunTransition(from: OffseasonRunStatus, to: OffseasonRunStatus): void {
  if (!canTransitionRun(from, to)) {
    throw new OffseasonError('OffseasonRunNotEditable', `Run cannot transition ${from} → ${to}`);
  }
}

export function isTerminalRunStatus(status: OffseasonRunStatus): boolean {
  return TERMINAL_RUN.has(status);
}

// ---------------------------------------------------------------------------
// Derived state helpers
// ---------------------------------------------------------------------------

/**
 * Select the next actionable phase for a run: the earliest phase that is not
 * yet COMPLETED or SKIPPED. Returns null when all phases are resolved.
 */
export function selectCurrentPhase(state: OffseasonRunState): OffseasonPhaseState | null {
  const ordered = [...state.phases].sort((a, b) => a.order - b.order);
  for (const p of ordered) {
    if (p.status !== 'COMPLETED' && p.status !== 'SKIPPED') return p;
  }
  return null;
}

/** Completion percentage across phases (COMPLETED + SKIPPED count as resolved). */
export function progressPercent(state: OffseasonRunState): number {
  if (!state.phases.length) return 0;
  const done = state.phases.filter(
    (p) => p.status === 'COMPLETED' || p.status === 'SKIPPED',
  ).length;
  return Math.round((done / state.phases.length) * 100);
}

export interface RunReadinessSummary {
  allRequiredComplete: boolean;
  allOptionalResolved: boolean;
  hasFailedPhase: boolean;
  hasIncompleteRequiredPhase: boolean;
  failedPhases: OffseasonPhaseType[];
}

export function summarizeRunPhases(state: OffseasonRunState, config: OffseasonConfig): RunReadinessSummary {
  const byType = new Map(state.phases.map((p) => [p.phaseType, p]));
  let allRequiredComplete = true;
  let allOptionalResolved = true;
  let hasFailedPhase = false;
  let hasIncompleteRequiredPhase = false;
  const failedPhases: OffseasonPhaseType[] = [];
  for (const def of config.phases) {
    const row = byType.get(def.type);
    if (!row) {
      if (def.required) allRequiredComplete = false;
      allOptionalResolved = false;
      continue;
    }
    if (row.status === 'FAILED') {
      hasFailedPhase = true;
      failedPhases.push(def.type);
      if (def.required) {
        allRequiredComplete = false;
        hasIncompleteRequiredPhase = true;
      } else {
        allOptionalResolved = false;
      }
      continue;
    }
    if (row.status === 'COMPLETED' || row.status === 'SKIPPED') continue;
    if (def.required) {
      allRequiredComplete = false;
      hasIncompleteRequiredPhase = true;
    } else {
      allOptionalResolved = false;
    }
  }
  return {
    allRequiredComplete,
    allOptionalResolved,
    hasFailedPhase,
    hasIncompleteRequiredPhase,
    failedPhases,
  };
}

/**
 * Whether a phase is currently startable: dependencies met, not terminal, not
 * currently failed. Used by the readiness aggregator.
 */
export function isPhaseStartable(
  config: OffseasonConfig,
  phaseType: OffseasonPhaseType,
  phases: OffseasonPhaseState[],
): boolean {
  const row = phases.find((p) => p.phaseType === phaseType);
  if (!row) return false;
  if (row.status === 'COMPLETED' || row.status === 'SKIPPED' || row.status === 'FAILED') return false;
  return dependenciesMet(config, phaseType, phases);
}
