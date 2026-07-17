import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import type { PrismaClient, DatabaseBackup, DatabaseRestoreRun } from '@prisma/client';
import {
  ACTIVE_RESTORE_STATUSES,
  aggregateCompatibility,
  aggregateRestoreReadiness,
  assertRestoreTransition,
  canCancelRestore,
  canTransitionRestoreStatus,
  isTerminalRestoreStatus,
  type BackupConfig,
  type CompatibilityInput,
  type RestoreStatus,
} from '@fhm/engine';
import { prisma } from '../db/client.js';
import { backupErrors } from './backup-errors.js';
import { ensureBackupRoot, resolveActiveDatabasePath, resolveBackupFile } from './backup-paths.js';
import { getActiveBackupSnapshot } from './backup-config.js';
import { verifyBackup, readActiveMigrations } from './backup-verification.js';
import { computeFingerprintFromDatabase, gatherFingerprintInput } from './backup-fingerprint.js';
import { openReadOnlyDatabase } from '../sqlite-readonly.js';
import { createDatabaseBackup } from './backup-creation.js';
import {
  appendJournalEvent,
  hasActiveJournalRestore,
  readRecoveryJournal,
  upsertJournalEntry,
  type RecoveryJournalEntry,
} from './recovery-journal.js';
import {
  hasActiveRestoreMarker,
  readRestoreMarker,
  removeRestoreMarker,
  writeRestoreMarker,
  type RestoreMarker,
} from './restore-marker.js';
import { enterMaintenance, isMaintenanceActive, readMaintenanceState } from './maintenance-mode.js';

// ---------------------------------------------------------------------------
// Preview (no writes)
// ---------------------------------------------------------------------------

export interface RestorePreview {
  backup: DatabaseBackup;
  compatibility: ReturnType<typeof aggregateCompatibility>;
  readiness: ReturnType<typeof aggregateRestoreReadiness>;
  currentFingerprint: string;
  targetFingerprint: string;
  dataLossWarning: { currentNewerOperationCount: number; latestOperations: string[] };
  restartRequired: boolean;
  preRestoreBackupRequired: boolean;
  allowedAction: 'PREPARE' | 'BLOCKED';
}

export async function previewRestore(args: { backupId: string }): Promise<RestorePreview> {
  const snapshot = await getActiveBackupSnapshot(prisma);
  const config = snapshot.config;
  const backup = await prisma.databaseBackup.findUnique({ where: { id: args.backupId } });
  if (!backup) throw backupErrors.backupNotFound(args.backupId);
  if (backup.status !== 'VERIFIED') throw backupErrors.backupNotVerified(args.backupId);

  const root = ensureBackupRoot(config);
  const verification = await verifyBackup(prisma, backup, root);
  // Re-check current status and reflect verification reality. A previously
  // VERIFIED backup may now be MISSING/CORRUPT; the restore must block.
  if (verification.outcome === 'MISSING') {
    await prisma.databaseBackup.update({ where: { id: args.backupId }, data: { status: 'MISSING' } });
    throw backupErrors.backupNotFound(args.backupId);
  }
  if (verification.outcome !== 'VERIFIED') {
    await prisma.databaseBackup.update({ where: { id: args.backupId }, data: { status: 'CORRUPT' } });
    throw backupErrors.integrityFailed();
  }

  const activeMigrations = await readActiveMigrations();
  const compatInput: CompatibilityInput = {
    backup: toEngineBackupRecord(backup),
    fileExists: verification.fileExists,
    fileHashMatches: verification.fileHashMatches,
    manifestHashMatches: verification.manifestHashMatches,
    integrityOk: verification.integrityOk,
    backupMigrationNames: verification.migrationNames,
    activeMigrationNames: activeMigrations,
    activeBackend: 'sqlite',
    pathInsideRoot: true,
    sourceEqualsActive: false,
    anotherRestoreActive: await hasActiveRestore(prisma),
  };
  const compatibility = aggregateCompatibility(compatInput);

  const { dbPath } = resolveActiveDatabasePath();
  let currentFingerprint = '';
  try {
    const db = openReadOnlyDatabase(dbPath);
    currentFingerprint = computeFingerprintFromDatabase(db);
    db.close();
  } catch {
    currentFingerprint = '';
  }
  const targetFingerprint = backup.databaseFingerprint ?? '';

  const readiness = aggregateRestoreReadiness({
    config,
    compatibility,
    preRestoreBackupCreated: false, // preview only
    conflictingWorldOperationRunning: false,
    currentFingerprintMatchesExpectation: true,
    backupFingerprintRecomputes: verification.fingerprintRecomputes,
  });

  // Data-loss summary: count of migrations the active DB has beyond the backup.
  const currentNewerOperationCount = Math.max(0, activeMigrations.length - verification.migrationNames.length);

  return {
    backup,
    compatibility,
    readiness,
    currentFingerprint,
    targetFingerprint,
    dataLossWarning: {
      currentNewerOperationCount,
      latestOperations: activeMigrations.slice(-3),
    },
    restartRequired: config.restore.requireRestart,
    preRestoreBackupRequired: config.restore.requirePreRestoreBackup,
    allowedAction: compatibility.compatible ? 'PREPARE' : 'BLOCKED',
  };
}

