/**
 * F29 — Trades and Rights Transfers pure engine types.
 *
 * The engine owns: strict versioned configuration validation, asset eligibility,
 * deterministic Team-context value calculations (player / pick / right), fairness
 * warnings, duplicate/conflict detection, proposal summarization and hashing, and
 * reconciliation. It is advisory only — it never accepts or rejects a trade.
 *
 * It must never import Prisma, Fastify, React, or any player-truth type that would
 * let a normal Team-context valuation see hidden potential. Prospect/right value
 * inputs carry that Team's F26 scouting estimates only (or a conservative Unknown
 * fallback). Commissioner diagnostics may pass true values through the same engine
 * — those call paths are server-side and never exposed on ordinary APIs.
 */

export const TRADE_SCHEMA_VERSION = 1 as const;

export class TradeError extends Error {
  constructor(
    public code: string,
    message: string,
    public details?: unknown,
  ) {
    super(message);
    this.name = 'TradeError';
  }
}

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

export interface TradeAssetsConfig {
  allowPlayers: boolean;
  allowDraftPicks: boolean;
  allowDraftRights: boolean;
  /** Maximum number of assets a single side may offer/receive. */
  maximumAssetsPerSide: number;
}

export interface TradePlayerValueConfig {
  currentAbilityWeight: number;
  contractValueWeight: number;
  ageWeight: number;
  roleWeight: number;
  recentPerformanceWeight: number;
  developmentTrendWeight: number;
  retirementRiskWeight: number;
}

export interface TradeProspectValueConfig {
  estimatedPotentialWeight: number;
  estimatedCurrentAbilityWeight: number;
  confidenceWeight: number;
  projectedRoleWeight: number;
  riskPenaltyWeight: number;
}

export interface TradeDraftPickValueConfig {
  /** Base value per round, index 0 = round 1. */
  roundBaseValues: number[];
  /** Discount multiplier applied per season into the future (0..1). */
  futureSeasonDiscount: number;
  /** Multiplier applied when the pick's overall position is unknown (0..1). */
  unknownPositionMultiplier: number;
}

export interface TradeDraftRightValueConfig {
  estimatedPotentialWeight: number;
  confidenceWeight: number;
  draftPositionWeight: number;
  unsignedRiskWeight: number;
}

export interface TradeFairnessConfig {
  /** Relative imbalance below which a trade is considered balanced (0..1). */
  balancedThreshold: number;
  /** Relative imbalance at/above which a warning is raised (0..1). */
  warningThreshold: number;
}

export interface TradeConfig {
  schemaVersion: typeof TRADE_SCHEMA_VERSION;
  assets: TradeAssetsConfig;
  playerValue: TradePlayerValueConfig;
  prospectValue: TradeProspectValueConfig;
  draftPickValue: TradeDraftPickValueConfig;
  draftRightValue: TradeDraftRightValueConfig;
  fairness: TradeFairnessConfig;
}

// ---------------------------------------------------------------------------
// Asset DTOs (Team-context — estimates only, never hidden truth)
// ---------------------------------------------------------------------------

export type TradeSide = 'PROPOSING' | 'RECEIVING';
export type TradeAssetType = 'PLAYER_CONTRACT' | 'DRAFT_PICK' | 'PLAYER_DRAFT_RIGHT';

/**
 * Estimate DTO mirroring F26 scouting report attribute estimates. `estimate` is
 * null when the evaluating Team has no report (Unknown fallback applies).
 */
export interface TradeEstimate {
  estimate: number | null;
  confidence: number;
  stale: boolean;
}

/** Player asset under an ACTIVE contract. Ability is the evaluating Team's view. */
export interface TradePlayerAssetDto {
  playerId: string;
  playerName: string;
  position: string;
  dateOfBirth: string;
  effectiveDate: string;
  /** Evaluating Team's current-ability view (true CA for signed roster players, scouting estimate for PROSPECTs). */
  currentAbility: number | null;
  roleRating: number | null;
  projectedRole: string | null;
  recentPerformance: number | null;
  developmentTrend: number | null;
  rosterStatus: string;
  activeContractId: string;
  activeContractTeamId: string;
  activeAnnualSalary: number;
  /** End season order of the ACTIVE contract (null if unknown). */
  activeContractEndOrder: number | null;
  hasFutureContract: boolean;
  /** When the player is a PROSPECT under contract, this carries the Team's scouting potential estimate. */
  potentialEstimate: TradeEstimate | null;
  retirementRisk: number | null;
}

