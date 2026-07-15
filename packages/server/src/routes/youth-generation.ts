import type { FastifyInstance } from 'fastify';
import { detailResponse, listResponse, notFound } from '../http.js';
import { listYouthCountries, listYouthProfileSets, listYouthProfileSetVersions } from '../services/youth-generation-config.js';
import {
  getPlayerYouthProvenance,
  getYouthGenerationReadiness,
  getYouthGenerationRun,
  getYouthGenerationStatus,
  listYouthCohorts,
  listYouthGeneratedPlayers,
  listYouthGenerationRuns,
} from '../services/youth-generation.js';

export async function registerYouthGenerationRoutes(app: FastifyInstance) {
  app.get('/api/youth-generation/status', async (request, reply) => {
    const q = request.query as { worldSeasonId?: string };
    const item = await getYouthGenerationStatus(q.worldSeasonId);
    if (!item) return reply.status(404).send(notFound('WorldSeason'));
    return detailResponse(item);
  });

  app.get('/api/youth-generation/readiness', async (request, reply) => {
    const q = request.query as {
      worldSeasonId?: string;
      referenceDate?: string;
      profileSetVersionId?: string;
    };
    if (!q.worldSeasonId) {
      return reply.status(400).send({
        error: 'InvalidYouthGenerationRequest',
        message: 'worldSeasonId is required',
      });
    }
    try {
      const item = await getYouthGenerationReadiness({
        worldSeasonId: q.worldSeasonId,
        referenceDate: q.referenceDate,
        profileSetVersionId: q.profileSetVersionId,
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

  app.get('/api/youth-generation/runs', async (request, reply) => {
    const q = request.query as { worldSeasonId?: string };
    if (!q.worldSeasonId) {
      return reply.status(400).send({
        error: 'InvalidYouthGenerationRequest',
        message: 'worldSeasonId is required',
      });
    }
    const result = await listYouthGenerationRuns(q.worldSeasonId);
    if (!result) return reply.status(404).send(notFound('WorldSeason'));
    return listResponse(result.items);
  });

  app.get('/api/youth-generation/runs/:runId', async (request, reply) => {
    const { runId } = request.params as { runId: string };
    const item = await getYouthGenerationRun(runId);
    if (!item) return reply.status(404).send(notFound('YouthGenerationRun'));
    return detailResponse(item);
  });

  app.get('/api/youth-generation/runs/:runId/cohorts', async (request, reply) => {
    const { runId } = request.params as { runId: string };
    const q = request.query as Record<string, string | undefined>;
    const page = q.page ? Number(q.page) : 1;
    const pageSize = q.pageSize ? Number(q.pageSize) : 50;
    const result = await listYouthCohorts(runId, {
      page: Number.isFinite(page) && page > 0 ? page : 1,
      pageSize: Number.isFinite(pageSize) && pageSize > 0 ? pageSize : 50,
    });
    if (!result) return reply.status(404).send(notFound('YouthGenerationRun'));
    return {
      items: result.items,
      page: result.page,
      pageSize: result.pageSize,
      total: result.total,
    };
  });

  app.get('/api/youth-generation/runs/:runId/players', async (request, reply) => {
    const { runId } = request.params as { runId: string };
    const q = request.query as Record<string, string | undefined>;
    const page = q.page ? Number(q.page) : 1;
    const pageSize = q.pageSize ? Number(q.pageSize) : 50;
    const result = await listYouthGeneratedPlayers(runId, {
      page: Number.isFinite(page) && page > 0 ? page : 1,
      pageSize: Number.isFinite(pageSize) && pageSize > 0 ? pageSize : 50,
      countryId: q.countryId,
      includePotential: false,
      includeQualityTier: false,
      redactProspectTruth: true,
    });
    if (!result) return reply.status(404).send(notFound('YouthGenerationRun'));
    return {
      items: result.items,
      page: result.page,
      pageSize: result.pageSize,
      total: result.total,
    };
  });

  app.get('/api/youth-generation/countries', async () => {
    const result = await listYouthCountries();
    return detailResponse(result);
  });

  app.get('/api/youth-generation/profile-sets', async () => {
    const result = await listYouthProfileSets();
    return listResponse(result.items);
  });

  app.get('/api/youth-generation/profile-sets/:id/versions', async (request, reply) => {
    const { id } = request.params as { id: string };
    const result = await listYouthProfileSetVersions(id);
    if (!result) return reply.status(404).send(notFound('YouthGenerationProfileSet'));
    return detailResponse(result);
  });

  app.get('/api/players/:playerId/youth-provenance', async (request, reply) => {
    const { playerId } = request.params as { playerId: string };
    const item = await getPlayerYouthProvenance(playerId, {
      includePotential: false,
      includeQualityTier: false,
      redactProspectTruth: true,
    });
    if (!item) return reply.status(404).send(notFound('YouthGeneratedPlayer'));
    return detailResponse(item);
  });
}
