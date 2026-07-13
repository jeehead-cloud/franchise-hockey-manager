import { simulateCompleteMatch, FORBIDDEN_F14_EVENT_TYPES } from '../../index.js';
import { buildTestSimulationInput } from './fixture.js';

const count = Number(process.env.FHM_PLAYABLE_MATCH_VERIFY_COUNT ?? 100);
let failures = 0;
let reconciliationFailures = 0;
let replayFailures = 0;
let safetyFailures = 0;
const decisions = { REGULATION: 0, OVERTIME: 0, SHOOTOUT: 0, TIE: 0 };
let totalGoals = 0;
let totalPenalties = 0;
let totalPpOpportunities = 0;
let totalPpGoals = 0;

for (let i = 0; i < count; i += 1) {
  const seed = `playable-verify-${i}`;
  try {
    const input = buildTestSimulationInput(seed);
    const result = simulateCompleteMatch(input);
    if (result.finalState.simulationStatus !== 'MATCH_COMPLETE') {
      console.error(`Run ${i}: did not complete (status=${result.finalState.simulationStatus})`);
      failures += 1;
      continue;
    }
    if (result.events.at(-1)?.type !== 'MATCH_END') {
      console.error(`Run ${i}: last event was not MATCH_END`);
      failures += 1;
      continue;
    }
    if (!result.reconciliation.ok) {
      reconciliationFailures += 1;
      failures += 1;
      continue;
    }
    if (!result.finalResult.winnerSide && result.finalResult.decisionType !== 'TIE') {
      console.error(`Run ${i}: missing winner for non-tie decision`);
      failures += 1;
      continue;
    }
    for (const ev of result.events) {
      if ((FORBIDDEN_F14_EVENT_TYPES as readonly string[]).includes(ev.type)) {
        console.error(`Run ${i}: forbidden event ${ev.type}`);
        failures += 1;
        break;
      }
    }

    const replay = simulateCompleteMatch(buildTestSimulationInput(seed));
    if (replay.diagnostics.traceHash !== result.diagnostics.traceHash) {
      replayFailures += 1;
      failures += 1;
    }
    if (result.diagnostics.safetyLimitHit) {
      safetyFailures += 1;
      failures += 1;
    }

    decisions[result.finalResult.decisionType] += 1;
    totalGoals += result.finalResult.displayScore.home + result.finalResult.displayScore.away;
    totalPenalties += result.statistics.home.penalties + result.statistics.away.penalties;
    totalPpOpportunities += result.statistics.home.powerPlayOpportunities + result.statistics.away.powerPlayOpportunities;
    totalPpGoals += result.statistics.home.powerPlayGoals + result.statistics.away.powerPlayGoals;
  } catch (err) {
    console.error(`Run ${i}: threw`, err);
    failures += 1;
  }
}

const ppPct = totalPpOpportunities > 0 ? totalPpGoals / totalPpOpportunities : 0;

console.log('F14 playable match engine verification summary');
console.log(`  games: ${count}`);
console.log(`  regulation decisions: ${decisions.REGULATION}`);
console.log(`  overtime decisions: ${decisions.OVERTIME}`);
console.log(`  shootout decisions: ${decisions.SHOOTOUT}`);
console.log(`  ties: ${decisions.TIE}`);
console.log(`  goals/game: ${(totalGoals / count).toFixed(3)}`);
console.log(`  penalties/game: ${(totalPenalties / count).toFixed(3)}`);
console.log(`  PP%: ${(ppPct * 100).toFixed(2)}%`);
console.log(`  reconciliation failures: ${reconciliationFailures}`);
console.log(`  replay failures: ${replayFailures}`);
console.log(`  safety-limit failures: ${safetyFailures}`);

if (failures > 0) {
  console.error(`Playable match engine verification failed: ${failures}/${count}`);
  process.exit(1);
}

console.log(`Playable match engine verification passed (${count} runs)`);
