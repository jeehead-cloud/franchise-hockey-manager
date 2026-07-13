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
import { detailResponse, notFound, paginatedResponse } from '../http.js';
import { isErrorResult, parsePagination, replyBadRequest } from '../services/query.js';
import { listMatchAttempts, resimulateMatch } from '../services/commissioner-matches.js';
import { MatchHttpError } from '../services/matches.js';

function assertCommissionerAccess(request: { headers: Record<string, string | string[] | undefined> }) {
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

function commissionerSourceFor(request: { headers: Record<string, string | string[] | undefined> }) {
  return hasCommissionerHeader(request.headers) ? ('COMMISSIONER_API' as const) : ('COMMISSIONER_UI' as const);
}

function sendRouteError(reply: { status: (code: number) => { send: (body: unknown) => unknown } }, err: unknown) {
  if (err instanceof CommissionerHttpError) {
    return reply.status(err.statusCode).send(commissionerErrorBody(err));
  }
  if (err instanceof MatchHttpError) {
    return reply.status(err.statusCode).send({
      error: err.code,
      message: err.message,
      ...(err.details !== undefined ? { details: err.details } : {}),
    });
  }
  return reply.status(500).send({ error: 'CommissionerMatchFailed', message: 'Commissioner match operation failed' });
}

const resimulateSchema = z.object({
  expectedCurrentResultId: z.string().min(1),
  seed: z.union([z.string(), z.number()]).optional(),
  reason: z.string().min(1),
  inputMode: z.literal('ORIGINAL'),
});

export async function registerCommissionerMatchRoutes(app: FastifyInstance) {
  app.post('/api/commissioner/matches/:id/resimulate', async (request, reply) => {
    try {
      assertCommissionerAccess(request);
      const { id } = request.params as { id: string };
      const parsed = resimulateSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({
          error: 'InvalidResimulationRequest',
          message: 'Invalid resimulation request',
          details: parsed.error.flatten(),
        });
      }
      const item = await resimulateMatch(id, {
        ...parsed.data,
        source: commissionerSourceFor(request),
      });
      return detailResponse(item);
    } catch (err) {
      return sendRouteError(reply, err);
    }
  });

  app.get('/api/commissioner/matches/:id/attempts', async (request, reply) => {
    try {
      assertCommissionerAccess(request);
      const { id } = request.params as { id: string };
      const pagination = parsePagination(request.query as Record<string, unknown>);
      if (isErrorResult(pagination)) {
        const bad = replyBadRequest(pagination.error);
        return reply.status(bad.statusCode).send(bad.body);
      }
      const result = await listMatchAttempts(id, pagination);
      if (!result) return reply.status(404).send(notFound('Match'));
      return paginatedResponse({
        items: result.items,
        page: pagination.page,
        pageSize: pagination.pageSize,
        total: result.total,
      });
    } catch (err) {
      return sendRouteError(reply, err);
    }
  });
}
