import {
  buildTestSimulationInput,
  runLabBatch,
  simulateCompleteMatch,
} from '../../index.js';

const counts = [10, 100] as const;
let failures = 0;

for (const count of counts) {
  const teamAId = 'home';
  const teamBId = 'away';
  const baseSeed = `lab-verify-${count}`;

  const runOnce = () =>
    runLabBatch({
      baseSeed,
      simulationCount: count,
      sideMode: 'ALTERNATE',
      teamAId,
      teamBId,
      baselineBalanceMeta: {
        versionId: 'v1',
        versionNumber: 1,
        configHash: 'lab-hash',
        presetName: 'Standard',
      },
      includeGameSummaries: count <= 100,
      buildInput: ({ seed, homeTeamId, awayTeamId }) => {
        const input = buildTestSimulationInput(seed, { mode: 'F14' });
        input.homeTeam.teamId = homeTeamId;
        input.awayTeam.teamId = awayTeamId;
        return input;
      },
      simulate: (input) => simulateCompleteMatch(input),
    });

  const a = runOnce();
  const b = runOnce();
  if (a.result.batchHash !== b.result.batchHash) {
    console.error(`Count ${count}: deterministic replay hash mismatch`);
    failures += 1;
  }
  if (a.result.aggregate.outcomes.games !== count) {
    console.error(`Count ${count}: expected ${count} games, got ${a.result.aggregate.outcomes.games}`);
    failures += 1;
  }
  if (a.result.aggregate.reconciliationFailures > 0) {
    console.error(`Count ${count}: reconciliation failures ${a.result.aggregate.reconciliationFailures}`);
    failures += 1;
  }

  console.log(`F16 lab verify count=${count}`);
  console.log(`  batchHash: ${a.result.batchHash.slice(0, 16)}…`);
  console.log(`  teamA win rate: ${(a.result.aggregate.outcomes.teamAWinRate * 100).toFixed(1)}%`);
  console.log(`  goals/game: ${a.result.aggregate.scoring.combinedAverageGoals.toFixed(3)}`);
  console.log(`  anomalies: ${a.result.anomalies.length}`);
}

if (failures > 0) {
  console.error(`Simulation Lab verification failed (${failures})`);
  process.exit(1);
}

console.log('Simulation Lab verification passed');
