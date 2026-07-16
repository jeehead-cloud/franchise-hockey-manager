import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { OffseasonError } from '@fhm/engine';
import { detailResponse, listResponse } from '../http.js';
import { CommissionerHttpError, commissionerErrorBody } from '../commissioner/errors.js';
import { hasCommissionerHeader, areCommissionerWritesEnabled } from '../commissioner/gate.js';
import { OffseasonHttpError } from '../services/offseason-errors.js';
import { listOffseasonConfigurations } from '../services/offseason-config.js';
import {
  cancelOffseasonRun,
  completeOffseasonRun,
  completePhase,
  createOffseasonRun,
  getOffseasonRun,
  linkPhaseOperation,
  refreshOffseasonRun,
  retryPhase,
  skipPhase,
  startOffseasonRun,
  startPhase,
} from '../services/offseason-runs.js';
import {
  activateOffseasonVersion,
  auditOffseasonRun,
  createOffseasonPreset,
  createOffseasonVersion,
} from '../services/commissioner-offseason.js';
import { gatherCompletionInput, runRowToState } from '../services/offseason-readiness.js';
import { loadConfigVersion } from '../services/offseason-runs.js';
import { prisma } from '../db/client.js';
import { aggregateCompletion } from '@fhm/engine';

function requireCommissionerAccess(q: any) {
  if (!hasCommissionerHeader(q.headers)) {
    throw new CommissionerHttpError(403, 'CommissionerModeRequired', 'Commissioner Mode header required');
  }
  if (!areCommissionerWritesEnabled()) {
    throw new CommissionerHttpError(403, 'CommissionerModeRequired', 'Commissioner writes are disabled (FHM_COMMISSIONER_WRITES_ENABLED=false)');
  }
}

function error(reply: any, e: unknown) {
  if (e instanceof OffseasonHttpError) return reply.status(e.statusCode).send({ error: e.code, message: e.message, details: e.details });
  if (e instanceof CommissionerHttpError) return reply.status(e.statusCode).send(commissionerErrorBody(e));
  if (e instanceof OffseasonError) {
    // Engine progression / dependency / reconciliation errors map to 409 / 422.
    const blockerCodes = new Set(['OffseasonPhaseDependencyIncomplete', 'OffseasonPhaseNotReady', 'OffseasonPhaseCannotSkip', 'OffseasonPhaseCompleted', 'OffseasonRunNotEditable']);
    const reconciliationCodes = new Set(['OffseasonPhaseReconciliationFailed']);
    const status = reconciliationCodes.has(e.code) ? 422 : blockerCodes.has(e.code) ? 409 : 400;
    return reply.status(status).send({ error: e.code, message: e.message, details: e.details });
  }
  if (e instanceof z.ZodError) return reply.status(400).send({ error: 'InvalidOffseasonRequest', message: 'Invalid offseason request', details: e.issues });
  throw e;
}

const reason = z.string().trim().min(1).max(500);
const expectedUpdatedAt = z.string().datetime().optional();
const source = (q: any): 'COMMISSIONER_UI' | 'COMMISSIONER_API' => (q.headers['x-fhm-commissioner-source'] === 'ui' ? 'COMMISSIONER_UI' : 'COMMISSIONER_API');