// ---------------------------------------------------------------------------
// Prepare (creates pre-restore backup + restore run + external journal + marker)
// ---------------------------------------------------------------------------

export interface PreparedRestore {
  run: DatabaseRestoreRun;
  restartRequired: boolean;
  confirmationPhrase: string;
}

export async function prepareRestore(args: {
  backupId: string;
  expectedBackupUpdatedAt: string;
  expectedCurrentDatabaseFingerprint: string;
  reason: string;
  requestedBy: string;
}): Promise<PreparedRestore> {
  const snapshot = await getActiveBackupSnapshot(prisma);
  const config = snapshot.config;

  // No other restore active.
  if (await hasActiveRestore(prisma)) throw backupErrors.restoreAlreadyRunning();
  if (await hasActiveJournalRestore(ensureBackupRoot(config))) throw backupErrors.restoreAlreadyRunning();

  const backup = await prisma.databaseBackup.findUnique({ where: { id: args.backupId } });
  if (!backup) throw backupErrors.backupNotFound(args.backupId);
  if (backup.status !== 'VERIFIED') throw backupErrors.backupNotVerified(args.backupId);

  // Optimistic concurrency: confirm the backup hasn't changed since preview.
  if (backup.updatedAt.toISOString() !== args.expectedBackupUpdatedAt) {
    throw backupErrors.restoreInputStale();
  }

  // Re-verify source backup immediately before preparation.
  const root = ensureBackupRoot(config);
  const verification = await verifyBackup(prisma, backup, root);
  if (verification.outcome !== 'VERIFIED') {
    throw backupErrors.integrityFailed();
  }

  // Verify current active DB fingerprint matches expectation.
  const { dbPath } = resolveActiveDatabasePath();
  const adb = openReadOnlyDatabase(dbPath);
  const currentFingerprint = computeFingerprintFromDatabase(adb);
  adb.close();
  if (currentFingerprint !== args.expectedCurrentDatabaseFingerprint) {
    throw backupErrors.restoreInputStale();
  }

  // Create the mandatory pre-restore backup of the CURRENT database.
  let preRestoreBackup: DatabaseBackup | null = null;
  if (config.restore.requirePreRestoreBackup) {
    const result = await createDatabaseBackup({
      backupType: 'PRE_RESTORE',
      reasonCode: 'PRE_RESTORE',
      reasonText: `Pre-restore backup for restore of ${backup.id}`,
      sourceOperationType: 'DATABASE_RESTORE',
      sourceOperationId: args.backupId,
      requestedBy: args.requestedBy,
    });
    preRestoreBackup = result.backup;
  }

  // Create the restore run row (initial PREPARED state).
  const run = await prisma.databaseRestoreRun.create({
    data: {
      status: 'PREPARED',
      sourceBackupId: backup.id,
      preRestoreBackupId: preRestoreBackup?.id ?? null,
      sourceBackupFingerprint: backup.databaseFingerprint ?? '',
      expectedCurrentFingerprint: currentFingerprint,
      currentDatabaseFingerprintBefore: currentFingerprint,
      configVersionId: snapshot.version.id,
      configHash: snapshot.version.configHash,
      restartRequired: config.restore.requireRestart,
      requestedBy: args.requestedBy,
      reason: args.reason,
      preparedAt: new Date(),
    },
  });

  // Append the initial event.
  await appendRestoreEvent(run.id, 'RESTORE_PREPARED', null, 'PREPARED', 'Restore prepared');

  // Write external recovery journal entry (survives database replacement).
  const entry: RecoveryJournalEntry = {
    restoreRunId: run.id,
    status: 'PREPARED',
    sourceBackupId: backup.id,
    sourceBackupFingerprint: backup.databaseFingerprint ?? '',
    preRestoreBackupId: preRestoreBackup?.id ?? null,
    configVersionId: snapshot.version.id,
    configHash: snapshot.version.configHash,
    requestedBy: args.requestedBy,
    reason: args.reason,
    preparedAt: run.preparedAt.toISOString(),
    completedAt: null,
    failedAt: null,
    failureCode: null,
    failureMessage: null,
    restoredDatabaseFingerprintAfter: null,
    events: [
      { eventType: 'RESTORE_PREPARED', at: new Date().toISOString(), summaryText: 'Restore prepared', statusBefore: null, statusAfter: 'PREPARED' },
      ...(preRestoreBackup
        ? [{ eventType: 'PRE_RESTORE_BACKUP_CREATED', at: new Date().toISOString(), summaryText: `Pre-restore backup ${preRestoreBackup.id}`, statusBefore: 'PREPARED' as string | null, statusAfter: 'PREPARED' as string | null }]
        : []),
    ],
  };
  upsertJournalEntry(root, entry);

  const confirmationPhrase = `RESTORE ${run.id.slice(-8).toUpperCase()}`;
  return { run, restartRequired: config.restore.requireRestart, confirmationPhrase };
}

