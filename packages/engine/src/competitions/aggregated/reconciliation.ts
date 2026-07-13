import type {
  AggregatedAnomaly,
  AggregatedGameSummary,
  AggregatedPlayerSeasonStat,
  AggregatedTeamSeasonStat,
  AggregatedTeamStrengthSnapshot,
} from './types.js';

export function detectAggregatedAnomalies(input: {
  strengths: AggregatedTeamStrengthSnapshot[];
  games: AggregatedGameSummary[];
  teamStats: AggregatedTeamSeasonStat[];
  playerStats: AggregatedPlayerSeasonStat[];
}): AggregatedAnomaly[] {
  const anomalies: AggregatedAnomaly[] = [];
  if (input.strengths.length < 6) {
    anomalies.push({
      code: 'SMALL_LEAGUE_WARNING',
      severity: 'WARN',
      message: `Small league (${input.strengths.length} teams)`,
    });
  }

  const totalGoals = input.games.reduce((a, g) => a + g.homeScore + g.awayScore, 0);
  const gpg = input.games.length > 0 ? totalGoals / input.games.length : 0;
  if (gpg > 9 || gpg < 2) {
    anomalies.push({
      code: 'EXTREME_GOALS_PER_GAME',
      severity: 'WARN',
      message: `Goals per game ${gpg.toFixed(2)} is outside typical bounds`,
    });
  }

  const homeWins = input.games.filter(
    (g) => g.winnerParticipantId === g.homeCompetitionParticipantId,
  ).length;
  const homeRate = input.games.length > 0 ? homeWins / input.games.length : 0.5;
  if (homeRate > 0.72 || homeRate < 0.28) {
    anomalies.push({
      code: 'EXTREME_HOME_WIN_RATE',
      severity: 'WARN',
      message: `Home win rate ${(homeRate * 100).toFixed(1)}%`,
    });
  }

  const points = input.teamStats.map((t) => t.wins);
  if (points.length > 1 && new Set(points).size === 1) {
    anomalies.push({
      code: 'NO_STANDINGS_VARIANCE',
      severity: 'WARN',
      message: 'All teams have identical win totals',
    });
  }

  const strengths = input.strengths.map((s) => s.overallStrength);
  const maxS = Math.max(...strengths);
  const minS = Math.min(...strengths);
  if (maxS - minS > 0.45) {
    anomalies.push({
      code: 'EXTREME_STRENGTH_DOMINANCE',
      severity: 'WARN',
      message: 'Large team strength gap in league',
    });
  }

  const ot = input.games.filter((g) => g.decisionType === 'OVERTIME').length;
  const so = input.games.filter((g) => g.decisionType === 'SHOOTOUT').length;
  if (input.games.length > 0 && ot / input.games.length > 0.4) {
    anomalies.push({
      code: 'TOO_MANY_OVERTIME_GAMES',
      severity: 'WARN',
      message: 'High overtime rate',
    });
  }
  if (input.games.length > 0 && so / input.games.length > 0.25) {
    anomalies.push({
      code: 'TOO_MANY_SHOOTOUTS',
      severity: 'WARN',
      message: 'High shootout rate',
    });
  }

  for (const t of input.teamStats) {
    const skaterGoals = input.playerStats
      .filter((p) => p.competitionParticipantId === t.competitionParticipantId && !p.isGoalie)
      .reduce((a, p) => a + p.goals, 0);
    if (skaterGoals !== t.goals) {
      anomalies.push({
        code: 'TEAM_STATS_RECONCILIATION',
        severity: 'WARN',
        message: `Player goals ${skaterGoals} != team goals ${t.goals} for ${t.teamNameSnapshot}`,
      });
    }
    const goalieGa = input.playerStats
      .filter((p) => p.competitionParticipantId === t.competitionParticipantId && p.isGoalie)
      .reduce((a, p) => a + p.goalsAgainst, 0);
    if (goalieGa !== t.goalsAgainst) {
      anomalies.push({
        code: 'GOALIE_STATS_RECONCILIATION',
        severity: 'WARN',
        message: `Goalie GA ${goalieGa} != team GA ${t.goalsAgainst} for ${t.teamNameSnapshot}`,
      });
    }
  }

  const topPoints = Math.max(0, ...input.playerStats.filter((p) => !p.isGoalie).map((p) => p.points));
  const totalPoints = input.playerStats.filter((p) => !p.isGoalie).reduce((a, p) => a + p.points, 0);
  if (totalPoints > 0 && topPoints / totalPoints > 0.25) {
    anomalies.push({
      code: 'PLAYER_POINTS_CONCENTRATION',
      severity: 'WARN',
      message: 'Scoring heavily concentrated in one player',
    });
  }

  return anomalies;
}
