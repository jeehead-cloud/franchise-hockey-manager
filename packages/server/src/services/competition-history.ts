import {
  deriveHistoricalRecords,
  type ArchiveRecordSource,
  type NormalizedCompetitionArchive,
} from '@fhm/engine';
import { prisma } from '../db/client.js';

function parseJsonArray(text: string): string[] {
  try {
    const v = JSON.parse(text);
    return Array.isArray(v) ? v.map(String) : [];
  } catch {
    return [];
  }
}

export async function listHistorySeasons(opts: {
  page: number;
  pageSize: number;
  search?: string;
}) {
  const where = {
    archives: { some: { isCurrent: true } },
    ...(opts.search
      ? { label: { contains: opts.search } }
      : {}),
  };
  const total = await prisma.worldSeason.count({ where });
  const items = await prisma.worldSeason.findMany({
    where,
    orderBy: [{ startYear: 'desc' }, { label: 'asc' }],
    skip: (opts.page - 1) * opts.pageSize,
    take: opts.pageSize,
    include: {
      archives: {
        where: { isCurrent: true },
        select: {
          id: true,
          competitionNameSnapshot: true,
          editionNameSnapshot: true,
          championNameSnapshot: true,
          archivedAt: true,
          matchCount: true,
        },
      },
    },
  });
  return { items, total, page: opts.page, pageSize: opts.pageSize };
}

export async function listHistoryCompetitions(opts: {
  page: number;
  pageSize: number;
  competitionId?: string;
  worldSeasonId?: string;
  championTeamId?: string;
  search?: string;
}) {
  const where = {
    isCurrent: true,
    ...(opts.competitionId ? { competitionId: opts.competitionId } : {}),
    ...(opts.worldSeasonId ? { worldSeasonId: opts.worldSeasonId } : {}),
    ...(opts.championTeamId ? { championTeamSourceId: opts.championTeamId } : {}),
    ...(opts.search
      ? {
          OR: [
            { competitionNameSnapshot: { contains: opts.search } },
            { editionNameSnapshot: { contains: opts.search } },
            { championNameSnapshot: { contains: opts.search } },
          ],
        }
      : {}),
  };
  const total = await prisma.competitionArchive.count({ where });
  const items = await prisma.competitionArchive.findMany({
    where,
    orderBy: [{ archivedAt: 'desc' }],
    skip: (opts.page - 1) * opts.pageSize,
    take: opts.pageSize,
    select: {
      id: true,
      competitionId: true,
      competitionEditionId: true,
      worldSeasonId: true,
      competitionNameSnapshot: true,
      editionNameSnapshot: true,
      worldSeasonNameSnapshot: true,
      competitionTypeSnapshot: true,
      simulationLevelSnapshot: true,
      championNameSnapshot: true,
      championTeamSourceId: true,
      participantCount: true,
      matchCount: true,
      archiveHash: true,
      archivedAt: true,
      archiveVersion: true,
      status: true,
    },
  });
  return { items, total, page: opts.page, pageSize: opts.pageSize };
}

export async function getHistoryArchiveDetail(archiveId: string) {
  const archive = await prisma.competitionArchive.findFirst({
    where: { id: archiveId, isCurrent: true },
    include: {
      awards: { orderBy: [{ awardType: 'asc' }, { rank: 'asc' }], take: 20 },
      standings: {
        orderBy: { rank: 'asc' },
        take: 10,
        include: { participant: true, stage: true },
      },
      playerStats: {
        where: { isGoalie: false },
        orderBy: { points: 'desc' },
        take: 10,
      },
      stages: { orderBy: { stageOrder: 'asc' } },
    },
  });
  if (!archive) return null;
  return {
    id: archive.id,
    archiveSchemaVersion: archive.archiveSchemaVersion,
    archiveVersion: archive.archiveVersion,
    status: archive.status,
    isCurrent: archive.isCurrent,
    competitionId: archive.competitionId,
    competitionEditionId: archive.competitionEditionId,
    worldSeasonId: archive.worldSeasonId,
    competitionNameSnapshot: archive.competitionNameSnapshot,
    competitionShortNameSnapshot: archive.competitionShortNameSnapshot,
    editionNameSnapshot: archive.editionNameSnapshot,
    worldSeasonNameSnapshot: archive.worldSeasonNameSnapshot,
    competitionTypeSnapshot: archive.competitionTypeSnapshot,
    simulationLevelSnapshot: archive.simulationLevelSnapshot,
    rulesHash: archive.rulesHash,
    engineVersions: parseJsonArray(archive.engineVersionsText),
    balanceVersions: parseJsonArray(archive.balanceVersionsText),
    participantCount: archive.participantCount,
    stageCount: archive.stageCount,
    matchCount: archive.matchCount,
    champion: archive.championNameSnapshot
      ? {
          name: archive.championNameSnapshot,
          shortName: archive.championShortNameSnapshot,
          participantSourceId: archive.championParticipantSourceId,
          teamSourceId: archive.championTeamSourceId,
        }
      : null,
    archiveHash: archive.archiveHash,
    archivedAt: archive.archivedAt,
    awards: archive.awards,
    topStandings: archive.standings,
    topPlayers: archive.playerStats,
    stages: archive.stages,
  };
}

