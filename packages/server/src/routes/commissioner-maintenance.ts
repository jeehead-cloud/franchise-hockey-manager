import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import fs from 'node:fs';
import { detailResponse, listResponse, paginatedResponse } from '../http.js';
import { CommissionerHttpError, commissionerErrorBody } from '../commissioner/errors.js';
import { hasCommissionerHeader, areCommissionerWritesEnabled } from '../commissioner/gate.js';
import { MaintenanceHttpError } from '../services/maintenance-errors.js';
import { prisma } from '../db/client.js';
import {
  previewExport,
  generateExport,
  listExportRuns,
  getExportRunDetail,
  readExportFile,
  readManifestFile,
  deleteExportRun,
  pruneOldExports,
} from '../services/maintenance-exports.js';
import {
  uploadImportFile,
  previewImport,
  applyImport,
  cancelImport,
  listImportRuns,
  getImportRunDetail,
  listImportIssues,
} from '../services/maintenance-imports.js';
import {
  runDatabaseValidation,
  listValidationRuns,
  getValidationRunDetail,
} from '../services/maintenance-validation.js';
import {
  previewReset,
  prepareReset,
  executeReset,
  cancelReset,
  listResetRuns,
  getResetRunDetail,
} from '../services/maintenance-reset.js';
import { generateFullDatabasePackage } from '../services/maintenance-package.js';
import { listMaintenanceEvents } from '../services/maintenance-history.js';
import {
  createMaintenancePreset,
  createMaintenanceVersion,
  activateMaintenanceVersion,
  getActiveMaintenanceSnapshot,
  listMaintenanceConfigurations,
  loadMaintenanceConfigVersion,
} from '../services/commissioner-maintenance.js';
import { getActiveBackupSnapshot } from '../services/backup-config.js';
import { ensureBackupRoot } from '../services/backup-paths.js';
import { isMaintenanceActive } from '../services/maintenance-mode.js';
import { hasActiveRestoreMarker } from '../services/restore-marker.js';
import { isRestoreOrMaintenanceActive } from '../services/maintenance-status-utils.js';

