import type { Prisma } from '@prisma/client';
import { prisma } from '../db/client.js';
import { mapPlayer } from '../mappers.js';
import {
  compactPlayerModelFields,
  publicPlayerModelDetail,
} from './player-model.js';
import {
  deriveAgeYears,
  isErrorResult,
  parseDirection,
  parseEnum,
  parseOptionalString,
  parsePagination,
} from './query.js';

const playerInclude = {
  nationality: { select: { id: true, name: true, code: true } },
  currentTeam: {
    select: {
      id: true,
      name: true,
      shortName: true,
      country: { select: { id: true, name: true, code: true } },
      league: { select: { id: true, name: true, shortName: true } },
    },
  },
  skaterAttributes: true,
  goalieAttributes: true,
} as const;

const PLAYER_SORTS = ['lastName', 'firstName', 'dateOfBirth', 'primaryPosition', 'createdAt'] as const;
const POSITIONS = ['LW', 'RW', 'C', 'LD', 'RD', 'G'] as const;
const SOURCES = ['REAL_INITIAL_DATA', 'GENERATED_YOUTH', 'MANUAL', 'IMPORTED'] as const;
const ROSTER = ['ACTIVE', 'RESERVE', 'PROSPECT', 'UNAVAILABLE'] as const;

async function activeSeasonStartYear() {
  const season = await prisma.worldSeason.findFirst({
    where: { status: 'ACTIVE' },
    orderBy: { startYear: 'desc' },
  });
  return season?.startYear ?? null;
}

function stripAttrIds<T extends { playerId?: string; createdAt?: Date; updatedAt?: Date }>(
  row: T | null | undefined,
) {
  if (!row) return null;
  const { playerId: _p, createdAt: _c, updatedAt: _u, ...attrs } = row;
  return attrs;
}

export async function listPlayers(query: Record<string, unknown> = {}) {
  const pagination = parsePagination(query);
  if (isErrorResult(pagination)) return { error: pagination.error };

  const search = parseOptionalString(query.search);
  const countryId = parseOptionalString(query.countryId);
  const teamId = parseOptionalString(query.teamId);
  const position = parseEnum(query.position, POSITIONS, 'position');
  if (isErrorResult(position)) return { error: position.error };
  const sourceType = parseEnum(query.sourceType, SOURCES, 'sourceType');
  if (isErrorResult(sourceType)) return { error: sourceType.error };
  const rosterStatus = parseEnum(query.rosterStatus, ROSTER, 'rosterStatus');
  if (isErrorResult(rosterStatus)) return { error: rosterStatus.error };

  const sortRaw = parseOptionalString(query.sort) ?? 'lastName';
  if (!(PLAYER_SORTS as readonly string[]).includes(sortRaw)) {
    return { error: `sort must be one of: ${PLAYER_SORTS.join(', ')}` };
  }
  const direction = parseDirection(query.direction);

  const where: Prisma.PlayerWhereInput = {};
  if (countryId) where.nationalityCountryId = countryId;
  if (teamId === 'unassigned') where.currentTeamId = null;
  else if (teamId) where.currentTeamId = teamId;
  if (position) where.primaryPosition = position;
  if (sourceType) where.sourceType = sourceType;
  if (rosterStatus) where.rosterStatus = rosterStatus;
  if (search) {
    const parts = search.trim().split(/\s+/).filter(Boolean);
    if (parts.length >= 2) {
      where.AND = [
        { firstName: { contains: parts[0] } },
        { lastName: { contains: parts.slice(1).join(' ') } },
      ];
    } else {
      where.OR = [
        { firstName: { contains: search } },
        { lastName: { contains: search } },
      ];
    }
  }

  const orderBy: Prisma.PlayerOrderByWithRelationInput[] =
    sortRaw === 'lastName'
      ? [{ lastName: direction }, { firstName: direction }]
      : [{ [sortRaw]: direction }];

  const [total, rows, seasonStartYear] = await Promise.all([
    prisma.player.count({ where }),
    prisma.player.findMany({
      where,
      orderBy,
      skip: pagination.skip,
      take: pagination.pageSize,
      include: playerInclude,
    }),
    activeSeasonStartYear(),
  ]);

  return {
    items: rows.map((row) => ({
      ...mapPlayer(row),
      age: deriveAgeYears(row.dateOfBirth, seasonStartYear),
      currentTeam: row.currentTeam
        ? {
            id: row.currentTeam.id,
            name: row.currentTeam.name,
            shortName: row.currentTeam.shortName,
          }
        : null,
      ...compactPlayerModelFields({
        ...row,
        skaterAttributes: stripAttrIds(row.skaterAttributes) ?? undefined,
        goalieAttributes: stripAttrIds(row.goalieAttributes) ?? undefined,
      }),
    })),
    page: pagination.page,
    pageSize: pagination.pageSize,
    total,
    ageReference: seasonStartYear
      ? {
          rule: 'july1_of_world_season_start_year',
          referenceDate: `${seasonStartYear}-07-01`,
          seasonStartYear,
        }
      : null,
  };
}

export async function getPlayerById(id: string) {
  const row = await prisma.player.findUnique({
    where: { id },
    include: playerInclude,
  });
  if (!row) return null;

  const seasonStartYear = await activeSeasonStartYear();
  const modelRow = {
    ...row,
    skaterAttributes: stripAttrIds(row.skaterAttributes) ?? undefined,
    goalieAttributes: stripAttrIds(row.goalieAttributes) ?? undefined,
  };

  return {
    ...mapPlayer(row),
    age: deriveAgeYears(row.dateOfBirth, seasonStartYear),
    ageReference: seasonStartYear
      ? {
          rule: 'july1_of_world_season_start_year',
          referenceDate: `${seasonStartYear}-07-01`,
          seasonStartYear,
        }
      : null,
    currentTeam: row.currentTeam
      ? {
          id: row.currentTeam.id,
          name: row.currentTeam.name,
          shortName: row.currentTeam.shortName,
          country: row.currentTeam.country,
          league: row.currentTeam.league,
        }
      : null,
    playerModel: publicPlayerModelDetail(modelRow),
    // Never expose hidden potential fields on the public detail envelope.
  };
}