export async function getHistoryArchiveParticipants(archiveId: string) {
  return prisma.archiveParticipant.findMany({
    where: { competitionArchiveId: archiveId },
    orderBy: { participantOrder: 'asc' },
  });
}

export async function getHistoryArchiveStages(archiveId: string) {
  return prisma.archiveStage.findMany({
    where: { competitionArchiveId: archiveId },
    orderBy: { stageOrder: 'asc' },
  });
}

export async function getHistoryArchiveStandings(archiveId: string, stageId?: string) {
  return prisma.archiveStanding.findMany({
    where: {
      competitionArchiveId: archiveId,
      ...(stageId ? { archiveStageId: stageId } : {}),
    },
    orderBy: [{ archiveStageId: 'asc' }, { rank: 'asc' }],
    include: { participant: true, stage: true },
  });
}

export async function getHistoryArchiveMatches(
  archiveId: string,
  opts: { page: number; pageSize: number; stageId?: string; participantId?: string },
) {
  const where = {
    competitionArchiveId: archiveId,
    ...(opts.stageId ? { archiveStageId: opts.stageId } : {}),
    ...(opts.participantId
      ? {
          OR: [
            { homeArchiveParticipantId: opts.participantId },
            { awayArchiveParticipantId: opts.participantId },
          ],
        }
      : {}),
  };
  const total = await prisma.archiveMatchSummary.count({ where });
  const items = await prisma.archiveMatchSummary.findMany({
    where,
    orderBy: [{ scheduleOrder: 'asc' }, { gameNumber: 'asc' }],
    skip: (opts.page - 1) * opts.pageSize,
    take: opts.pageSize,
  });
  return { items, total, page: opts.page, pageSize: opts.pageSize };
}

export async function getHistoryArchiveBracket(archiveId: string) {
  const series = await prisma.archiveSeries.findMany({
    where: { competitionArchiveId: archiveId },
    orderBy: [{ roundNumber: 'asc' }, { seriesOrder: 'asc' }],
    include: {
      participant1: true,
      participant2: true,
      winner: true,
      games: { orderBy: { gameNumber: 'asc' } },
      stage: true,
    },
  });
  const archive = await prisma.competitionArchive.findUnique({
    where: { id: archiveId },
    select: {
      championNameSnapshot: true,
      championParticipantSourceId: true,
      championTeamSourceId: true,
    },
  });
  return { series, champion: archive };
}

export async function getHistoryArchiveTeamStats(archiveId: string, stageId?: string) {
  return prisma.archiveTeamStat.findMany({
    where: {
      competitionArchiveId: archiveId,
      ...(stageId ? { archiveStageId: stageId } : {}),
    },
    include: { participant: true, stage: true },
    orderBy: { goals: 'desc' },
  });
}

export async function getHistoryArchivePlayerStats(
  archiveId: string,
  opts: { stageId?: string; goalies?: boolean; page: number; pageSize: number },
) {
  const where = {
    competitionArchiveId: archiveId,
    ...(opts.stageId ? { archiveStageId: opts.stageId } : {}),
    ...(opts.goalies === true ? { isGoalie: true } : opts.goalies === false ? { isGoalie: false } : {}),
  };
  const total = await prisma.archivePlayerStat.count({ where });
  const items = await prisma.archivePlayerStat.findMany({
    where,
    orderBy: opts.goalies ? [{ savePercentage: 'desc' }, { goalieWins: 'desc' }] : [{ points: 'desc' }],
    skip: (opts.page - 1) * opts.pageSize,
    take: opts.pageSize,
    include: { stage: true, participant: true },
  });
  return { items, total, page: opts.page, pageSize: opts.pageSize };
}

