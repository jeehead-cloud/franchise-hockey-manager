import fs from 'node:fs';
import path from 'node:path';

/**
 * External recovery journal — a canonical-JSON sidecar written into the backup
 * directory. It records restore-run state OUTSIDE the database, because
 * restoring an older database may delete the restore-run row that requested
 * the restore. The startup bootstrap reads/updates it around database
 * replacement; once the restored DB opens, the completed restore summary is
 * reconciled into the DB.
 *
 * No secrets. No absolute active-database paths.
 */

export const RECOVERY_JOURNAL_FILE = 'recovery-journal.json';
export const RECOVERY_JOURNAL_SCHEMA_VERSION = 1 as const;

export interface RecoveryJournalEntry {
  restoreRunId: string;
  status: string;
  sourceBackupId: string;
  sourceBackupFingerprint: string;
  preRestoreBackupId: string | null;
  configVersionId: string;
  configHash: string;
  requestedBy: string;
  reason: string;
  preparedAt: string;
  completedAt: string | null;
  failedAt: string | null;
  failureCode: string | null;
  failureMessage: string | null;
  restoredDatabaseFingerprintAfter: string | null;
  events: Array<{
    eventType: string;
    at: string;
    summaryText: string;
    statusBefore: string | null;
    statusAfter: string | null;
  }>;
}

export interface RecoveryJournal {
  schemaVersion: number;
  entries: Record<string, RecoveryJournalEntry>;
}

function emptyJournal(): RecoveryJournal {
  return { schemaVersion: RECOVERY_JOURNAL_SCHEMA_VERSION, entries: {} };
}

function journalPath(backupRoot: string): string {
  return path.join(backupRoot, RECOVERY_JOURNAL_FILE);
}

/** Read the external recovery journal (or return an empty one if absent). */
export function readRecoveryJournal(backupRoot: string): RecoveryJournal {
  const jp = journalPath(backupRoot);
  if (!fs.existsSync(jp)) return emptyJournal();
  try {
    const parsed = JSON.parse(fs.readFileSync(jp, 'utf8')) as Partial<RecoveryJournal>;
    if (parsed?.schemaVersion !== RECOVERY_JOURNAL_SCHEMA_VERSION) {
      return emptyJournal();
    }
    return { schemaVersion: parsed.schemaVersion, entries: parsed.entries ?? {} };
  } catch {
    return emptyJournal();
  }
}

/** Write the full journal (canonical JSON, atomic write). */
export function writeRecoveryJournal(backupRoot: string, journal: RecoveryJournal): void {
  const jp = journalPath(backupRoot);
  fs.mkdirSync(backupRoot, { recursive: true });
  const tmp = `${jp}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(stableSort(journal), null, 2), 'utf8');
  fs.renameSync(tmp, jp);
}

function stableSort(value: unknown): unknown {
  if (value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map(stableSort);
  const obj = value as Record<string, unknown>;
  return Object.keys(obj)
    .sort()
    .reduce<Record<string, unknown>>((acc, k) => {
      acc[k] = stableSort(obj[k]);
      return acc;
    }, {});
}

/** Upsert a journal entry (creates or replaces by restoreRunId). */
export function upsertJournalEntry(backupRoot: string, entry: RecoveryJournalEntry): void {
  const journal = readRecoveryJournal(backupRoot);
  journal.entries[entry.restoreRunId] = entry;
  writeRecoveryJournal(backupRoot, journal);
}

/** Append an event to an existing entry. */
export function appendJournalEvent(
  backupRoot: string,
  restoreRunId: string,
  event: RecoveryJournalEntry['events'][number],
): void {
  const journal = readRecoveryJournal(backupRoot);
  const entry = journal.entries[restoreRunId];
  if (!entry) return;
  entry.events.push(event);
  writeRecoveryJournal(backupRoot, journal);
}

/** Get a single entry by restore-run ID. */
export function getJournalEntry(backupRoot: string, restoreRunId: string): RecoveryJournalEntry | null {
  return readRecoveryJournal(backupRoot).entries[restoreRunId] ?? null;
}

/** All entries as an array (newest-first by preparedAt). */
export function listJournalEntries(backupRoot: string): RecoveryJournalEntry[] {
  const entries = Object.values(readRecoveryJournal(backupRoot).entries);
  return entries.sort((a, b) => (a.preparedAt < b.preparedAt ? 1 : a.preparedAt > b.preparedAt ? -1 : 0));
}

/** True when any journal entry is in a non-terminal (active) status. */
export function hasActiveJournalRestore(backupRoot: string): boolean {
  const entries = Object.values(readRecoveryJournal(backupRoot).entries);
  return entries.some(
    (e) =>
      e.status === 'PREPARED' ||
      e.status === 'WAITING_FOR_RESTART' ||
      e.status === 'RUNNING' ||
      e.status === 'VERIFYING',
  );
}
