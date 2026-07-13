import type { HomeHost, PlayoffConfig, PlayoffMatchRulesOverride } from './types.js';
import { PlayoffError } from './types.js';

const HOME_PATTERN_RE = /^(\d+)(-\d+)*$/;

export function parseHomePatternToHosts(pattern: string, maxGames: number): HomeHost[] {
  if (!HOME_PATTERN_RE.test(pattern)) {
    throw new PlayoffError('InvalidPlayoffConfiguration', `Invalid homePattern "${pattern}"`);
  }
  const segments = pattern.split('-').map((n) => Number.parseInt(n, 10));
  if (segments.some((n) => !Number.isFinite(n) || n < 1)) {
    throw new PlayoffError('InvalidPlayoffConfiguration', 'homePattern segments must be positive integers');
  }
  const hosts: HomeHost[] = [];
  let higher = true;
  for (const count of segments) {
    for (let i = 0; i < count; i += 1) {
      hosts.push(higher ? 'HIGHER_SEED' : 'LOWER_SEED');
    }
    higher = !higher;
  }
  if (hosts.length < maxGames) {
    throw new PlayoffError(
      'InvalidPlayoffConfiguration',
      `homePattern must cover at least ${maxGames} games (got ${hosts.length})`,
    );
  }
  return hosts.slice(0, maxGames);
}

export function defaultPlayoffMatchRules(): PlayoffMatchRulesOverride {
  return {
    tiesAllowed: false,
    overtimeEnabled: true,
    shootoutEnabled: false,
  };
}

export function defaultRoundNames(participantCount: number): string[] {
  const rounds = Math.log2(participantCount);
  if (participantCount === 2) return ['Final'];
  if (participantCount === 4) return ['Semifinals', 'Final'];
  if (participantCount === 8) return ['Quarterfinals', 'Semifinals', 'Final'];
  if (participantCount === 16) return ['Round of 16', 'Quarterfinals', 'Semifinals', 'Final'];
  const names: string[] = [];
  for (let r = 1; r <= rounds; r += 1) {
    names.push(r === rounds ? 'Final' : `Round ${r}`);
  }
  return names;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/**
 * Parse BEST_OF_SERIES stage config (legacy F17 + F19 fields) into PlayoffConfig.
 */
export function parsePlayoffConfig(raw: unknown, opts?: { participantCount?: number }): PlayoffConfig {
  if (!isPlainObject(raw)) {
    throw new PlayoffError('InvalidPlayoffConfiguration', 'Playoff config must be an object');
  }

  const winsRequired =
    typeof raw.winsRequired === 'number' && Number.isInteger(raw.winsRequired) && raw.winsRequired >= 1
      ? raw.winsRequired
      : (() => {
          throw new PlayoffError('InvalidPlayoffConfiguration', 'winsRequired must be an integer >= 1');
        })();

  const homePattern =
    typeof raw.homePattern === 'string' && raw.homePattern.trim()
      ? raw.homePattern.trim()
      : (() => {
          throw new PlayoffError('InvalidPlayoffConfiguration', 'homePattern is required');
        })();

  const maxGames = winsRequired * 2 - 1;
  const normalizedHomePattern = parseHomePatternToHosts(homePattern, maxGames);

  const reseeding = raw.reseeding === true;
  let bracketMode: PlayoffConfig['bracketMode'] = reseeding ? 'RESEED_EACH_ROUND' : 'FIXED';
  if (typeof raw.bracketMode === 'string') {
    if (raw.bracketMode !== 'FIXED' && raw.bracketMode !== 'RESEED_EACH_ROUND') {
      throw new PlayoffError('InvalidPlayoffConfiguration', `Unknown bracketMode "${raw.bracketMode}"`);
    }
    bracketMode = raw.bracketMode;
  }

  const seedingMode: PlayoffConfig['seedingMode'] =
    raw.seedingMode === 'MANUAL' ? 'MANUAL' : 'QUALIFICATION_ORDER';

  const qualificationCount =
    typeof raw.qualificationCount === 'number' && Number.isInteger(raw.qualificationCount)
      ? raw.qualificationCount
      : opts?.participantCount ?? 0;

  if (qualificationCount < 2) {
    throw new PlayoffError('InvalidPlayoffConfiguration', 'qualificationCount must be >= 2');
  }
  if ((qualificationCount & (qualificationCount - 1)) !== 0) {
    throw new PlayoffError(
      'InvalidPlayoffParticipantCount',
      'F19 requires a power-of-two participant count (byes are not supported)',
    );
  }

  if (raw.allowByes === true) {
    throw new PlayoffError(
      'InvalidPlayoffConfiguration',
      'allowByes is not supported in F19; use a power-of-two qualifier count',
    );
  }

  let matchRules = defaultPlayoffMatchRules();
  if (raw.matchRules !== undefined) {
    if (!isPlainObject(raw.matchRules)) {
      throw new PlayoffError('InvalidPlayoffConfiguration', 'matchRules must be an object');
    }
    const mr = raw.matchRules;
    matchRules = {
      tiesAllowed: false,
      overtimeEnabled: true,
      shootoutEnabled: mr.shootoutEnabled === true,
    };
    if (mr.tiesAllowed === true) {
      throw new PlayoffError('InvalidPlayoffConfiguration', 'Playoff games must not allow ties');
    }
    if (mr.overtimeEnabled === false) {
      throw new PlayoffError(
        'InvalidPlayoffConfiguration',
        'Playoff games require overtimeEnabled when ties are disallowed',
      );
    }
  }

  const participantCount = opts?.participantCount ?? qualificationCount;
  let roundNames =
    Array.isArray(raw.roundNames) && raw.roundNames.every((n) => typeof n === 'string')
      ? (raw.roundNames as string[])
      : defaultRoundNames(participantCount);
  const expectedRounds = Math.log2(participantCount);
  if (roundNames.length < expectedRounds) {
    roundNames = [...roundNames, ...defaultRoundNames(participantCount).slice(roundNames.length)];
  }
  roundNames = roundNames.slice(0, expectedRounds);

  return {
    sourceStageId: typeof raw.sourceStageId === 'string' ? raw.sourceStageId : undefined,
    qualificationCount,
    bracketMode,
    seedingMode,
    winsRequired,
    homePattern,
    normalizedHomePattern,
    roundNames,
    allowByes: false,
    bracketSeed: typeof raw.bracketSeed === 'string' ? raw.bracketSeed : undefined,
    matchRules,
    reseeding: bracketMode === 'RESEED_EACH_ROUND',
  };
}

export function maxGamesForSeries(winsRequired: number): number {
  return winsRequired * 2 - 1;
}

export function hostForGame(
  normalized: HomeHost[],
  gameNumber: number,
): HomeHost {
  const idx = gameNumber - 1;
  if (idx < 0 || idx >= normalized.length) {
    throw new PlayoffError('InvalidPlayoffConfiguration', `No home pattern slot for game ${gameNumber}`);
  }
  return normalized[idx]!;
}
