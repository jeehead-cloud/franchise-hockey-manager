import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { PrismaClient, DatabaseBackup } from '@prisma/client';
import {
  assertBackupTransition,
  reconcileBackupRecord,
  type BackupConfig,
  type BackupType,
  type ReasonCode,
} from '@fhm/engine';
import { prisma } from '../db/client.js';
import { backupErrors } from './backup-errors.js';
import {
  ensureBackupRoot,
  generateBackupFileName,
  isInsideRoot,
  relativeDisplayPath,
  resolveActiveDatabasePath,
  resolveBackupFile,
} from './backup-paths.js';
import {
  buildManifest,
  computeFileSha256,
  computeManifestSha256,
  manifestRelativePathFor,
  writeManifestFile,
} from './backup-manifest.js';
import {
  computeFingerprintFromDatabase,
  gatherFingerprintInput,
} from './backup-fingerprint.js';
import {
  hasMigrationTable,
  openReadOnlyDatabase,
  readAppliedMigrations,
  runIntegrityCheck,
  type BetterSQLite3Database,
} from '../sqlite-readonly.js';
import { getActiveBackupSnapshot } from './backup-config.js';
import { verifyBackup } from './backup-verification.js';

export interface CreateBackupInput {
  backupType: BackupType;
  reasonCode: ReasonCode;
  reasonText?: string;
  sourceOperationType?: string | null;
  sourceOperationId?: string | null;
  sourceEntityType?: string | null;
  sourceEntityId?: string | null;
  protected?: boolean;
  /**
   * When set, the snapshot must reference this active restore run id (used for
   * PRE_RESTORE backups). Passed through to the metadata; not enforced here.
   */
  requestedBy?: string;
}

export interface CreateBackupResult {
  backup: DatabaseBackup;
  reused: boolean;
}

/**
 * Centralized backup creation. The single entry point all F18–F31 operations
 * route through. Creates a CREATING metadata row, a SQLite-safe snapshot via
 * VACUUM INTO, computes file hash + fingerprint, writes the canonical
 * manifest, verifies the result, and marks VERIFIED. Operation continues only
 * after VERIFIED. On failure the backup is marked FAILED and any partial
 * file/manifest is removed; good backups are never pruned here.
 *
 * VACUUM INTO is SQLite's recommended online-backup mechanism: it produces a
 * transactionally-consistent copy of the source database without blocking
 * writers and without mutating the source. It is run on the shared Prisma
 * client (a live connection is required to initiate it), but it performs no
 * write against the source database file.
 */
