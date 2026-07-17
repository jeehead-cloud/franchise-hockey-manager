/**
 * F32 — Backup and Recovery pure engine types.
 *
 * The engine owns policy only: strict versioned backup-configuration
 * validation, deterministic retention-plan calculation, backup status
 * transitions, restore-readiness aggregation, compatibility-result
 * aggregation, reconciliation, and the normalized inputs to deterministic
 * manifest / database-fingerprint hashes. It is pure policy — it never
 * imports Prisma, never touches the filesystem, and never opens SQLite.
 *
 * The server owns every actual file and database operation (VACUUM INTO,
 * integrity_check, hashing, manifest write, atomic replacement, etc.).
 *
 * Boundaries (F32 scope): SQLite-only local world databases; backup
 * creation never mutates world data; only VERIFIED backups are restorable;
 * restore is explicit and Commissioner-gated; restore replaces the entire
 * world database; restore revalidates integrity + migrations; protected
 * backups cannot be pruned; paths remain within configured backup storage;
 * recovery history survives database replacement through an external
 * journal; F32 does not merge/import individual records.
 */

export const BACKUP_CONFIG_SCHEMA_VERSION = 1 as const;
export const BACKUP_MANIFEST_SCHEMA_VERSION = 1 as const;

export class BackupError extends Error {
  constructor(
    public code: string,
    message: string,
    public details?: unknown,
  ) {
    super(message);
    this.name = 'BackupError';
  }
}

// ---------------------------------------------------------------------------
// Configuration (strict, versioned)
// ---------------------------------------------------------------------------

export type BackupCreationStrategy = 'VACUUM_INTO' | 'BACKUP_API';

export interface BackupStorageConfig {
  /** Relative or allowed-absolute backup directory. */
  directory: string;
  /** When true, an absolute `directory` value is permitted. */
  allowAbsoluteDirectory: boolean;
  /** Create the directory if it is missing. */
  createDirectoryIfMissing: boolean;
}

export interface BackupCreationConfig {
  strategy: BackupCreationStrategy;
  verifyAfterCreate: boolean;
  includeManifest: boolean;
  /** Filename pattern; required tokens: {timestamp}{reason}{shortHash}. */
  filenamePattern: string;
}

export interface BackupRetentionConfig {
  enabled: boolean;
  maximumBackups: number;
  maximumAgeDays: number;
  minimumBackupsToKeep: number;
  keepLatestPerReason: number;
  protectManualBackups: boolean;
  protectSuccessfulRestoreSources: boolean;
  protectPreRestoreBackups: boolean;
}

export interface BackupRestoreConfig {
  requirePreRestoreBackup: boolean;
  requireIntegrityCheck: boolean;
  requireMigrationCompatibility: boolean;
  requireRestart: boolean;
}

export interface BackupLimitsConfig {
  maximumBackupSizeBytes: number;
  maximumManifestSizeBytes: number;
}

export interface BackupConfig {
  schemaVersion: typeof BACKUP_CONFIG_SCHEMA_VERSION;
  storage: BackupStorageConfig;
  creation: BackupCreationConfig;
  retention: BackupRetentionConfig;
  restore: BackupRestoreConfig;
  limits: BackupLimitsConfig;
}

// ---------------------------------------------------------------------------
// Backup record (domain-neutral — server maps Prisma rows into these)
// ---------------------------------------------------------------------------

export type BackupStatus =
  | 'CREATING'
  | 'CREATED'
  | 'VERIFYING'
  | 'VERIFIED'
  | 'FAILED'
  | 'MISSING'
  | 'CORRUPT'
  | 'DELETED';

export type BackupType =
  | 'MANUAL'
  | 'AUTOMATIC_OPERATION'
  | 'PRE_RESTORE'
  | 'RECOVERY_GENERATED';

export type ReasonCode =
  | 'MANUAL'
  | 'REGULAR_SEASON_SIMULATION'
  | 'PLAYOFF_SIMULATION'
  | 'COMPETITION_ARCHIVE'
  | 'AGGREGATED_SIMULATION'
  | 'INTERNATIONAL_TOURNAMENT'
  | 'PLAYER_DEVELOPMENT'
  | 'YOUTH_GENERATION'
  | 'DRAFT_START'
  | 'TRADE_ACCEPTANCE'
  | 'CONTRACT_INITIALIZATION'
  | 'CONTRACT_EXPIRATION'
  | 'SEASON_TRANSITION'
  | 'PRE_RESTORE'
  | 'OTHER';

export interface BackupRecordInput {
  id: string;
  status: BackupStatus;
  backupType: BackupType;
  reasonCode: ReasonCode;
  sourceOperationType: string | null;
  sourceOperationId: string | null;
  sourceEntityType: string | null;
  sourceEntityId: string | null;
  protected: boolean;
  protectionReason: string | null;
  fileSizeBytes: number | null;
  fileSha256: string | null;
  manifestSha256: string | null;
  databaseFingerprint: string | null;
  schemaMigrationCount: number | null;
  latestMigrationName: string | null;
  worldSeasonIdSnapshot: string | null;
  currentWorldSeasonNameSnapshot: string | null;
  verifiedAt: string | null;
  createdAt: string;
}

