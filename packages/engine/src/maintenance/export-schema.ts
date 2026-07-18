import { MaintenanceError } from './types.js';
import type { ExportSchemaDefinition, ExportType } from './types.js';

/**
 * Stable column lists for every export type. Each list is documented and frozen
 * at F33 schemaVersion 1 — adding columns requires a new envelope schemaVersion
 * rather than silently changing the public CSV/JSON shape.
 */

// Public-safe Player export — neutral fields only. Never includes true
// potential, developmentRate, hidden attributes, F25 quality tier, private
// scouting notes, or Commissioner diagnostics. `role` is F5-derived and is
// already public on the ordinary player API (it is not hidden truth).
export const PLAYERS_PUBLIC_COLUMNS = [
  'id',
  'firstName',
  'lastName',
  'dateOfBirth',
  'nationalityCode',
  'position',
  'rosterStatus',
  'shoots',
  'currentTeamId',
  'currentTeamName',
  'sourceType',
  'role',
] as const;

// Commissioner truth Player export — gated. Includes hidden truth fields for
// local Commissioner diagnostics. Must never be reachable in normal mode.
// `currentAbility`/`role` are F5-derived; `potentialFloor/Ceiling/rate/risk`
// are hidden columns; `qualityTier` comes from F25 youth provenance.
export const PLAYERS_COMMISSIONER_COLUMNS = [
  'id',
  'firstName',
  'lastName',
  'dateOfBirth',
  'nationalityCode',
  'position',
  'rosterStatus',
  'shoots',
  'currentTeamId',
  'currentTeamName',
  'sourceType',
  'role',
  'currentAbility',
  'potentialFloor',
  'potentialCeiling',
  'developmentRate',
  'developmentRisk',
  'qualityTier',
] as const;

export const TEAMS_COLUMNS = [
  'id',
  'name',
  'teamType',
  'leagueId',
  'leagueName',
  'countryCode',
  'simulationLevel',
  'currentCoachId',
  'currentCoachName',
  'tacticalStyle',
] as const;

export const STANDINGS_COLUMNS = [
  'competitionEditionId',
  'competitionEditionName',
  'stageId',
  'stageType',
  'teamId',
  'teamName',
  'rank',
  'gamesPlayed',
  'wins',
  'losses',
  'overtimeLosses',
  'points',
  'goalsFor',
  'goalsAgainst',
] as const;

export const PLAYER_STATISTICS_COLUMNS = [
  'competitionEditionId',
  'competitionEditionName',
  'playerId',
  'playerName',
  'teamId',
  'teamName',
  'gamesPlayed',
  'goals',
  'assists',
  'points',
  'shotsOnGoal',
  'penaltyMinutes',
  'plusMinus',
] as const;

export const GOALIE_STATISTICS_COLUMNS = [
  'competitionEditionId',
  'competitionEditionName',
  'playerId',
  'playerName',
  'teamId',
  'teamName',
  'gamesPlayed',
  'shotsAgainst',
  'saves',
  'goalsAgainst',
  'shutouts',
] as const;

export const CONTRACT_HISTORY_COLUMNS = [
  'contractId',
  'playerId',
  'playerName',
  'teamId',
  'teamName',
  'startWorldSeasonId',
  'startWorldSeasonLabel',
  'endWorldSeasonId',
  'endWorldSeasonLabel',
  'status',
  'salaryPerSeason',
  'signedAt',
] as const;

export const DRAFT_HISTORY_COLUMNS = [
  'draftEventId',
  'worldSeasonLabel',
  'round',
  'overallPick',
  'playerId',
  'playerName',
  'selectingTeamId',
  'selectingTeamName',
  'originalTeamId',
  'originalTeamName',
  'rightsStatus',
] as const;

export const TRADE_HISTORY_COLUMNS = [
  'completedTradeId',
  'completedAt',
  'teamAId',
  'teamAName',
  'teamBId',
  'teamBName',
  'assetType',
  'assetDescription',
  'fromTeamId',
  'fromTeamName',
  'toTeamId',
  'toTeamName',
] as const;

export const TRANSACTION_HISTORY_COLUMNS = [
  'transactionId',
  'transactionType',
  'worldSeasonId',
  'worldSeasonLabel',
  'playerId',
  'playerName',
  'fromTeamId',
  'fromTeamName',
  'toTeamId',
  'toTeamName',
  'summary',
  'recordedAt',
] as const;

/**
 * Canonical schema registry. The order of `columns` is the documented CSV
 * column order; JSON exports use the same keys. Filters are the only accepted
 * query keys for previews/generation.
 */
