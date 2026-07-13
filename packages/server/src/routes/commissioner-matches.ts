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
import { isErrorResult, parseOptionalString, parsePagination, replyBadRequest } from '../services/query.js';
import { listMatchAttempts, resimulateMatch } from '../services/commissioner-matches.js';
import { MatchHttpError } from '../services/matches.js';
import { getMatchDiagnostics, listMatchAudit } from '../services/match-diagnostics.js';
import { getMatchEventsView, parseMatchEventViewFilters } from '../services/match-events.js';
import { getMatchOverview } from '../services/match-view.js';
import { exportDiagnosticsJson, exportMatchEventsCsv } from '../services/match-export.js';

function assertCommissionerRead(request: { headers: Record<string, string | string[] | undefined> }) {
  if (!hasCommissionerHeader(request.headers)) {
    throw new CommissionerHttpError(
      403,
      'CommissionerModeRequired',
      'Commissioner Mode header X-FHM-Commissioner-Mode: enabled is required',
    );
  }
}

function assertCommissionerWrite(request: { headers: Record<string, string | string[] | undefined> }) {
  assertCommissionerRead(request);
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
      assertCommissionerWrite(request);
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
      assertCommissionerRead(request);
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

  app.get('/api/commissioner/matches/:id/diagnostics', async (request, reply) => {
    try {
      assertCommissionerRead(request);
      const { id } = request.params as { id: string };
      const resultId = parseOptionalString((request.query as Record<string, unknown>).resultId);
      const item = await getMatchDiagnostics(id, resultId);
      if (!item) return reply.status(404).send(notFound('Match'));
      return detailResponse(item);
    } catch (err) {
      return sendRouteError(reply, err);
    }
  });

  app.get('/api/commissioner/matches/:id/results/:resultId/diagnostics', async (request, reply) => {
    try {
      assertCommissionerRead(request);
      const { id, resultId } = request.params as { id: string; resultId: string };
      const item = await getMatchDiagnostics(id, resultId);
      if (!item) return reply.status(404).send(notFound('Match'));
      return detailResponse(item);
    } catch (err) {
      return sendRouteError(reply, err);
    }
  });

  app.get('/api/commissioner/matches/:id/results/:resultId', async (request, reply) => {
    try {
      assertCommissionerRead(request);
      const { id, resultId } = request.params as { id: string; resultId: string };
      const item = await getMatchOverview(id, resultId);
      if (!item) return reply.status(404).send(notFound('Match'));
      return detailResponse(item);
    } catch (err) {
      return sendRouteError(reply, err);
    }
  });

  app.get('/api/commissioner/matches/:id/results/:resultId/events', async (request, reply) => {
    try {
      assertCommissionerRead(request);
      const { id, resultId } = request.params as { id: string; resultId: string };
      const query = request.query as Record<string, unknown>;
      const pagination = parsePagination(query);
      if (isErrorResult(pagination)) {
        const bad = replyBadRequest(pagination.error);
        return reply.status(bad.statusCode).send(bad.body);
      }
      const filters = parseMatchEventViewFilters(query);
      if (isErrorResult(filters)) {
        const bad = replyBadRequest(filters.error);
        return reply.status(bad.statusCode).send(bad.body);
      }
      const result = await getMatchEventsView(
        id,
        pagination,
        { ...filters, visibility: filters.visibility ?? 'ALL' },
        { resultId, includeTechnicalPayload: true },
      );
      if (!result) return reply.status(404).send(notFound('Match'));
      return {
        ...paginatedResponse({
          items: result.items,
          page: pagination.page,
          pageSize: pagination.pageSize,
          total: result.total,
        }),
        matchId: result.matchId,
        resultId: result.resultId,
        isCurrent: result.isCurrent,
      };
    } catch (err) {
      return sendRouteError(reply, err);
    }
  });

  app.get('/api/commissioner/matches/:id/audit', async (request, reply) => {
    try {
      assertCommissionerRead(request);
      const { id } = request.params as { id: string };
      const pagination = parsePagination(request.query as Record<string, unknown>);
      if (isErrorResult(pagination)) {
        const bad = replyBadRequest(pagination.error);
        return reply.status(bad.statusCode).send(bad.body);
      }
      const result = await listMatchAudit(id, pagination);
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

  app.get('/api/commissioner/matches/:id/diagnostics/export', async (request, reply) => {
    try {
      assertCommissionerRead(request);
      const { id } = request.params as { id: string };
      const resultId = parseOptionalString((request.query as Record<string, unknown>).resultId);
      const payload = await exportDiagnosticsJson(id, resultId);
      if (!payload) return reply.status(404).send(notFound('Match'));
      reply.header('Content-Disposition', `attachment; filename="match-${id}-diagnostics.json"`);
      return payload;
    } catch (err) {
      return sendRouteError(reply, err);
    }
  });

  app.get('/api/commissioner/matches/:id/events/export', async (request, reply) => {
    try {
      assertCommissionerRead(request);
      const { id } = request.params as { id: string };
      const query = request.query as Record<string, unknown>;
      const resultId = parseOptionalString(query.resultId);
      const filters = parseMatchEventViewFilters(query);
      if (isErrorResult(filters)) {
        const bad = replyBadRequest(filters.error);
        return reply.status(bad.statusCode).send(bad.body);
      }
      const csv = await exportMatchEventsCsv(
        id,
        { ...filters, visibility: filters.visibility ?? 'ALL' },
        { resultId, technical: true },
      );
      if (csv == null) return reply.status(404).send(notFound('Match'));
      reply.header('Content-Type', 'text/csv; charset=utf-8');
      reply.header('Content-Disposition', `attachment; filename="match-${id}-technical-events.csv"`);
      return reply.send(csv);
    } catch (err) {
      return sendRouteError(reply, err);
    }
  });
}
