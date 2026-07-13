import type { SimulationInput } from '@fhm/engine';
import { prisma } from '../db/client.js';
import { isErrorResult, parseEnum, parseOptionalString, parsePagination, type ParsedPagination } from './query.js';
import { MatchHttpError } from './matches.js';

interface PlayerDirectoryEntry {
  playerId: string;
  firstName: string;
  lastName: string;
  teamId: string;
  primaryPosition: string;
}

function buildPlayerDirectory(simulationInputText: string | null): Map<string, PlayerDirectoryEntry> {
  const directory = new Map<string, PlayerDirectoryEntry>();
  if (!simulationInputText) return directory;
  try {
    const input = JSON.parse(simulationInputText) as SimulationInput;
    for (const team of [input.homeTeam, input.awayTeam]) {
      for (const player of team.players) {
        directory.set(player.playerId, {
          playerId: player.playerId,
          firstName: player.firstName,
          lastName: player.lastName,
          teamId: team.teamId,
          primaryPosition: player.primaryPosition,
        });
      }
    }
  } catch {
    // ignore malformed snapshot
  }
  return directory;
}

function buildTeamDirectory(simulationInputText: string | null): Map<string, { teamId: string; teamName: string; side: string }> {
  const directory = new Map<string, { teamId: string; teamName: string; side: string }>();
  if (!simulationInputText) return directory;
  try {
    const input = JSON.parse(simulationInputText) as SimulationInput;
    directory.set(input.homeTeam.teamId, {
      teamId: input.homeTeam.teamId,
      teamName: input.homeTeam.teamName,
      side: 'HOME',
    });
    directory.set(input.awayTeam.teamId, {
      teamId: input.awayTeam.teamId,
      teamName: input.awayTeam.teamName,
      side: 'AWAY',
    });
  } catch {
    // ignore malformed snapshot
  }
  return directory;
}

async function getCurrentMatchResultRow(matchId: string) {
  const match = await prisma.match.findUnique({
    where: { id: matchId },
    include: {
      homeTeam: true,
      awayTeam: true,
      results: {
        where: { status: 'COMPLETED' },
        orderBy: { attemptNumber: 'desc' },
        take: 1,
      },
    },
  });
  if (!match) return null;

  const result =
    (match.currentResultId
      ? await prisma.matchResult.findUnique({ where: { id: match.currentResultId } })
      : null) ?? match.results[0] ?? null;

  return { match, result };
}

export async function getMatchResult(matchId: string) {
  const loaded = await getCurrentMatchResultRow(matchId);
  if (!loaded?.match) return null;
  if (!loaded.result) {
    throw new MatchHttpError(404, 'MatchResultNotFound', 'Match has no completed result yet');
  }

  const { match, result } = loaded;
  const playerDirectory = buildPlayerDirectory(result.simulationInputText);
  const teamDirectory = buildTeamDirectory(result.simulationInputText);
  const homeSnapshot = teamDirectory.get(match.homeTeamId);
  const awaySnapshot = teamDirectory.get(match.awayTeamId);

  const [playerStats, teamStats] = await Promise.all([
    prisma.playerGameStat.findMany({ where: { matchResultId: result.id }, orderBy: { points: 'desc' } }),
    prisma.teamGameStat.findMany({ where: { matchResultId: result.id }, orderBy: { side: 'asc' } }),
  ]);

  return {
    matchId: match.id,
    resultId: result.id,
    attemptNumber: result.attemptNumber,
    status: result.status,
    decisionType: result.decisionType,
    homeTeam: {
      id: match.homeTeamId,
      name: homeSnapshot?.teamName ?? match.homeTeam.name,
      currentName: match.homeTeam.name,
      side: 'HOME' as const,
    },
    awayTeam: {
      id: match.awayTeamId,
      name: awaySnapshot?.teamName ?? match.awayTeam.name,
      currentName: match.awayTeam.name,
      side: 'AWAY' as const,
    },
    score: {
      home: result.homeScore,
      away: result.awayScore,
      homeRegulation: result.homeRegulationScore,
      awayRegulation: result.awayRegulationScore,
      homeOvertime: result.homeOvertimeScore,
      awayOvertime: result.awayOvertimeScore,
      homeShootout: result.homeShootoutScore,
      awayShootout: result.awayShootoutScore,
    },
    winnerTeamId: result.winnerTeamId,
    engineVersion: result.engineVersion,
    simulationMode: result.simulationMode,
    randomSeed: result.randomSeed,
    inputFingerprint: result.inputFingerprint,
    balance: {
      presetId: result.balancePresetId,
      versionId: result.balancePresetVersionId,
      versionNumber: result.balanceVersionNumber,
      configHash: result.balanceConfigHash,
    },
    traceHash: result.traceHash,
    reconciliationStatus: result.reconciliationStatus,
    reconciliation: result.reconciliationJson ? JSON.parse(result.reconciliationJson) : null,
    diagnostics: result.diagnosticsText ? JSON.parse(result.diagnosticsText) : null,
    startedAt: result.startedAt.toISOString(),
    completedAt: result.completedAt?.toISOString() ?? null,
    playerStats: playerStats.map((row) => {
      const player = playerDirectory.get(row.playerId);
      return {
        playerId: row.playerId,
        teamId: row.teamId,
        teamName: teamDirectory.get(row.teamId)?.teamName ?? null,
        firstName: player?.firstName ?? null,
        lastName: player?.lastName ?? null,
        position: row.position,
        goals: row.goals,
        assists: row.assists,
        points: row.points,
        shotsOnGoal: row.shotsOnGoal,
        penaltyMinutes: row.penaltyMinutes,
        powerPlayGoals: row.powerPlayGoals,
        shortHandedGoals: row.shortHandedGoals,
        shootoutAttempts: row.shootoutAttempts,
        shootoutGoals: row.shootoutGoals,
        stats: JSON.parse(row.statsJson),
      };
    }),
    teamStats: teamStats.map((row) => ({
      teamId: row.teamId,
      teamName: teamDirectory.get(row.teamId)?.teamName ?? null,
      side: row.side,
      goals: row.goals,
      shotsOnGoal: row.shotsOnGoal,
      penalties: row.penalties,
      penaltyMinutes: row.penaltyMinutes,
      powerPlayGoals: row.powerPlayGoals,
      shortHandedGoals: row.shortHandedGoals,
      shootoutAttempts: row.shootoutAttempts,
      shootoutGoals: row.shootoutGoals,
      stats: JSON.parse(row.statsJson),
    })),
  };
}

