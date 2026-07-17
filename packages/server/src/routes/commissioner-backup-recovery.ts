import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { detailResponse, listResponse } from '../http.js';
import { CommissionerHttpError, commissionerErrorBody } from '../commissioner/errors.js';
import { hasCommissionerHeader, areCommissionerWritesEnabled } from '../commissioner/gate.js';
import { BackupHttpError } from '../services/backup-errors.js';
import { prisma } from '../db/client.js';
import {
  createDatabaseBackup,
  findReusableBackup,
} from '../services/backup-creation.js';
import { verifyBackupCommand, getBackupDownloadStream } from '../services/commissioner-backups.js';
import {
  listBackups,
  getBackupDetail,
  listRestoreRuns,
  getRestoreRun,
  mapBackup,
} from '../services/backup-history.js';
import {
  previewRestore,
  prepareRestore,
  requestRestart,
  cancelRestore,
  hasActiveRestore,
} from '../services/backup-restore.js';
import { executeRetentionPrune, previewRetentionPlan, protectBackup, unprotectBackup } from '../services/backup-retention.js';
import { scanBackupStorage } from '../services/backup-storage-scan.js';
import {
  getActiveBackupSnapshot,
  listBackupConfigurations,
  loadBackupConfigVersion,
} from '../services/backup-config.js';
import {
  createBackupPreset,
  createBackupVersion,
  activateBackupVersion,
} from '../services/commissioner-backups.js';
import { ensureBackupRoot, resolveBackupFile } from '../services/backup-paths.js';
import { readManifestFile, manifestRelativePathFor } from '../services/backup-manifest.js';
import { listJournalEntries, getJournalEntry } from '../services/recovery-journal.js';
import { isMaintenanceActive } from '../services/maintenance-mode.js';
import { hasActiveRestoreMarker } from '../services/restore-marker.js';
import path from 'node:path';
import fs from 'node:fs';

function error(reply: any, e: unknown) {
  if (e instanceof BackupHttpError) return reply.status(e.statusCode).send({ error: e.code, message: e.message, ...(e.details !== undefined ? { details: e.details } : {}) });
  if (e instanceof CommissionerHttpError) return reply.status(e.statusCode).send(commissionerErrorBody(e));
  if (e instanceof z.ZodError) return reply.status(400).send({ error: 'InvalidBackupRequest', message: 'Invalid backup request', details: e.issues });
  throw e;
}

function requireCommissionerAccess(q: any) {
  if (!hasCommissionerHeader(q.headers)) {
    throw new CommissionerHttpError(403, 'CommissionerModeRequired', 'Commissioner Mode header required');
  }
  if (!areCommissionerWritesEnabled()) {
    throw new CommissionerHttpError(403, 'CommissionerModeRequired', 'Commissioner writes are disabled (FHM_COMMISSIONER_WRITES_ENABLED=false)');
  }
}

function commissionerSource(q: any): 'COMMISSIONER_UI' | 'COMMISSIONER_API' {
  const v = (q.headers as Record<string, unknown>)['x-fhm-commissioner-source'];
  return v === 'COMMISSIONER_UI' ? 'COMMISSIONER_UI' : 'COMMISSIONER_API';
}

/** Block writes when maintenance/restore is active. */
async function requireNotInMaintenance() {
  const snapshot = await getActiveBackupSnapshot(prisma);
  const root = ensureBackupRoot(snapshot.config);
  if (isMaintenanceActive(root) || hasActiveRestoreMarker(root)) {
    throw new BackupHttpError(503, 'MaintenanceMode', 'Server is in maintenance/recovery mode');
  }
}

