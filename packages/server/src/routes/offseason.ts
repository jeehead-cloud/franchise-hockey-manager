import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { detailResponse, listResponse } from '../http.js';
import { CommissionerHttpError, commissionerErrorBody } from '../commissioner/errors.js';
import { OffseasonHttpError } from '../services/offseason-errors.js';
import { listOffseasonConfigurations } from '../services/offseason-config.js';
import {
  getOffseasonRun,
  getOffseasonStatus,
  listOffseasonRuns,
} from '../services/offseason-runs.js';
import {
  computePhaseReadiness,
  gatherCompletionInput,
  runRowToState,
} from '../services/offseason-readiness.js';
import { getTeamOffseasonOverview } from '../services/offseason-teams.js';
import { loadConfigVersion } from '../services/offseason-runs.js';
import { prisma } from '../db/client.js';
import { aggregateCompletion } from '@fhm/engine';

function error(reply: any, e: unknown) {
  if (e instanceof OffseasonHttpError) return reply.status(e.statusCode).send({ error: e.code, message: e.message, details: e.details });
  if (e instanceof CommissionerHttpError) return reply.status(e.statusCode).send(commissionerErrorBody(e));
  if (e instanceof z.ZodError) return reply.status(400).send({ error: 'InvalidOffseasonRequest', message: 'Invalid offseason request', details: e.issues });
  throw e;
}

export async function registerOffseasonRoutes(app: FastifyInstance) {
  app.get('/api/offseason/status', async (_q, r) => {
    try {
      return detailResponse(await getOffseasonStatus());
    } catch (e) { return error(r, e); }
  });

  app.get('/api/offseason/configurations', async (_q, r) => {
    try {
      return listResponse(await listOffseasonConfigurations(prisma));
    } catch (e) { return error(r, e); }
  });

  app.get('/api/offseason/runs', async (q, r) => {
    try {
      const query = z.object({ worldSeasonId: z.string().optional(), status: z.string().optional() }).parse(q.query ?? {});
      return listOffseasonRuns(query);
    } catch (e) { return error(r, e); }
  });

  app.get('/api/offseason/runs/:runId', async (q, r) => {
    try {
      return detailResponse(await getOffseasonRun((q.params as any).runId));
    } catch (e) { return error(r, e); }
  });

  app.get('/api/offseason/runs/:runId/phases', async (q, r) => {
    try {
      const run = await getOffseasonRun((q.params as any).runId);
      return detailResponse({ items: run.phases });
    } catch (e) { return error(r, e); }
  });

  app.get('/api/offseason/runs/:runId/readiness', async (q, r) => {
    try {
      const runId = (q.params as any).runId as string;
      const run = await prisma.offseasonRun.findUniqueOrThrow({
        where: { id: runId },
        include: { phases: { orderBy: { phaseOrder: 'asc' } } },
      });
      const config = (await loadConfigVersion(run.configVersionId)).config;
      const state = runRowToState(run);
      const phases = await Promise.all(
        config.phases.map(async (p) => {
          const result = await computePhaseReadiness(config, state, p.type, run.worldSeasonId);
          return { phaseType: p.type, level: result.status, blockers: result.blockers, warnings: result.warnings, allowedActions: result.allowedActions, linkedOperation: result.linkedOperation, readinessHash: result.readinessHash };
        }),
      );
      return detailResponse({ phases });
    } catch (e) { return error(r, e); }
  });

  app.get('/api/offseason/runs/:runId/history', async (q, r) => {
    try {
      const runId = (q.params as any).runId as string;
      const run = await getOffseasonRun(runId);
      return detailResponse({ items: run.events });
    } catch (e) { return error(r, e); }
  });

  app.get('/api/offseason/runs/:runId/teams', async (q, r) => {
    try {
      const runId = (q.params as any).runId as string;
      const page = Math.max(1, Number((q.query as any).page) || 1);
      const pageSize = Math.min(100, Math.max(1, Number((q.query as any).pageSize) || 25));
      const where: any = { teamType: 'CLUB' };
      const [total, teams] = await Promise.all([
        prisma.team.count({ where }),
        prisma.team.findMany({ where, orderBy: { name: 'asc' }, skip: (page - 1) * pageSize, take: pageSize, select: { id: true, name: true, shortName: true } }),
      ]);
      void runId;
      return { items: teams, page, pageSize, total, totalPages: Math.ceil(total / pageSize) };
    } catch (e) { return error(r, e); }
  });

  app.get('/api/offseason/runs/:runId/teams/:teamId', async (q, r) => {
    try {
      const runId = (q.params as any).runId as string;
      void runId;
      return detailResponse(await getTeamOffseasonOverview((q.params as any).teamId));
    } catch (e) { return error(r, e); }
  });

  // Final-review readiness summary (read-only).
  app.get('/api/offseason/runs/:runId/final-review', async (q, r) => {
    try {
      const runId = (q.params as any).runId as string;
      const run = await prisma.offseasonRun.findUniqueOrThrow({
        where: { id: runId },
        include: { phases: { orderBy: { phaseOrder: 'asc' } } },
      });
      const config = (await loadConfigVersion(run.configVersionId)).config;
      const state = runRowToState(run);
      const completionInput = await gatherCompletionInput(config, state, run.worldSeasonId);
      const completion = aggregateCompletion(config, state, completionInput);
      return detailResponse({ ready: completion.ready, blockers: completion.blockers, warnings: completion.warnings });
    } catch (e) { return error(r, e); }
  });
}
