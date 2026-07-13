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
import { detailResponse, paginatedResponse } from '../http.js';
import {
  AggregatedHttpError,
  discardPreparedAggregatedRun,
  getAggregatedDiagnostics,
  getAggregatedRun,
  getAggregatedStatus,
  listAggregatedMatches,
  prepareAggregatedSeason,
  previewAggregatedSeason,
  simulateAggregatedSeason,
} from '../services/aggregated-league.js';

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
  if (err instanceof AggregatedHttpError) {
    return reply.status(err.statusCode).send({
      error: err.code,
      message: err.message,
      details: err.details,
    });
  }
  if (err instanceof CommissionerHttpError) {
    return reply.status(err.statusCode).send(commissionerErrorBody(err));
  }
  if (err instanceof z.ZodError) {
    return reply.status(400).send({
      error: 'InvalidAggregatedLeagueRequest',
      message: 'Invalid aggregated league request',
      details: err.issues,
    });
  }
  throw err;
}

export async function registerAggregatedLeagueRoutes(app: FastifyInstance) {
  app.get('/api/competition-stages/:id/aggregated-status', async (request, reply) => {
    try {
      const item = await getAggregatedStatus((request.params as { id: string }).id);
      if (!item) {
        return reply.status(404).send({
          error: 'CompetitionStageNotFound',
          message: 'Competition stage not found',
        });
      }
      return reply.send(detailResponse(item));
    } catch (err) {
      return sendError(reply, err);
    }
  });

  app.get('/api/competition-stages/:id/aggregated-matches', async (request, reply) => {
    try {
      const id = (request.params as { id: string }).id;
      const q = request.query as Record<string, string | undefined>;
      const page = q.page ? Number(q.page) : 1;
      const pageSize = q.pageSize ? Number(q.pageSize) : 50;
      const result = await listAggregatedMatches(id, {
        page: Number.isFinite(page) && page > 0 ? page : 1,
        pageSize: Number.isFinite(pageSize) && pageSize > 0 ? Math.min(pageSize, 200) : 50,
      });
      return reply.send(
        paginatedResponse({
          items: result.items,
          total: result.total,
          page: result.page,
          pageSize: result.pageSize,
        }),
      );
    } catch (err) {
      return sendError(reply, err);
    }
  });

  app.get('/api/aggregated-runs/:runId', async (request, reply) => {
    try {
      const run = await getAggregatedRun((request.params as { runId: string }).runId);
      if (!run) {
        return reply.status(404).send({
          error: 'AggregatedSeasonRunNotFound',
          message: 'Aggregated season run not found',
        });
      }
      return reply.send(detailResponse(run));
    } catch (err) {
      return sendError(reply, err);
    }
  });

  app.post('/api/competition-stages/:id/simulate-aggregated-season', async (request, reply) => {
    try {
      const body = z
        .object({
          runId: z.string().min(1),
          confirmation: z.literal(true),
        })
        .parse(request.body);
      const item = await simulateAggregatedSeason((request.params as { id: string }).id, body);
      return reply.send(detailResponse(item));
    } catch (err) {
      return sendError(reply, err);
    }
  });

  app.post(
    '/api/commissioner/competition-stages/:id/aggregated-preview',
    async (request, reply) => {
      try {
        assertCommissionerAccess(request);
        const item = await previewAggregatedSeason((request.params as { id: string }).id);
        return reply.send(detailResponse(item));
      } catch (err) {
        return sendError(reply, err);
      }
    },
  );

  app.post(
    '/api/commissioner/competition-stages/:id/prepare-aggregated-season',
    async (request, reply) => {
      try {
        assertCommissionerAccess(request);
        const body = z
          .object({
            expectedUpdatedAt: z.string().datetime(),
            seed: z.string().min(1).max(200),
            balanceVersionId: z.string().nullable().optional(),
            reason: z.string().min(3),
          })
          .parse(request.body);
        const item = await prepareAggregatedSeason(
          (request.params as { id: string }).id,
          body,
          sourceFor(request),
        );
        return reply.send(detailResponse(item));
      } catch (err) {
        return sendError(reply, err);
      }
    },
  );

  app.post(
    '/api/commissioner/competition-stages/:id/discard-prepared-aggregate-run',
    async (request, reply) => {
      try {
        assertCommissionerAccess(request);
        const body = z
          .object({
            expectedUpdatedAt: z.string().datetime(),
            reason: z.string().min(3),
            runId: z.string().min(1),
          })
          .parse(request.body);
        const item = await discardPreparedAggregatedRun(
          (request.params as { id: string }).id,
          body.runId,
          {
            expectedUpdatedAt: body.expectedUpdatedAt,
            reason: body.reason,
          },
          sourceFor(request),
        );
        return reply.send(detailResponse(item));
      } catch (err) {
        return sendError(reply, err);
      }
    },
  );

  app.delete(
    '/api/commissioner/competition-stages/:id/prepared-aggregate-run/:runId',
    async (request, reply) => {
      try {
        assertCommissionerAccess(request);
        const params = request.params as { id: string; runId: string };
        const body = z
          .object({
            expectedUpdatedAt: z.string().datetime(),
            reason: z.string().min(3),
          })
          .parse(request.body ?? {});
        const item = await discardPreparedAggregatedRun(
          params.id,
          params.runId,
          body,
          sourceFor(request),
        );
        return reply.send(detailResponse(item));
      } catch (err) {
        return sendError(reply, err);
      }
    },
  );

  app.get(
    '/api/commissioner/competition-stages/:id/aggregated-diagnostics',
    async (request, reply) => {
      try {
        assertCommissionerAccess(request);
        const item = await getAggregatedDiagnostics((request.params as { id: string }).id);
        if (!item) {
          return reply.status(404).send({
            error: 'AggregatedSeasonRunNotFound',
            message: 'No aggregated run found for stage',
          });
        }
        return reply.send(detailResponse(item));
      } catch (err) {
        return sendError(reply, err);
      }
    },
  );
}
