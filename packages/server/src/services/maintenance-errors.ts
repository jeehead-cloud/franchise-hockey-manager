/** F33 maintenance HTTP error type — mirrors the backup error pattern. */
export class MaintenanceHttpError extends Error {
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
 * Helpers that construct the stable F33 error codes listed in the spec.
 * Centralized so routes/services produce consistent codes. Absolute paths are
 * never included in error payloads (callers must sanitize).
 */
export const maintenanceErrors = {
  invalidRequest: (message: string, details?: unknown) =>
    new MaintenanceHttpError(400, 'InvalidMaintenanceRequest', message, details),
  invalidExportFilter: (message: string, details?: unknown) =>
    new MaintenanceHttpError(400, 'InvalidExportFilter', message, details),
  invalidImportFile: (message: string, details?: unknown) =>
    new MaintenanceHttpError(400, 'InvalidImportFile', message, details),
  exportNotFound: (id: string) =>
    new MaintenanceHttpError(404, 'MaintenanceExportNotFound', `Export run not found: ${id}`),
  importNotFound: (id: string) =>
    new MaintenanceHttpError(404, 'MaintenanceImportNotFound', `Import run not found: ${id}`),
  validationNotFound: (id: string) =>
    new MaintenanceHttpError(404, 'MaintenanceValidationNotFound', `Validation run not found: ${id}`),
  resetNotFound: (id: string) =>
    new MaintenanceHttpError(404, 'InitializationResetNotFound', `Reset run not found: ${id}`),
  configNotFound: (id: string) =>
    new MaintenanceHttpError(404, 'MaintenanceConfigurationNotFound', `Maintenance configuration not found: ${id}`),
  exportNotCompleted: (id: string) =>
    new MaintenanceHttpError(409, 'ExportNotCompleted', `Export run is not COMPLETED: ${id}`),
  importNotReady: (id: string) =>
    new MaintenanceHttpError(409, 'ImportNotReady', `Import run is not PREVIEW_READY: ${id}`),
  importPreviewStale: () =>
    new MaintenanceHttpError(409, 'ImportPreviewStale', 'Import preview is stale; re-preview the file'),
  importAlreadyCompleted: (id: string) =>
    new MaintenanceHttpError(409, 'ImportAlreadyCompleted', `Import run is already completed (immutable): ${id}`),
  maintenanceOperationRunning: () =>
    new MaintenanceHttpError(409, 'MaintenanceOperationRunning', 'A maintenance operation is currently running'),
  resetInputStale: () =>
    new MaintenanceHttpError(409, 'InitializationResetInputStale', 'Reset preview is stale; re-preview'),
  resetCompleted: (id: string) =>
    new MaintenanceHttpError(409, 'InitializationResetCompleted', `Reset run is already completed (immutable): ${id}`),
  conflictingWorldOperation: () =>
    new MaintenanceHttpError(409, 'ConflictingWorldOperation', 'A world-mutating operation is currently running'),
  pendingRestoreExists: () =>
    new MaintenanceHttpError(409, 'PendingRestoreExists', 'A pending restore conflicts with this action'),
  exportNotReady: (message: string) =>
    new MaintenanceHttpError(422, 'ExportNotReady', message),
  importValidationFailed: (message: string, details?: unknown) =>
    new MaintenanceHttpError(422, 'ImportValidationFailed', message, details),
  importConflict: (message: string, details?: unknown) =>
    new MaintenanceHttpError(422, 'ImportConflict', message, details),
  databaseValidationFailed: (message: string) =>
    new MaintenanceHttpError(422, 'DatabaseValidationFailed', message),
  resetNotReady: (message: string, details?: unknown) =>
    new MaintenanceHttpError(422, 'InitializationResetNotReady', message, details),
  maintenancePathInvalid: (message: string) =>
    new MaintenanceHttpError(422, 'MaintenancePathInvalid', message),
  backupFailed: (message: string) =>
    new MaintenanceHttpError(503, 'BackupFailed', message),
  exportFailed: (message: string) =>
    new MaintenanceHttpError(500, 'ExportFailed', message),
  importFailed: (message: string) =>
    new MaintenanceHttpError(500, 'ImportFailed', message),
  resetFailed: (message: string) =>
    new MaintenanceHttpError(500, 'InitializationResetFailed', message),
};
