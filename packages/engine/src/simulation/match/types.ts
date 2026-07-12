import type { BalanceConfig } from '../../balance/types.js';
import type { FHM_ENGINE_VERSION, F11_SIMULATION_MODE } from './constants.js';
import type { RngState } from './rng.js';

export type SimulationMode = typeof F11_SIMULATION_MODE;

export type SimulationStatus =
  | 'NOT_STARTED'
  | 'IN_PROGRESS'
  | 'PERIOD_COMPLETE'
  | 'REGULATION_COMPLETE'
  | 'PAUSED'
  | 'FAILED';

export type StrengthState = 'EVEN_5V5';

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
  | 'REGULATION_END';

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
  schemaVersion: 1;
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
