/**
 * F30 — Offseason Workflow pure engine types.
 *
 * The engine owns: strict versioned offseason configuration validation, the
 * explicit phase order, the dependency graph, phase-state transitions, run
 * completion rules, readiness aggregation from domain-neutral inputs, phase
 * reconciliation, and stable hashes. It is pure coordination logic — it never
 * invokes F20/F24/F25/F27/F28/F29 domain operations, never imports Prisma, and
 * never carries hidden Player truth.
 *
 * F30 orchestrates existing subsystems through their own services; the engine
 * only validates progression and aggregates readiness from DTOs the server
 * supplies. Repeated refresh / link / completion calls are idempotent at the
 * engine level (the server layers the persistence dedupe on top).
 */

export const OFFSEASON_SCHEMA_VERSION = 1 as const;

export class OffseasonError extends Error {
  constructor(
    public code: string,
    message: string,
    public details?: unknown,
  ) {
    super(message);
    this.name = 'OffseasonError';
  }
}

// ---------------------------------------------------------------------------
// Phase types
// ---------------------------------------------------------------------------

export type OffseasonPhaseType =
  | 'COMPETITION_ARCHIVE'
  | 'CONTRACT_EXPIRATION'
  | 'PLAYER_DEVELOPMENT'
  | 'RETIREMENT_REVIEW'
  | 'YOUTH_GENERATION'
  | 'DRAFT'
  | 'DRAFTED_PLAYER_SIGNINGS'
  | 'FREE_AGENCY'
  | 'TRADES'
  | 'ROSTER_REVIEW'
  | 'LINEUP_REVIEW'
  | 'SCOUTING_REVIEW'
  | 'FINAL_REVIEW';

/** Canonical phase order used by the default config and the verifier. */
export const OFFSEASON_PHASE_ORDER: readonly OffseasonPhaseType[] = [
  'COMPETITION_ARCHIVE',
  'CONTRACT_EXPIRATION',
  'PLAYER_DEVELOPMENT',
  'RETIREMENT_REVIEW',
  'YOUTH_GENERATION',
  'DRAFT',
  'DRAFTED_PLAYER_SIGNINGS',
  'FREE_AGENCY',
  'TRADES',
  'ROSTER_REVIEW',
  'LINEUP_REVIEW',
  'SCOUTING_REVIEW',
  'FINAL_REVIEW',
] as const;

/** Automated/reference phases invoke/link a domain run. Interactive need confirmation. */
export const AUTOMATED_OFFSEASON_PHASES: ReadonlySet<OffseasonPhaseType> = new Set([
  'COMPETITION_ARCHIVE',
  'CONTRACT_EXPIRATION',
  'PLAYER_DEVELOPMENT',
  'YOUTH_GENERATION',
]);

/** Phase category label for UI hints. */
export function phaseCategory(type: OffseasonPhaseType): 'AUTOMATED' | 'INTERACTIVE' {
  return AUTOMATED_OFFSEASON_PHASES.has(type) ? 'AUTOMATED' : 'INTERACTIVE';
}

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

export interface OffseasonPhaseConfig {
  type: OffseasonPhaseType;
  required: boolean;
  allowSkip: boolean;
}

export interface OffseasonCompletionRules {
  requireArchivedCompletedCompetitions: boolean;
  requireContractExpirationProcessed: boolean;
  requireDevelopmentRun: boolean;
  requireYouthGenerationRun: boolean;
  requireDraftCompleted: boolean;
  requireNoRetiredPlayersInActiveLineups: boolean;
  requireNoOwnershipMismatchInLineups: boolean;
  requireNoDuplicateActiveContracts: boolean;
  allowUnsignedDraftRights: boolean;
  allowFreeAgents: boolean;
  allowOpenTradeProposals: boolean;
  allowSubmittedContractOffers: boolean;
}

export interface OffseasonConfig {
  schemaVersion: typeof OFFSEASON_SCHEMA_VERSION;
  phases: OffseasonPhaseConfig[];
  completion: OffseasonCompletionRules;
}

// ---------------------------------------------------------------------------
// Run + phase lifecycle status
// ---------------------------------------------------------------------------

export type OffseasonRunStatus =
  | 'PLANNED'
  | 'READY'
  | 'IN_PROGRESS'
  | 'BLOCKED'
  | 'COMPLETED'
  | 'CANCELLED'
  | 'FAILED';

export type OffseasonPhaseStatus =
  | 'PENDING'
  | 'READY'
  | 'IN_PROGRESS'
  | 'BLOCKED'
  | 'COMPLETED'
  | 'SKIPPED'
  | 'FAILED';

export type OffseasonPhaseEventType =
  | 'RUN_CREATED'
  | 'RUN_STARTED'
  | 'PHASE_READY'
  | 'PHASE_STARTED'
  | 'DOMAIN_OPERATION_LINKED'
  | 'PHASE_COMPLETED'
  | 'PHASE_SKIPPED'
  | 'PHASE_FAILED'
  | 'RUN_BLOCKED'
  | 'RUN_RESUMED'
  | 'RUN_COMPLETED'
  | 'RUN_CANCELLED';

// ---------------------------------------------------------------------------
// Linked operation references (server supplies these from existing subsystems)
// ---------------------------------------------------------------------------

