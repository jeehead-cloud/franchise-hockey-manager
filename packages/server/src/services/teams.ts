import type { Prisma } from '@prisma/client';
import { prisma } from '../db/client.js';
import { mapPlayer, mapTeam } from '../mappers.js';
import { compactPlayerModelFields } from './player-model.js';
import { buildTeamReadiness } from './team-readiness.js';
import {
  buildValidationForTeam,
  lineupPresenceFromValidation,
  serializeAssignments,
  type LineupPlayerRow,
} from './lineup-helpers.js';
import {
  deriveAgeYears,
  isErrorResult,
  parseDirection,
  parseEnum,
  parseOptionalString,
  parsePagination,
} from './query.js';

const teamInclude = {
  country: { select: { id: true, name: true, code: true } },
  league: { select: { id: true, name: true, shortName: true } },
  coach: {
    select: {
      id: true,
      firstName: true,
      lastName: true,
      coachingStyle: true,
      tacticalStyle: true,
      overallCoaching: true,
      playerDevelopment: true,
      offense: true,
      defense: true,
    },
  },
  _count: { select: { players: true } },
} as const;

const readinessPlayerInclude = {
  primaryPosition: true,
  rosterStatus: true,
  preferredCoachingStyle: true,
  preferredTactics: true,
  personality: true,
  heroRating: true,
  stability: true,
  developmentRate: true,
  developmentRisk: true,
  potentialFloor: true,
  potentialCeiling: true,
  publicPotentialEstimate: true,
  skaterAttributes: true,
  goalieAttributes: true,
} as const;

const TEAM_SORTS = ['name', 'city', 'teamType', 'createdAt'] as const;

export async function listTeams(query: Record<string, unknown> = {}) {
  const pagination = parsePagination(query);
  if (isErrorResult(pagination)) return { error: pagination.error };

  const search = parseOptionalString(query.search);
  const countryId = parseOptionalString(query.countryId);
  const leagueId = parseOptionalString(query.leagueId);
  const teamType = parseEnum(query.teamType, ['CLUB', 'NATIONAL'] as const, 'teamType');
  if (isErrorResult(teamType)) return { error: teamType.error };
  const hasCoachRaw = parseOptionalString(query.hasCoach);
  if (hasCoachRaw && hasCoachRaw !== 'true' && hasCoachRaw !== 'false') {
    return { error: 'hasCoach must be true or false' };
  }
  const readinessStatus = parseEnum(query.readinessStatus, ['READY', 'WARNING', 'NOT_READY'] as const, 'readinessStatus');
  if (isErrorResult(readinessStatus)) return { error: readinessStatus.error };

  const sortRaw = parseOptionalString(query.sort) ?? 'name';
  if (!(TEAM_SORTS as readonly string[]).includes(sortRaw)) {
    return { error: `sort must be one of: ${TEAM_SORTS.join(', ')}` };
  }
  const direction = parseDirection(query.direction);

  const where: Prisma.TeamWhereInput = {};
  if (countryId) where.countryId = countryId;
  if (leagueId) where.leagueId = leagueId;
  if (teamType) where.teamType = teamType;
  if (hasCoachRaw === 'true') where.coach = { isNot: null };
  if (hasCoachRaw === 'false') where.coach = { is: null };
  if (search) {
    where.OR = [
      { name: { contains: search } },
      { shortName: { contains: search } },
      { city: { contains: search } },
    ];
  }

  const [total, rows] = await Promise.all([
    prisma.team.count({ where }),
    prisma.team.findMany({
      where,
      orderBy: { [sortRaw]: direction },
      skip: pagination.skip,
      take: pagination.pageSize,
      include: {
        ...teamInclude,
        players: {
          select: {
            ...readinessPlayerInclude,
            id: true,
            secondaryPositions: { select: { position: true } },
          },
        },
        lineup: { include: { assignments: { select: { slot: true, playerId: true } } } },
      },
    }),
  ]);

  const items = rows.map((row) => {
    const assignmentInputs = row.lineup ? serializeAssignments(row.lineup.assignments) : [];
    const validation = buildValidationForTeam(row.players as LineupPlayerRow[], assignmentInputs);
    const presence = lineupPresenceFromValidation(Boolean(row.lineup), row.lineup ? validation : null);
    const readiness = buildTeamReadiness({
      hasHeadCoach: Boolean(row.coach),
      tacticalStyle: row.tacticalStyle,
      players: row.players,
      lineupPresence: presence,
    });
    return {
      ...mapTeam(row),
      rosterCount: row._count.players,
      readinessStatus: readiness.status,
      lineupStatus: presence,
      coach: row.coach
        ? {
            ...row.coach,
          }
        : null,
    };
  });
  return {
    items: readinessStatus ? items.filter((item) => item.readinessStatus === readinessStatus) : items,
    page: pagination.page,
    pageSize: pagination.pageSize,
    total,
  };
}