export async function getHistoryArchiveAwards(archiveId: string) {
  return prisma.archiveAward.findMany({
    where: { competitionArchiveId: archiveId },
    orderBy: [{ awardType: 'asc' }, { rank: 'asc' }],
    include: { participant: true, stage: true },
  });
}

export async function listHistoryChampions(opts: { page: number; pageSize: number }) {
  const where = { isCurrent: true, championNameSnapshot: { not: null } };
  const total = await prisma.competitionArchive.count({ where });
  const items = await prisma.competitionArchive.findMany({
    where,
    orderBy: { archivedAt: 'desc' },
    skip: (opts.page - 1) * opts.pageSize,
    take: opts.pageSize,
    select: {
      id: true,
      worldSeasonNameSnapshot: true,
      competitionNameSnapshot: true,
      editionNameSnapshot: true,
      championNameSnapshot: true,
      championShortNameSnapshot: true,
      championTeamSourceId: true,
      archivedAt: true,
    },
  });
  return { items, total, page: opts.page, pageSize: opts.pageSize };
}

export async function getHistoryRecords() {
  const archives = await prisma.competitionArchive.findMany({
    where: { isCurrent: true },
    include: {
      participants: true,
      stages: true,
      standings: true,
      teamStats: true,
      playerStats: true,
    },
  });

  const sources: ArchiveRecordSource[] = archives.map((a) => {
    const normalized = JSON.parse(a.canonicalSnapshotText) as NormalizedCompetitionArchive;
    return {
      archiveId: a.id,
      competitionNameSnapshot: a.competitionNameSnapshot,
      worldSeasonNameSnapshot: a.worldSeasonNameSnapshot,
      archive: {
        standings: normalized.standings,
        teamStats: normalized.teamStats,
        playerStats: normalized.playerStats,
        championTeamSourceId: a.championTeamSourceId,
        championNameSnapshot: a.championNameSnapshot,
        championSourceParticipantId: a.championParticipantSourceId,
        participants: normalized.participants,
        stages: normalized.stages,
      },
    };
  });

  return deriveHistoricalRecords(sources);
}

export async function getPlayerSeasonHistory(playerId: string) {
  const rows = await prisma.archivePlayerStat.findMany({
    where: { sourcePlayerId: playerId, archive: { isCurrent: true } },
    include: {
      archive: {
        select: {
          id: true,
          competitionNameSnapshot: true,
          worldSeasonNameSnapshot: true,
          editionNameSnapshot: true,
          championNameSnapshot: true,
          championTeamSourceId: true,
        },
      },
      stage: true,
      participant: true,
    },
    orderBy: [{ archive: { archivedAt: 'desc' } }, { points: 'desc' }],
  });
  const awards = await prisma.archiveAward.findMany({
    where: { sourcePlayerId: playerId, archive: { isCurrent: true } },
    include: { archive: { select: { id: true, competitionNameSnapshot: true } } },
  });
  return { seasons: rows, awards };
}

export async function getTeamSeasonHistory(teamId: string) {
  const participants = await prisma.archiveParticipant.findMany({
    where: { sourceTeamId: teamId, archive: { isCurrent: true } },
    include: {
      archive: {
        select: {
          id: true,
          competitionNameSnapshot: true,
          worldSeasonNameSnapshot: true,
          editionNameSnapshot: true,
          championTeamSourceId: true,
          championNameSnapshot: true,
          archivedAt: true,
        },
      },
      standings: { include: { stage: true } },
      teamStats: { include: { stage: true } },
    },
    orderBy: { archive: { archivedAt: 'desc' } },
  });
  return { seasons: participants };
}

export async function getHistoryLanding() {
  const archiveCount = await prisma.competitionArchive.count({ where: { isCurrent: true } });
  const latest = await prisma.competitionArchive.findMany({
    where: { isCurrent: true },
    orderBy: { archivedAt: 'desc' },
    take: 5,
    select: {
      id: true,
      competitionNameSnapshot: true,
      worldSeasonNameSnapshot: true,
      championNameSnapshot: true,
      archivedAt: true,
    },
  });
  const champions = await prisma.competitionArchive.findMany({
    where: { isCurrent: true, championNameSnapshot: { not: null } },
    orderBy: { archivedAt: 'desc' },
    take: 5,
    select: {
      id: true,
      competitionNameSnapshot: true,
      worldSeasonNameSnapshot: true,
      championNameSnapshot: true,
    },
  });
  return { archiveCount, latest, champions };
}
