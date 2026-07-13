/** F17 competition framework — pure types (no Prisma / I/O). */

export const COMPETITION_RULES_SCHEMA_VERSION = 1 as const;

export type CompetitionRulesFormat =
  | 'LEAGUE_AND_PLAYOFF'
  | 'ROUND_ROBIN'
  | 'GROUPS_AND_KNOCKOUT'
  | 'KNOCKOUT_ONLY'
  | 'FINAL_RANKING_ONLY';

export type TiebreakerCode =
  | 'POINTS'
  | 'REGULATION_WINS'
  | 'TOTAL_WINS'
  | 'GOAL_DIFFERENCE'
  | 'GOALS_FOR'
  | 'HEAD_TO_HEAD'
  | 'RANDOM_DRAW';

export type CompetitionRulesTemplateKey =
  | 'SIMPLE_LEAGUE'
  | 'SIMPLE_ROUND_ROBIN'
  | 'GROUPS_AND_KNOCKOUT'
  | 'BEST_OF_SERIES_PLAYOFF';

export interface CompetitionPointsRules {
  regulationWin: number;
  overtimeWin: number;
  shootoutWin: number;
  overtimeLoss: number;
  shootoutLoss: number;
  regulationLoss: number;
  tie: number;
}

export interface CompetitionMatchRulesSection {
  overtimeEnabled: boolean;
  overtimeDurationSeconds: number;
  overtimeSkaterCount: number;
  shootoutEnabled: boolean;
  shootoutRounds: number;
  tiesAllowed: boolean;
}

export interface CompetitionQualificationRules {
  qualifiers: number;
  wildcards: number;
}

export interface CompetitionSeriesRules {
  winsRequired: number;
  homePattern: string;
  reseeding: boolean;
}

export interface CompetitionRules {
  schemaVersion: typeof COMPETITION_RULES_SCHEMA_VERSION;
  format: CompetitionRulesFormat;
  points?: CompetitionPointsRules;
  tiebreakers?: TiebreakerCode[];
  matchRules: CompetitionMatchRulesSection;
  qualification?: CompetitionQualificationRules;
  series?: CompetitionSeriesRules;
}

export type CompetitionStageType =
  | 'REGULAR_SEASON'
  | 'ROUND_ROBIN'
  | 'GROUP_STAGE'
  | 'KNOCKOUT'
  | 'BEST_OF_SERIES'
  | 'FINAL_RANKING';

export type StageParticipantSource =
  | 'EDITION_PARTICIPANTS'
  | 'PREVIOUS_STAGE_QUALIFIERS'
  | 'MANUAL'
  | 'FIXED_CONFIG';

export type CompetitionEditionStatus =
  | 'PLANNED'
  | 'PREPARING'
  | 'READY'
  | 'ACTIVE'
  | 'COMPLETED'
  | 'ARCHIVED'
  | 'CANCELLED';

export type CompetitionStageStatus =
  | 'PLANNED'
  | 'READY'
  | 'SCHEDULED'
  | 'IN_PROGRESS'
  | 'ACTIVE'
  | 'COMPLETED'
  | 'CANCELLED';

export type CompetitionParticipantStatus =
  | 'INVITED'
  | 'CONFIRMED'
  | 'WITHDRAWN'
  | 'ELIMINATED'
  | 'CHAMPION';

export type CompetitionParticipantSource =
  | 'MANUAL'
  | 'LEAGUE_MEMBERSHIP'
  | 'QUALIFICATION'
  | 'HOST'
  | 'DEFENDING_CHAMPION'
  | 'IMPORTED';

export interface RegularSeasonStageConfig {
  gamesPerTeam?: number;
  schedulePreset?: string;
  qualifiersCount?: number;
  /** F18 schedule format. */
  scheduleFormat?: 'ROUND_ROBIN' | 'DOUBLE_ROUND_ROBIN' | 'BALANCED_CUSTOM';
  homeAwayMode?: 'BALANCED';
  allowBackToBack?: boolean;
  minimumRestSlots?: number;
}

export interface RoundRobinStageConfig {
  doubleRound: boolean;
  qualifiersCount?: number;
}

export interface GroupStageConfig {
  groupCount: number;
  groupSize: number;
  doubleRound: boolean;
  qualifiersPerGroup: number;
  bestThirdPlaceCount?: number;
}

export interface KnockoutStageConfig {
  rounds: number;
  singleGame: boolean;
  reseeding: boolean;
  homeAdvantageRule?: string;
}

export interface BestOfSeriesStageConfig {
  winsRequired: number;
  reseeding: boolean;
  homePattern: string;
}

export interface FinalRankingStageConfig {
  rankingSize: number;
  sourceStageId?: string;
}

export type StageConfig =
  | RegularSeasonStageConfig
  | RoundRobinStageConfig
  | GroupStageConfig
  | KnockoutStageConfig
  | BestOfSeriesStageConfig
  | FinalRankingStageConfig;

export interface CompetitionStageDefinition {
  id: string;
  name: string;
  stageType: CompetitionStageType;
  stageOrder: number;
  status: CompetitionStageStatus;
  participantSource: StageParticipantSource;
  sourceStageId?: string | null;
  expectedQualifierCount?: number | null;
  config: StageConfig;
}

export interface CompetitionParticipantDefinition {
  id: string;
  teamId: string;
  status: CompetitionParticipantStatus;
  seed?: number | null;
  groupKey?: string | null;
  participantOrder: number;
}

export interface EditionStructureInput {
  editionId: string;
  status: CompetitionEditionStatus;
  worldSeasonId: string;
  rules: CompetitionRules;
  participants: CompetitionParticipantDefinition[];
  stages: CompetitionStageDefinition[];
  stageParticipantCounts?: Record<string, number>;
}

export type ReadinessOverall = 'READY' | 'WARNING' | 'NOT_READY';

export type ReadinessCheckSeverity = 'OK' | 'WARNING' | 'BLOCKER';

export interface ReadinessCheck {
  code: string;
  severity: ReadinessCheckSeverity;
  message: string;
  path?: string;
}

export interface EditionReadinessResult {
  status: ReadinessOverall;
  checks: ReadinessCheck[];
  confirmedParticipantCount: number;
  withdrawnParticipantCount: number;
  stageCount: number;
  blockers: string[];
  warnings: string[];
  allowedNextStatuses: CompetitionEditionStatus[];
}

export class CompetitionValidationError extends Error {
  readonly code: string;
  readonly path?: string;

  constructor(code: string, message: string, path?: string) {
    super(message);
    this.name = 'CompetitionValidationError';
    this.code = code;
    this.path = path;
  }
}