export async function registerCommissionerOffseasonRoutes(app: FastifyInstance) {
  // Configuration management.
  app.get('/api/commissioner/offseason/configurations', async (q, r) => {
    try {
      requireCommissionerAccess(q);
      return listResponse(await listOffseasonConfigurations(prisma));
    } catch (e) { return error(r, e); }
  });
  app.post('/api/commissioner/offseason/configurations', async (q, r) => {
    try {
      requireCommissionerAccess(q);
      const b = z.object({ name: z.string().min(1), description: z.string().nullable().optional(), config: z.unknown(), activate: z.boolean().optional(), reason }).parse(q.body);
      const item = await createOffseasonPreset(b, source(q));
      return detailResponse(item);
    } catch (e) { return error(r, e); }
  });
  app.post('/api/commissioner/offseason/configurations/:presetId/versions', async (q, r) => {
    try {
      requireCommissionerAccess(q);
      const b = z.object({ config: z.unknown(), activate: z.boolean().optional(), reason }).parse(q.body);
      const item = await createOffseasonVersion((q.params as any).presetId, b, source(q));
      return detailResponse(item);
    } catch (e) { return error(r, e); }
  });
  app.post('/api/commissioner/offseason/configuration-versions/:versionId/activate', async (q, r) => {
    try {
      requireCommissionerAccess(q);
      const b = z.object({ reason }).parse(q.body);
      const item = await activateOffseasonVersion((q.params as any).versionId, b.reason, source(q));
      return detailResponse(item);
    } catch (e) { return error(r, e); }
  });

  // Run lifecycle.
  app.post('/api/commissioner/offseason/runs', async (q, r) => {
    try {
      requireCommissionerAccess(q);
      const b = z.object({ worldSeasonId: z.string().min(1), configVersionId: z.string().optional(), reason, createdBy: z.string().min(1) }).parse(q.body);
      const item = await createOffseasonRun(b);
      await auditOffseasonRun('OFFSEASON_RUN', item.id, 'OFFSEASON_RUN_CREATED', b.reason, item, source(q));
      return detailResponse(item);
    } catch (e) { return error(r, e); }
  });
  app.post('/api/commissioner/offseason/runs/:id/start', async (q, r) => {
    try {
      requireCommissionerAccess(q);
      const b = z.object({ reason, expectedUpdatedAt }).parse(q.body);
      const item = await startOffseasonRun((q.params as any).id, b.expectedUpdatedAt, b.reason);
      await auditOffseasonRun('OFFSEASON_RUN', item.id, 'OFFSEASON_RUN_STARTED', b.reason, item, source(q));
      return detailResponse(item);
    } catch (e) { return error(r, e); }
  });
  app.post('/api/commissioner/offseason/runs/:id/cancel', async (q, r) => {
    try {
      requireCommissionerAccess(q);
      const b = z.object({ reason, expectedUpdatedAt }).parse(q.body);
      const item = await cancelOffseasonRun((q.params as any).id, b.expectedUpdatedAt, b.reason);
      await auditOffseasonRun('OFFSEASON_RUN', item.id, 'OFFSEASON_RUN_CANCELLED', b.reason, item, source(q));
      return detailResponse(item);
    } catch (e) { return error(r, e); }
  });
  app.post('/api/commissioner/offseason/runs/:id/refresh', async (q, r) => {
    try {
      requireCommissionerAccess(q);
      const b = z.object({ expectedUpdatedAt }).parse(q.body ?? {});
      const item = await refreshOffseasonRun((q.params as any).id, b.expectedUpdatedAt);
      return detailResponse(item);
    } catch (e) { return error(r, e); }
  });
  app.post('/api/commissioner/offseason/runs/:id/complete', async (q, r) => {
    try {
      requireCommissionerAccess(q);
      const b = z.object({ reason, expectedUpdatedAt }).parse(q.body);
      const item = await completeOffseasonRun((q.params as any).id, b.expectedUpdatedAt, b.reason);
      await auditOffseasonRun('OFFSEASON_RUN', item.id, 'OFFSEASON_RUN_COMPLETED', b.reason, item, source(q));
      return detailResponse(item);
    } catch (e) { return error(r, e); }
  });

  // Phase actions.
  app.post('/api/commissioner/offseason/phases/:phaseId/start', async (q, r) => {
    try {
      requireCommissionerAccess(q);
      const b = z.object({ runId: z.string().min(1), reason: reason.optional(), expectedUpdatedAt }).parse({ ...(q.body ?? {}), ...(q.query ?? {}) });
      const item = await startPhase(b.runId, (q.params as any).phaseId, b.expectedUpdatedAt, b.reason ?? 'Phase start');
      await auditOffseasonRun('OFFSEASON_PHASE', (q.params as any).phaseId, 'OFFSEASON_PHASE_STARTED', b.reason ?? 'Phase start', { runId: b.runId, phaseId: (q.params as any).phaseId }, source(q));
      return detailResponse(item);
    } catch (e) { return error(r, e); }
  });
  app.post('/api/commissioner/offseason/phases/:phaseId/refresh', async (q, r) => {
    try {
      requireCommissionerAccess(q);
      const b = z.object({ runId: z.string().min(1), expectedUpdatedAt }).parse({ ...(q.body ?? {}), ...(q.query ?? {}) });
      const item = await refreshOffseasonRun(b.runId, b.expectedUpdatedAt);
      return detailResponse(item);
    } catch (e) { return error(r, e); }
  });
  app.post('/api/commissioner/offseason/phases/:phaseId/complete', async (q, r) => {
    try {
      requireCommissionerAccess(q);
      const b = z.object({ runId: z.string().min(1), reason: reason.optional(), expectedUpdatedAt }).parse({ ...(q.body ?? {}), ...(q.query ?? {}) });
      const item = await completePhase(b.runId, (q.params as any).phaseId, b.expectedUpdatedAt, b.reason ?? 'Phase complete');
      await auditOffseasonRun('OFFSEASON_PHASE', (q.params as any).phaseId, 'OFFSEASON_PHASE_COMPLETED', b.reason ?? 'Phase complete', { runId: b.runId, phaseId: (q.params as any).phaseId }, source(q));
      return detailResponse(item);
    } catch (e) { return error(r, e); }
  });
  app.post('/api/commissioner/offseason/phases/:phaseId/skip', async (q, r) => {
    try {
      requireCommissionerAccess(q);
      const b = z.object({ runId: z.string().min(1), reason: reason.optional(), expectedUpdatedAt }).parse({ ...(q.body ?? {}), ...(q.query ?? {}) });
      const item = await skipPhase(b.runId, (q.params as any).phaseId, b.expectedUpdatedAt, b.reason ?? 'Phase skip');
      await auditOffseasonRun('OFFSEASON_PHASE', (q.params as any).phaseId, 'OFFSEASON_PHASE_SKIPPED', b.reason ?? 'Phase skip', { runId: b.runId, phaseId: (q.params as any).phaseId }, source(q));
      return detailResponse(item);
    } catch (e) { return error(r, e); }
  });
  app.post('/api/commissioner/offseason/phases/:phaseId/retry', async (q, r) => {
    try {
      requireCommissionerAccess(q);
      const b = z.object({ runId: z.string().min(1), reason: reason.optional(), expectedUpdatedAt }).parse({ ...(q.body ?? {}), ...(q.query ?? {}) });
      const item = await retryPhase(b.runId, (q.params as any).phaseId, b.expectedUpdatedAt, b.reason ?? 'Phase retry');
      await auditOffseasonRun('OFFSEASON_PHASE', (q.params as any).phaseId, 'OFFSEASON_PHASE_FAILED', b.reason ?? 'Phase retry', { runId: b.runId, phaseId: (q.params as any).phaseId }, source(q));
      return detailResponse(item);
    } catch (e) { return error(r, e); }
  });
  app.post('/api/commissioner/offseason/phases/:phaseId/link', async (q, r) => {
    try {
      requireCommissionerAccess(q);
      const b = z.object({
        runId: z.string().min(1),
        operationType: z.enum(['CONTRACT_EXPIRATION', 'PLAYER_DEVELOPMENT', 'YOUTH_GENERATION', 'DRAFT', 'COMPETITION_ARCHIVE']),
        operationId: z.string().min(1),
        expectedUpdatedAt,
      }).parse({ ...(q.body ?? {}), ...(q.query ?? {}) });
      const item = await linkPhaseOperation(b.runId, (q.params as any).phaseId, b.expectedUpdatedAt, { operationType: b.operationType, operationId: b.operationId });
      await auditOffseasonRun('OFFSEASON_PHASE', (q.params as any).phaseId, 'OFFSEASON_DOMAIN_OPERATION_LINKED', `Linked ${b.operationType} ${b.operationId}`, { runId: b.runId, phaseId: (q.params as any).phaseId }, source(q));
      return detailResponse(item);
    } catch (e) { return error(r, e); }
  });

  // Diagnostics — Commissioner-only aggregated final-review detail.
  app.get('/api/commissioner/offseason/runs/:id/diagnostics', async (q, r) => {
    try {
      requireCommissionerAccess(q);
      const runId = (q.params as any).id as string;
      const run = await prisma.offseasonRun.findUniqueOrThrow({ where: { id: runId }, include: { phases: { orderBy: { phaseOrder: 'asc' } } } });
      const config = (await loadConfigVersion(run.configVersionId)).config;
      const state = runRowToState(run);
      const completionInput = await gatherCompletionInput(config, state, run.worldSeasonId);
      const completion = aggregateCompletion(config, state, completionInput);
      return detailResponse({ run: { id: run.id, status: run.status, currentPhaseType: run.currentPhaseType }, completionInput, completion });
    } catch (e) { return error(r, e); }
  });
}
