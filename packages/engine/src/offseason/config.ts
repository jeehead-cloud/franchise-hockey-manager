import type {
  OffseasonConfig,
  OffseasonPhaseConfig,
  OffseasonPhaseType,
  OffseasonCompletionRules,
} from './types.js';
import {
  OFFSEASON_SCHEMA_VERSION,
  OFFSEASON_PHASE_ORDER,
  OffseasonError,
} from './types.js';

const PHASE_TYPE_SET = new Set<OffseasonPhaseType>(OFFSEASON_PHASE_ORDER);

/**
 * Default offseason configuration — phase order and completion rules match the
 * F30 task specification. Fictional / simplified defaults; not a real-world
 * league-ops calibration. Required phases cannot be skipped in the default
 * configuration; the optional interactive phases (signings, free agency, trades,
 * scouting review) may be skipped when configured.
 */
export function defaultOffseasonConfig(): OffseasonConfig {
  const phase = (
    type: OffseasonPhaseType,
    required: boolean,
    allowSkip: boolean,
  ): OffseasonPhaseConfig => ({ type, required, allowSkip });

  return {
    schemaVersion: OFFSEASON_SCHEMA_VERSION,
    phases: [
      phase('COMPETITION_ARCHIVE', true, false),
      phase('CONTRACT_EXPIRATION', true, false),
      phase('PLAYER_DEVELOPMENT', true, false),
      phase('RETIREMENT_REVIEW', true, false),
      phase('YOUTH_GENERATION', true, false),
      phase('DRAFT', true, false),
      phase('DRAFTED_PLAYER_SIGNINGS', false, true),
      phase('FREE_AGENCY', false, true),
      phase('TRADES', false, true),
      phase('ROSTER_REVIEW', true, false),
      phase('LINEUP_REVIEW', true, false),
      phase('SCOUTING_REVIEW', false, true),
      phase('FINAL_REVIEW', true, false),
    ],
    completion: {
      requireArchivedCompletedCompetitions: true,
      requireContractExpirationProcessed: true,
      requireDevelopmentRun: true,
      requireYouthGenerationRun: true,
      requireDraftCompleted: true,
      requireNoRetiredPlayersInActiveLineups: true,
      requireNoOwnershipMismatchInLineups: true,
      requireNoDuplicateActiveContracts: true,
      allowUnsignedDraftRights: true,
      allowFreeAgents: true,
      allowOpenTradeProposals: false,
      allowSubmittedContractOffers: false,
    },
  };
}

// ---------------------------------------------------------------------------
// Strict validation helpers
// ---------------------------------------------------------------------------

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

function exactKeys(o: Record<string, unknown>, keys: string[], label: string) {
  for (const k of Object.keys(o)) {
    if (!keys.includes(k)) {
      throw new OffseasonError('InvalidOffseasonConfiguration', `Unknown ${label} field: ${k}`);
    }
  }
}

function isPhaseType(v: unknown): v is OffseasonPhaseType {
  return typeof v === 'string' && PHASE_TYPE_SET.has(v as OffseasonPhaseType);
}

function isBoolean(v: unknown, label: string): v is boolean {
  if (typeof v !== 'boolean') {
    throw new OffseasonError('InvalidOffseasonConfiguration', `${label} must be boolean`);
  }
  return v;
}

const COMPLETION_KEYS: readonly (keyof OffseasonCompletionRules)[] = [
  'requireArchivedCompletedCompetitions',
  'requireContractExpirationProcessed',
  'requireDevelopmentRun',
  'requireYouthGenerationRun',
  'requireDraftCompleted',
  'requireNoRetiredPlayersInActiveLineups',
  'requireNoOwnershipMismatchInLineups',
  'requireNoDuplicateActiveContracts',
  'allowUnsignedDraftRights',
  'allowFreeAgents',
  'allowOpenTradeProposals',
  'allowSubmittedContractOffers',
];

function validateCompletion(raw: unknown): OffseasonCompletionRules {
  if (!isObject(raw)) {
    throw new OffseasonError('InvalidOffseasonConfiguration', 'completion section required');
  }
  exactKeys(raw, [...COMPLETION_KEYS], 'completion');
  const out = {} as Record<string, boolean>;
  for (const k of COMPLETION_KEYS) {
    out[k] = isBoolean(raw[k], `completion.${k}`);
  }
  return out as unknown as OffseasonCompletionRules;
}

/**
 * Strict validation of an offseason configuration.
 *
 * Ensures:
 * - exact schemaVersion;
 * - unique phase types;
 * - phase order matches the canonical OFFSEASON_PHASE_ORDER;
 * - FINAL_REVIEW is last;
 * - required phases cannot be skipped (a required phase with allowSkip=true is rejected);
 * - completion rules are complete and well-formed.
 */
