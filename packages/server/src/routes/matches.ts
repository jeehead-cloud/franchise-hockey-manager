import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { detailResponse, notFound, paginatedResponse } from '../http.js';
import { isErrorResult, parseOptionalString, parsePagination, replyBadRequest } from '../services/query.js';
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
import { getMatchOverview } from '../services/match-view.js';
import { getMatchEventsView, parseMatchEventViewFilters } from '../services/match-events.js';
import {
  exportMatchEventsCsv,
  exportMatchResultJson,
  exportPlayerStatsCsv,
  exportTeamStatsCsv,
} from '../services/match-export.js';

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

function sendCsv(reply: { header: (k: string, v: string) => unknown; send: (b: string) => unknown }, filename: string, csv: string) {
  reply.header('Content-Type', 'text/csv; charset=utf-8');
  reply.header('Content-Disposition', `attachment; filename="${filename}"`);
  return reply.send(csv);
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

  app.get('/api/matches/:id/overview', async (request, reply) => {
    try {
      const { id } = request.params as { id: string };
      const query = request.query as Record<string, unknown>;
      const resultId = parseOptionalString(query.resultId);
      const item = await getMatchOverview(id, resultId);
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
      const query = request.query as Record<string, unknown>;
      const resultId = parseOptionalString(query.resultId);
      // Prefer F15 overview-backed result when resultId requested; keep F14 DTO for current.
      if (resultId) {
        const overview = await getMatchOverview(id, resultId);
        if (!overview) return reply.status(404).send(notFound('Match'));
        if (!overview.result) return reply.status(404).send(notFound('Match result'));
        return detailResponse(overview.result);
      }
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
      const query = request.query as Record<string, unknown>;
      const pagination = parsePagination(query);
      if (isErrorResult(pagination)) {
        const bad = replyBadRequest(pagination.error);
        return reply.status(bad.statusCode).send(bad.body);
      }
      const resultId = parseOptionalString(query.resultId);
      const viewFilters = parseMatchEventViewFilters(query);
      if (isErrorResult(viewFilters)) {
        const bad = replyBadRequest(viewFilters.error);
        return reply.status(bad.statusCode).send(bad.body);
      }

      // Prefer F15 public feed when category/team/player filters or default public visibility are used.
      if (
        resultId ||
        viewFilters.category ||
        viewFilters.teamId ||
        viewFilters.playerId ||
        viewFilters.visibility ||
        query.format === 'view'
      ) {
        const result = await getMatchEventsView(id, pagination, viewFilters, { resultId });
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
      }

      const legacyFilters = parseMatchEventFilters(query);
      if (isErrorResult(legacyFilters)) {
        const bad = replyBadRequest(legacyFilters.error);
        return reply.status(bad.statusCode).send(bad.body);
      }
      const result = await getMatchEvents(id, pagination, legacyFilters);
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

  app.get('/api/matches/:id/result/export', async (request, reply) => {
    try {
      const { id } = request.params as { id: string };
      const resultId = parseOptionalString((request.query as Record<string, unknown>).resultId);
      const payload = await exportMatchResultJson(id, resultId);
      if (!payload) return reply.status(404).send(notFound('Match'));
      reply.header('Content-Disposition', `attachment; filename="match-${id}-result.json"`);
      return payload;
    } catch (err) {
      const mapped = matchErrorReply(err);
      return reply.status(mapped.statusCode).send(mapped.body);
    }
  });

  app.get('/api/matches/:id/events/export', async (request, reply) => {
    try {
      const { id } = request.params as { id: string };
      const query = request.query as Record<string, unknown>;
      const resultId = parseOptionalString(query.resultId);
      const filters = parseMatchEventViewFilters(query);
      if (isErrorResult(filters)) {
        const bad = replyBadRequest(filters.error);
        return reply.status(bad.statusCode).send(bad.body);
      }
      const csv = await exportMatchEventsCsv(id, { ...filters, visibility: filters.visibility ?? 'PUBLIC' }, { resultId });
      if (csv == null) return reply.status(404).send(notFound('Match'));
      return sendCsv(reply, `match-${id}-events.csv`, csv);
    } catch (err) {
      const mapped = matchErrorReply(err);
      return reply.status(mapped.statusCode).send(mapped.body);
    }
  });

  app.get('/api/matches/:id/player-stats/export', async (request, reply) => {
    try {
      const { id } = request.params as { id: string };
      const resultId = parseOptionalString((request.query as Record<string, unknown>).resultId);
      const csv = await exportPlayerStatsCsv(id, resultId);
      if (csv == null) return reply.status(404).send(notFound('Match'));
      return sendCsv(reply, `match-${id}-player-stats.csv`, csv);
    } catch (err) {
      const mapped = matchErrorReply(err);
      return reply.status(mapped.statusCode).send(mapped.body);
    }
  });

  app.get('/api/matches/:id/team-stats/export', async (request, reply) => {
    try {
      const { id } = request.params as { id: string };
      const resultId = parseOptionalString((request.query as Record<string, unknown>).resultId);
      const csv = await exportTeamStatsCsv(id, resultId);
      if (csv == null) return reply.status(404).send(notFound('Match'));
      return sendCsv(reply, `match-${id}-team-stats.csv`, csv);
    } catch (err) {
      const mapped = matchErrorReply(err);
      return reply.status(mapped.statusCode).send(mapped.body);
    }
  });
}
