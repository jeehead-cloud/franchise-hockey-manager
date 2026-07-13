import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { detailResponse, notFound, paginatedResponse } from '../http.js';
import { prisma } from '../db/client.js';
import * as history from '../services/competition-history.js';
import { getArchiveReadiness } from '../services/competition-archive-readiness.js';
import { getEditionArchive } from '../services/competition-archive-persistence.js';

const pageSchema = z.coerce.number().int().min(1).default(1);
const pageSizeSchema = z.coerce.number().int().min(1).max(100).default(25);

export async function registerHistoryRoutes(app: FastifyInstance) {
  app.get('/api/history', async (_request, reply) => {
    return reply.send(detailResponse(await history.getHistoryLanding()));
  });

  app.get('/api/history/seasons', async (request, reply) => {
    const q = z
      .object({
        page: pageSchema,
        pageSize: pageSizeSchema,
        search: z.string().optional(),
      })
      .parse(request.query);
    const result = await history.listHistorySeasons(q);
    return reply.send(paginatedResponse(result));
  });

  app.get('/api/history/competitions', async (request, reply) => {
    const q = z
      .object({
        page: pageSchema,
        pageSize: pageSizeSchema,
        competitionId: z.string().optional(),
        worldSeasonId: z.string().optional(),
        championTeamId: z.string().optional(),
        search: z.string().optional(),
      })
      .parse(request.query);
    const result = await history.listHistoryCompetitions(q);
    return reply.send(paginatedResponse(result));
  });

  app.get('/api/history/competitions/:archiveId', async (request, reply) => {
    const { archiveId } = request.params as { archiveId: string };
    const item = await history.getHistoryArchiveDetail(archiveId);
    if (!item) return reply.status(404).send(notFound('CompetitionArchive'));
    return reply.send(detailResponse(item));
  });

  app.get('/api/history/competitions/:archiveId/participants', async (request, reply) => {
    const { archiveId } = request.params as { archiveId: string };
    const exists = await prisma.competitionArchive.findFirst({
      where: { id: archiveId, isCurrent: true },
      select: { id: true },
    });
    if (!exists) return reply.status(404).send(notFound('CompetitionArchive'));
    return reply.send(detailResponse(await history.getHistoryArchiveParticipants(archiveId)));
  });

  app.get('/api/history/competitions/:archiveId/stages', async (request, reply) => {
    const { archiveId } = request.params as { archiveId: string };
    const exists = await prisma.competitionArchive.findFirst({
      where: { id: archiveId, isCurrent: true },
      select: { id: true },
    });
    if (!exists) return reply.status(404).send(notFound('CompetitionArchive'));
    return reply.send(detailResponse(await history.getHistoryArchiveStages(archiveId)));
  });

  app.get('/api/history/competitions/:archiveId/standings', async (request, reply) => {
    const { archiveId } = request.params as { archiveId: string };
    const q = z.object({ stageId: z.string().optional() }).parse(request.query);
    const exists = await prisma.competitionArchive.findFirst({
      where: { id: archiveId, isCurrent: true },
      select: { id: true },
    });
    if (!exists) return reply.status(404).send(notFound('CompetitionArchive'));
    return reply.send(
      detailResponse(await history.getHistoryArchiveStandings(archiveId, q.stageId)),
    );
  });

  app.get('/api/history/competitions/:archiveId/matches', async (request, reply) => {
    const { archiveId } = request.params as { archiveId: string };
    const q = z
      .object({
        page: pageSchema,
        pageSize: pageSizeSchema,
        stageId: z.string().optional(),
        participantId: z.string().optional(),
      })
      .parse(request.query);
    const exists = await prisma.competitionArchive.findFirst({
      where: { id: archiveId, isCurrent: true },
      select: { id: true },
    });
    if (!exists) return reply.status(404).send(notFound('CompetitionArchive'));
    const result = await history.getHistoryArchiveMatches(archiveId, q);
    return reply.send(paginatedResponse(result));
  });

  app.get('/api/history/competitions/:archiveId/bracket', async (request, reply) => {
    const { archiveId } = request.params as { archiveId: string };
    const exists = await prisma.competitionArchive.findFirst({
      where: { id: archiveId, isCurrent: true },
      select: { id: true },
    });
    if (!exists) return reply.status(404).send(notFound('CompetitionArchive'));
    return reply.send(detailResponse(await history.getHistoryArchiveBracket(archiveId)));
  });

  app.get('/api/history/competitions/:archiveId/team-stats', async (request, reply) => {
    const { archiveId } = request.params as { archiveId: string };
    const q = z.object({ stageId: z.string().optional() }).parse(request.query);
    const exists = await prisma.competitionArchive.findFirst({
      where: { id: archiveId, isCurrent: true },
      select: { id: true },
    });
    if (!exists) return reply.status(404).send(notFound('CompetitionArchive'));
    return reply.send(
      detailResponse(await history.getHistoryArchiveTeamStats(archiveId, q.stageId)),
    );
  });

  app.get('/api/history/competitions/:archiveId/player-stats', async (request, reply) => {
    const { archiveId } = request.params as { archiveId: string };
    const q = z
      .object({
        page: pageSchema,
        pageSize: pageSizeSchema,
        stageId: z.string().optional(),
      })
      .parse(request.query);
    const exists = await prisma.competitionArchive.findFirst({
      where: { id: archiveId, isCurrent: true },
      select: { id: true },
    });
    if (!exists) return reply.status(404).send(notFound('CompetitionArchive'));
    const result = await history.getHistoryArchivePlayerStats(archiveId, {
      ...q,
      goalies: false,
    });
    return reply.send(paginatedResponse(result));
  });

  app.get('/api/history/competitions/:archiveId/goalie-stats', async (request, reply) => {
    const { archiveId } = request.params as { archiveId: string };
    const q = z
      .object({
        page: pageSchema,
        pageSize: pageSizeSchema,
        stageId: z.string().optional(),
      })
      .parse(request.query);
    const exists = await prisma.competitionArchive.findFirst({
      where: { id: archiveId, isCurrent: true },
      select: { id: true },
    });
    if (!exists) return reply.status(404).send(notFound('CompetitionArchive'));
    const result = await history.getHistoryArchivePlayerStats(archiveId, {
      ...q,
      goalies: true,
    });
    return reply.send(paginatedResponse(result));
  });

  app.get('/api/history/competitions/:archiveId/awards', async (request, reply) => {
    const { archiveId } = request.params as { archiveId: string };
    const exists = await prisma.competitionArchive.findFirst({
      where: { id: archiveId, isCurrent: true },
      select: { id: true },
    });
    if (!exists) return reply.status(404).send(notFound('CompetitionArchive'));
    return reply.send(detailResponse(await history.getHistoryArchiveAwards(archiveId)));
  });

  app.get('/api/history/champions', async (request, reply) => {
    const q = z.object({ page: pageSchema, pageSize: pageSizeSchema }).parse(request.query);
    const result = await history.listHistoryChampions(q);
    return reply.send(paginatedResponse(result));
  });

  app.get('/api/history/records', async (_request, reply) => {
    return reply.send(detailResponse(await history.getHistoryRecords()));
  });

  app.get('/api/history/players/:playerId/seasons', async (request, reply) => {
    const { playerId } = request.params as { playerId: string };
    return reply.send(detailResponse(await history.getPlayerSeasonHistory(playerId)));
  });

  app.get('/api/history/teams/:teamId/seasons', async (request, reply) => {
    const { teamId } = request.params as { teamId: string };
    return reply.send(detailResponse(await history.getTeamSeasonHistory(teamId)));
  });

  app.get('/api/competition-editions/:id/archive-readiness', async (request, reply) => {
    const { id } = request.params as { id: string };
    const item = await getArchiveReadiness(id);
    if (!item) return reply.status(404).send(notFound('CompetitionEdition'));
    return reply.send(detailResponse(item));
  });

  app.get('/api/competition-editions/:id/archive', async (request, reply) => {
    const { id } = request.params as { id: string };
    const item = await getEditionArchive(id);
    if (!item) return reply.status(404).send(notFound('CompetitionArchive'));
    return reply.send(
      detailResponse({
        id: item.id,
        archiveHash: item.archiveHash,
        sourceSnapshotHash: item.sourceSnapshotHash,
        archivedAt: item.archivedAt,
        archiveVersion: item.archiveVersion,
        status: item.status,
        isCurrent: item.isCurrent,
        historyPath: `/history/competitions/${item.id}`,
      }),
    );
  });
}