export async function createDatabaseBackup(opts: CreateBackupInput): Promise<CreateBackupResult> {
  const snapshot = await getActiveBackupSnapshot(prisma);
  const config = snapshot.config;

  // Idempotency: reuse an existing VERIFIED backup for the same operation link.
  if (opts.sourceOperationType && opts.sourceOperationId) {
    const existing = await findReusableBackup(opts.sourceOperationType, opts.sourceOperationId, opts.reasonCode);
    if (existing) {
      return { backup: existing, reused: true };
    }
  }

  const { dbPath, fileName: activeDbFileName } = resolveActiveDatabasePath();
  if (!fs.existsSync(dbPath)) {
    throw backupErrors.backupFailed('Active database file not found');
  }
  const sourceSizeBefore = fs.statSync(dbPath).size;

  const root = ensureBackupRoot(config);
  const now = new Date();
  const timestamp = now.toISOString().replace(/[-:.]/g, '').slice(0, 15) + 'Z';

  // Create CREATING metadata row first.
  const creating = await prisma.databaseBackup.create({
    data: {
      status: 'CREATING',
      backupType: opts.backupType,
      reasonCode: opts.reasonCode,
      reasonText: opts.reasonText ?? '',
      sourceDatabasePathSnapshot: activeDbFileName,
      relativeFilePath: '__pending__',
      fileName: '__pending__',
      sourceOperationType: opts.sourceOperationType ?? null,
      sourceOperationId: opts.sourceOperationId ?? null,
      sourceEntityType: opts.sourceEntityType ?? null,
      sourceEntityId: opts.sourceEntityId ?? null,
      protected: computeInitialProtected(opts, config),
      protectionReason: computeInitialProtectionReason(opts, config),
      configVersionId: snapshot.version.id,
      configHash: snapshot.version.configHash,
      createdBy: opts.requestedBy ?? 'system',
      startedAt: now,
    },
  });

  // Collision-safe filename (retry on the rare hash collision).
  let fileName: string | null = null;
  let backupPath: string | null = null;
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const probeHash = createHash('sha256')
      .update(`${creating.id}-${attempt}-${now.toISOString()}`)
      .digest('hex')
      .slice(0, 8);
    const probe = generateBackupFileName(config, { timestamp, reason: opts.reasonCode, shortHash: probeHash });
    const probePath = path.join(root, probe);
    if (!fs.existsSync(probePath)) {
      fileName = probe;
      backupPath = probePath;
      break;
    }
  }
  if (!fileName || !backupPath) {
    await markFailed(prisma, creating.id, 'BackupFilenameCollision', 'Could not generate a collision-safe filename');
    throw backupErrors.backupFailed('Could not generate a collision-safe filename');
  }

  // SQLite-safe snapshot via VACUUM INTO (destination must not pre-exist).
  try {
    const escaped = backupPath.replace(/'/g, "''");
    await prisma.$executeRawUnsafe(`VACUUM INTO '${escaped}'`);
  } catch (e) {
    await markFailed(prisma, creating.id, 'VacuumFailed', e instanceof Error ? e.message : 'VACUUM INTO failed');
    throw backupErrors.backupFailed(e instanceof Error ? e.message : 'VACUUM INTO failed');
  }
  if (!fs.existsSync(backupPath)) {
    await markFailed(prisma, creating.id, 'VacuumNoFile', 'VACUUM INTO produced no file');
    throw backupErrors.backupFailed('VACUUM INTO produced no file');
  }

  const fileSize = fs.statSync(backupPath).size;
  const fileSha256 = computeFileSha256(backupPath);

  // Verify the backup bytes: open read-only, integrity_check + migrations.
  let migrationNames: string[] = [];
  let db: BetterSQLite3Database | null = null;
  let fingerprint: string;
  let fingerprintInput: ReturnType<typeof gatherFingerprintInput>;
  let currentWorldSeason: { id: string; label: string; startYear: number; endYear: number } | null;
  try {
    db = openReadOnlyDatabase(backupPath);
    if (!runIntegrityCheck(db)) {
      await safeRemove(backupPath);
      await markFailed(prisma, creating.id, 'IntegrityCheckFailed', 'PRAGMA integrity_check failed on the backup');
      throw backupErrors.integrityFailed();
    }
    if (!hasMigrationTable(db)) {
      await safeRemove(backupPath);
      await markFailed(prisma, creating.id, 'NoMigrationTable', 'Backup is missing the _prisma_migrations table');
      throw backupErrors.integrityFailed();
    }
    migrationNames = readAppliedMigrations(db);
    fingerprintInput = gatherFingerprintInput(db);
    fingerprint = computeFingerprintFromDatabase(db);
    currentWorldSeason = fingerprintInput.currentWorldSeason;
  } catch (e) {
    if (e instanceof Error && e.name === 'BackupIntegrityFailed') throw e;
    if (e instanceof Error && e.name === 'BackupFailed') throw e;
    await safeRemove(backupPath);
    await markFailed(prisma, creating.id, 'VerificationError', e instanceof Error ? e.message : 'Verification failed');
    throw backupErrors.integrityFailed();
  } finally {
    if (db) {
      try {
        db.close();
      } catch {
        /* ignore */
      }
    }
  }

  // Write canonical manifest.
  const manifest = buildManifest({
    backupId: creating.id,
    createdAt: now.toISOString(),
    backupType: opts.backupType,
    reasonCode: opts.reasonCode,
    sourceDatabaseFileName: activeDbFileName,
    sourceDatabaseSizeBytes: sourceSizeBefore,
    backupFileName: fileName,
    backupSizeBytes: fileSize,
    backupSha256: fileSha256,
    databaseFingerprint: fingerprint,
    fingerprintInput,
    migrationCount: migrationNames.length,
    latestMigrationName: migrationNames[migrationNames.length - 1] ?? null,
    configVersionId: snapshot.version.id,
    configHash: snapshot.version.configHash,
    sourceOperationType: opts.sourceOperationType ?? null,
    sourceOperationId: opts.sourceOperationId ?? null,
    currentWorldSeason,
  });
  const manifestFileName = fileName.replace(/\.sqlite$/, '.manifest.json');
  const manifestPath = path.join(root, manifestFileName);
  const manifestSha256 = writeManifestFile(manifestPath, manifest);

  const relativeFilePath = path.relative(root, backupPath);
  const manifestRelativePath = manifestRelativePathFor(relativeFilePath);
  if (!isInsideRoot(root, backupPath) || !isInsideRoot(root, manifestPath)) {
    await safeRemove(backupPath);
    await safeRemove(manifestPath);
    await markFailed(prisma, creating.id, 'PathEscape', 'Resolved backup path escaped the configured root');
    throw backupErrors.pathTraversal();
  }

  // Reconcile + mark VERIFIED.
  assertBackupTransition('CREATING', 'VERIFYING');
  const verifiedNow = new Date();
  const candidate: DatabaseBackup = {
    ...creating,
    status: 'VERIFIED',
    relativeFilePath,
    manifestRelativePath,
    fileName,
    fileSizeBytes: fileSize,
    fileSha256,
    manifestSha256,
    databaseFingerprint: fingerprint,
    schemaMigrationCount: migrationNames.length,
    latestMigrationName: migrationNames[migrationNames.length - 1] ?? null,
    worldSeasonIdSnapshot: currentWorldSeason?.id ?? null,
    currentWorldSeasonNameSnapshot: currentWorldSeason?.label ?? null,
    completedAt: verifiedNow,
    verifiedAt: verifiedNow,
    updatedAt: verifiedNow,
  };
  const recon = reconcileBackupRecord({ config, backup: toEngineRecord(candidate) });
  if (!recon.ok) {
    await safeRemove(backupPath);
    await safeRemove(manifestPath);
    await markFailed(prisma, creating.id, 'ReconciliationFailed', recon.issues.map((i) => i.message).join('; '));
    throw backupErrors.backupFailed(`Reconciliation failed: ${recon.issues.map((i) => i.message).join('; ')}`);
  }

  const updated = await prisma.databaseBackup.update({
    where: { id: creating.id },
    data: {
      status: 'VERIFIED',
      relativeFilePath,
      manifestRelativePath,
      fileName,
      fileSizeBytes: fileSize,
      fileSha256,
      manifestSha256,
      databaseFingerprint: fingerprint,
      schemaMigrationCount: migrationNames.length,
      latestMigrationName: migrationNames[migrationNames.length - 1] ?? null,
      worldSeasonIdSnapshot: currentWorldSeason?.id ?? null,
      currentWorldSeasonNameSnapshot: currentWorldSeason?.label ?? null,
      completedAt: verifiedNow,
      verifiedAt: verifiedNow,
    },
  });

  return { backup: updated, reused: false };
}

