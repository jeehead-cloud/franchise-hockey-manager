import {
  simulateRegulation,
  FORBIDDEN_F13_EVENT_TYPES,
  computeTraceHash,
} from '../../index.js';
import { buildTestSimulationInput } from './fixture.js';

const count = Number(process.env.FHM_SCORING_ENGINE_VERIFY_COUNT ?? 500);

let failures = 0;
let reconciliationFailures = 0;
let safetyFailures = 0;
let replayFailures = 0;
let totalGoals = 0;
let totalShotsOnGoal = 0;
let totalSaves = 0;
let zeroZeroGames = 0;
let shutouts = 0;

for (let i = 0; i < count; i += 1) {
  const seed = `scoring-verify-${i}`;
  try {
    const input = buildTestSimulationInput(seed);
    const result = simulateRegulation(input);
    if (result.finalState.simulationStatus !== 'REGULATION_COMPLETE') {
      console.error(`Run ${i}: did not complete`);
      failures += 1;
      continue;
    }
    if (result.diagnostics.safetyLimitHit) {
      safetyFailures += 1;
      failures += 1;
    }
    if (!result.reconciliation.ok) {
      reconciliationFailures += 1;
      failures += 1;
    }
    for (const ev of result.events) {
      if ((FORBIDDEN_F13_EVENT_TYPES as readonly string[]).includes(ev.type)) {
        console.error(`Run ${i}: forbidden event ${ev.type}`);
        failures += 1;
        break;
      }
    }

    const replay = simulateRegulation(buildTestSimulationInput(seed));
    if (replay.diagnostics.traceHash !== result.diagnostics.traceHash) {
      replayFailures += 1;
      failures += 1;
    }

    const goals = result.finalState.score.home + result.finalState.score.away;
    totalGoals += goals;
    totalShotsOnGoal += result.statistics.home.shotsOnGoal + result.statistics.away.shotsOnGoal;
    totalSaves += result.statistics.home.saves + result.statistics.away.saves;
    if (goals === 0) zeroZeroGames += 1;
    if (result.finalState.score.home === 0 || result.finalState.score.away === 0) shutouts += 1;
  } catch (err) {
    console.error(`Run ${i}: threw`, err);
    failures += 1;
  }
}

const games = count;
const goalsPerGame = totalGoals / games;
const sogPerGame = totalShotsOnGoal / games;
const savePct = totalShotsOnGoal > 0 ? totalSaves / totalShotsOnGoal : 0;

console.log('F12 scoring engine verification summary');
console.log(`  games: ${games}`);
console.log(`  goals/game: ${goalsPerGame.toFixed(3)}`);
console.log(`  shots on goal/game: ${sogPerGame.toFixed(2)}`);
console.log(`  aggregate save%: ${(savePct * 100).toFixed(2)}%`);
console.log(`  0-0 games: ${zeroZeroGames}`);
console.log(`  games with a shutout side: ${shutouts}`);
console.log(`  reconciliation failures: ${reconciliationFailures}`);
console.log(`  safety-limit failures: ${safetyFailures}`);
console.log(`  deterministic replay failures: ${replayFailures}`);

if (failures > 0) {
  console.error(`Scoring engine verification failed: ${failures}/${count}`);
  process.exit(1);
}

if (zeroZeroGames === games) {
  console.error('All games were 0-0 — scoring pipeline may be broken');
  process.exit(1);
}

console.log(`Scoring engine verification passed (${count} runs)`);