export const EXPORT_SCHEMAS: readonly ExportSchemaDefinition[] = [
  {
    exportType: 'PLAYERS_PUBLIC_JSON',
    format: 'JSON',
    privacyLevel: 'PUBLIC_SAFE',
    columns: PLAYERS_PUBLIC_COLUMNS,
    supportedFilters: ['teamId', 'leagueId', 'countryCode', 'position', 'rosterStatus', 'sourceType'],
    deterministicOrder: 'lastName asc, firstName asc, id asc',
    revealsHiddenTruth: false,
    usesImmutableArchive: false,
    fileExtension: '.json',
  },
  {
    exportType: 'PLAYERS_PUBLIC_CSV',
    format: 'CSV',
    privacyLevel: 'PUBLIC_SAFE',
    columns: PLAYERS_PUBLIC_COLUMNS,
    supportedFilters: ['teamId', 'leagueId', 'countryCode', 'position', 'rosterStatus', 'sourceType'],
    deterministicOrder: 'lastName asc, firstName asc, id asc',
    revealsHiddenTruth: false,
    usesImmutableArchive: false,
    fileExtension: '.csv',
  },
  {
    exportType: 'PLAYERS_COMMISSIONER_JSON',
    format: 'JSON',
    privacyLevel: 'COMMISSIONER_TRUTH',
    columns: PLAYERS_COMMISSIONER_COLUMNS,
    supportedFilters: ['teamId', 'leagueId', 'countryCode', 'position', 'rosterStatus', 'sourceType'],
    deterministicOrder: 'currentAbility desc, id asc',
    revealsHiddenTruth: true,
    usesImmutableArchive: false,
    fileExtension: '.json',
  },
  {
    exportType: 'PLAYERS_COMMISSIONER_CSV',
    format: 'CSV',
    privacyLevel: 'COMMISSIONER_TRUTH',
    columns: PLAYERS_COMMISSIONER_COLUMNS,
    supportedFilters: ['teamId', 'leagueId', 'countryCode', 'position', 'rosterStatus', 'sourceType'],
    deterministicOrder: 'currentAbility desc, id asc',
    revealsHiddenTruth: true,
    usesImmutableArchive: false,
    fileExtension: '.csv',
  },
  {
    exportType: 'TEAMS_CSV',
    format: 'CSV',
    privacyLevel: 'NEUTRAL',
    columns: TEAMS_COLUMNS,
    supportedFilters: ['leagueId', 'countryCode', 'teamType', 'simulationLevel'],
    deterministicOrder: 'leagueName asc, name asc, id asc',
    revealsHiddenTruth: false,
    usesImmutableArchive: false,
    fileExtension: '.csv',
  },
  {
    exportType: 'STANDINGS_CSV',
    format: 'CSV',
    privacyLevel: 'NEUTRAL',
    columns: STANDINGS_COLUMNS,
    supportedFilters: ['worldSeasonId', 'competitionEditionId', 'stageId'],
    deterministicOrder: 'competitionEditionId asc, stageId asc, rank asc, teamId asc',
    revealsHiddenTruth: false,
    usesImmutableArchive: true,
    fileExtension: '.csv',
  },
  {
    exportType: 'PLAYER_STATISTICS_CSV',
    format: 'CSV',
    privacyLevel: 'NEUTRAL',
    columns: PLAYER_STATISTICS_COLUMNS,
    supportedFilters: ['worldSeasonId', 'competitionEditionId', 'teamId'],
    deterministicOrder: 'competitionEditionId asc, points desc, playerId asc',
    revealsHiddenTruth: false,
    usesImmutableArchive: true,
    fileExtension: '.csv',
  },
  {
    exportType: 'GOALIE_STATISTICS_CSV',
    format: 'CSV',
    privacyLevel: 'NEUTRAL',
    columns: GOALIE_STATISTICS_COLUMNS,
    supportedFilters: ['worldSeasonId', 'competitionEditionId', 'teamId'],
    deterministicOrder: 'competitionEditionId asc, saves desc, playerId asc',
    revealsHiddenTruth: false,
    usesImmutableArchive: true,
    fileExtension: '.csv',
  },
  {
    exportType: 'COMPETITION_ARCHIVE_JSON',
    format: 'JSON',
    privacyLevel: 'NEUTRAL',
    columns: ['archiveId', 'competitionEditionId', 'archiveSchemaVersion', 'championTeamId', 'archiveHash'],
    supportedFilters: ['worldSeasonId', 'competitionEditionId'],
    deterministicOrder: 'competitionEditionId asc, archiveId asc',
    revealsHiddenTruth: false,
    usesImmutableArchive: true,
    fileExtension: '.json',
  },
  {
    exportType: 'CONTRACT_HISTORY_CSV',
    format: 'CSV',
    privacyLevel: 'NEUTRAL',
    columns: CONTRACT_HISTORY_COLUMNS,
    supportedFilters: ['worldSeasonId', 'teamId', 'status'],
    deterministicOrder: 'signedAt desc, contractId asc',
    revealsHiddenTruth: false,
    usesImmutableArchive: false,
    fileExtension: '.csv',
  },
  {
    exportType: 'DRAFT_HISTORY_CSV',
    format: 'CSV',
    privacyLevel: 'NEUTRAL',
    columns: DRAFT_HISTORY_COLUMNS,
    supportedFilters: ['draftEventId', 'worldSeasonId'],
    deterministicOrder: 'draftEventId asc, overallPick asc',
    revealsHiddenTruth: false,
    usesImmutableArchive: false,
    fileExtension: '.csv',
  },
  {
    exportType: 'TRADE_HISTORY_CSV',
    format: 'CSV',
    privacyLevel: 'NEUTRAL',
    columns: TRADE_HISTORY_COLUMNS,
    supportedFilters: ['worldSeasonId', 'teamId'],
    deterministicOrder: 'completedAt desc, completedTradeId asc, assetIndex asc',
    revealsHiddenTruth: false,
    usesImmutableArchive: false,
    fileExtension: '.csv',
  },
  {
    exportType: 'TRANSACTION_HISTORY_CSV',
    format: 'CSV',
    privacyLevel: 'NEUTRAL',
    columns: TRANSACTION_HISTORY_COLUMNS,
    supportedFilters: ['worldSeasonId', 'teamId', 'transactionType'],
    deterministicOrder: 'recordedAt desc, transactionId asc',
    revealsHiddenTruth: false,
    usesImmutableArchive: false,
    fileExtension: '.csv',
  },
  {
    exportType: 'CONFIGURATION_PRESET_JSON',
    format: 'JSON',
    privacyLevel: 'NEUTRAL',
    columns: ['presetType', 'presetName', 'versionName', 'payloadSchemaVersion', 'payloadHash'],
    supportedFilters: ['presetType', 'presetName'],
    deterministicOrder: 'presetType asc, presetName asc, versionName asc',
    revealsHiddenTruth: false,
    usesImmutableArchive: false,
    fileExtension: '.json',
  },
  {
    exportType: 'NAME_POOLS_JSON',
    format: 'JSON',
    privacyLevel: 'NEUTRAL',
    columns: ['countryCode', 'countryName', 'firstNamesCount', 'lastNamesCount', 'poolHash'],
    supportedFilters: ['countryCode'],
    deterministicOrder: 'countryCode asc, poolHash asc',
    revealsHiddenTruth: false,
    usesImmutableArchive: false,
    fileExtension: '.json',
  },
  {
    exportType: 'FULL_DATABASE_PACKAGE',
    format: 'ZIP',
    privacyLevel: 'COMMISSIONER_TRUTH',
    columns: ['sqliteSha256', 'databaseFingerprint', 'backupId', 'migrationCount'],
    supportedFilters: [],
    deterministicOrder: 'snapshot at generation time (immutable)',
    revealsHiddenTruth: true,
    usesImmutableArchive: false,
    fileExtension: '.zip',
  },
];

