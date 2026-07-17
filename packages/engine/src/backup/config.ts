import {
  BACKUP_CONFIG_SCHEMA_VERSION,
  BackupError,
  type BackupConfig,
  type BackupCreationConfig,
  type BackupCreationStrategy,
  type BackupLimitsConfig,
  type BackupRestoreConfig,
  type BackupRetentionConfig,
  type BackupStorageConfig,
} from './types.js';

/**
 * Default backup configuration. Mirrors the F32 spec's recommended schema:
 * relative `.fhm-backups` storage, VACUUM INTO strategy, mandatory verify +
 * manifest, deterministic retention, restart-required restore, and generous
 * byte limits. Local/hobby defaults — not a production disaster-recovery SLA.
 */
export function defaultBackupConfig(): BackupConfig {
  return {
    schemaVersion: BACKUP_CONFIG_SCHEMA_VERSION,
    storage: {
      directory: '.fhm-backups',
      allowAbsoluteDirectory: true,
      createDirectoryIfMissing: true,
    },
    creation: {
      strategy: 'VACUUM_INTO',
      verifyAfterCreate: true,
      includeManifest: true,
      filenamePattern: 'fhm-{timestamp}-{reason}-{shortHash}.sqlite',
    },
    retention: {
      enabled: true,
      maximumBackups: 50,
      maximumAgeDays: 90,
      minimumBackupsToKeep: 10,
      keepLatestPerReason: 3,
      protectManualBackups: true,
      protectSuccessfulRestoreSources: true,
      protectPreRestoreBackups: true,
    },
    restore: {
      requirePreRestoreBackup: true,
      requireIntegrityCheck: true,
      requireMigrationCompatibility: true,
      requireRestart: true,
    },
    limits: {
      maximumBackupSizeBytes: 10 * 1024 * 1024 * 1024, // 10 GiB
      maximumManifestSizeBytes: 1024 * 1024, // 1 MiB
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
      throw new BackupError('InvalidBackupConfiguration', `Unknown ${label} field: ${k}`);
    }
  }
}

function requireBoolean(o: Record<string, unknown>, key: string, label: string): boolean {
  const v = o[key];
  if (typeof v !== 'boolean') {
    throw new BackupError('InvalidBackupConfiguration', `${label}.${key} must be a boolean`);
  }
  return v;
}

function requireInt(o: Record<string, unknown>, key: string, label: string, min: number, max: number): number {
  const v = o[key];
  if (typeof v !== 'number' || !Number.isInteger(v) || v < min || v > max) {
    throw new BackupError('InvalidBackupConfiguration', `${label}.${key} must be an integer in [${min}, ${max}]`);
  }
  return v;
}

function requireString(o: Record<string, unknown>, key: string, label: string): string {
  const v = o[key];
  if (typeof v !== 'string' || v.length === 0) {
    throw new BackupError('InvalidBackupConfiguration', `${label}.${key} must be a non-empty string`);
  }
  return v;
}

const STRATEGIES: readonly BackupCreationStrategy[] = ['VACUUM_INTO', 'BACKUP_API'];

/**
 * Reject path-traversal and empty directory values. The server additionally
 * canonicalizes and confirms the resolved path stays inside the root on every
 * read; this engine-level check rejects obviously-invalid config early.
 */
function validateDirectory(directory: string, allowAbsolute: boolean): string {
  if (directory.length === 0) {
    throw new BackupError('InvalidBackupConfiguration', 'storage.directory must be non-empty');
  }
  // Reject explicit parent traversal segments anywhere in the path.
  const segments = directory.replace(/\\/g, '/').split('/');
  if (segments.includes('..')) {
    throw new BackupError('InvalidBackupConfiguration', 'storage.directory must not contain parent traversal (..)');
  }
  const isAbsolute =
    /^([a-zA-Z]:[\\/]|[\\/])/i.test(directory) || // Windows drive / POSIX root
    directory.startsWith('/');
  if (isAbsolute && !allowAbsolute) {
    throw new BackupError('InvalidBackupConfiguration', 'storage.directory is absolute but storage.allowAbsoluteDirectory is false');
  }
  return directory;
}

