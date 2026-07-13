import {
  PERIOD_DURATION_SECONDS,
  REGULATION_PERIODS,
  type MatchCompletionRules,
  type RegulationRules,
} from '@fhm/engine';

export interface StoredMatchRules extends RegulationRules {
  completion: MatchCompletionRules;
}

export const DEFAULT_MATCH_COMPLETION_RULES: MatchCompletionRules = {
  overtimeEnabled: false,
  shootoutEnabled: false,
  tiesAllowed: true,
};

export function defaultStoredMatchRules(): StoredMatchRules {
  return {
    regulationPeriods: REGULATION_PERIODS,
    periodDurationSeconds: PERIOD_DURATION_SECONDS,
    completion: { ...DEFAULT_MATCH_COMPLETION_RULES },
  };
}

export function parseStoredMatchRules(rulesJson: string | null | undefined): StoredMatchRules {
  if (!rulesJson) return defaultStoredMatchRules();
  try {
    const parsed = JSON.parse(rulesJson) as Partial<StoredMatchRules>;
    return {
      regulationPeriods: parsed.regulationPeriods ?? REGULATION_PERIODS,
      periodDurationSeconds: parsed.periodDurationSeconds ?? PERIOD_DURATION_SECONDS,
      completion: {
        overtimeEnabled: parsed.completion?.overtimeEnabled ?? DEFAULT_MATCH_COMPLETION_RULES.overtimeEnabled,
        shootoutEnabled: parsed.completion?.shootoutEnabled ?? DEFAULT_MATCH_COMPLETION_RULES.shootoutEnabled,
        tiesAllowed: parsed.completion?.tiesAllowed ?? DEFAULT_MATCH_COMPLETION_RULES.tiesAllowed,
      },
    };
  } catch {
    return defaultStoredMatchRules();
  }
}

export function canonicalizeStoredMatchRules(rules: StoredMatchRules): string {
  return JSON.stringify(rules);
}
