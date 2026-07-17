import { DatabaseSync, type SQLInputValue } from 'node:sqlite';

/**
 * Thin typed wrapper over Node's built-in `node:sqlite` DatabaseSync, used by
 * F32 for read-only inspection of the active database and of backup files.
 * Opening a dedicated read-only connection (rather than reusing the shared
 * Prisma write client) keeps backup creation/verification from mutating world
 * data and from contending with Prisma's connection.
 *
 * The shape mirrors the subset of better-sqlite3's API that F32 needs, so the
 * fingerprint/verification services can stay database-agnostic.
 */
export interface BetterSQLite3Database {
  prepare(sql: string): {
    all(...params: SQLInputValue[]): unknown[];
    get(...params: SQLInputValue[]): unknown;
  };
  exec(sql: string): void;
  close(): void;
}

/**
 * Open a SQLite file in READ-ONLY mode. The caller MUST guarantee `dbPath`
 * has already been canonicalized and confined to an allowed location
 * (active DB path, or a backup file inside the configured backup root).
 */
export function openReadOnlyDatabase(dbPath: string): BetterSQLite3Database {
  const db = new DatabaseSync(dbPath, { readOnly: true });
  return {
    prepare: (sql: string) => {
      const stmt = db.prepare(sql);
      return {
        all: (...params: SQLInputValue[]) => stmt.all(...params) as unknown[],
        get: (...params: SQLInputValue[]) => stmt.get(...params) as unknown,
      };
    },
    exec: (sql: string) => db.exec(sql),
    close: () => db.close(),
  };
}

/** Run `PRAGMA integrity_check` and return true only when it reports 'ok'. */
export function runIntegrityCheck(db: BetterSQLite3Database): boolean {
  const rows = db.prepare('PRAGMA integrity_check').all() as Array<{ integrity_check: string }>;
  return rows.length === 1 && rows[0]!.integrity_check === 'ok';
}

/** Return the list of applied Prisma migration names in applied order. */
export function readAppliedMigrations(db: BetterSQLite3Database): string[] {
  try {
    const rows = db
      .prepare('SELECT migration_name FROM _prisma_migrations ORDER BY finished_at ASC, started_at ASC')
      .all() as Array<{ migration_name: string }>;
    return rows.map((r) => r.migration_name).filter((n) => typeof n === 'string' && n.length > 0);
  } catch {
    return [];
  }
}

/** Return true when the `_prisma_migrations` table exists and is queryable. */
export function hasMigrationTable(db: BetterSQLite3Database): boolean {
  try {
    const row = db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = '_prisma_migrations'")
      .get() as { name: string } | undefined;
    return row?.name === '_prisma_migrations';
  } catch {
    return false;
  }
}
