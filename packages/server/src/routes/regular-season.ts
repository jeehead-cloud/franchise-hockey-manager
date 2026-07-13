import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  areCommissionerWritesEnabled,
  hasCommissionerHeader,
} from '../commissioner/gate.js';
import {
  CommissionerHttpError,
  commissionerErrorBody,
} from '../commissioner/errors.js';
import { detailResponse } from '../http.js';
import {
  previewRegularSeasonSchedule,
  generateRegularSeasonSchedulePersisted,
  regenerateRegularSeasonSchedule,
  getStageSchedule,
} from '../services/regular-season-schedule.js';
import {
  computeStageStandings,
  getStageProgress,
  getStageTeamStats,
  getStagePlayerStats,
  getStageQualification,
} from '../services/regular-season-aggregates.js';
import {
  startRegularSeasonSimulation,
  getRegularSeasonSimulationRun,
  cancelRegularSeasonSimulation,
  serializeRun,
} from '../services/regular-season-simulation.js';
import {
  RegularSeasonHttpError,
  regularSeasonErrorBody,
} from '../services/regular-season-errors.js';
import { prisma } from '../db/client.js';
import { paginatedResponse } from '../http.js';

function assertCommissionerAccess(request: {
  headers: Record<string, string | string[] | undefined>;
}) {
  if (!hasCommissionerHeader(request.headers)) {
    throw new CommissionerHttpError(
      403,
      'CommissionerModeRequired',
      'Commissioner Mode header X-FHM-Commissioner-Mode: enabled is required',
    );
  }
  if (!areCommissionerWritesEnabled()) {
    throw new CommissionerHttpError(
      403,
      'CommissionerWritesDisabled',
      'Commissioner writes are disabled on this server (FHM_COMMISSIONER_WRITES_ENABLED)',
    );
  }
}

function sourceFor(request: { headers: Record<string, string | string[] | undefined> }) {
  return (
    Array.isArray(request.headers['x-fhm-commissioner-source'])
      ? request.headers['x-fhm-commissioner-source'][0]
      : request.headers['x-fhm-commissioner-source']
  ) === 'ui'
    ? ('COMMISSIONER_UI' as const)
    : ('COMMISSIONER_API' as const);
}

function sendError(
  reply: { status: (code: number) => { send: (body: unknown) => unknown } },
  err: unknown,
) {
  if (err instanceof RegularSeasonHttpError) {
    return reply.status(err.statusCode).send(regularSeasonErrorBody(err));
  }
  if (err instanceof CommissionerHttpError) {
    return reply.status(err.statusCode).send(commissionerErrorBody(err));
  }
  if (err instanceof z.ZodError) {
    return reply.status(400).send({
      error: 'InvalidRegularSeasonRequest',
      message: 'Invalid regular-season request',
      details: err.issues,
    });
  }
  throw err;
}

const seedSchema = z.string().min(1).max(200);
const reasonSchema = z.string().min(3);
const expectedUpdatedAt = z.string().datetime();

