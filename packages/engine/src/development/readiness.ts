import { ageOnEffectiveDate } from './age.js';
import { validatePlayerDevelopmentConfig } from './config.js';
import { recalculateCurrentAbility } from './role.js';
import type { DevelopmentPlayerInput, PlayerDevelopmentConfig } from './types.js';

export type DevelopmentReadinessStatus = 'READY' | 'WARNING' | 'NOT_READY';

export interface DevelopmentReadinessCheck {
  code: string;
  status: 'PASS' | 'WARN' | 'FAIL';
  message: string;
}

export interface DevelopmentReadinessResult {
  status: DevelopmentReadinessStatus;
  checks: DevelopmentReadinessCheck[];
  blockers: string[];
  warnings: string[];
  eligiblePlayerCount: number;
}

/**
 * Pure readiness evaluation from already-loaded facts (no I/O).
 */
export function evaluateDevelopmentReadiness(input: {
  worldSeasonExists: boolean;
  hasCompletedOfficialRun: boolean;
  hasPreparedOrRunningRun: boolean;
  config: unknown | null;
  effectiveDate: string | null;
  players: DevelopmentPlayerInput[];
  backupAvailable: boolean;
}): DevelopmentReadinessResult {
  const checks: DevelopmentReadinessCheck[] = [];
  const blockers: string[] = [];
  const warnings: string[] = [];

  const add = (
    code: string,
    status: 'PASS' | 'WARN' | 'FAIL',
    message: string,
  ) => {
    checks.push({ code, status, message });
    if (status === 'FAIL') blockers.push(message);
    if (status === 'WARN') warnings.push(message);
  };

  if (!input.worldSeasonExists) {
    add('WORLD_SEASON', 'FAIL', 'WorldSeason not found');
  } else {
    add('WORLD_SEASON', 'PASS', 'WorldSeason present');
  }

  if (input.hasCompletedOfficialRun) {
    add('OFFICIAL_RUN', 'FAIL', 'Official development already applied for this WorldSeason');
  } else {
    add('OFFICIAL_RUN', 'PASS', 'No completed official run');
  }

  if (input.hasPreparedOrRunningRun) {
    add('ACTIVE_RUN', 'FAIL', 'A prepared or running development run already exists');
  } else {
    add('ACTIVE_RUN', 'PASS', 'No prepared/running run');
  }

  let config: PlayerDevelopmentConfig | null = null;
  if (!input.config) {
    add('CONFIG', 'FAIL', 'No active development configuration');
  } else {
    try {
      config = validatePlayerDevelopmentConfig(input.config);
      add('CONFIG', 'PASS', 'Development configuration valid');
    } catch (err) {
      add(
        'CONFIG',
        'FAIL',
        err instanceof Error ? err.message : 'Invalid development configuration',
      );
    }
  }

  if (!input.effectiveDate) {
    add('EFFECTIVE_DATE', 'WARN', 'Effective date not yet selected');
  } else {
    add('EFFECTIVE_DATE', 'PASS', `Effective date ${input.effectiveDate}`);
  }

  if (!input.backupAvailable) {
    add('BACKUP', 'FAIL', 'Safe database backup is not available');
  } else {
    add('BACKUP', 'PASS', 'Backup utility available');
  }

  const eligible = input.players.filter((p) => p.lifecycleStatus !== 'RETIRED');
  if (eligible.length === 0) {
    add('PLAYERS', 'FAIL', 'No eligible players');
  } else {
    add('PLAYERS', 'PASS', `${eligible.length} eligible player(s)`);
  }

  const seenIds = new Set<string>();
  for (const p of eligible) {
    if (seenIds.has(p.playerId)) {
      add('DUPLICATE_ID', 'FAIL', `Duplicate player id ${p.playerId}`);
    }
    seenIds.add(p.playerId);

    if (input.effectiveDate) {
      try {
        const age = ageOnEffectiveDate(p.birthDate, input.effectiveDate);
        if (config && age >= config.retirement.forcedRetirementAge) {
          add(
            'FORCED_RETIRE_AGE',
            'WARN',
            `Player ${p.playerId} at/above forced retirement age`,
          );
        }
      } catch {
        add('BIRTH_DATE', 'FAIL', `Invalid birth date for ${p.playerId}`);
      }
    }

    if (p.currentAbility > p.potentialCeiling) {
      add(
        'OVER_POTENTIAL',
        'WARN',
        `Player ${p.playerId} current ability exceeds potential`,
      );
    }

    if (!p.currentTeamId) {
      add('UNSIGNED_TEAM', 'WARN', `Player ${p.playerId} has no current team`);
    }

    try {
      recalculateCurrentAbility(p.playerType, p.attributes);
    } catch {
      add('ATTRIBUTES', 'FAIL', `Invalid attributes for ${p.playerId}`);
    }
  }

  add(
    'LINEUP_STALE',
    'WARN',
    'Club lineups may need review after development (not auto-rewritten)',
  );

  let status: DevelopmentReadinessStatus = 'READY';
  if (blockers.length > 0) status = 'NOT_READY';
  else if (warnings.length > 0) status = 'WARNING';

  return {
    status,
    checks,
    blockers,
    warnings,
    eligiblePlayerCount: eligible.length,
  };
}
