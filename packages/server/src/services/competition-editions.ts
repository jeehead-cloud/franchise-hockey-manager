import type { Prisma } from '@prisma/client';
import {
  parseCompetitionRulesJson,
  type CompetitionStageType,
  type StageParticipantSource,
} from '@fhm/engine';
import { prisma } from '../db/client.js';
import { mapCompetitionEdition } from '../mappers.js';
import {
  isErrorResult,
  parseDirection,
  parseEnum,
  parseOptionalString,
  parsePagination,
} from './query.js';
import { loadEditionStructure, parseStageConfigText } from './competition-helpers.js';

const EDITION_STATUSES = [
  'PLANNED',
  'PREPARING',
  'READY',
  'ACTIVE',
  'COMPLETED',
  'ARCHIVED',
  'CANCELLED',
] as const;

const editionInclude = {
  competition: {
    select: {
      id: true,
      name: true,
      shortName: true,
      type: true,
      simulationLevel: true,
    },
  },
  worldSeason: { select: { id: true, label: true, startYear: true, endYear: true } },
  _count: { select: { participants: true, stages: true, matches: true } },
} as const;

function mapRules(text: string, hash: string) {
  try {
    return { rules: parseCompetitionRulesJson(text), rulesHash: hash };
  } catch {
    return { rules: null, rulesHash: hash, rulesError: 'Invalid stored rules snapshot' };
  }
}

export async function listCompetitionEditions(query: Record<string, unknown> = {}) {
  const pagination = parsePagination(query);
  if (isErrorResult(pagination)) return { error: pagination.error };

  const competitionId = parseOptionalString(query.competitionId);
  const worldSeasonId = parseOptionalString(query.worldSeasonId);
  const status = parseEnum(query.status, EDITION_STATUSES, 'status');
  if (isErrorResult(status)) return { error: status.error };

  const sortRaw = parseOptionalString(query.sort) ?? 'displayName';
  const allowedSorts = ['displayName', 'status', 'createdAt', 'updatedAt'] as const;
  if (!(allowedSorts as readonly string[]).includes(sortRaw)) {
    return { error: `sort must be one of: ${allowedSorts.join(', ')}` };
  }
  const direction = parseDirection(query.direction);

  const where: Prisma.CompetitionEditionWhereInput = {};
  if (competitionId) where.competitionId = competitionId;
  if (worldSeasonId) where.worldSeasonId = worldSeasonId;
  if (status) where.status = status;

  const [total, rows] = await Promise.all([
    prisma.competitionEdition.count({ where }),
    prisma.competitionEdition.findMany({
      where,
      orderBy: { [sortRaw]: direction },
      skip: pagination.skip,
      take: pagination.pageSize,
      include: editionInclude,
    }),
  ]);

  return {
    items: rows.map((row) => ({
      ...mapCompetitionEdition({
        ...row,
        competition: row.competition,
        worldSeason: row.worldSeason,
      }),
      editionNumber: row.editionNumber,
      rulesHash: row.rulesHash,
      preparedAt: row.preparedAt?.toISOString() ?? null,
      activatedAt: row.activatedAt?.toISOString() ?? null,
      completedAt: row.completedAt?.toISOString() ?? null,
      archivedAt: row.archivedAt?.toISOString() ?? null,
      participantCount: row._count.participants,
      stageCount: row._count.stages,
      matchCount: row._count.matches,
    })),
    page: pagination.page,
    pageSize: pagination.pageSize,
    total,
  };
}

export async function getCompetitionEditionById(id: string) {
  return getCompetitionEditionDetail(id);
}