function validateFilenamePattern(pattern: string): string {
  for (const token of ['{timestamp}', '{reason}', '{shortHash}']) {
    if (!pattern.includes(token)) {
      throw new BackupError('InvalidBackupConfiguration', `creation.filenamePattern must include ${token}`);
    }
  }
  // Reject unsupported tokens.
  const tokens = pattern.match(/\{[^}]+\}/g) ?? [];
  for (const t of tokens) {
    if (t !== '{timestamp}' && t !== '{reason}' && t !== '{shortHash}') {
      throw new BackupError('InvalidBackupConfiguration', `Unsupported filename token ${t}`);
    }
  }
  // The resulting filename must be a safe basename (no separators).
  const sample = pattern
    .replace('{timestamp}', '20260101T000000Z')
    .replace('{reason}', 'manual')
    .replace('{shortHash}', 'abcdef01');
  if (sample.includes('/') || sample.includes('\\')) {
    throw new BackupError('InvalidBackupConfiguration', 'creation.filenamePattern must not produce path separators');
  }
  if (!sample.endsWith('.sqlite')) {
    throw new BackupError('InvalidBackupConfiguration', 'creation.filenamePattern must produce a .sqlite filename');
  }
  return pattern;
}

function readStorage(raw: unknown): BackupStorageConfig {
  if (!isObject(raw)) throw new BackupError('InvalidBackupConfiguration', 'storage must be an object');
  exactKeys(raw, ['directory', 'allowAbsoluteDirectory', 'createDirectoryIfMissing'], 'storage');
  const allowAbsoluteDirectory = requireBoolean(raw, 'allowAbsoluteDirectory', 'storage');
  const directory = validateDirectory(requireString(raw, 'directory', 'storage'), allowAbsoluteDirectory);
  const createDirectoryIfMissing = requireBoolean(raw, 'createDirectoryIfMissing', 'storage');
  return { directory, allowAbsoluteDirectory, createDirectoryIfMissing };
}

function readCreation(raw: unknown): BackupCreationConfig {
  if (!isObject(raw)) throw new BackupError('InvalidBackupConfiguration', 'creation must be an object');
  exactKeys(raw, ['strategy', 'verifyAfterCreate', 'includeManifest', 'filenamePattern'], 'creation');
  const strategyRaw = raw['strategy'];
  if (typeof strategyRaw !== 'string' || !STRATEGIES.includes(strategyRaw as BackupCreationStrategy)) {
    throw new BackupError('InvalidBackupConfiguration', 'creation.strategy must be VACUUM_INTO or BACKUP_API');
  }
  const strategy = strategyRaw as BackupCreationStrategy;
  const verifyAfterCreate = requireBoolean(raw, 'verifyAfterCreate', 'creation');
  const includeManifest = requireBoolean(raw, 'includeManifest', 'creation');
  const filenamePattern = validateFilenamePattern(requireString(raw, 'filenamePattern', 'creation'));
  return { strategy, verifyAfterCreate, includeManifest, filenamePattern };
}

