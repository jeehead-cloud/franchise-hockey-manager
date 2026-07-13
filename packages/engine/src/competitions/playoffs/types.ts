/** F19 playoff bracket / series — pure types (no Prisma). */

export type BracketMode = 'FIXED' | 'RESEED_EACH_ROUND';
export type SeedingMode = 'QUALIFICATION_ORDER' | 'MANUAL';
export type HomeHost = 'HIGHER_SEED' | 'LOWER_SEED';

export interface PlayoffMatchRulesOverride {
  tiesAllowed: false;
  overtimeEnabled: true;
  shootoutEnabled: boolean;
}

export interface PlayoffConfig {
  sourceStageId?: string;
  qualificationCount: number;
  bracketMode: BracketMode;
  seedingMode: SeedingMode;
  winsRequired: number;
  homePattern: string;
  /** Normalized per-game host sequence (length = max games). */
  normalizedHomePattern: HomeHost[];
  roundNames: string[];
  allowByes: false;
  bracketSeed?: string;
  matchRules: PlayoffMatchRulesOverride;
  /** When true, next round re-pairs by original seed (mirrors bracketMode RESEED). */
  reseeding: boolean;
}

export interface SeededParticipant {
  competitionParticipantId: string;
  seed: number;
}

export interface InitialSeriesSpec {
  roundNumber: number;
  roundName: string;
  seriesOrder: number;
  bracketSlot: string;
  participant1Id: string;
  participant2Id: string;
  participant1Seed: number;
  participant2Seed: number;
  homeAdvantageParticipantId: string;
  winsRequired: number;
  homePatternText: string;
  normalizedHomePattern: HomeHost[];
}

export interface GeneratedBracket {
  rounds: number;
  initialSeries: InitialSeriesSpec[];
  byeAdvancements: never[];
  bracketHash: string;
  diagnostics: {
    participantCount: number;
    firstRoundSeries: number;
    maxGamesPerSeries: number;
    totalPossibleSeries: number;
    roundNames: string[];
    bracketMode: BracketMode;
  };
  config: PlayoffConfig;
  participants: SeededParticipant[];
}

export interface SeriesGameResult {
  gameNumber: number;
  homeParticipantId: string;
  awayParticipantId: string;
  winnerParticipantId: string;
  decisionType: string;
}

export interface SeriesProgressionInput {
  participant1Id: string;
  participant2Id: string;
  participant1Seed: number;
  participant2Seed: number;
  winsRequired: number;
  games: SeriesGameResult[];
}

export interface SeriesProgressionResult {
  participant1Wins: number;
  participant2Wins: number;
  winnerParticipantId: string | null;
  clinched: boolean;
  nextGameNumber: number | null;
  errors: string[];
}

export interface NextRoundPairing {
  seriesOrder: number;
  bracketSlot: string;
  participant1Id: string;
  participant2Id: string;
  participant1Seed: number;
  participant2Seed: number;
  homeAdvantageParticipantId: string;
}

export class PlayoffError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = 'PlayoffError';
    this.code = code;
  }
}