// ---------------------------------------------------------------------------
// Restore lifecycle
// ---------------------------------------------------------------------------

export type RestoreStatus =
  | 'PREPARED'
  | 'WAITING_FOR_RESTART'
  | 'RUNNING'
  | 'VERIFYING'
  | 'COMPLETED'
  | 'FAILED'
  | 'CANCELLED';

export type RestoreEventType =
  | 'RESTORE_PREPARED'
  | 'SOURCE_VERIFIED'
  | 'PRE_RESTORE_BACKUP_CREATED'
  | 'MAINTENANCE_ENTERED'
  | 'RESTART_REQUESTED'
  | 'REPLACEMENT_STARTED'
  | 'DATABASE_REPLACED'
  | 'POST_RESTORE_VERIFIED'
  | 'RESTORE_COMPLETED'
  | 'RESTORE_FAILED'
  | 'RESTORE_CANCELLED';

// ---------------------------------------------------------------------------
// Retention plan
// ---------------------------------------------------------------------------

export interface RetentionCandidate {
  id: string;
  status: BackupStatus;
  backupType: BackupType;
  reasonCode: ReasonCode;
  protected: boolean;
  protectionReason: string | null;
  /** Set when this backup was the source of a completed restore (policy-protected). */
  sourceOperationType: string | null;
  createdAt: string; // ISO
  verifiedAt: string | null; // ISO
}

export interface RetentionPruneProposal {
  /** Backup IDs proposed for deletion. */
  pruneIds: string[];
  /** Backup IDs that survive. */
  keepIds: string[];
  /** Per-pruned-id human-readable reason. */
  reasons: Record<string, string>;
  /** IDs protected by policy that would otherwise be candidates. */
  protectedIds: string[];
}

// ---------------------------------------------------------------------------
// Compatibility (engine aggregates domain-neutral facts the server gathers)
// ---------------------------------------------------------------------------

export type CompatibilitySeverity = 'BLOCKER' | 'WARNING' | 'OK';

export interface CompatibilityCheck {
  code: string;
  severity: CompatibilitySeverity;
  message: string;
}

export interface CompatibilityResult {
  severity: CompatibilitySeverity;
  compatible: boolean;
  checks: CompatibilityCheck[];
}

// ---------------------------------------------------------------------------
// Reconciliation
// ---------------------------------------------------------------------------

export interface ReconciliationIssue {
  code: string;
  message: string;
  severity: 'BLOCKER' | 'WARNING';
}

export interface BackupReconciliationResult {
  ok: boolean;
  issues: ReconciliationIssue[];
}

// ---------------------------------------------------------------------------
// Normalized hashing inputs (server supplies raw facts; engine normalizes)
// ---------------------------------------------------------------------------

/**
 * Normalized manifest-hash input. The server computes the manifest file's
 * SHA-256 from the canonical-JSON bytes it writes; the engine only defines
 * the *canonical field order/shape* so the manifest is deterministic across
 * runs. Absolute paths, timestamps-as-identity, and backup IDs are excluded
 * from the semantic fields but the manifest file itself legitimately records
 * createdAt/backupId — those are simply excluded from the DATABASE
 * fingerprint (see DatabaseFingerprintInput).
 */
export interface ManifestHashInput {
  manifestSchemaVersion: number;
  backupType: BackupType;
  reasonCode: ReasonCode;
  sourceDatabaseFileName: string;
  sourceDatabaseSizeBytes: number;
  backupFileName: string;
  backupSizeBytes: number;
  backupSha256: string;
  database: DatabaseFingerprintInput;
  configuration: { versionId: string; hash: string };
  sourceOperation: { type: string | null; id: string | null };
}

/**
 * Normalized database-fingerprint input — the semantic state of the source
 * database. Excludes absolute path, backup creation timestamp, and backup ID
 * (those are not part of the database's semantic identity). The server
 * gathers these facts; the engine folds them into a stable digest.
 */
export interface DatabaseFingerprintInput {
  /** Migration names in their canonical applied order. */
  migrationNames: string[];
  /** SQLite user_version pragma value. */
  userVersion: number;
  /** Stable world/dataset identifiers from AppMeta. */
  appMeta: {
    worldInitialized: boolean;
    worldDatasetId: string | null;
    worldSchemaVersion: number | null;
  };
  /** Current (ACTIVE) WorldSeason, or null if none. */
  currentWorldSeason: {
    id: string;
    label: string;
    startYear: number;
    endYear: number;
  } | null;
  /** Bounded key-entity counts (server caps the table list). */
  tableCounts: Array<{ table: string; count: number }>;
}

// ---------------------------------------------------------------------------
// Restore readiness
// ---------------------------------------------------------------------------

export interface RestoreReadinessCheck {
  code: string;
  severity: 'BLOCKER' | 'WARNING' | 'OK';
  message: string;
}

export interface RestoreReadinessResult {
  ready: boolean;
  checks: RestoreReadinessCheck[];
}
