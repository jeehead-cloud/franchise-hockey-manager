/** F23 international tournament templates — pure types (no Prisma / I/O). */

export const INTERNATIONAL_TOURNAMENT_SCHEMA_VERSION = 1 as const;

export type InternationalTemplateKey =
  | 'WORLD_JUNIORS'
  | 'WORLD_CHAMPIONSHIP'
  | 'OLYMPIC_GAMES';

export type InternationalNationalTeamCategory = 'SENIOR_MEN' | 'JUNIOR_U20';

export type GroupAssignmentMode = 'MANUAL' | 'SEEDED_SNAKE' | 'SEEDED_BALANCED';

export type RoundRobinMode = 'SINGLE' | 'DOUBLE';

export interface InternationalGroupStageConfig {
  groupCount: number;
  teamsPerGroup: number;
  roundRobinMode: RoundRobinMode;
  qualifiersPerGroup: number;
  crossGroupSeeding: boolean;
  assignmentMode: GroupAssignmentMode;
}

export interface InternationalKnockoutConfig {
  enabled: boolean;
  quarterfinals: boolean;
  semifinals: boolean;
  bronzeGame: boolean;
  final: boolean;
  reseeding: boolean;
}

export interface InternationalMatchRulesConfig {
  tiesAllowed: boolean;
  overtimeEnabled: boolean;
  shootoutEnabled: boolean;
  knockoutShootoutEnabled: boolean;
}

export interface InternationalPointsConfig {
  regulationWin: number;
  overtimeWin: number;
  shootoutWin: number;
  overtimeLoss: number;
  shootoutLoss: number;
  regulationLoss: number;
}

export type InternationalTiebreaker =
  | 'POINTS'
  | 'HEAD_TO_HEAD'
  | 'GOAL_DIFFERENCE'
  | 'GOALS_FOR'
  | 'REGULATION_WINS'
  | 'RANDOM_DRAW';

export interface InternationalMedalsConfig {
  gold: boolean;
  silver: boolean;
  bronze: boolean;
}

export interface InternationalTournamentTemplate {
  schemaVersion: typeof INTERNATIONAL_TOURNAMENT_SCHEMA_VERSION;
  templateKey: InternationalTemplateKey;
  category: InternationalNationalTeamCategory;
  participantCount: number;
  groupStage: InternationalGroupStageConfig;
  knockout: InternationalKnockoutConfig;
  matchRules: InternationalMatchRulesConfig;
  points: InternationalPointsConfig;
  tiebreakers: InternationalTiebreaker[];
  medals: InternationalMedalsConfig;
}

export interface TournamentParticipantSeed {
  participantId: string;
  teamId: string;
  tournamentSeed: number;
  /** Optional explicit group for MANUAL assignment. */
  groupKey?: string | null;
}

export interface GroupAssignment {
  groupKey: string;
  participantIds: string[];
}

export interface GroupScheduleMatchSpec {
  scheduleKey: string;
  groupKey: string;
  homeParticipantId: string;
  awayParticipantId: string;
  roundNumber: number;
  slotNumber: number;
  scheduleOrder: number;
}

export interface GeneratedGroupSchedule {
  groups: GroupAssignment[];
  matches: GroupScheduleMatchSpec[];
  matchCount: number;
  scheduleHash: string;
  groupAssignmentHash: string;
}

export interface GroupStandingRow {
  participantId: string;
  groupKey: string;
  rank: number;
  gamesPlayed: number;
  regulationWins: number;
  overtimeWins: number;
  shootoutWins: number;
  regulationLosses: number;
  overtimeLosses: number;
  shootoutLosses: number;
  goalsFor: number;
  goalsAgainst: number;
  goalDifference: number;
  points: number;
  qualified: boolean;
  tiebreakerSummary: string;
}

export interface QualificationEntry {
  participantId: string;
  sourceGroupKey: string;
  sourceRank: number;
  knockoutSeed: number;
  homeParticipantId?: string;
  awayParticipantId?: string;
  bracketSlot: number;
  roundName: 'QUARTERFINAL' | 'SEMIFINAL' | 'BRONZE' | 'FINAL';
}

export interface KnockoutMatchupSpec {
  roundName: 'QUARTERFINAL' | 'SEMIFINAL' | 'BRONZE' | 'FINAL';
  roundNumber: number;
  seriesOrder: number;
  bracketSlot: number;
  participant1Id: string | null;
  participant2Id: string | null;
  participant1Seed: number | null;
  participant2Seed: number | null;
  nextSeriesSlot: number | null;
  isBronze: boolean;
  isFinal: boolean;
}

export interface GeneratedKnockoutBracket {
  matchups: KnockoutMatchupSpec[];
  qualification: QualificationEntry[];
  bracketHash: string;
}

export type TournamentMedalType = 'GOLD' | 'SILVER' | 'BRONZE';

export interface TournamentMedalResultSpec {
  medalType: TournamentMedalType;
  participantId: string;
  finalPlacement: number;
  sourceMatchKey?: string | null;
}

export interface TournamentReconciliationIssue {
  code: string;
  message: string;
}

export interface TournamentReconciliationResult {
  ok: boolean;
  issues: TournamentReconciliationIssue[];
}

export class InternationalTournamentError extends Error {
  code: string;
  details?: unknown;

  constructor(code: string, message: string, details?: unknown) {
    super(message);
    this.name = 'InternationalTournamentError';
    this.code = code;
    this.details = details;
  }
}
