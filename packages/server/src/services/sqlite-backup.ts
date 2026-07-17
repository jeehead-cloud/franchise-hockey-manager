import path from 'node:path';
import type { BackupType, ReasonCode } from '@fhm/engine';
import { createDatabaseBackup } from './backup-creation.js';

export interface SqliteBackupResult {
  backupPath: string;
  relativeDisplayPath: string;
  createdAt: string;
  bytes: number;
  /** F32 centralized backup record id (for operation linking). */
  backupId?: string;
}

/**
 * F32-integrated SQLite safety backup.
 *
 * Previously an ad-hoc VACUUM-INTO helper; now a thin adapter that delegates
 * to the centralized {@link createDatabaseBackup} service so every operation
 * backup gets a manifest, file SHA-256, database fingerprint, integrity
 * verification, VERIFIED status, retention protection, and audit. The original
 * return shape (`relativeDisplayPath`/`createdAt`/`bytes`) is preserved so
 * existing F18–F31 callers keep working.
 *
 * The `label` is mapped to a reason code; callers may pass `sourceOperation*`
 * for centralized idempotency + operation linking.
 */
export async function createSqliteSafetyBackup(opts?: {
  label?: string;
  backupRoot?: string;
  /** Override the configured backup root (test isolation). */
  sourceOperationType?: string;
  sourceOperationId?: string;
  backupType?: BackupType;
  reasonCode?: ReasonCode;
}): Promise<SqliteBackupResult> {
  const label = opts?.label ?? 'regular-season';
  const reasonCode = (opts?.reasonCode ?? labelToReasonCode(label)) as ReasonCode;
  const result = await createDatabaseBackup({
    backupType: opts?.backupType ?? 'AUTOMATIC_OPERATION',
    reasonCode,
    reasonText: label,
    sourceOperationType: opts?.sourceOperationType ?? null,
    sourceOperationId: opts?.sourceOperationId ?? null,
  });
  const backup = result.backup;
  const size = backup.fileSizeBytes ?? 0;
  return {
    backupPath: backup.relativeFilePath,
    relativeDisplayPath: path.join('.fhm-backups', backup.fileName),
    createdAt: backup.startedAt.toISOString(),
    bytes: size,
    backupId: backup.id,
  };
}

/** Best-effort mapping from a legacy label to a F32 reason code. */
function labelToReasonCode(label: string): ReasonCode {
  const l = label.toLowerCase();
  if (l.includes('regular') || l.startsWith('stage-')) return 'REGULAR_SEASON_SIMULATION';
  if (l.includes('playoff')) return 'PLAYOFF_SIMULATION';
  if (l.includes('archive') || l.includes('f20')) return 'COMPETITION_ARCHIVE';
  if (l.includes('aggregat') || l.includes('f21')) return 'AGGREGATED_SIMULATION';
  if (l.startsWith('intl-')) return 'INTERNATIONAL_TOURNAMENT';
  if (l.includes('development') || l.includes('f24')) return 'PLAYER_DEVELOPMENT';
  if (l.includes('youth') || l.includes('f25')) return 'YOUTH_GENERATION';
  if (l.includes('draft') || l.includes('f27')) return 'DRAFT_START';
  if (l.includes('trade')) return 'TRADE_ACCEPTANCE';
  if (l.includes('contracts-initial')) return 'CONTRACT_INITIALIZATION';
  if (l.includes('contracts-expiration')) return 'CONTRACT_EXPIRATION';
  if (l.includes('season-transition')) return 'SEASON_TRANSITION';
  return 'OTHER';
}
