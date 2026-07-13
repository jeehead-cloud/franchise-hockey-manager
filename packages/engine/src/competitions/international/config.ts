import { sortJsonValue } from '../../balance/canonicalize.js';
import {
  getInternationalTournamentTemplate,
  INTERNATIONAL_TEMPLATE_KEYS,
} from './templates.js';
import type {
  InternationalTemplateKey,
  InternationalTournamentTemplate,
} from './types.js';
import {
  INTERNATIONAL_TOURNAMENT_SCHEMA_VERSION,
  InternationalTournamentError,
} from './types.js';

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function reqNumber(obj: Record<string, unknown>, key: string, min = 0): number {
  const v = obj[key];
  if (typeof v !== 'number' || !Number.isInteger(v) || v < min) {
    throw new InternationalTournamentError(
      'InvalidTournamentTemplate',
      `Invalid ${key}: expected integer >= ${min}`,
    );
  }
  return v;
}

function reqBool(obj: Record<string, unknown>, key: string): boolean {
  const v = obj[key];
  if (typeof v !== 'boolean') {
    throw new InternationalTournamentError(
      'InvalidTournamentTemplate',
      `Invalid ${key}: expected boolean`,
    );
  }
  return v;
}

/**
 * Strict validation — unknown fields rejected.
 * Knockout must guarantee a winner (OT/SO when ties not allowed).
 */