export async function registerRegularSeasonRoutes(app: FastifyInstance) {
  // --- Public reads ---
  app.get('/api/competition-stages/:id/schedule', async (request, reply) => {
    try {
      const id = (request.params as { id: string }).id;
      const q = request.query as Record<string, string | undefined>;
      const item = await getStageSchedule(id, {
        round: q.round ? Number(q.round) : undefined,
        teamId: q.teamId,
        status: q.status,
        page: q.page ? Number(q.page) : undefined,
        pageSize: q.pageSize ? Number(q.pageSize) : undefined,
      });
      return reply.send(detailResponse(item));
    } catch (err) {
      return sendError(reply, err);
    }
  });

  app.get('/api/competition-stages/:id/progress', async (request, reply) => {
    try {
      const item = await getStageProgress((request.params as { id: string }).id);
      return reply.send(detailResponse(item));
    } catch (err) {
      return sendError(reply, err);
    }
  });

  app.get('/api/competition-stages/:id/standings', async (request, reply) => {
    try {
      const item = await computeStageStandings((request.params as { id: string }).id);
      return reply.send(detailResponse(item));
    } catch (err) {
      return sendError(reply, err);
    }
  });

  app.get('/api/competition-stages/:id/team-stats', async (request, reply) => {
    try {
      const item = await getStageTeamStats((request.params as { id: string }).id);
      return reply.send(detailResponse(item));
    } catch (err) {
      return sendError(reply, err);
    }
  });

  app.get('/api/competition-stages/:id/player-stats', async (request, reply) => {
    try {
      const q = request.query as Record<string, string | undefined>;
      const item = await getStagePlayerStats((request.params as { id: string }).id, {
        goalies: false,
        sort: q.sort,
        page: q.page ? Number(q.page) : undefined,
        pageSize: q.pageSize ? Number(q.pageSize) : undefined,
      });
      return reply.send({
        source: item.source,
        total: item.total,
        page: item.page,
        pageSize: item.pageSize,
        items: item.items,
      });
    } catch (err) {
      return sendError(reply, err);
    }
  });

  app.get('/api/competition-stages/:id/goalie-stats', async (request, reply) => {
    try {
      const q = request.query as Record<string, string | undefined>;
      const item = await getStagePlayerStats((request.params as { id: string }).id, {
        goalies: true,
        sort: q.sort ?? 'savePercentage',
        page: q.page ? Number(q.page) : undefined,
        pageSize: q.pageSize ? Number(q.pageSize) : undefined,
      });
      return reply.send({
        source: item.source,
        total: item.total,
        page: item.page,
        pageSize: item.pageSize,
        items: item.items,
      });
    } catch (err) {
      return sendError(reply, err);
    }
  });

  app.get('/api/competition-stages/:id/qualification', async (request, reply) => {
    try {
      const item = await getStageQualification((request.params as { id: string }).id);
      return reply.send(detailResponse(item));
    } catch (err) {
      return sendError(reply, err);
    }
  });

  app.post('/api/competition-stages/:id/simulate', async (request, reply) => {
    try {
      const body = z
        .object({
          baseSeed: seedSchema,
          mode: z.literal('ALL_REMAINING').optional(),
          confirmBackup: z.boolean().optional(),
        })
        .parse(request.body ?? {});
      const run = await startRegularSeasonSimulation((request.params as { id: string }).id, body);
      return reply.status(202).send(detailResponse(serializeRun(run)));
    } catch (err) {
      return sendError(reply, err);
    }
  });

  app.get('/api/competition-stages/:id/simulation-run/:runId', async (request, reply) => {
    try {
      const { id, runId } = request.params as { id: string; runId: string };
      return reply.send(detailResponse(getRegularSeasonSimulationRun(id, runId)));
    } catch (err) {
      return sendError(reply, err);
    }
  });

  app.post('/api/competition-stages/:id/simulation-run/:runId/cancel', async (request, reply) => {
    try {
      const { id, runId } = request.params as { id: string; runId: string };
      return reply.send(detailResponse(cancelRegularSeasonSimulation(id, runId)));
    } catch (err) {
      return sendError(reply, err);
    }
  });

  // --- Commissioner schedule ---
  app.post('/api/commissioner/competition-stages/:id/schedule-preview', async (request, reply) => {
    try {
      assertCommissionerAccess(request);
      const body = z.object({ seed: seedSchema }).parse(request.body ?? {});
      const item = await previewRegularSeasonSchedule(
        (request.params as { id: string }).id,
        body.seed,
      );
      return reply.send(detailResponse(item));
    } catch (err) {
      return sendError(reply, err);
    }
  });

  app.post('/api/commissioner/competition-stages/:id/generate-schedule', async (request, reply) => {
    try {
      assertCommissionerAccess(request);
      const body = z
        .object({
          expectedUpdatedAt,
          seed: seedSchema,
          reason: reasonSchema,
        })
        .parse(request.body ?? {});
      const item = await generateRegularSeasonSchedulePersisted(
        (request.params as { id: string }).id,
        body,
        sourceFor(request),
      );
      return reply.send(detailResponse(item));
    } catch (err) {
      return sendError(reply, err);
    }
  });

  app.post('/api/commissioner/competition-stages/:id/regenerate-schedule', async (request, reply) => {
    try {
      assertCommissionerAccess(request);
      const body = z
        .object({
          expectedUpdatedAt,
          seed: seedSchema,
          reason: reasonSchema,
        })
        .parse(request.body ?? {});
      const item = await regenerateRegularSeasonSchedule(
        (request.params as { id: string }).id,
        body,
        sourceFor(request),
      );
      return reply.send(detailResponse(item));
    } catch (err) {
      return sendError(reply, err);
    }
  });

  app.get('/api/commissioner/competition-stages/:id/audit', async (request, reply) => {
    try {
      assertCommissionerAccess(request);
      const id = (request.params as { id: string }).id;
      const stage = await prisma.competitionStage.findUnique({ where: { id } });
      if (!stage) {
        throw new RegularSeasonHttpError(404, 'CompetitionStageNotFound', 'Competition stage not found');
      }
      const q = request.query as Record<string, string | undefined>;
      const page = Math.max(1, Number(q.page ?? 1));
      const pageSize = Math.min(100, Math.max(1, Number(q.pageSize ?? 50)));
      const where = {
        entityType: 'COMPETITION_STAGE' as const,
        entityId: id,
      };
      const [total, items] = await Promise.all([
        prisma.commissionerAuditLog.count({ where }),
        prisma.commissionerAuditLog.findMany({
          where,
          orderBy: { createdAt: 'desc' },
          skip: (page - 1) * pageSize,
          take: pageSize,
        }),
      ]);
      return paginatedResponse({ items, total, page, pageSize });
    } catch (err) {
      return sendError(reply, err);
    }
  });
}
