import type { MatchCompletionRules } from '../simulation/match/types.js';
import {
  canonicalizeCompetitionRules,
  normalizeCompetitionRules,
} from './rules.js';
import type {
  BestOfSeriesStageConfig,
  CompetitionRules,
  CompetitionStageDefinition,
  CompetitionStageType,
  FinalRankingStageConfig,
  GroupStageConfig,
  KnockoutStageConfig,
  RegularSeasonStageConfig,
  RoundRobinStageConfig,
  StageConfig,
  StageParticipantSource,
  TiebreakerCode,
} from './types.js';
import { COMPETITION_RULES_SCHEMA_VERSION, CompetitionValidationError } from './types.js';

const FORMATS = new Set([
  'LEAGUE_AND_PLAYOFF',
  'ROUND_ROBIN',
  'GROUPS_AND_KNOCKOUT',
  'KNOCKOUT_ONLY',
  'FINAL_RANKING_ONLY',
]);

const TIEBREAKERS = new Set<TiebreakerCode>([
  'POINTS',
  'REGULATION_WINS',
  'TOTAL_WINS',
  'GOAL_DIFFERENCE',
  'GOALS_FOR',
  'HEAD_TO_HEAD',
  'RANDOM_DRAW',
]);

const HOME_PATTERN_RE = /^(\d+)(-\d+)*$/;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function assertNoUnknownKeys(
  obj: Record<string, unknown>,
  allowed: string[],
  path: string,
): void {
  const allowedSet = new Set(allowed);
  for (const key of Object.keys(obj)) {
    if (!allowedSet.has(key)) {
      throw new CompetitionValidationError(
        'UNKNOWN_FIELD',
        `Unknown field "${key}"`,
        `${path}.${key}`,
      );
    }
  }
}

function requireNumber(
  obj: Record<string, unknown>,
  key: string,
  path: string,
  opts?: { min?: number; integer?: boolean },
): number {
  const v = obj[key];
  if (typeof v !== 'number' || !Number.isFinite(v)) {
    throw new CompetitionValidationError('INVALID_NUMBER', `${key} must be a finite number`, `${path}.${key}`);
  }
  if (opts?.integer && !Number.isInteger(v)) {
    throw new CompetitionValidationError('INVALID_INTEGER', `${key} must be an integer`, `${path}.${key}`);
  }
  if (opts?.min !== undefined && v < opts.min) {
    throw new CompetitionValidationError('OUT_OF_RANGE', `${key} must be >= ${opts.min}`, `${path}.${key}`);
  }
  return v;
}

function requireBoolean(obj: Record<string, unknown>, key: string, path: string): boolean {
  const v = obj[key];
  if (typeof v !== 'boolean') {
    throw new CompetitionValidationError('INVALID_BOOLEAN', `${key} must be a boolean`, `${path}.${key}`);
  }
  return v;
}

function requireString(obj: Record<string, unknown>, key: string, path: string): string {
  const v = obj[key];
  if (typeof v !== 'string' || v.trim() === '') {
    throw new CompetitionValidationError('INVALID_STRING', `${key} must be a non-empty string`, `${path}.${key}`);
  }
  return v;
}

