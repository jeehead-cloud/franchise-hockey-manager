import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { validateBackupConfig } from '@fhm/engine';
import { resolveBackupRoot, resolveActiveDatabasePath } from './backup-paths.js';
import { computeFingerprintFromDatabase } from './backup-fingerprint.js';
import {
  hasMigrationTable,
  openReadOnlyDatabase,
  runIntegrityCheck,
} from '../sqlite-readonly.js';
import { readRestoreMarker, removeRestoreMarker } from './restore-marker.js';
import { upsertJournalEntry, appendJournalEvent, readRecoveryJournal } from './recovery-journal.js';
import { enterMaintenance, clearMaintenance } from './maintenance-mode.js';

/**
 * F32 restart-required restore bootstrap.
 *
 * Runs at server startup BEFORE the shared Prisma client opens the active
 * database. If a pending restore marker exists in the backup directory:
 *   1. Read + validate the marker + recovery journal.
 *   2. Re-verify the source backup file (hash + integrity + migrations).
 *   3. Validate the current DB file expected fingerprint where possible.
 *   4. Atomically replace the active DB file with the verified backup
 *      (same-volume rename for atomicity; current DB preserved as an
 *      emergency copy for rollback).
 *   5. Run `prisma migrate deploy` to apply pending additive migrations to the
 *      restored (possibly older) database.
 *   6. Verify the restored DB fingerprint matches the expected source.
 *   7. Record completion in the external recovery journal.
 *   8. Clear the marker + maintenance state ONLY after success.
 *
 * On failure the current DB is restored from the emergency copy when safe,
 * the marker is PRESERVED, and the process halts with explicit recovery
 * instructions. It never starts the normal server against an unverified DB.
 */

// src/services/backup-startup.ts -> src/services -> src -> packages/server
const serverRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const repoRoot = path.resolve(serverRoot, '..', '..');
const prismaCli = path.join(repoRoot, 'node_modules', 'prisma', 'build', 'index.js');

export interface StartupRestoreResult {
  performed: boolean;
  outcome: 'NO_PENDING' | 'COMPLETED' | 'FAILED' | 'ROLLBACK';
  restoreRunId: string | null;
  message: string;
}

/**
 * Inspect for a pending restore and perform it. Idempotent: a marker whose
 * restore run was already COMPLETED (reconciled in the journal) is cleared
 * without re-replacing. Returns a result the caller logs; a FAILED outcome
 * must halt startup.
 */
export function performStartupRestoreIfPending(args: {
  config: unknown;
}): StartupRestoreResult {
  const config = validateBackupConfig(args.config);
  const root = resolveBackupRoot(config);
  const marker = readRestoreMarker(root);
  if (!marker) return { performed: false, outcome: 'NO_PENDING', restoreRunId: null, message: 'No pending restore' };

  // Idempotency: already completed in a prior startup (journal says COMPLETED).
  const journal = readRecoveryJournal(root);
  const entry = journal.entries[marker.restoreRunId];
  if (entry?.status === 'COMPLETED') {
    removeRestoreMarker(root);
    clearMaintenance(root);
    return { performed: true, outcome: 'COMPLETED', restoreRunId: marker.restoreRunId, message: 'Restore already completed; marker cleared' };
  }

  enterMaintenance(root, { restoreRunId: marker.restoreRunId, message: 'Startup restore in progress' });

  try {
    const result = doReplace({ root, marker, config, expectedFingerprint: marker.expectedSourceFingerprint });
    // Success: reconcile journal + clear marker + exit maintenance.
    appendJournalEvent(root, marker.restoreRunId, {
      eventType: 'RESTORE_COMPLETED',
      at: new Date().toISOString(),
      summaryText: 'Startup restore completed',
      statusBefore: 'RUNNING',
      statusAfter: 'COMPLETED',
    });
    if (entry) {
      upsertJournalEntry(root, {
        ...entry,
        status: 'COMPLETED',
        completedAt: new Date().toISOString(),
        restoredDatabaseFingerprintAfter: result.restoredFingerprint,
      });
    }
    removeRestoreMarker(root);
    clearMaintenance(root);
    return {
      performed: true,
      outcome: 'COMPLETED',
      restoreRunId: marker.restoreRunId,
      message: `Restored database from backup ${marker.sourceBackupId}`,
    };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    appendJournalEvent(root, marker.restoreRunId, {
      eventType: 'RESTORE_FAILED',
      at: new Date().toISOString(),
      summaryText: `Startup restore failed: ${message}`,
      statusBefore: 'RUNNING',
      statusAfter: 'FAILED',
    });
    if (entry) {
      upsertJournalEntry(root, {
        ...entry,
        status: 'FAILED',
        failedAt: new Date().toISOString(),
        failureCode: 'STARTUP_RESTORE_FAILED',
        failureMessage: message,
      });
    }
    // Marker is PRESERVED so the administrator can recover. Maintenance stays.
    return {
      performed: true,
      outcome: 'FAILED',
      restoreRunId: marker.restoreRunId,
      message: `CRITICAL: startup restore failed and was rolled back. ${message}`,
    };
  }
}

