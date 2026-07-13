import type { LabAggregate, LabComparisonDelta, LabComparisonResult, LabGameSummary } from './types.js';

function pushDelta(
  deltas: LabComparisonDelta[],
  metric: string,
  baseline: number,
  comparison: number,
) {
  deltas.push({
    metric,
    baseline,
    comparison,
    delta: comparison - baseline,
  });
}

export function compareLabAggregates(
  baseline: LabAggregate,
  comparison: LabAggregate,
  pairedGames?: { baseline: LabGameSummary[]; comparison: LabGameSummary[] },
): LabComparisonResult {
  const deltas: LabComparisonDelta[] = [];
  pushDelta(deltas, 'teamAWinRate', baseline.outcomes.teamAWinRate, comparison.outcomes.teamAWinRate);
  pushDelta(deltas, 'teamBWinRate', baseline.outcomes.teamBWinRate, comparison.outcomes.teamBWinRate);
  pushDelta(deltas, 'homeWinRate', baseline.outcomes.homeWinRate, comparison.outcomes.homeWinRate);
  pushDelta(
    deltas,
    'combinedAverageGoals',
    baseline.scoring.combinedAverageGoals,
    comparison.scoring.combinedAverageGoals,
  );
  pushDelta(
    deltas,
    'teamAShootingPercentage',
    baseline.shooting.teamAShootingPercentage,
    comparison.shooting.teamAShootingPercentage,
  );
  pushDelta(
    deltas,
    'teamASavePercentage',
    baseline.shooting.teamASavePercentage,
    comparison.shooting.teamASavePercentage,
  );
  pushDelta(
    deltas,
    'teamAPowerPlayPercentage',
    baseline.specialTeams.teamAPowerPlayPercentage,
    comparison.specialTeams.teamAPowerPlayPercentage,
  );
  pushDelta(
    deltas,
    'penaltiesPerGame',
    (baseline.specialTeams.teamAPenaltiesPerGame + baseline.specialTeams.teamBPenaltiesPerGame) / 2,
    (comparison.specialTeams.teamAPenaltiesPerGame + comparison.specialTeams.teamBPenaltiesPerGame) / 2,
  );
  pushDelta(deltas, 'upsetRate', baseline.upsets.upsetRate, comparison.upsets.upsetRate);
  pushDelta(
    deltas,
    'shootoutRate',
    baseline.outcomes.games ? baseline.outcomes.shootoutDecisions / baseline.outcomes.games : 0,
    comparison.outcomes.games ? comparison.outcomes.shootoutDecisions / comparison.outcomes.games : 0,
  );

  let pairedOutcomeChanges = 0;
  let gamesCompared = 0;
  if (pairedGames) {
    const n = Math.min(pairedGames.baseline.length, pairedGames.comparison.length);
    gamesCompared = n;
    for (let i = 0; i < n; i += 1) {
      const a = pairedGames.baseline[i]!;
      const b = pairedGames.comparison[i]!;
      if (a.winner !== b.winner || a.decisionType !== b.decisionType) pairedOutcomeChanges += 1;
    }
  }

  deltas.sort((a, b) => a.metric.localeCompare(b.metric));

  return {
    baseline,
    comparison,
    deltas,
    pairedOutcomeChanges,
    gamesCompared,
  };
}
