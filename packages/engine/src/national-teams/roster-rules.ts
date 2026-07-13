import {
  NATIONAL_TEAM_ELIGIBILITY_SCHEMA_VERSION,
  NationalTeamError,
  type AgeRule,
  type NationalTeamCategory,
  type NationalTeamEligibilityRules,
  type NationalityRule,
  type RosterLimits,
  type SelectionRules,
} from './types.js';

export const DEFAULT_SENIOR_ROSTER_LIMITS: RosterLimits = {
  minimumPlayers: 20,
  maximumPlayers: 25,
  minimumForwards: 12,
  minimumDefensemen: 6,
  minimumGoalies: 2,
  maximumGoalies: 3,
  targetForwards: 13,
  targetDefensemen: 7,
  targetGoalies: 3,
  maximumAlternateCaptains: 2,
};

export const DEFAULT_U20_ROSTER_LIMITS: RosterLimits = {
  ...DEFAULT_SENIOR_ROSTER_LIMITS,
};

export function defaultEligibilityRules(
  category: NationalTeamCategory,
  overrides: Partial<NationalTeamEligibilityRules> = {},
): NationalTeamEligibilityRules {
  const ageRule: AgeRule =
    category === 'JUNIOR_U20'
      ? { mode: 'MAX_AGE_ON_DATE', maxAge: 19, cutoffDate: '2026-12-31' }
      : { mode: 'NONE' };

  const base: NationalTeamEligibilityRules = {
    schemaVersion: NATIONAL_TEAM_ELIGIBILITY_SCHEMA_VERSION,
    category,
    nationalityRule: { mode: 'PRIMARY_NATIONALITY' },
    ageRule,
    rosterLimits:
      category === 'JUNIOR_U20' ? { ...DEFAULT_U20_ROSTER_LIMITS } : { ...DEFAULT_SENIOR_ROSTER_LIMITS },
    selection: {
      minimumEligibleAbility: 0,
      allowInjured: true,
      allowUnsigned: true,
    },
  };
  return validateEligibilityRules({
    ...base,
    ...overrides,
    schemaVersion: NATIONAL_TEAM_ELIGIBILITY_SCHEMA_VERSION,
    category: overrides.category ?? category,
    nationalityRule: overrides.nationalityRule ?? base.nationalityRule,
    ageRule: overrides.ageRule ?? base.ageRule,
    rosterLimits: overrides.rosterLimits ?? base.rosterLimits,
    selection: overrides.selection ?? base.selection,
  });
}

function assertUnit(name: string, value: number, min: number, max: number) {
  if (!Number.isFinite(value) || value < min || value > max) {
    throw new NationalTeamError(
      'InvalidEligibilityRules',
      `${name} must be between ${min} and ${max}`,
    );
  }
}

function parseNationalityRule(raw: unknown): NationalityRule {
  if (!raw || typeof raw !== 'object') {
    throw new NationalTeamError('InvalidEligibilityRules', 'nationalityRule must be an object');
  }
  const mode = (raw as { mode?: unknown }).mode;
  if (
    mode !== 'PRIMARY_NATIONALITY' &&
    mode !== 'ANY_CITIZENSHIP' &&
    mode !== 'BIRTH_COUNTRY_OR_CITIZENSHIP'
  ) {
    throw new NationalTeamError('InvalidEligibilityRules', 'Invalid nationalityRule.mode');
  }
  return { mode };
}

function parseAgeRule(raw: unknown): AgeRule {
  if (!raw || typeof raw !== 'object') {
    throw new NationalTeamError('InvalidEligibilityRules', 'ageRule must be an object');
  }
  const r = raw as Record<string, unknown>;
  if (r.mode !== 'NONE' && r.mode !== 'MAX_AGE_ON_DATE') {
    throw new NationalTeamError('InvalidEligibilityRules', 'Invalid ageRule.mode');
  }
  if (r.mode === 'NONE') return { mode: 'NONE' };
  const maxAge = Number(r.maxAge);
  const cutoffDate = String(r.cutoffDate ?? '');
  if (!Number.isInteger(maxAge) || maxAge < 15 || maxAge > 23) {
    throw new NationalTeamError('InvalidEligibilityRules', 'ageRule.maxAge must be 15–23');
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(cutoffDate)) {
    throw new NationalTeamError(
      'InvalidEligibilityRules',
      'ageRule.cutoffDate must be YYYY-MM-DD',
    );
  }
  return { mode: 'MAX_AGE_ON_DATE', maxAge, cutoffDate };
}