export interface MatchEventFilters {
  period?: number;
  eventType?: string;
  visibility?: string;
}

export function parseMatchEventFilters(query: Record<string, unknown>): MatchEventFilters | { error: string } {
  const periodRaw = query.period;
  let period: number | undefined;
  if (periodRaw !== undefined && periodRaw !== null && periodRaw !== '') {
    period = Number(periodRaw);
    if (!Number.isInteger(period) || period < 1) {
      return { error: 'period must be a positive integer' };
    }
  }
  const visibility = parseEnum(query.visibility, ['PUBLIC', 'TECHNICAL'] as const, 'visibility');
  if (isErrorResult(visibility)) return visibility;
  return {
    period,
    eventType: parseOptionalString(query.eventType),
    visibility,
  };
}

export async function getMatchEvents(
  matchId: string,
  pagination: ParsedPagination,
  filters: MatchEventFilters,
) {
  const loaded = await getCurrentMatchResultRow(matchId);
  if (!loaded?.match) return null;
  if (!loaded.result) {
    throw new MatchHttpError(404, 'MatchResultNotFound', 'Match has no completed result yet');
  }

  const where = {
    matchResultId: loaded.result.id,
    ...(filters.period !== undefined ? { period: filters.period } : {}),
    ...(filters.eventType ? { eventType: filters.eventType } : {}),
    ...(filters.visibility ? { visibility: filters.visibility } : {}),
  };

  const [total, rows] = await Promise.all([
    prisma.matchEvent.count({ where }),
    prisma.matchEvent.findMany({
      where,
      orderBy: { eventIndex: 'asc' },
      skip: pagination.skip,
      take: pagination.pageSize,
    }),
  ]);

  const playerDirectory = buildPlayerDirectory(loaded.result.simulationInputText);

  return {
    matchId,
    resultId: loaded.result.id,
    items: rows.map((row) => {
      const event = JSON.parse(row.eventJson);
      const primaryPlayer = row.primaryPlayerId ? playerDirectory.get(row.primaryPlayerId) : null;
      return {
        id: row.id,
        eventIndex: row.eventIndex,
        eventType: row.eventType,
        period: row.period,
        elapsedSeconds: row.elapsedSeconds,
        remainingSeconds: row.remainingSeconds,
        teamId: row.teamId,
        primaryPlayerId: row.primaryPlayerId,
        primaryPlayerName: primaryPlayer ? `${primaryPlayer.firstName} ${primaryPlayer.lastName}` : null,
        visibility: row.visibility,
        event,
      };
    }),
    total,
  };
}

export async function getPlayerStats(matchId: string) {
  const result = await getMatchResult(matchId);
  return result?.playerStats ?? null;
}

export async function getTeamStats(matchId: string) {
  const result = await getMatchResult(matchId);
  return result?.teamStats ?? null;
}

export { parsePagination };