/**
 * Idempotency lookup: an existing VERIFIED backup for the same operation
 * type+id+reason. MISSING/CORRUPT/FAILED backups are NOT reused — a new one
 * is created instead. Reusing a VERIFIED backup avoids duplicating snapshots
 * on retry when the world already remained unchanged.
 */
export async function findReusableBackup(
  sourceOperationType: string,
  sourceOperationId: string,
  reasonCode: ReasonCode,
): Promise<DatabaseBackup | null> {
  const existing = await prisma.databaseBackup.findFirst({
    where: {
      sourceOperationType,
      sourceOperationId,
      reasonCode,
      status: 'VERIFIED',
    },
    orderBy: { createdAt: 'desc' },
  });
  return existing ?? null;
}

function computeInitialProtected(opts: CreateBackupInput, config: BackupConfig): boolean {
  if (opts.protected) return true;
  if (opts.backupType === 'PRE_RESTORE' && config.retention.protectPreRestoreBackups) return true;
  if (opts.backupType === 'MANUAL' && config.retention.protectManualBackups) return true;
  return false;
}

function computeInitialProtectionReason(opts: CreateBackupInput, config: BackupConfig): string | null {
  if (opts.backupType === 'PRE_RESTORE' && config.retention.protectPreRestoreBackups) {
    return 'Pre-restore backups are protected by policy';
  }
  if (opts.backupType === 'MANUAL' && config.retention.protectManualBackups) {
    return 'Manual backups are protected by default policy';
  }
  if (opts.protected) return 'Manually protected by Commissioner';
  return null;
}

async function markFailed(client: PrismaClient, id: string, code: string, message: string): Promise<void> {
  try {
    await client.databaseBackup.update({
      where: { id },
      data: { status: 'FAILED', failedAt: new Date(), failureCode: code, failureMessage: message },
    });
  } catch {
    /* ignore — best-effort failure recording */
  }
}

async function safeRemove(p: string): Promise<void> {
  try {
    await fs.promises.unlink(p);
  } catch {
    /* ignore */
  }
}

// Engine-record adapter (the engine's reconcileBackupRecord expects the
// domain-neutral BackupRecordInput shape; we adapt the Prisma row).
function toEngineRecord(row: DatabaseBackup) {
  return {
    id: row.id,
    status: row.status as never,
    backupType: row.backupType as never,
    reasonCode: row.reasonCode as never,
    sourceOperationType: row.sourceOperationType,
    sourceOperationId: row.sourceOperationId,
    sourceEntityType: row.sourceEntityType,
    sourceEntityId: row.sourceEntityId,
    protected: row.protected,
    protectionReason: row.protectionReason,
    fileSizeBytes: row.fileSizeBytes,
    fileSha256: row.fileSha256,
    manifestSha256: row.manifestSha256,
    databaseFingerprint: row.databaseFingerprint,
    schemaMigrationCount: row.schemaMigrationCount,
    latestMigrationName: row.latestMigrationName,
    worldSeasonIdSnapshot: row.worldSeasonIdSnapshot,
    currentWorldSeasonNameSnapshot: row.currentWorldSeasonNameSnapshot,
    verifiedAt: row.verifiedAt ? row.verifiedAt.toISOString() : null,
    createdAt: row.createdAt.toISOString(),
  };
}