export function validateCompetitionRules(raw: unknown): CompetitionRules {
  if (!isPlainObject(raw)) {
    throw new CompetitionValidationError('INVALID_RULES', 'Rules must be an object');
  }
  assertNoUnknownKeys(
    raw,
    ['schemaVersion', 'format', 'points', 'tiebreakers', 'matchRules', 'qualification', 'series'],
    'rules',
  );

  const schemaVersion = requireNumber(raw, 'schemaVersion', 'rules', { integer: true, min: 1 });
  if (schemaVersion !== COMPETITION_RULES_SCHEMA_VERSION) {
    throw new CompetitionValidationError(
      'UNSUPPORTED_SCHEMA',
      `Unsupported competition rules schemaVersion ${schemaVersion}`,
      'rules.schemaVersion',
    );
  }

  const format = requireString(raw, 'format', 'rules');
  if (!FORMATS.has(format)) {
    throw new CompetitionValidationError('INVALID_FORMAT', `Unknown format "${format}"`, 'rules.format');
  }

  if (!isPlainObject(raw.matchRules)) {
    throw new CompetitionValidationError('MISSING_MATCH_RULES', 'matchRules is required', 'rules.matchRules');
  }
  assertNoUnknownKeys(
    raw.matchRules,
    [
      'overtimeEnabled',
      'overtimeDurationSeconds',
      'overtimeSkaterCount',
      'shootoutEnabled',
      'shootoutRounds',
      'tiesAllowed',
    ],
    'rules.matchRules',
  );
  const matchRules = {
    overtimeEnabled: requireBoolean(raw.matchRules, 'overtimeEnabled', 'rules.matchRules'),
    overtimeDurationSeconds: requireNumber(raw.matchRules, 'overtimeDurationSeconds', 'rules.matchRules', {
      integer: true,
      min: 1,
    }),
    overtimeSkaterCount: requireNumber(raw.matchRules, 'overtimeSkaterCount', 'rules.matchRules', {
      integer: true,
      min: 3,
    }),
    shootoutEnabled: requireBoolean(raw.matchRules, 'shootoutEnabled', 'rules.matchRules'),
    shootoutRounds: requireNumber(raw.matchRules, 'shootoutRounds', 'rules.matchRules', {
      integer: true,
      min: 1,
    }),
    tiesAllowed: requireBoolean(raw.matchRules, 'tiesAllowed', 'rules.matchRules'),
  };

  if (matchRules.tiesAllowed && (matchRules.overtimeEnabled || matchRules.shootoutEnabled)) {
    throw new CompetitionValidationError(
      'INVALID_MATCH_RULES',
      'tiesAllowed cannot be true when overtime or shootout is enabled',
      'rules.matchRules',
    );
  }
  if (!matchRules.tiesAllowed && !matchRules.overtimeEnabled && !matchRules.shootoutEnabled) {
    throw new CompetitionValidationError(
      'INVALID_MATCH_RULES',
      'When ties are not allowed, overtime or shootout must be enabled',
      'rules.matchRules',
    );
  }

  let points: CompetitionRules['points'];
  if (raw.points !== undefined) {
    if (!isPlainObject(raw.points)) {
      throw new CompetitionValidationError('INVALID_POINTS', 'points must be an object', 'rules.points');
    }
    assertNoUnknownKeys(
      raw.points,
      [
        'regulationWin',
        'overtimeWin',
        'shootoutWin',
        'overtimeLoss',
        'shootoutLoss',
        'regulationLoss',
        'tie',
      ],
      'rules.points',
    );
    points = {
      regulationWin: requireNumber(raw.points, 'regulationWin', 'rules.points', { integer: true, min: 0 }),
      overtimeWin: requireNumber(raw.points, 'overtimeWin', 'rules.points', { integer: true, min: 0 }),
      shootoutWin: requireNumber(raw.points, 'shootoutWin', 'rules.points', { integer: true, min: 0 }),
      overtimeLoss: requireNumber(raw.points, 'overtimeLoss', 'rules.points', { integer: true, min: 0 }),
      shootoutLoss: requireNumber(raw.points, 'shootoutLoss', 'rules.points', { integer: true, min: 0 }),
      regulationLoss: requireNumber(raw.points, 'regulationLoss', 'rules.points', { integer: true, min: 0 }),
      tie: requireNumber(raw.points, 'tie', 'rules.points', { integer: true, min: 0 }),
    };
  }

  let tiebreakers: TiebreakerCode[] | undefined;
  if (raw.tiebreakers !== undefined) {
    if (!Array.isArray(raw.tiebreakers)) {
      throw new CompetitionValidationError('INVALID_TIEBREAKERS', 'tiebreakers must be an array', 'rules.tiebreakers');
    }
    const seen = new Set<string>();
    tiebreakers = raw.tiebreakers.map((code, i) => {
      if (typeof code !== 'string' || !TIEBREAKERS.has(code as TiebreakerCode)) {
        throw new CompetitionValidationError(
          'INVALID_TIEBREAKER',
          `Unknown tiebreaker "${String(code)}"`,
          `rules.tiebreakers[${i}]`,
        );
      }
      if (seen.has(code)) {
        throw new CompetitionValidationError(
          'DUPLICATE_TIEBREAKER',
          `Duplicate tiebreaker "${code}"`,
          `rules.tiebreakers[${i}]`,
        );
      }
      seen.add(code);
      return code as TiebreakerCode;
    });
  }

  let qualification: CompetitionRules['qualification'];
  if (raw.qualification !== undefined) {
    if (!isPlainObject(raw.qualification)) {
      throw new CompetitionValidationError(
        'INVALID_QUALIFICATION',
        'qualification must be an object',
        'rules.qualification',
      );
    }
    assertNoUnknownKeys(raw.qualification, ['qualifiers', 'wildcards'], 'rules.qualification');
    qualification = {
      qualifiers: requireNumber(raw.qualification, 'qualifiers', 'rules.qualification', {
        integer: true,
        min: 0,
      }),
      wildcards: requireNumber(raw.qualification, 'wildcards', 'rules.qualification', {
        integer: true,
        min: 0,
      }),
    };
  }

  let series: CompetitionRules['series'];
  if (raw.series !== undefined) {
    if (!isPlainObject(raw.series)) {
      throw new CompetitionValidationError('INVALID_SERIES', 'series must be an object', 'rules.series');
    }
    assertNoUnknownKeys(raw.series, ['winsRequired', 'homePattern', 'reseeding'], 'rules.series');
    const homePattern = requireString(raw.series, 'homePattern', 'rules.series');
    if (!HOME_PATTERN_RE.test(homePattern)) {
      throw new CompetitionValidationError(
        'INVALID_HOME_PATTERN',
        'homePattern must look like "2-2-1-1-1"',
        'rules.series.homePattern',
      );
    }
    series = {
      winsRequired: requireNumber(raw.series, 'winsRequired', 'rules.series', { integer: true, min: 1 }),
      homePattern,
      reseeding: requireBoolean(raw.series, 'reseeding', 'rules.series'),
    };
  }

  const needsPoints =
    format === 'LEAGUE_AND_PLAYOFF' ||
    format === 'ROUND_ROBIN' ||
    format === 'GROUPS_AND_KNOCKOUT';
  if (needsPoints && !points) {
    throw new CompetitionValidationError(
      'MISSING_POINTS',
      `format ${format} requires points`,
      'rules.points',
    );
  }
  if (needsPoints && (!tiebreakers || tiebreakers.length === 0)) {
    throw new CompetitionValidationError(
      'MISSING_TIEBREAKERS',
      `format ${format} requires tiebreakers`,
      'rules.tiebreakers',
    );
  }
  if ((format === 'LEAGUE_AND_PLAYOFF' || format === 'KNOCKOUT_ONLY') && !series) {
    throw new CompetitionValidationError(
      'MISSING_SERIES',
      `format ${format} requires series rules`,
      'rules.series',
    );
  }

  return normalizeCompetitionRules({
    schemaVersion: COMPETITION_RULES_SCHEMA_VERSION,
    format: format as CompetitionRules['format'],
    points,
    tiebreakers,
    matchRules,
    qualification,
    series,
  });
}

