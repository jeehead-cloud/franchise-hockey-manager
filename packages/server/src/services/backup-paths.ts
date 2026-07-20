import fs from 'node:fs';
import path from 'node:path';
import type { BackupConfig } from '@fhm/engine';
import { backupErrors } from './backup-errors.js';
import { resolveSqliteUrlPath } from './database-paths.js';

/** Allowed file extensions for backup artifacts. */
export const ALLOWED_BACKUP_EXTENSIONS = new Set(['.sqlite', '.json']);

/**
 * Resolve the configured backup directory. Priority: FHM_BACKUP_DIR env var,
 * then the active config's `storage.directory` (resolved relative to the
 * server's CWD/repo root — mirroring the original `.fhm-backups` convention).
 * When the directory is relative, it is resolved against the repo root
 * (two levels up from packages/server).
 */
export function resolveBackupRoot(config: BackupConfig): string {
  const env = process.env.FHM_BACKUP_DIR;
  if (env && env.trim().length > 0) {
    return path.resolve(env);
  }
  const dir = config.storage.directory;
  const isAbsolute =
    /^([a-zA-Z]:[\\/]|[\\/])/i.test(dir) || dir.startsWith('/');
  if (isAbsolute) {
    if (!config.storage.allowAbsoluteDirectory) {
      throw backupErrors.backupDirectoryInvalid(
        'storage.directory is absolute but storage.allowAbsoluteDirectory is false',
      );
    }
    return path.resolve(dir);
  }
  // Relative directories resolve against the repo root (packages/server/../..).
  return path.resolve(process.cwd(), '..', '..', dir);
}

/** Ensure the backup root exists (creating it when policy allows). */
export function ensureBackupRoot(config: BackupConfig): string {
  const root = resolveBackupRoot(config);
  if (!fs.existsSync(root)) {
    if (config.storage.createDirectoryIfMissing) {
      fs.mkdirSync(root, { recursive: true });
    } else {
      throw backupErrors.backupDirectoryInvalid('Backup directory does not exist and createDirectoryIfMissing is false');
    }
  }
  return root;
}

/**
 * Resolve a stored relative file path against the backup root and confirm the
 * resolved path stays inside the root. Rejects `..` traversal and symlink
 * escape (where detectable). Called on every read.
 */
export function resolveBackupFile(root: string, relativePath: string): string {
  if (path.isAbsolute(relativePath)) {
    throw backupErrors.pathTraversal();
  }
  if (relativePath.includes('..')) {
    throw backupErrors.pathTraversal();
  }
  const resolved = path.resolve(root, relativePath);
  if (!isInsideRoot(root, resolved)) {
    throw backupErrors.pathTraversal();
  }
  return resolved;
}

/** True when `resolved` is the same as or inside `root` (real-path aware). */
export function isInsideRoot(root: string, resolved: string): boolean {
  const rootNorm = path.normalize(root) + path.sep;
  const resolvedNorm = path.normalize(resolved) + path.sep;
  if (resolvedNorm === path.normalize(root)) return true;
  // Also honor symlink resolution where the real paths are reachable.
  let realRoot = root;
  let realResolved = resolved;
  try {
    realRoot = fs.realpathSync(root);
  } catch {
    /* ignore — root may not exist yet */
  }
  try {
    realResolved = fs.realpathSync(resolved);
  } catch {
    /* ignore — fall back to lexical check */
  }
  const lexInside = resolvedNorm.startsWith(rootNorm) || path.normalize(resolved) === path.normalize(root);
  const realRootNorm = path.normalize(realRoot) + path.sep;
  const realInside =
    path.normalize(realResolved) === path.normalize(realRoot) ||
    (path.normalize(realResolved) + path.sep).startsWith(realRootNorm);
  return lexInside && realInside;
}

/** Confirm the file has an allowlisted extension. */
export function assertAllowedExtension(fileName: string): void {
  const ext = path.extname(fileName).toLowerCase();
  if (!ALLOWED_BACKUP_EXTENSIONS.has(ext)) {
    throw backupErrors.backupDirectoryInvalid(`Disallowed backup file extension: ${ext}`);
  }
}

/**
 * Generate a collision-safe, server-controlled filename from the configured
 * pattern. No user-supplied filenames are ever accepted.
 */
export function generateBackupFileName(
  config: BackupConfig,
  args: { timestamp: string; reason: string; shortHash: string },
): string {
  const reason = sanitizeReasonForFilename(args.reason);
  const fileName = config.creation.filenamePattern
    .replace('{timestamp}', args.timestamp)
    .replace('{reason}', reason)
    .replace('{shortHash}', args.shortHash);
  if (fileName.includes('/') || fileName.includes('\\') || fileName.includes('..')) {
    throw backupErrors.backupDirectoryInvalid('Generated filename is invalid');
  }
  return fileName;
}

/** Sanitize a reason code/text into a filename-safe token. */
export function sanitizeReasonForFilename(reason: string): string {
  return reason.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 48) || 'backup';
}

/**
 * Resolve the active SQLite database file path from DATABASE_URL using Prisma's
 * relative-path semantics (relative URLs resolve against the schema directory,
 * NOT the server's CWD). Throws an unsupported-backend error for non-`file:` URLs.
 */
export function resolveActiveDatabasePath(): { dbPath: string; fileName: string } {
  const databaseUrl = process.env.DATABASE_URL ?? '';
  if (!databaseUrl.startsWith('file:')) {
    throw backupErrors.unsupportedBackend();
  }
  return resolveSqliteUrlPath(databaseUrl);
}

/** Compute the relative-to-root display path (basename of the relative path). */
export function relativeDisplayPath(relativeFilePath: string): string {
  return relativeFilePath.replace(/\\/g, '/');
}
