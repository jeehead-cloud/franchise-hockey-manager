import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { detailResponse, notFound, paginatedResponse } from '../http.js';
import { isErrorResult, parsePagination, replyBadRequest } from '../services/query.js';
import {
  createPreparedMatch,
  getMatchById,
  listMatches,
  MatchHttpError,
  mapMatchServiceError,
  parseMatchListFilters,
} from '../services/matches.js';
import { simulateMatch } from '../services/match-simulation.js';
import { getMatchEvents, getMatchResult, parseMatchEventFilters } from '../services/match-results.js';

const createMatchSchema = z.object({
  homeTeamId: z.string().min(1),
  awayTeamId: z.string().min(1),
  competitionEditionId: z.string().min(1).optional().nullable(),
  scheduledAt: z.string().datetime().optional().nullable(),
  rules: z
    .object({
      regulationPeriods: z.number().int().optional(),
      periodDurationSeconds: z.number().int().optional(),
      completion: z
        .object({
          overtimeEnabled: z.boolean().optional(),
          shootoutEnabled: z.boolean().optional(),
          tiesAllowed: z.boolean().optional(),
        })
        .optional(),
    })
    .optional(),
});

const simulateMatchSchema = z.object({
  seed: z.union([z.string(), z.number()]).optional(),
});

function matchErrorReply(err: unknown) {
  const mapped = err instanceof MatchHttpError ? err : mapMatchServiceError(err);
  return {
    statusCode: mapped.statusCode,
    body: {
      error: mapped.code,
      message: mapped.message,
      ...(mapped.details !== undefined ? { details: mapped.details } : {}),
    },
  };
}

export async function registerMatchRoutes(app: FastifyInstance) {
  app.post('/api/matches', async (request, reply) => {
    try {
      const parsed = createMatchSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({
          error: 'InvalidMatchRequest',
          message: 'Invalid create match request',
          details: parsed.error.flatten(),
        });
      }
      const item = await createPreparedMatch({
        homeTeamId: parsed.data.homeTeamId,
        awayTeamId: parsed.data.awayTeamId,
        competitionEditionId: parsed.data.competitionEditionId,
        scheduledAt: parsed.data.scheduledAt ? new Date(parsed.data.scheduledAt) : null,
        rules: parsed.data.rules
          ? {
              regulationPeriods: parsed.data.rules.regulationPeriods,
              periodDurationSeconds: parsed.data.rules.periodDurationSeconds,
              completion: parsed.data.rules.completion
                ? {
                    overtimeEnabled: parsed.data.rules.completion.overtimeEnabled ?? false,
                    shootoutEnabled: parsed.data.rules.completion.shootoutEnabled ?? false,
                    tiesAllowed: parsed.data.rules.completion.tiesAllowed ?? true,
                  }
                : undefined,
            }
          : undefined,
      });
      return reply.status(201).send(detailResponse(item));
    } catch (err) {
      const mapped = matchErrorReply(err);
      return reply.status(mapped.statusCode).send(mapped.body);
    }
  });

  app.post('/api/matches/:id/simulate', async (request, reply) => {
    try {
      const { id } = request.params as { id: string };
      const parsed = simulateMatchSchema.safeParse(request.body ?? {});
      if (!parsed.success) {
        return reply.status(400).send({
          error: 'InvalidMatchRequest',
          message: 'Invalid simulate match request',
          details: parsed.error.flatten(),
        });
      }
      const result = await simulateMatch(id, parsed.data.seed);
      return reply.send(
        detailResponse({
          matchId: result.matchId,
          resultId: result.resultId,
          decisionType: result.engineOutput.decisionType,
          homeScore: result.engineOutput.homeScore,
          awayScore: result.engineOutput.awayScore,
          winnerTeamId: result.engineOutput.winnerTeamId,
          traceHash: result.engineOutput.diagnostics.traceHash,
          reconciliationOk: result.engineOutput.reconciliation.ok,
        }),
      );
    } catch (err) {
      const mapped = matchErrorReply(err);
      return reply.status(mapped.statusCode).send(mapped.body);
    }
  });

  app.get('/api/matches', async (request, reply) => {
    try {
      const pagination = parsePagination(request.query as Record<string, unknown>);
      if (isErrorResult(pagination)) {
        const bad = replyBadRequest(pagination.error);
        return reply.status(bad.statusCode).send(bad.body);
      }
      const filters = parseMatchListFilters(request.query as Record<string, unknown>);
      if (isErrorResult(filters)) {
        const bad = replyBadRequest(filters.error);
        return reply.status(bad.statusCode).send(bad.body);
      }
      const result = await listMatches(filters, pagination);
      return paginatedResponse({
        items: result.items,
        page: pagination.page,
        pageSize: pagination.pageSize,
        total: result.total,
      });
    } catch (err) {
      const mapped = matchErrorReply(err);
      return reply.status(mapped.statusCode).send(mapped.body);
    }
  });

  app.get('/api/matches/:id', async (request, reply) => {
    try {
      const { id } = request.params as { id: string };
      const item = await getMatchById(id);
      if (!item) return reply.status(404).send(notFound('Match'));
      return detailResponse(item);
    } catch (err) {
      const mapped = matchErrorReply(err);
      return reply.status(mapped.statusCode).send(mapped.body);
    }
  });

  app.get('/api/matches/:id/result', async (request, reply) => {
    try {
      const { id } = request.params as { id: string };
      const item = await getMatchResult(id);
      if (!item) return reply.status(404).send(notFound('Match'));
      return detailResponse(item);
    } catch (err) {
      const mapped = matchErrorReply(err);
      return reply.status(mapped.statusCode).send(mapped.body);
    }
  });

  app.get('/api/matches/:id/events', async (request, reply) => {
    try {
      const { id } = request.params as { id: string };
      const pagination = parsePagination(request.query as Record<string, unknown>);
      if (isErrorResult(pagination)) {
        const bad = replyBadRequest(pagination.error);
        return reply.status(bad.statusCode).send(bad.body);
      }
      const filters = parseMatchEventFilters(request.query as Record<string, unknown>);
      if (isErrorResult(filters)) {
        const bad = replyBadRequest(filters.error);
        return reply.status(bad.statusCode).send(bad.body);
      }
      const result = await getMatchEvents(id, pagination, filters);
      if (!result) return reply.status(404).send(notFound('Match'));
      return paginatedResponse({
        items: result.items,
        page: pagination.page,
        pageSize: pagination.pageSize,
        total: result.total,
      });
    } catch (err) {
      const mapped = matchErrorReply(err);
      return reply.status(mapped.statusCode).send(mapped.body);
    }
  });
}
