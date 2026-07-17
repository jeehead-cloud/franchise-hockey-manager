import fs from 'node:fs';
import path from 'node:path';

/**
 * Restore marker — an instruction file written into the backup directory when
 * a restore is WAITING_FOR_RESTART. It tells the pre-Prisma startup bootstrap
 * to perform the atomic database replacement BEFORE Prisma opens. Consumed and
 * cleared only after a successful restore; preserved on failure so the
 * administrator can recover manually.
 *
 * Lives OUTSIDE the database (it must survive database replacement). No secrets.
 */
export const RESTORE_MARKER_FILE = 'pending-restore.json';

export interface RestoreMarker {
  restoreRunId: string;
  sourceBackupId: string;
  preRestoreBackupId: string | null;
  expectedSourceFingerprint: string;
  configVersionId: string;
  configHash: string;
  requestedBy: string;
  createdAt: string;
}

function markerPath(backupRoot: string): string {
  return path.join(backupRoot, RESTORE_MARKER_FILE);
}

export function readRestoreMarker(backupRoot: string): RestoreMarker | null {
  const mp = markerPath(backupRoot);
  if (!fs.existsSync(mp)) return null;
  try {
    return JSON.parse(fs.readFileSync(mp, 'utf8')) as RestoreMarker;
  } catch {
    return null;
  }
}

export function writeRestoreMarker(backupRoot: string, marker: RestoreMarker): void {
  const mp = markerPath(backupRoot);
  fs.mkdirSync(backupRoot, { recursive: true });
  fs.writeFileSync(mp, JSON.stringify(marker, null, 2), 'utf8');
}

export function removeRestoreMarker(backupRoot: string): void {
  const mp = markerPath(backupRoot);
  try {
    if (fs.existsSync(mp)) fs.unlinkSync(mp);
  } catch {
    /* ignore */
  }
}

export function hasActiveRestoreMarker(backupRoot: string): boolean {
  return readRestoreMarker(backupRoot) !== null;
}
