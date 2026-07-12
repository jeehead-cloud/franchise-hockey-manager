import type { Prisma } from '@prisma/client';
import { prisma } from '../db/client.js';
import { mapCoach } from '../mappers.js';
import {
  isErrorResult,
  parseDirection,
  parseEnum,
  parseOptionalString,
  parsePagination,
} from './query.js';

const coachInclude = {
  nationality: { select: { id: true, name: true, code: true } },
  currentTeam: { select: { id: true, name: true, shortName: true } },
} as const;

const COACH_SORTS = ['lastName', 'firstName', 'createdAt', 'overallCoaching'] as const;
const STYLES = [
  'AUTHORITARIAN',
  'AUTHORITATIVE',
  'DEMOCRATIC',
  'DEVELOPMENTAL',
  'HANDS_OFF',
] as const;
const TACTICS = ['COMBINATIONAL', 'PHYSICAL', 'SPEED', 'SYSTEM', 'FORECHECKING'] as const;

function coachCompleteness(row: {
  overallCoaching: number | null;
  playerDevelopment: number | null;
  offense: number | null;
  defense: number | null;
}) {
  const complete =
    row.overallCoaching != null &&
    row.playerDevelopment != null &&
    row.offense != null &&
    row.defense != null;
  return complete ? ('COMPLETE' as const) : ('INCOMPLETE' as const);
}

function mapCoachDto(row: Prisma.CoachGetPayload<{ include: typeof coachInclude }>) {
  return {
    ...mapCoach(row),
    overallCoaching: row.overallCoaching,
    playerDevelopment: row.playerDevelopment,
    offense: row.offense,
    defense: row.defense,
    ratingsComplete: coachCompleteness(row),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function listCoaches(query: Record<string, unknown> = {}) {
  const pagination = parsePagination(query);
  if (isErrorResult(pagination)) return { error: pagination.error };

  const search = parseOptionalString(query.search);
  const nationalityCountryId = parseOptionalString(query.nationalityCountryId);
  const currentTeamId = parseOptionalString(query.currentTeamId);
  const coachingStyle = parseEnum(query.coachingStyle, STYLES, 'coachingStyle');
  if (isErrorResult(coachingStyle)) return { error: coachingStyle.error };
  const tacticalStyle = parseEnum(query.tacticalStyle, TACTICS, 'tacticalStyle');
  if (isErrorResult(tacticalStyle)) return { error: tacticalStyle.error };
  const assignment = parseOptionalString(query.assignment); // assigned | unassigned

  const sortRaw = parseOptionalString(query.sort) ?? 'lastName';
  if (!(COACH_SORTS as readonly string[]).includes(sortRaw)) {
    return { error: `sort must be one of: ${COACH_SORTS.join(', ')}` };
  }
  const direction = parseDirection(query.direction);

  const where: Prisma.CoachWhereInput = {};
  if (nationalityCountryId) where.nationalityCountryId = nationalityCountryId;
  if (currentTeamId === 'unassigned' || assignment === 'unassigned') where.currentTeamId = null;
  else if (currentTeamId) where.currentTeamId = currentTeamId;
  else if (assignment === 'assigned') where.currentTeamId = { not: null };
  if (coachingStyle) where.coachingStyle = coachingStyle;
  if (tacticalStyle) where.tacticalStyle = tacticalStyle;
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

  const orderBy: Prisma.CoachOrderByWithRelationInput[] =
    sortRaw === 'lastName'
      ? [{ lastName: direction }, { firstName: direction }]
      : [{ [sortRaw]: direction }];

  const [total, rows] = await Promise.all([
    prisma.coach.count({ where }),
    prisma.coach.findMany({
      where,
      orderBy,
      skip: pagination.skip,
      take: pagination.pageSize,
      include: coachInclude,
    }),
  ]);

  return {
    items: rows.map(mapCoachDto),
    page: pagination.page,
    pageSize: pagination.pageSize,
    total,
  };
}

export async function getCoachById(id: string) {
  const row = await prisma.coach.findUnique({
    where: { id },
    include: coachInclude,
  });
  return row ? mapCoachDto(row) : null;
}
