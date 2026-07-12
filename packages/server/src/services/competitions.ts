import type { Prisma } from '@prisma/client';
import { prisma } from '../db/client.js';
import { mapCompetition, mapCompetitionEdition } from '../mappers.js';
import {
  isErrorResult,
  parseDirection,
  parseEnum,
  parseOptionalString,
  parsePagination,
} from './query.js';

const COMPETITION_SORTS = ['name', 'type', 'createdAt'] as const;
const TYPES = ['LEAGUE', 'PLAYOFF', 'INTERNATIONAL_TOURNAMENT', 'OTHER'] as const;
const SIM_LEVELS = ['DETAILED', 'AGGREGATED'] as const;
const EDITION_STATUSES = ['PLANNED', 'PREPARING', 'ACTIVE', 'COMPLETED', 'ARCHIVED'] as const;

export async function listCompetitions(query: Record<string, unknown> = {}) {
  const pagination = parsePagination(query);
  if (isErrorResult(pagination)) return { error: pagination.error };

  const search = parseOptionalString(query.search);
  const type = parseEnum(query.type, TYPES, 'type');
  if (isErrorResult(type)) return { error: type.error };
  const simulationLevel = parseEnum(query.simulationLevel, SIM_LEVELS, 'simulationLevel');
  if (isErrorResult(simulationLevel)) return { error: simulationLevel.error };
  const editionStatus = parseEnum(query.editionStatus, EDITION_STATUSES, 'editionStatus');
  if (isErrorResult(editionStatus)) return { error: editionStatus.error };
  const worldSeasonId = parseOptionalString(query.worldSeasonId);

  const sortRaw = parseOptionalString(query.sort) ?? 'name';
  if (!(COMPETITION_SORTS as readonly string[]).includes(sortRaw)) {
    return { error: `sort must be one of: ${COMPETITION_SORTS.join(', ')}` };
  }
  const direction = parseDirection(query.direction);

  const where: Prisma.CompetitionWhereInput = {};
  if (type) where.type = type;
  if (simulationLevel) where.simulationLevel = simulationLevel;
  if (search) {
    where.OR = [{ name: { contains: search } }, { shortName: { contains: search } }];
  }
  if (editionStatus || worldSeasonId) {
    where.editions = {
      some: {
        ...(editionStatus ? { status: editionStatus } : {}),
        ...(worldSeasonId ? { worldSeasonId } : {}),
      },
    };
  }

  const [total, rows] = await Promise.all([
    prisma.competition.count({ where }),
    prisma.competition.findMany({
      where,
      orderBy: { [sortRaw]: direction },
      skip: pagination.skip,
      take: pagination.pageSize,
      include: {
        editions: {
          orderBy: { displayName: 'asc' },
          include: {
            worldSeason: { select: { id: true, label: true } },
          },
        },
      },
    }),
  ]);

  return {
    items: rows.map((row) => {
      const current = row.editions[0] ?? null;
      return {
        ...mapCompetition(row),
        editionCount: row.editions.length,
        currentEdition: current
          ? {
              id: current.id,
              displayName: current.displayName,
              status: current.status,
              worldSeason: current.worldSeason,
            }
          : null,
      };
    }),
    page: pagination.page,
    pageSize: pagination.pageSize,
    total,
  };
}

export async function getCompetitionById(id: string) {
  const row = await prisma.competition.findUnique({
    where: { id },
    include: {
      editions: {
        orderBy: { displayName: 'asc' },
        include: {
          worldSeason: { select: { id: true, label: true, startYear: true, endYear: true } },
        },
      },
    },
  });
  if (!row) return null;

  return {
    ...mapCompetition(row),
    editions: row.editions.map((e) =>
      mapCompetitionEdition({
        ...e,
        competition: { id: row.id, name: row.name, type: row.type },
      }),
    ),
  };
}