function error(reply: any, e: unknown) {
  if (e instanceof MaintenanceHttpError) return reply.status(e.statusCode).send({ error: e.code, message: e.message, ...(e.details !== undefined ? { details: e.details } : {}) });
  if (e instanceof CommissionerHttpError) return reply.status(e.statusCode).send(commissionerErrorBody(e));
  if (e instanceof z.ZodError) return reply.status(400).send({ error: 'InvalidMaintenanceRequest', message: 'Invalid maintenance request', details: e.issues });
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

async function requireNotInMaintenance() {
  if (await isRestoreOrMaintenanceActive()) {
    throw new MaintenanceHttpError(503, 'MaintenanceMode', 'Server is in maintenance/recovery mode');
  }
}

export async function registerCommissionerMaintenanceRoutes(app: FastifyInstance) {
  // ---- Exports ----
  app.post('/api/commissioner/maintenance/exports/preview', async (q, r) => {
    try {
      requireCommissionerAccess(q);
      const body = q.body as Record<string, unknown>;
      const result = await previewExport({
        exportType: body.exportType as never,
        filters: (body.filters as Record<string, unknown>) ?? {},
        reason: String(body.reason ?? ''),
      });
      return detailResponse(result);
    } catch (e) { return error(r, e); }
  });

  app.post('/api/commissioner/maintenance/exports', async (q, r) => {
    try {
      requireCommissionerAccess(q);
      await requireNotInMaintenance();
      const body = q.body as Record<string, unknown>;
      const exportType = body.exportType as string;
      if (exportType === 'FULL_DATABASE_PACKAGE') {
        const result = await generateFullDatabasePackage({
          reason: String(body.reason ?? ''),
          requestedBy: commissionerSource(q),
        });
        return detailResponse(result);
      }
      const result = await generateExport({
        exportType: exportType as never,
        filters: (body.filters as Record<string, unknown>) ?? {},
        reason: String(body.reason ?? ''),
        requestedBy: commissionerSource(q),
      });
      return detailResponse(result);
    } catch (e) { return error(r, e); }
  });

  app.get('/api/commissioner/maintenance/exports', async (q, r) => {
    try {
      requireCommissionerAccess(q);
      const sq = q.query as Record<string, string | undefined>;
      const result = await listExportRuns({
        exportType: sq.exportType,
        status: sq.status,
        limit: sq.limit ? Number(sq.limit) : 100,
        offset: sq.offset ? Number(sq.offset) : 0,
      });
      return paginatedResponse({ items: result.items, page: 1, pageSize: result.limit, total: result.total });
    } catch (e) { return error(r, e); }
  });

  app.get('/api/commissioner/maintenance/exports/:id', async (q, r) => {
    try {
      requireCommissionerAccess(q);
      const id = (q.params as any).id as string;
      const detail = await getExportRunDetail(id);
      const manifest = await readManifestFile(id);
      return detailResponse({ ...detail, manifest: manifest?.content ?? null });
    } catch (e) { return error(r, e); }
  });

  app.get('/api/commissioner/maintenance/exports/:id/download', async (q, r) => {
    try {
      requireCommissionerAccess(q);
      const id = (q.params as any).id as string;
      const { absolutePath, fileName, mimeType } = await readExportFile(id);
      const stream = fs.createReadStream(absolutePath);
      return r.type(mimeType).header('content-disposition', `attachment; filename="${fileName}"`).send(stream);
    } catch (e) { return error(r, e); }
  });

  app.delete('/api/commissioner/maintenance/exports/:id', async (q, r) => {
    try {
      requireCommissionerAccess(q);
      const id = (q.params as any).id as string;
      await deleteExportRun(id);
      return detailResponse({ id, deleted: true });
    } catch (e) { return error(r, e); }
  });

  app.post('/api/commissioner/maintenance/exports/prune', async (q, r) => {
    try {
      requireCommissionerAccess(q);
      const snapshot = await getActiveMaintenanceSnapshot(prisma);
      const result = await pruneOldExports(snapshot.config);
      return detailResponse(result);
    } catch (e) { return error(r, e); }
  });

  // ---- Imports ----
  app.post('/api/commissioner/maintenance/imports/upload', async (q, r) => {
    try {
      requireCommissionerAccess(q);
      await requireNotInMaintenance();
      // Parse the multipart form: one file field + scalar fields. We collect
      // all fields then pull out the file separately (single-file upload).
      const parts = q.parts();
      let fileBuffer: Buffer | null = null;
      let originalFileName = '';
      let contentType = '';
      const fields: Record<string, string> = {};
      for await (const part of parts) {
        if (part.type === 'file') {
          fileBuffer = await part.toBuffer();
          originalFileName = part.filename;
          contentType = part.mimetype;
        } else {
          // scalar field — `value` is the string content.
          fields[part.fieldname] = String(part.value ?? '');
        }
      }
      if (!fileBuffer) throw new MaintenanceHttpError(400, 'InvalidImportFile', 'No file uploaded');
      const result = await uploadImportFile({
        importType: fields.importType as never,
        fileBuffer,
        originalFileName,
        contentType,
        reason: fields.reason ?? '',
        requestedBy: commissionerSource(q),
      });
      return detailResponse(result);
    } catch (e) { return error(r, e); }
  });

  app.post('/api/commissioner/maintenance/imports/:id/preview', async (q, r) => {
    try {
      requireCommissionerAccess(q);
      const id = (q.params as any).id as string;
      const body = (q.body as Record<string, unknown>) ?? {};
      const result = await previewImport({
        importRunId: id,
        duplicatePolicy: (body.duplicatePolicy as never) ?? 'SKIP_IDENTICAL',
      });
      return detailResponse(result);
    } catch (e) { return error(r, e); }
  });

  app.post('/api/commissioner/maintenance/imports/:id/apply', async (q, r) => {
    try {
      requireCommissionerAccess(q);
      await requireNotInMaintenance();
      const id = (q.params as any).id as string;
      const body = (q.body as Record<string, unknown>) ?? {};
      const result = await applyImport({
        importRunId: id,
        expectedPreviewHash: String(body.expectedPreviewHash ?? ''),
        reason: String(body.reason ?? ''),
        source: commissionerSource(q),
        requestedBy: commissionerSource(q),
      });
      return detailResponse(result);
    } catch (e) { return error(r, e); }
  });

  app.post('/api/commissioner/maintenance/imports/:id/cancel', async (q, r) => {
    try {
      requireCommissionerAccess(q);
      const id = (q.params as any).id as string;
      await cancelImport(id);
      return detailResponse({ id, cancelled: true });
    } catch (e) { return error(r, e); }
  });

  app.get('/api/commissioner/maintenance/imports', async (q, r) => {
    try {
      requireCommissionerAccess(q);
      const sq = q.query as Record<string, string | undefined>;
      const result = await listImportRuns({
        importType: sq.importType,
        status: sq.status,
        limit: sq.limit ? Number(sq.limit) : 100,
        offset: sq.offset ? Number(sq.offset) : 0,
      });
      return paginatedResponse({ items: result.items, page: 1, pageSize: result.limit, total: result.total });
    } catch (e) { return error(r, e); }
  });

  app.get('/api/commissioner/maintenance/imports/:id', async (q, r) => {
    try {
      requireCommissionerAccess(q);
      const id = (q.params as any).id as string;
      const detail = await getImportRunDetail(id);
      return detailResponse(detail);
    } catch (e) { return error(r, e); }
  });

  app.get('/api/commissioner/maintenance/imports/:id/issues', async (q, r) => {
    try {
      requireCommissionerAccess(q);
      const id = (q.params as any).id as string;
      const sq = q.query as Record<string, string | undefined>;
      const result = await listImportIssues(id, {
        severity: sq.severity,
        limit: sq.limit ? Number(sq.limit) : 100,
        offset: sq.offset ? Number(sq.offset) : 0,
      });
      return paginatedResponse({ items: result.items, page: 1, pageSize: result.limit, total: result.total });
    } catch (e) { return error(r, e); }
  });

  // ---- Validation ----
  app.post('/api/commissioner/maintenance/validation-runs', async (q, r) => {
    try {
      requireCommissionerAccess(q);
      const body = (q.body as Record<string, unknown>) ?? {};
      const result = await runDatabaseValidation({
        reason: String(body.reason ?? ''),
        requestedBy: commissionerSource(q),
      });
      return detailResponse(result);
    } catch (e) { return error(r, e); }
  });

  app.get('/api/commissioner/maintenance/validation-runs', async (q, r) => {
    try {
      requireCommissionerAccess(q);
      const sq = q.query as Record<string, string | undefined>;
      const result = await listValidationRuns({
        status: sq.status,
        limit: sq.limit ? Number(sq.limit) : 100,
        offset: sq.offset ? Number(sq.offset) : 0,
      });
      return paginatedResponse({ items: result.items, page: 1, pageSize: result.limit, total: result.total });
    } catch (e) { return error(r, e); }
  });

  app.get('/api/commissioner/maintenance/validation-runs/:id', async (q, r) => {
    try {
      requireCommissionerAccess(q);
      const id = (q.params as any).id as string;
      const detail = await getValidationRunDetail(id);
      return detailResponse(detail);
    } catch (e) { return error(r, e); }
  });

  app.get('/api/commissioner/maintenance/validation-runs/:id/download', async (q, r) => {
    try {
      requireCommissionerAccess(q);
      const id = (q.params as any).id as string;
      const detail = await getValidationRunDetail(id);
      const body = JSON.stringify(detail, null, 2);
      return r.type('application/json').header('content-disposition', `attachment; filename="validation-${id}.json"`).send(body);
    } catch (e) { return error(r, e); }
  });

  // ---- Reset ----
  app.post('/api/commissioner/maintenance/reset/preview', async (q, r) => {
    try {
      requireCommissionerAccess(q);
      const body = (q.body as Record<string, unknown>) ?? {};
      const result = await previewReset({ mode: body.mode as never });
      return detailResponse(result);
    } catch (e) { return error(r, e); }
  });

  app.post('/api/commissioner/maintenance/reset/prepare', async (q, r) => {
    try {
      requireCommissionerAccess(q);
      const body = (q.body as Record<string, unknown>) ?? {};
      const result = await prepareReset({
        mode: body.mode as never,
        reason: String(body.reason ?? ''),
        requestedBy: commissionerSource(q),
      });
      return detailResponse(result);
    } catch (e) { return error(r, e); }
  });

  app.post('/api/commissioner/maintenance/reset/:id/execute', async (q, r) => {
    try {
      requireCommissionerAccess(q);
      await requireNotInMaintenance();
      const id = (q.params as any).id as string;
      const body = (q.body as Record<string, unknown>) ?? {};
      const result = await executeReset({
        runId: id,
        typedConfirmation: String(body.typedConfirmation ?? ''),
        expectedPreviewHash: String(body.expectedPreviewHash ?? ''),
        currentDatabaseFingerprint: String(body.currentDatabaseFingerprint ?? ''),
        reason: String(body.reason ?? ''),
        source: commissionerSource(q),
        requestedBy: commissionerSource(q),
      });
      return detailResponse(result);
    } catch (e) { return error(r, e); }
  });

  app.post('/api/commissioner/maintenance/reset/:id/cancel', async (q, r) => {
    try {
      requireCommissionerAccess(q);
      const id = (q.params as any).id as string;
      await cancelReset(id);
      return detailResponse({ id, cancelled: true });
    } catch (e) { return error(r, e); }
  });

  app.get('/api/commissioner/maintenance/reset-runs', async (q, r) => {
    try {
      requireCommissionerAccess(q);
      const sq = q.query as Record<string, string | undefined>;
      const result = await listResetRuns({
        status: sq.status,
        limit: sq.limit ? Number(sq.limit) : 100,
        offset: sq.offset ? Number(sq.offset) : 0,
      });
      return paginatedResponse({ items: result.items, page: 1, pageSize: result.limit, total: result.total });
    } catch (e) { return error(r, e); }
  });

  app.get('/api/commissioner/maintenance/reset-runs/:id', async (q, r) => {
    try {
      requireCommissionerAccess(q);
      const id = (q.params as any).id as string;
      const detail = await getResetRunDetail(id);
      return detailResponse(detail);
    } catch (e) { return error(r, e); }
  });

  // ---- History ----
  app.get('/api/commissioner/maintenance/events', async (q, r) => {
    try {
      requireCommissionerAccess(q);
      const sq = q.query as Record<string, string | undefined>;
      const result = await listMaintenanceEvents({
        filter: {
          entityType: sq.entityType,
          entityId: sq.entityId,
          eventType: sq.eventType,
        },
        limit: sq.limit ? Number(sq.limit) : 100,
        offset: sq.offset ? Number(sq.offset) : 0,
      });
      return paginatedResponse({ items: result.items, page: 1, pageSize: result.limit, total: result.total });
    } catch (e) { return error(r, e); }
  });

  // ---- Configuration ----
  app.get('/api/commissioner/maintenance/configurations', async (q, r) => {
    try {
      requireCommissionerAccess(q);
      const items = await listMaintenanceConfigurations(prisma);
      return listResponse(items);
    } catch (e) { return error(r, e); }
  });

  app.post('/api/commissioner/maintenance/configurations', async (q, r) => {
    try {
      requireCommissionerAccess(q);
      const body = q.body as Record<string, unknown>;
      const result = await createMaintenancePreset({
        name: String(body.name ?? ''),
        description: body.description as string | undefined,
        config: body.config,
        activate: Boolean(body.activate),
        reason: String(body.reason ?? ''),
      }, commissionerSource(q));
      return detailResponse(result);
    } catch (e) { return error(r, e); }
  });

  app.post('/api/commissioner/maintenance/configurations/:presetId/versions', async (q, r) => {
    try {
      requireCommissionerAccess(q);
      const presetId = (q.params as any).presetId as string;
      const body = q.body as Record<string, unknown>;
      const result = await createMaintenanceVersion({
        presetId,
        config: body.config,
        changeReason: String(body.changeReason ?? ''),
        activate: Boolean(body.activate),
        reason: String(body.reason ?? ''),
      }, commissionerSource(q));
      return detailResponse(result);
    } catch (e) { return error(r, e); }
  });

  app.post('/api/commissioner/maintenance/configuration-versions/:versionId/activate', async (q, r) => {
    try {
      requireCommissionerAccess(q);
      const versionId = (q.params as any).versionId as string;
      const body = (q.body as Record<string, unknown>) ?? {};
      const result = await activateMaintenanceVersion(versionId, String(body.reason ?? ''), commissionerSource(q));
      return detailResponse(result);
    } catch (e) { return error(r, e); }
  });
}