// ---------------------------------------------------------------------------
// Request restart (transition PREPARED -> WAITING_FOR_RESTART, enter maintenance)
// ---------------------------------------------------------------------------

export async function requestRestart(args: {
  runId: string;
  confirmationPhrase: string;
  requestedBy: string;
}): Promise<{ run: DatabaseRestoreRun; restartRequired: boolean }> {
  const snapshot = await getActiveBackupSnapshot(prisma);
  const config = snapshot.config;
  const run = await prisma.databaseRestoreRun.findUnique({ where: { id: args.runId } });
  if (!run) throw backupErrors.restoreNotFound(args.runId);
  if (run.status !== 'PREPARED') throw backupErrors.restoreNotPrepared(args.runId);

  // Confirm the typed confirmation phrase.
  const expected = `RESTORE ${run.id.slice(-8).toUpperCase()}`;
  if (args.confirmationPhrase !== expected) {
    throw backupErrors.invalidRequest('Confirmation phrase does not match');
  }

  const root = ensureBackupRoot(config);
  assertRestoreTransition(run.status as RestoreStatus, 'WAITING_FOR_RESTART');
  const updated = await prisma.databaseRestoreRun.update({
    where: { id: run.id },
    data: { status: 'WAITING_FOR_RESTART' },
  });
  await appendRestoreEvent(run.id, 'MAINTENANCE_ENTERED', 'PREPARED', 'WAITING_FOR_RESTART', 'Maintenance mode entered');

  // Enter maintenance mode + write the restore marker (consumed by startup bootstrap).
  enterMaintenance(root, { restoreRunId: run.id, message: 'Restore in progress; restart required' });
  writeRestoreMarker(root, {
    restoreRunId: run.id,
    sourceBackupId: run.sourceBackupId,
    preRestoreBackupId: run.preRestoreBackupId,
    expectedSourceFingerprint: run.sourceBackupFingerprint,
    configVersionId: run.configVersionId,
    configHash: run.configHash,
    requestedBy: args.requestedBy,
    createdAt: new Date().toISOString(),
  });

  appendJournalEvent(root, run.id, {
    eventType: 'RESTART_REQUESTED',
    at: new Date().toISOString(),
    summaryText: 'Restart requested; marker written',
    statusBefore: 'PREPARED',
    statusAfter: 'WAITING_FOR_RESTART',
  });

  return { run: updated, restartRequired: config.restore.requireRestart };
}

