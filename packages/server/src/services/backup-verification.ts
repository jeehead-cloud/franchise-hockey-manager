import fs from 'node:fs';
import path from 'node:path';
import type { PrismaClient, DatabaseBackup } from '@prisma/client';
import {
  hasMigrationTable,
  openReadOnlyDatabase,
  readAppliedMigrations,
  runIntegrityCheck,
  type BetterSQLite3Database,
} from '../sqlite-readonly.js';
import { backupErrors } from './backup-errors.js';
import {
  computeFileSha256,
  computeManifestSha256,
  readManifestFile,
  type BackupManifest,
} from './backup-manifest.js';
import { computeFingerprintFromDatabase, gatherFingerprintInput } from './backup-fingerprint.js';
import { isInsideRoot, resolveBackupFile } from './backup-paths.js';

export type VerificationOutcome = 'VERIFIED' | 'MISSING' | 'CORRUPT' | 'FAILED';

export interface VerificationResult {
  outcome: VerificationOutcome;
  fileExists: boolean;
  fileHashMatches: boolean;
  manifestExists: boolean;
  manifestHashMatches: boolean;
  integrityOk: boolean;
  fingerprintRecomputes: boolean;
  fingerprintActual: string | null;
  migrationNames: string[];
  failureMessage: string | null;
}

/**
 * Verify a backup independently of its metadata row. Re-checks file existence,
 * file hash, manifest hash, integrity_check, migration table, and the database
 * fingerprint. Does NOT modify backup bytes.
 */
export async function verifyBackup(
  prisma: PrismaClient,
  backup: DatabaseBackup,
  backupRoot: string,
): Promise<VerificationResult> {
  const result: VerificationResult = {
    outcome: 'FAILED',
    fileExists: false,
    fileHashMatches: false,
    manifestExists: false,
    manifestHashMatches: false,
    integrityOk: false,
    fingerprintRecomputes: false,
    fingerprintActual: null,
    migrationNames: [],
    failureMessage: null,
  };

  const backupPath = resolveBackupFile(backupRoot, backup.relativeFilePath);
  if (!fs.existsSync(backupPath)) {
    return { ...result, outcome: 'MISSING', failureMessage: 'Backup file not found' };
  }
  result.fileExists = true;

  // File hash.
  const actualHash = computeFileSha256(backupPath);
  result.fileHashMatches = backup.fileSha256 == null ? false : actualHash === backup.fileSha256;
  if (!result.fileHashMatches) {
    return { ...result, outcome: 'CORRUPT', failureMessage: 'Backup file SHA-256 mismatch' };
  }

  // Manifest.
  let manifest: BackupManifest | null = null;
  if (backup.manifestRelativePath) {
    const manifestPath = resolveBackupFile(backupRoot, backup.manifestRelativePath);
    if (fs.existsSync(manifestPath)) {
      result.manifestExists = true;
      try {
        manifest = readManifestFile(manifestPath);
        const recomputed = computeManifestSha256(manifest);
        result.manifestHashMatches = backup.manifestSha256 == null ? false : recomputed === backup.manifestSha256;
      } catch {
        return { ...result, outcome: 'CORRUPT', failureMessage: 'Manifest invalid' };
      }
    }
  }
  if (!result.manifestExists) {
    return { ...result, outcome: 'CORRUPT', failureMessage: 'Manifest missing' };
  }
  if (!result.manifestHashMatches) {
    return { ...result, outcome: 'CORRUPT', failureMessage: 'Manifest SHA-256 mismatch' };
  }

  // Open read-only, run integrity_check + migrations + fingerprint.
  let db: BetterSQLite3Database | null = null;
  try {
    db = openReadOnlyDatabase(backupPath);
    result.integrityOk = runIntegrityCheck(db);
    if (!result.integrityOk) {
      return { ...result, outcome: 'CORRUPT', failureMessage: 'PRAGMA integrity_check failed' };
    }
    if (!hasMigrationTable(db)) {
      return { ...result, outcome: 'CORRUPT', failureMessage: 'Missing _prisma_migrations table' };
    }
    result.migrationNames = readAppliedMigrations(db);
    const input = gatherFingerprintInput(db);
    const actualFp = computeFingerprintFromDatabase(db);
    result.fingerprintActual = actualFp;
    result.fingerprintRecomputes =
      backup.databaseFingerprint != null && actualFp === backup.databaseFingerprint;
    if (!result.fingerprintRecomputes) {
      return { ...result, outcome: 'CORRUPT', failureMessage: 'Database fingerprint mismatch' };
    }
    return { ...result, outcome: 'VERIFIED', failureMessage: null };
  } catch (e) {
    return {
      ...result,
      outcome: 'CORRUPT',
      failureMessage: e instanceof Error ? e.message : 'Verification failed',
    };
  } finally {
    if (db) {
      try {
        db.close();
      } catch {
        /* ignore */
      }
    }
  }
}

/** Read the migration names from the ACTIVE database (for compatibility checks). */
export async function readActiveMigrations(): Promise<string[]> {
  // Open the active DB read-only via DATABASE_URL.
  const databaseUrl = process.env.DATABASE_URL ?? '';
  if (!databaseUrl.startsWith('file:')) {
    throw backupErrors.unsupportedBackend();
  }
  const raw = databaseUrl.slice('file:'.length);
  const dbPath = path.isAbsolute(raw) ? raw : path.resolve(process.cwd(), raw);
  let db: BetterSQLite3Database | null = null;
  try {
    db = openReadOnlyDatabase(dbPath);
    return readAppliedMigrations(db);
  } finally {
    if (db) {
      try {
        db.close();
      } catch {
        /* ignore */
      }
    }
  }
}

/** Confirm `candidatePath` resolves inside `root` (used by storage scan). */
export function assertPathInsideRoot(root: string, candidatePath: string): boolean {
  return isInsideRoot(root, candidatePath);
}
