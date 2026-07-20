import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Database path resolution that mirrors Prisma's relative-URL semantics.
 *
 * Prisma resolves a relative SQLite `file:` URL (e.g. `file:./dev.db`) relative
 * to the **directory containing `schema.prisma`** — NOT relative to the current
 * working directory. The server is typically started from `packages/server`
 * (via `npm run dev --workspace=packages/server`) while the schema lives at
 * `packages/server/prisma/schema.prisma`, so `file:./dev.db` actually points at
 * `packages/server/prisma/dev.db`. Resolving against `process.cwd()` produces a
 * non-existent path, which surfaced as:
 *   - "Active database file not found" (F32 manual backup)
 *   - 500 "Internal server error" (F33 database validation)
 *
 * This module locates the schema directory at runtime (walking up from this
 * module's location) and resolves relative URLs the same way Prisma does.
 */

const SCHEMA_RELATIVE_CANDIDATES = ['../prisma/schema.prisma', '../../prisma/schema.prisma'];

let cachedSchemaDir: string | null | undefined;

/**
 * Locate the directory containing `schema.prisma`. Walks up a few candidate
 * locations relative to this compiled module (works in both `src/services/`
 * at dev time via tsx and `dist/services/` in the built output — both keep
 * `prisma/schema.prisma` at `<serverRoot>/prisma/schema.prisma`).
 *
 * Returns `null` when the schema cannot be found (caller decides how to handle).
 */
export function findSchemaDirectory(): string | null {
  if (cachedSchemaDir !== undefined) return cachedSchemaDir;
  const moduleDir = path.dirname(fileURLToPath(import.meta.url));
  for (const candidate of SCHEMA_RELATIVE_CANDIDATES) {
    const probe = path.resolve(moduleDir, candidate);
    if (fs.existsSync(probe)) {
      cachedSchemaDir = path.dirname(probe);
      return cachedSchemaDir;
    }
  }
  cachedSchemaDir = null;
  return cachedSchemaDir;
}

/**
 * Resolve a SQLite `DATABASE_URL` to an absolute filesystem path using Prisma's
 * relative-path semantics:
 *   - non-`file:` URLs are rejected (caller throws an unsupported-backend error)
 *   - absolute paths inside the URL are returned unchanged
 *   - relative paths resolve against the schema directory (Prisma's behaviour);
 *     if the schema directory cannot be located, fall back to `process.cwd()`
 *     so an absolute URL or a CWD-resident DB still works
 *
 * Splits the URL into the path (before any `?` query params Prisma may carry).
 */
export function resolveSqliteUrlPath(databaseUrl: string): { dbPath: string; fileName: string } {
  // Strip any Prisma connection query params (e.g. `?connection_limit=1`).
  const rawUrl = databaseUrl.slice('file:'.length).split('?')[0]!;
  const isAbsolute = /^([a-zA-Z]:[\\/]|[\\/])/i.test(rawUrl) || rawUrl.startsWith('/');
  let dbPath: string;
  if (isAbsolute) {
    dbPath = rawUrl;
  } else {
    const schemaDir = findSchemaDirectory();
    dbPath = schemaDir ? path.resolve(schemaDir, rawUrl) : path.resolve(process.cwd(), rawUrl);
  }
  return { dbPath, fileName: path.basename(dbPath) };
}
