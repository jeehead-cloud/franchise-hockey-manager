import fs from 'node:fs';
import path from 'node:path';

/**
 * File-based maintenance/recovery state. When a restore is
 * WAITING_FOR_RESTART / RUNNING / VERIFYING, the server enters maintenance
 * mode: mutating APIs return 503, and `/health` reports the recovery state.
 *
 * The state lives OUTSIDE the database (next to the recovery journal in the
 * backup directory) so it survives database replacement.
 */
export const MAINTENANCE_MARKER_FILE = 'maintenance.json';

export interface MaintenanceState {
  active: boolean;
  reason: 'RESTORE_IN_PROGRESS' | 'RECOVERY_PENDING' | 'NONE';
  restoreRunId: string | null;
  message: string;
  updatedAt: string;
}

function markerPath(backupRoot: string): string {
  return path.join(backupRoot, MAINTENANCE_MARKER_FILE);
}

export function readMaintenanceState(backupRoot: string): MaintenanceState {
  const mp = markerPath(backupRoot);
  if (!fs.existsSync(mp)) {
    return { active: false, reason: 'NONE', restoreRunId: null, message: '', updatedAt: '' };
  }
  try {
    const parsed = JSON.parse(fs.readFileSync(mp, 'utf8')) as Partial<MaintenanceState>;
    return {
      active: parsed?.active === true,
      reason: (parsed?.reason as MaintenanceState['reason']) ?? 'NONE',
      restoreRunId: parsed?.restoreRunId ?? null,
      message: parsed?.message ?? '',
      updatedAt: parsed?.updatedAt ?? '',
    };
  } catch {
    return { active: false, reason: 'NONE', restoreRunId: null, message: '', updatedAt: '' };
  }
}

export function writeMaintenanceState(backupRoot: string, state: MaintenanceState): void {
  const mp = markerPath(backupRoot);
  fs.mkdirSync(backupRoot, { recursive: true });
  fs.writeFileSync(mp, JSON.stringify(state, null, 2), 'utf8');
}

export function enterMaintenance(
  backupRoot: string,
  args: { restoreRunId: string; message: string },
): void {
  writeMaintenanceState(backupRoot, {
    active: true,
    reason: 'RESTORE_IN_PROGRESS',
    restoreRunId: args.restoreRunId,
    message: args.message,
    updatedAt: new Date().toISOString(),
  });
}

export function clearMaintenance(backupRoot: string): void {
  writeMaintenanceState(backupRoot, {
    active: false,
    reason: 'NONE',
    restoreRunId: null,
    message: '',
    updatedAt: new Date().toISOString(),
  });
}

export function isMaintenanceActive(backupRoot: string): boolean {
  return readMaintenanceState(backupRoot).active;
}
