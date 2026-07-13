/** F20 archive schema version — independent of dataset schemaVersion. */
export const ARCHIVE_SCHEMA_VERSION = 1 as const;

export type ArchiveAwardType =
  | 'CHAMPION'
  | 'REGULAR_SEASON_CHAMPION'
  | 'MOST_POINTS'
  | 'MOST_GOALS'
  | 'MOST_ASSISTS'
  | 'BEST_GOALIE_SAVE_PERCENTAGE'
  | 'PLAYOFF_MOST_POINTS'
  | 'PLAYOFF_MOST_GOALS'
  | 'BEST_REGULAR_SEASON_RECORD';

export type ArchiveAwardRecipientType = 'TEAM' | 'PLAYER';

export type ArchivePlayoffResult =
  | 'CHAMPION'
  | 'FINALIST'
  | 'SEMIFINALIST'
  | 'QUARTERFINALIST'
  | 'DID_NOT_QUALIFY'
  | 'ELIMINATED';

export type ArchiveReadinessStatus = 'READY' | 'WARNING' | 'NOT_READY';

export interface ArchiveReadinessCheck {
  id: string;
  status: 'PASS' | 'WARN' | 'FAIL';
  message: string;
}

export interface ArchiveReadinessResult {
  status: ArchiveReadinessStatus;
  checks: ArchiveReadinessCheck[];
  blockers: string[];
  warnings: string[];
  sourceSnapshotHash: string | null;
}

export interface NormalizedArchiveParticipant {
  sourceCompetitionParticipantId: string;
  sourceTeamId: string;
  participantOrder: number;
  seed: number | null;
  finalStatus: string;
  teamNameSnapshot: string;
  teamShortNameSnapshot: string | null;
  countryNameSnapshot: string | null;
  leagueNameSnapshot: string | null;
  groupKey: string | null;
  qualifiedForPlayoffs: boolean;
  playoffSeed: number | null;
  finalRegularSeasonRank: number | null;
  finalPlayoffResult: ArchivePlayoffResult | null;
}

export interface NormalizedArchiveStage {
  sourceCompetitionStageId: string;
  stageOrder: number;
  stageNameSnapshot: string;
  stageType: string;
  finalStatus: string;
  configSnapshotText: string;
  configHash: string;
  scheduleHash: string | null;
  bracketHash: string | null;
  matchCount: number;
  completedAtSnapshot: string | null;
  championSourceParticipantId: string | null;
  snapshotHash: string;
  sourceStageSourceId: string | null;
}

export interface NormalizedArchiveStanding {
  sourceStageId: string;
  sourceParticipantId: string;
  rank: number;
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
  tiebreakerSummaryText: string;
  sourceSnapshotHash: string;
}

export interface NormalizedArchiveTeamStat {
  sourceStageId: string;
  sourceParticipantId: string;
  gamesPlayed: number;
  goals: number;
  goalsAgainst: number;
  shots: number;
  shotAttempts: number;
  shootingPercentage: number | null;
  penalties: number;
  penaltyMinutes: number;
  powerPlayOpportunities: number;
  powerPlayGoals: number;
  powerPlayPercentage: number | null;
  shortHandedGoals: number;
  wins: number;
  losses: number;
  overtimeLosses: number;
  seriesWins: number;
  seriesLosses: number;
  statsSnapshotText: string;
  sourceSnapshotHash: string;
}

export interface NormalizedArchivePlayerStat {
  sourceStageId: string;
  sourcePlayerId: string;
  sourceTeamId: string | null;
  sourceParticipantId: string | null;
  playerNameSnapshot: string;
  teamNameSnapshot: string | null;
  positionSnapshot: string;
  isGoalie: boolean;
  gamesPlayed: number;
  goals: number;
  assists: number;
  points: number;
  shots: number;
  shotAttempts: number;
  shootingPercentage: number | null;
  penaltyMinutes: number;
  powerPlayGoals: number;
  shortHandedGoals: number;
  shootoutAttempts: number;
  shootoutGoals: number;
  goalieWins: number;
  goalieLosses: number;
  overtimeLosses: number;
  shotsAgainst: number;
  saves: number;
  goalsAgainst: number;
  savePercentage: number | null;
  shutouts: number;
  statsSnapshotText: string;
  sourceSnapshotHash: string;
}

