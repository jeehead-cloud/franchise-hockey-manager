import type {
  AggregatedGameSummary,
  AggregatedPlayerSeasonStat,
  AggregatedTeamSeasonStat,
} from './types.js';
import { AggregatedLeagueError } from './types.js';

export interface AggregatedReconciliationIssue {
  code: string;
  message: string;
}

export function reconcileAggregatedSeason(input: {
  expectedScheduleKeys: string[];
  games: AggregatedGameSummary[];
  teamStats: AggregatedTeamSeasonStat[];
  playerStats: AggregatedPlayerSeasonStat[];
  participantCount: number;
  championParticipantId: string | null;
  rank1ParticipantId: string | null;
}): { ok: boolean; issues: AggregatedReconciliationIssue[] } {
  const issues: AggregatedReconciliationIssue[] = [];
  const keys = input.games.map((g) => g.scheduleKey).sort();
  const expected = [...input.expectedScheduleKeys].sort();
  if (keys.length !== expected.length || keys.some((k, i) => k !== expected[i])) {
    issues.push({ code: 'SCHEDULE_SET', message: 'Game summaries do not match schedule keys' });
  }
  const dup = keys.find((k, i) => keys.indexOf(k) !== i);
  if (dup) issues.push({ code: 'DUPLICATE_GAME', message: `Duplicate schedule key ${dup}` });

  for (const g of input.games) {
    if (g.homeScore < 0 || g.awayScore < 0) {
      issues.push({ code: 'NEGATIVE_SCORE', message: `Negative score in ${g.scheduleKey}` });
    }
    if (g.homeCompetitionParticipantId === g.awayCompetitionParticipantId) {
      issues.push({ code: 'SELF_MATCH', message: `Self match ${g.scheduleKey}` });
    }
  }

  if (input.teamStats.length !== input.participantCount) {
    issues.push({
      code: 'TEAM_STAT_COUNT',
      message: `Expected ${input.participantCount} team stats`,
    });
  }

  const gf = input.teamStats.reduce((a, t) => a + t.goals, 0);
  const ga = input.teamStats.reduce((a, t) => a + t.goalsAgainst, 0);
  if (gf !== ga) {
    issues.push({ code: 'GF_GA', message: `League GF ${gf} != GA ${ga}` });
  }

  for (const t of input.teamStats) {
    const skaterGoals = input.playerStats
      .filter((p) => p.competitionParticipantId === t.competitionParticipantId && !p.isGoalie)
      .reduce((a, p) => a + p.goals, 0);
    if (skaterGoals !== t.goals) {
      issues.push({
        code: 'PLAYER_GOALS',
        message: `Goals mismatch for ${t.teamNameSnapshot}`,
      });
    }
    const gaG = input.playerStats
      .filter((p) => p.competitionParticipantId === t.competitionParticipantId && p.isGoalie)
      .reduce((a, p) => a + p.goalsAgainst, 0);
    const sa = input.playerStats
      .filter((p) => p.competitionParticipantId === t.competitionParticipantId && p.isGoalie)
      .reduce((a, p) => a + p.shotsAgainst, 0);
    const sv = input.playerStats
      .filter((p) => p.competitionParticipantId === t.competitionParticipantId && p.isGoalie)
      .reduce((a, p) => a + p.saves, 0);
    if (gaG !== t.goalsAgainst || sa !== sv + gaG) {
      issues.push({
        code: 'GOALIE_RECONCILE',
        message: `Goalie totals mismatch for ${t.teamNameSnapshot}`,
      });
    }
    for (const p of input.playerStats.filter(
      (x) => x.competitionParticipantId === t.competitionParticipantId,
    )) {
      if (
        p.goals < 0 ||
        p.assists < 0 ||
        p.shotsAgainst < 0 ||
        p.saves < 0 ||
        p.goalsAgainst < 0
      ) {
        issues.push({ code: 'NEGATIVE_STAT', message: `Negative stat for ${p.playerId}` });
      }
    }
  }

  if (
    input.rank1ParticipantId &&
    input.championParticipantId &&
    input.rank1ParticipantId !== input.championParticipantId
  ) {
    issues.push({ code: 'CHAMPION', message: 'Champion does not match standings rank 1' });
  }

  return { ok: issues.length === 0, issues };
}

export function assertReconciled(
  result: { ok: boolean; issues: AggregatedReconciliationIssue[] },
): void {
  if (!result.ok) {
    throw new AggregatedLeagueError(
      'AggregatedSimulationReconciliationFailed',
      result.issues[0]?.message ?? 'Reconciliation failed',
    );
  }
}
