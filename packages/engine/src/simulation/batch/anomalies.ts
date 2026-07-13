import {
  DEFAULT_LAB_ANOMALY_GUARDRAILS,
  type LabAggregate,
  type LabAnomaly,
  type LabAnomalyGuardrails,
} from './types.js';

export function detectLabAnomalies(
  aggregate: LabAggregate,
  opts?: { guardrails?: LabAnomalyGuardrails; requestedCount?: number },
): LabAnomaly[] {
  const g = opts?.guardrails ?? DEFAULT_LAB_ANOMALY_GUARDRAILS;
  const count = opts?.requestedCount ?? aggregate.outcomes.games;
  const anomalies: LabAnomaly[] = [];
  const games = aggregate.outcomes.games;

  if (games === 0) {
    anomalies.push({
      code: 'NO_OUTCOME_VARIANCE',
      severity: 'ERROR',
      message: 'No completed games to analyze',
      metric: 'games',
      observedValue: 0,
      guardrail: '> 0',
    });
    return anomalies;
  }

  if (count < g.smallSampleWarningBelow) {
    anomalies.push({
      code: 'SMALL_SAMPLE_WARNING',
      severity: 'INFO',
      message: `Sample size ${count} is below the development guardrail of ${g.smallSampleWarningBelow}`,
      metric: 'simulationCount',
      observedValue: count,
      guardrail: `>= ${g.smallSampleWarningBelow}`,
    });
  }

  if (aggregate.reconciliationFailures > 0) {
    anomalies.push({
      code: 'RECONCILIATION_FAILURE',
      severity: 'ERROR',
      message: `${aggregate.reconciliationFailures} game(s) failed reconciliation`,
      metric: 'reconciliationFailures',
      observedValue: aggregate.reconciliationFailures,
      guardrail: '0',
    });
  }

  if (aggregate.failedGames > 0) {
    anomalies.push({
      code: 'SAFETY_LIMIT_FAILURE',
      severity: 'ERROR',
      message: `${aggregate.failedGames} game(s) failed during simulation`,
      metric: 'failedGames',
      observedValue: aggregate.failedGames,
      guardrail: '0',
    });
  }

  const goals = aggregate.scoring.combinedAverageGoals;
  if (goals < g.minGoalsPerGame || goals > g.maxGoalsPerGame) {
    anomalies.push({
      code: 'EXTREME_GOALS_PER_GAME',
      severity: 'WARNING',
      message: `Combined goals/game ${goals.toFixed(2)} is outside development guardrail`,
      metric: 'combinedAverageGoals',
      observedValue: Number(goals.toFixed(3)),
      guardrail: `${g.minGoalsPerGame}–${g.maxGoalsPerGame}`,
    });
  }

  const sog =
    (aggregate.shooting.teamAAverageShotsOnGoal + aggregate.shooting.teamBAverageShotsOnGoal);
  if (sog < g.minShotsOnGoalPerGame) {
    anomalies.push({
      code: 'TOO_FEW_SHOTS',
      severity: 'WARNING',
      message: `Combined SOG/game ${sog.toFixed(2)} is below development guardrail`,
      metric: 'combinedShotsOnGoalPerGame',
      observedValue: Number(sog.toFixed(3)),
      guardrail: `>= ${g.minShotsOnGoalPerGame}`,
    });
  }
  if (sog > g.maxShotsOnGoalPerGame) {
    anomalies.push({
      code: 'EXTREME_SHOTS_PER_GAME',
      severity: 'WARNING',
      message: `Combined SOG/game ${sog.toFixed(2)} is above development guardrail`,
      metric: 'combinedShotsOnGoalPerGame',
      observedValue: Number(sog.toFixed(3)),
      guardrail: `<= ${g.maxShotsOnGoalPerGame}`,
    });
  }

  for (const [label, sv] of [
    ['teamA', aggregate.shooting.teamASavePercentage],
    ['teamB', aggregate.shooting.teamBSavePercentage],
  ] as const) {
    if (sv < g.minSavePercentage) {
      anomalies.push({
        code: 'LOW_SAVE_PERCENTAGE',
        severity: 'WARNING',
        message: `${label} save% ${(sv * 100).toFixed(1)}% is below development guardrail`,
        metric: `${label}SavePercentage`,
        observedValue: Number(sv.toFixed(4)),
        guardrail: `>= ${g.minSavePercentage}`,
      });
    }
    if (sv > g.maxSavePercentage) {
      anomalies.push({
        code: 'HIGH_SAVE_PERCENTAGE',
        severity: 'WARNING',
        message: `${label} save% ${(sv * 100).toFixed(1)}% is above development guardrail`,
        metric: `${label}SavePercentage`,
        observedValue: Number(sv.toFixed(4)),
        guardrail: `<= ${g.maxSavePercentage}`,
      });
    }
  }

  const pen =
    (aggregate.specialTeams.teamAPenaltiesPerGame + aggregate.specialTeams.teamBPenaltiesPerGame) / 2;
  if (pen > g.maxPenaltiesPerGame) {
    anomalies.push({
      code: 'EXCESSIVE_PENALTIES',
      severity: 'WARNING',
      message: `Average penalties/game ${pen.toFixed(2)} is above development guardrail`,
      metric: 'penaltiesPerGame',
      observedValue: Number(pen.toFixed(3)),
      guardrail: `<= ${g.maxPenaltiesPerGame}`,
    });
  }
  if (pen < g.minPenaltiesPerGame) {
    anomalies.push({
      code: 'LOW_PENALTY_RATE',
      severity: 'WARNING',
      message: `Average penalties/game ${pen.toFixed(2)} is below development guardrail`,
      metric: 'penaltiesPerGame',
      observedValue: Number(pen.toFixed(3)),
      guardrail: `>= ${g.minPenaltiesPerGame}`,
    });
  }

  for (const [label, pp] of [
    ['teamA', aggregate.specialTeams.teamAPowerPlayPercentage],
    ['teamB', aggregate.specialTeams.teamBPowerPlayPercentage],
  ] as const) {
    if (pp > g.maxPowerPlayPercentage || pp < g.minPowerPlayPercentage) {
      anomalies.push({
        code: 'EXTREME_POWER_PLAY_PERCENTAGE',
        severity: 'WARNING',
        message: `${label} PP% ${(pp * 100).toFixed(1)}% is outside development guardrail`,
        metric: `${label}PowerPlayPercentage`,
        observedValue: Number(pp.toFixed(4)),
        guardrail: `${g.minPowerPlayPercentage}–${g.maxPowerPlayPercentage}`,
      });
    }
  }

  const home = aggregate.outcomes.homeWinRate;
  if (home > g.maxHomeWinRate || home < g.minHomeWinRate) {
    anomalies.push({
      code: 'HOME_ADVANTAGE_EXTREME',
      severity: 'WARNING',
      message: `Home win rate ${(home * 100).toFixed(1)}% is outside development guardrail`,
      metric: 'homeWinRate',
      observedValue: Number(home.toFixed(4)),
      guardrail: `${g.minHomeWinRate}–${g.maxHomeWinRate}`,
    });
  }

  const soRate = aggregate.outcomes.shootoutDecisions / games;
  if (soRate > g.maxShootoutRate) {
    anomalies.push({
      code: 'TOO_MANY_SHOOTOUTS',
      severity: 'WARNING',
      message: `Shootout rate ${(soRate * 100).toFixed(1)}% is above development guardrail`,
      metric: 'shootoutRate',
      observedValue: Number(soRate.toFixed(4)),
      guardrail: `<= ${g.maxShootoutRate}`,
    });
  }

  if (
    games >= 10 &&
    ((aggregate.outcomes.teamAWins === games && aggregate.outcomes.teamBWins === 0) ||
      (aggregate.outcomes.teamBWins === games && aggregate.outcomes.teamAWins === 0))
  ) {
    anomalies.push({
      code: 'NO_OUTCOME_VARIANCE',
      severity: 'WARNING',
      message: 'All games were won by the same team',
      metric: 'winDistribution',
      observedValue: `${aggregate.outcomes.teamAWins}-${aggregate.outcomes.teamBWins}`,
      guardrail: 'mixed winners expected in larger samples',
    });
  }

  const shg =
    aggregate.specialTeams.teamAShortHandedGoalsPerGame +
    aggregate.specialTeams.teamBShortHandedGoalsPerGame;
  if (shg === 0 && games >= 50) {
    anomalies.push({
      code: 'ZERO_SHORT_HANDED_ACTIVITY',
      severity: 'INFO',
      message: 'No short-handed goals observed in this batch',
      metric: 'shortHandedGoalsPerGame',
      observedValue: 0,
      guardrail: 'informational',
    });
  }

  if (aggregate.players.length > 0) {
    const top = aggregate.players[0];
    const totalPoints = aggregate.players.reduce((s, p) => s + p.points, 0);
    if (top && totalPoints > 0 && top.points / totalPoints > 0.35 && games >= 20) {
      anomalies.push({
        code: 'PLAYER_CONTRIBUTION_CONCENTRATION',
        severity: 'INFO',
        message: `Top scorer accounts for ${((top.points / totalPoints) * 100).toFixed(1)}% of points`,
        metric: 'topScorerShare',
        observedValue: Number((top.points / totalPoints).toFixed(4)),
        guardrail: '<= 0.35 informational',
      });
    }
  }

  return anomalies.sort((a, b) => {
    const sev = { ERROR: 0, WARNING: 1, INFO: 2 };
    if (sev[a.severity] !== sev[b.severity]) return sev[a.severity] - sev[b.severity];
    return a.code.localeCompare(b.code);
  });
}