export interface NormalizedArchiveMatchSummary {
  sourceStageId: string;
  sourceMatchId: string;
  sourceCurrentResultId: string;
  sourcePlayoffSeriesId: string | null;
  scheduleOrder: number | null;
  roundNumber: number | null;
  slotNumber: number | null;
  gameNumber: number | null;
  homeSourceParticipantId: string;
  awaySourceParticipantId: string;
  homeNameSnapshot: string;
  awayNameSnapshot: string;
  homeScore: number;
  awayScore: number;
  decisionType: string;
  matchStatus: string;
  seed: string;
  engineVersion: string;
  balanceVersionSnapshot: string;
  resultTraceHash: string;
  completedAtSnapshot: string | null;
}

export interface NormalizedArchiveSeries {
  sourceStageId: string;
  sourcePlayoffSeriesId: string;
  roundNumber: number;
  roundNameSnapshot: string;
  seriesOrder: number;
  bracketSlot: string;
  participant1SourceId: string;
  participant2SourceId: string;
  participant1Seed: number;
  participant2Seed: number;
  participant1Wins: number;
  participant2Wins: number;
  winsRequired: number;
  winnerSourceParticipantId: string | null;
  homePatternSnapshotText: string;
  status: string;
  startedAtSnapshot: string | null;
  completedAtSnapshot: string | null;
  games: NormalizedArchiveSeriesGame[];
}

export interface NormalizedArchiveSeriesGame {
  sourceMatchId: string;
  sourceCurrentResultId: string;
  gameNumber: number;
  homeSourceParticipantId: string;
  awaySourceParticipantId: string;
  homeScore: number;
  awayScore: number;
  decisionType: string;
  engineVersion: string;
  balanceVersionIdSnapshot: string | null;
  seed: string;
  traceHash: string;
  completedAtSnapshot: string | null;
}

export interface NormalizedArchiveAward {
  awardType: ArchiveAwardType;
  awardNameSnapshot: string;
  recipientType: ArchiveAwardRecipientType;
  sourceParticipantId: string | null;
  sourcePlayerId: string | null;
  playerNameSnapshot: string | null;
  teamNameSnapshot: string | null;
  valueNumber: number | null;
  valueText: string | null;
  rank: number;
  shared: boolean;
  criteriaSnapshotText: string;
  sourceStageId: string | null;
  sourceSnapshotHash: string;
}

export interface NormalizedCompetitionArchive {
  archiveSchemaVersion: typeof ARCHIVE_SCHEMA_VERSION;
  competitionId: string;
  competitionEditionId: string;
  worldSeasonId: string;
  competitionNameSnapshot: string;
  competitionShortNameSnapshot: string | null;
  editionNameSnapshot: string;
  worldSeasonNameSnapshot: string;
  competitionTypeSnapshot: string;
  simulationLevelSnapshot: string | null;
  rulesSnapshotText: string;
  rulesHash: string;
  engineVersions: string[];
  balanceVersions: string[];
  participantCount: number;
  stageCount: number;
  matchCount: number;
  championSourceParticipantId: string | null;
  championTeamSourceId: string | null;
  championNameSnapshot: string | null;
  championShortNameSnapshot: string | null;
  sourceSnapshotHash: string;
  participants: NormalizedArchiveParticipant[];
  stages: NormalizedArchiveStage[];
  standings: NormalizedArchiveStanding[];
  teamStats: NormalizedArchiveTeamStat[];
  playerStats: NormalizedArchivePlayerStat[];
  matches: NormalizedArchiveMatchSummary[];
  series: NormalizedArchiveSeries[];
  awards: NormalizedArchiveAward[];
}

export interface HistoricalRecordHolder {
  value: number;
  label: string;
  archiveId: string | null;
  competitionName: string | null;
  seasonName: string | null;
  sourcePlayerId: string | null;
  sourceTeamId: string | null;
  sourceParticipantId: string | null;
}

export interface HistoricalRecord {
  category: string;
  scope: 'TEAM' | 'PLAYER' | 'GOALIE' | 'CHAMPIONSHIP';
  holders: HistoricalRecordHolder[];
}

export interface AwardCalculationInput {
  minimumGoalieGames: number;
  championSourceParticipantId: string | null;
  championNameSnapshot: string | null;
  regularSeasonStageId: string | null;
  playoffStageId: string | null;
  standings: NormalizedArchiveStanding[];
  playerStats: NormalizedArchivePlayerStat[];
  participants: NormalizedArchiveParticipant[];
}