function parseRosterLimits(raw: unknown): RosterLimits {
  if (!raw || typeof raw !== 'object') {
    throw new NationalTeamError('InvalidEligibilityRules', 'rosterLimits must be an object');
  }
  const r = raw as Record<string, unknown>;
  const limits: RosterLimits = {
    minimumPlayers: Number(r.minimumPlayers ?? DEFAULT_SENIOR_ROSTER_LIMITS.minimumPlayers),
    maximumPlayers: Number(r.maximumPlayers ?? DEFAULT_SENIOR_ROSTER_LIMITS.maximumPlayers),
    minimumForwards: Number(r.minimumForwards ?? DEFAULT_SENIOR_ROSTER_LIMITS.minimumForwards),
    minimumDefensemen: Number(
      r.minimumDefensemen ?? DEFAULT_SENIOR_ROSTER_LIMITS.minimumDefensemen,
    ),
    minimumGoalies: Number(r.minimumGoalies ?? DEFAULT_SENIOR_ROSTER_LIMITS.minimumGoalies),
    maximumGoalies: Number(r.maximumGoalies ?? DEFAULT_SENIOR_ROSTER_LIMITS.maximumGoalies),
    targetForwards: Number(r.targetForwards ?? DEFAULT_SENIOR_ROSTER_LIMITS.targetForwards),
    targetDefensemen: Number(r.targetDefensemen ?? DEFAULT_SENIOR_ROSTER_LIMITS.targetDefensemen),
    targetGoalies: Number(r.targetGoalies ?? DEFAULT_SENIOR_ROSTER_LIMITS.targetGoalies),
    maximumAlternateCaptains: Number(
      r.maximumAlternateCaptains ?? DEFAULT_SENIOR_ROSTER_LIMITS.maximumAlternateCaptains,
    ),
  };
  assertUnit('minimumPlayers', limits.minimumPlayers, 15, 30);
  assertUnit('maximumPlayers', limits.maximumPlayers, limits.minimumPlayers, 30);
  assertUnit('minimumForwards', limits.minimumForwards, 8, 20);
  assertUnit('minimumDefensemen', limits.minimumDefensemen, 4, 12);
  assertUnit('minimumGoalies', limits.minimumGoalies, 1, 4);
  assertUnit('maximumGoalies', limits.maximumGoalies, limits.minimumGoalies, 4);
  assertUnit('targetForwards', limits.targetForwards, limits.minimumForwards, 20);
  assertUnit('targetDefensemen', limits.targetDefensemen, limits.minimumDefensemen, 12);
  assertUnit('targetGoalies', limits.targetGoalies, limits.minimumGoalies, 4);
  assertUnit('maximumAlternateCaptains', limits.maximumAlternateCaptains, 0, 4);
  const targetSum = limits.targetForwards + limits.targetDefensemen + limits.targetGoalies;
  if (targetSum < limits.minimumPlayers || targetSum > limits.maximumPlayers) {
    throw new NationalTeamError(
      'InvalidEligibilityRules',
      'target position sums must fit within roster limits',
    );
  }
  return limits;
}

function parseSelection(raw: unknown): SelectionRules {
  if (!raw || typeof raw !== 'object') {
    return {
      minimumEligibleAbility: 0,
      allowInjured: true,
      allowUnsigned: true,
    };
  }
  const r = raw as Record<string, unknown>;
  const minimumEligibleAbility = Number(r.minimumEligibleAbility ?? 0);
  assertUnit('minimumEligibleAbility', minimumEligibleAbility, 0, 20);
  return {
    minimumEligibleAbility,
    allowInjured: r.allowInjured !== false,
    allowUnsigned: r.allowUnsigned !== false,
  };
}

export function validateEligibilityRules(raw: unknown): NationalTeamEligibilityRules {
  if (!raw || typeof raw !== 'object') {
    throw new NationalTeamError('InvalidEligibilityRules', 'Rules must be an object');
  }
  const c = raw as Record<string, unknown>;
  const unknown = Object.keys(c).filter(
    (k) =>
      ![
        'schemaVersion',
        'category',
        'nationalityRule',
        'ageRule',
        'rosterLimits',
        'selection',
      ].includes(k),
  );
  if (unknown.length > 0) {
    throw new NationalTeamError(
      'InvalidEligibilityRules',
      `Unknown eligibility fields: ${unknown.join(', ')}`,
    );
  }
  const schemaVersion = c.schemaVersion ?? NATIONAL_TEAM_ELIGIBILITY_SCHEMA_VERSION;
  if (schemaVersion !== NATIONAL_TEAM_ELIGIBILITY_SCHEMA_VERSION) {
    throw new NationalTeamError(
      'InvalidEligibilityRules',
      `Unsupported eligibility schemaVersion ${String(schemaVersion)}`,
    );
  }
  if (c.category !== 'SENIOR_MEN' && c.category !== 'JUNIOR_U20') {
    throw new NationalTeamError('InvalidEligibilityRules', 'Invalid category');
  }
  const category = c.category;
  const nationalityRule = parseNationalityRule(c.nationalityRule ?? { mode: 'PRIMARY_NATIONALITY' });
  const ageRule =
    c.ageRule !== undefined
      ? parseAgeRule(c.ageRule)
      : category === 'JUNIOR_U20'
        ? { mode: 'MAX_AGE_ON_DATE' as const, maxAge: 19, cutoffDate: '2026-12-31' }
        : { mode: 'NONE' as const };
  if (category === 'JUNIOR_U20' && ageRule.mode !== 'MAX_AGE_ON_DATE') {
    throw new NationalTeamError(
      'InvalidEligibilityRules',
      'JUNIOR_U20 requires MAX_AGE_ON_DATE ageRule',
    );
  }
  return {
    schemaVersion: NATIONAL_TEAM_ELIGIBILITY_SCHEMA_VERSION,
    category,
    nationalityRule,
    ageRule,
    rosterLimits: parseRosterLimits(c.rosterLimits ?? {}),
    selection: parseSelection(c.selection),
  };
}

export function parseEligibilityRules(raw: unknown): NationalTeamEligibilityRules {
  return validateEligibilityRules(raw);
}
