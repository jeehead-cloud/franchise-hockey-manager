import type { FastifyInstance } from 'fastify';
import { detailResponse, listResponse, notFound } from '../http.js';
import {
  getDevelopmentReadiness,
  getDevelopmentRun,
  getDevelopmentStatus,
  getPlayerDevelopmentHistory,
  listDevelopmentResults,
  listDevelopmentRetirements,
  listDevelopmentRuns,
} from '../services/player-development.js';
import { listDevelopmentPresets } from '../services/player-development-config.js';

export async function registerPlayerDevelopmentRoutes(app: FastifyInstance) {
  app.get('/api/player-development/status', async (request, reply) => {
    const q = request.query as { worldSeasonId?: string };
    const item = await getDevelopmentStatus(q.worldSeasonId);
    if (!item) return reply.status(404).send(notFound('WorldSeason'));
    return detailResponse(item);
  });

  app.get('/api/player-development/readiness', async (request, reply) => {
    const q = request.query as {
      worldSeasonId?: string;
      effectiveDate?: string;
      configVersionId?: string;
    };
    if (!q.worldSeasonId) {
      return reply.status(400).send({
        error: 'InvalidPlayerDevelopmentRequest',
        message: 'worldSeasonId is required',
      });
    }
    try {
      const item = await getDevelopmentReadiness({
        worldSeasonId: q.worldSeasonId,
        effectiveDate: q.effectiveDate,
        configVersionId: q.configVersionId,
      });
      return detailResponse(item);
    } catch (err) {
      const e = err as { statusCode?: number; code?: string; message?: string };
      if (e.statusCode) {
        return reply.status(e.statusCode).send({ error: e.code, message: e.message });
      }
      throw err;
    }
  });

  app.get('/api/player-development/runs', async (request, reply) => {
    const q = request.query as { worldSeasonId?: string };
    if (!q.worldSeasonId) {
      return reply.status(400).send({
        error: 'InvalidPlayerDevelopmentRequest',
        message: 'worldSeasonId is required',
      });
    }
    const result = await listDevelopmentRuns(q.worldSeasonId);
    if (!result) return reply.status(404).send(notFound('WorldSeason'));
    return listResponse(result.items);
  });

  app.get('/api/player-development/runs/:runId', async (request, reply) => {
    const { runId } = request.params as { runId: string };
    const item = await getDevelopmentRun(runId);
    if (!item) return reply.status(404).send(notFound('PlayerDevelopmentRun'));
    return detailResponse(item);
  });

  app.get('/api/player-development/runs/:runId/results', async (request, reply) => {
    const { runId } = request.params as { runId: string };
    const q = request.query as Record<string, string | undefined>;
    const page = q.page ? Number(q.page) : 1;
    const pageSize = q.pageSize ? Number(q.pageSize) : 50;
    const result = await listDevelopmentResults(runId, {
      page: Number.isFinite(page) && page > 0 ? page : 1,
      pageSize: Number.isFinite(pageSize) && pageSize > 0 ? pageSize : 50,
      outcome: q.outcome,
      includePotential: false,
    });
    if (!result) return reply.status(404).send(notFound('PlayerDevelopmentRun'));
    return {
      items: result.items,
      page: result.page,
      pageSize: result.pageSize,
      total: result.total,
    };
  });

  app.get('/api/player-development/runs/:runId/retirements', async (request, reply) => {
    const { runId } = request.params as { runId: string };
    const result = await listDevelopmentRetirements(runId);
    if (!result) return reply.status(404).send(notFound('PlayerDevelopmentRun'));
    return detailResponse(result);
  });

  app.get('/api/players/:playerId/development-history', async (request, reply) => {
    const { playerId } = request.params as { playerId: string };
    const item = await getPlayerDevelopmentHistory(playerId, { includePotential: false });
    if (!item) return reply.status(404).send(notFound('Player'));
    return detailResponse(item);
  });

  app.get('/api/player-development/configurations', async () => {
    const result = await listDevelopmentPresets();
    return listResponse(result.items);
  });
}
