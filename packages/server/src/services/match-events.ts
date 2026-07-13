import { prisma } from '../db/client.js';
import { isErrorResult, parseEnum, parseOptionalString, parsePagination, type ParsedPagination } from './query.js';
import { MatchHttpError } from './matches.js';
import {
  buildPlayerDirectory,
  buildTeamDirectory,
  loadMatchResultContext,
  playerDisplayName,
} from './match-result-context.js';

export const PUBLIC_EVENT_TYPES = [
  'MATCH_START',
  'PERIOD_START',
  'FACEOFF',
  'SHOT',
  'SHOT_BLOCKED',
  'SHOT_MISSED',
  'SAVE',
  'GOAL',
  'PENALTY',
  'PENALTY_EXPIRED',
  'OVERTIME_START',
  'OVERTIME_END',
  'SHOOTOUT_START',
  'SHOOTOUT_ATTEMPT',
  'SHOOTOUT_END',
  'PERIOD_END',
  'REGULATION_END',
  'MATCH_END',
] as const;

export const EVENT_CATEGORIES = [
  'all',
  'goals',
  'shots',
  'saves',
  'penalties',
  'faceoffs',
  'overtime',
  'shootout',
] as const;

export type EventCategory = (typeof EVENT_CATEGORIES)[number];

const CATEGORY_TYPES: Record<Exclude<EventCategory, 'all'>, readonly string[]> = {
  goals: ['GOAL'],
  shots: ['SHOT', 'SHOT_BLOCKED', 'SHOT_MISSED', 'SAVE', 'GOAL'],
  saves: ['SAVE'],
  penalties: ['PENALTY', 'PENALTY_EXPIRED'],
  faceoffs: ['FACEOFF'],
  overtime: ['OVERTIME_START', 'OVERTIME_END'],
  shootout: ['SHOOTOUT_START', 'SHOOTOUT_ATTEMPT', 'SHOOTOUT_END'],
};

export interface MatchEventViewFilters {
  period?: number;
  teamId?: string;
  category?: EventCategory;
  eventType?: string;
  visibility?: 'PUBLIC' | 'TECHNICAL' | 'ALL';
  playerId?: string;
}

export function parseMatchEventViewFilters(query: Record<string, unknown>): MatchEventViewFilters | { error: string } {
  const periodRaw = query.period;
  let period: number | undefined;
  if (periodRaw !== undefined && periodRaw !== null && periodRaw !== '') {
    period = Number(periodRaw);
    if (!Number.isInteger(period) || period < 1) {
      return { error: 'period must be a positive integer' };
    }
  }

  const categoryRaw = parseOptionalString(query.category);
  let category: EventCategory | undefined;
  if (categoryRaw) {
    if (!(EVENT_CATEGORIES as readonly string[]).includes(categoryRaw)) {
      return { error: 'Invalid event category' };
    }
    category = categoryRaw as EventCategory;
  }

  const visibilityRaw = parseOptionalString(query.visibility);
  let visibility: MatchEventViewFilters['visibility'];
  if (visibilityRaw) {
    const parsed = parseEnum(visibilityRaw, ['PUBLIC', 'TECHNICAL', 'ALL'] as const, 'visibility');
    if (isErrorResult(parsed)) return parsed;
    visibility = parsed;
  }

  return {
    period,
    teamId: parseOptionalString(query.teamId),
    category,
    eventType: parseOptionalString(query.eventType),
    visibility,
    playerId: parseOptionalString(query.playerId),
  };
}

