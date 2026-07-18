/**
 * F33 — Import, Export, and Database Maintenance pure engine types.
 *
 * The engine owns policy only: strict versioned maintenance-configuration
 * validation, export schema definitions, CSV escaping rules, import row
 * validation, duplicate/conflict classification, normalized import-plan
 * generation, database diagnostic aggregation from domain-neutral inputs,
 * reconciliation, and deterministic hashes. It is pure policy — it never
 * imports Prisma, never touches the filesystem, never opens SQLite, and never
 * emits node:crypto in its exports.
 *
 * The server owns every actual file and database operation (loading rows,
 * writing files, computing persisted SHA-256 hashes via node:crypto, creating
 * F32 backups, atomic application, downloads, and reset execution).
 *
 * Boundaries (F33 scope): SQLite-only local world maintenance; exports never
 * mutate world data; public-safe exports omit hidden/private truth; truth
 * exports require Commissioner Mode; imports always preview first and apply
 * atomically; preset imports create new immutable versions; name-pool imports
 * never modify existing Players; destructive maintenance requires a VERIFIED
 * F32 backup; database validation never silently repairs; reset is explicit
 * and cannot delete backups; maintenance paths stay inside configured storage.
 */

export const MAINTENANCE_CONFIG_SCHEMA_VERSION = 1 as const;
export const MAINTENANCE_MANIFEST_SCHEMA_VERSION = 1 as const;
export const MAINTENANCE_EXPORT_ENVELOPE_SCHEMA_VERSION = 1 as const;
export const MAINTENANCE_PRESET_ENVELOPE_SCHEMA_VERSION = 1 as const;

export class MaintenanceError extends Error {
  constructor(
    public code: string,
    message: string,
    public details?: unknown,
  ) {
    super(message);
    this.name = 'MaintenanceError';
  }
}

// ---------------------------------------------------------------------------
// Configuration (strict, versioned)
// ---------------------------------------------------------------------------

export interface MaintenanceStorageConfig {
  /** Relative or allowed-absolute export directory. */
  directory: string;
  /** When true, an absolute `directory` value is permitted. */
  allowAbsoluteDirectory: boolean;
  /** Create the directory if it is missing. */
  createDirectoryIfMissing: boolean;
}

export interface MaintenanceCsvConfig {
  delimiter: string;
  encoding: 'utf-8';
  includeBom: boolean;
  lineEnding: 'LF';
  nullValue: string;
}

export interface MaintenanceJsonConfig {
  prettyPrint: boolean;
  canonicalManifest: boolean;
}

export interface MaintenanceLimitsConfig {
  maximumExportRows: number;
  maximumImportBytes: number;
  maximumErrorRowsReturned: number;
}

export type MaintenancePlayerExportMode = 'PUBLIC_SAFE' | 'COMMISSIONER_TRUTH';

export interface MaintenancePrivacyConfig {
  defaultPlayerExportMode: MaintenancePlayerExportMode;
  allowCommissionerTruthExport: boolean;
  includePrivateScoutingByDefault: boolean;
}

export interface MaintenanceRetentionConfig {
  maximumGeneratedExports: number;
  maximumAgeDays: number;
}

export interface MaintenanceConfig {
  schemaVersion: typeof MAINTENANCE_CONFIG_SCHEMA_VERSION;
  storage: MaintenanceStorageConfig;
  csv: MaintenanceCsvConfig;
  json: MaintenanceJsonConfig;
  limits: MaintenanceLimitsConfig;
  privacy: MaintenancePrivacyConfig;
  retention: MaintenanceRetentionConfig;
}

// ---------------------------------------------------------------------------
// Export types
// ---------------------------------------------------------------------------

export type ExportType =
  | 'PLAYERS_PUBLIC_JSON'
  | 'PLAYERS_PUBLIC_CSV'
  | 'PLAYERS_COMMISSIONER_JSON'
  | 'PLAYERS_COMMISSIONER_CSV'
  | 'TEAMS_CSV'
  | 'STANDINGS_CSV'
  | 'PLAYER_STATISTICS_CSV'
  | 'GOALIE_STATISTICS_CSV'
  | 'COMPETITION_ARCHIVE_JSON'
  | 'CONTRACT_HISTORY_CSV'
  | 'DRAFT_HISTORY_CSV'
  | 'TRADE_HISTORY_CSV'
  | 'TRANSACTION_HISTORY_CSV'
  | 'CONFIGURATION_PRESET_JSON'
  | 'NAME_POOLS_JSON'
  | 'FULL_DATABASE_PACKAGE';

export type ExportFormat = 'CSV' | 'JSON' | 'ZIP';

export type ExportPrivacyLevel = 'PUBLIC_SAFE' | 'COMMISSIONER_TRUTH' | 'NEUTRAL';

