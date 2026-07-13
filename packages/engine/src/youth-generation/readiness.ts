import { validateCountryYouthProfile } from './config.js';
import { validateAndNormalizeNamePool } from './names.js';
import type { YouthGenerationCountryInput } from './types.js';

export type YouthReadinessStatus = 'READY' | 'WARNING' | 'NOT_READY';

export interface YouthReadinessCheck {
  code: string;
  status: 'PASS' | 'WARN' | 'FAIL';
  message: string;
}

export interface YouthReadinessResult {
  status: YouthReadinessStatus;
  checks: YouthReadinessCheck[];
  blockers: string[];
  warnings: string[];
  enabledCountryCount: number;
  plannedPlayersEstimate: number;
}

export function evaluateYouthGenerationReadiness(input: {
  worldSeasonExists: boolean;
  hasCompletedOfficialRun: boolean;
  hasPreparedOrRunningRun: boolean;
  referenceDate: string | null;
  profileSetActive: boolean;
  countries: YouthGenerationCountryInput[];
  backupAvailable: boolean;
  sourceEnumSupportsGeneratedYouth: boolean;
  lifecycleSupportsProspect: boolean;
}): YouthReadinessResult {
  const checks: YouthReadinessCheck[] = [];
  const blockers: string[] = [];
  const warnings: string[] = [];

  const add = (code: string, status: 'PASS' | 'WARN' | 'FAIL', message: string) => {
    checks.push({ code, status, message });
    if (status === 'FAIL') blockers.push(message);
    if (status === 'WARN') warnings.push(message);
  };

  if (!input.worldSeasonExists) add('WORLD_SEASON', 'FAIL', 'WorldSeason not found');
  else add('WORLD_SEASON', 'PASS', 'WorldSeason present');

  if (input.hasCompletedOfficialRun) {
    add('OFFICIAL_RUN', 'FAIL', 'Official youth generation already applied for this WorldSeason');
  } else add('OFFICIAL_RUN', 'PASS', 'No completed official run');

  if (input.hasPreparedOrRunningRun) {
    add('ACTIVE_RUN', 'FAIL', 'A prepared or running youth-generation run already exists');
  } else add('ACTIVE_RUN', 'PASS', 'No prepared/running run');

  if (!input.profileSetActive) add('PROFILE_SET', 'FAIL', 'No active youth profile-set version');
  else add('PROFILE_SET', 'PASS', 'Active profile-set version present');

  if (!input.referenceDate) add('REFERENCE_DATE', 'WARN', 'Reference date not yet selected');
  else add('REFERENCE_DATE', 'PASS', `Reference date ${input.referenceDate}`);

  if (!input.backupAvailable) add('BACKUP', 'FAIL', 'Safe database backup is not available');
  else add('BACKUP', 'PASS', 'Backup utility available');

  if (!input.sourceEnumSupportsGeneratedYouth) {
    add('SOURCE_ENUM', 'FAIL', 'Player source enum missing GENERATED_YOUTH');
  } else add('SOURCE_ENUM', 'PASS', 'GENERATED_YOUTH supported');

  if (!input.lifecycleSupportsProspect) {
    add('LIFECYCLE', 'FAIL', 'Roster status missing PROSPECT');
  } else add('LIFECYCLE', 'PASS', 'PROSPECT supported');

  const enabled = input.countries.filter((c) => c.profile.enabled);
  if (enabled.length === 0) add('COUNTRIES', 'FAIL', 'No enabled country profiles');
  else add('COUNTRIES', 'PASS', `${enabled.length} enabled country profile(s)`);

  let planned = 0;
  for (const c of enabled) {
    try {
      validateCountryYouthProfile(c.profile);
    } catch (err) {
      add(
        'PROFILE',
        'FAIL',
        err instanceof Error ? err.message : `Invalid profile ${c.countryKey}`,
      );
    }
    try {
      const pool = validateAndNormalizeNamePool(c.namePool);
      if (pool.firstNames.length < 20) {
        add('NAME_POOL_SIZE', 'WARN', `${c.countryKey}: fewer than 20 first names`);
      }
      if (pool.lastNames.length < 30) {
        add('NAME_POOL_SIZE', 'WARN', `${c.countryKey}: fewer than 30 last names`);
      }
    } catch (err) {
      add(
        'NAME_POOL',
        'FAIL',
        err instanceof Error ? err.message : `Invalid name pool ${c.countryKey}`,
      );
    }
    planned += c.profile.cohort.baseSize;
    if (c.profile.cohort.baseSize < 8) {
      add('SMALL_COHORT', 'WARN', `${c.countryKey}: small cohort base size`);
    }
  }

  const disabled = input.countries.filter((c) => !c.profile.enabled);
  if (disabled.length > 0) {
    add('DISABLED', 'WARN', `${disabled.length} country profile(s) disabled`);
  }

  let status: YouthReadinessStatus = 'READY';
  if (blockers.length > 0) status = 'NOT_READY';
  else if (warnings.length > 0) status = 'WARNING';

  return {
    status,
    checks,
    blockers,
    warnings,
    enabledCountryCount: enabled.length,
    plannedPlayersEstimate: planned,
  };
}