/** Eligible undrafted DraftPick (PENDING, draft not IN_PROGRESS). */
export interface TradeDraftPickAssetDto {
  pickId: string;
  draftEventId: string;
  draftEventStatus: string;
  roundNumber: number;
  overallPick: number;
  pickStatus: string;
  originalTeamId: string;
  currentTeamId: string;
  /** Season order of the draft event, used for future-pick discounting. */
  draftSeasonOrder: number | null;
  /** Current season order, used to compute how far into the future the pick is. */
  currentSeasonOrder: number | null;
}

/** ACTIVE draft right. Uses the evaluating Team's scouting report. */
export interface TradeDraftRightAssetDto {
  rightId: string;
  playerId: string;
  playerName: string;
  position: string;
  dateOfBirth: string;
  effectiveDate: string;
  status: string;
  /** Round of the originating pick (for draft-position weighting). */
  originatingRound: number | null;
  potentialEstimate: TradeEstimate | null;
  currentAbilityEstimate: TradeEstimate | null;
  projectedRole: string | null;
}

// ---------------------------------------------------------------------------
// Eligibility
// ---------------------------------------------------------------------------

export interface TradePlayerEligibilityInput {
  playerId: string;
  rosterStatus: string;
  currentTeamId: string | null;
  sourceTeamId: string;
  activeContractTeamId: string | null;
  activeContractId: string | null;
  hasFutureContract: boolean;
  futureContractTeamId: string | null;
}

export interface TradePickEligibilityInput {
  pickId: string;
  currentTeamId: string;
  sourceTeamId: string;
  pickStatus: string;
  draftEventStatus: string;
}

export interface TradeRightEligibilityInput {
  rightId: string;
  playerId: string;
  status: string;
  teamId: string;
  sourceTeamId: string;
  playerCurrentTeamId: string | null;
}

export interface TradeEligibilityResult {
  eligible: boolean;
  reasons: string[];
}

// ---------------------------------------------------------------------------
// Valuations
// ---------------------------------------------------------------------------

export interface TradeAssetValuation {
  assetType: TradeAssetType;
  /** Normalized 0..100 value scale (advisory only). */
  value: number;
  factors: string[];
  valuationHash: string;
}

export interface TradeSideValuation {
  side: TradeSide;
  teamId: string;
  totalValue: number;
  assets: TradeAssetValuation[];
}

export interface TradeFairnessResult {
  /** 0..1 relative imbalance (proposing vs receiving total value). */
  imbalance: number;
  label: 'BALANCED' | 'WARNING' | 'IMBALANCED';
  proposingTotal: number;
  receivingTotal: number;
  /** True when the imbalance crosses the configured warning threshold. */
  warning: boolean;
}

export interface TradeProposalValuation {
  proposing: TradeSideValuation;
  receiving: TradeSideValuation;
  fairness: TradeFairnessResult;
}

// ---------------------------------------------------------------------------
// Proposal summary + reconciliation
// ---------------------------------------------------------------------------

export interface TradeProposalAssetRef {
  assetType: TradeAssetType;
  playerContractId?: string | null;
  playerId?: string | null;
  draftPickId?: string | null;
  playerDraftRightId?: string | null;
}

export interface TradeProposalSummaryInput {
  proposingTeamId: string;
  receivingTeamId: string;
  proposingAssets: TradeProposalAssetRef[];
  receivingAssets: TradeProposalAssetRef[];
}

export interface TradeProposalSummaryResult {
  proposingTeamId: string;
  receivingTeamId: string;
  proposingAssetCount: number;
  receivingAssetCount: number;
  duplicateAssetKeys: string[];
  conflictingPlayerIds: string[];
  proposalHash: string;
}

export interface TradeReconciliationIssue {
  code: string;
  message: string;
}

export interface TradeReconciliationResult {
  valid: boolean;
  issues: TradeReconciliationIssue[];
}
