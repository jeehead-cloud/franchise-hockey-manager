import {
  SEASON_TRANSITION_SCHEMA_VERSION,
  SeasonTransitionError,
  type SeasonTransitionConfig,
  type SeasonTransitionCompetitionsConfig,
  type SeasonTransitionCompletionConfig,
  type SeasonTransitionContractsConfig,
  type SeasonTransitionLineupsConfig,
  type SeasonTransitionNationalTeamsConfig,
  type SeasonTransitionScoutingConfig,
  type SeasonTransitionSeasonConfig,
} from './types.js';
import { composeIsoDate } from './dates.js';

/**
 * Default season-transition configuration. Fictional / simplified defaults;
 * not a real-world league-ops calibration. Mirrors the F31 spec's recommended
 * schema: no automatic edition activation, no automatic national-team
 * preparation, no locked-roster reuse, no automatic future-contract activation,
 * and no automatic lineup rebuild (the foundation default).
 */
export function defaultSeasonTransitionConfig(): SeasonTransitionConfig {
  return {
    schemaVersion: SEASON_TRANSITION_SCHEMA_VERSION,
    season: {
      orderIncrement: 1,
      displayNamePattern: '{startYear}/{endYear}',
      startDateMonth: 7,
      startDateDay: 1,
      endDateMonth: 6,
      endDateDay: 30,
    },
    competitions: {
      carryForwardEnabledDefinitions: true,
      copyDefaultRulesIntoNewEditionSnapshot: true,
      copyStageTemplates: true,
      copyConfirmedParticipants: true,
      activateEditionsAutomatically: false,
      newEditionInitialStatus: 'PLANNED',
    },
    lineups: {
      carryForwardClubLineups: true,
      markForReview: true,
      copyTactics: true,
      autoRebuild: false,
    },
    nationalTeams: {
      createEditionPreparationAutomatically: false,
      carryLockedTournamentRosters: false,
    },
    scouting: {
      preserveReports: true,
      markAgeSensitiveReportsStale: true,
      preserveWatchlists: true,
      preserveDepartments: true,
    },
    contracts: {
      requireNoOwnershipMismatch: true,
      activateApplicableFutureContracts: false,
    },
    completion: {
      requireCompletedOffseasonRun: true,
      requireArchivedCompletedCompetitions: true,
      requireNoActiveCompetitionEdition: true,
      requireNoRunningWorldOperation: true,
    },
  };
}

// ---------------------------------------------------------------------------
// Strict validation
// ---------------------------------------------------------------------------

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

function exactKeys(o: Record<string, unknown>, keys: string[], label: string) {
  for (const k of Object.keys(o)) {
    if (!keys.includes(k)) {
      throw new SeasonTransitionError('InvalidSeasonTransitionConfiguration', `Unknown ${label} field: ${k}`);
    }
  }
}

function requireBoolean(o: Record<string, unknown>, key: string, label: string): boolean {
  const v = o[key];
  if (typeof v !== 'boolean') {
    throw new SeasonTransitionError('InvalidSeasonTransitionConfiguration', `${label}.${key} must be a boolean`);
  }
  return v;
}

function requireInt(o: Record<string, unknown>, key: string, label: string, min: number, max: number): number {
  const v = o[key];
  if (typeof v !== 'number' || !Number.isInteger(v) || v < min || v > max) {
    throw new SeasonTransitionError('InvalidSeasonTransitionConfiguration', `${label}.${key} must be an integer in [${min}, ${max}]`);
  }
  return v;
}

function requireString(o: Record<string, unknown>, key: string, label: string): string {
  const v = o[key];
  if (typeof v !== 'string' || v.length === 0) {
    throw new SeasonTransitionError('InvalidSeasonTransitionConfiguration', `${label}.${key} must be a non-empty string`);
  }
  return v;
}