export function parseCompetitionRulesJson(text: string): CompetitionRules {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new CompetitionValidationError('INVALID_JSON', 'Rules snapshot is not valid JSON');
  }
  return validateCompetitionRules(parsed);
}

/** Map competition matchRules section to F14 MatchCompletionRules. */
export function toMatchCompletionRules(
  matchRules: CompetitionRules['matchRules'],
): MatchCompletionRules {
  return {
    overtimeEnabled: matchRules.overtimeEnabled,
    shootoutEnabled: matchRules.shootoutEnabled,
    tiesAllowed: matchRules.tiesAllowed,
  };
}

export function validateHomePattern(pattern: string): void {
  if (!HOME_PATTERN_RE.test(pattern)) {
    throw new CompetitionValidationError(
      'INVALID_HOME_PATTERN',
      'homePattern must look like "2-2-1-1-1"',
      'homePattern',
    );
  }
}

export function validateStageConfig(
  stageType: CompetitionStageType,
  raw: unknown,
): StageConfig {
  if (!isPlainObject(raw)) {
    throw new CompetitionValidationError('INVALID_STAGE_CONFIG', 'Stage config must be an object');
  }

  switch (stageType) {
    case 'REGULAR_SEASON': {
      assertNoUnknownKeys(
        raw,
        [
          'gamesPerTeam',
          'schedulePreset',
          'qualifiersCount',
          'scheduleFormat',
          'homeAwayMode',
          'allowBackToBack',
          'minimumRestSlots',
        ],
        'config',
      );
      const config: RegularSeasonStageConfig = {};
      if (raw.gamesPerTeam !== undefined) {
        config.gamesPerTeam = requireNumber(raw, 'gamesPerTeam', 'config', { integer: true, min: 1 });
      }
      if (raw.schedulePreset !== undefined) {
        config.schedulePreset = requireString(raw, 'schedulePreset', 'config');
      }
      if (raw.qualifiersCount !== undefined) {
        config.qualifiersCount = requireNumber(raw, 'qualifiersCount', 'config', {
          integer: true,
          min: 0,
        });
      }
      if (raw.scheduleFormat !== undefined) {
        config.scheduleFormat = requireString(raw, 'scheduleFormat', 'config') as RegularSeasonStageConfig['scheduleFormat'];
      }
      if (raw.homeAwayMode !== undefined) {
        config.homeAwayMode = requireString(raw, 'homeAwayMode', 'config') as 'BALANCED';
      }
      if (raw.allowBackToBack !== undefined) {
        config.allowBackToBack = requireBoolean(raw, 'allowBackToBack', 'config');
      }
      if (raw.minimumRestSlots !== undefined) {
        config.minimumRestSlots = requireNumber(raw, 'minimumRestSlots', 'config', {
          integer: true,
          min: 0,
        });
      }
      return config;
    }
    case 'ROUND_ROBIN': {
      assertNoUnknownKeys(raw, ['doubleRound', 'qualifiersCount'], 'config');
      const config: RoundRobinStageConfig = {
        doubleRound: requireBoolean(raw, 'doubleRound', 'config'),
      };
      if (raw.qualifiersCount !== undefined) {
        config.qualifiersCount = requireNumber(raw, 'qualifiersCount', 'config', {
          integer: true,
          min: 0,
        });
      }
      return config;
    }
    case 'GROUP_STAGE': {
      assertNoUnknownKeys(
        raw,
        ['groupCount', 'groupSize', 'doubleRound', 'qualifiersPerGroup', 'bestThirdPlaceCount'],
        'config',
      );
      const config: GroupStageConfig = {
        groupCount: requireNumber(raw, 'groupCount', 'config', { integer: true, min: 1 }),
        groupSize: requireNumber(raw, 'groupSize', 'config', { integer: true, min: 2 }),
        doubleRound: requireBoolean(raw, 'doubleRound', 'config'),
        qualifiersPerGroup: requireNumber(raw, 'qualifiersPerGroup', 'config', {
          integer: true,
          min: 0,
        }),
      };
      if (raw.bestThirdPlaceCount !== undefined) {
        config.bestThirdPlaceCount = requireNumber(raw, 'bestThirdPlaceCount', 'config', {
          integer: true,
          min: 0,
        });
      }
      if (config.qualifiersPerGroup > config.groupSize) {
        throw new CompetitionValidationError(
          'INVALID_QUALIFIERS',
          'qualifiersPerGroup cannot exceed groupSize',
          'config.qualifiersPerGroup',
        );
      }
      return config;
    }
    case 'KNOCKOUT': {
      assertNoUnknownKeys(raw, ['rounds', 'singleGame', 'reseeding', 'homeAdvantageRule'], 'config');
      const config: KnockoutStageConfig = {
        rounds: requireNumber(raw, 'rounds', 'config', { integer: true, min: 1 }),
        singleGame: requireBoolean(raw, 'singleGame', 'config'),
        reseeding: requireBoolean(raw, 'reseeding', 'config'),
      };
      if (raw.homeAdvantageRule !== undefined) {
        config.homeAdvantageRule = requireString(raw, 'homeAdvantageRule', 'config');
      }
      return config;
    }
    case 'BEST_OF_SERIES': {
      assertNoUnknownKeys(
        raw,
        [
          'winsRequired',
          'reseeding',
          'homePattern',
          'sourceStageId',
          'qualificationCount',
          'bracketMode',
          'seedingMode',
          'roundNames',
          'allowByes',
          'bracketSeed',
          'matchRules',
        ],
        'config',
      );
      const homePattern = requireString(raw, 'homePattern', 'config');
      validateHomePattern(homePattern);
      const config: BestOfSeriesStageConfig = {
        winsRequired: requireNumber(raw, 'winsRequired', 'config', { integer: true, min: 1 }),
        reseeding: requireBoolean(raw, 'reseeding', 'config'),
        homePattern,
      };
      if (raw.sourceStageId !== undefined) {
        config.sourceStageId = requireString(raw, 'sourceStageId', 'config');
      }
      if (raw.qualificationCount !== undefined) {
        config.qualificationCount = requireNumber(raw, 'qualificationCount', 'config', {
          integer: true,
          min: 2,
        });
      }
      if (raw.bracketMode !== undefined) {
        const mode = requireString(raw, 'bracketMode', 'config');
        if (mode !== 'FIXED' && mode !== 'RESEED_EACH_ROUND') {
          throw new CompetitionValidationError('INVALID_STAGE_CONFIG', `Unknown bracketMode ${mode}`, 'config');
        }
        config.bracketMode = mode;
      }
      if (raw.seedingMode !== undefined) {
        const mode = requireString(raw, 'seedingMode', 'config');
        if (mode !== 'QUALIFICATION_ORDER' && mode !== 'MANUAL') {
          throw new CompetitionValidationError('INVALID_STAGE_CONFIG', `Unknown seedingMode ${mode}`, 'config');
        }
        config.seedingMode = mode;
      }
      if (raw.roundNames !== undefined) {
        if (!Array.isArray(raw.roundNames) || !raw.roundNames.every((n) => typeof n === 'string')) {
          throw new CompetitionValidationError('INVALID_STAGE_CONFIG', 'roundNames must be string[]', 'config');
        }
        config.roundNames = raw.roundNames as string[];
      }
      if (raw.allowByes !== undefined) {
        config.allowByes = requireBoolean(raw, 'allowByes', 'config');
      }
      if (raw.bracketSeed !== undefined) {
        config.bracketSeed = requireString(raw, 'bracketSeed', 'config');
      }
      if (raw.matchRules !== undefined) {
        if (!isPlainObject(raw.matchRules)) {
          throw new CompetitionValidationError('INVALID_STAGE_CONFIG', 'matchRules must be an object', 'config');
        }
        config.matchRules = {
          tiesAllowed:
            raw.matchRules.tiesAllowed === undefined
              ? undefined
              : requireBoolean(raw.matchRules, 'tiesAllowed', 'config.matchRules'),
          overtimeEnabled:
            raw.matchRules.overtimeEnabled === undefined
              ? undefined
              : requireBoolean(raw.matchRules, 'overtimeEnabled', 'config.matchRules'),
          shootoutEnabled:
            raw.matchRules.shootoutEnabled === undefined
              ? undefined
              : requireBoolean(raw.matchRules, 'shootoutEnabled', 'config.matchRules'),
        };
      }
      return config;
    }
    case 'FINAL_RANKING': {
      assertNoUnknownKeys(raw, ['rankingSize', 'sourceStageId'], 'config');
      const config: FinalRankingStageConfig = {
        rankingSize: requireNumber(raw, 'rankingSize', 'config', { integer: true, min: 1 }),
      };
      if (raw.sourceStageId !== undefined) {
        config.sourceStageId = requireString(raw, 'sourceStageId', 'config');
      }
      return config;
    }
    default: {
      const _exhaustive: never = stageType;
      throw new CompetitionValidationError('INVALID_STAGE_TYPE', `Unknown stage type ${_exhaustive}`);
    }
  }
}

