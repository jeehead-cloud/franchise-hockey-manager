import { prisma } from '../db/client.js';
import { MatchHttpError } from './matches.js';
import { getMatchOverview } from './match-view.js';
import { getMatchEventsView, type MatchEventViewFilters } from './match-events.js';
import { getMatchDiagnostics } from './match-diagnostics.js';
import { loadMatchResultContext } from './match-result-context.js';

function csvEscape(value: unknown): string {
  if (value == null) return '';
  const text = String(value);
  if (/[",\n\r]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

function toCsv(headers: string[], rows: unknown[][]): string {
  return [headers.map(csvEscape).join(','), ...rows.map((row) => row.map(csvEscape).join(','))].join('\n');
}

export async function exportMatchResultJson(matchId: string, resultId?: string | null) {
  const overview = await getMatchOverview(matchId, resultId);
  if (!overview) return null;
  if (overview.prepared || !overview.result) {
    throw new MatchHttpError(404, 'MatchResultNotFound', 'Match has no completed result yet');
  }
  return {
    format: 'fhm-match-result-export',
    exportedAt: new Date().toISOString(),
    overview,
  };
}

export async function exportMatchEventsCsv(
  matchId: string,
  filters: MatchEventViewFilters,
  opts?: { resultId?: string | null; technical?: boolean },
) {
  const pageSize = 200;
  let page = 1;
  const all: Array<Record<string, unknown>> = [];
  for (;;) {
    const chunk = await getMatchEventsView(
      matchId,
      { page, pageSize, skip: (page - 1) * pageSize },
      filters,
      { resultId: opts?.resultId, includeTechnicalPayload: opts?.technical },
    );
    if (!chunk) return null;
    all.push(...chunk.items);
    if (all.length >= chunk.total || chunk.items.length === 0) break;
    page += 1;
    if (page > 1000) break;
  }

  const headers = [
    'eventIndex',
    'eventType',
    'period',
    'remainingSeconds',
    'teamId',
    'teamName',
    'primaryPlayerId',
    'primaryPlayerName',
    'visibility',
    'summary',
  ];
  const rows = all.map((item) => [
    item.eventIndex,
    item.eventType,
    item.period,
    item.remainingSeconds,
    item.teamId,
    item.teamName,
    item.primaryPlayerId,
    item.primaryPlayerName,
    item.visibility,
    item.summary,
  ]);
  return toCsv(headers, rows);
}

export async function exportPlayerStatsCsv(matchId: string, resultId?: string | null) {
  const overview = await getMatchOverview(matchId, resultId);
  if (!overview) return null;
  if (!overview.result) throw new MatchHttpError(404, 'MatchResultNotFound', 'Match has no completed result yet');
  const headers = [
    'playerId',
    'teamId',
    'teamName',
    'firstName',
    'lastName',
    'position',
    'lineupSlot',
    'goals',
    'assists',
    'points',
    'shotsOnGoal',
    'penaltyMinutes',
    'powerPlayGoals',
    'shortHandedGoals',
    'shootoutAttempts',
    'shootoutGoals',
  ];
  const rows = overview.result.skaters.map((row) => [
    row.playerId,
    row.teamId,
    row.teamName,
    row.firstName,
    row.lastName,
    row.position,
    row.lineupSlot,
    row.goals,
    row.assists,
    row.points,
    row.shotsOnGoal,
    row.penaltyMinutes,
    row.powerPlayGoals,
    row.shortHandedGoals,
    row.shootoutAttempts,
    row.shootoutGoals,
  ]);
  return toCsv(headers, rows);
}

export async function exportTeamStatsCsv(matchId: string, resultId?: string | null) {
  const overview = await getMatchOverview(matchId, resultId);
  if (!overview) return null;
  if (!overview.result) throw new MatchHttpError(404, 'MatchResultNotFound', 'Match has no completed result yet');
  const teams = [overview.result.teamComparison.home, overview.result.teamComparison.away].filter(Boolean);
  const headers = [
    'teamId',
    'teamName',
    'side',
    'goals',
    'shotsOnGoal',
    'shotAttempts',
    'saves',
    'penalties',
    'penaltyMinutes',
    'powerPlayGoals',
    'shortHandedGoals',
    'shootoutAttempts',
    'shootoutGoals',
  ];
  const rows = teams.map((row) => [
    row!.teamId,
    row!.teamName,
    row!.side,
    row!.goals,
    row!.shotsOnGoal,
    row!.shotAttempts,
    row!.saves,
    row!.penalties,
    row!.penaltyMinutes,
    row!.powerPlayGoals,
    row!.shortHandedGoals,
    row!.shootoutAttempts,
    row!.shootoutGoals,
  ]);
  return toCsv(headers, rows);
}

export async function exportDiagnosticsJson(
  matchId: string,
  resultId?: string | null,
): Promise<{ format: string; exportedAt: string; diagnostics: Record<string, unknown> } | null> {
  const diagnostics = await getMatchDiagnostics(matchId, resultId);
  if (!diagnostics) return null;
  return {
    format: 'fhm-match-diagnostics-export',
    exportedAt: new Date().toISOString(),
    diagnostics,
  };
}

export async function assertResultBelongsToMatch(matchId: string, resultId: string) {
  const loaded = await loadMatchResultContext(matchId, resultId);
  if (!loaded) throw new MatchHttpError(404, 'MatchNotFound', 'Match not found');
  if (!loaded.result) throw new MatchHttpError(404, 'MatchResultNotFound', 'Match result not found');
  return loaded;
}
