import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { detailResponse, listResponse } from '../http.js';
import {
  DraftHttpError,
  autoSelectPick,
  getDraft,
  getDraftEligibility,
  getDraftLottery,
  getDraftOrder,
  getDraftPicks,
  getDraftResults,
  getDraftStatus,
  getPlayerDraftHistory,
  getTeamDraftBoard,
  getTeamDraftResults,
  getTeamDraftRights,
  listDrafts,
  selectPick,
} from '../services/draft.js';

function sendError(reply: any, err: unknown) {
  if (err instanceof DraftHttpError) return reply.status(err.statusCode).send({ error: err.code, message: err.message, details: err.details });
  if (err instanceof z.ZodError) return reply.status(400).send({ error: 'InvalidDraftRequest', message: 'Invalid draft request', details: err.issues });
  throw err;
}

export async function registerDraftRoutes(app: FastifyInstance) {
  app.get('/api/drafts', async (request, reply) => {
    try {
      const worldSeasonId = (request.query as any)?.worldSeasonId;
      return await listDrafts(worldSeasonId);
    } catch (e) { return sendError(reply, e); }
  });
  app.get('/api/drafts/status', async (_request, reply) => {
    try { return detailResponse(await getDraftStatus()); } catch (e) { return sendError(reply, e); }
  });
  app.get('/api/drafts/:draftEventId', async (request, reply) => {
    try {
      const item = await getDraft((request.params as any).draftEventId);
      if (!item) return reply.status(404).send({ error: 'DraftEventNotFound', message: 'Draft event not found' });
      return detailResponse(item);
    } catch (e) { return sendError(reply, e); }
  });
  app.get('/api/drafts/:draftEventId/eligibility', async (request, reply) => {
    try {
      const item = await getDraftEligibility((request.params as any).draftEventId);
      if (!item) return reply.status(404).send({ error: 'DraftEventNotFound', message: 'Draft event not found' });
      return listResponse(item.items);
    } catch (e) { return sendError(reply, e); }
  });
  app.get('/api/drafts/:draftEventId/order', async (request, reply) => {
    try {
      const item = await getDraftOrder((request.params as any).draftEventId);
      if (!item) return reply.status(404).send({ error: 'DraftEventNotFound', message: 'Draft event not found' });
      return detailResponse(item);
    } catch (e) { return sendError(reply, e); }
  });
  app.get('/api/drafts/:draftEventId/picks', async (request, reply) => {
    try {
      const item = await getDraftPicks((request.params as any).draftEventId);
      if (!item) return reply.status(404).send({ error: 'DraftEventNotFound', message: 'Draft event not found' });
      return listResponse(item.items);
    } catch (e) { return sendError(reply, e); }
  });
  app.get('/api/drafts/:draftEventId/lottery', async (request, reply) => {
    try {
      const item = await getDraftLottery((request.params as any).draftEventId);
      if (!item) return reply.status(404).send({ error: 'DraftEventNotFound', message: 'Draft event not found' });
      return detailResponse(item);
    } catch (e) { return sendError(reply, e); }
  });
  app.get('/api/drafts/:draftEventId/results', async (request, reply) => {
    try {
      const item = await getDraftResults((request.params as any).draftEventId);
      if (!item) return reply.status(404).send({ error: 'DraftEventNotFound', message: 'Draft event not found' });
      return detailResponse(item);
    } catch (e) { return sendError(reply, e); }
  });
  app.get('/api/drafts/:draftEventId/teams/:teamId/board', async (request, reply) => {
    try {
      const { draftEventId, teamId } = request.params as { draftEventId: string; teamId: string };
      return detailResponse(await getTeamDraftBoard(draftEventId, teamId));
    } catch (e) { return sendError(reply, e); }
  });
  app.get('/api/drafts/:draftEventId/teams/:teamId/results', async (request, reply) => {
    try {
      const { draftEventId, teamId } = request.params as { draftEventId: string; teamId: string };
      return detailResponse(await getTeamDraftResults(draftEventId, teamId));
    } catch (e) { return sendError(reply, e); }
  });
  app.get('/api/players/:playerId/draft-history', async (request, reply) => {
    try { return listResponse((await getPlayerDraftHistory((request.params as any).playerId)).items); } catch (e) { return sendError(reply, e); }
  });
  app.get('/api/teams/:teamId/draft-rights', async (request, reply) => {
    try { return listResponse((await getTeamDraftRights((request.params as any).teamId)).items); } catch (e) { return sendError(reply, e); }
  });

  // Team pick actions (local sandbox team context).
  app.post('/api/drafts/:draftEventId/picks/:pickId/select', async (request, reply) => {
    try {
      const { draftEventId, pickId } = request.params as { draftEventId: string; pickId: string };
      const body = z.object({ playerId: z.string().min(1), reason: z.string().optional() }).parse(request.body);
      return detailResponse(await selectPick(draftEventId, pickId, { ...body, selectionSource: 'MANUAL' }, 'COMMISSIONER_API'));
    } catch (e) { return sendError(reply, e); }
  });
  app.post('/api/drafts/:draftEventId/picks/:pickId/auto-select', async (request, reply) => {
    try {
      const { draftEventId, pickId } = request.params as { draftEventId: string; pickId: string };
      const body = z.object({ reason: z.string().optional() }).parse(request.body ?? {});
      return detailResponse(await autoSelectPick(draftEventId, pickId, body, 'COMMISSIONER_API'));
    } catch (e) { return sendError(reply, e); }
  });
}
