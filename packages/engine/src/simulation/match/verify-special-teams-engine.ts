import {
  simulateRegulation,
  FORBIDDEN_F14_EVENT_TYPES,
  SUPPORTED_STRENGTH_STATES,
} from '../../index.js';
import { buildTestSimulationInput } from './fixture.js';

const count = Number(process.env.FHM_SPECIAL_TEAMS_VERIFY_COUNT ?? 500);

let failures = 0;
let reconciliationFailures = 0;
let illegalStateFailures = 0;
let replayFailures = 0;
let totalGoals = 0;
let totalShotsOnGoal = 0;
let totalPenalties = 0;
let totalPpOpportunities = 0;
let totalPpGoals = 0;
let totalPkKills = 0;
let totalShGoals = 0;

for (let i = 0; i < count; i += 1) {
  const seed = `st-verify-${i}`;
  try {
    const input = buildTestSimulationInput(seed, { mode: 'F13' });
    const result = simulateRegulation(input);
    if (result.finalState.simulationStatus !== 'REGULATION_COMPLETE') {
      console.error(`Run ${i}: did not complete`);
      failures += 1;
      continue;
    }
    if (result.diagnostics.safetyLimitHit) {
      console.error(`Run ${i}: safety limit hit`);
      failures += 1;
    }
    if (!result.reconciliation.ok) {
      reconciliationFailures += 1;
      failures += 1;
    }
    for (const ev of result.events) {
      if ((FORBIDDEN_F14_EVENT_TYPES as readonly string[]).includes(ev.type)) {
        console.error(`Run ${i}: forbidden event ${ev.type}`);
        illegalStateFailures += 1;
        failures += 1;
        break;
      }
      if (!(SUPPORTED_STRENGTH_STATES as readonly string[]).includes(ev.strengthState)) {
        console.error(`Run ${i}: unsupported strength ${ev.strengthState}`);
        illegalStateFailures += 1;
        failures += 1;
        break;
      }
    }

    // No overlapping active penalties: at most one PENALTY without end before next PENALTY
    let open = 0;
    for (const ev of result.events) {
      if (ev.type === 'PENALTY') {
        if (open > 0) {
          illegalStateFailures += 1;
          failures += 1;
          break;
        }
        open = 1;
      }
      if (ev.type === 'PENALTY_EXPIRED') open = 0;
      if (ev.type === 'GOAL' && ev.details.penaltyEndedByGoal) open = 0;
      if (ev.type === 'REGULATION_END' && ev.details.openPenaltyResolvedAsKill) open = 0;
    }

    const replay = simulateRegulation(buildTestSimulationInput(seed, { mode: 'F13' }));
    if (replay.diagnostics.traceHash !== result.diagnostics.traceHash) {
      replayFailures += 1;
      failures += 1;
    }

    totalGoals += result.finalState.score.home + result.finalState.score.away;
    totalShotsOnGoal += result.statistics.home.shotsOnGoal + result.statistics.away.shotsOnGoal;
    totalPenalties += result.statistics.home.penalties + result.statistics.away.penalties;
    totalPpOpportunities +=
      result.statistics.home.powerPlayOpportunities + result.statistics.away.powerPlayOpportunities;
    totalPpGoals += result.statistics.home.powerPlayGoals + result.statistics.away.powerPlayGoals;
    totalPkKills += result.statistics.home.penaltyKills + result.statistics.away.penaltyKills;
    totalShGoals +=
      result.statistics.home.shortHandedGoals + result.statistics.away.shortHandedGoals;
  } catch (err) {
    console.error(`Run ${i}: threw`, err);
    failures += 1;
  }
}

const games = count;
const ppPct = totalPpOpportunities > 0 ? totalPpGoals / totalPpOpportunities : 0;
const pkPct = totalPpOpportunities > 0 ? totalPkKills / totalPpOpportunities : 0;

console.log('F13 special-teams engine verification summary');
console.log(`  games: ${games}`);
console.log(`  goals/game: ${(totalGoals / games).toFixed(3)}`);
console.log(`  shots on goal/game: ${(totalShotsOnGoal / games).toFixed(2)}`);
console.log(`  penalties/game: ${(totalPenalties / games).toFixed(3)}`);
console.log(`  PP opportunities/game: ${(totalPpOpportunities / games).toFixed(3)}`);
console.log(`  PP%: ${(ppPct * 100).toFixed(2)}%`);
console.log(`  PK%: ${(pkPct * 100).toFixed(2)}%`);
console.log(`  short-handed goals: ${totalShGoals}`);
console.log(`  reconciliation failures: ${reconciliationFailures}`);
console.log(`  illegal-state failures: ${illegalStateFailures}`);
console.log(`  deterministic replay failures: ${replayFailures}`);

if (failures > 0) {
  console.error(`Special-teams engine verification failed: ${failures}/${count}`);
  process.exit(1);
}

if (totalPenalties === 0) {
  console.error('No penalties observed — penalty pipeline may be broken');
  process.exit(1);
}

console.log(`Special-teams engine verification passed (${count} runs)`);