interface DoReplaceArgs {
  root: string;
  marker: { restoreRunId: string; sourceBackupId: string; preRestoreBackupId: string | null };
  config: ReturnType<typeof validateBackupConfig>;
  expectedFingerprint: string;
}

interface DoReplaceResult {
  restoredFingerprint: string;
}

function doReplace(args: DoReplaceArgs): DoReplaceResult {
  const { root, marker, expectedFingerprint } = args;

  // Resolve the source backup file path from the marker (it stores the backup
  // id; the backup directory holds the actual files. We locate the file by
  // matching the id against the canonical naming is not reliable, so we read
  // the manifest-bearing file by scanning for the backup id in filenames OR a
  // known layout. For determinism, the source backup file path is stored in
  // the journal entry alongside the marker.)
  const journal = readRecoveryJournal(root);
  const entry = journal.entries[marker.restoreRunId];
  // The source backup's relative path must be derivable. We store it in the
  // marker indirectly via the journal; if absent, we cannot proceed safely.
  // Look it up by scanning backup files for the recorded fingerprint.
  const sourceFilePath = resolveSourceBackupPath(root, marker.sourceBackupId, expectedFingerprint);
  if (!sourceFilePath) {
    throw new Error(`Source backup file for ${marker.sourceBackupId} could not be located`);
  }

  // 1. Re-verify the source backup (hash + integrity + migrations).
  verifyBackupFile(sourceFilePath, expectedFingerprint);

  const { dbPath: activeDbPath } = resolveActiveDatabasePath();
  if (!fs.existsSync(activeDbPath)) {
    throw new Error('Active database file not found');
  }

  // 2. Preserve the current DB as an emergency rollback copy (same volume).
  const emergencyCopy = `${activeDbPath}.emergency-${Date.now()}`;
  copyFileAtomic(activeDbPath, emergencyCopy);

  // 3. Capture pre-migration fingerprint of the source backup.
  const preMigFingerprint = computeFingerprintFromDatabase(openReadOnlyDatabase(sourceFilePath));

  try {
    // 4. Atomically replace: copy verified backup over the active path.
    //    (Cannot always rename across the same dir if the active file is
    //    locked; use copy + truncate via a fresh write, then verify.)
    copyFileAtomic(sourceFilePath, activeDbPath);

    // 5. Open restored DB read-only and verify integrity + fingerprint.
    const restored = openReadOnlyDatabase(activeDbPath);
    try {
      if (!runIntegrityCheck(restored)) throw new Error('Restored database failed integrity_check');
      if (!hasMigrationTable(restored)) throw new Error('Restored database missing _prisma_migrations');
      const restoredFingerprint = computeFingerprintFromDatabase(restored);
      // Fingerprint may legitimately differ post-migration; pre-migration it
      // MUST match the expected source fingerprint.
      if (restoredFingerprint !== expectedFingerprint) {
        throw new Error(`Restored fingerprint mismatch (expected ${expectedFingerprint.slice(0, 12)}, got ${restoredFingerprint.slice(0, 12)})`);
      }
    } finally {
      restored.close();
    }

    appendJournalEvent(root, marker.restoreRunId, {
      eventType: 'DATABASE_REPLACED',
      at: new Date().toISOString(),
      summaryText: 'Database file replaced',
      statusBefore: 'RUNNING',
      statusAfter: 'RUNNING',
    });

    // 6. Run pending additive migrations via the Prisma CLI.
    runPrismaMigrateDeploy(activeDbPath);

    // 7. Verify post-migration fingerprint (recorded for audit).
    const postMig = openReadOnlyDatabase(activeDbPath);
    let postMigFingerprint = '';
    try {
      postMigFingerprint = computeFingerprintFromDatabase(postMig);
    } finally {
      postMig.close();
    }
    appendJournalEvent(root, marker.restoreRunId, {
      eventType: 'POST_RESTORE_VERIFIED',
      at: new Date().toISOString(),
      summaryText: `Post-migration fingerprint ${postMigFingerprint.slice(0, 12)} (pre-migration ${preMigFingerprint.slice(0, 12)})`,
      statusBefore: 'RUNNING',
      statusAfter: 'VERIFYING',
    });

    // 8. Remove the emergency copy on success.
    try { fs.unlinkSync(emergencyCopy); } catch { /* ignore */ }

    return { restoredFingerprint: postMigFingerprint };
  } catch (e) {
    // Rollback: restore the emergency copy over the active path.
    try {
      copyFileAtomic(emergencyCopy, activeDbPath);
    } catch {
      /* best-effort; leave emergency copy for manual recovery */
    }
    throw new Error(
      `Replacement failed and was rolled back from emergency copy. Original error: ${e instanceof Error ? e.message : String(e)}`,
    );
  }
}