export async function getCompetitionEditionDetail(id: string) {
  const row = await prisma.competitionEdition.findUnique({
    where: { id },
    include: {
      ...editionInclude,
      participants: {
        orderBy: { participantOrder: 'asc' },
        include: {
          team: {
            select: {
              id: true,
              name: true,
              shortName: true,
              teamType: true,
              country: { select: { id: true, name: true, code: true } },
              league: { select: { id: true, name: true, shortName: true } },
            },
          },
        },
      },
      stages: {
        orderBy: { stageOrder: 'asc' },
        include: { _count: { select: { participants: true } } },
      },
    },
  });
  if (!row) return null;

  let readiness: Awaited<ReturnType<typeof loadEditionStructure>>['readiness'];
  try {
    readiness = (await loadEditionStructure(prisma, id)).readiness;
  } catch {
    readiness = {
      status: 'NOT_READY',
      checks: [
        {
          code: 'STRUCTURE_UNREADABLE',
          severity: 'BLOCKER',
          message: 'Edition structure could not be evaluated (invalid rules or stages)',
        },
      ],
      confirmedParticipantCount: row.participants.filter((p) => p.status === 'CONFIRMED').length,
      withdrawnParticipantCount: row.participants.filter((p) => p.status === 'WITHDRAWN').length,
      stageCount: row.stages.length,
      blockers: ['Edition structure could not be evaluated (invalid rules or stages)'],
      warnings: [],
      allowedNextStatuses: [],
    };
  }
  const { rules, rulesHash, rulesError } = mapRules(row.rulesSnapshotText, row.rulesHash);

  return {
    ...mapCompetitionEdition({
      ...row,
      competition: row.competition,
      worldSeason: row.worldSeason,
    }),
    editionNumber: row.editionNumber,
    rules,
    rulesHash,
    rulesError: rulesError ?? null,
    preparedAt: row.preparedAt?.toISOString() ?? null,
    activatedAt: row.activatedAt?.toISOString() ?? null,
    completedAt: row.completedAt?.toISOString() ?? null,
    archivedAt: row.archivedAt?.toISOString() ?? null,
    participantCount: row._count.participants,
    stageCount: row._count.stages,
    matchCount: row._count.matches,
    readiness,
    participants: row.participants.map((p) => ({
      id: p.id,
      teamId: p.teamId,
      seed: p.seed,
      groupKey: p.groupKey,
      participantOrder: p.participantOrder,
      status: p.status,
      source: p.source,
      teamNameSnapshot: p.teamNameSnapshot,
      teamShortNameSnapshot: p.teamShortNameSnapshot,
      currentTeam: {
        id: p.team.id,
        name: p.team.name,
        shortName: p.team.shortName,
        teamType: p.team.teamType,
        country: p.team.country,
        league: p.team.league,
      },
      createdAt: p.createdAt.toISOString(),
      updatedAt: p.updatedAt.toISOString(),
    })),
    stages: row.stages.map((s) => {
      let config: unknown = null;
      let configError: string | null = null;
      try {
        config = parseStageConfigText(s.stageType as CompetitionStageType, s.configText).config;
      } catch (err) {
        configError = err instanceof Error ? err.message : 'Invalid config';
      }
      return {
        id: s.id,
        name: s.name,
        stageType: s.stageType,
        stageOrder: s.stageOrder,
        status: s.status,
        participantSource: s.participantSource,
        sourceStageId: s.sourceStageId,
        expectedQualifierCount: s.expectedQualifierCount,
        config,
        configHash: s.configHash,
        configError,
        participantCount: s._count.participants,
        createdAt: s.createdAt.toISOString(),
        updatedAt: s.updatedAt.toISOString(),
      };
    }),
  };
}

