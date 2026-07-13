import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  areCommissionerWritesEnabled,
  hasCommissionerHeader,
} from '../commissioner/gate.js';
import { CommissionerHttpError, commissionerErrorBody } from '../commissioner/errors.js';
import { detailResponse, paginatedResponse } from '../http.js';
import {
  importQualifiedParticipants,
  previewPlayoffBracket,
  generatePlayoffBracketPersisted,
  regeneratePlayoffBracket,
} from '../services/playoffs-bracket.js';
import {
  getPlayoffBracket,
  getPlayoffSeriesDetail,
  getPlayoffProgress,
  getEditionCompletionReadiness,
} from '../services/playoffs-reads.js';
import {
  simulateNextPlayoffGame,
  simulatePlayoffSeries,
  startFullPlayoffsSimulation,
  getPlayoffSimulationRun,
  cancelPlayoffSimulation,
  serializePlayoffRun,
} from '../services/playoffs-simulation.js';
import { PlayoffHttpError, playoffErrorBody } from '../services/playoff-errors.js';
import { prisma } from '../db/client.js';

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
      'Commissioner writes are disabled',
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
  if (err instanceof PlayoffHttpError) {
    return reply.status(err.statusCode).send(playoffErrorBody(err));
  }
  if (err instanceof CommissionerHttpError) {
    return reply.status(err.statusCode).send(commissionerErrorBody(err));
  }
  if (err instanceof z.ZodError) {
    return reply.status(400).send({
      error: 'InvalidPlayoffRequest',
      message: 'Invalid playoff request',
      details: err.issues,
    });
  }
  throw err;
}

const expectedUpdatedAt = z.string().datetime();
const reason = z.string().min(3);
const seedSchema = z.string().min(1).max(200);

export async function registerPlayoffRoutes(app: FastifyInstance) {
  app.get('/api/competition-stages/:id/bracket', async (request, reply) => {
    try {
      return reply.send(detailResponse(await getPlayoffBracket((request.params as { id: string }).id)));
    } catch (err) {
      return sendError(reply, err);
    }
  });

  app.get('/api/competition-stages/:id/playoff-progress', async (request, reply) => {
    try {
      return reply.send(detailResponse(await getPlayoffProgress((request.params as { id: string }).id)));
    } catch (err) {
      return sendError(reply, err);
    }
  });

  app.get('/api/playoff-series/:id', async (request, reply) => {
    try {
      return reply.send(detailResponse(await getPlayoffSeriesDetail((request.params as { id: string }).id)));
    } catch (err) {
      return sendError(reply, err);
    }
  });

  app.get('/api/playoff-series/:id/games', async (request, reply) => {
    try {
      const detail = await getPlayoffSeriesDetail((request.params as { id: string }).id);
      return reply.send({ items: detail.series?.games ?? [] });
    } catch (err) {
      return sendError(reply, err);
    }
  });

  app.get('/api/competition-editions/:id/completion-readiness', async (request, reply) => {
    try {
      const item = await getEditionCompletionReadiness((request.params as { id: string }).id);
      if (!item) return reply.status(404).send({ error: 'NotFound', message: 'Edition not found' });
      return reply.send(detailResponse(item));
    } catch (err) {
      return sendError(reply, err);
    }
  });

  app.post('/api/playoff-series/:id/simulate-next', async (request, reply) => {
    try {
      const body = z.object({ baseSeed: seedSchema.optional() }).parse(request.body ?? {});
      const result = await simulateNextPlayoffGame((request.params as { id: string }).id, body.baseSeed);
      return reply.send(detailResponse(result));
    } catch (err) {
      return sendError(reply, err);
    }
  });

  app.post('/api/playoff-series/:id/simulate-series', async (request, reply) => {
    try {
      const body = z.object({ baseSeed: seedSchema }).parse(request.body ?? {});
      const result = await simulatePlayoffSeries((request.params as { id: string }).id, body.baseSeed);
      return reply.send(detailResponse(result));
    } catch (err) {
      return sendError(reply, err);
    }
  });

  app.post('/api/competition-stages/:id/simulate-playoffs', async (request, reply) => {
    try {
      const body = z.object({ baseSeed: seedSchema }).parse(request.body ?? {});
      const run = await startFullPlayoffsSimulation((request.params as { id: string }).id, body);
      return reply.status(202).send(detailResponse(serializePlayoffRun(run)));
    } catch (err) {
      return sendError(reply, err);
    }
  });

  app.get('/api/competition-stages/:id/simulation-runs/:runId', async (request, reply) => {
    try {
      const { id, runId } = request.params as { id: string; runId: string };
      return reply.send(detailResponse(getPlayoffSimulationRun(id, runId)));
    } catch (err) {
      return sendError(reply, err);
    }
  });

  app.delete('/api/competition-stages/:id/simulation-runs/:runId', async (request, reply) => {
    try {
      const { id, runId } = request.params as { id: string; runId: string };
      return reply.send(detailResponse(cancelPlayoffSimulation(id, runId)));
    } catch (err) {
      return sendError(reply, err);
    }
  });

  // Commissioner
  app.post('/api/commissioner/competition-stages/:id/import-qualified-participants', async (request, reply) => {
    try {
      assertCommissionerAccess(request);
      const body = z
        .object({
          expectedUpdatedAt,
          sourceStageId: z.string().min(1),
          qualificationCount: z.number().int().min(2),
          reason,
        })
        .parse(request.body ?? {});
      const item = await importQualifiedParticipants(
        (request.params as { id: string }).id,
        body,
        sourceFor(request),
      );
      return reply.send(detailResponse(item));
    } catch (err) {
      return sendError(reply, err);
    }
  });

  app.post('/api/commissioner/competition-stages/:id/bracket-preview', async (request, reply) => {
    try {
      assertCommissionerAccess(request);
      const body = z.object({ seed: seedSchema }).parse(request.body ?? {});
      const item = await previewPlayoffBracket((request.params as { id: string }).id, body.seed);
      return reply.send(detailResponse(item));
    } catch (err) {
      return sendError(reply, err);
    }
  });

  app.post('/api/commissioner/competition-stages/:id/generate-bracket', async (request, reply) => {
    try {
      assertCommissionerAccess(request);
      const body = z
        .object({ expectedUpdatedAt, seed: seedSchema, reason })
        .parse(request.body ?? {});
      const item = await generatePlayoffBracketPersisted(
        (request.params as { id: string }).id,
        body,
        sourceFor(request),
      );
      return reply.send(detailResponse(item));
    } catch (err) {
      return sendError(reply, err);
    }
  });

  app.post('/api/commissioner/competition-stages/:id/regenerate-bracket', async (request, reply) => {
    try {
      assertCommissionerAccess(request);
      const body = z
        .object({ expectedUpdatedAt, seed: seedSchema, reason })
        .parse(request.body ?? {});
      const item = await regeneratePlayoffBracket(
        (request.params as { id: string }).id,
        body,
        sourceFor(request),
      );
      return reply.send(detailResponse(item));
    } catch (err) {
      return sendError(reply, err);
    }
  });

  app.get('/api/commissioner/competition-stages/:id/playoff-audit', async (request, reply) => {
    try {
      assertCommissionerAccess(request);
      const id = (request.params as { id: string }).id;
      const q = request.query as Record<string, string | undefined>;
      const page = Math.max(1, Number(q.page ?? 1));
      const pageSize = Math.min(100, Math.max(1, Number(q.pageSize ?? 50)));
      const where = { entityType: 'COMPETITION_STAGE' as const, entityId: id };
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
