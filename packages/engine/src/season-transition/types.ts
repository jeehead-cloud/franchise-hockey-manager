/**
 * F31 — Season Transition pure engine types.
 *
 * The engine owns: strict versioned season-transition configuration validation,
 * deterministic target-season identity/order/date calculation, display-name
 * derivation, carry-forward plan construction from domain-neutral inputs,
 * readiness aggregation, transition result reconciliation, and deterministic
 * hashes. It is pure transition logic — it never invokes F17/F22/F24/F28
 * domain operations, never imports Prisma, never mutates Player truth, and
 * never creates WorldSeason/CompetitionEdition rows (those are server-owned).
 *
 * The server supplies domain-neutral inputs (source season, OffseasonRun
 * summary, source editions/stages/participants snapshots); the engine produces
 * a deterministic plan and hashes. Preview / prepare / execute are no-write at
 * the engine level; the server layers the persistence + transaction on top.
 *
 * Boundaries: F31 creates exactly one next WorldSeason from one completed
 * source season; it never replays F24–F30 operations, never generates schedules
 * or Matches, never develops players, never runs a draft, never signs players,
 * never creates trades, and never reuses locked national-team rosters.
 */

export const SEASON_TRANSITION_SCHEMA_VERSION = 1 as const;

export class SeasonTransitionError extends Error {
  constructor(
    public code: string,
    message: string,
    public details?: unknown,
  ) {
    super(message);
    this.name = 'SeasonTransitionError';
  }
}

// ---------------------------------------------------------------------------
// Run lifecycle
// ---------------------------------------------------------------------------

export type SeasonTransitionRunStatus =
  | 'PREPARED'
  | 'RUNNING'
  | 'COMPLETED'
  | 'FAILED'
  | 'CANCELLED';

/** One current prepared/running/completed transition per source season. */
export const ACTIVE_TRANSITION_STATUSES: readonly SeasonTransitionRunStatus[] = [
  'PREPARED',
  'RUNNING',
  'COMPLETED',
] as const;

export function isTerminalTransitionStatus(
  status: SeasonTransitionRunStatus,
): boolean {
  return status === 'COMPLETED' || status === 'CANCELLED' || status === 'FAILED';
}

export function canExecuteTransition(
  status: SeasonTransitionRunStatus,
): boolean {
  // PREPARED may execute. COMPLETED re-executes idempotently. RUNNING/FAILED/
  // CANCELLED cannot.
  return status === 'PREPARED' || status === 'COMPLETED';
}

// ---------------------------------------------------------------------------
// Entity record + event enums (mirror the persistence layer; kept here so the
// reconciliation/hash logic stays engine-pure)
// ---------------------------------------------------------------------------

export type SeasonTransitionEntityType =
  | 'WORLD_SEASON'
  | 'COMPETITION_EDITION'
  | 'COMPETITION_STAGE'
  | 'COMPETITION_PARTICIPANT'
  | 'CLUB_LINEUP'
  | 'CLUB_TACTICS'
  | 'CONTRACT_STATE'
  | 'SCOUTING_STATE'
  | 'NATIONAL_TEAM_STATE';

export type SeasonTransitionEntityAction =
  | 'CREATED'
  | 'COPIED'
  | 'CARRIED'
  | 'MARKED_FOR_REVIEW'
  | 'PRESERVED'
  | 'SKIPPED';

export type SeasonTransitionEventType =
  | 'PREPARED'
  | 'STARTED'
  | 'BACKUP_CREATED'
  | 'TARGET_SEASON_CREATED'
  | 'COMPETITIONS_CREATED'
  | 'STATE_CARRIED'
  | 'COMPLETED'
  | 'FAILED'
  | 'CANCELLED';

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

export interface SeasonTransitionSeasonConfig {
  orderIncrement: number;
  displayNamePattern: string;
  startDateMonth: number;
  startDateDay: number;
  endDateMonth: number;
  endDateDay: number;
}

export interface SeasonTransitionCompetitionsConfig {
  carryForwardEnabledDefinitions: boolean;
  copyDefaultRulesIntoNewEditionSnapshot: boolean;
  copyStageTemplates: boolean;
  copyConfirmedParticipants: boolean;
  activateEditionsAutomatically: boolean;
  newEditionInitialStatus: 'PLANNED' | 'PREPARING';
}

export interface SeasonTransitionLineupsConfig {
  carryForwardClubLineups: boolean;
  markForReview: boolean;
  copyTactics: boolean;
  autoRebuild: boolean;
}

export interface SeasonTransitionNationalTeamsConfig {
  createEditionPreparationAutomatically: boolean;
  carryLockedTournamentRosters: boolean;
}

export interface SeasonTransitionScoutingConfig {
  preserveReports: boolean;
  markAgeSensitiveReportsStale: boolean;
  preserveWatchlists: boolean;
  preserveDepartments: boolean;
}

export interface SeasonTransitionContractsConfig {
  requireNoOwnershipMismatch: boolean;
  activateApplicableFutureContracts: boolean;
}

export interface SeasonTransitionCompletionConfig {
  requireCompletedOffseasonRun: boolean;
  requireArchivedCompletedCompetitions: boolean;
  requireNoActiveCompetitionEdition: boolean;
  requireNoRunningWorldOperation: boolean;
}

export interface SeasonTransitionConfig {
  schemaVersion: typeof SEASON_TRANSITION_SCHEMA_VERSION;
  season: SeasonTransitionSeasonConfig;
  competitions: SeasonTransitionCompetitionsConfig;
  lineups: SeasonTransitionLineupsConfig;
  nationalTeams: SeasonTransitionNationalTeamsConfig;
  scouting: SeasonTransitionScoutingConfig;
  contracts: SeasonTransitionContractsConfig;
  completion: SeasonTransitionCompletionConfig;
}

