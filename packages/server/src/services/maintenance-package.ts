import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import archiver from 'archiver';
import { prisma } from '../db/client.js';
import { maintenanceErrors } from './maintenance-errors.js';
import { ensureExportRoot, generateExportFileName, resolveExportFile, safeRemove } from './maintenance-paths.js';
import { getActiveMaintenanceSnapshot, hashMaintenanceConfigDb } from './maintenance-config.js';
import { appendMaintenanceEvent } from './maintenance-history.js';
import { createDatabaseBackup } from './backup-creation.js';
import { resolveBackupFile } from './backup-paths.js';
import { readManifestFile } from './backup-manifest.js';
import {
  gatherFingerprintInput,
  computeFingerprintFromDatabase,
} from './backup-fingerprint.js';
import { openReadOnlyDatabase, runIntegrityCheck, readAppliedMigrations } from '../sqlite-readonly.js';
import { resolveActiveDatabasePath } from './maintenance-paths.js';

export interface FullDatabasePackageResult {
  runId: string;
  backupId: string;
  fileSizeBytes: number;
  fileSha256: string;
  manifestSha256: string;
  outputRelativePath: string;
  databaseFingerprint: string;
}

/**
 * Generate a full-database export package. Invokes the centralized F32 backup
 * service (requires a VERIFIED SQLite snapshot), then packages that backup
 * plus its manifest plus an FHM export manifest into a real `.zip`. The
 * package is a *portability* artifact — restoring it into a live database is
 * NOT performed here; restore remains an F32 workflow.
 */
