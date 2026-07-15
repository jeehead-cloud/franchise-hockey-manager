import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { detailResponse, listResponse } from '../http.js';
import {
  ScoutingHttpError, createScoutingAssignment, deletePreparedScoutingAssignment, deleteWatchlist,
  executeScoutingAssignment, getScoutingAssignment, getScoutingOverview, getScoutingProspect,
  getScoutingReadiness, listScoutingAssignments, listScoutingProspects, listScoutingRankings,
  listScoutingReports, listWatchlist, previewScoutingAssignment, upsertWatchlist,
} from '../services/scouting.js';

const assignmentSchema = z.object({
  targetType: z.enum(['PLAYER', 'COUNTRY', 'WATCHLIST']),
  playerIds: z.array(z.string().min(1)).optional(),
  countryId: z.string().min(1).optional(),
  scoutIds: z.array(z.string().min(1)).min(1),
  observedOn: z.string().min(1),
  durationDays: z.number().int().positive(),
  seed: z.string().min(1),
});

function sendError(reply: any, err: unknown) {
  if (err instanceof ScoutingHttpError) return reply.status(err.statusCode).send({ error: err.code, message: err.message, details: err.details });
  if (err instanceof z.ZodError) return reply.status(400).send({ error: 'InvalidScoutingRequest', message: 'Invalid scouting request', details: err.issues });
  throw err;
}

export async function registerScoutingRoutes(app: FastifyInstance) {
  app.get('/api/teams/:teamId/scouting', async (request, reply) => {
    try { return detailResponse(await getScoutingOverview((request.params as any).teamId)); } catch (e) { return sendError(reply, e); }
  });
  app.get('/api/teams/:teamId/scouting/readiness', async (request, reply) => {
    try { return detailResponse(await getScoutingReadiness((request.params as any).teamId)); } catch (e) { return sendError(reply, e); }
  });
  app.get('/api/teams/:teamId/scouting/assignments', async (request, reply) => {
    try { return listResponse(await listScoutingAssignments((request.params as any).teamId)); } catch (e) { return sendError(reply, e); }
  });
  app.get('/api/teams/:teamId/scouting/assignments/:assignmentId', async (request, reply) => {
    try { return detailResponse(await getScoutingAssignment((request.params as any).teamId, (request.params as any).assignmentId)); } catch (e) { return sendError(reply, e); }
  });
  app.get('/api/teams/:teamId/scouting/prospects', async (request, reply) => {
    try { return listResponse(await listScoutingProspects((request.params as any).teamId)); } catch (e) { return sendError(reply, e); }
  });
  app.get('/api/teams/:teamId/scouting/prospects/:playerId', async (request, reply) => {
    try { return detailResponse(await getScoutingProspect((request.params as any).teamId, (request.params as any).playerId)); } catch (e) { return sendError(reply, e); }
  });
  app.get('/api/teams/:teamId/scouting/watchlist', async (request, reply) => {
    try { return listResponse(await listWatchlist((request.params as any).teamId)); } catch (e) { return sendError(reply, e); }
  });
  app.get('/api/teams/:teamId/scouting/rankings', async (request, reply) => {
    try { return listResponse(await listScoutingRankings((request.params as any).teamId)); } catch (e) { return sendError(reply, e); }
  });
  app.get('/api/teams/:teamId/scouting/reports', async (request, reply) => {
    try { return listResponse(await listScoutingReports((request.params as any).teamId)); } catch (e) { return sendError(reply, e); }
  });
  app.post('/api/teams/:teamId/scouting/assignments/preview', async (request, reply) => {
    try { return detailResponse(await previewScoutingAssignment({ teamId: (request.params as any).teamId, ...assignmentSchema.parse(request.body) })); } catch (e) { return sendError(reply, e); }
  });
  app.post('/api/teams/:teamId/scouting/assignments', async (request, reply) => {
    try { return detailResponse(await createScoutingAssignment({ teamId: (request.params as any).teamId, ...assignmentSchema.parse(request.body) })); } catch (e) { return sendError(reply, e); }
  });
  app.post('/api/teams/:teamId/scouting/assignments/:assignmentId/execute', async (request, reply) => {
    try { return detailResponse(await executeScoutingAssignment((request.params as any).teamId, (request.params as any).assignmentId)); } catch (e) { return sendError(reply, e); }
  });
  app.delete('/api/teams/:teamId/scouting/assignments/:assignmentId', async (request, reply) => {
    try { await deletePreparedScoutingAssignment((request.params as any).teamId, (request.params as any).assignmentId); return reply.status(204).send(); } catch (e) { return sendError(reply, e); }
  });
  app.put('/api/teams/:teamId/scouting/watchlist/:playerId', async (request, reply) => {
    try {
      const body = z.object({ manualPriority: z.number().int().optional(), note: z.string().nullable().optional() }).parse(request.body);
      return detailResponse(await upsertWatchlist((request.params as any).teamId, { playerId: (request.params as any).playerId, ...body }));
    } catch (e) { return sendError(reply, e); }
  });
  app.delete('/api/teams/:teamId/scouting/watchlist/:playerId', async (request, reply) => {
    try { await deleteWatchlist((request.params as any).teamId, (request.params as any).playerId); return reply.status(204).send(); } catch (e) { return sendError(reply, e); }
  });
}