export async function registerCommissionerBackupRecoveryRoutes(app: FastifyInstance) {
  // ---- Inventory ----
  app.get('/api/commissioner/backups', async (q, r) => {
    try {
      requireCommissionerAccess(q);
      const filter: Record<string, unknown> = {};
      const sq = q.query as Record<string, string | undefined>;
      if (sq.status) filter.status = sq.status;
      if (sq.backupType) filter.backupType = sq.backupType;
      if (sq.reasonCode) filter.reasonCode = sq.reasonCode;
      if (sq.protected !== undefined) filter.protected = sq.protected === 'true';
      const items = await listBackups({
        filter,
        sort: sq.sort,
        order: sq.order === 'asc' ? 'asc' : 'desc',
        limit: sq.limit ? Number(sq.limit) : 100,
      });
      return listResponse(items);
    } catch (e) { return error(r, e); }
  });

  app.get('/api/commissioner/backups/:id', async (q, r) => {
    try {
      requireCommissionerAccess(q);
      const id = (q.params as any).id as string;
      const detail = await getBackupDetail(id);
      // Load manifest DTO lazily.
      const snapshot = await getActiveBackupSnapshot(prisma);
      const root = ensureBackupRoot(snapshot.config);
      const row = await prisma.databaseBackup.findUniqueOrThrow({ where: { id } });
      let manifest: unknown = null;
      if (row.manifestRelativePath) {
        try {
          manifest = readManifestFile(resolveBackupFile(root, row.manifestRelativePath));
        } catch { manifest = null; }
      }
      return detailResponse({ ...detail, manifest });
    } catch (e) { return error(r, e); }
  });

  // ---- Preview / create ----
  app.post('/api/commissioner/backups/preview', async (q, r) => {
    try {
      requireCommissionerAccess(q);
      const snapshot = await getActiveBackupSnapshot(prisma);
      return detailResponse({
        previewOnly: true,
        configVersion: snapshot.version,
        storage: { directory: snapshot.config.storage.directory },
        limits: snapshot.config.limits,
      });
    } catch (e) { return error(r, e); }
  });

  app.post('/api/commissioner/backups', async (q, r) => {
    try {
      requireCommissionerAccess(q);
      const body = z.object({
        backupType: z.enum(['MANUAL', 'AUTOMATIC_OPERATION', 'PRE_RESTORE', 'RECOVERY_GENERATED']).default('MANUAL'),
        reasonCode: z.enum(['MANUAL', 'REGULAR_SEASON_SIMULATION', 'PLAYOFF_SIMULATION', 'COMPETITION_ARCHIVE', 'AGGREGATED_SIMULATION', 'INTERNATIONAL_TOURNAMENT', 'PLAYER_DEVELOPMENT', 'YOUTH_GENERATION', 'DRAFT_START', 'TRADE_ACCEPTANCE', 'CONTRACT_INITIALIZATION', 'CONTRACT_EXPIRATION', 'SEASON_TRANSITION', 'PRE_RESTORE', 'OTHER']).default('MANUAL'),
        reasonText: z.string().optional(),
        sourceOperationType: z.string().nullable().optional(),
        sourceOperationId: z.string().nullable().optional(),
        sourceEntityType: z.string().nullable().optional(),
        sourceEntityId: z.string().nullable().optional(),
        protected: z.boolean().optional(),
      }).parse(q.body);
      const source = commissionerSource(q);
      const result = await createDatabaseBackup({
        backupType: body.backupType,
        reasonCode: body.reasonCode,
        reasonText: body.reasonText,
        sourceOperationType: body.sourceOperationType ?? null,
        sourceOperationId: body.sourceOperationId ?? null,
        sourceEntityType: body.sourceEntityType ?? null,
        sourceEntityId: body.sourceEntityId ?? null,
        protected: body.protected,
        requestedBy: source,
      });
      // Audit Commissioner-initiated backup creation (operation-linked
      // automatic backups are not audited per-row to avoid noise).
      if (body.backupType === 'MANUAL') {
        await prisma.commissionerAuditLog.create({
          data: {
            entityType: 'DATABASE_BACKUP',
            entityId: result.backup.id,
            action: 'BACKUP_CREATED',
            reason: body.reasonText ?? body.reasonCode,
            beforeJson: JSON.stringify(null),
            afterJson: JSON.stringify({ status: result.backup.status, reasonCode: result.backup.reasonCode, reused: result.reused }),
            changedFieldsJson: JSON.stringify(['backupSystem']),
            source,
          },
        });
      }
      return detailResponse({ backup: mapBackup(result.backup), reused: result.reused });
    } catch (e) { return error(r, e); }
  });

  // ---- Verify ----
  app.post('/api/commissioner/backups/:id/verify', async (q, r) => {
    try {
      requireCommissionerAccess(q);
      const id = (q.params as any).id as string;
      const result = await verifyBackupCommand(id, commissionerSource(q));
      return detailResponse(result);
    } catch (e) { return error(r, e); }
  });

  // ---- Download ----
  app.get('/api/commissioner/backups/:id/download', async (q, r) => {
    try {
      requireCommissionerAccess(q);
      const id = (q.params as any).id as string;
      const { stream, fileName, size } = await getBackupDownloadStream(id);
      r.header('Content-Disposition', `attachment; filename="${fileName}"`);
      r.header('Content-Type', 'application/octet-stream');
      r.header('Content-Length', size);
      return r.send(stream);
    } catch (e) { return error(r, e); }
  });

  // ---- Storage scan ----
  app.post('/api/commissioner/backups/storage-scan', async (q, r) => {
    try {
      requireCommissionerAccess(q);
      const result = await scanBackupStorage();
      return detailResponse(result);
    } catch (e) { return error(r, e); }
  });

  // ---- Retention ----
  app.post('/api/commissioner/backups/prune-preview', async (q, r) => {
    try {
      requireCommissionerAccess(q);
      const result = await previewRetentionPlan();
      return detailResponse(result);
    } catch (e) { return error(r, e); }
  });

  app.post('/api/commissioner/backups/prune', async (q, r) => {
    try {
      requireCommissionerAccess(q);
      const body = z.object({
        reason: z.string().min(1),
        restrictToIds: z.array(z.string()).optional(),
      }).parse(q.body);
      const result = await executeRetentionPrune({
        reason: body.reason,
        requestedBy: commissionerSource(q),
        restrictToIds: body.restrictToIds,
      });
      return detailResponse({ pruned: result.pruned.map(mapBackup), skippedProtected: result.skippedProtected });
    } catch (e) { return error(r, e); }
  });

  // ---- Protect / unprotect ----
  app.post('/api/commissioner/backups/:id/protect', async (q, r) => {
    try {
      requireCommissionerAccess(q);
      const id = (q.params as any).id as string;
      const body = z.object({ reason: z.string().min(1) }).parse(q.body);
      const backup = await protectBackup({ backupId: id, reason: body.reason, requestedBy: commissionerSource(q) });
      return detailResponse(mapBackup(backup));
    } catch (e) { return error(r, e); }
  });

  app.post('/api/commissioner/backups/:id/unprotect', async (q, r) => {
    try {
      requireCommissionerAccess(q);
      const id = (q.params as any).id as string;
      const body = z.object({ reason: z.string().min(1) }).parse(q.body);
      const backup = await unprotectBackup({ backupId: id, reason: body.reason, requestedBy: commissionerSource(q) });
      return detailResponse(mapBackup(backup));
    } catch (e) { return error(r, e); }
  });

  // ---- Restore preview / prepare ----
  app.post('/api/commissioner/backups/:backupId/restore-preview', async (q, r) => {
    try {
      requireCommissionerAccess(q);
      const backupId = (q.params as any).backupId as string;
      const result = await previewRestore({ backupId });
      return detailResponse(result);
    } catch (e) { return error(r, e); }
  });

  app.post('/api/commissioner/backups/:backupId/restore-prepare', async (q, r) => {
    try {
      requireCommissionerAccess(q);
      const backupId = (q.params as any).backupId as string;
      const body = z.object({
        expectedBackupUpdatedAt: z.string(),
        expectedCurrentDatabaseFingerprint: z.string(),
        reason: z.string().min(1),
        requestedBy: z.string().min(1),
      }).parse(q.body);
      const result = await prepareRestore({
        backupId,
        expectedBackupUpdatedAt: body.expectedBackupUpdatedAt,
        expectedCurrentDatabaseFingerprint: body.expectedCurrentDatabaseFingerprint,
        reason: body.reason,
        requestedBy: body.requestedBy,
      });
      return detailResponse({
        runId: result.run.id,
        status: result.run.status,
        restartRequired: result.restartRequired,
        confirmationPhrase: result.confirmationPhrase,
      });
    } catch (e) { return error(r, e); }
  });

  // ---- Restore runs ----
  app.get('/api/commissioner/restores', async (q, r) => {
    try {
      requireCommissionerAccess(q);
      const sq = q.query as Record<string, string | undefined>;
      const items = await listRestoreRuns(sq.limit ? Number(sq.limit) : 50);
      return listResponse(items);
    } catch (e) { return error(r, e); }
  });

  app.get('/api/commissioner/restores/:id', async (q, r) => {
    try {
      requireCommissionerAccess(q);
      const id = (q.params as any).id as string;
      const run = await getRestoreRun(id);
      const events = await prisma.databaseRestoreEvent.findMany({
        where: { restoreRunId: id },
        orderBy: { createdAt: 'asc' },
      });
      return detailResponse({ ...run, events });
    } catch (e) { return error(r, e); }
  });

  app.post('/api/commissioner/restores/:id/request-restart', async (q, r) => {
    try {
      requireCommissionerAccess(q);
      const id = (q.params as any).id as string;
      const body = z.object({ confirmationPhrase: z.string().min(1) }).parse(q.body);
      const result = await requestRestart({
        runId: id,
        confirmationPhrase: body.confirmationPhrase,
        requestedBy: commissionerSource(q),
      });
      return detailResponse({ runId: result.run.id, status: result.run.status, restartRequired: result.restartRequired });
    } catch (e) { return error(r, e); }
  });

  app.post('/api/commissioner/restores/:id/cancel', async (q, r) => {
    try {
      requireCommissionerAccess(q);
      const id = (q.params as any).id as string;
      const body = z.object({ reason: z.string().min(1) }).parse(q.body);
      const run = await cancelRestore({ runId: id, reason: body.reason, requestedBy: commissionerSource(q) });
      return detailResponse(run);
    } catch (e) { return error(r, e); }
  });

  // ---- Recovery journal ----
  app.get('/api/commissioner/recovery-journal', async (q, r) => {
    try {
      requireCommissionerAccess(q);
      const snapshot = await getActiveBackupSnapshot(prisma);
      const root = ensureBackupRoot(snapshot.config);
      return listResponse(listJournalEntries(root));
    } catch (e) { return error(r, e); }
  });

  app.get('/api/commissioner/recovery-journal/:id', async (q, r) => {
    try {
      requireCommissionerAccess(q);
      const id = (q.params as any).id as string;
      const snapshot = await getActiveBackupSnapshot(prisma);
      const root = ensureBackupRoot(snapshot.config);
      return detailResponse(getJournalEntry(root, id));
    } catch (e) { return error(r, e); }
  });

  // ---- Configurations ----
  app.get('/api/commissioner/backup-configurations', async (q, r) => {
    try {
      requireCommissionerAccess(q);
      return listResponse(await listBackupConfigurations(prisma));
    } catch (e) { return error(r, e); }
  });

  app.post('/api/commissioner/backup-configurations', async (q, r) => {
    try {
      requireCommissionerAccess(q);
      const body = z.object({
        name: z.string().min(1),
        description: z.string().nullable().optional(),
        config: z.record(z.string(), z.unknown()),
        activate: z.boolean().optional(),
        reason: z.string().min(1),
      }).parse(q.body);
      const created = await createBackupPreset(body, commissionerSource(q));
      return detailResponse({ id: created.id });
    } catch (e) { return error(r, e); }
  });

  app.post('/api/commissioner/backup-configurations/:presetId/versions', async (q, r) => {
    try {
      requireCommissionerAccess(q);
      const presetId = (q.params as any).presetId as string;
      const body = z.object({
        config: z.record(z.string(), z.unknown()),
        activate: z.boolean().optional(),
        reason: z.string().min(1),
      }).parse(q.body);
      const version = await createBackupVersion(presetId, body, commissionerSource(q));
      return detailResponse({ id: version.id });
    } catch (e) { return error(r, e); }
  });

  app.post('/api/commissioner/backup-configuration-versions/:versionId/activate', async (q, r) => {
    try {
      requireCommissionerAccess(q);
      const versionId = (q.params as any).versionId as string;
      const body = z.object({ reason: z.string().min(1) }).parse(q.body);
      await activateBackupVersion(versionId, body.reason, commissionerSource(q));
      return detailResponse({ activated: true, versionId });
    } catch (e) { return error(r, e); }
  });
}