export async function generateFullDatabasePackage(args: {
  reason: string;
  requestedBy?: string;
}): Promise<FullDatabasePackageResult> {
  const snapshot = await getActiveMaintenanceSnapshot(prisma);

  // 1. Centralized F32 backup (VACUUM INTO → verify → fingerprint).
  const backup = await createDatabaseBackup({
    backupType: 'MANUAL',
    reasonCode: 'OTHER',
    reasonText: `F33 full database package: ${args.reason}`,
    sourceOperationType: 'MAINTENANCE_EXPORT',
    sourceOperationId: 'full-database-package',
    protected: true,
    requestedBy: args.requestedBy,
  }).catch((e) => {
    throw maintenanceErrors.backupFailed(e instanceof Error ? e.message : 'Backup creation failed');
  });
  const verifiedBackup = backup.backup;
  if (verifiedBackup.status !== 'VERIFIED' || !verifiedBackup.relativeFilePath) {
    throw maintenanceErrors.backupFailed('Backup did not reach VERIFIED state');
  }

  // 2. Locate the F32 backup file + its manifest using the F32 root.
  const { getActiveBackupSnapshot } = await import('./backup-config.js');
  const { ensureBackupRoot } = await import('./backup-paths.js');
  const backupSnapshot = await getActiveBackupSnapshot(prisma);
  const backupRoot = ensureBackupRoot(backupSnapshot.config);
  const backupFileAbs = resolveBackupFile(backupRoot, verifiedBackup.relativeFilePath);
  if (!fs.existsSync(backupFileAbs)) {
    throw maintenanceErrors.backupFailed('Verified backup file is missing');
  }
  const backupManifest = verifiedBackup.manifestRelativePath
    ? readManifestFile(resolveBackupFile(backupRoot, verifiedBackup.manifestRelativePath))
    : null;

  // 3. Gather app/data schema + migration list from a read-only connection.
  const { dbPath } = resolveActiveDatabasePath();
  const db = openReadOnlyDatabase(dbPath);
  const integrityOk = runIntegrityCheck(db);
  const migrations = readAppliedMigrations(db);
  const fingerprint = computeFingerprintFromDatabase(db);
  if (!integrityOk) {
    throw maintenanceErrors.backupFailed('Source database failed integrity_check; refusing to package');
  }

  // 4. Bounded world summary (counts only — never hidden truth).
  const [players, teams, leagues, competitions, archives, seasons] = await Promise.all([
    prisma.player.count(),
    prisma.team.count(),
    prisma.league.count(),
    prisma.competition.count(),
    prisma.competitionArchive.count(),
    prisma.worldSeason.count(),
  ]);
  const worldSummary = { players, teams, leagues, competitions, archives, seasons };

  // 5. Create the export run row (PLANNED → RUNNING → COMPLETED).
  const run = await prisma.maintenanceExportRun.create({
    data: {
      exportType: 'FULL_DATABASE_PACKAGE',
      status: 'RUNNING',
      format: 'ZIP',
      scopeText: 'full-database-package',
      filterText: '',
      privacyLevel: 'COMMISSIONER_TRUTH',
      configVersionId: snapshot.version.id,
      configHash: snapshot.version.configHash,
      schemaVersion: 1,
      inputHash: verifiedBackup.fileSha256 ?? '',
      requestedBy: args.requestedBy ?? 'system',
      reason: args.reason,
    },
  });

  const root = ensureExportRoot(snapshot.config);
  const timestamp = new Date().toISOString().replace(/[-:.]/g, '').slice(0, 15) + 'Z';
  const fileName = generateExportFileName({
    exportType: 'FULL_DATABASE_PACKAGE',
    timestamp,
    shortHash: (verifiedBackup.fileSha256 ?? fingerprint).slice(0, 8),
    extension: '.zip',
  });
  const outputRelative = fileName;
  const outputPath = resolveExportFile(root, outputRelative);

  try {
    // 6. Build the zip. Append the F32 SQLite file, its manifest, an FHM
    //    export manifest, a migration list, checksums, a bounded world
    //    summary, and a README explaining the package's portability boundary.
    await new Promise<void>((resolve, reject) => {
      const output = fs.createWriteStream(outputPath);
      const archive = archiver('zip', { zlib: { level: 6 } });
      output.on('close', () => resolve());
      output.on('error', reject);
      archive.on('error', reject);
      archive.pipe(output);
      archive.file(backupFileAbs, { name: 'database.sqlite' });
      if (backupManifest) {
        archive.append(JSON.stringify(backupManifest, null, 2), { name: 'f32-backup.manifest.json' });
      }
      const fhmManifest = {
        format: 'fhm-full-database-package',
        schemaVersion: 1,
        exportType: 'FULL_DATABASE_PACKAGE',
        privacyLevel: 'COMMISSIONER_TRUTH',
        configuration: {
          versionId: snapshot.version.id,
          configHash: snapshot.version.configHash,
          maintenanceConfig: snapshot.config,
        },
        backup: {
          id: verifiedBackup.id,
          backupType: verifiedBackup.backupType,
          reasonCode: verifiedBackup.reasonCode,
          fileSha256: verifiedBackup.fileSha256,
          databaseFingerprint: verifiedBackup.databaseFingerprint,
          createdAt: verifiedBackup.createdAt,
        },
        database: {
          fingerprint,
          migrationCount: migrations.length,
          latestMigrationName: migrations[migrations.length - 1] ?? null,
          migrations,
        },
        worldSummary,
        generatedAt: new Date().toISOString(),
      };
      archive.append(JSON.stringify(fhmManifest, null, 2), { name: 'package.manifest.json' });
      archive.append(migrations.join('\n'), { name: 'migrations.txt' });
      const readme = `FHM Full Database Package
=========================

This package contains a VERIFIED SQLite snapshot of the local FHM world
database, generated through the centralized F32 backup service. It is a
portability / offline-storage artifact, NOT a restore action.

To restore this package:
  1. Extract the .zip
  2. Verify database.sqlite SHA-256 matches package.manifest.json
  3. Use Backup & Recovery (F32) to restore from the extracted database
     file (or copy it to the backup directory and prepare a restore)

Package does NOT bypass F32 restore semantics.
Generated: ${fhmManifest.generatedAt}
Database fingerprint prefix: ${fingerprint.slice(0, 12)}
`;
      archive.append(readme, { name: 'README.txt' });
      archive.finalize();
    });

    const fileSizeBytes = fs.statSync(outputPath).size;
    const fileBuffer = fs.readFileSync(outputPath);
    const fileSha256 = createHash('sha256').update(fileBuffer).digest('hex');
    const manifestJson = JSON.stringify({
      manifestSchemaVersion: 1,
      exportType: 'FULL_DATABASE_PACKAGE',
      format: 'ZIP',
      privacyLevel: 'COMMISSIONER_TRUTH',
      scopeText: 'full-database-package',
      filterText: '',
      schemaVersion: 1,
      rowCount: 1,
      fileSizeBytes,
      fileSha256,
      configuration: { versionId: snapshot.version.id, hash: snapshot.version.configHash },
      inputHash: verifiedBackup.fileSha256 ?? '',
      generatedAt: new Date().toISOString(),
    }, null, 2);
    const manifestSha256 = createHash('sha256').update(manifestJson).digest('hex');
    const manifestRelative = fileName.replace(/\.zip$/, '.manifest.json');
    fs.writeFileSync(resolveExportFile(root, manifestRelative), manifestJson);

    await prisma.maintenanceExportRun.update({
      where: { id: run.id },
      data: {
        status: 'COMPLETED',
        outputRelativePath: outputRelative,
        manifestRelativePath: manifestRelative,
        rowCount: 1,
        fileSizeBytes,
        fileSha256,
        manifestSha256,
        completedAt: new Date(),
      },
    });
    await appendMaintenanceEvent({
      entityType: 'MAINTENANCE_EXPORT',
      entityId: run.id,
      eventType: 'EXPORT_CREATED',
      statusBefore: 'RUNNING',
      statusAfter: 'COMPLETED',
      summary: `Full database package (${fileSizeBytes} bytes, backup ${verifiedBackup.id})`,
    });
    return {
      runId: run.id,
      backupId: verifiedBackup.id,
      fileSizeBytes,
      fileSha256,
      manifestSha256,
      outputRelativePath: outputRelative,
      databaseFingerprint: fingerprint,
    };
  } catch (e) {
    // Cleanup any partial artifacts; mark FAILED.
    safeRemove(outputPath);
    await prisma.maintenanceExportRun.update({
      where: { id: run.id },
      data: {
        status: 'FAILED',
        failedAt: new Date(),
        failureCode: 'PackageFailed',
        failureMessage: e instanceof Error ? e.message : String(e),
      },
    });
    throw e instanceof Error ? e : new Error(String(e));
  }
}
