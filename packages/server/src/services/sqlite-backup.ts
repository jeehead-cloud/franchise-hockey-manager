import fs from 'node:fs';
import path from 'node:path';
import { prisma } from '../db/client.js';

export interface SqliteBackupResult {
  backupPath: string;
  relativeDisplayPath: string;
  createdAt: string;
  bytes: number;
}

/**
 * Interim F18 pre-run safety snapshot (not F32 recovery UI).
 * Uses SQLite VACUUM INTO for a consistent copy of the open database.
 */
export async function createSqliteSafetyBackup(opts?: {
  label?: string;
  backupRoot?: string;
}): Promise<SqliteBackupResult> {
  const databaseUrl = process.env.DATABASE_URL ?? '';
  if (!databaseUrl.startsWith('file:')) {
    throw Object.assign(new Error('Safety backups are only supported for local SQLite file databases'), {
      statusCode: 503,
      code: 'BackupFailed',
      name: 'BackupFailed',
    });
  }

  const dbPath = databaseUrl.slice('file:'.length);
  const resolvedDb = path.isAbsolute(dbPath)
    ? dbPath
    : path.resolve(process.cwd(), dbPath);
  if (!fs.existsSync(resolvedDb)) {
    throw Object.assign(new Error('Database file not found for backup'), {
      statusCode: 503,
      code: 'BackupFailed',
      name: 'BackupFailed',
    });
  }

  const root =
    opts?.backupRoot ??
    process.env.FHM_BACKUP_DIR ??
    path.resolve(process.cwd(), '..', '..', '.fhm-backups');
  fs.mkdirSync(root, { recursive: true });

  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const label = (opts?.label ?? 'regular-season').replace(/[^a-zA-Z0-9_-]/g, '_');
  const fileName = `f18-${label}-${stamp}.db`;
  const backupPath = path.join(root, fileName);

  // Escape single quotes for SQL string literal
  const escaped = backupPath.replace(/'/g, "''");
  try {
    await prisma.$executeRawUnsafe(`VACUUM INTO '${escaped}'`);
  } catch (err) {
    throw Object.assign(
      new Error(err instanceof Error ? err.message : 'SQLite VACUUM INTO backup failed'),
      { statusCode: 503, code: 'BackupFailed', name: 'BackupFailed' },
    );
  }

  const stat = fs.statSync(backupPath);
  return {
    backupPath,
    relativeDisplayPath: path.join('.fhm-backups', fileName),
    createdAt: new Date().toISOString(),
    bytes: stat.size,
  };
}