// ---------------------------------------------------------------------------
// Cancel (only PREPARED / WAITING_FOR_RESTART, before replacement)
// ---------------------------------------------------------------------------

export async function cancelRestore(args: {
  runId: string;
  reason: string;
  requestedBy: string;
}): Promise<DatabaseRestoreRun> {
  const snapshot = await getActiveBackupSnapshot(prisma);
  const config = snapshot.config;
  const run = await prisma.databaseRestoreRun.findUnique({ where: { id: args.runId } });
  if (!run) throw backupErrors.restoreNotFound(args.runId);
  if (isTerminalRestoreStatus(run.status as RestoreStatus)) throw backupErrors.restoreCompleted(args.runId);
  if (!canCancelRestore(run.status as RestoreStatus)) {
    throw backupErrors.invalidRequest('Restore is running/verifying and cannot be cancelled safely');
  }

  assertRestoreTransition(run.status as RestoreStatus, 'CANCELLED');
  const updated = await prisma.databaseRestoreRun.update({
    where: { id: run.id },
    data: { status: 'CANCELLED', failedAt: new Date() },
  });
  await appendRestoreEvent(run.id, 'RESTORE_CANCELLED', run.status, 'CANCELLED', args.reason);

  // Clear marker + exit maintenance.
  const root = ensureBackupRoot(config);
  removeRestoreMarker(root);
  if (isMaintenanceActive(root)) {
    // Only clear maintenance if it was set for this run.
    const ms = readMaintenanceState(root);
    if (ms.restoreRunId === run.id) {
      const { clearMaintenance } = await import('./maintenance-mode.js');
      clearMaintenance(root);
    }
  }
  appendJournalEvent(root, run.id, {
    eventType: 'RESTORE_CANCELLED',
    at: new Date().toISOString(),
    summaryText: args.reason,
    statusBefore: run.status,
    statusAfter: 'CANCELLED',
  });

  return updated;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

export async function hasActiveRestore(client: PrismaClient): Promise<boolean> {
  const active = await client.databaseRestoreRun.findFirst({
    where: { status: { in: [...ACTIVE_RESTORE_STATUSES] as RestoreStatus[] } },
  });
  return !!active;
}

export async function appendRestoreEvent(
  runId: string,
  eventType: string,
  statusBefore: string | null,
  statusAfter: string | null,
  summaryText: string,
): Promise<void> {
  const eventHash = createHash('sha256')
    .update(`${runId}|${eventType}|${statusBefore ?? ''}|${statusAfter ?? ''}|${summaryText}|${Date.now()}`)
    .digest('hex');
  await prisma.databaseRestoreEvent.create({
    data: { restoreRunId: runId, eventType: eventType as never, statusBefore, statusAfter, summaryText, eventHash },
  });
}

export function isRestoreStatus(s: string): s is RestoreStatus {
  return ['PREPARED', 'WAITING_FOR_RESTART', 'RUNNING', 'VERIFYING', 'COMPLETED', 'FAILED', 'CANCELLED'].includes(s);
}

/** Adapt a Prisma DatabaseBackup row into the engine's domain-neutral record shape. */
function toEngineBackupRecord(row: DatabaseBackup) {
  return {
    id: row.id,
    status: row.status as never,
    backupType: row.backupType as never,
    reasonCode: row.reasonCode as never,
    sourceOperationType: row.sourceOperationType,
    sourceOperationId: row.sourceOperationId,
    sourceEntityType: row.sourceEntityType,
    sourceEntityId: row.sourceEntityId,
    protected: row.protected,
    protectionReason: row.protectionReason,
    fileSizeBytes: row.fileSizeBytes,
    fileSha256: row.fileSha256,
    manifestSha256: row.manifestSha256,
    databaseFingerprint: row.databaseFingerprint,
    schemaMigrationCount: row.schemaMigrationCount,
    latestMigrationName: row.latestMigrationName,
    worldSeasonIdSnapshot: row.worldSeasonIdSnapshot,
    currentWorldSeasonNameSnapshot: row.currentWorldSeasonNameSnapshot,
    verifiedAt: row.verifiedAt ? row.verifiedAt.toISOString() : null,
    createdAt: row.createdAt.toISOString(),
  };
}