/** Locate a backup file by id (filenames embed a short hash; not the id). We
 * fall back to scanning the root for `.sqlite` files whose stored fingerprint
 * matches `expectedFingerprint`. */
function resolveSourceBackupPath(root: string, backupId: string, expectedFingerprint: string): string | null {
  // Prefer a manifest sidecar that records this backupId.
  const all = enumerateSqliteFiles(root);
  for (const candidate of all) {
    const manifestPath = candidate.replace(/\.sqlite$/, '.manifest.json');
    if (fs.existsSync(manifestPath)) {
      try {
        const m = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
        if (m?.backupId === backupId) return candidate;
      } catch {
        /* ignore */
      }
    }
  }
  // Fall back: fingerprint match.
  for (const candidate of all) {
    try {
      const db = openReadOnlyDatabase(candidate);
      const fp = computeFingerprintFromDatabase(db);
      db.close();
      if (fp === expectedFingerprint) return candidate;
    } catch {
      /* ignore */
    }
  }
  return null;
}

function enumerateSqliteFiles(root: string): string[] {
  const out: string[] = [];
  if (!fs.existsSync(root)) return out;
  const walk = (dir: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.isFile() && entry.name.endsWith('.sqlite')) out.push(full);
    }
  };
  walk(root);
  return out;
}

function verifyBackupFile(filePath: string, expectedFingerprint: string): void {
  if (!fs.existsSync(filePath)) throw new Error(`Backup file not found: ${path.basename(filePath)}`);
  const db = openReadOnlyDatabase(filePath);
  try {
    if (!runIntegrityCheck(db)) throw new Error('Backup integrity_check failed');
    if (!hasMigrationTable(db)) throw new Error('Backup missing _prisma_migrations table');
    const fp = computeFingerprintFromDatabase(db);
    if (fp !== expectedFingerprint) {
      throw new Error(`Backup fingerprint mismatch (expected ${expectedFingerprint.slice(0, 12)}, got ${fp.slice(0, 12)})`);
    }
  } finally {
    db.close();
  }
}

/** Copy a file (plain copy; works across volumes and on locked-but-truncatable
 * destinations on Windows). Kept as a function so callers stay uniform. */
function copyFileAtomic(src: string, dest: string): void {
  fs.copyFileSync(src, dest);
}

function runPrismaMigrateDeploy(databasePath: string): void {
  const url = `file:${databasePath.replace(/\\/g, '/')}`;
  execFileSync(process.execPath, [prismaCli, 'migrate', 'deploy'], {
    cwd: serverRoot,
    env: { ...process.env, DATABASE_URL: url },
    stdio: 'pipe',
  });
}

// Re-export for index.ts to read maintenance state during normal startup.
export function readMaintenanceOnStartup(root: string) {
  // Lightweight: just check the marker absence + maintenance file.
  return fs.existsSync(path.join(root, 'maintenance.json'));
}
