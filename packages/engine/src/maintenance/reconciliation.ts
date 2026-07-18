import type {
  ExportReconciliationResult,
  ExportRunStatus,
  ImportRunStatus,
  ReconciliationIssue,
  ResetRunStatus,
  ValidationRunStatus,
} from './types.js';

// ---------------------------------------------------------------------------
// Export run reconciliation
// ---------------------------------------------------------------------------

/**
 * Reconcile an export run before it is persisted as COMPLETED. Verifies a
 * COMPLETED export carries the file/artifact metadata it must have, and that
 * DELETED exports do not carry live artifacts. Pure — no Prisma, no I/O.
 */
export function reconcileExportRun(args: {
  status: ExportRunStatus;
  fileSha256: string | null;
  manifestSha256: string | null;
  rowCount: number | null;
  fileSizeBytes: number | null;
  outputRelativePath: string | null;
}): ExportReconciliationResult {
  const issues: ReconciliationIssue[] = [];
  if (args.status === 'COMPLETED') {
    if (args.fileSha256 == null) {
      issues.push({ code: 'completed.missingFileSha256', message: 'COMPLETED export must have a file SHA-256', severity: 'BLOCKER' });
    }
    if (args.manifestSha256 == null) {
      issues.push({ code: 'completed.missingManifestSha256', message: 'COMPLETED export must have a manifest SHA-256', severity: 'BLOCKER' });
    }
    if (args.outputRelativePath == null) {
      issues.push({ code: 'completed.missingOutputPath', message: 'COMPLETED export must have an output relative path', severity: 'BLOCKER' });
    }
    if (args.rowCount == null || args.rowCount < 0) {
      issues.push({ code: 'completed.invalidRowCount', message: 'COMPLETED export must have a non-negative row count', severity: 'BLOCKER' });
    }
    if (args.fileSizeBytes == null || args.fileSizeBytes <= 0) {
      issues.push({ code: 'completed.invalidSize', message: 'COMPLETED export must have a positive file size', severity: 'BLOCKER' });
    }
  }
  if (args.status === 'DELETED' && args.outputRelativePath != null) {
    issues.push({ code: 'deleted.hasOutputPath', message: 'DELETED export must not carry an output path', severity: 'WARNING' });
  }
  return { ok: issues.every((i) => i.severity !== 'BLOCKER'), issues };
}

// ---------------------------------------------------------------------------
// Status transition tables
// ---------------------------------------------------------------------------

const EXPORT_TRANSITIONS: Record<ExportRunStatus, readonly ExportRunStatus[]> = {
  PLANNED: ['RUNNING', 'FAILED'],
  RUNNING: ['COMPLETED', 'FAILED'],
  COMPLETED: ['DELETED'],
  FAILED: ['DELETED'],
  DELETED: [],
};

export function canTransitionExportStatus(from: ExportRunStatus, to: ExportRunStatus): boolean {
  return EXPORT_TRANSITIONS[from]?.includes(to) ?? false;
}

export function assertExportTransition(from: ExportRunStatus, to: ExportRunStatus): void {
  if (!canTransitionExportStatus(from, to)) {
    throw new Error(`Illegal export status transition ${from} -> ${to}`);
  }
}

const IMPORT_TRANSITIONS: Record<ImportRunStatus, readonly ImportRunStatus[]> = {
  UPLOADED: ['VALIDATING', 'CANCELLED', 'FAILED'],
  VALIDATING: ['PREVIEW_READY', 'FAILED'],
  PREVIEW_READY: ['APPLYING', 'CANCELLED', 'FAILED'],
  APPLYING: ['COMPLETED', 'FAILED'],
  COMPLETED: [],
  FAILED: [],
  CANCELLED: [],
};

export function canTransitionImportStatus(from: ImportRunStatus, to: ImportRunStatus): boolean {
  return IMPORT_TRANSITIONS[from]?.includes(to) ?? false;
}

export function assertImportTransition(from: ImportRunStatus, to: ImportRunStatus): void {
  if (!canTransitionImportStatus(from, to)) {
    throw new Error(`Illegal import status transition ${from} -> ${to}`);
  }
}

const VALIDATION_TRANSITIONS: Record<ValidationRunStatus, readonly ValidationRunStatus[]> = {
  RUNNING: ['COMPLETED', 'FAILED'],
  COMPLETED: [],
  FAILED: [],
};