export function canonicalizeStageConfig(config: StageConfig): string {
  return JSON.stringify(sortJsonForStage(config));
}

function sortJsonForStage(value: unknown): unknown {
  if (value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map(sortJsonForStage);
  const obj = value as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(obj).sort()) {
    out[key] = sortJsonForStage(obj[key]);
  }
  return out;
}

export function validateStageParticipantSource(
  source: StageParticipantSource,
  opts: { sourceStageId?: string | null; expectedQualifierCount?: number | null },
): void {
  if (source === 'PREVIOUS_STAGE_QUALIFIERS') {
    if (!opts.sourceStageId) {
      throw new CompetitionValidationError(
        'MISSING_SOURCE_STAGE',
        'PREVIOUS_STAGE_QUALIFIERS requires sourceStageId',
      );
    }
    if (
      opts.expectedQualifierCount == null ||
      !Number.isInteger(opts.expectedQualifierCount) ||
      opts.expectedQualifierCount < 1
    ) {
      throw new CompetitionValidationError(
        'INVALID_QUALIFIER_COUNT',
        'PREVIOUS_STAGE_QUALIFIERS requires expectedQualifierCount >= 1',
      );
    }
  }
}

export function validateStageDependencyGraph(stages: CompetitionStageDefinition[]): void {
  const byId = new Map(stages.map((s) => [s.id, s]));
  const byOrder = new Map<number, string>();

  for (const stage of stages) {
    if (!Number.isInteger(stage.stageOrder) || stage.stageOrder < 1) {
      throw new CompetitionValidationError(
        'INVALID_STAGE_ORDER',
        `Stage "${stage.name}" has invalid stageOrder`,
        stage.id,
      );
    }
    if (byOrder.has(stage.stageOrder)) {
      throw new CompetitionValidationError(
        'DUPLICATE_STAGE_ORDER',
        `Duplicate stageOrder ${stage.stageOrder}`,
        stage.id,
      );
    }
    byOrder.set(stage.stageOrder, stage.id);

    validateStageParticipantSource(stage.participantSource, {
      sourceStageId: stage.sourceStageId,
      expectedQualifierCount: stage.expectedQualifierCount,
    });

    if (stage.participantSource === 'PREVIOUS_STAGE_QUALIFIERS') {
      const sourceId = stage.sourceStageId!;
      if (sourceId === stage.id) {
        throw new CompetitionValidationError(
          'SELF_DEPENDENCY',
          `Stage "${stage.name}" cannot depend on itself`,
          stage.id,
        );
      }
      const source = byId.get(sourceId);
      if (!source) {
        throw new CompetitionValidationError(
          'MISSING_DEPENDENCY',
          `Stage "${stage.name}" references missing source stage`,
          stage.id,
        );
      }
      if (source.stageOrder >= stage.stageOrder) {
        throw new CompetitionValidationError(
          'INVALID_DEPENDENCY_ORDER',
          `Source stage must precede dependent stage`,
          stage.id,
        );
      }
    }
  }

  // Cycle detection via DFS on PREVIOUS_STAGE edges
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const visit = (id: string) => {
    if (visited.has(id)) return;
    if (visiting.has(id)) {
      throw new CompetitionValidationError('DEPENDENCY_CYCLE', 'Stage dependency cycle detected', id);
    }
    visiting.add(id);
    const stage = byId.get(id);
    if (stage?.sourceStageId) visit(stage.sourceStageId);
    visiting.delete(id);
    visited.add(id);
  };
  for (const stage of stages) visit(stage.id);
}

export { canonicalizeCompetitionRules };
