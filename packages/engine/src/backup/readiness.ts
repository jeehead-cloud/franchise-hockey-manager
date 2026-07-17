import type {
  BackupConfig,
  CompatibilityResult,
  RestoreReadinessCheck,
  RestoreReadinessResult,
} from './types.js';

/**
 * Restore-readiness input. The server supplies the gathered facts; the engine
 * classifies them into BLOCKER / WARNING / OK and produces a single `ready`
 * verdict for the restore-prepare step.
 */
export interface RestoreReadinessInput {
  config: BackupConfig;
  compatibility: CompatibilityResult;
  /** A pre-restore backup will be (or has been) created. */
  preRestoreBackupCreated: boolean;
  /** A conflicting world-mutating operation is RUNNING. */
  conflictingWorldOperationRunning: boolean;
  /** The active database fingerprint matches the client's expectation. */
  currentFingerprintMatchesExpectation: boolean;
  /** The backup fingerprint recomputes from the backup file. */
  backupFingerprintRecomputes: boolean;
}

/**
 * Aggregate restore readiness from domain-neutral inputs. `ready` is true only
 * when there are no BLOCKER checks. WARNINGs are surfaced to the UI but do not
 * block.
 */
export function aggregateRestoreReadiness(args: RestoreReadinessInput): RestoreReadinessResult {
  const checks: RestoreReadinessCheck[] = [];

  for (const c of args.compatibility.checks) {
    checks.push({ code: `compat.${c.code}`, severity: c.severity, message: c.message });
  }

  if (args.config.restore.requirePreRestoreBackup && !args.preRestoreBackupCreated) {
    checks.push({ code: 'restore.preRestoreBackupRequired', severity: 'BLOCKER', message: 'A pre-restore backup is required before restore' });
  } else {
    checks.push({ code: 'restore.preRestoreBackupRequired', severity: 'OK', message: 'Pre-restore backup satisfied' });
  }

  if (args.conflictingWorldOperationRunning) {
    checks.push({ code: 'restore.conflictingWorldOperation', severity: 'BLOCKER', message: 'A world-mutating operation is currently running' });
  }

  if (!args.currentFingerprintMatchesExpectation) {
    checks.push({ code: 'restore.currentFingerprintStale', severity: 'BLOCKER', message: 'Current database fingerprint does not match the expected value' });
  }

  if (!args.backupFingerprintRecomputes) {
    checks.push({ code: 'restore.backupFingerprintMismatch', severity: 'BLOCKER', message: 'Backup fingerprint could not be recomputed from the backup file' });
  }

  if (args.config.restore.requireRestart) {
    checks.push({ code: 'restore.restartRequired', severity: 'WARNING', message: 'Restore requires a controlled server restart' });
  }

  const ready = checks.every((c) => c.severity !== 'BLOCKER');
  return { ready, checks };
}
