/** F18 regular-season schedule, standings, and aggregation — pure types. */

import type { CompetitionPointsRules, TiebreakerCode } from '../types.js';

export type RegularSeasonScheduleFormat =
  | 'ROUND_ROBIN'
  | 'DOUBLE_ROUND_ROBIN'
  | 'BALANCED_CUSTOM';

export type HomeAwayMode = 'BALANCED';

export interface RegularSeasonConfig {
  scheduleFormat: RegularSeasonScheduleFormat;
  /** Required for BALANCED_CUSTOM; ignored for round-robin formats when derived. */
  gamesPerTeam?: number;
  homeAwayMode: HomeAwayMode;
  allowBackToBack: boolean;
  minimumRestSlots: number;
  qualifiersCount: number;
}

export interface ScheduledMatchSpec {
  scheduleKey: string;
  homeParticipantId: string;
  awayParticipantId: string;
  roundNumber: number;
  slotNumber: number;
  scheduleOrder: number;
}

export interface ScheduleRound {
  roundNumber: number;
  matches: ScheduledMatchSpec[];
}

export interface ScheduleDiagnostics {
  participantCount: number;
  totalMatches: number;
  rounds: number;
  gamesPerTeam: Record<string, number>;
  homeGames: Record<string, number>;
  awayGames: Record<string, number>;
  maxHomeAwayImbalance: number;
  restWarnings: string[];
}

export interface GeneratedSchedule {
  rounds: ScheduleRound[];
  matches: ScheduledMatchSpec[];
  diagnostics: ScheduleDiagnostics;
  scheduleHash: string;
  config: RegularSeasonConfig;
  seed: string;
  participantIds: string[];
}

export type MatchDecisionForStandings = 'REGULATION' | 'OVERTIME' | 'SHOOTOUT' | 'TIE';

export interface StandingMatchResult {
  scheduleOrder: number;
  homeParticipantId: string;
  awayParticipantId: string;
  homeTeamId: string;
  awayTeamId: string;
  homeScore: number;
  awayScore: number;
  homeRegulationScore: number;
  awayRegulationScore: number;
  decisionType: MatchDecisionForStandings;
  winnerParticipantId: string | null;
}

export interface StandingParticipant {
  participantId: string;
  teamId: string;
  teamNameSnapshot: string;
}

export interface StandingRow {
  rank: number;
  participantId: string;
  teamId: string;
  teamNameSnapshot: string;
  gamesPlayed: number;
  regulationWins: number;
  overtimeWins: number;
  shootoutWins: number;
  regulationLosses: number;
  overtimeLosses: number;
  shootoutLosses: number;
  ties: number;
  wins: number;
  losses: number;
  goalsFor: number;
  goalsAgainst: number;
  goalDifference: number;
  points: number;
  pointsPercentage: number;
  qualified: boolean;
  tiebreakerSummary: string;
}

export interface StandingsResult {
  provisional: boolean;
  rows: StandingRow[];
  standingsHash: string;
  qualificationParticipantIds: string[];
  pointsRules: CompetitionPointsRules;
  tiebreakers: TiebreakerCode[];
  completedMatchCount: number;
  scheduledMatchCount: number;
}

export interface TeamSeasonStatRow {
  participantId: string;
  teamId: string;
  teamNameSnapshot: string;
  gamesPlayed: number;
  goals: number;
  goalsAgainst: number;
  shotsOnGoal: number;
  shotAttempts: number;
  penalties: number;
  penaltyMinutes: number;
  powerPlayGoals: number;
  powerPlayOpportunities: number;
  shortHandedGoals: number;
  shootoutAttempts: number;
  shootoutGoals: number;
  /** Derived rates may be null when denominator is 0. */
  shootingPercentage: number | null;
  powerPlayPercentage: number | null;
  penaltyKillPercentage: number | null;
  extrasJson?: string;
}

export interface PlayerSeasonStatRow {
  playerId: string;
  teamId: string;
  teamNameSnapshot: string;
  firstNameSnapshot: string;
  lastNameSnapshot: string;
  position: string;
  isGoalie: boolean;
  gamesPlayed: number;
  goals: number;
  assists: number;
  points: number;
  shotsOnGoal: number;
  penaltyMinutes: number;
  powerPlayGoals: number;
  shortHandedGoals: number;
  shootoutAttempts: number;
  shootoutGoals: number;
  /** Goalie-oriented fields (0 for skaters). */
  wins: number;
  losses: number;
  shotsAgainst: number;
  saves: number;
  goalsAgainst: number;
  shutouts: number;
  savePercentage: number | null;
  shootingPercentage: number | null;
}

export interface MatchTeamStatSummary {
  teamId: string;
  goals: number;
  shotsOnGoal: number;
  shotAttempts?: number;
  penalties: number;
  penaltyMinutes: number;
  powerPlayGoals: number;
  powerPlayOpportunities?: number;
  shortHandedGoals: number;
  shootoutAttempts: number;
  shootoutGoals: number;
  extras?: Record<string, unknown>;
}

export interface MatchPlayerStatSummary {
  playerId: string;
  teamId: string;
  position: string;
  firstName?: string;
  lastName?: string;
  goals: number;
  assists: number;
  points: number;
  shotsOnGoal: number;
  penaltyMinutes: number;
  powerPlayGoals: number;
  shortHandedGoals: number;
  shootoutAttempts: number;
  shootoutGoals: number;
  /** Optional goalie fields from statsJson. */
  shotsAgainst?: number;
  saves?: number;
  goalsAgainst?: number;
  isShutout?: boolean;
  isWin?: boolean;
  isLoss?: boolean;
}

export class RegularSeasonError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = 'RegularSeasonError';
    this.code = code;
  }
}
