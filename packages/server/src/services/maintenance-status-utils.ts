/**
 * Small F33 helper that consolidates the F32 maintenance/restore-mode check.
 * Both F32 functions require a backup root; this helper resolves it from the
 * active backup configuration and returns a single boolean. Used by F33
 * maintenance services that need to refuse operations during a restore.
 */
import { getActiveBackupSnapshot } from './backup-config.js';
import { ensureBackupRoot } from './backup-paths.js';
import { isMaintenanceActive } from './maintenance-mode.js';
import { hasActiveRestoreMarker } from './restore-marker.js';
import { prisma } from '../db/client.js';

let cachedRoot: string | null = null;

async function backupRoot(): Promise<string> {
  if (cachedRoot) return cachedRoot;
  const snapshot = await getActiveBackupSnapshot(prisma);
  cachedRoot = ensureBackupRoot(snapshot.config);
  return cachedRoot;
}

export async function isRestoreOrMaintenanceActive(): Promise<boolean> {
  try {
    const root = await backupRoot();
    return isMaintenanceActive(root) || hasActiveRestoreMarker(root);
  } catch {
    // If the backup subsystem is unavailable, treat as inactive rather than
    // blocking all maintenance reads. Writes elsewhere still hard-require it.
    return false;
  }
}

export function isRestoreOrMaintenanceActiveSync(): boolean {
  if (!cachedRoot) return false;
  try {
    return isMaintenanceActive(cachedRoot) || hasActiveRestoreMarker(cachedRoot);
  } catch {
    return false;
  }
}