export interface ExportSchemaDefinition {
  exportType: ExportType;
  format: ExportFormat;
  privacyLevel: ExportPrivacyLevel;
  /** Stable column list for CSV exports; JSON key set for JSON exports. */
  columns: readonly string[];
  /** Filter keys accepted by this export type. */
  supportedFilters: readonly string[];
  /** Deterministic ordering description (documented invariant). */
  deterministicOrder: string;
  /** True when this export may reveal hidden Player truth (Commissioner-only). */
  revealsHiddenTruth: boolean;
  /** True when this export reads immutable archive snapshots rather than live rows. */
  usesImmutableArchive: boolean;
  /** File extension to use for generated artifacts. */
  fileExtension: '.csv' | '.json' | '.zip';
}

export type ExportRunStatus =
  | 'PLANNED'
  | 'RUNNING'
  | 'COMPLETED'
  | 'FAILED'
  | 'DELETED';

// ---------------------------------------------------------------------------
// Import lifecycle
// ---------------------------------------------------------------------------

export type ImportType = 'NAME_POOL' | 'CONFIGURATION_PRESET';

export type ImportRunStatus =
  | 'UPLOADED'
  | 'VALIDATING'
  | 'PREVIEW_READY'
  | 'APPLYING'
  | 'COMPLETED'
  | 'FAILED'
  | 'CANCELLED';

export type ImportIssueSeverity = 'BLOCKER' | 'WARNING';

export interface ImportIssue {
  rowNumber: number | null;
  fieldName: string | null;
  severity: ImportIssueSeverity;
  code: string;
  message: string;
  normalizedValue: string | null;
}

export type DuplicatePolicy = 'SKIP_IDENTICAL' | 'REJECT_CONFLICT' | 'ADD_NEW';

export type DuplicateClassification =
  | 'IDENTICAL'
  | 'CONFLICT'
  | 'NEW';

// ---------------------------------------------------------------------------
// Database validation
// ---------------------------------------------------------------------------

export type ValidationRunStatus = 'RUNNING' | 'COMPLETED' | 'FAILED';

export type CheckSeverity = 'OK' | 'WARNING' | 'BLOCKER';

export type ValidationGroup =
  | 'SQLITE'
  | 'WORLD'
  | 'PLAYERS_TEAMS'
  | 'CONTRACTS'
  | 'DRAFT'
  | 'TRADES'
  | 'COMPETITIONS'
  | 'STATISTICS'
  | 'SCOUTING'
  | 'OFFSEASON_TRANSITIONS'
  | 'BACKUPS'
  | 'MAINTENANCE';

export interface ValidationCheck {
  group: ValidationGroup;
  code: string;
  severity: CheckSeverity;
  message: string;
  /** Counts/IDs only — never hidden Player truth (per privacy invariant). */
  details?: Record<string, unknown>;
}

export interface DatabaseCheckInput {
  databaseFingerprint: string;
  /** SQLite PRAGMA integrity_check result (the server gathers, raw text). */
  integrityCheckOk: boolean;
  integrityCheckMessage: string | null;
  migrationCount: number;
  latestMigrationName: string | null;
  /** True when the _prisma_migrations table exists. */
  hasMigrationTable: boolean;
  /** Required-table presence map (server supplies the bounded list). */
  requiredTablesPresent: Record<string, boolean>;
  world: WorldCheckInput;
  playersTeams: PlayersTeamsCheckInput;
  contracts: ContractsCheckInput;
  draft: DraftCheckInput;
  trades: TradesCheckInput;
  competitions: CompetitionsCheckInput;
  statistics: StatisticsCheckInput;
  scouting: ScoutingCheckInput;
  offseasonTransitions: OffseasonTransitionsCheckInput;
  backups: BackupsCheckInput;
  maintenance: MaintenanceRunCheckInput;
}

export interface WorldCheckInput {
  appMetaPresent: boolean;
  worldInitialized: boolean;
  currentWorldSeasonCount: number;
  worldSeasonTotalCount: number;
}

export interface PlayersTeamsCheckInput {
  duplicatePlayerExternalIds: number;
  invalidTeamOwnership: number;
  retiredPlayersInLineups: number;
  missingRequiredReferences: number;
}

export interface ContractsCheckInput {
  playersWithMultipleActiveContracts: number;
  currentPlayerTeamMismatches: number;
  invalidOverlaps: number;
  futureInconsistencies: number;
}

export interface DraftCheckInput {
  picksWithOwnershipMismatch: number;
  duplicateActiveRights: number;
  convertedRightInconsistencies: number;
}

export interface TradesCheckInput {
  completedTradesWithUnreconciledAssets: number;
}

export interface CompetitionsCheckInput {
  editionStageDependencyInvalid: number;
  activeCompletedStatusInconsistent: number;
  scheduleMatchOwnershipInvalid: number;
  archiveIntegrityFailures: number;
}

export interface StatisticsCheckInput {
  orphanStatRecords: number;
  teamPlayerReferenceInvalid: number;
  archivedSnapshotInconsistent: number;
}