export function canTransitionValidationStatus(from: ValidationRunStatus, to: ValidationRunStatus): boolean {
  return VALIDATION_TRANSITIONS[from]?.includes(to) ?? false;
}

export function assertValidationTransition(from: ValidationRunStatus, to: ValidationRunStatus): void {
  if (!canTransitionValidationStatus(from, to)) {
    throw new Error(`Illegal validation status transition ${from} -> ${to}`);
  }
}

const RESET_TRANSITIONS: Record<ResetRunStatus, readonly ResetRunStatus[]> = {
  PREPARED: ['RUNNING', 'CANCELLED', 'FAILED'],
  RUNNING: ['COMPLETED', 'FAILED'],
  COMPLETED: [],
  FAILED: [],
  CANCELLED: [],
};

export function canTransitionResetStatus(from: ResetRunStatus, to: ResetRunStatus): boolean {
  return RESET_TRANSITIONS[from]?.includes(to) ?? false;
}

export function assertResetTransition(from: ResetRunStatus, to: ResetRunStatus): void {
  if (!canTransitionResetStatus(from, to)) {
    throw new Error(`Illegal reset status transition ${from} -> ${to}`);
  }
}

/** Active (non-terminal) import statuses — used by stuck-run detection. */
export const ACTIVE_IMPORT_STATUSES: readonly ImportRunStatus[] = [
  'UPLOADED',
  'VALIDATING',
  'PREVIEW_READY',
  'APPLYING',
] as const;

export const ACTIVE_RESET_STATUSES: readonly ResetRunStatus[] = ['PREPARED', 'RUNNING'] as const;

export function isTerminalImportStatus(status: ImportRunStatus): boolean {
  return status === 'COMPLETED' || status === 'FAILED' || status === 'CANCELLED';
}

export function isTerminalResetStatus(status: ResetRunStatus): boolean {
  return status === 'COMPLETED' || status === 'FAILED' || status === 'CANCELLED';
}

export function isTerminalExportStatus(status: ExportRunStatus): boolean {
  return status === 'DELETED';
}

/**
 * Reset readiness classification. Pure — folds domain-neutral facts into
 * blockers (which prevent reset) and warnings (which the UI surfaces but do
 * not block). The server passes the preview input; the engine classifies.
 */
export function classifyResetReadiness(args: {
  mode: 'RESET_SETUP_STATE_ONLY' | 'RESET_WORLD_TO_EMPTY';
  appMetaInitialized: boolean;
  affectedCounts: ReadonlyArray<{ table: string; count: number }>;
  runningWorldOperation: boolean;
  pendingRestore: boolean;
  emptyWorldTables: boolean;
}): { blockers: ReconciliationIssue[]; warnings: ReconciliationIssue[] } {
  const blockers: ReconciliationIssue[] = [];
  const warnings: ReconciliationIssue[] = [];

  if (args.runningWorldOperation) {
    blockers.push({ code: 'reset.runningWorldOperation', message: 'A world-mutating operation is currently running', severity: 'BLOCKER' });
  }
  if (args.pendingRestore) {
    blockers.push({ code: 'reset.pendingRestore', message: 'A pending restore conflicts with reset', severity: 'BLOCKER' });
  }
  if (args.mode === 'RESET_SETUP_STATE_ONLY') {
    // Setup-state-only reset must not double-initialize on the next setup
    // attempt. Allow only when world tables are empty OR the world is
    // uninitialized (re-entering setup safely).
    if (args.appMetaInitialized && !args.emptyWorldTables) {
      blockers.push({
        code: 'reset.setupStateWorldNotEmpty',
        message: 'RESET_SETUP_STATE_ONLY is only allowed when world tables are empty (use RESET_WORLD_TO_EMPTY to delete world data)',
        severity: 'BLOCKER',
      });
    }
  }
  if (args.mode === 'RESET_WORLD_TO_EMPTY') {
    const total = args.affectedCounts.reduce((sum, r) => sum + r.count, 0);
    if (total === 0 && args.appMetaInitialized) {
      warnings.push({ code: 'reset.worldAlreadyEmpty', message: 'World appears already empty; reset will be a no-op on domain tables', severity: 'WARNING' });
    }
  }
  return { blockers, warnings };
}
