/** F32 backup/recovery HTTP error type — mirrors the season-transition error pattern. */
export class BackupHttpError extends Error {
  statusCode: number;
  code: string;
  details?: unknown;

  constructor(statusCode: number, code: string, message: string, details?: unknown) {
    super(message);
    this.name = code;
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
  }
}

/**
 * Helpers that construct the stable F32 error codes listed in the spec. Centralized
 * so routes/services produce consistent codes. Absolute paths are never included
 * in error payloads (callers must sanitize).
 */
export const backupErrors = {
  invalidRequest: (message: string, details?: unknown) =>
    new BackupHttpError(400, 'InvalidBackupRequest', message, details),
  backupNotFound: (id: string) =>
    new BackupHttpError(404, 'BackupNotFound', `Backup not found: ${id}`),
  restoreNotFound: (id: string) =>
    new BackupHttpError(404, 'RestoreRunNotFound', `Restore run not found: ${id}`),
  configNotFound: (id: string) =>
    new BackupHttpError(404, 'BackupConfigurationNotFound', `Backup configuration not found: ${id}`),
  backupAlreadyRunning: () =>
    new BackupHttpError(409, 'BackupAlreadyRunning', 'A backup is already running'),
  backupNotVerified: (id: string) =>
    new BackupHttpError(409, 'BackupNotVerified', `Backup is not VERIFIED: ${id}`),
  backupProtected: (id: string) =>
    new BackupHttpError(409, 'BackupProtected', `Backup is protected and cannot be pruned: ${id}`),
  backupInUseByRestore: (id: string) =>
    new BackupHttpError(409, 'BackupInUseByRestore', `Backup is referenced by an active restore: ${id}`),
  restoreAlreadyRunning: () =>
    new BackupHttpError(409, 'RestoreAlreadyRunning', 'A restore run is already active'),
  restoreNotPrepared: (id: string) =>
    new BackupHttpError(409, 'RestoreNotPrepared', `Restore run is not PREPARED: ${id}`),
  restoreCompleted: (id: string) =>
    new BackupHttpError(409, 'RestoreCompleted', `Restore run is already completed (immutable): ${id}`),
  restoreInputStale: () =>
    new BackupHttpError(409, 'RestoreInputStale', 'Restore input is stale; re-preview and re-prepare'),
  conflictingWorldOperation: () =>
    new BackupHttpError(409, 'ConflictingWorldOperation', 'A world-mutating operation is currently running'),
  maintenanceMode: () =>
    new BackupHttpError(503, 'MaintenanceMode', 'Server is in maintenance/recovery mode'),
  restoreInProgress: () =>
    new BackupHttpError(503, 'RestoreInProgress', 'A restore is in progress'),
  backupDirectoryInvalid: (message: string) =>
    new BackupHttpError(422, 'BackupDirectoryInvalid', message),
  integrityFailed: () =>
    new BackupHttpError(422, 'BackupIntegrityFailed', 'Backup integrity check failed'),
  manifestInvalid: (message: string) =>
    new BackupHttpError(422, 'BackupManifestInvalid', message),
  compatibilityFailed: (message: string, details?: unknown) =>
    new BackupHttpError(422, 'BackupCompatibilityFailed', message, details),
  restoreReadinessFailed: (message: string, details?: unknown) =>
    new BackupHttpError(422, 'RestoreReadinessFailed', message, details),
  restoreVerificationFailed: (message: string) =>
    new BackupHttpError(422, 'RestoreVerificationFailed', message),
  backupFailed: (message: string) =>
    new BackupHttpError(503, 'BackupFailed', message),
  restoreFailed: (message: string) =>
    new BackupHttpError(500, 'RestoreFailed', message),
  unsupportedBackend: () =>
    new BackupHttpError(422, 'BackupIntegrityFailed', 'Backup is only supported for local SQLite file databases'),
  pathTraversal: () =>
    new BackupHttpError(422, 'BackupDirectoryInvalid', 'Resolved path escapes the configured backup directory'),
};
