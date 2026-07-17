import type {
  BackupConfig,
  BackupReconciliationResult,
  BackupRecordInput,
  ReconciliationIssue,
  RestoreStatus,
} from './types.js';

/**
 * Reconcile a backup record against policy before it is persisted/returned.
 * The server passes the candidate fields; the engine flags any invariant
 * violation. Pure — no Prisma, no I/O.
 */
export function reconcileBackupRecord(args: {
  config: BackupConfig;
  backup: BackupRecordInput;
}): BackupReconciliationResult {
  const issues: ReconciliationIssue[] = [];
  const { config, backup } = args;

  // A VERIFIED backup must carry a file hash, manifest hash, fingerprint, and
  // non-null size. CREATING/CREATED/VERIFYING may be in progress.
  if (backup.status === 'VERIFIED') {
    if (backup.fileSha256 == null) {
      issues.push({ code: 'verified.missingFileSha256', message: 'VERIFIED backup must have a file SHA-256', severity: 'BLOCKER' });
    }
    if (config.creation.includeManifest && backup.manifestSha256 == null) {
      issues.push({ code: 'verified.missingManifestSha256', message: 'VERIFIED backup must have a manifest SHA-256', severity: 'BLOCKER' });
    }
    if (backup.databaseFingerprint == null) {
      issues.push({ code: 'verified.missingFingerprint', message: 'VERIFIED backup must have a database fingerprint', severity: 'BLOCKER' });
    }
    if (backup.fileSizeBytes == null || backup.fileSizeBytes <= 0) {
      issues.push({ code: 'verified.missingSize', message: 'VERIFIED backup must have a positive size', severity: 'BLOCKER' });
    }
  }

  // FAILED/MISSING/CORRUPT backups must never be presented as restorable.
  if (
    (backup.status === 'FAILED' || backup.status === 'MISSING' || backup.status === 'CORRUPT') &&
    backup.verifiedAt != null
  ) {
    issues.push({ code: 'failed.hasVerifiedAt', message: `${backup.status} backup must not carry a verifiedAt timestamp`, severity: 'WARNING' });
  }

  // PRE_RESTORE backups are protected by policy.
  if (
    backup.backupType === 'PRE_RESTORE' &&
    config.retention.protectPreRestoreBackups &&
    !backup.protected
  ) {
    issues.push({ code: 'preRestore.unprotected', message: 'PRE_RESTORE backup must be protected', severity: 'BLOCKER' });
  }

  // Manual backups protected by default policy.
  if (
    backup.backupType === 'MANUAL' &&
    config.retention.protectManualBackups &&
    !backup.protected
  ) {
    issues.push({ code: 'manual.unprotected', message: 'MANUAL backup must be protected under default policy', severity: 'WARNING' });
  }

  return { ok: issues.every((i) => i.severity !== 'BLOCKER'), issues };
}

// ---------------------------------------------------------------------------
// Status transitions
// ---------------------------------------------------------------------------

/**
 * Backup status transition table. The server consults this before mutating a
 * DatabaseBackup row. Illegal transitions throw; the server maps to 409.
 */
const BACKUP_TRANSITIONS: Record<string, readonly string[]> = {
  CREATING: ['CREATED', 'VERIFYING', 'FAILED'],
  CREATED: ['VERIFYING', 'FAILED'],
  VERIFYING: ['VERIFIED', 'FAILED', 'CORRUPT'],
  VERIFIED: ['MISSING', 'CORRUPT', 'DELETED'],
  FAILED: ['MISSING', 'DELETED'],
  MISSING: ['DELETED', 'CORRUPT'],
  CORRUPT: ['MISSING', 'DELETED'],
  DELETED: [],
};

export function canTransitionBackupStatus(from: string, to: string): boolean {
  const allowed = BACKUP_TRANSITIONS[from];
  return allowed ? allowed.includes(to) : false;
}

export function assertBackupTransition(from: string, to: string): void {
  if (!canTransitionBackupStatus(from, to)) {
    throw new Error(`Illegal backup status transition ${from} -> ${to}`);
  }
}

// ---------------------------------------------------------------------------
// Restore status transitions
// ---------------------------------------------------------------------------

const RESTORE_TRANSITIONS: Record<RestoreStatus, readonly RestoreStatus[]> = {
  PREPARED: ['WAITING_FOR_RESTART', 'RUNNING', 'CANCELLED', 'FAILED'],
  WAITING_FOR_RESTART: ['RUNNING', 'CANCELLED', 'FAILED'],
  RUNNING: ['VERIFYING', 'FAILED'],
  VERIFYING: ['COMPLETED', 'FAILED'],
  COMPLETED: [],
  FAILED: [],
  CANCELLED: [],
};

export function canTransitionRestoreStatus(from: RestoreStatus, to: RestoreStatus): boolean {
  const allowed = RESTORE_TRANSITIONS[from];
  return allowed ? allowed.includes(to) : false;
}

export function assertRestoreTransition(from: RestoreStatus, to: RestoreStatus): void {
  if (!canTransitionRestoreStatus(from, to)) {
    throw new Error(`Illegal restore status transition ${from} -> ${to}`);
  }
}

/** A restore may be cancelled only before replacement begins. */
export function canCancelRestore(status: RestoreStatus): boolean {
  return status === 'PREPARED' || status === 'WAITING_FOR_RESTART';
}

/** Terminal restore statuses are immutable. */
export function isTerminalRestoreStatus(status: RestoreStatus): boolean {
  return status === 'COMPLETED' || status === 'FAILED' || status === 'CANCELLED';
}

/** Active (non-terminal) restore statuses. */
export const ACTIVE_RESTORE_STATUSES: readonly RestoreStatus[] = [
  'PREPARED',
  'WAITING_FOR_RESTART',
  'RUNNING',
  'VERIFYING',
] as const;