function formatClock(remainingSeconds: number): string {
  const m = Math.floor(remainingSeconds / 60);
  const s = remainingSeconds % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

function formatPublicSummary(
  eventType: string,
  period: number,
  remainingSeconds: number,
  details: Record<string, unknown>,
  names: {
    primary?: string | null;
    shooter?: string | null;
    goalie?: string | null;
    blocker?: string | null;
    primaryAssist?: string | null;
    secondaryAssist?: string | null;
  },
): string {
  const prefix = eventType.startsWith('SHOOTOUT')
    ? `SO${typeof details.round === 'number' ? ` R${details.round}` : ''}`
    : `P${period} ${formatClock(remainingSeconds)}`;

  switch (eventType) {
    case 'GOAL': {
      const assists =
        names.primaryAssist && names.secondaryAssist
          ? ` (${names.primaryAssist}, ${names.secondaryAssist})`
          : names.primaryAssist
            ? ` (${names.primaryAssist})`
            : '';
      const strength =
        details.goalStrength === 'POWER_PLAY'
          ? ', power play'
          : details.goalStrength === 'SHORT_HANDED'
            ? ', short-handed'
            : '';
      return `${prefix} — Goal: ${names.primary ?? 'Unknown'}${assists}${strength}`;
    }
    case 'SAVE':
      return `${prefix} — ${names.shooter ?? 'Unknown'} ${String(details.shotType ?? 'shot').toLowerCase()} saved by ${names.goalie ?? 'Unknown'}`;
    case 'SHOT':
      return `${prefix} — ${names.shooter ?? names.primary ?? 'Unknown'} ${String(details.shotType ?? 'shot').toLowerCase()} shot`;
    case 'SHOT_BLOCKED':
      return `${prefix} — ${names.shooter ?? 'Unknown'} shot blocked by ${names.blocker ?? 'Unknown'}`;
    case 'SHOT_MISSED':
      return `${prefix} — ${names.shooter ?? 'Unknown'} shot missed`;
    case 'PENALTY': {
      const duration =
        typeof details.durationSeconds === 'number' ? formatClock(details.durationSeconds) : '2:00';
      const infraction = String(details.infraction ?? 'penalty').replace(/_/g, ' ').toLowerCase();
      return `${prefix} — ${infraction}: ${names.primary ?? 'Unknown'}, ${duration}`;
    }
    case 'PENALTY_EXPIRED':
      return `${prefix} — Penalty expired: ${names.primary ?? 'Unknown'}`;
    case 'SHOOTOUT_ATTEMPT':
      return `${prefix} — ${names.shooter ?? 'Unknown'} ${details.scored ? 'scores' : 'misses'}`;
    case 'OVERTIME_START':
      return `${prefix} — Overtime begins (3v3)`;
    case 'OVERTIME_END':
      return `${prefix} — Overtime ends`;
    case 'SHOOTOUT_START':
      return `${prefix} — Shootout begins`;
    case 'SHOOTOUT_END':
      return `${prefix} — Shootout ends`;
    case 'MATCH_END':
      return `${prefix} — Match ends`;
    case 'FACEOFF':
      return `${prefix} — Faceoff`;
    default:
      return `${prefix} — ${eventType.replace(/_/g, ' ').toLowerCase()}`;
  }
}

export async function getMatchEventsView(
  matchId: string,
  pagination: ParsedPagination,
  filters: MatchEventViewFilters,
  opts?: { resultId?: string | null; includeTechnicalPayload?: boolean },
) {
  const loaded = await loadMatchResultContext(matchId, opts?.resultId);
  if (!loaded) return null;
  if (!loaded.result) {
    throw new MatchHttpError(404, 'MatchResultNotFound', 'Match has no completed result yet');
  }

  const visibility = filters.visibility ?? 'PUBLIC';
  const eventTypes =
    filters.eventType
      ? [filters.eventType]
      : filters.category && filters.category !== 'all'
        ? [...CATEGORY_TYPES[filters.category]]
        : visibility === 'PUBLIC'
          ? [...PUBLIC_EVENT_TYPES]
          : undefined;

  const where = {
    matchResultId: loaded.result.id,
    ...(filters.period !== undefined ? { period: filters.period } : {}),
    ...(filters.teamId ? { teamId: filters.teamId } : {}),
    ...(filters.playerId ? { primaryPlayerId: filters.playerId } : {}),
    ...(visibility === 'PUBLIC' || visibility === 'TECHNICAL' ? { visibility } : {}),
    ...(eventTypes ? { eventType: { in: eventTypes } } : {}),
  };

  const [total, rows] = await Promise.all([
    prisma.matchEvent.count({ where }),
    prisma.matchEvent.findMany({
      where,
      orderBy: { eventIndex: 'asc' },
      skip: pagination.skip,
      take: Math.min(pagination.pageSize, 200),
    }),
  ]);

  const playerDirectory = buildPlayerDirectory(loaded.result.simulationInputText);
  const teamDirectory = buildTeamDirectory(loaded.result.simulationInputText);

  return {
    matchId,
    resultId: loaded.result.id,
    isCurrent: loaded.isCurrent,
    items: rows.map((row) => {
      const event = JSON.parse(row.eventJson) as {
        details?: Record<string, unknown>;
        playerIds?: string[];
        strengthState?: string;
        zone?: string;
        possession?: string;
        shiftNumber?: number;
      };
      const d = event.details ?? {};
      const scorerId = d.scorerId ? String(d.scorerId) : row.primaryPlayerId;
      const shooterId = d.shooterId ? String(d.shooterId) : null;
      const goalieId = d.goalieId ? String(d.goalieId) : null;
      const blockerId = d.blockerId ? String(d.blockerId) : null;
      const primaryAssistId = d.primaryAssistId ? String(d.primaryAssistId) : null;
      const secondaryAssistId = d.secondaryAssistId ? String(d.secondaryAssistId) : null;

      const names = {
        primary: playerDisplayName(
          row.primaryPlayerId ? playerDirectory.get(row.primaryPlayerId) : undefined,
          row.primaryPlayerId,
        ),
        shooter: shooterId ? playerDisplayName(playerDirectory.get(shooterId), shooterId) : null,
        goalie: goalieId ? playerDisplayName(playerDirectory.get(goalieId), goalieId) : null,
        blocker: blockerId ? playerDisplayName(playerDirectory.get(blockerId), blockerId) : null,
        primaryAssist: primaryAssistId
          ? playerDisplayName(playerDirectory.get(primaryAssistId), primaryAssistId)
          : null,
        secondaryAssist: secondaryAssistId
          ? playerDisplayName(playerDirectory.get(secondaryAssistId), secondaryAssistId)
          : null,
      };

      const publicDetails: Record<string, unknown> = {
        shotType: d.shotType,
        goalStrength: d.goalStrength,
        infraction: d.infraction,
        durationSeconds: d.durationSeconds,
        scored: d.scored,
        round: d.round,
        attemptNumber: d.attemptNumber,
        scoreAfter: d.scoreAfter,
        shootoutScore: d.shootoutScore,
        scorerId,
        shooterId,
        goalieId,
        blockerId,
        primaryAssistId,
        secondaryAssistId,
      };

      return {
        id: row.id,
        eventIndex: row.eventIndex,
        eventType: row.eventType,
        period: row.period,
        elapsedSeconds: row.elapsedSeconds,
        remainingSeconds: row.remainingSeconds,
        teamId: row.teamId,
        teamName: row.teamId ? teamDirectory.get(row.teamId)?.teamName ?? null : null,
        primaryPlayerId: row.primaryPlayerId,
        primaryPlayerName: names.primary,
        visibility: row.visibility,
        summary: formatPublicSummary(row.eventType, row.period, row.remainingSeconds, d, names),
        participants: names,
        details: publicDetails,
        ...(opts?.includeTechnicalPayload
          ? {
              technical: {
                strengthState: event.strengthState ?? null,
                zone: event.zone ?? null,
                possession: event.possession ?? null,
                shiftNumber: event.shiftNumber ?? null,
                rawDetails: sanitizeTechnicalDetails(d),
              },
            }
          : {}),
      };
    }),
    total,
  };
}

function sanitizeTechnicalDetails(details: Record<string, unknown>): Record<string, unknown> {
  const blocked = new Set([
    'potentialFloor',
    'potentialCeiling',
    'hiddenPotential',
    'developmentRisk',
    'truePotential',
  ]);
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(details)) {
    if (blocked.has(key)) continue;
    out[key] = value;
  }
  return out;
}

export { parsePagination };
