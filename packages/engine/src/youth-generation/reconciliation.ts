import { ageOnEffectiveDate } from '../development/age.js';
import { deriveGoalieRatings, deriveSkaterRatings } from '../players/ratings.js';
import { deriveSkaterRole } from '../players/roles.js';
import { deriveGoalieRole } from '../goalies/roles.js';
import { GOALIE_ATTRIBUTE_KEYS, SKATER_ATTRIBUTE_KEYS } from '../players/types.js';
import { PLAYER_MODEL_CONFIG } from '../players/validation.js';
import { hashGeneratedYouthPlayer, hashYouthCohort } from './hashing.js';
import type { GeneratedYouthCohort, GeneratedYouthPlayer, YouthGenerationCountryInput } from './types.js';
import { YouthGenerationError } from './types.js';

export interface YouthReconciliationIssue {
  code: string;
  message: string;
  countryKey?: string;
  generationIndex?: number;
}

export function reconcileYouthGeneration(input: {
  enabledCountries: YouthGenerationCountryInput[];
  cohorts: GeneratedYouthCohort[];
  referenceDate: string;
}): { ok: true } | { ok: false; issues: YouthReconciliationIssue[] } {
  const issues: YouthReconciliationIssue[] = [];
  const enabledKeys = new Set(input.enabledCountries.map((c) => c.countryKey));
  const seenCountries = new Set<string>();
  const seenIndexes = new Set<number>();

  if (input.cohorts.length !== input.enabledCountries.length) {
    issues.push({
      code: 'COHORT_COUNT',
      message: `Expected ${input.enabledCountries.length} cohorts, got ${input.cohorts.length}`,
    });
  }

  for (const cohort of input.cohorts) {
    if (seenCountries.has(cohort.countryKey)) {
      issues.push({
        code: 'DUPLICATE_COUNTRY',
        countryKey: cohort.countryKey,
        message: 'Duplicate cohort country',
      });
    }
    seenCountries.add(cohort.countryKey);
    if (!enabledKeys.has(cohort.countryKey)) {
      issues.push({
        code: 'DISABLED_COUNTRY',
        countryKey: cohort.countryKey,
        message: 'Cohort for non-enabled country',
      });
    }
    if (cohort.generatedSize !== cohort.players.length) {
      issues.push({
        code: 'SIZE_MISMATCH',
        countryKey: cohort.countryKey,
        message: 'generatedSize != players.length',
      });
    }
    const recomputed = hashYouthCohort({ ...cohort, cohortHash: '' });
    if (recomputed !== cohort.cohortHash) {
      issues.push({
        code: 'COHORT_HASH',
        countryKey: cohort.countryKey,
        message: 'Cohort hash mismatch',
      });
    }

    for (const player of cohort.players) {
      issues.push(...validatePlayer(player, input.referenceDate));
      if (seenIndexes.has(player.generationIndex)) {
        issues.push({
          code: 'DUPLICATE_INDEX',
          generationIndex: player.generationIndex,
          message: 'Duplicate generationIndex',
        });
      }
      seenIndexes.add(player.generationIndex);
    }
  }

  for (const c of input.enabledCountries) {
    if (!seenCountries.has(c.countryKey)) {
      issues.push({
        code: 'MISSING_COHORT',
        countryKey: c.countryKey,
        message: 'Missing cohort for enabled country',
      });
    }
  }

  if (issues.length > 0) return { ok: false, issues };
  return { ok: true };
}

