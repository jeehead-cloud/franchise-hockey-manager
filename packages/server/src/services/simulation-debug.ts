import {
  simulateRegulation,
  simulateStep,
  type EventDetailLevel,
  type MatchEvent,
  type MatchSnapshot,
  type MatchStatistics,
  type ReconciliationResult,
  type SimulationDiagnostics,
  type SimulationInput,
  type SimulationResult,
  type StepMode,
  InvalidSnapshotError,
  InvalidSimulationInputError,
  IncompatibleBalanceConfigError,
  SafetyLimitExceededError,
  IllegalStateTransitionError,
  SimulationError,
  StatisticsReconciliationError,
} from '@fhm/engine';
import { buildSimulationInput, SimulationHttpError } from './simulation-input.js';

export interface TechnicalRegulationResponse {
  metadata: SimulationResult['metadata'];
  finalState: SimulationResult['finalState'];
  diagnostics: SimulationResult['diagnostics'];
  statistics: MatchStatistics;
  reconciliation: ReconciliationResult;
  periodScores: SimulationResult['periodScores'];
  playerDirectory: Record<string, { firstName: string; lastName: string; teamId: string }>;
  events?: MatchEvent[];
  eventSummary?: { total: number; byType: Record<string, number> };
  eventsTruncated?: boolean;
  totalEventCount: number;
  notice: string;
}

export interface TechnicalStepResponse {
  metadata: {
    engineVersion: string;
    balancePresetId: string;
    balanceVersionId: string;
    balanceVersionNumber: number;
    balanceHash: string;
    seed: string | number;
    inputFingerprint: string;
    simulationMode: string;
  };
  state: MatchSnapshot['state'];
  snapshot: MatchSnapshot;
  diagnostics: SimulationDiagnostics;
  playerDirectory: Record<string, { firstName: string; lastName: string; teamId: string }>;
  events?: MatchEvent[];
  completed: boolean;
  notice: string;
}

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
  if (err instanceof StatisticsReconciliationError) {
    return new SimulationHttpError(500, 'StatisticsReconciliationFailed', err.message);
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

function buildPlayerDirectory(input: SimulationInput) {
  const directory: Record<string, { firstName: string; lastName: string; teamId: string }> = {};
  for (const team of [input.homeTeam, input.awayTeam]) {
    for (const p of team.players) {
      directory[p.playerId] = {
        firstName: p.firstName,
        lastName: p.lastName,
        teamId: team.teamId,
      };
    }
  }
  return directory;
}

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

function filterEvents(events: MatchEvent[], detail: EventDetailLevel) {
  if (detail === 'NONE') return undefined;
  if (detail === 'SUMMARY') {
    const scoring = events.filter((e) =>
      ['GOAL', 'SAVE', 'SHOT', 'SHOT_BLOCKED', 'SHOT_MISSED', 'PENALTY', 'PENALTY_EXPIRED'].includes(e.type),
    );
    const head = events.slice(0, 10);
    const tail = events.slice(-40);
    const merged = [...head, ...scoring.slice(-20), ...tail];
    const seen = new Set<number>();
    const unique = merged.filter((e) => {
      if (seen.has(e.index)) return false;
      seen.add(e.index);
      return true;
    });
    unique.sort((a, b) => a.index - b.index);
    return unique;
  }
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
}): Promise<TechnicalRegulationResponse> {
  const input = await buildSimulationInput(opts);
  try {
    const result = simulateRegulation(input);
    const detail = opts.eventDetail ?? 'SUMMARY';
    return {
      metadata: result.metadata,
      finalState: result.finalState,
      diagnostics: result.diagnostics,
      statistics: result.statistics,
      reconciliation: result.reconciliation,
      periodScores: result.periodScores,
      playerDirectory: buildPlayerDirectory(input),
      events: filterEvents(result.events, detail),
      eventSummary: detail === 'NONE' ? summarizeEvents(result.events) : undefined,
      eventsTruncated: detail === 'SUMMARY' && result.events.length > 50,
      totalEventCount: result.events.length,
      notice:
        'Technical F13 special-teams simulation with regulation scoring and basic 5v4 power plays. Overtime, shootout, coincidental penalties, and persistence are not implemented.',
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
}): Promise<TechnicalStepResponse> {
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
      playerDirectory: buildPlayerDirectory(input),
      events: filterEvents(step.events, detail),
      completed: step.completed,
      notice: 'Technical F13 step simulation with special teams.',
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
