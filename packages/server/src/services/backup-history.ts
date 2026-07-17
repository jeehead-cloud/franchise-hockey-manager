import type { PrismaClient, DatabaseBackup, DatabaseRestoreRun } from '@prisma/client';
import { prisma } from '../db/client.js';
import { backupErrors } from './backup-errors.js';

/**
 * Sanitized backup DTO — never exposes absolute paths. Only the basename of
 * the source DB and the relative display path are surfaced.
 */
export interface BackupDto {
  id: string;
  status: string;
  backupType: string;
  reasonCode: string;
  reasonText: string;
  sourceDatabaseFileName: string;
  fileName: string;
  fileSizeBytes: number | null;
  fileSha256Prefix: string | null;
  manifestSha256Prefix: string | null;
  databaseFingerprint: string | null;
  schemaMigrationCount: number | null;
  latestMigrationName: string | null;
  worldSeasonIdSnapshot: string | null;
  currentWorldSeasonNameSnapshot: string | null;
  sourceOperationType: string | null;
  sourceOperationId: string | null;
  protected: boolean;
  protectionReason: string | null;
  configVersionId: string;
  configHash: string;
  createdBy: string;
  startedAt: string;
  completedAt: string | null;
  verifiedAt: string | null;
  failedAt: string | null;
  failureCode: string | null;
  failureMessage: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface BackupDetailDto extends BackupDto {
  manifest: unknown | null;
  restoreRuns: Array<{ id: string; status: string; requestedBy: string; createdAt: string }>;
}

export function mapBackup(row: DatabaseBackup): BackupDto {
  return {
    id: row.id,
    status: row.status,
    backupType: row.backupType,
    reasonCode: row.reasonCode,
    reasonText: row.reasonText,
    sourceDatabaseFileName: row.sourceDatabasePathSnapshot,
    fileName: row.fileName,
    fileSizeBytes: row.fileSizeBytes,
    fileSha256Prefix: row.fileSha256 ? row.fileSha256.slice(0, 12) : null,
    manifestSha256Prefix: row.manifestSha256 ? row.manifestSha256.slice(0, 12) : null,
    databaseFingerprint: row.databaseFingerprint,
    schemaMigrationCount: row.schemaMigrationCount,
    latestMigrationName: row.latestMigrationName,
    worldSeasonIdSnapshot: row.worldSeasonIdSnapshot,
    currentWorldSeasonNameSnapshot: row.currentWorldSeasonNameSnapshot,
    sourceOperationType: row.sourceOperationType,
    sourceOperationId: row.sourceOperationId,
    protected: row.protected,
    protectionReason: row.protectionReason,
    configVersionId: row.configVersionId,
    configHash: row.configHash,
    createdBy: row.createdBy,
    startedAt: row.startedAt.toISOString(),
    completedAt: row.completedAt ? row.completedAt.toISOString() : null,
    verifiedAt: row.verifiedAt ? row.verifiedAt.toISOString() : null,
    failedAt: row.failedAt ? row.failedAt.toISOString() : null,
    failureCode: row.failureCode,
    failureMessage: row.failureMessage,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export interface BackupListFilter {
  status?: string;
  backupType?: string;
  reasonCode?: string;
  protected?: boolean;
  createdAfter?: string;
  createdBefore?: string;
}

const SORT_FIELDS = new Set(['createdAt', 'startedAt', 'verifiedAt', 'fileSizeBytes', 'status', 'reasonCode']);

export async function listBackups(args: {
  filter?: BackupListFilter;
  sort?: string;
  order?: 'asc' | 'desc';
  limit?: number;
}): Promise<BackupDto[]> {
  const where: Record<string, unknown> = {};
  if (args.filter?.status) where.status = args.filter.status;
  if (args.filter?.backupType) where.backupType = args.filter.backupType;
  if (args.filter?.reasonCode) where.reasonCode = args.filter.reasonCode;
  if (args.filter?.protected !== undefined) where.protected = args.filter.protected;
  if (args.filter?.createdAfter || args.filter?.createdBefore) {
    where.createdAt = {};
    if (args.filter?.createdAfter) (where.createdAt as Record<string, unknown>).gte = new Date(args.filter.createdAfter);
    if (args.filter?.createdBefore) (where.createdAt as Record<string, unknown>).lte = new Date(args.filter.createdBefore);
  }
  const sortField = args.sort && SORT_FIELDS.has(args.sort) ? args.sort : 'createdAt';
  const order = args.order === 'asc' ? 'asc' : 'desc';
  const rows = await prisma.databaseBackup.findMany({
    where,
    orderBy: { [sortField]: order },
    take: Math.min(Math.max(args.limit ?? 100, 1), 500),
  });
  return rows.map(mapBackup);
}

export async function getBackupDetail(id: string): Promise<BackupDetailDto> {
  const row = await prisma.databaseBackup.findUnique({
    where: { id },
    include: { sourceFor: { orderBy: { createdAt: 'desc' } } },
  });
  if (!row) throw backupErrors.backupNotFound(id);
  const dto = mapBackup(row);
  // Manifest DTO is loaded separately by routes when needed (to avoid reading
  // files on every detail fetch); left null here.
  return {
    ...dto,
    manifest: null,
    restoreRuns: row.sourceFor.map((r) => ({
      id: r.id,
      status: r.status,
      requestedBy: r.requestedBy,
      createdAt: r.createdAt.toISOString(),
    })),
  };
}

export interface RestoreRunDto {
  id: string;
  status: string;
  sourceBackupId: string;
  preRestoreBackupId: string | null;
  sourceBackupFingerprint: string;
  expectedCurrentFingerprint: string;
  currentDatabaseFingerprintBefore: string | null;
  restoredDatabaseFingerprintAfter: string | null;
  restartRequired: boolean;
  requestedBy: string;
  reason: string;
  preparedAt: string;
  startedAt: string | null;
  completedAt: string | null;
  failedAt: string | null;
  failureCode: string | null;
  failureMessage: string | null;
  createdAt: string;
  updatedAt: string;
}

export function mapRestoreRun(row: DatabaseRestoreRun): RestoreRunDto {
  return {
    id: row.id,
    status: row.status,
    sourceBackupId: row.sourceBackupId,
    preRestoreBackupId: row.preRestoreBackupId,
    sourceBackupFingerprint: row.sourceBackupFingerprint,
    expectedCurrentFingerprint: row.expectedCurrentFingerprint,
    currentDatabaseFingerprintBefore: row.currentDatabaseFingerprintBefore,
    restoredDatabaseFingerprintAfter: row.restoredDatabaseFingerprintAfter,
    restartRequired: row.restartRequired,
    requestedBy: row.requestedBy,
    reason: row.reason,
    preparedAt: row.preparedAt.toISOString(),
    startedAt: row.startedAt ? row.startedAt.toISOString() : null,
    completedAt: row.completedAt ? row.completedAt.toISOString() : null,
    failedAt: row.failedAt ? row.failedAt.toISOString() : null,
    failureCode: row.failureCode,
    failureMessage: row.failureMessage,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function listRestoreRuns(limit = 50): Promise<RestoreRunDto[]> {
  const rows = await prisma.databaseRestoreRun.findMany({
    orderBy: { createdAt: 'desc' },
    take: Math.min(Math.max(limit, 1), 200),
  });
  return rows.map(mapRestoreRun);
}

export async function getRestoreRun(id: string): Promise<RestoreRunDto> {
  const row = await prisma.databaseRestoreRun.findUnique({ where: { id } });
  if (!row) throw backupErrors.restoreNotFound(id);
  return mapRestoreRun(row);
}

/** Bounded public-safe backup status for /health and /api/system/backup-status. */
export async function getBoundedBackupStatus(): Promise<{
  configured: boolean;
  verifiedBackupCount: number;
  lastVerifiedBackupAt: string | null;
  lastVerifiedBackupAgeDays: number | null;
  corruptOrMissingCount: number;
  pendingRestore: boolean;
  maintenanceMode: boolean;
}> {
  let configured = true;
  try {
    const { getActiveBackupSnapshot } = await import('./backup-config.js');
    await getActiveBackupSnapshot(prisma);
  } catch {
    configured = false;
  }
  const verified = await prisma.databaseBackup.findFirst({
    where: { status: 'VERIFIED' },
    orderBy: { verifiedAt: 'desc' },
  });
  const verifiedCount = await prisma.databaseBackup.count({ where: { status: 'VERIFIED' } });
  const badCount = await prisma.databaseBackup.count({
    where: { status: { in: ['CORRUPT', 'MISSING'] } },
  });
  const pendingRestore = await prisma.databaseRestoreRun.findFirst({
    where: { status: { in: ['PREPARED', 'WAITING_FOR_RESTART', 'RUNNING', 'VERIFYING'] } },
  });
  const lastVerifiedAt = verified?.verifiedAt ?? null;
  let ageDays: number | null = null;
  if (lastVerifiedAt) {
    ageDays = Math.floor((Date.now() - lastVerifiedAt.getTime()) / (24 * 60 * 60 * 1000));
  }
  let maintenanceMode = false;
  try {
    const { readMaintenanceState } = await import('./maintenance-mode.js');
    const { resolveBackupRoot } = await import('./backup-paths.js');
    const { getActiveBackupSnapshot } = await import('./backup-config.js');
    const snapshot = await getActiveBackupSnapshot(prisma);
    maintenanceMode = readMaintenanceState(resolveBackupRoot(snapshot.config)).active;
  } catch {
    /* ignore */
  }
  return {
    configured,
    verifiedBackupCount: verifiedCount,
    lastVerifiedBackupAt: lastVerifiedAt ? lastVerifiedAt.toISOString() : null,
    lastVerifiedBackupAgeDays: ageDays,
    corruptOrMissingCount: badCount,
    pendingRestore: !!pendingRestore,
    maintenanceMode,
  };
}