export async function listEditionParticipants(editionId: string, query: Record<string, unknown> = {}) {
  const edition = await prisma.competitionEdition.findUnique({ where: { id: editionId } });
  if (!edition) return null;

  const pagination = parsePagination(query);
  if (isErrorResult(pagination)) return { error: pagination.error };

  const status = parseOptionalString(query.status);
  const search = parseOptionalString(query.search);
  const where: Prisma.CompetitionParticipantWhereInput = { competitionEditionId: editionId };
  if (status) where.status = status as Prisma.EnumCompetitionParticipantStatusFilter;
  if (search) {
    where.OR = [
      { teamNameSnapshot: { contains: search } },
      { team: { name: { contains: search } } },
    ];
  }

  const [total, rows] = await Promise.all([
    prisma.competitionParticipant.count({ where }),
    prisma.competitionParticipant.findMany({
      where,
      orderBy: { participantOrder: 'asc' },
      skip: pagination.skip,
      take: pagination.pageSize,
      include: {
        team: {
          select: {
            id: true,
            name: true,
            shortName: true,
            teamType: true,
          },
        },
      },
    }),
  ]);

  return {
    items: rows.map((p) => ({
      id: p.id,
      teamId: p.teamId,
      seed: p.seed,
      groupKey: p.groupKey,
      participantOrder: p.participantOrder,
      status: p.status,
      source: p.source,
      teamNameSnapshot: p.teamNameSnapshot,
      teamShortNameSnapshot: p.teamShortNameSnapshot,
      currentTeam: p.team,
      createdAt: p.createdAt.toISOString(),
      updatedAt: p.updatedAt.toISOString(),
    })),
    page: pagination.page,
    pageSize: pagination.pageSize,
    total,
  };
}

export async function listEditionStages(editionId: string) {
  const edition = await prisma.competitionEdition.findUnique({ where: { id: editionId } });
  if (!edition) return null;
  const detail = await getCompetitionEditionDetail(editionId);
  return detail ? { items: detail.stages } : null;
}

export async function getEditionReadiness(editionId: string) {
  const edition = await prisma.competitionEdition.findUnique({
    where: { id: editionId },
    include: {
      competition: { select: { id: true, name: true, type: true } },
      worldSeason: { select: { id: true, label: true } },
    },
  });
  if (!edition) return null;
  const { readiness } = await loadEditionStructure(prisma, editionId);
  return {
    competition: edition.competition,
    edition: {
      id: edition.id,
      displayName: edition.displayName,
      status: edition.status,
      worldSeason: edition.worldSeason,
      rulesHash: edition.rulesHash,
      updatedAt: edition.updatedAt.toISOString(),
    },
    readiness,
    notice:
      'READY/ACTIVE means structural readiness only. Schedules, standings, and match generation arrive in later milestones.',
  };
}

export async function getCompetitionStageById(stageId: string) {
  const stage = await prisma.competitionStage.findUnique({
    where: { id: stageId },
    include: {
      edition: {
        select: {
          id: true,
          displayName: true,
          status: true,
          competitionId: true,
        },
      },
      participants: {
        orderBy: { stageOrder: 'asc' },
        include: {
          participant: {
            select: {
              id: true,
              teamId: true,
              teamNameSnapshot: true,
              teamShortNameSnapshot: true,
              status: true,
              seed: true,
              groupKey: true,
            },
          },
        },
      },
    },
  });
  if (!stage) return null;

  let config: unknown = null;
  try {
    config = parseStageConfigText(stage.stageType as CompetitionStageType, stage.configText).config;
  } catch {
    config = null;
  }

  return {
    id: stage.id,
    competitionEditionId: stage.competitionEditionId,
    name: stage.name,
    stageType: stage.stageType,
    stageOrder: stage.stageOrder,
    status: stage.status,
    participantSource: stage.participantSource as StageParticipantSource,
    sourceStageId: stage.sourceStageId,
    expectedQualifierCount: stage.expectedQualifierCount,
    config,
    configHash: stage.configHash,
    edition: stage.edition,
    participants: stage.participants.map((sp) => ({
      id: sp.id,
      stageOrder: sp.stageOrder,
      seed: sp.seed,
      groupKey: sp.groupKey,
      status: sp.status,
      participant: sp.participant,
    })),
    createdAt: stage.createdAt.toISOString(),
    updatedAt: stage.updatedAt.toISOString(),
  };
}
