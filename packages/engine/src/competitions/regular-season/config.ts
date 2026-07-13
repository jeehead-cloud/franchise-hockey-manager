import type { RegularSeasonConfig, RegularSeasonScheduleFormat } from './types.js';
import { RegularSeasonError } from './types.js';

const FORMATS = new Set<RegularSeasonScheduleFormat>([
  'ROUND_ROBIN',
  'DOUBLE_ROUND_ROBIN',
  'BALANCED_CUSTOM',
]);

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/** Default simplified regular-season config for small fixtures. */
export function defaultRegularSeasonConfig(
  overrides: Partial<RegularSeasonConfig> = {},
): RegularSeasonConfig {
  return {
    scheduleFormat: 'ROUND_ROBIN',
    homeAwayMode: 'BALANCED',
    allowBackToBack: true,
    minimumRestSlots: 0,
    qualifiersCount: 2,
    ...overrides,
  };
}

/**
 * Parse F17 RegularSeasonStageConfig (legacy + F18 fields) into RegularSeasonConfig.
 * Legacy: gamesPerTeam / schedulePreset / qualifiersCount.
 */
export function parseRegularSeasonConfig(raw: unknown): RegularSeasonConfig {
  if (!isPlainObject(raw)) {
    throw new RegularSeasonError('InvalidScheduleConfiguration', 'Regular-season config must be an object');
  }

  const allowed = new Set([
    'scheduleFormat',
    'gamesPerTeam',
    'schedulePreset',
    'homeAwayMode',
    'allowBackToBack',
    'minimumRestSlots',
    'qualifiersCount',
    'rounds',
    'roundRobinCycles',
  ]);
  for (const key of Object.keys(raw)) {
    if (!allowed.has(key)) {
      throw new RegularSeasonError('InvalidScheduleConfiguration', `Unknown regular-season field "${key}"`);
    }
  }

  let scheduleFormat: RegularSeasonScheduleFormat = 'ROUND_ROBIN';
  if (typeof raw.scheduleFormat === 'string') {
    if (!FORMATS.has(raw.scheduleFormat as RegularSeasonScheduleFormat)) {
      throw new RegularSeasonError(
        'InvalidScheduleConfiguration',
        `Unknown scheduleFormat "${raw.scheduleFormat}"`,
      );
    }
    scheduleFormat = raw.scheduleFormat as RegularSeasonScheduleFormat;
  } else if (typeof raw.schedulePreset === 'string') {
    const preset = raw.schedulePreset.toUpperCase();
    if (preset === 'DOUBLE_ROUND_ROBIN' || preset === 'DOUBLE') scheduleFormat = 'DOUBLE_ROUND_ROBIN';
    else if (preset === 'BALANCED_CUSTOM' || preset === 'CUSTOM') scheduleFormat = 'BALANCED_CUSTOM';
    else if (preset === 'ROUND_ROBIN' || preset === 'SINGLE') scheduleFormat = 'ROUND_ROBIN';
  } else if (typeof raw.gamesPerTeam === 'number') {
    scheduleFormat = 'BALANCED_CUSTOM';
  }

  const gamesPerTeam =
    raw.gamesPerTeam === undefined
      ? undefined
      : typeof raw.gamesPerTeam === 'number' && Number.isInteger(raw.gamesPerTeam) && raw.gamesPerTeam >= 1
        ? raw.gamesPerTeam
        : (() => {
            throw new RegularSeasonError('InvalidScheduleConfiguration', 'gamesPerTeam must be an integer >= 1');
          })();

  if (scheduleFormat === 'BALANCED_CUSTOM' && gamesPerTeam === undefined) {
    throw new RegularSeasonError(
      'InvalidScheduleConfiguration',
      'BALANCED_CUSTOM requires gamesPerTeam',
    );
  }

  const qualifiersCount =
    raw.qualifiersCount === undefined
      ? 0
      : typeof raw.qualifiersCount === 'number' &&
          Number.isInteger(raw.qualifiersCount) &&
          raw.qualifiersCount >= 0
        ? raw.qualifiersCount
        : (() => {
            throw new RegularSeasonError(
              'InvalidScheduleConfiguration',
              'qualifiersCount must be an integer >= 0',
            );
          })();

  const allowBackToBack =
    raw.allowBackToBack === undefined
      ? true
      : typeof raw.allowBackToBack === 'boolean'
        ? raw.allowBackToBack
        : (() => {
            throw new RegularSeasonError('InvalidScheduleConfiguration', 'allowBackToBack must be boolean');
          })();

  const minimumRestSlots =
    raw.minimumRestSlots === undefined
      ? 0
      : typeof raw.minimumRestSlots === 'number' &&
          Number.isInteger(raw.minimumRestSlots) &&
          raw.minimumRestSlots >= 0
        ? raw.minimumRestSlots
        : (() => {
            throw new RegularSeasonError(
              'InvalidScheduleConfiguration',
              'minimumRestSlots must be an integer >= 0',
            );
          })();

  if (raw.homeAwayMode !== undefined && raw.homeAwayMode !== 'BALANCED') {
    throw new RegularSeasonError('InvalidScheduleConfiguration', 'homeAwayMode must be BALANCED');
  }

  return {
    scheduleFormat,
    gamesPerTeam,
    homeAwayMode: 'BALANCED',
    allowBackToBack,
    minimumRestSlots,
    qualifiersCount,
  };
}

/** Serialize config back into stage config JSON (includes F18 fields + legacy aliases). */
export function toStageConfigJson(config: RegularSeasonConfig): Record<string, unknown> {
  const out: Record<string, unknown> = {
    scheduleFormat: config.scheduleFormat,
    homeAwayMode: config.homeAwayMode,
    allowBackToBack: config.allowBackToBack,
    minimumRestSlots: config.minimumRestSlots,
    qualifiersCount: config.qualifiersCount,
  };
  if (config.gamesPerTeam !== undefined) out.gamesPerTeam = config.gamesPerTeam;
  return out;
}
