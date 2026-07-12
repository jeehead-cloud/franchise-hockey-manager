import {
  simulateRegulation,
  simulateStep,
  type EventDetailLevel,
  type MatchEvent,
  type MatchSnapshot,
  type StepMode,
  InvalidSnapshotError,
  InvalidSimulationInputError,
  IncompatibleBalanceConfigError,
  SafetyLimitExceededError,
  IllegalStateTransitionError,
  SimulationError,
} from '@fhm/engine';
import { buildSimulationInput, SimulationHttpError } from './simulation-input.js';

export function isSimulationDebugEnabled(): boolean {
  if (process.env.NODE_ENV === 'test') return true;
  if (process.env.NODE_ENV === 'development') {
    return process.env.FHM_SIMULATION_DEBUG_ENABLED !== 'false';
  }
  return process.env.FHM_SIMULATION_DEBUG_ENABLED === 'true';
}

function mapSimulationError(err: unknown): SimulationHttpError {
  if (err instanceof SimulationHttpError) return err;
  if (err instanceof InvalidSnapshotError) {
    return new SimulationHttpError(422, 'InvalidSnapshot', err.message);
  }
  if (err instanceof InvalidSimulationInputError) {
    return new SimulationHttpError(422, 'InvalidSimulationInput', err.message);
  }
  if (err instanceof IncompatibleBalanceConfigError) {
    return new SimulationHttpError(409, 'IncompatibleBalanceConfiguration', err.message);
  }
  if (err instanceof SafetyLimitExceededError || err instanceof IllegalStateTransitionError) {
    return new SimulationHttpError(500, 'SimulationFailed', err.message);
  }
  if (err instanceof SimulationError) {
    return new SimulationHttpError(500, 'SimulationFailed', err.message);
  }
  return new SimulationHttpError(500, 'SimulationFailed', 'Simulation failed');
}

const MAX_FULL_EVENTS = 5000;

function summarizeEvents(events: MatchEvent[]) {
  return {
    total: events.length,
    sample: events.slice(-25),
    byType: events.reduce<Record<string, number>>((acc, e) => {
      acc[e.type] = (acc[e.type] ?? 0) + 1;
      return acc;
    }, {}),
  };
}

function filterEvents(events: MatchEvent[], detail: EventDetailLevel): MatchEvent[] | undefined {
  if (detail === 'NONE') return undefined;
  if (detail === 'SUMMARY') return events.slice(-50);
  if (events.length > MAX_FULL_EVENTS) {
    throw new SimulationHttpError(400, 'InvalidSimulationRequest', `FULL event detail exceeds ${MAX_FULL_EVENTS} events`);
  }
  return events;
}

export async function runTechnicalRegulation(opts: {
  homeTeamId: string;
  awayTeamId: string;
  seed: string | number;
  eventDetail?: EventDetailLevel;
}) {
  const input = await buildSimulationInput(opts);
  try {
    const result = simulateRegulation(input);
    const detail = opts.eventDetail ?? 'SUMMARY';
    return {
      metadata: result.metadata,
      finalState: result.finalState,
      diagnostics: result.diagnostics,
      events: filterEvents(result.events, detail),
      eventSummary: detail === 'NONE' ? summarizeEvents(result.events) : undefined,
      notice: 'Technical F11 simulation complete. Scoring is not implemented; regulation score remains 0-0.',
    };
  } catch (err) {
    throw mapSimulationError(err);
  }
}

export async function runTechnicalStep(opts: {
  homeTeamId: string;
  awayTeamId: string;
  seed: string | number;
  stepMode: StepMode;
  snapshot?: MatchSnapshot | null;
  eventDetail?: EventDetailLevel;
}) {
  const input = await buildSimulationInput(opts);
  try {
    const step = simulateStep(input, opts.snapshot ?? null, opts.stepMode);
    const detail = opts.eventDetail ?? 'SUMMARY';
    return {
      metadata: {
        engineVersion: input.engineVersion,
        balancePresetId: input.balance.presetId,
        balanceVersionId: input.balance.versionId,
        balanceVersionNumber: input.balance.versionNumber,
        balanceHash: input.balance.configHash,
        seed: input.seed,
        inputFingerprint: input.inputFingerprint,
        simulationMode: input.simulationMode,
      },
      state: step.state,
      snapshot: step.snapshot,
      diagnostics: step.diagnostics,
      events: filterEvents(step.events, detail),
      completed: step.completed,
      notice: 'Technical F11 step simulation. Scoring is not implemented.',
    };
  } catch (err) {
    throw mapSimulationError(err);
  }
}

export function assertSimulationDebugEnabled(): void {
  if (!isSimulationDebugEnabled()) {
    throw new SimulationHttpError(
      503,
      'SimulationDebugDisabled',
      'Simulation debug endpoints are disabled in this environment',
    );
  }
}
