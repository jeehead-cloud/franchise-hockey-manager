import type { BalanceConfig } from '../../balance/types.js';
import type { GoalieAttributes, SkaterAttributes } from '../../players/types.js';
import type { FHM_ENGINE_VERSION, F13_SIMULATION_MODE, SNAPSHOT_SCHEMA_VERSION } from './constants.js';
import type { GoalStrength, PenaltyEndReason, PenaltyInfraction } from './penalty-types.js';
import type { RngState } from './rng.js';
import type { ShotType } from './shot-types.js';

export type { ShotType } from './shot-types.js';
export { SHOT_TYPES } from './shot-types.js';
export type { GoalStrength, PenaltyEndReason, PenaltyInfraction } from './penalty-types.js';

export type SimulationMode = typeof F13_SIMULATION_MODE;

export type SimulationStatus =
  | 'NOT_STARTED'
  | 'IN_PROGRESS'
  | 'PERIOD_COMPLETE'
  | 'REGULATION_COMPLETE'
  | 'PAUSED'
  | 'FAILED';

export type StrengthState = 'EVEN_5V5' | 'HOME_POWER_PLAY_5V4' | 'AWAY_POWER_PLAY_5V4';

export type PossessionSide = 'HOME' | 'AWAY' | 'NONE';

/** Zone relative to the team currently in possession. */
export type PossessionZone = 'DEFENSIVE' | 'NEUTRAL' | 'OFFENSIVE';

export type MatchEventType =
  | 'MATCH_START'
  | 'PERIOD_START'
  | 'FACEOFF'
  | 'SHIFT_START'
  | 'POSSESSION_GAIN'
  | 'ZONE_EXIT'
  | 'ZONE_ENTRY'
  | 'TURNOVER'
  | 'STOPPAGE'
  | 'SHIFT_END'
  | 'PERIOD_END'
  | 'REGULATION_END'
  | 'SHOT'
  | 'SHOT_BLOCKED'
  | 'SHOT_MISSED'
  | 'SAVE'
  | 'GOAL'
  | 'PENALTY'
  | 'PENALTY_EXPIRED';

export type EventVisibility = 'PUBLIC' | 'TECHNICAL';

export type MatchPhase =
  | 'AWAITING_MATCH_START'
  | 'AWAITING_PERIOD_START'
  | 'AWAITING_FACEOFF'
  | 'IN_SHIFT'
  | 'AWAITING_STOPPAGE_FACEOFF'
  | 'AWAITING_PERIOD_END'
  | 'AWAITING_REGULATION_END'
  | 'COMPLETE'
  | 'FAILED';

export type ReboundOutcome = 'CONTROLLED' | 'REBOUND' | 'FROZEN';

export type MissReason = 'WIDE' | 'HIGH' | 'POST';

export interface RegulationRules {
  regulationPeriods: number;
  periodDurationSeconds: number;
}

export interface SimulationBalanceRef {
  presetId: string;
  presetName: string;
  versionId: string;
  versionNumber: number;
  schemaVersion: number;
  configHash: string;
  snapshot: BalanceConfig;
}

export interface SimulationPlayerProfile {
  playerId: string;
  firstName: string;
  lastName: string;
  primaryPosition: 'LW' | 'RW' | 'C' | 'LD' | 'RD' | 'G';
  lineupSlot: string;
  currentAbility: number;
  offensiveRating: number | null;
  defensiveRating: number | null;
  role: string;
  roleRating: number;
  effectivePerformance: number | null;
  /** Required for skaters in F12; null/undefined for goalies. */
  skaterAttributes?: SkaterAttributes | null;
  /** Required for goalies in F12; null/undefined for skaters. */
  goalieAttributes?: GoalieAttributes | null;
}

export interface SimulationUnitRef {
  unitKey: string;
  playerIds: string[];
  effectivePerformance: number;
}

export interface SimulationTeamInput {
  teamId: string;
  teamName: string;
  side: 'HOME' | 'AWAY';
  coach: {
    coachingStyle: string;
    tacticalStyle: string;
    overallCoaching: number;
    offense: number;
    defense: number;
  };
  tacticalStyle: string;
  lineupAssignments: Array<{ slot: string; playerId: string }>;
  players: SimulationPlayerProfile[];
  forwardLines: SimulationUnitRef[];
  defensePairs: SimulationUnitRef[];
  starterGoalie: SimulationUnitRef;
}