export function validateOffseasonConfig(raw: unknown): OffseasonConfig {
  if (!isObject(raw)) {
    throw new OffseasonError('InvalidOffseasonConfiguration', 'Config must be an object');
  }
  exactKeys(raw, ['schemaVersion', 'phases', 'completion'], 'config');
  if (raw.schemaVersion !== OFFSEASON_SCHEMA_VERSION) {
    throw new OffseasonError(
      'InvalidOffseasonConfiguration',
      `Unsupported schemaVersion (expected ${OFFSEASON_SCHEMA_VERSION})`,
    );
  }
  if (!Array.isArray(raw.phases) || raw.phases.length === 0) {
    throw new OffseasonError('InvalidOffseasonConfiguration', 'phases must be a non-empty array');
  }

  const phases: OffseasonPhaseConfig[] = [];
  const seen = new Set<OffseasonPhaseType>();
  for (let i = 0; i < raw.phases.length; i++) {
    const entry = raw.phases[i];
    if (!isObject(entry)) {
      throw new OffseasonError('InvalidOffseasonConfiguration', `phases[${i}] must be an object`);
    }
    exactKeys(entry, ['type', 'required', 'allowSkip'], `phases[${i}]`);
    if (!isPhaseType(entry.type)) {
      throw new OffseasonError(
        'InvalidOffseasonConfiguration',
        `phases[${i}].type is not a known OffseasonPhaseType`,
      );
    }
    if (seen.has(entry.type)) {
      throw new OffseasonError(
        'InvalidOffseasonConfiguration',
        `phases[${i}].type ${entry.type} appears more than once`,
      );
    }
    seen.add(entry.type);
    const required = isBoolean(entry.required, `phases[${i}].required`);
    const allowSkip = isBoolean(entry.allowSkip, `phases[${i}].allowSkip`);
    if (required && allowSkip) {
      throw new OffseasonError(
        'InvalidOffseasonConfiguration',
        `phases[${i}].type ${entry.type} is required and cannot allowSkip`,
      );
    }
    phases.push({ type: entry.type, required, allowSkip });
  }

  // Phase order: every listed phase must appear in canonical order.
  const listed = phases.map((p) => p.type);
  for (let i = 1; i < listed.length; i++) {
    const prev = OFFSEASON_PHASE_ORDER.indexOf(listed[i - 1]!);
    const cur = OFFSEASON_PHASE_ORDER.indexOf(listed[i]!);
    if (prev < 0 || cur < 0 || cur <= prev) {
      throw new OffseasonError(
        'InvalidOffseasonConfiguration',
        `phases must follow canonical order (violation at index ${i}: ${listed[i - 1]} → ${listed[i]})`,
      );
    }
  }
  if (listed[listed.length - 1] !== 'FINAL_REVIEW') {
    throw new OffseasonError('InvalidOffseasonConfiguration', 'FINAL_REVIEW must be the last phase');
  }

  const completion = validateCompletion(raw.completion);
  return { schemaVersion: OFFSEASON_SCHEMA_VERSION, phases, completion };
}

/**
 * Resolve the canonical phase definitions for a validated config: assigns the
 * phase order and computes the dependency list (each phase depends on all prior
 * COMPLETED-or-SKIPPED phases). The dependency model is intentionally linear —
 * phases execute strictly in declared order, matching the F30 invariant that a
 * phase cannot start before its dependencies complete.
 */
export function resolvePhaseDefinitions(config: OffseasonConfig) {
  return config.phases.map((p, i) => {
    const dependsOn = config.phases.slice(0, i).map((prev) => prev.type);
    return {
      type: p.type,
      order: i + 1,
      required: p.required,
      allowSkip: p.allowSkip,
      category: PHASE_CATEGORY.get(p.type) ?? 'INTERACTIVE',
      dependsOn,
    };
  });
}

const PHASE_CATEGORY: ReadonlyMap<OffseasonPhaseType, 'AUTOMATED' | 'INTERACTIVE'> = new Map([
  ['COMPETITION_ARCHIVE', 'AUTOMATED'],
  ['CONTRACT_EXPIRATION', 'AUTOMATED'],
  ['PLAYER_DEVELOPMENT', 'AUTOMATED'],
  ['YOUTH_GENERATION', 'AUTOMATED'],
  ['RETIREMENT_REVIEW', 'INTERACTIVE'],
  ['DRAFT', 'INTERACTIVE'],
  ['DRAFTED_PLAYER_SIGNINGS', 'INTERACTIVE'],
  ['FREE_AGENCY', 'INTERACTIVE'],
  ['TRADES', 'INTERACTIVE'],
  ['ROSTER_REVIEW', 'INTERACTIVE'],
  ['LINEUP_REVIEW', 'INTERACTIVE'],
  ['SCOUTING_REVIEW', 'INTERACTIVE'],
  ['FINAL_REVIEW', 'INTERACTIVE'],
]);