function readSeason(raw: unknown): SeasonTransitionSeasonConfig {
  if (!isObject(raw)) throw new SeasonTransitionError('InvalidSeasonTransitionConfiguration', 'season must be an object');
  exactKeys(raw, ['orderIncrement', 'displayNamePattern', 'startDateMonth', 'startDateDay', 'endDateMonth', 'endDateDay'], 'season');
  const orderIncrement = requireInt(raw, 'orderIncrement', 'season', 1, 10);
  const displayNamePattern = requireString(raw, 'displayNamePattern', 'season');
  if (!displayNamePattern.includes('{startYear}') && !displayNamePattern.includes('{endYear}')) {
    throw new SeasonTransitionError('InvalidSeasonTransitionConfiguration', 'season.displayNamePattern must include {startYear} or {endYear}');
  }
  // Reject unsupported tokens.
  const tokens = displayNamePattern.match(/\{[^}]+\}/g) ?? [];
  for (const t of tokens) {
    if (t !== '{startYear}' && t !== '{endYear}') {
      throw new SeasonTransitionError('InvalidSeasonTransitionConfiguration', `Unsupported display-name token ${t}`);
    }
  }
  const startDateMonth = requireInt(raw, 'startDateMonth', 'season', 1, 12);
  const startDateDay = requireInt(raw, 'startDateDay', 'season', 1, 31);
  const endDateMonth = requireInt(raw, 'endDateMonth', 'season', 1, 12);
  const endDateDay = requireInt(raw, 'endDateDay', 'season', 1, 31);
  // Validate day-in-month for a representative year (2001, a non-leap year).
  composeIsoDate(2001, startDateMonth, startDateDay);
  composeIsoDate(2002, endDateMonth, endDateDay);
  return { orderIncrement, displayNamePattern, startDateMonth, startDateDay, endDateMonth, endDateDay };
}

function readCompetitions(raw: unknown): SeasonTransitionCompetitionsConfig {
  if (!isObject(raw)) throw new SeasonTransitionError('InvalidSeasonTransitionConfiguration', 'competitions must be an object');
  exactKeys(raw, [
    'carryForwardEnabledDefinitions',
    'copyDefaultRulesIntoNewEditionSnapshot',
    'copyStageTemplates',
    'copyConfirmedParticipants',
    'activateEditionsAutomatically',
    'newEditionInitialStatus',
  ], 'competitions');
  const newEditionInitialStatus = raw['newEditionInitialStatus'];
  if (newEditionInitialStatus !== 'PLANNED' && newEditionInitialStatus !== 'PREPARING') {
    throw new SeasonTransitionError('InvalidSeasonTransitionConfiguration', 'competitions.newEditionInitialStatus must be PLANNED or PREPARING');
  }
  const activateEditionsAutomatically = requireBoolean(raw, 'activateEditionsAutomatically', 'competitions');
  // Foundation default: no automatic ACTIVE status.
  if (activateEditionsAutomatically) {
    throw new SeasonTransitionError('InvalidSeasonTransitionConfiguration', 'competitions.activateEditionsAutomatically must be false in the foundation default');
  }
  return {
    carryForwardEnabledDefinitions: requireBoolean(raw, 'carryForwardEnabledDefinitions', 'competitions'),
    copyDefaultRulesIntoNewEditionSnapshot: requireBoolean(raw, 'copyDefaultRulesIntoNewEditionSnapshot', 'competitions'),
    copyStageTemplates: requireBoolean(raw, 'copyStageTemplates', 'competitions'),
    copyConfirmedParticipants: requireBoolean(raw, 'copyConfirmedParticipants', 'competitions'),
    activateEditionsAutomatically,
    newEditionInitialStatus,
  };
}

function readLineups(raw: unknown): SeasonTransitionLineupsConfig {
  if (!isObject(raw)) throw new SeasonTransitionError('InvalidSeasonTransitionConfiguration', 'lineups must be an object');
  exactKeys(raw, ['carryForwardClubLineups', 'markForReview', 'copyTactics', 'autoRebuild'], 'lineups');
  const autoRebuild = requireBoolean(raw, 'autoRebuild', 'lineups');
  if (autoRebuild) {
    throw new SeasonTransitionError('InvalidSeasonTransitionConfiguration', 'lineups.autoRebuild must be false in the foundation default');
  }
  return {
    carryForwardClubLineups: requireBoolean(raw, 'carryForwardClubLineups', 'lineups'),
    markForReview: requireBoolean(raw, 'markForReview', 'lineups'),
    copyTactics: requireBoolean(raw, 'copyTactics', 'lineups'),
    autoRebuild,
  };
}

function readNationalTeams(raw: unknown): SeasonTransitionNationalTeamsConfig {
  if (!isObject(raw)) throw new SeasonTransitionError('InvalidSeasonTransitionConfiguration', 'nationalTeams must be an object');
  exactKeys(raw, ['createEditionPreparationAutomatically', 'carryLockedTournamentRosters'], 'nationalTeams');
  const carryLockedTournamentRosters = requireBoolean(raw, 'carryLockedTournamentRosters', 'nationalTeams');
  if (carryLockedTournamentRosters) {
    throw new SeasonTransitionError('InvalidSeasonTransitionConfiguration', 'nationalTeams.carryLockedTournamentRosters must be false in the foundation default');
  }
  return {
    createEditionPreparationAutomatically: requireBoolean(raw, 'createEditionPreparationAutomatically', 'nationalTeams'),
    carryLockedTournamentRosters,
  };
}