export interface SimulationInput {
  matchId: string;
  engineVersion: typeof FHM_ENGINE_VERSION;
  simulationMode: SimulationMode;
  seed: string | number;
  inputFingerprint: string;
  balance: SimulationBalanceRef;
  homeTeam: SimulationTeamInput;
  awayTeam: SimulationTeamInput;
  rules: RegulationRules;
}

export interface ActiveLines {
  homeForwardLineKey: string;
  homeDefensePairKey: string;
  homeGoalieId: string;
  awayForwardLineKey: string;
  awayDefensePairKey: string;
  awayGoalieId: string;
  homeForwardPlayerIds: string[];
  homeDefensePlayerIds: string[];
  awayForwardPlayerIds: string[];
  awayDefensePlayerIds: string[];
}

export interface CurrentShift {
  shiftNumber: number;
  startElapsedSeconds: number;
  plannedDurationSeconds: number;
  lines: ActiveLines;
}

export interface MatchScore {
  home: number;
  away: number;
}

export interface PendingShot {
  shotSequenceId: number;
  shotEventIndex: number;
  shooterId: string;
  goalieId: string;
  shotType: ShotType;
  shotQuality: number;
  defensivePressure: number;
  screenFactor: number;
  passChain: string[];
  attackingSide: Exclude<PossessionSide, 'NONE'>;
  attackingTeamId: string;
  defendingTeamId: string;
  blockProbability: number;
  missProbability: number;
  onTargetProbability: number;
  goalProbability: number;
  /** Original shot/pass source when tip/deflection; optional. */
  attemptCreatorId: string | null;
}

export interface ActivePenalty {
  penaltySequenceId: number;
  penalizedTeamId: string;
  advantagedTeamId: string;
  penalizedSide: 'HOME' | 'AWAY';
  advantagedSide: 'HOME' | 'AWAY';
  penalizedPlayerId: string;
  infraction: PenaltyInfraction;
  startedPeriod: number;
  startedElapsedSeconds: number;
  durationSeconds: number;
  remainingSeconds: number;
  powerPlayGoalScored: boolean;
}

export interface MatchState {
  engineVersion: typeof FHM_ENGINE_VERSION;
  simulationStatus: SimulationStatus;
  phase: MatchPhase;
  period: number;
  clockElapsedSeconds: number;
  clockRemainingSeconds: number;
  score: MatchScore;
  strengthState: StrengthState;
  possession: PossessionSide;
  zone: PossessionZone | null;
  currentShift: CurrentShift | null;
  shiftElapsedSeconds: number;
  eventIndex: number;
  rng: RngState;
  safetyEventsEmitted: number;
  /** Recent attacking pass participants (max 2), excluding current shooter when shot starts. */
  passChainPlayerIds: string[];
  pendingShot: PendingShot | null;
  shotSequenceId: number;
  activePenalty: ActivePenalty | null;
  penaltySequenceId: number;
  /** Absolute regulation seconds marker for spacing between penalties. */
  lastPenaltyEndedRegulationSeconds: number | null;
}

export interface MatchEvent {
  index: number;
  type: MatchEventType;
  period: number;
  elapsedSeconds: number;
  remainingSeconds: number;
  teamId: string | null;
  playerIds: string[];
  zone: PossessionZone | null;
  possession: PossessionSide;
  strengthState: StrengthState;
  shiftNumber: number | null;
  visibility: EventVisibility;
  details: Record<string, unknown>;
}

export interface MatchSnapshot {
  schemaVersion: typeof SNAPSHOT_SCHEMA_VERSION;
  engineVersion: typeof FHM_ENGINE_VERSION;
  simulationMode: SimulationMode;
  inputFingerprint: string;
  balanceHash: string;
  seed: string | number;
  rng: RngState;
  state: MatchState;
  events: MatchEvent[];
  traceHash: string;
}

export interface PlayerSkaterStats {
  playerId: string;
  teamId: string;
  side: 'HOME' | 'AWAY';
  lineupSlot: string;
  primaryPosition: SimulationPlayerProfile['primaryPosition'];
  goals: number;
  primaryAssists: number;
  secondaryAssists: number;
  assists: number;
  points: number;
  shots: number;
  shotAttempts: number;
  blockedAttempts: number;
  missedAttempts: number;
  shotsOnGoal: number;
  blocks: number;
  timeOnIceSeconds: number;
  penaltyMinutes: number;
  penaltiesTaken: number;
  powerPlayGoals: number;
  shortHandedGoals: number;
}

