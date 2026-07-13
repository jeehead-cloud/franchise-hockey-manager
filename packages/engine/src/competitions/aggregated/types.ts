/** F21 aggregated league simulation — pure types. */

export const AGGREGATED_CONFIG_SCHEMA_VERSION = 1 as const;

export type AggregatedScheduleFormat =
  | 'ROUND_ROBIN'
  | 'DOUBLE_ROUND_ROBIN'
  | 'BALANCED_CUSTOM';

export interface AggregatedStatAllocation {
  topLineShare: number;
  secondaryScoringShare: number;
  depthShare: number;
  goalieStartShare: number;
}

export interface AggregatedSeasonConfig {
  schemaVersion: typeof AGGREGATED_CONFIG_SCHEMA_VERSION;
  simulationMode: 'AGGREGATED';
  scheduleFormat: AggregatedScheduleFormat;
  /** Target games per team for BALANCED_CUSTOM; derived for round-robin when omitted. */
  gamesPerTeam?: number;
  homeAdvantage: number;
  strengthRandomness: number;
  scoreVariance: number;
  overtimeRateTarget: number;
  shootoutRateTarget: number;
  statAllocation: AggregatedStatAllocation;
  minimumTeamGoalsPerGame: number;
  maximumTeamGoalsPerGame: number;
  qualifiersCount: number;
}

export type StrengthTier = 'VERY_WEAK' | 'WEAK' | 'AVERAGE' | 'STRONG' | 'VERY_STRONG';

export interface AggregatedRosterPlayer {
  playerId: string;
  firstName: string;
  lastName: string;
  position: string;
  isGoalie: boolean;
  /** 1–20 ability / effective performance proxy. */
  ability: number;
  offense: number;
  defense: number;
}

export interface AggregatedTeamStrengthInput {
  competitionParticipantId: string;
  teamId: string;
  teamNameSnapshot: string;
  players: AggregatedRosterPlayer[];
  chemistryModifier: number;
  coachingModifier: number;
}

export interface AggregatedTeamStrengthSnapshot {
  competitionParticipantId: string;
  teamId: string;
  teamNameSnapshot: string;
  rosterHash: string;
  skaterStrength: number;
  goalieStrength: number;
  offenseStrength: number;
  defenseStrength: number;
  specialTeamsStrength: number;
  depthStrength: number;
  chemistryModifier: number;
  coachingModifier: number;
  overallStrength: number;
  overallTier: StrengthTier;
  offenseTier: StrengthTier;
  defenseTier: StrengthTier;
  goaltendingTier: StrengthTier;
  eligibleSkaterCount: number;
  eligibleGoalieCount: number;
  depthWarning: string | null;
}

export type AggregatedDecisionType = 'REGULATION' | 'OVERTIME' | 'SHOOTOUT' | 'TIE';

export interface AggregatedGameSummary {
  scheduleKey: string;
  scheduleOrder: number;
  roundNumber: number;
  slotNumber: number;
  homeCompetitionParticipantId: string;
  awayCompetitionParticipantId: string;
  homeTeamNameSnapshot: string;
  awayTeamNameSnapshot: string;
  homeScore: number;
  awayScore: number;
  homeRegulationScore: number;
  awayRegulationScore: number;
  decisionType: AggregatedDecisionType;
  homePoints: number;
  awayPoints: number;
  winnerParticipantId: string | null;
  homeShots: number;
  awayShots: number;
  homeSaves: number;
  awaySaves: number;
  homePenalties: number;
  awayPenalties: number;
  homePim: number;
  awayPim: number;
  homePpOpportunities: number;
  awayPpOpportunities: number;
  homePpGoals: number;
  awayPpGoals: number;
  homePossessionEstimate: number;
  awayPossessionEstimate: number;
  seed: string;
  resultHash: string;
}

export interface AggregatedTeamSeasonStat {
  competitionParticipantId: string;
  teamId: string;
  teamNameSnapshot: string;
  gamesPlayed: number;
  wins: number;
  losses: number;
  overtimeLosses: number;
  goals: number;
  goalsAgainst: number;
  shots: number;
  shootingPercentage: number;
  saves: number;
  savePercentage: number;
  powerPlayOpportunities: number;
  powerPlayGoals: number;
  powerPlayPercentage: number;
  penaltyKillOpportunities: number;
  penaltyKills: number;
  penaltyKillPercentage: number;
  penalties: number;
  penaltyMinutes: number;
  possessionEstimate: number;
}

export interface AggregatedPlayerSeasonStat {
  playerId: string;
  teamId: string;
  competitionParticipantId: string;
  playerNameSnapshot: string;
  teamNameSnapshot: string;
  positionSnapshot: string;
  isGoalie: boolean;
  gamesPlayed: number;
  goals: number;
  assists: number;
  points: number;
  shots: number;
  penaltyMinutes: number;
  powerPlayGoals: number;
  shortHandedGoals: number;
  goalieWins: number;
  goalieLosses: number;
  overtimeLosses: number;
  shotsAgainst: number;
  saves: number;
  goalsAgainst: number;
  savePercentage: number | null;
  shutouts: number;
}

export type AggregatedAnomalyCode =
  | 'EXTREME_GOALS_PER_GAME'
  | 'EXTREME_HOME_WIN_RATE'
  | 'NO_STANDINGS_VARIANCE'
  | 'EXTREME_STRENGTH_DOMINANCE'
  | 'PLAYER_POINTS_CONCENTRATION'
  | 'GOALIE_STATS_RECONCILIATION'
  | 'TOO_MANY_OVERTIME_GAMES'
  | 'TOO_MANY_SHOOTOUTS'
  | 'TEAM_STATS_RECONCILIATION'
  | 'SMALL_LEAGUE_WARNING';

export interface AggregatedAnomaly {
  code: AggregatedAnomalyCode;
  severity: 'WARN';
  message: string;
}

export interface AggregatedSeasonResult {
  games: AggregatedGameSummary[];
  teamStats: AggregatedTeamSeasonStat[];
  playerStats: AggregatedPlayerSeasonStat[];
  scheduleHash: string;
  resultHash: string;
  inputHash: string;
  configHash: string;
  championParticipantId: string | null;
  anomalies: AggregatedAnomaly[];
}

export class AggregatedLeagueError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = 'AggregatedLeagueError';
    this.code = code;
  }
}
