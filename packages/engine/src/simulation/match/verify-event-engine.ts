import { simulateRegulation, FORBIDDEN_F13_EVENT_TYPES } from '../../index.js';
import { buildTestSimulationInput } from './fixture.js';

const count = Number(process.env.FHM_EVENT_ENGINE_VERIFY_COUNT ?? 200);
let failures = 0;

for (let i = 0; i < count; i += 1) {
  try {
    const result = simulateRegulation(buildTestSimulationInput(`verify-${i}`, { mode: 'F13' }));
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
      console.error(`Run ${i}: reconciliation failed`);
      failures += 1;
    }
    for (const ev of result.events) {
      if ((FORBIDDEN_F13_EVENT_TYPES as readonly string[]).includes(ev.type)) {
        console.error(`Run ${i}: forbidden event ${ev.type}`);
        failures += 1;
        break;
      }
    }
  } catch (err) {
    console.error(`Run ${i}: threw`, err);
    failures += 1;
  }
}

if (failures > 0) {
  console.error(`Event engine verification failed: ${failures}/${count}`);
  process.exit(1);
}

console.log(`Event engine verification passed (${count} runs)`);