function readScouting(raw: unknown): SeasonTransitionScoutingConfig {
  if (!isObject(raw)) throw new SeasonTransitionError('InvalidSeasonTransitionConfiguration', 'scouting must be an object');
  exactKeys(raw, ['preserveReports', 'markAgeSensitiveReportsStale', 'preserveWatchlists', 'preserveDepartments'], 'scouting');
  return {
    preserveReports: requireBoolean(raw, 'preserveReports', 'scouting'),
    markAgeSensitiveReportsStale: requireBoolean(raw, 'markAgeSensitiveReportsStale', 'scouting'),
    preserveWatchlists: requireBoolean(raw, 'preserveWatchlists', 'scouting'),
    preserveDepartments: requireBoolean(raw, 'preserveDepartments', 'scouting'),
  };
}

function readContracts(raw: unknown): SeasonTransitionContractsConfig {
  if (!isObject(raw)) throw new SeasonTransitionError('InvalidSeasonTransitionConfiguration', 'contracts must be an object');
  exactKeys(raw, ['requireNoOwnershipMismatch', 'activateApplicableFutureContracts'], 'contracts');
  return {
    requireNoOwnershipMismatch: requireBoolean(raw, 'requireNoOwnershipMismatch', 'contracts'),
    activateApplicableFutureContracts: requireBoolean(raw, 'activateApplicableFutureContracts', 'contracts'),
  };
}

function readCompletion(raw: unknown): SeasonTransitionCompletionConfig {
  if (!isObject(raw)) throw new SeasonTransitionError('InvalidSeasonTransitionConfiguration', 'completion must be an object');
  exactKeys(raw, [
    'requireCompletedOffseasonRun',
    'requireArchivedCompletedCompetitions',
    'requireNoActiveCompetitionEdition',
    'requireNoRunningWorldOperation',
  ], 'completion');
  return {
    requireCompletedOffseasonRun: requireBoolean(raw, 'requireCompletedOffseasonRun', 'completion'),
    requireArchivedCompletedCompetitions: requireBoolean(raw, 'requireArchivedCompletedCompetitions', 'completion'),
    requireNoActiveCompetitionEdition: requireBoolean(raw, 'requireNoActiveCompetitionEdition', 'completion'),
    requireNoRunningWorldOperation: requireBoolean(raw, 'requireNoRunningWorldOperation', 'completion'),
  };
}

/** Strictly validate a raw configuration object. Returns a typed config. */
export function validateSeasonTransitionConfig(raw: unknown): SeasonTransitionConfig {
  if (!isObject(raw)) throw new SeasonTransitionError('InvalidSeasonTransitionConfiguration', 'config must be an object');
  exactKeys(raw, ['schemaVersion', 'season', 'competitions', 'lineups', 'nationalTeams', 'scouting', 'contracts', 'completion'], 'config');
  const schemaVersion = raw['schemaVersion'];
  if (schemaVersion !== SEASON_TRANSITION_SCHEMA_VERSION) {
    throw new SeasonTransitionError('InvalidSeasonTransitionConfiguration', `schemaVersion must be ${SEASON_TRANSITION_SCHEMA_VERSION}`);
  }
  const season = readSeason(raw['season']);
  const competitions = readCompetitions(raw['competitions']);
  const lineups = readLineups(raw['lineups']);
  const nationalTeams = readNationalTeams(raw['nationalTeams']);
  const scouting = readScouting(raw['scouting']);
  const contracts = readContracts(raw['contracts']);
  const completion = readCompletion(raw['completion']);
  // Compatible carry-forward combinations: if stages are copied, rules must be copied too.
  if (competitions.copyStageTemplates && !competitions.copyDefaultRulesIntoNewEditionSnapshot) {
    throw new SeasonTransitionError('InvalidSeasonTransitionConfiguration', 'competitions.copyStageTemplates requires copyDefaultRulesIntoNewEditionSnapshot');
  }
  // Lineup carry-forward requires tactic carry-forward to stay coherent.
  if (lineups.carryForwardClubLineups && !lineups.copyTactics) {
    throw new SeasonTransitionError('InvalidSeasonTransitionConfiguration', 'lineups.carryForwardClubLineups requires copyTactics');
  }
  return { schemaVersion, season, competitions, lineups, nationalTeams, scouting, contracts, completion };
}
