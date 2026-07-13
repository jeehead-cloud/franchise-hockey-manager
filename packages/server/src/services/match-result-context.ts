import type { SimulationInput } from '@fhm/engine';
import { prisma } from '../db/client.js';
import { MatchHttpError } from './matches.js';

export interface PlayerDirectoryEntry {
  playerId: string;
  firstName: string;
  lastName: string;
  teamId: string;
  primaryPosition: string;
  lineupSlot?: string;
}

export interface TeamDirectoryEntry {
  teamId: string;
  teamName: string;
  side: 'HOME' | 'AWAY';
}

export function parseSimulationInput(text: string | null): SimulationInput | null {
  if (!text) return null;
  try {
    return JSON.parse(text) as SimulationInput;
  } catch {
    return null;
  }
}

export function buildPlayerDirectory(simulationInputText: string | null): Map<string, PlayerDirectoryEntry> {
  const directory = new Map<string, PlayerDirectoryEntry>();
  const input = parseSimulationInput(simulationInputText);
  if (!input) return directory;
  for (const team of [input.homeTeam, input.awayTeam]) {
    const slotByPlayer = new Map<string, string>();
    for (const assignment of team.lineupAssignments ?? []) {
      if (assignment?.playerId && assignment?.slot) slotByPlayer.set(assignment.playerId, assignment.slot);
    }
    for (const player of team.players) {
      directory.set(player.playerId, {
        playerId: player.playerId,
        firstName: player.firstName,
        lastName: player.lastName,
        teamId: team.teamId,
        primaryPosition: player.primaryPosition,
        lineupSlot: slotByPlayer.get(player.playerId),
      });
    }
  }
  return directory;
}

export function buildTeamDirectory(simulationInputText: string | null): Map<string, TeamDirectoryEntry> {
  const directory = new Map<string, TeamDirectoryEntry>();
  const input = parseSimulationInput(simulationInputText);
  if (!input) return directory;
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
  return directory;
}

export function playerDisplayName(entry: PlayerDirectoryEntry | undefined, playerId: string | null | undefined): string | null {
  if (entry) return `${entry.firstName} ${entry.lastName}`.trim();
  if (playerId) return playerId.slice(0, 8);
  return null;
}

export async function loadMatchResultContext(matchId: string, resultId?: string | null) {
  const match = await prisma.match.findUnique({
    where: { id: matchId },
    include: {
      homeTeam: true,
      awayTeam: true,
      competitionEdition: true,
    },
  });
  if (!match) return null;

  let result =
    resultId != null && resultId !== ''
      ? await prisma.matchResult.findUnique({ where: { id: resultId } })
      : null;

  if (result && result.matchId !== matchId) {
    throw new MatchHttpError(404, 'MatchResultNotFound', 'Result does not belong to this match');
  }

  if (!result) {
    result =
      (match.currentResultId
        ? await prisma.matchResult.findUnique({ where: { id: match.currentResultId } })
        : null) ??
      (await prisma.matchResult.findFirst({
        where: { matchId, status: 'COMPLETED' },
        orderBy: { attemptNumber: 'desc' },
      }));
  }

  const isCurrent = Boolean(result && match.currentResultId === result.id);

  return { match, result, isCurrent };
}

export function pct(numerator: number, denominator: number): number | null {
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator <= 0) return null;
  return numerator / denominator;
}

export function formatPct(value: number | null, digits = 1): string {
  if (value == null || !Number.isFinite(value)) return '—';
  return `${(value * 100).toFixed(digits)}%`;
}
