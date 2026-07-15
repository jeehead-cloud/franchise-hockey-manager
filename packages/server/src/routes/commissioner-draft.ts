import type { FastifyInstance } from 'fastify';
import { Prisma } from '@prisma/client';
import { DraftError } from '@fhm/engine';
import { z } from 'zod';
import { areCommissionerWritesEnabled, hasCommissionerHeader } from '../commissioner/gate.js';
import { CommissionerHttpError, commissionerErrorBody } from '../commissioner/errors.js';
import { detailResponse, listResponse } from '../http.js';
import { listDraftPresets } from '../services/draft-config.js';
import {
  DraftHttpError,
  cancelDraft,
  createDraftEvent,
  generateEligibility,
  generateOrder,
  getDraftDiagnostics,
  markDraftReady,
  runLottery,
  selectPick,
  startDraft,
} from '../services/draft.js';
import {
  activateDraftPresetVersion,
  createDraftPreset,
  createDraftPresetVersion,
} from '../services/commissioner-draft.js';

function assertAccess(request: any) {
  if (!hasCommissionerHeader(request.headers)) throw new CommissionerHttpError(403, 'CommissionerModeRequired', 'Commissioner Mode header X-FHM-Commissioner-Mode: enabled is required');
  if (!areCommissionerWritesEnabled()) throw new CommissionerHttpError(403, 'CommissionerWritesDisabled', 'Commissioner writes are disabled on this server');
}
function error(reply: any, value: unknown) {
  if (value instanceof CommissionerHttpError) return reply.status(value.statusCode).send(commissionerErrorBody(value));
  if (value instanceof DraftHttpError) return reply.status(value.statusCode).send({ error: value.code, message: value.message, details: value.details });
  if (value instanceof z.ZodError) return reply.status(400).send({ error: 'InvalidDraftRequest', message: 'Invalid draft request', details: value.issues });
  if (value instanceof DraftError) return reply.status(422).send({ error: value.code, message: value.message, details: value.details });
  if (value instanceof Prisma.PrismaClientKnownRequestError) {
    if (value.code === 'P2002') return reply.status(409).send({ error: 'DraftConflict', message: 'A draft record with those unique fields already exists' });
    if (value.code === 'P2025') return reply.status(404).send({ error: 'DraftResourceNotFound', message: 'The requested draft record was not found' });
  }
  throw value;
}
const reason = z.string().trim().min(1).max(500);
const sourceFor = (request: { headers: Record<string, string | string[] | undefined> }) =>
  (Array.isArray(request.headers['x-fhm-commissioner-source']) ? request.headers['x-fhm-commissioner-source'][0] : request.headers['x-fhm-commissioner-source']) === 'ui'
    ? ('COMMISSIONER_UI' as const)
    : ('COMMISSIONER_API' as const);

export async function registerCommissionerDraftRoutes(app: FastifyInstance) {
  app.get('/api/commissioner/draft/configurations', async (request, reply) => {
    try { assertAccess(request); return listResponse(await listDraftPresets()); } catch (e) { return error(reply, e); }
  });
  app.post('/api/commissioner/draft/configurations', async (request, reply) => {
    try {
      assertAccess(request);
      const x = z.object({ name: z.string().min(1), description: z.string().nullable().optional(), config: z.unknown(), activate: z.boolean().optional(), reason }).parse(request.body);
      return detailResponse(await createDraftPreset(x, sourceFor(request)));
    } catch (e) { return error(reply, e); }
  });
  app.post('/api/commissioner/draft/configurations/:presetId/versions', async (request, reply) => {
    try {
      assertAccess(request);
      const x = z.object({ config: z.unknown(), activate: z.boolean().optional(), reason }).parse(request.body);
      return detailResponse(await createDraftPresetVersion((request.params as any).presetId, x, sourceFor(request)));
    } catch (e) { return error(reply, e); }
  });
  app.post('/api/commissioner/draft/configuration-versions/:versionId/activate', async (request, reply) => {
    try {
      assertAccess(request);
      const x = z.object({ reason }).parse(request.body ?? {});
      return detailResponse(await activateDraftPresetVersion((request.params as any).versionId, x.reason, sourceFor(request)));
    } catch (e) { return error(reply, e); }
  });

  app.post('/api/commissioner/drafts', async (request, reply) => {
    try {
      assertAccess(request);
      const x = z.object({ worldSeasonId: z.string().min(1), name: z.string().min(1), presetVersionId: z.string().optional(), baseSeed: z.string().min(1), reason }).parse(request.body);
      return detailResponse(await createDraftEvent(x, sourceFor(request)));
    } catch (e) { return error(reply, e); }
  });
  app.post('/api/commissioner/drafts/:id/generate-eligibility', async (request, reply) => {
    try {
      assertAccess(request);
      const x = z.object({ reason }).parse(request.body ?? {});
      return detailResponse(await generateEligibility((request.params as any).id, x.reason, sourceFor(request)));
    } catch (e) { return error(reply, e); }
  });
  app.post('/api/commissioner/drafts/:id/generate-order', async (request, reply) => {
    try {
      assertAccess(request);
      const x = z.object({
        source: z.enum(['REVERSE_STANDINGS', 'MANUAL']).optional(),
        sourceCompetitionStageId: z.string().optional(),
        participatingTeamIds: z.array(z.string()).optional(),
        manualOrder: z.array(z.string()).optional(),
        reason,
      }).parse(request.body ?? {});
      return detailResponse(await generateOrder((request.params as any).id, x, sourceFor(request)));
    } catch (e) { return error(reply, e); }
  });
  app.post('/api/commissioner/drafts/:id/run-lottery', async (request, reply) => {
    try {
      assertAccess(request);
      const x = z.object({ reason }).parse(request.body ?? {});
      return detailResponse(await runLottery((request.params as any).id, x.reason, sourceFor(request)));
    } catch (e) { return error(reply, e); }
  });
  app.post('/api/commissioner/drafts/:id/mark-ready', async (request, reply) => {
    try {
      assertAccess(request);
      const x = z.object({ reason }).parse(request.body ?? {});
      return detailResponse(await markDraftReady((request.params as any).id, x.reason, sourceFor(request)));
    } catch (e) { return error(reply, e); }
  });
  app.post('/api/commissioner/drafts/:id/start', async (request, reply) => {
    try {
      assertAccess(request);
      const x = z.object({ reason }).parse(request.body ?? {});
      return await startDraft((request.params as any).id, x.reason, sourceFor(request));
    } catch (e) { return error(reply, e); }
  });
  app.post('/api/commissioner/drafts/:id/cancel', async (request, reply) => {
    try {
      assertAccess(request);
      const x = z.object({ reason }).parse(request.body ?? {});
      return detailResponse(await cancelDraft((request.params as any).id, x.reason, sourceFor(request)));
    } catch (e) { return error(reply, e); }
  });
  app.post('/api/commissioner/drafts/:id/picks/:pickId/select', async (request, reply) => {
    try {
      assertAccess(request);
      const { id, pickId } = request.params as { id: string; pickId: string };
      const x = z.object({ playerId: z.string().min(1), reason: z.string().optional() }).parse(request.body);
      return detailResponse(await selectPick(id, pickId, { ...x, selectionSource: 'COMMISSIONER_CORRECTION' }, sourceFor(request)));
    } catch (e) { return error(reply, e); }
  });
  app.get('/api/commissioner/drafts/:id/diagnostics', async (request, reply) => {
    try {
      assertAccess(request);
      return detailResponse(await getDraftDiagnostics((request.params as any).id));
    } catch (e) { return error(reply, e); }
  });
}