export interface PlayerGoalieStats {
  playerId: string;
  teamId: string;
  side: 'HOME' | 'AWAY';
  lineupSlot: string;
  shotsAgainst: number;
  saves: number;
  goalsAgainst: number;
  savePercentage: number;
  timeOnIceSeconds: number;
}

export interface TeamStats {
  teamId: string;
  side: 'HOME' | 'AWAY';
  goals: number;
  shotAttempts: number;
  shotsOnGoal: number;
  blockedShotsAgainst: number;
  missedShots: number;
  saves: number;
  shootingPercentage: number;
  faceoffWins: number;
  possessionSeconds: number;
  offensiveZoneSeconds: number;
  defensiveZoneSeconds: number;
  penalties: number;
  penaltyMinutes: number;
  powerPlayOpportunities: number;
  powerPlayGoals: number;
  powerPlayPercentage: number;
  penaltyKillOpportunities: number;
  penaltyKills: number;
  penaltyKillPercentage: number;
  shortHandedGoals: number;
}

export interface PeriodScore {
  period: number;
  home: number;
  away: number;
}

export interface MatchStatistics {
  home: TeamStats;
  away: TeamStats;
  skaters: PlayerSkaterStats[];
  goalies: PlayerGoalieStats[];
  periodScores: PeriodScore[];
}

export interface ReconciliationCheck {
  code: string;
  ok: boolean;
  message: string;
}

export interface ReconciliationResult {
  ok: boolean;
  checks: ReconciliationCheck[];
  failures: string[];
}

export interface SimulationDiagnostics {
  totalEvents: number;
  eventsByType: Record<string, number>;
  shiftsByTeamLine: Record<string, number>;
  possessionSecondsByTeam: { home: number; away: number; none: number };
  zoneSecondsByTeam: Record<string, { defensive: number; neutral: number; offensive: number }>;
  turnoversByTeam: { home: number; away: number };
  stoppages: number;
  faceoffWins: { home: number; away: number };
  regulationDurationSeconds: number;
  safetyLimitHit: boolean;
  traceHash: string;
  shotAttempts: number;
  shotsBlocked: number;
  shotsMissed: number;
  shotsOnGoal: number;
  saves: number;
  goals: number;
  shootingPercentage: number;
  savePercentage: number;
  shotsByPeriod: Record<number, number>;
  goalsByPeriod: Record<number, number>;
  shotTypes: Record<string, number>;
  averageShotQuality: number;
  topShooters: Array<{ playerId: string; shotsOnGoal: number; goals: number }>;
  goalieSummaries: Array<{
    playerId: string;
    shotsAgainst: number;
    saves: number;
    goalsAgainst: number;
    savePercentage: number;
  }>;
  reconciliationOk: boolean | null;
  penalties: number;
  powerPlayOpportunities: number;
  powerPlayGoals: number;
  powerPlayPercentage: number;
  shortHandedGoals: number;
  penaltiesByInfraction: Record<string, number>;
  evenStrengthGoals: number;
}

export interface SimulationResult {
  metadata: {
    engineVersion: typeof FHM_ENGINE_VERSION;
    simulationMode: SimulationMode;
    balancePresetId: string;
    balanceVersionId: string;
    balanceVersionNumber: number;
    balanceHash: string;
    seed: string | number;
    inputFingerprint: string;
  };
  finalState: MatchState;
  events: MatchEvent[];
  diagnostics: SimulationDiagnostics;
  statistics: MatchStatistics;
  reconciliation: ReconciliationResult;
  periodScores: PeriodScore[];
}

export type StepMode = 'NEXT_EVENT' | 'NEXT_SHIFT' | 'END_PERIOD' | 'END_REGULATION';

export interface StepResult {
  state: MatchState;
  events: MatchEvent[];
  snapshot: MatchSnapshot;
  diagnostics: SimulationDiagnostics;
  completed: boolean;
}

export type EventDetailLevel = 'NONE' | 'SUMMARY' | 'FULL';

export type ShotResolutionType = 'SHOT_BLOCKED' | 'SHOT_MISSED' | 'SAVE' | 'GOAL';

export interface ShotResolutionDetails {
  type: ShotResolutionType;
  blockerId?: string;
  missReason?: MissReason;
  reboundOutcome?: ReboundOutcome;
  primaryAssistId?: string | null;
  secondaryAssistId?: string | null;
  scoreAfter?: MatchScore;
}
