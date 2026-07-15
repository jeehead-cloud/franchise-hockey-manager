/**
 * F27 — NHL Draft pure engine types.
 *
 * The engine owns: configuration validation, eligibility, deterministic draft
 * order, bounded lottery, pick numbering, draft-board ranking from scouting
 * DTOs, deterministic auto-pick, progression, reconciliation, and hashing.
 *
 * It must never import Prisma, Fastify, React, or any player-truth type that
 * would let auto-pick see hidden potential. Auto-pick inputs carry scouting
 * estimates only.
 */

export const DRAFT_SCHEMA_VERSION = 1 as const;

export class DraftError extends Error {
  constructor(
    public code: string,
    message: string,
    public details?: unknown,
  ) {
    super(message);
    this.name = 'DraftError';
  }
}

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

export type DraftOrderSource = 'REVERSE_STANDINGS' | 'MANUAL';

export interface DraftLotteryConfig {
  enabled: boolean;
  /** Number of teams (from the bottom of the standings) eligible for the lottery. */
  eligibleTeamCount: number;
  /** Number of lottery draws (winners move up). */
  drawCount: number;
  /** Maximum positions a lottery winner may move up. */
  maximumMoveUp: number;
  /** Lottery weights — must equal eligibleTeamCount length. */
  weights: number[];
}

export interface DraftAutoPickConfig {
  estimatedPotentialWeight: number;
  estimatedCurrentAbilityWeight: number;
  confidenceWeight: number;
  projectedRoleWeight: number;
  riskPenaltyWeight: number;
  watchlistPriorityBonus: number;
}

export interface DraftEligibilityConfig {
  minimumAge: number;
  maximumAge: number;
  /** Explicit cutoff date in ISO `YYYY-MM-DD`. Age is measured against this. */
  cutoffDate: string;
  allowedLifecycleStatuses: string[];
  allowedSourceTypes: string[];
  requireUnsigned: boolean;
  excludeAlreadyDrafted: boolean;
}

export interface DraftOrderConfig {
  source: DraftOrderSource;
  /** When true, every round uses the same order; when false, later rounds snake. */
  repeatSameOrderEachRound: boolean;
}

export interface DraftConfig {
  schemaVersion: typeof DRAFT_SCHEMA_VERSION;
  name: string;
  rounds: number;
  eligibility: DraftEligibilityConfig;
  order: DraftOrderConfig;
  lottery: DraftLotteryConfig;
  autoPick: DraftAutoPickConfig;
}

// ---------------------------------------------------------------------------
// Eligibility
// ---------------------------------------------------------------------------

export type DraftEligibleStatus = 'AVAILABLE' | 'DRAFTED' | 'WITHDRAWN' | 'INELIGIBLE_AFTER_REVIEW';

export interface EligibilityPlayerInput {
  playerId: string;
  displayName: string;
  dateOfBirth: string;
  lifecycleStatus: string;
  sourceType: string;
  currentTeamId: string | null;
  alreadyDrafted: boolean;
}

export interface EligibilityResult {
  playerId: string;
  eligible: boolean;
  ageOnCutoffDate: number;
  reasons: string[];
}

export interface DraftEligiblePlayer {
  playerId: string;
  displayName: string;
  dateOfBirth: string;
  ageOnCutoffDate: number;
  lifecycleStatus: string;
  sourceType: string;
  countrySnapshot: string | null;
  positionSnapshot: string | null;
  eligibilityHash: string;
}

// ---------------------------------------------------------------------------
// Order & lottery
// ---------------------------------------------------------------------------

export interface DraftOrderTeamInput {
  teamId: string;
  teamName: string;
  /** 1-based standing rank (1 = best team, last = worst). Required for REVERSE_STANDINGS. */
  standingRank: number | null;
}

export interface DraftPickSlot {
  roundNumber: number;
  pickInRound: number;
  overallPick: number;
  teamId: string;
  teamName: string;
}

export interface DraftOrderResult {
  picks: DraftPickSlot[];
  orderHash: string;
  source: DraftOrderSource;
}

export interface LotteryDrawResult {
  drawNumber: number;
  winningTeamId: string;
  originalPosition: number;
  newPosition: number;
  weightSnapshot: number;
  seedFragment: string;
  drawHash: string;
}

export interface LotteryResult {
  draws: LotteryDrawResult[];
  /** First-round order after lottery (teamId[] in pick order). */
  finalFirstRoundOrder: string[];
  diagnostics: {
    eligibleTeamCount: number;
    drawCount: number;
    maximumMoveUp: number;
    movedUp: Array<{ teamId: string; from: number; to: number }>;
  };
  lotteryHash: string;
}

// ---------------------------------------------------------------------------
// Team board + auto-pick (estimates only — never player truth)
// ---------------------------------------------------------------------------

export interface BoardProspectEstimate {
  playerId: string;
  estimatedCurrentAbility: number | null;
  estimatedPotential: number | null;
  projectedRole: string | null;
  confidence: number;
  stale: boolean;
  watchlistPriority: number;
  manualRank: number | null;
}

export interface TeamBoardConfig {
  /** When true, a set manual rank takes precedence over the computed score. */
  respectManualRank: boolean;
}

export interface AutoPickInput {
  availableProspects: BoardProspectEstimate[];
  teamBoardConfig: TeamBoardConfig;
  seed: string;
}

export interface AutoPickResult {
  selectedPlayerId: string;
  score: number;
  reason: string;
  scores: Array<{ playerId: string; score: number; components: Record<string, number> }>;
}

export interface DraftBoardEntry {
  playerId: string;
  estimatedCurrentAbility: number | null;
  estimatedPotential: number | null;
  projectedRole: string | null;
  confidence: number;
  stale: boolean;
  risk: number;
  watchlistPriority: number;
  manualRank: number | null;
  suggestedRank: number | null;
  drafted: boolean;
}

export interface DraftBoardSnapshot {
  teamId: string;
  entries: DraftBoardEntry[];
  boardHash: string;
}

// ---------------------------------------------------------------------------
// Progression & reconciliation
// ---------------------------------------------------------------------------

export type PickStatus = 'PENDING' | 'ON_THE_CLOCK' | 'COMPLETED' | 'PASSED' | 'CANCELLED';
export type DraftSelectionSource = 'MANUAL' | 'AUTO' | 'COMMISSIONER_CORRECTION';

export interface DraftPickRecord {
  pickId: string;
  roundNumber: number;
  pickInRound: number;
  overallPick: number;
  teamId: string;
  status: PickStatus;
  selectedPlayerId: string | null;
  selectionSource: DraftSelectionSource | null;
}

export interface ProgressionInput {
  picks: DraftPickRecord[];
  /** Player IDs still AVAILABLE (eligibility status). */
  availablePlayerIds: string[];
}

export interface ProgressionResult {
  currentPick: DraftPickRecord | null;
  completed: boolean;
  remainingPicks: number;
  completedSelections: number;
}

export interface DraftReconciliationIssue {
  code: string;
  message: string;
}

export interface DraftReconciliationResult {
  valid: boolean;
  issues: DraftReconciliationIssue[];
}

/** Minimal active-rights DTO consumed by reconciliation (no player truth). */
export interface PlayerDraftRightDto {
  id: string;
  playerId: string;
  teamId: string;
  status: 'ACTIVE' | 'RENOUNCED' | 'EXPIRED' | 'CONVERTED_TO_CONTRACT';
}
