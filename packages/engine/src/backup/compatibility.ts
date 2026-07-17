import type {
  BackupConfig,
  BackupRecordInput,
  CompatibilityCheck,
  CompatibilityResult,
  CompatibilitySeverity,
} from './types.js';

/**
 * F32 compatibility facts gathered by the server and folded by the engine
 * into a single restore-compatibility result.
 */
export interface CompatibilityInput {
  backup: BackupRecordInput;
  /** Does the backup file currently exist on disk? */
  fileExists: boolean;
  /** Did the recomputed file hash match the stored hash? */
  fileHashMatches: boolean;
  /** Did the recomputed manifest hash match the stored manifest hash? */
  manifestHashMatches: boolean;
  /** Did PRAGMA integrity_check return 'ok'? */
  integrityOk: boolean;
  /** Migration names present in the BACKUP (in applied order). */
  backupMigrationNames: string[];
  /** Migration names present in the ACTIVE database (in applied order). */
  activeMigrationNames: string[];
  /** Backend of the active database ('sqlite' | other). */
  activeBackend: string;
  /** Is the backup path resolved inside the configured backup root? */
  pathInsideRoot: boolean;
  /** Is the backup file the same path as the active database file? */
  sourceEqualsActive: boolean;
  /** Is another restore run currently active? */
  anotherRestoreActive: boolean;
}

/**
 * Aggregate compatibility checks. A BLOCKER makes the restore incompatible.
 * The recommended F32 policy permits restoring an older DB then running
 * pending additive migrations forward — so a backup with FEWER migrations
 * than the active schema is compatible (forward-migratable), while a backup
 * with migrations NOT present in the active chain is a BLOCKER (the current
 * code cannot read it). Destructive/backward schema restore is not allowed.
 */
export function aggregateCompatibility(args: CompatibilityInput): CompatibilityResult {
  const checks: CompatibilityCheck[] = [];

  checks.push(severityCheck('backup.status', 'BACKER', args.backup.status, 'VERIFIED', 'Backup is not VERIFIED'));

  if (!args.fileExists) {
    checks.push({ code: 'backup.fileMissing', severity: 'BLOCKER', message: 'Backup file is missing' });
  }
  if (args.fileExists && !args.fileHashMatches) {
    checks.push({ code: 'backup.fileHashMismatch', severity: 'BLOCKER', message: 'Backup file hash mismatch' });
  }
  if (!args.manifestHashMatches) {
    checks.push({ code: 'backup.manifestHashMismatch', severity: 'BLOCKER', message: 'Manifest hash mismatch' });
  }
  if (!args.integrityOk) {
    checks.push({ code: 'backup.integrityFailed', severity: 'BLOCKER', message: 'SQLite integrity_check failed' });
  }
  if (args.activeBackend !== 'sqlite') {
    checks.push({ code: 'backup.backendMismatch', severity: 'BLOCKER', message: 'Active database backend is not SQLite' });
  }
  if (!args.pathInsideRoot) {
    checks.push({ code: 'backup.pathOutsideRoot', severity: 'BLOCKER', message: 'Backup path is outside the configured backup directory' });
  }
  if (args.sourceEqualsActive) {
    checks.push({ code: 'backup.sourceEqualsActive', severity: 'BLOCKER', message: 'Backup source equals the active database file' });
  }
  if (args.anotherRestoreActive) {
    checks.push({ code: 'restore.alreadyActive', severity: 'BLOCKER', message: 'Another restore run is already active' });
  }

  // Migration compatibility: every migration in the backup MUST exist in the
  // active chain (forward-migratable). Extra migrations in the backup that
  // the active chain does not know about = BLOCKER.
  const activeSet = new Set(args.activeMigrationNames);
  const unknown = args.backupMigrationNames.filter((m) => !activeSet.has(m));
  if (unknown.length > 0) {
    checks.push({
      code: 'backup.migrationUnknown',
      severity: 'BLOCKER',
      message: `Backup contains ${unknown.length} migration(s) not present in the active schema chain`,
    });
  }
  if (args.backupMigrationNames.length < args.activeMigrationNames.length) {
    checks.push({
      code: 'backup.migrationOlder',
      severity: 'WARNING',
      message: `Backup is older than the active schema; ${args.activeMigrationNames.length - args.backupMigrationNames.length} pending additive migration(s) will run after restore`,
    });
  }

  const compatible = checks.every((c) => c.severity !== 'BLOCKER');
  const severity: CompatibilitySeverity = checks.some((c) => c.severity === 'BLOCKER')
    ? 'BLOCKER'
    : checks.some((c) => c.severity === 'WARNING')
      ? 'WARNING'
      : 'OK';
  return { severity, compatible, checks };
}

function severityCheck(
  code: string,
  _kind: string,
  actual: string,
  expected: string,
  message: string,
): CompatibilityCheck {
  return actual === expected
    ? { code, severity: 'OK', message: `${code} OK` }
    : { code, severity: 'BLOCKER', message };
}