export function validateInternationalTournamentTemplate(
  raw: unknown,
): InternationalTournamentTemplate {
  if (!isObject(raw)) {
    throw new InternationalTournamentError(
      'InvalidTournamentTemplate',
      'Template must be an object',
    );
  }
  const known = new Set([
    'schemaVersion',
    'templateKey',
    'category',
    'participantCount',
    'groupStage',
    'knockout',
    'matchRules',
    'points',
    'tiebreakers',
    'medals',
  ]);
  for (const key of Object.keys(raw)) {
    if (!known.has(key)) {
      throw new InternationalTournamentError(
        'InvalidTournamentTemplate',
        `Unknown template field: ${key}`,
      );
    }
  }

  if (raw.schemaVersion !== INTERNATIONAL_TOURNAMENT_SCHEMA_VERSION) {
    throw new InternationalTournamentError(
      'InvalidTournamentTemplate',
      `Unsupported schemaVersion (expected ${INTERNATIONAL_TOURNAMENT_SCHEMA_VERSION})`,
    );
  }
  if (
    typeof raw.templateKey !== 'string' ||
    !(INTERNATIONAL_TEMPLATE_KEYS as string[]).includes(raw.templateKey)
  ) {
    throw new InternationalTournamentError(
      'InvalidTournamentTemplate',
      'Invalid templateKey',
    );
  }
  if (raw.category !== 'SENIOR_MEN' && raw.category !== 'JUNIOR_U20') {
    throw new InternationalTournamentError(
      'InvalidTournamentTemplate',
      'Invalid category',
    );
  }

  const participantCount = reqNumber(raw, 'participantCount', 2);
  if (!isObject(raw.groupStage)) {
    throw new InternationalTournamentError(
      'InvalidTournamentTemplate',
      'groupStage required',
    );
  }
  const gs = raw.groupStage;
  const groupCount = reqNumber(gs, 'groupCount', 1);
  const teamsPerGroup = reqNumber(gs, 'teamsPerGroup', 2);
  if (gs.roundRobinMode !== 'SINGLE' && gs.roundRobinMode !== 'DOUBLE') {
    throw new InternationalTournamentError(
      'InvalidTournamentTemplate',
      'roundRobinMode must be SINGLE or DOUBLE',
    );
  }
  const qualifiersPerGroup = reqNumber(gs, 'qualifiersPerGroup', 1);
  if (qualifiersPerGroup > teamsPerGroup) {
    throw new InternationalTournamentError(
      'InvalidTournamentTemplate',
      'qualifiersPerGroup cannot exceed teamsPerGroup',
    );
  }
  if (groupCount * teamsPerGroup !== participantCount) {
    throw new InternationalTournamentError(
      'InvalidTournamentTemplate',
      `participantCount ${participantCount} != groupCount*teamsPerGroup (${groupCount * teamsPerGroup})`,
    );
  }
  if (
    gs.assignmentMode !== 'MANUAL' &&
    gs.assignmentMode !== 'SEEDED_SNAKE' &&
    gs.assignmentMode !== 'SEEDED_BALANCED'
  ) {
    throw new InternationalTournamentError(
      'InvalidTournamentTemplate',
      'Invalid assignmentMode',
    );
  }

  if (!isObject(raw.knockout)) {
    throw new InternationalTournamentError('InvalidTournamentTemplate', 'knockout required');
  }
  const ko = raw.knockout;
  const knockout = {
    enabled: reqBool(ko, 'enabled'),
    quarterfinals: reqBool(ko, 'quarterfinals'),
    semifinals: reqBool(ko, 'semifinals'),
    bronzeGame: reqBool(ko, 'bronzeGame'),
    final: reqBool(ko, 'final'),
    reseeding: reqBool(ko, 'reseeding'),
  };
  if (knockout.enabled) {
    if (!knockout.final) {
      throw new InternationalTournamentError(
        'InvalidTournamentTemplate',
        'Knockout requires final when enabled',
      );
    }
    if (knockout.bronzeGame && !knockout.semifinals) {
      throw new InternationalTournamentError(
        'InvalidTournamentTemplate',
        'Bronze game requires semifinals',
      );
    }
  }

  if (!isObject(raw.matchRules)) {
    throw new InternationalTournamentError('InvalidTournamentTemplate', 'matchRules required');
  }
  const mr = raw.matchRules;
  const matchRules = {
    tiesAllowed: reqBool(mr, 'tiesAllowed'),
    overtimeEnabled: reqBool(mr, 'overtimeEnabled'),
    shootoutEnabled: reqBool(mr, 'shootoutEnabled'),
    knockoutShootoutEnabled: reqBool(mr, 'knockoutShootoutEnabled'),
  };
  if (knockout.enabled && matchRules.tiesAllowed) {
    throw new InternationalTournamentError(
      'InvalidTournamentTemplate',
      'Knockout tournaments cannot allow ties',
    );
  }
  if (
    knockout.enabled &&
    !matchRules.overtimeEnabled &&
    !matchRules.knockoutShootoutEnabled
  ) {
    throw new InternationalTournamentError(
      'InvalidTournamentTemplate',
      'Knockout must enable OT or shootout to guarantee a winner',
    );
  }

  if (!isObject(raw.points)) {
    throw new InternationalTournamentError('InvalidTournamentTemplate', 'points required');
  }
  const points = {
    regulationWin: reqNumber(raw.points, 'regulationWin', 0),
    overtimeWin: reqNumber(raw.points, 'overtimeWin', 0),
    shootoutWin: reqNumber(raw.points, 'shootoutWin', 0),
    overtimeLoss: reqNumber(raw.points, 'overtimeLoss', 0),
    shootoutLoss: reqNumber(raw.points, 'shootoutLoss', 0),
    regulationLoss: reqNumber(raw.points, 'regulationLoss', 0),
  };

  if (!Array.isArray(raw.tiebreakers) || raw.tiebreakers.length === 0) {
    throw new InternationalTournamentError(
      'InvalidTournamentTemplate',
      'tiebreakers required',
    );
  }
  const allowedTb = new Set([
    'POINTS',
    'HEAD_TO_HEAD',
    'GOAL_DIFFERENCE',
    'GOALS_FOR',
    'REGULATION_WINS',
    'RANDOM_DRAW',
  ]);
  for (const tb of raw.tiebreakers) {
    if (typeof tb !== 'string' || !allowedTb.has(tb)) {
      throw new InternationalTournamentError(
        'InvalidTournamentTemplate',
        `Unsupported tiebreaker: ${String(tb)}`,
      );
    }
  }

  if (!isObject(raw.medals)) {
    throw new InternationalTournamentError('InvalidTournamentTemplate', 'medals required');
  }
  const medals = {
    gold: reqBool(raw.medals, 'gold'),
    silver: reqBool(raw.medals, 'silver'),
    bronze: reqBool(raw.medals, 'bronze'),
  };
  if (knockout.enabled && medals.bronze && !knockout.bronzeGame) {
    throw new InternationalTournamentError(
      'InvalidTournamentTemplate',
      'Bronze medal requires bronzeGame',
    );
  }
  if (raw.templateKey === 'WORLD_JUNIORS' && raw.category !== 'JUNIOR_U20') {
    throw new InternationalTournamentError(
      'InvalidTournamentTemplate',
      'WORLD_JUNIORS requires JUNIOR_U20 category',
    );
  }
  if (
    (raw.templateKey === 'WORLD_CHAMPIONSHIP' || raw.templateKey === 'OLYMPIC_GAMES') &&
    raw.category !== 'SENIOR_MEN'
  ) {
    throw new InternationalTournamentError(
      'InvalidTournamentTemplate',
      `${raw.templateKey} requires SENIOR_MEN category`,
    );
  }

  return {
    schemaVersion: INTERNATIONAL_TOURNAMENT_SCHEMA_VERSION,
    templateKey: raw.templateKey as InternationalTemplateKey,
    category: raw.category,
    participantCount,
    groupStage: {
      groupCount,
      teamsPerGroup,
      roundRobinMode: gs.roundRobinMode,
      qualifiersPerGroup,
      crossGroupSeeding: reqBool(gs, 'crossGroupSeeding'),
      assignmentMode: gs.assignmentMode,
    },
    knockout,
    matchRules,
    points,
    tiebreakers: raw.tiebreakers as InternationalTournamentTemplate['tiebreakers'],
    medals,
  };
}

export function canonicalizeInternationalTemplate(
  template: InternationalTournamentTemplate,
): string {
  return JSON.stringify(sortJsonValue(template));
}

export function resolveInternationalTemplate(
  keyOrTemplate: InternationalTemplateKey | InternationalTournamentTemplate,
): InternationalTournamentTemplate {
  if (typeof keyOrTemplate === 'string') {
    return validateInternationalTournamentTemplate(
      getInternationalTournamentTemplate(keyOrTemplate),
    );
  }
  return validateInternationalTournamentTemplate(keyOrTemplate);
}
