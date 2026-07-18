import fs from 'node:fs';
import path from 'node:path';
import type { MaintenanceConfig } from '@fhm/engine';
import { maintenanceErrors } from './maintenance-errors.js';

/** Allowed file extensions for export artifacts. */
export const ALLOWED_EXPORT_EXTENSIONS = new Set(['.csv', '.json', '.zip']);

/** Allowed file extensions inside full-database-package staging only. */
export const ALLOWED_PACKAGE_INTERNAL_EXTENSIONS = new Set(['.sqlite', '.json', '.zip', '.txt', '.md']);

/**
 * Resolve the configured export directory. Priority: FHM_EXPORT_DIR env var,
 * then the active config's `storage.directory` (resolved relative to the
 * server's CWD/repo root — mirroring the `.fhm-exports` convention).
 */
export function resolveExportRoot(config: MaintenanceConfig): string {
  const env = process.env.FHM_EXPORT_DIR;
  if (env && env.trim().length > 0) {
    return path.resolve(env);
  }
  const dir = config.storage.directory;
  const isAbsolute =
    /^([a-zA-Z]:[\\/]|[\\/])/i.test(dir) || dir.startsWith('/');
  if (isAbsolute) {
    if (!config.storage.allowAbsoluteDirectory) {
      throw maintenanceErrors.maintenancePathInvalid(
        'storage.directory is absolute but storage.allowAbsoluteDirectory is false',
      );
    }
    return path.resolve(dir);
  }
  // Relative directories resolve against the repo root (packages/server/../..).
  return path.resolve(process.cwd(), '..', '..', dir);
}

/** Ensure the export root exists (creating it when policy allows). */
export function ensureExportRoot(config: MaintenanceConfig): string {
  const root = resolveExportRoot(config);
  if (!fs.existsSync(root)) {
    if (config.storage.createDirectoryIfMissing) {
      fs.mkdirSync(root, { recursive: true });
    } else {
      throw maintenanceErrors.maintenancePathInvalid('Export directory does not exist and createDirectoryIfMissing is false');
    }
  }
  return root;
}

/**
 * Resolve a stored relative file path against the export root and confirm the
 * resolved path stays inside the root. Rejects `..` traversal and symlink
 * escape (where detectable). Called on every read.
 */
export function resolveExportFile(root: string, relativePath: string): string {
  if (path.isAbsolute(relativePath)) {
    throw maintenanceErrors.maintenancePathInvalid('Absolute paths are not accepted');
  }
  if (relativePath.includes('..')) {
    throw maintenanceErrors.maintenancePathInvalid('Path traversal is not accepted');
  }
  const resolved = path.resolve(root, relativePath);
  if (!isInsideRoot(root, resolved)) {
    throw maintenanceErrors.maintenancePathInvalid('Resolved path escapes the configured export directory');
  }
  return resolved;
}

/** True when `resolved` is the same as or inside `root` (real-path aware). */
export function isInsideRoot(root: string, resolved: string): boolean {
  const rootNorm = path.normalize(root) + path.sep;
  const resolvedNorm = path.normalize(resolved) + path.sep;
  let realRoot = root;
  let realResolved = resolved;
  try {
    realRoot = fs.realpathSync(root);
  } catch {
    /* ignore */
  }
  try {
    realResolved = fs.realpathSync(resolved);
  } catch {
    /* ignore */
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
  if (!ALLOWED_EXPORT_EXTENSIONS.has(ext)) {
    throw maintenanceErrors.maintenancePathInvalid(`Disallowed export file extension: ${ext}`);
  }
}

/**
 * Generate a collision-safe, server-controlled filename. No user-supplied
 * filenames are ever accepted. Format: `fhm-{exportType}-{timestamp}-{shortHash}.{ext}`.
 */
export function generateExportFileName(args: {
  exportType: string;
  timestamp: string;
  shortHash: string;
  extension: string;
}): string {
  const type = sanitizeForFilename(args.exportType);
  const fileName = `fhm-${type}-${args.timestamp}-${args.shortHash}${args.extension}`;
  if (fileName.includes('/') || fileName.includes('\\') || fileName.includes('..')) {
    throw maintenanceErrors.maintenancePathInvalid('Generated filename is invalid');
  }
  return fileName;
}

/** Sanitize arbitrary text into a filename-safe token. */
export function sanitizeForFilename(text: string): string {
  return text.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 48) || 'export';
}

/**
 * Sanitize a user-supplied original filename for *display only*. The stored
 * file always uses a server-generated name; this preserves a human-readable
 * hint for the import-run metadata.
 */
export function sanitizeDisplayFileName(original: string): string {
  // Strip path components, keep only the basename.
  const base = original.replace(/[\\/]/g, '').slice(-128);
  // Remove control chars and path-traversal segments.
  return base.replace(/[\x00-\x1f]/g, '').replace(/\.\./g, '').slice(0, 128) || 'upload';
}

/** Safely remove a file, ignoring missing-file errors. Never throws. */
export function safeRemove(filePath: string): void {
  try {
    fs.unlinkSync(filePath);
  } catch {
    /* ignore */
  }
}

/** Resolve the active SQLite database file path from DATABASE_URL. */
export function resolveActiveDatabasePath(): { dbPath: string; fileName: string } {
  const databaseUrl = process.env.DATABASE_URL ?? '';
  if (!databaseUrl.startsWith('file:')) {
    throw maintenanceErrors.maintenancePathInvalid('Maintenance is only supported for local SQLite file databases');
  }
  const raw = databaseUrl.slice('file:'.length);
  const dbPath = path.isAbsolute(raw) ? raw : path.resolve(process.cwd(), raw);
  const fileName = path.basename(dbPath);
  return { dbPath, fileName };
}
