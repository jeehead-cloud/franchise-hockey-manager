import type {
  InternationalNationalTeamCategory,
  InternationalTemplateKey,
  InternationalTournamentTemplate,
} from './types.js';
import { INTERNATIONAL_TOURNAMENT_SCHEMA_VERSION } from './types.js';

const DEFAULT_TIEBREAKERS = [
  'POINTS',
  'HEAD_TO_HEAD',
  'GOAL_DIFFERENCE',
  'GOALS_FOR',
  'REGULATION_WINS',
  'RANDOM_DRAW',
] as const;

function baseTemplate(
  key: InternationalTemplateKey,
  category: InternationalNationalTeamCategory,
  participantCount: number,
  groupCount: number,
  teamsPerGroup: number,
  qualifiersPerGroup: number,
): InternationalTournamentTemplate {
  return {
    schemaVersion: INTERNATIONAL_TOURNAMENT_SCHEMA_VERSION,
    templateKey: key,
    category,
    participantCount,
    groupStage: {
      groupCount,
      teamsPerGroup,
      roundRobinMode: 'SINGLE',
      qualifiersPerGroup,
      crossGroupSeeding: true,
      assignmentMode: 'SEEDED_SNAKE',
    },
    knockout: {
      enabled: true,
      quarterfinals: participantCount >= 8 && qualifiersPerGroup * groupCount >= 8,
      semifinals: true,
      bronzeGame: true,
      final: true,
      reseeding: false,
    },
    matchRules: {
      tiesAllowed: false,
      overtimeEnabled: true,
      shootoutEnabled: true,
      knockoutShootoutEnabled: true,
    },
    points: {
      regulationWin: 3,
      overtimeWin: 2,
      shootoutWin: 2,
      overtimeLoss: 1,
      shootoutLoss: 1,
      regulationLoss: 0,
    },
    tiebreakers: [...DEFAULT_TIEBREAKERS],
    medals: {
      gold: true,
      silver: true,
      bronze: true,
    },
  };
}

/**
 * Development tournament templates — simplified formats, not exact IIHF/IOC fidelity.
 */
export function getInternationalTournamentTemplate(
  key: InternationalTemplateKey,
): InternationalTournamentTemplate {
  switch (key) {
    case 'WORLD_JUNIORS':
      return baseTemplate('WORLD_JUNIORS', 'JUNIOR_U20', 8, 2, 4, 4);
    case 'WORLD_CHAMPIONSHIP':
      return baseTemplate('WORLD_CHAMPIONSHIP', 'SENIOR_MEN', 8, 2, 4, 4);
    case 'OLYMPIC_GAMES':
      return baseTemplate('OLYMPIC_GAMES', 'SENIOR_MEN', 8, 2, 4, 4);
    default: {
      const _exhaustive: never = key;
      throw new Error(`Unknown international template: ${_exhaustive}`);
    }
  }
}

export const INTERNATIONAL_TEMPLATE_KEYS: InternationalTemplateKey[] = [
  'WORLD_JUNIORS',
  'WORLD_CHAMPIONSHIP',
  'OLYMPIC_GAMES',
];

/** Smaller fictional variant for tests (4 teams, 1 group of 4, top 4 → SF). */
export function getTestInternationalTemplate(
  category: InternationalNationalTeamCategory = 'SENIOR_MEN',
): InternationalTournamentTemplate {
  return {
    schemaVersion: INTERNATIONAL_TOURNAMENT_SCHEMA_VERSION,
    templateKey: category === 'JUNIOR_U20' ? 'WORLD_JUNIORS' : 'WORLD_CHAMPIONSHIP',
    category,
    participantCount: 4,
    groupStage: {
      groupCount: 1,
      teamsPerGroup: 4,
      roundRobinMode: 'SINGLE',
      qualifiersPerGroup: 4,
      crossGroupSeeding: false,
      assignmentMode: 'SEEDED_SNAKE',
    },
    knockout: {
      enabled: true,
      quarterfinals: false,
      semifinals: true,
      bronzeGame: true,
      final: true,
      reseeding: false,
    },
    matchRules: {
      tiesAllowed: false,
      overtimeEnabled: true,
      shootoutEnabled: true,
      knockoutShootoutEnabled: true,
    },
    points: {
      regulationWin: 3,
      overtimeWin: 2,
      shootoutWin: 2,
      overtimeLoss: 1,
      shootoutLoss: 1,
      regulationLoss: 0,
    },
    tiebreakers: [...DEFAULT_TIEBREAKERS],
    medals: { gold: true, silver: true, bronze: true },
  };
}
