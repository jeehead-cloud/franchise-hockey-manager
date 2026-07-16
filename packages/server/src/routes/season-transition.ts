import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { detailResponse, listResponse, notFound } from '../http.js';
import { CommissionerHttpError, commissionerErrorBody } from '../commissioner/errors.js';
import { SeasonTransitionHttpError } from '../services/season-transition-errors.js';
import { listSeasonTransitionConfigurations } from '../services/season-transition-config.js';
import {
  getSeasonTransitionRun,
  getSeasonTransitionStatus,
  listSeasonTransitionRuns,
} from '../services/season-transition-runs.js';
import { computeReadinessForRun, computePreview } from '../services/season-transition-readiness.js';
import { prisma } from '../db/client.js';

function error(reply: any, e: unknown) {
  if (e instanceof SeasonTransitionHttpError) return reply.status(e.statusCode).send({ error: e.code, message: e.message, details: e.details });
  if (e instanceof CommissionerHttpError) return reply.status(e.statusCode).send(commissionerErrorBody(e));
  if (e instanceof z.ZodError) return reply.status(400).send({ error: 'InvalidSeasonTransitionRequest', message: 'Invalid season-transition request', details: e.issues });
  throw e;
}

export async function registerSeasonTransitionRoutes(app: FastifyInstance) {
  // World-season reads (including current + per-season readiness).
  app.get('/api/world-seasons/current', async (_q, r) => {
    try {
      const { getCurrentWorldSeason } = await import('../services/world-seasons.js');
      const item = await getCurrentWorldSeason();
      if (!item) return r.status(404).send(notFound('WorldSeason'));
      return r.send(detailResponse(item));
    } catch (e) { return error(r, e); }
  });

  app.get<{ Params: { id: string } }>('/api/world-seasons/:id/readiness', async (q, r) => {
    try {
      const { getWorldSeasonReadiness } = await import('../services/world-seasons.js');
      const item = await getWorldSeasonReadiness(q.params.id);
      if (!item) return r.status(404).send(notFound('WorldSeason'));
      return r.send(detailResponse(item));
    } catch (e) { return error(r, e); }
  });

  // Transition status + configurations.
  app.get('/api/season-transitions/status', async (_q, r) => {
    try {
      return detailResponse(await getSeasonTransitionStatus());
    } catch (e) { return error(r, e); }
  });

  app.get('/api/season-transitions/configurations', async (_q, r) => {
    try {
      return listResponse(await listSeasonTransitionConfigurations(prisma));
    } catch (e) { return error(r, e); }
  });

  app.get('/api/season-transitions', async (q, r) => {
    try {
      const query = z.object({
        sourceWorldSeasonId: z.string().optional(),
        targetWorldSeasonId: z.string().optional(),
        status: z.string().optional(),
      }).parse(q.query ?? {});
      return listSeasonTransitionRuns(query);
    } catch (e) { return error(r, e); }
  });

  app.get<{ Params: { runId: string } }>('/api/season-transitions/:runId', async (q, r) => {
    try {
      return detailResponse(await getSeasonTransitionRun(q.params.runId));
    } catch (e) { return error(r, e); }
  });

  app.get<{ Params: { runId: string } }>('/api/season-transitions/:runId/readiness', async (q, r) => {
    try {
      return detailResponse(await computeReadinessForRun(q.params.runId, prisma));
    } catch (e) { return error(r, e); }
  });

  app.get<{ Params: { runId: string } }>('/api/season-transitions/:runId/plan', async (q, r) => {
    try {
      const run = await getSeasonTransitionRun(q.params.runId);
      return r.send({ planHash: run.planHash, planSnapshotText: run.planSnapshotText, inputHash: run.inputHash });
    } catch (e) { return error(r, e); }
  });

  app.get<{ Params: { runId: string } }>('/api/season-transitions/:runId/history', async (q, r) => {
    try {
      const events = await prisma.seasonTransitionEvent.findMany({
        where: { seasonTransitionRunId: q.params.runId },
        orderBy: { createdAt: 'desc' },
        take: 200,
      });
      return listResponse(events);
    } catch (e) { return error(r, e); }
  });

  app.get<{ Params: { runId: string } }>('/api/season-transitions/:runId/result', async (q, r) => {
    try {
      const run = await getSeasonTransitionRun(q.params.runId);
      const records = await prisma.seasonTransitionEntityRecord.findMany({
        where: { seasonTransitionRunId: q.params.runId },
        orderBy: { createdAt: 'asc' },
      });
      return detailResponse({
        runId: run.id,
        status: run.status,
        resultHash: run.resultHash,
        targetWorldSeasonId: run.targetWorldSeasonId,
        entityRecords: records,
      });
    } catch (e) { return error(r, e); }
  });

  // Preview is a read (no writes). It is reused by the Commissioner action but
  // exposed publicly so normal mode can display the deterministic target
  // identity for the current source season.
  app.get('/api/season-transitions/preview', async (q, r) => {
    try {
      const query = z.object({
        sourceWorldSeasonId: z.string(),
        configVersionId: z.string().optional(),
        targetDisplayNameOverride: z.string().optional(),
      }).parse(q.query ?? {});
      const result = await computePreview(prisma, query.sourceWorldSeasonId, {
        configVersionId: query.configVersionId,
        targetDisplayNameOverride: query.targetDisplayNameOverride ?? null,
      });
      return detailResponse({
        previewOnly: true,
        inputHash: result.inputHash,
        readiness: result.readiness,
      });
    } catch (e) { return error(r, e); }
  });
}
