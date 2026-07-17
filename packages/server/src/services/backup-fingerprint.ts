import type { BetterSQLite3Database } from '../sqlite-readonly.js';
import type { DatabaseFingerprintInput } from '@fhm/engine';
import { computeDatabaseFingerprint } from '@fhm/engine';

/**
 * Bounded list of tables whose row counts contribute to the database
 * fingerprint. Kept small and stable; the manifest legitimately records a
 * broader bounded count list.
 */
const FINGERPRINT_TABLES = [
  'Country',
  'League',
  'Team',
  'Player',
  'Coach',
  'Competition',
  'CompetitionEdition',
  'WorldSeason',
  'Match',
  'PlayerContract',
  'CompletedTrade',
  'CompetitionArchive',
] as const;

/**
 * Gather the normalized fingerprint facts from a read-only SQLite connection.
 * The connection is opened by the caller (the backup/verification services) in
 * read-only mode against either the active DB or a backup file.
 */
export function gatherFingerprintInput(db: BetterSQLite3Database): DatabaseFingerprintInput {
  const migrationRows = db
    .prepare('SELECT migration_name FROM _prisma_migrations ORDER BY finished_at ASC, started_at ASC')
    .all() as Array<{ migration_name: string }>;
  const migrationNames = migrationRows
    .map((r) => r.migration_name)
    .filter((n): n is string => typeof n === 'string' && n.length > 0);

  let userVersion = 0;
  try {
    const row = db.prepare('PRAGMA user_version').get() as { user_version?: number } | undefined;
    userVersion = Number(row?.user_version ?? 0);
  } catch {
    userVersion = 0;
  }

  const appMeta = readAppMeta(db);
  const currentWorldSeason = readCurrentWorldSeason(db);
  const tableCounts = readTableCounts(db);

  return {
    migrationNames,
    userVersion,
    appMeta,
    currentWorldSeason,
    tableCounts,
  };
}

/** Compute the deterministic database fingerprint digest from a read-only connection. */
export function computeFingerprintFromDatabase(db: BetterSQLite3Database): string {
  return computeDatabaseFingerprint(gatherFingerprintInput(db));
}

function readAppMeta(db: BetterSQLite3Database): DatabaseFingerprintInput['appMeta'] {
  try {
    const row = db
      .prepare('SELECT worldInitialized, worldDatasetId, worldSchemaVersion FROM AppMeta WHERE id = ?')
      .get('default') as
      | { worldInitialized: number; worldDatasetId: string | null; worldSchemaVersion: number | null }
      | undefined;
    if (!row) return { worldInitialized: false, worldDatasetId: null, worldSchemaVersion: null };
    return {
      worldInitialized: Number(row.worldInitialized) === 1,
      worldDatasetId: row.worldDatasetId,
      worldSchemaVersion: row.worldSchemaVersion,
    };
  } catch {
    return { worldInitialized: false, worldDatasetId: null, worldSchemaVersion: null };
  }
}

function readCurrentWorldSeason(
  db: BetterSQLite3Database,
): DatabaseFingerprintInput['currentWorldSeason'] {
  try {
    const row = db
      .prepare('SELECT id, label, startYear, endYear FROM WorldSeason WHERE status = ? LIMIT 1')
      .get('ACTIVE') as
      | { id: string; label: string; startYear: number; endYear: number }
      | undefined;
    if (!row) return null;
    return {
      id: row.id,
      label: row.label,
      startYear: Number(row.startYear),
      endYear: Number(row.endYear),
    };
  } catch {
    return null;
  }
}

function readTableCounts(
  db: BetterSQLite3Database,
): DatabaseFingerprintInput['tableCounts'] {
  const counts: Array<{ table: string; count: number }> = [];
  for (const table of FINGERPRINT_TABLES) {
    try {
      const row = db.prepare(`SELECT COUNT(*) AS c FROM "${table}"`).get() as { c: number } | undefined;
      counts.push({ table, count: Number(row?.c ?? 0) });
    } catch {
      // Table may not exist in older backups; skip (count omitted, not zero).
    }
  }
  return counts;
}