export interface OffseasonLinkedOperations {
  /** IDs of archives created through F20 for COMPETITION_ARCHIVE phase. */
  competitionArchiveIds?: string[];
  /** Linked F28 ContractExpirationRun id. */
  contractExpirationRunId?: string | null;
  /** Linked F24 PlayerDevelopmentRun id. */
  playerDevelopmentRunId?: string | null;
  /** Linked F25 YouthGenerationRun id. */
  youthGenerationRunId?: string | null;
  /** Linked F27 DraftEvent id. */
  draftEventId?: string | null;
}

// ---------------------------------------------------------------------------
// Readiness — domain-neutral inputs the server supplies per phase
// ---------------------------------------------------------------------------

export type ReadinessLevel = 'READY' | 'WARNING' | 'NOT_READY';

export interface OffseasonReadinessCheck {
  id: string;
  status: 'PASS' | 'WARN' | 'FAIL';
  message: string;
}

export interface PhaseReadinessInput {
  phaseType: OffseasonPhaseType;
  checks: OffseasonReadinessCheck[];
  linkedOperation?: { type: string; id: string | null; summary?: string | null } | null;
  allowedActions: OffseasonPhaseAction[];
}

export type OffseasonPhaseAction =
  | 'START'
  | 'LINK'
  | 'COMPLETE'
  | 'SKIP'
  | 'RETRY'
  | 'OPEN_SUBSYSTEM'
  | 'NONE';

export interface PhaseReadinessResult {
  phaseType: OffseasonPhaseType;
  level: ReadinessLevel;
  status: 'READY' | 'WARNING' | 'NOT_READY';
  blockers: string[];
  warnings: string[];
  checks: OffseasonReadinessCheck[];
  allowedActions: OffseasonPhaseAction[];
  linkedOperation: { type: string; id: string | null; summary?: string | null } | null;
  readinessHash: string;
}

// ---------------------------------------------------------------------------
// Completion (FINAL_REVIEW) — world-integrity inputs supplied by the server
// ---------------------------------------------------------------------------

export interface OffseasonCompletionInput {
  /** All required phases are COMPLETED (or SKIPPED where allowed). */
  requiredPhasesComplete: boolean;
  /** Optional phases are either COMPLETED or SKIPPED. */
  optionalPhasesResolved: boolean;
  /** A phase is currently FAILED. */
  hasFailedPhase: boolean;
  /** At least one required CompetitionEdition is COMPLETED but not archived. */
  unarchivedRequiredCompetitions: boolean;
  /** A completed ContractExpirationRun exists when the completion rule requires it. */
  contractExpirationProcessed: boolean;
  /** A completed PlayerDevelopmentRun exists when required. */
  developmentRunComplete: boolean;
  /** A completed YouthGenerationRun exists when required. */
  youthGenerationRunComplete: boolean;
  /** A completed DraftEvent exists when required. */
  draftCompleted: boolean;
  /** A retired Player appears in an active lineup somewhere. */
  retiredPlayersInActiveLineups: boolean;
  /** A lineup slot references a Player whose currentTeamId differs. */
  ownershipMismatchInLineups: boolean;
  /** A Player has more than one ACTIVE contract. */
  duplicateActiveContracts: boolean;
  /** Count of ACTIVE PlayerDraftRights whose prospect remains unsigned. */
  unsignedDraftRightsCount: number;
  /** Count of current free agents (Player with no currentTeamId and ACTIVE contract). */
  freeAgentCount: number;
  /** Count of SUBMITTED trade proposals. */
  openTradeProposalCount: number;
  /** Count of SUBMITTED contract offers. */
  submittedContractOfferCount: number;
  /** Required detailed Teams whose lineup is not READY. */
  incompleteRequiredLineupsCount: number;
  /** A future WorldSeason already exists beyond the run's season. */
  nextWorldSeasonExists: boolean;
  /** Number of currently RUNNING scouting assignments (warnings only). */
  runningScoutingAssignments: number;
}

export interface OffseasonCompletionIssue {
  code: string;
  severity: 'BLOCKER' | 'WARNING';
  message: string;
}

export interface OffseasonCompletionResult {
  ready: boolean;
  blockers: OffseasonCompletionIssue[];
  warnings: OffseasonCompletionIssue[];
}

// ---------------------------------------------------------------------------
// Phase definition (resolved view of a config phase)
// ---------------------------------------------------------------------------

export interface OffseasonPhaseDefinition {
  type: OffseasonPhaseType;
  order: number;
  required: boolean;
  allowSkip: boolean;
  category: 'AUTOMATED' | 'INTERACTIVE';
  /** Phase types that must be COMPLETED (or SKIPPED where allowed) before this one can start. */
  dependsOn: OffseasonPhaseType[];
}

// ---------------------------------------------------------------------------
// Phase state (engine view of a persisted phase row)
// ---------------------------------------------------------------------------

export interface OffseasonPhaseState {
  phaseType: OffseasonPhaseType;
  order: number;
  status: OffseasonPhaseStatus;
  required: boolean;
  allowSkip: boolean;
  linked?: OffseasonLinkedOperations | null;
}

export interface OffseasonRunState {
  status: OffseasonRunStatus;
  phases: OffseasonPhaseState[];
}

// ---------------------------------------------------------------------------
// Reconciliation
// ---------------------------------------------------------------------------

export interface OffseasonReconciliationIssue {
  code: string;
  message: string;
}

export interface OffseasonReconciliationResult {
  valid: boolean;
  issues: OffseasonReconciliationIssue[];
}
