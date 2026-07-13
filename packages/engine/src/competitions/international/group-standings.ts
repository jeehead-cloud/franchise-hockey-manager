import { computeStandings } from '../regular-season/standings.js';
import type { CompetitionPointsRules, TiebreakerCode } from '../types.js';
import type { StandingMatchResult } from '../regular-season/types.js';
import type {
  GroupStandingRow,
  InternationalTournamentTemplate,
} from './types.js';

export interface GroupMatchResultInput {
  homeParticipantId: string;
  awayParticipantId: string;
  homeTeamId: string;
  awayTeamId: string;
  homeScore: number;
  awayScore: number;
  homeRegulationScore?: number;
  awayRegulationScore?: number;
  decisionType: 'REGULATION' | 'OVERTIME' | 'SHOOTOUT' | 'TIE';
  groupKey: string;
  scheduleOrder: number;
  winnerParticipantId: string | null;
}

/**
 * Compute standings for a single group using F18 standings engine.
 */
export function computeGroupStandings(input: {
  groupKey: string;
  participants: Array<{ participantId: string; teamId: string; teamNameSnapshot: string }>;
  results: GroupMatchResultInput[];
  template: InternationalTournamentTemplate;
  standingsSeed: string;
  provisional: boolean;
  scheduledMatchCount: number;
}): { rows: GroupStandingRow[]; standingsHash: string } {
  const points: CompetitionPointsRules = {
    regulationWin: input.template.points.regulationWin,
    overtimeWin: input.template.points.overtimeWin,
    shootoutWin: input.template.points.shootoutWin,
    overtimeLoss: input.template.points.overtimeLoss,
    shootoutLoss: input.template.points.shootoutLoss,
    regulationLoss: input.template.points.regulationLoss,
    tie: 0,
  };

  const tiebreakers = input.template.tiebreakers as TiebreakerCode[];
  const groupResults = input.results.filter((r) => r.groupKey === input.groupKey);

  const matches: StandingMatchResult[] = groupResults.map((r) => ({
    scheduleOrder: r.scheduleOrder,
    homeParticipantId: r.homeParticipantId,
    awayParticipantId: r.awayParticipantId,
    homeTeamId: r.homeTeamId,
    awayTeamId: r.awayTeamId,
    homeScore: r.homeScore,
    awayScore: r.awayScore,
    homeRegulationScore: r.homeRegulationScore ?? r.homeScore,
    awayRegulationScore: r.awayRegulationScore ?? r.awayScore,
    decisionType: r.decisionType,
    winnerParticipantId: r.winnerParticipantId,
  }));

  const result = computeStandings({
    participants: input.participants,
    matches,
    pointsRules: points,
    tiebreakers,
    qualifiersCount: input.template.groupStage.qualifiersPerGroup,
    scheduledMatchCount: input.scheduledMatchCount,
    standingsSeed: `${input.standingsSeed}:group:${input.groupKey}`,
    provisional: input.provisional,
  });

  const rows: GroupStandingRow[] = result.rows.map((row) => ({
    participantId: row.participantId,
    groupKey: input.groupKey,
    rank: row.rank,
    gamesPlayed: row.gamesPlayed,
    regulationWins: row.regulationWins,
    overtimeWins: row.overtimeWins,
    shootoutWins: row.shootoutWins,
    regulationLosses: row.regulationLosses,
    overtimeLosses: row.overtimeLosses,
    shootoutLosses: row.shootoutLosses,
    goalsFor: row.goalsFor,
    goalsAgainst: row.goalsAgainst,
    goalDifference: row.goalDifference,
    points: row.points,
    qualified: row.qualified,
    tiebreakerSummary: row.tiebreakerSummary,
  }));

  return { rows, standingsHash: result.standingsHash };
}

export function computeAllGroupStandings(input: {
  groups: Array<{
    groupKey: string;
    participants: Array<{ participantId: string; teamId: string; teamNameSnapshot: string }>;
  }>;
  results: GroupMatchResultInput[];
  template: InternationalTournamentTemplate;
  standingsSeed: string;
  provisional: boolean;
  scheduledMatchCountByGroup: Record<string, number>;
}): { byGroup: Record<string, GroupStandingRow[]>; hashes: Record<string, string> } {
  const byGroup: Record<string, GroupStandingRow[]> = {};
  const hashes: Record<string, string> = {};
  for (const g of input.groups) {
    const { rows, standingsHash } = computeGroupStandings({
      groupKey: g.groupKey,
      participants: g.participants,
      results: input.results,
      template: input.template,
      standingsSeed: input.standingsSeed,
      provisional: input.provisional,
      scheduledMatchCount: input.scheduledMatchCountByGroup[g.groupKey] ?? 0,
    });
    byGroup[g.groupKey] = rows;
    hashes[g.groupKey] = standingsHash;
  }
  return { byGroup, hashes };
}
