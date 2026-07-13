import { sortJsonValue } from '../balance/canonicalize.js';
import type {
  CompetitionRules,
  CompetitionRulesTemplateKey,
  TiebreakerCode,
} from './types.js';
import { COMPETITION_RULES_SCHEMA_VERSION } from './types.js';

const DEFAULT_TIEBREAKERS: TiebreakerCode[] = [
  'POINTS',
  'REGULATION_WINS',
  'TOTAL_WINS',
  'GOAL_DIFFERENCE',
  'GOALS_FOR',
  'HEAD_TO_HEAD',
  'RANDOM_DRAW',
];

export function defaultMatchRulesSection(): CompetitionRules['matchRules'] {
  return {
    overtimeEnabled: true,
    overtimeDurationSeconds: 300,
    overtimeSkaterCount: 3,
    shootoutEnabled: true,
    shootoutRounds: 3,
    tiesAllowed: false,
  };
}

export function defaultPointsRules(): NonNullable<CompetitionRules['points']> {
  return {
    regulationWin: 2,
    overtimeWin: 2,
    shootoutWin: 2,
    overtimeLoss: 1,
    shootoutLoss: 1,
    regulationLoss: 0,
    tie: 1,
  };
}

/** Structural templates — development presets, not NHL rulebooks. */
export function getCompetitionRulesTemplate(
  key: CompetitionRulesTemplateKey,
): CompetitionRules {
  switch (key) {
    case 'SIMPLE_LEAGUE':
      return {
        schemaVersion: COMPETITION_RULES_SCHEMA_VERSION,
        format: 'LEAGUE_AND_PLAYOFF',
        points: defaultPointsRules(),
        tiebreakers: [...DEFAULT_TIEBREAKERS],
        matchRules: defaultMatchRulesSection(),
        qualification: { qualifiers: 4, wildcards: 0 },
        series: { winsRequired: 4, homePattern: '2-2-1-1-1', reseeding: false },
      };
    case 'SIMPLE_ROUND_ROBIN':
      return {
        schemaVersion: COMPETITION_RULES_SCHEMA_VERSION,
        format: 'ROUND_ROBIN',
        points: defaultPointsRules(),
        tiebreakers: [...DEFAULT_TIEBREAKERS],
        matchRules: defaultMatchRulesSection(),
        qualification: { qualifiers: 2, wildcards: 0 },
      };
    case 'GROUPS_AND_KNOCKOUT':
      return {
        schemaVersion: COMPETITION_RULES_SCHEMA_VERSION,
        format: 'GROUPS_AND_KNOCKOUT',
        points: defaultPointsRules(),
        tiebreakers: [...DEFAULT_TIEBREAKERS],
        matchRules: defaultMatchRulesSection(),
        qualification: { qualifiers: 8, wildcards: 0 },
        series: { winsRequired: 1, homePattern: '1', reseeding: true },
      };
    case 'BEST_OF_SERIES_PLAYOFF':
      return {
        schemaVersion: COMPETITION_RULES_SCHEMA_VERSION,
        format: 'KNOCKOUT_ONLY',
        matchRules: defaultMatchRulesSection(),
        series: { winsRequired: 4, homePattern: '2-2-1-1-1', reseeding: false },
      };
    default: {
      const _exhaustive: never = key;
      throw new Error(`Unknown template: ${_exhaustive}`);
    }
  }
}

export const COMPETITION_RULES_TEMPLATE_KEYS: CompetitionRulesTemplateKey[] = [
  'SIMPLE_LEAGUE',
  'SIMPLE_ROUND_ROBIN',
  'GROUPS_AND_KNOCKOUT',
  'BEST_OF_SERIES_PLAYOFF',
];

/** Deterministic canonical JSON for hashing. */
export function canonicalizeCompetitionRules(rules: CompetitionRules): string {
  return JSON.stringify(sortJsonValue(rules));
}

export function normalizeCompetitionRules(rules: CompetitionRules): CompetitionRules {
  return JSON.parse(canonicalizeCompetitionRules(rules)) as CompetitionRules;
}
