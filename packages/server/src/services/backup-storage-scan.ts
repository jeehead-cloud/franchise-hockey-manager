import fs from 'node:fs';
import path from 'node:path';
import type { PrismaClient } from '@prisma/client';
import { prisma } from '../db/client.js';
import { ALLOWED_BACKUP_EXTENSIONS, ensureBackupRoot, isInsideRoot } from './backup-paths.js';
import { getActiveBackupSnapshot } from './backup-config.js';

export interface StorageScanFinding {
  kind:
    | 'METADATA_WITHOUT_FILE'
    | 'FILE_WITHOUT_METADATA'
    | 'MANIFEST_WITHOUT_DB'
    | 'DB_WITHOUT_MANIFEST'
    | 'UNEXPECTED_EXTENSION'
    | 'PATH_OUTSIDE_ROOT'
    | 'DUPLICATE_FILENAME'
    | 'UNRECOGNIZED_OLD_FORMAT';
  fileName: string;
  relativePath: string | null;
  backupId: string | null;
  message: string;
}

export interface StorageScanResult {
  rootOk: boolean;
  findings: StorageScanFinding[];
  totalFiles: number;
  totalMetadataRows: number;
}

/**
 * Scan the configured backup directory for stale/orphan/corrupt artifacts.
 * Detects: metadata row with missing file, file with no metadata, manifest
 * without db, db without manifest, unexpected extension, path outside root,
 * duplicate filename, unrecognized old format. Does NOT delete anything.
 */
export async function scanBackupStorage(): Promise<StorageScanResult> {
  const snapshot = await getActiveBackupSnapshot(prisma);
  const root = ensureBackupRoot(snapshot.config);
  const findings: StorageScanFinding[] = [];

  const rows = await prisma.databaseBackup.findMany();
  const metadataByFile = new Map(rows.map((r) => [r.fileName, r]));

  // 1. Metadata rows: check file + manifest exist and are inside root.
  for (const row of rows) {
    if (row.status === 'DELETED') continue;
    const resolved = path.resolve(root, row.relativeFilePath);
    if (!isInsideRoot(root, resolved)) {
      findings.push({
        kind: 'PATH_OUTSIDE_ROOT',
        fileName: row.fileName,
        relativePath: row.relativeFilePath,
        backupId: row.id,
        message: 'Recorded relative file path resolves outside the backup root',
      });
      continue;
    }
    if (!fs.existsSync(resolved)) {
      findings.push({
        kind: 'METADATA_WITHOUT_FILE',
        fileName: row.fileName,
        relativePath: row.relativeFilePath,
        backupId: row.id,
        message: 'Metadata row exists but the backup file is missing',
      });
    }
    if (row.manifestRelativePath) {
      const manifestResolved = path.resolve(root, row.manifestRelativePath);
      if (isInsideRoot(root, manifestResolved) && !fs.existsSync(manifestResolved)) {
        findings.push({
          kind: 'METADATA_WITHOUT_FILE',
          fileName: path.basename(row.manifestRelativePath),
          relativePath: row.manifestRelativePath,
          backupId: row.id,
          message: 'Metadata row exists but the manifest file is missing',
        });
      }
    }
  }

  // 2. Files on disk: enumerate and cross-reference metadata.
  const diskFiles = enumerateBackupFiles(root);
  for (const f of diskFiles) {
    if (!isInsideRoot(root, f.fullPath)) {
      findings.push({
        kind: 'PATH_OUTSIDE_ROOT',
        fileName: f.name,
        relativePath: f.relativePath,
        backupId: null,
        message: 'File resolves outside the backup root',
      });
      continue;
    }
    if (!ALLOWED_BACKUP_EXTENSIONS.has(f.ext)) {
      findings.push({
        kind: 'UNEXPECTED_EXTENSION',
        fileName: f.name,
        relativePath: f.relativePath,
        backupId: null,
        message: `Unexpected file extension: ${f.ext}`,
      });
      continue;
    }
    // Recognize F18-era legacy backups (prefixed f18- … .db) we cannot adopt.
    if (f.ext === '.db' && /^f18-/.test(f.name)) {
      findings.push({
        kind: 'UNRECOGNIZED_OLD_FORMAT',
        fileName: f.name,
        relativePath: f.relativePath,
        backupId: null,
        message: 'Legacy pre-F32 safety backup (not managed by the F32 inventory)',
      });
      continue;
    }
    if (f.ext === '.sqlite') {
      const row = metadataByFile.get(f.name);
      if (!row) {
        findings.push({
          kind: 'FILE_WITHOUT_METADATA',
          fileName: f.name,
          relativePath: f.relativePath,
          backupId: null,
          message: 'Backup file present without a metadata row',
        });
      } else {
        // Check companion manifest exists.
        const manifestName = f.name.replace(/\.sqlite$/, '.manifest.json');
        const manifestPath = path.join(path.dirname(f.fullPath), manifestName);
        if (!fs.existsSync(manifestPath)) {
          findings.push({
            kind: 'DB_WITHOUT_MANIFEST',
            fileName: f.name,
            relativePath: f.relativePath,
            backupId: row.id,
            message: 'Backup database has no companion manifest',
          });
        }
      }
    }
    if (f.ext === '.json') {
      // Manifest without a sibling db.
      const dbName = f.name.replace(/\.manifest\.json$/, '.sqlite');
      const dbPath = path.join(path.dirname(f.fullPath), dbName);
      if (!fs.existsSync(dbPath)) {
        findings.push({
          kind: 'MANIFEST_WITHOUT_DB',
          fileName: f.name,
          relativePath: f.relativePath,
          backupId: null,
          message: 'Manifest file without a companion backup database',
        });
      }
    }
  }

  // 3. Duplicate filenames across the directory.
  const nameCounts = new Map<string, number>();
  for (const f of diskFiles) nameCounts.set(f.name, (nameCounts.get(f.name) ?? 0) + 1);
  for (const [name, count] of nameCounts) {
    if (count > 1) {
      findings.push({
        kind: 'DUPLICATE_FILENAME',
        fileName: name,
        relativePath: null,
        backupId: null,
        message: `Filename appears ${count} times`,
      });
    }
  }

  return {
    rootOk: true,
    findings,
    totalFiles: diskFiles.length,
    totalMetadataRows: rows.filter((r) => r.status !== 'DELETED').length,
  };
}

interface DiskFile {
  name: string;
  relativePath: string;
  fullPath: string;
  ext: string;
}

function enumerateBackupFiles(root: string): DiskFile[] {
  const out: DiskFile[] = [];
  if (!fs.existsSync(root)) return out;
  const walk = (dir: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else if (entry.isFile()) {
        out.push({
          name: entry.name,
          relativePath: path.relative(root, full).replace(/\\/g, '/'),
          fullPath: full,
          ext: path.extname(entry.name).toLowerCase(),
        });
      }
    }
  };
  walk(root);
  return out;
}