function validatePlayer(
  player: GeneratedYouthPlayer,
  referenceDate: string,
): YouthReconciliationIssue[] {
  const issues: YouthReconciliationIssue[] = [];
  const idx = player.generationIndex;
  try {
    const age = ageOnEffectiveDate(player.dateOfBirth, referenceDate);
    if (age !== player.ageOnReferenceDate || age < 15 || age > 17) {
      issues.push({
        code: 'AGE',
        generationIndex: idx,
        message: `Age mismatch ${age} vs ${player.ageOnReferenceDate}`,
      });
    }
  } catch (err) {
    issues.push({
      code: 'DOB',
      generationIndex: idx,
      message: err instanceof Error ? err.message : 'Invalid DOB',
    });
  }

  if (player.lifecycleStatus !== 'PROSPECT' || player.sourceType !== 'GENERATED_YOUTH') {
    issues.push({
      code: 'STATUS_SOURCE',
      generationIndex: idx,
      message: 'Invalid lifecycle/source',
    });
  }
  if (player.currentTeamId !== null) {
    issues.push({
      code: 'TEAM',
      generationIndex: idx,
      message: 'currentTeamId must be null',
    });
  }

  const isGoalie = player.position === 'G';
  const keys = isGoalie ? GOALIE_ATTRIBUTE_KEYS : SKATER_ATTRIBUTE_KEYS;
  for (const k of keys) {
    const v = player.attributes[k];
    if (typeof v !== 'number' || !Number.isInteger(v)) {
      issues.push({
        code: 'ATTR_MISSING',
        generationIndex: idx,
        message: `Missing attribute ${k}`,
      });
      continue;
    }
    if (v < PLAYER_MODEL_CONFIG.attributeMin || v > PLAYER_MODEL_CONFIG.attributeMax) {
      issues.push({
        code: 'ATTR_BOUNDS',
        generationIndex: idx,
        message: `Attribute ${k} out of bounds`,
      });
    }
  }

  let expectedAbility: number;
  let expectedRole: string;
  try {
    if (isGoalie) {
      expectedAbility = deriveGoalieRatings(player.attributes as never).currentAbility;
      expectedRole = deriveGoalieRole('G', player.attributes as never).role;
    } else {
      expectedAbility = deriveSkaterRatings(player.attributes as never).currentAbility;
      expectedRole = deriveSkaterRole(player.position, player.attributes as never).role;
    }
  } catch (err) {
    issues.push({
      code: 'DERIVE',
      generationIndex: idx,
      message: err instanceof Error ? err.message : 'derive failed',
    });
    return issues;
  }

  if (expectedAbility !== player.currentAbility) {
    issues.push({
      code: 'ABILITY',
      generationIndex: idx,
      message: `CA ${player.currentAbility} != ${expectedAbility}`,
    });
  }
  if (expectedRole !== player.role) {
    issues.push({
      code: 'ROLE',
      generationIndex: idx,
      message: `Role ${player.role} != ${expectedRole}`,
    });
  }
  if (
    player.potentialCeiling < PLAYER_MODEL_CONFIG.ratingMin ||
    player.potentialCeiling > PLAYER_MODEL_CONFIG.ratingMax ||
    player.potentialFloor > player.potentialCeiling
  ) {
    issues.push({
      code: 'POTENTIAL',
      generationIndex: idx,
      message: 'Invalid potential bounds',
    });
  }
  if (
    player.developmentRate < PLAYER_MODEL_CONFIG.developmentRateMin ||
    player.developmentRate > PLAYER_MODEL_CONFIG.developmentRateMax
  ) {
    issues.push({
      code: 'DEV_RATE',
      generationIndex: idx,
      message: 'Invalid developmentRate',
    });
  }

  const expectedHash = hashGeneratedYouthPlayer({ ...player, generationHash: '' });
  if (expectedHash !== player.generationHash) {
    issues.push({
      code: 'PLAYER_HASH',
      generationIndex: idx,
      message: 'generationHash mismatch',
    });
  }

  return issues;
}

export function assertYouthReconciliation(
  input: Parameters<typeof reconcileYouthGeneration>[0],
): void {
  const r = reconcileYouthGeneration(input);
  if (!r.ok) {
    throw new YouthGenerationError(
      'YouthGenerationReconciliationFailed',
      `Reconciliation failed with ${r.issues.length} issue(s)`,
      r.issues,
    );
  }
}
