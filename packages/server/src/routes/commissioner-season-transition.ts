import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { detailResponse, listResponse } from '../http.js';
import { CommissionerHttpError, commissionerErrorBody } from '../commissioner/errors.js';
import { hasCommissionerHeader, areCommissionerWritesEnabled, COMMISSIONER_HEADER, COMMISSIONER_HEADER_VALUE } from '../commissioner/gate.js';
import { SeasonTransitionHttpError } from '../services/season-transition-errors.js';
import {
  cancelSeasonTransitionRun,
  executeSeasonTransitionRun,
  getSeasonTransitionRun,
  prepareSeasonTransitionRun,
} from '../services/season-transition-runs.js';
import { computePreview } from '../services/season-transition-readiness.js';
import {
  activateSeasonTransitionVersion,
  auditSeasonTransitionRun,
  createSeasonTransitionPreset,
  createSeasonTransitionVersion,
} from '../services/commissioner-season-transition.js';
import { prisma } from '../db/client.js';

function error(reply: any, e: unknown) {
  if (e instanceof SeasonTransitionHttpError) return reply.status(e.statusCode).send({ error: e.code, message: e.message, details: e.details });
  if (e instanceof CommissionerHttpError) return reply.status(e.statusCode).send(commissionerErrorBody(e));
  if (e instanceof z.ZodError) return reply.status(400).send({ error: 'InvalidSeasonTransitionRequest', message: 'Invalid season-transition request', details: e.issues });
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

export async function registerCommissionerSeasonTransitionRoutes(app: FastifyInstance) {
  // Preview (POST — Commissioner-only for convenience, but no writes).
  app.post('/api/commissioner/season-transitions/preview', async (q, r) => {
    try {
      requireCommissionerAccess(q);
      const body = z.object({
        sourceWorldSeasonId: z.string(),
        configVersionId: z.string().optional(),
        targetDisplayNameOverride: z.string().nullable().optional(),
      }).parse(q.body);
      const result = await computePreview(prisma, body.sourceWorldSeasonId, {
        configVersionId: body.configVersionId,
        targetDisplayNameOverride: body.targetDisplayNameOverride ?? null,
      });
      return detailResponse({ previewOnly: true, inputHash: result.inputHash, readiness: result.readiness });
    } catch (e) { return error(r, e); }
  });

  // Prepare.
  app.post('/api/commissioner/season-transitions/prepare', async (q, r) => {
    try {
      requireCommissionerAccess(q);
      const body = z.object({
        sourceWorldSeasonId: z.string(),
        configVersionId: z.string().optional(),
        targetDisplayNameOverride: z.string().nullable().optional(),
        expectedSourceSeasonUpdatedAt: z.string().optional(),
        reason: z.string().min(1),
        createdBy: z.string().min(1),
      }).parse(q.body);
      const run = await prepareSeasonTransitionRun({
        sourceWorldSeasonId: body.sourceWorldSeasonId,
        configVersionId: body.configVersionId,
        targetDisplayNameOverride: body.targetDisplayNameOverride ?? null,
        expectedSourceSeasonUpdatedAt: body.expectedSourceSeasonUpdatedAt,
        reason: body.reason,
        createdBy: body.createdBy,
      });
      await auditSeasonTransitionRun('SEASON_TRANSITION_RUN', run.id, 'SEASON_TRANSITION_PREPARED', body.reason, { status: run.status }, commissionerSource(q));
      return detailResponse(run);
    } catch (e) { return error(r, e); }
  });

  // Execute.
  app.post<{ Params: { runId: string } }>('/api/commissioner/season-transitions/:runId/execute', async (q, r) => {
    try {
      requireCommissionerAccess(q);
      const body = z.object({
        expectedUpdatedAt: z.string().optional(),
        reason: z.string().min(1),
      }).parse(q.body ?? { reason: 'Execute season transition' });
      const run = await executeSeasonTransitionRun(q.params.runId, { expectedUpdatedAt: body.expectedUpdatedAt, reason: body.reason });
      if (run.status === 'COMPLETED' && run.targetWorldSeasonId) {
        await auditSeasonTransitionRun('WORLD_SEASON', run.targetWorldSeasonId, 'WORLD_SEASON_CREATED', body.reason, { id: run.targetWorldSeasonId, label: run.targetWorldSeason?.label }, commissionerSource(q));
        await auditSeasonTransitionRun('SEASON_TRANSITION_RUN', run.id, 'SEASON_TRANSITION_COMPLETED', body.reason, { status: run.status, targetWorldSeasonId: run.targetWorldSeasonId }, commissionerSource(q));
        await auditSeasonTransitionRun('WORLD_SEASON', run.sourceWorldSeasonId, 'CURRENT_WORLD_SEASON_CHANGED', body.reason, { from: run.sourceWorldSeasonId, to: run.targetWorldSeasonId }, commissionerSource(q));
      }
      return detailResponse(run);
    } catch (e) { return error(r, e); }
  });

  // Cancel/discard (PREPARED or FAILED only).
  app.delete<{ Params: { runId: string } }>('/api/commissioner/season-transitions/:runId', async (q, r) => {
    try {
      requireCommissionerAccess(q);
      const body = z.object({
        expectedUpdatedAt: z.string().optional(),
        reason: z.string().min(1),
      }).parse(q.body ?? { reason: 'Discard prepared transition' });
      const run = await cancelSeasonTransitionRun(q.params.runId, { expectedUpdatedAt: body.expectedUpdatedAt, reason: body.reason });
      await auditSeasonTransitionRun('SEASON_TRANSITION_RUN', run.id, 'SEASON_TRANSITION_CANCELLED', body.reason, { status: run.status }, commissionerSource(q));
      return detailResponse(run);
    } catch (e) { return error(r, e); }
  });

  // Retry a FAILED transition: re-prepare from the current live state.
  app.post<{ Params: { runId: string } }>('/api/commissioner/season-transitions/:runId/retry', async (q, r) => {
    try {
      requireCommissionerAccess(q);
      const existing = await getSeasonTransitionRun(q.params.runId);
      if (existing.status !== 'FAILED') {
        return r.status(409).send({ error: 'SeasonTransitionNotPrepared', message: 'Only FAILED transitions can be retried' });
      }
      // Cancel the FAILED record, then re-prepare from the same source.
      await cancelSeasonTransitionRun(q.params.runId, { reason: 'Retry after failure' });
      let override: string | null = null;
      try { override = (JSON.parse(existing.inputSnapshotText) as { targetDisplayNameOverride?: string | null }).targetDisplayNameOverride ?? null; } catch { override = null; }
      const run = await prepareSeasonTransitionRun({
        sourceWorldSeasonId: existing.sourceWorldSeasonId,
        configVersionId: existing.configVersionId,
        targetDisplayNameOverride: override,
        reason: 'Retry season transition after failure',
        createdBy: 'commissioner-retry',
      });
      return detailResponse(run);
    } catch (e) { return error(r, e); }
  });

  // Diagnostics (Commissioner-only).
  app.get<{ Params: { runId: string } }>('/api/commissioner/season-transitions/:runId/diagnostics', async (q, r) => {
    try {
      if (!hasCommissionerHeader(q.headers)) throw new CommissionerHttpError(403, 'CommissionerModeRequired', 'Commissioner Mode header required');
      const run = await getSeasonTransitionRun(q.params.runId);
      return detailResponse({
        id: run.id,
        status: run.status,
        configHash: run.configHash,
        inputHash: run.inputHash,
        planHash: run.planHash,
        resultHash: run.resultHash,
        targetSeasonOrder: run.targetSeasonOrder,
        targetDisplayName: run.targetDisplayName,
        backupMetadataText: run.backupMetadataText,
        inputSnapshotText: run.inputSnapshotText,
        planSnapshotText: run.planSnapshotText,
      });
    } catch (e) { return error(r, e); }
  });

  // Configuration CRUD.
  app.post('/api/commissioner/season-transition-configurations', async (q, r) => {
    try {
      requireCommissionerAccess(q);
      const body = z.object({
        name: z.string().min(1),
        description: z.string().nullable().optional(),
        config: z.unknown(),
        activate: z.boolean().optional(),
        reason: z.string().min(1),
      }).parse(q.body);
      const preset = await createSeasonTransitionPreset(body as { name: string; description?: string | null; config: unknown; activate?: boolean; reason: string }, commissionerSource(q));
      return detailResponse(preset);
    } catch (e) { return error(r, e); }
  });

  app.post<{ Params: { presetId: string } }>('/api/commissioner/season-transition-configurations/:presetId/versions', async (q, r) => {
    try {
      requireCommissionerAccess(q);
      const body = z.object({
        config: z.unknown(),
        activate: z.boolean().optional(),
        reason: z.string().min(1),
      }).parse(q.body);
      const version = await createSeasonTransitionVersion(q.params.presetId, body as { config: unknown; activate?: boolean; reason: string }, commissionerSource(q));
      return detailResponse(version);
    } catch (e) { return error(r, e); }
  });

  app.post<{ Params: { versionId: string } }>('/api/commissioner/season-transition-configuration-versions/:versionId/activate', async (q, r) => {
    try {
      requireCommissionerAccess(q);
      const body = z.object({ reason: z.string().min(1) }).parse(q.body ?? { reason: 'Activate season-transition configuration' });
      const version = await activateSeasonTransitionVersion(q.params.versionId, body.reason, commissionerSource(q));
      return detailResponse(version);
    } catch (e) { return error(r, e); }
  });

  // List configurations (commissioner variant for convenience; same as public).
  app.get('/api/commissioner/season-transition-configurations', async (_q, r) => {
    try {
      return listResponse(await (await import('../services/season-transition-config.js')).listSeasonTransitionConfigurations(prisma));
    } catch (e) { return error(r, e); }
  });
}

// Re-export header constants for tests.
export { COMMISSIONER_HEADER, COMMISSIONER_HEADER_VALUE };