function readRetention(raw: unknown): BackupRetentionConfig {
  if (!isObject(raw)) throw new BackupError('InvalidBackupConfiguration', 'retention must be an object');
  exactKeys(
    raw,
    [
      'enabled',
      'maximumBackups',
      'maximumAgeDays',
      'minimumBackupsToKeep',
      'keepLatestPerReason',
      'protectManualBackups',
      'protectSuccessfulRestoreSources',
      'protectPreRestoreBackups',
    ],
    'retention',
  );
  const enabled = requireBoolean(raw, 'enabled', 'retention');
  const maximumBackups = requireInt(raw, 'maximumBackups', 'retention', 1, 100000);
  const maximumAgeDays = requireInt(raw, 'maximumAgeDays', 'retention', 1, 36500);
  const minimumBackupsToKeep = requireInt(raw, 'minimumBackupsToKeep', 'retention', 0, maximumBackups);
  const keepLatestPerReason = requireInt(raw, 'keepLatestPerReason', 'retention', 0, maximumBackups);
  if (minimumBackupsToKeep > maximumBackups) {
    throw new BackupError('InvalidBackupConfiguration', 'retention.minimumBackupsToKeep cannot exceed maximumBackups');
  }
  const protectManualBackups = requireBoolean(raw, 'protectManualBackups', 'retention');
  const protectSuccessfulRestoreSources = requireBoolean(raw, 'protectSuccessfulRestoreSources', 'retention');
  const protectPreRestoreBackups = requireBoolean(raw, 'protectPreRestoreBackups', 'retention');
  return {
    enabled,
    maximumBackups,
    maximumAgeDays,
    minimumBackupsToKeep,
    keepLatestPerReason,
    protectManualBackups,
    protectSuccessfulRestoreSources,
    protectPreRestoreBackups,
  };
}

function readRestore(raw: unknown): BackupRestoreConfig {
  if (!isObject(raw)) throw new BackupError('InvalidBackupConfiguration', 'restore must be an object');
  exactKeys(
    raw,
    ['requirePreRestoreBackup', 'requireIntegrityCheck', 'requireMigrationCompatibility', 'requireRestart'],
    'restore',
  );
  return {
    requirePreRestoreBackup: requireBoolean(raw, 'requirePreRestoreBackup', 'restore'),
    requireIntegrityCheck: requireBoolean(raw, 'requireIntegrityCheck', 'restore'),
    requireMigrationCompatibility: requireBoolean(raw, 'requireMigrationCompatibility', 'restore'),
    requireRestart: requireBoolean(raw, 'requireRestart', 'restore'),
  };
}

function readLimits(raw: unknown): BackupLimitsConfig {
  if (!isObject(raw)) throw new BackupError('InvalidBackupConfiguration', 'limits must be an object');
  exactKeys(raw, ['maximumBackupSizeBytes', 'maximumManifestSizeBytes'], 'limits');
  const maximumBackupSizeBytes = requireInt(raw, 'maximumBackupSizeBytes', 'limits', 1024, Number.MAX_SAFE_INTEGER);
  const maximumManifestSizeBytes = requireInt(raw, 'maximumManifestSizeBytes', 'limits', 1024, Number.MAX_SAFE_INTEGER);
  if (maximumManifestSizeBytes > maximumBackupSizeBytes) {
    throw new BackupError('InvalidBackupConfiguration', 'limits.maximumManifestSizeBytes cannot exceed maximumBackupSizeBytes');
  }
  return { maximumBackupSizeBytes, maximumManifestSizeBytes };
}

/**
 * Strictly validate a backup configuration. Rejects unknown fields, path
 * traversal, invalid strategy/filename pattern, non-positive or
 * inconsistent limits, and schema-version mismatches. Returns a normalized
 * (canonically-ordered) config.
 */
export function validateBackupConfig(input: unknown): BackupConfig {
  if (!isObject(input)) throw new BackupError('InvalidBackupConfiguration', 'config must be an object');
  exactKeys(input, ['schemaVersion', 'storage', 'creation', 'retention', 'restore', 'limits'], 'config');
  const schemaVersion = input['schemaVersion'];
  if (schemaVersion !== BACKUP_CONFIG_SCHEMA_VERSION) {
    throw new BackupError(
      'InvalidBackupConfiguration',
      `schemaVersion must be ${BACKUP_CONFIG_SCHEMA_VERSION}`,
    );
  }
  return {
    schemaVersion,
    storage: readStorage(input['storage']),
    creation: readCreation(input['creation']),
    retention: readRetention(input['retention']),
    restore: readRestore(input['restore']),
    limits: readLimits(input['limits']),
  };
}