// ---------------------------------------------------------------------------
// Domain-neutral inputs (the server fills these in from Prisma)
// ---------------------------------------------------------------------------

export interface SourceSeasonInput {
  id: string;
  label: string;
  startYear: number;
  endYear: number;
  status: string;
  phase: string;
  updatedAt: string;
}

export interface CompletedOffseasonRunInput {
  id: string;
  status: string;
  resultHash: string | null;
  completedAt: string | null;
}

export interface SourceCompetitionEditionInput {
  /** Edition id of the source season's edition (may be null for first-version). */
  editionId: string | null;
  competitionId: string;
  competitionName: string;
  competitionType: string;
  simulationLevel: string | null;
  displayName: string;
  status: string;
  isInternational: boolean;
  /** Optional recurrence flag stored on Competition metadata (null = unknown). */
  recurring: boolean | null;
  rulesSnapshotText: string;
  rulesHash: string;
  defaultRulesJson: string | null;
  stages: SourceStageInput[];
  confirmedParticipantCount: number;
  archived: boolean;
}

export interface SourceStageInput {
  stageId: string;
  name: string;
  stageType: string;
  stageOrder: number;
  configText: string;
  configHash: string;
  participantSource: string;
  sourceStageId: string | null;
  expectedQualifierCount: number | null;
}

export interface OwnershipIntegrityInput {
  duplicateActiveContracts: number;
  ownershipMismatches: number;
  freeAgentCount: number;
  unsignedDraftRights: number;
  retiredPlayersInActiveLineups: number;
  lineupOwnershipMismatches: number;
}

export interface RunningWorldOperationInput {
  openOffseasonRun: boolean;
  preparedContractExpirationRun: boolean;
  preparedOrRunningDevelopmentRun: boolean;
  preparedOrRunningYouthRun: boolean;
  openDraftEvent: boolean;
  activeCompetitionEdition: boolean;
}

export interface ScoutingStalenessInput {
  staleReportCount: number;
  totalReportCount: number;
}

export interface TransitionPreviewInput {
  config: SeasonTransitionConfig;
  sourceSeason: SourceSeasonInput;
  completedOffseasonRun: CompletedOffseasonRunInput | null;
  offseasonRunsForSeason: { id: string; status: string }[];
  sourceEditions: SourceCompetitionEditionInput[];
  ownership: OwnershipIntegrityInput;
  runningOperations: RunningWorldOperationInput;
  scoutingStaleness: ScoutingStalenessInput;
  /** Optional display-name override supplied by the Commissioner. */
  targetDisplayNameOverride: string | null;
  /** Existing transition rows for this source season (id + status + targetId). */
  existingTransitionsForSource: {
    id: string;
    status: SeasonTransitionRunStatus;
    targetWorldSeasonId: string | null;
    inputHash: string;
  }[];
  /** Existing WorldSeason orders in the world (used for duplicate-target checks). */
  existingSeasonOrders: number[];
  /** Existing current (ACTIVE) season id, if any. */
  currentSeasonId: string | null;
}

// ---------------------------------------------------------------------------
// Identity / plan outputs
// ---------------------------------------------------------------------------

export interface TargetSeasonIdentity {
  order: number;
  label: string;
  displayName: string;
  startDateIso: string;
  endDateIso: string;
  manuallyNamed: boolean;
}

export interface PlannedTargetEdition {
  competitionId: string;
  competitionName: string;
  competitionType: string;
  simulationLevel: string | null;
  displayName: string;
  isInternational: boolean;
  initialStatus: 'PLANNED' | 'PREPARING';
  rulesSnapshotText: string;
  rulesHash: string;
  stages: PlannedTargetStage[];
  participantCount: number;
  /** Why this edition was selected for carry-forward. */
  selectionReason: string;
}

export interface PlannedTargetStage {
  name: string;
  stageType: string;
  stageOrder: number;
  configText: string;
  configHash: string;
  participantSource: string;
  /** Remapped source stage key (source stageOrder) -> new stageOrder, if any. */
  remappedFromStageOrder: number | null;
  expectedQualifierCount: number | null;
}

export interface CarryForwardSummary {
  lineups: { carryForward: boolean; markedForReview: boolean; copyTactics: boolean; autoRebuild: boolean };
  scouting: { preserved: boolean; staleReports: number; totalReports: number };
  nationalTeams: { createPreparation: boolean; carryLockedRosters: boolean };
  contracts: { requireNoOwnershipMismatch: boolean; activateFuture: boolean; freeAgents: number };
  draftRights: { carried: boolean; unsignedCount: number };
  players: { preserved: boolean };
}

// ---------------------------------------------------------------------------
// Readiness
// ---------------------------------------------------------------------------

export type ReadinessStatus = 'READY' | 'WARNING' | 'NOT_READY';

export interface ReadinessCheck {
  id: string;
  status: 'PASS' | 'WARN' | 'FAIL';
  message: string;
}

export interface TransitionBlocker {
  code: string;
  message: string;
}

export interface TransitionWarning {
  code: string;
  message: string;
}

export interface TransitionReadiness {
  status: ReadinessStatus;
  checks: ReadinessCheck[];
  blockers: TransitionBlocker[];
  warnings: TransitionWarning[];
  sourceSeason: SourceSeasonInput;
  completedOffseasonRun: CompletedOffseasonRunInput | null;
  proposedTargetSeason: TargetSeasonIdentity;
  competitionPlan: PlannedTargetEdition[];
  carryForwardSummary: CarryForwardSummary;
  allowedActions: string[];
  readinessHash: string;
}