export interface ScoutingCheckInput {
  teamPrivateOwnershipInvalid: number;
  reportVersionIntegrityFailures: number;
  assignmentStateInconsistent: number;
}

export interface OffseasonTransitionsCheckInput {
  activeOffseasonRunCount: number;
  linkedOperationInconsistencies: number;
  targetCurrentSeasonUniqueness: number;
}

export interface BackupsCheckInput {
  backupSubsystemConfigured: boolean;
  pendingRestoreConflict: boolean;
}

export interface MaintenanceRunCheckInput {
  stuckRunningExportCount: number;
  stuckRunningImportCount: number;
  stuckRunningValidationCount: number;
  stuckRunningResetCount: number;
}

export interface DatabaseValidationResult {
  status: 'PASS' | 'WARNING' | 'FAIL';
  checks: ValidationCheck[];
  blockers: ValidationCheck[];
  warnings: ValidationCheck[];
  databaseFingerprint: string;
  resultHash: string;
}

// ---------------------------------------------------------------------------
// Reset lifecycle
// ---------------------------------------------------------------------------

export type ResetMode = 'RESET_SETUP_STATE_ONLY' | 'RESET_WORLD_TO_EMPTY';

export type ResetRunStatus =
  | 'PREPARED'
  | 'RUNNING'
  | 'COMPLETED'
  | 'FAILED'
  | 'CANCELLED';

export interface ResetPreviewInput {
  mode: ResetMode;
  appMetaInitialized: boolean;
  /** Exact table/entity counts that will be affected (server supplies). */
  affectedCounts: Array<{ table: string; count: number }>;
  currentDatabaseFingerprint: string;
  worldShortId: string;
  runningWorldOperation: boolean;
  pendingRestore: boolean;
}

export interface ResetPreviewResult {
  mode: ResetMode;
  affectedCounts: Array<{ table: string; count: number }>;
  totalAffectedRows: number;
  currentDatabaseFingerprint: string;
  worldShortId: string;
  /** Required typed confirmation phrase: `RESET WORLD <worldShortId>`. */
  requiredConfirmationPhrase: string;
  ready: boolean;
  blockers: ValidationCheck[];
  warnings: ValidationCheck[];
  previewHash: string;
}

// ---------------------------------------------------------------------------
// Export manifest (normalized hashing input)
// ---------------------------------------------------------------------------

export interface ExportManifestInput {
  manifestSchemaVersion: number;
  exportType: ExportType;
  format: ExportFormat;
  privacyLevel: ExportPrivacyLevel;
  scopeText: string;
  filterText: string;
  schemaVersion: number;
  rowCount: number | null;
  fileSizeBytes: number | null;
  fileSha256: string | null;
  configuration: { versionId: string; hash: string };
  inputHash: string;
}

// ---------------------------------------------------------------------------
// Reconciliation
// ---------------------------------------------------------------------------

export interface ReconciliationIssue {
  code: string;
  message: string;
  severity: 'BLOCKER' | 'WARNING';
}

export interface ExportReconciliationResult {
  ok: boolean;
  issues: ReconciliationIssue[];
}

// ---------------------------------------------------------------------------
// Preset envelope (export/import)
// ---------------------------------------------------------------------------

export type ConfigurationPresetType =
  | 'SIMULATION_BALANCE'
  | 'DEVELOPMENT'
  | 'YOUTH_GENERATION'
  | 'SCOUTING'
  | 'DRAFT'
  | 'CONTRACTS'
  | 'TRADES'
  | 'OFFSEASON'
  | 'SEASON_TRANSITION'
  | 'BACKUP'
  | 'MAINTENANCE';

export interface ConfigurationPresetEnvelope {
  schemaVersion: typeof MAINTENANCE_PRESET_ENVELOPE_SCHEMA_VERSION;
  presetType: ConfigurationPresetType;
  presetName: string;
  versionName: string;
  payloadSchemaVersion: number;
  payload: unknown;
  payloadHash: string;
  exportedAt: string;
}

// ---------------------------------------------------------------------------
// Name pool import (normalized row + plan)
// ---------------------------------------------------------------------------

export interface NamePoolImportRow {
  rowNumber: number;
  countryCode: string;
  firstName: string;
  lastName: string;
}

export interface NamePoolExistingEntry {
  countryCode: string;
  firstName: string;
  lastName: string;
}

export interface NamePoolDuplicateFact {
  rowNumber: number;
  countryCode: string;
  firstName: string;
  lastName: string;
  classification: DuplicateClassification;
}

export interface ImportPlan {
  importType: ImportType;
  totalRows: number;
  validRows: number;
  warningRows: number;
  invalidRows: number;
  intendedCreates: number;
  intendedSkips: number;
  duplicatePolicy: DuplicatePolicy;
  duplicates: NamePoolDuplicateFact[];
  issues: ImportIssue[];
  previewHash: string;
}