const EXPORT_SCHEMA_BY_TYPE: Record<ExportType, ExportSchemaDefinition> = EXPORT_SCHEMAS.reduce(
  (acc, def) => {
    acc[def.exportType] = def;
    return acc;
  },
  {} as Record<ExportType, ExportSchemaDefinition>,
);

export function getExportSchema(exportType: ExportType): ExportSchemaDefinition {
  const def = EXPORT_SCHEMA_BY_TYPE[exportType];
  if (!def) {
    throw new MaintenanceError('InvalidExportType', `Unknown export type: ${exportType}`);
  }
  return def;
}

export function isSupportedFilter(exportType: ExportType, filterKey: string): boolean {
  return getExportSchema(exportType).supportedFilters.includes(filterKey);
}

/**
 * Validate a filter map against an export type. Returns a normalized filter
 * object (only allowlisted keys, string values). Throws on unknown filters.
 */
export function validateExportFilters(
  exportType: ExportType,
  filters: Record<string, unknown>,
): Record<string, string> {
  const def = getExportSchema(exportType);
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(filters)) {
    if (value === undefined || value === null || value === '') continue;
    if (!def.supportedFilters.includes(key)) {
      throw new MaintenanceError(
        'InvalidExportFilter',
        `Export type ${exportType} does not support filter '${key}'`,
      );
    }
    if (typeof value !== 'string') {
      throw new MaintenanceError(
        'InvalidExportFilter',
        `Filter '${key}' must be a string`,
      );
    }
    out[key] = value;
  }
  return out;
}