export async function getTeamById(id: string) {
  const row = await prisma.team.findUnique({
    where: { id },
    include: {
      ...teamInclude,
      players: {
        orderBy: [{ primaryPosition: 'asc' }, { lastName: 'asc' }, { firstName: 'asc' }],
        include: {
          nationality: { select: { id: true, name: true, code: true } },
          skaterAttributes: true,
          goalieAttributes: true,
          secondaryPositions: { select: { position: true } },
        },
      },
      lineup: { include: { assignments: { select: { slot: true, playerId: true } } } },
    },
  });
  if (!row) return null;

  const season = await prisma.worldSeason.findFirst({
    where: { status: 'ACTIVE' },
    orderBy: { startYear: 'desc' },
  });
  const seasonStartYear = season?.startYear ?? null;

  const byPosition: Record<string, number> = {};
  const byRosterStatus: Record<string, number> = {};
  const ages: number[] = [];

  for (const p of row.players) {
    byPosition[p.primaryPosition] = (byPosition[p.primaryPosition] ?? 0) + 1;
    byRosterStatus[p.rosterStatus] = (byRosterStatus[p.rosterStatus] ?? 0) + 1;
    const age = deriveAgeYears(p.dateOfBirth, seasonStartYear);
    if (age !== null) ages.push(age);
  }

  const averageAge =
    ages.length > 0 ? Math.round((ages.reduce((a, b) => a + b, 0) / ages.length) * 10) / 10 : null;

  const assignmentInputs = row.lineup ? serializeAssignments(row.lineup.assignments) : [];
  const validation = buildValidationForTeam(row.players as LineupPlayerRow[], assignmentInputs);
  const presence = lineupPresenceFromValidation(Boolean(row.lineup), row.lineup ? validation : null);

  return {
    ...mapTeam(row),
    rosterCount: row.players.length,
    coach: row.coach ? { ...row.coach } : null,
    readiness: buildTeamReadiness({
      hasHeadCoach: Boolean(row.coach),
      tacticalStyle: row.tacticalStyle,
      players: row.players,
      lineupPresence: presence,
    }),
    lineupSummary: {
      presence,
      validationStatus: row.lineup ? validation.status : null,
      filledSlots: validation.filledSlots,
      requiredSlots: validation.requiredSlots,
      updatedAt: row.lineup?.updatedAt.toISOString() ?? null,
    },
    rosterSummary: {
      total: row.players.length,
      byPosition,
      byRosterStatus,
      averageAge,
      ageReference: seasonStartYear
        ? {
            rule: 'july1_of_world_season_start_year',
            referenceDate: `${seasonStartYear}-07-01`,
            seasonStartYear,
          }
        : null,
    },
    roster: row.players.map((p) => {
      const skater =
        p.skaterAttributes &&
        (({ playerId: _p, createdAt: _c, updatedAt: _u, ...attrs }) => attrs)(p.skaterAttributes);
      const goalie =
        p.goalieAttributes &&
        (({ playerId: _p, createdAt: _c, updatedAt: _u, ...attrs }) => attrs)(p.goalieAttributes);
      return {
        ...mapPlayer({
          ...p,
          currentTeamId: row.id,
          currentTeam: { id: row.id, name: row.name },
        }),
        age: deriveAgeYears(p.dateOfBirth, seasonStartYear),
        ...compactPlayerModelFields({
          ...p,
          skaterAttributes: skater ?? undefined,
          goalieAttributes: goalie ?? undefined,
        }),
      };
    }),
  };
}
