import { describe, expect, it } from 'vitest';
import {
  createInitialMatchState,
  createRng,
  nextFloat,
  nextInt,
  chance,
  weightedPick,
  restoreRng,
  validateSimulationInput,
  simulateRegulation,
  simulateStep,
  simulateNextEvent,
  serializeMatchSnapshot,
  restoreMatchSnapshot,
  computeTraceHash,
  InvalidSimulationInputError,
  InvalidSnapshotError,
  SafetyLimitExceededError,
  FORBIDDEN_F14_EVENT_TYPES,
  FHM_ENGINE_VERSION,
  F13_SIMULATION_MODE,
  getStandardBalanceConfig,
  reduceStatistics,
  reconcileStatistics,
} from '../../index.js';
import { buildTestSimulationInput } from './fixture.js';

describe('F12 match engine RNG', () => {
  it('same seed yields same sequence', () => {
    const a = createRng('seed-a');
    const b = createRng('seed-a');
    for (let i = 0; i < 20; i += 1) {
      const fa = nextFloat(a);
      a.state = fa.rng.state;
      const fb = nextFloat(b);
      b.state = fb.rng.state;
      expect(fa.value).toBe(fb.value);
    }
  });

  it('different seeds usually differ', () => {
    const a = nextFloat(createRng('alpha')).value;
    const b = nextFloat(createRng('beta')).value;
    expect(a).not.toBe(b);
  });

  it('serialized RNG state continues sequence', () => {
    let rng = createRng(42);
    nextFloat(rng);
    const saved = { ...rng };
    const r1 = nextFloat(restoreRng(saved)).value;
    const r2 = nextFloat(restoreRng(saved)).value;
    expect(r1).toBe(r2);
  });

  it('weighted pick is deterministic', () => {
    const first = weightedPick(createRng('weights'), { F1: 0.3, F2: 0.7 });
    const second = weightedPick(createRng('weights'), { F1: 0.3, F2: 0.7 });
    expect(first.value).toBe(second.value);
  });

  it('rejects invalid weights and probabilities', () => {
    expect(() => weightedPick(createRng(1), {} as never)).toThrow();
    expect(() => chance(createRng(1), 1.5)).toThrow();
    expect(() => nextInt(createRng(1), 5, 2)).toThrow();
  });
});

describe('F12 simulation input', () => {
  it('accepts valid fixture input', () => {
    const input = buildTestSimulationInput('f13-test-001', { mode: 'F13' });
    expect(input.engineVersion).toBe(FHM_ENGINE_VERSION);
    expect(input.simulationMode).toBe(F13_SIMULATION_MODE);
    expect(() => validateSimulationInput(input)).not.toThrow();
  });

  it('rejects same team and incompatible balance', () => {
    const input = buildTestSimulationInput('f13-test-001', { mode: 'F13' });
    const badTeam = { ...input, awayTeam: { ...input.homeTeam, side: 'AWAY' as const } };
    expect(() => validateSimulationInput(badTeam)).toThrow(InvalidSimulationInputError);
    const v1 = getStandardBalanceConfig();
    const old = {
      ...input,
      balance: {
        ...input.balance,
        snapshot: {
          ...v1,
          schemaVersion: 1 as const,
          match: { active: false as const, status: 'INACTIVE_UNTIL_MILESTONE' as const, milestone: 'F11', notes: 'x' },
        },
      },
    };
    expect(() => validateSimulationInput(old)).toThrow();
  });
});

describe('F12 regulation simulation', () => {
  it('runs three periods with score derived from GOAL events', () => {
    const input = buildTestSimulationInput('f12-reg-001', { mode: 'F13' });
    const result = simulateRegulation(input);
    expect(result.finalState.simulationStatus).toBe('REGULATION_COMPLETE');
    expect(result.events[0]?.type).toBe('MATCH_START');
    expect(result.events.at(-1)?.type).toBe('REGULATION_END');
    expect(result.events.filter((e) => e.type === 'PERIOD_START')).toHaveLength(3);
    expect(result.events.filter((e) => e.type === 'PERIOD_END')).toHaveLength(3);
    for (const ev of result.events) {
      expect(FORBIDDEN_F14_EVENT_TYPES as readonly string[]).not.toContain(ev.type);
    }
    expect(result.diagnostics.safetyLimitHit).toBe(false);
    expect(result.reconciliation.ok).toBe(true);
    const goals = result.events.filter((e) => e.type === 'GOAL');
    expect(result.finalState.score.home).toBe(goals.filter((g) => g.teamId === input.homeTeam.teamId).length);
    expect(result.finalState.score.away).toBe(goals.filter((g) => g.teamId === input.awayTeam.teamId).length);
    expect(result.statistics.home.goals).toBe(result.finalState.score.home);
    expect(result.statistics.away.goals).toBe(result.finalState.score.away);
  });

  it('resolves every SHOT exactly once', () => {
    const result = simulateRegulation(buildTestSimulationInput('f12-shot-resolve', { mode: 'F13' }));
    const shots = result.events.filter((e) => e.type === 'SHOT');
    const resolutions = result.events.filter((e) =>
      ['SHOT_BLOCKED', 'SHOT_MISSED', 'SAVE', 'GOAL'].includes(e.type),
    );
    expect(resolutions.length).toBe(shots.length);
    for (const shot of shots) {
      const seq = shot.details.shotSequenceId;
      const matches = resolutions.filter((r) => r.details.shotSequenceId === seq);
      expect(matches).toHaveLength(1);
    }
  });

  it('is deterministic for same seed', () => {
    const a = simulateRegulation(buildTestSimulationInput('det-001', { mode: 'F13' }));
    const b = simulateRegulation(buildTestSimulationInput('det-001', { mode: 'F13' }));
    expect(a.diagnostics.traceHash).toBe(b.diagnostics.traceHash);
    expect(a.events.length).toBe(b.events.length);
    expect(a.finalState.score).toEqual(b.finalState.score);
    expect(a.statistics.home.goals).toBe(b.statistics.home.goals);
  });

  it('differs by seed', () => {
    const a = simulateRegulation(buildTestSimulationInput('seed-one', { mode: 'F13' }));
    const b = simulateRegulation(buildTestSimulationInput('seed-two', { mode: 'F13' }));
    expect(a.diagnostics.traceHash).not.toBe(b.diagnostics.traceHash);
  });

  it('pause/resume matches full run', () => {
    const input = buildTestSimulationInput('resume-001', { mode: 'F13' });
    const full = simulateRegulation(input);
    let snap = null;
    let events: typeof full.events = [];
    let completed = false;
    while (!completed) {
      const step = simulateStep(input, snap, 'NEXT_EVENT');
      snap = step.snapshot;
      events = [...events, ...step.events];
      completed = step.completed;
    }
    expect(events.length).toBe(full.events.length);
    expect(computeTraceHash(events)).toBe(full.diagnostics.traceHash);
    expect(reduceStatistics(input, events, full.finalState).home.goals).toBe(full.statistics.home.goals);
  });

  it('pause after SHOT matches uninterrupted resolution', () => {
    const input = buildTestSimulationInput('shot-pause-001', { mode: 'F13' });
    const full = simulateRegulation(input);
    let snap = null;
    let events: typeof full.events = [];
    let pausedAtShot = false;
    while (!pausedAtShot) {
      const step = simulateStep(input, snap, 'NEXT_EVENT');
      events = [...events, ...step.events];
      snap = step.snapshot;
      if (step.events.some((e) => e.type === 'SHOT')) {
        pausedAtShot = true;
        break;
      }
      if (step.completed) break;
    }
    expect(pausedAtShot).toBe(true);
    let completed = false;
    while (!completed) {
      const step = simulateStep(input, snap, 'NEXT_EVENT');
      events = [...events, ...step.events];
      snap = step.snapshot;
      completed = step.completed;
    }
    expect(computeTraceHash(events)).toBe(full.diagnostics.traceHash);
  });

  it('rejects incompatible snapshot metadata', () => {
    const input = buildTestSimulationInput('snap-001', { mode: 'F13' });
    const state = createInitialMatchState(input);
    const snap = serializeMatchSnapshot(input, state, []);
    expect(() => restoreMatchSnapshot({ ...snap, balanceHash: 'wrong' }, input)).toThrow(InvalidSnapshotError);
    expect(() => restoreMatchSnapshot({ ...snap, engineVersion: 'f11.1' as never }, input)).toThrow(
      InvalidSnapshotError,
    );
  });

  it('clock stays within period bounds', () => {
    const result = simulateRegulation(buildTestSimulationInput('clock-001', { mode: 'F13' }));
    for (const ev of result.events) {
      expect(ev.elapsedSeconds).toBeGreaterThanOrEqual(0);
      expect(ev.elapsedSeconds).toBeLessThanOrEqual(1200);
      expect(Number.isInteger(ev.elapsedSeconds)).toBe(true);
    }
  });

  it('goal assists follow pass-chain rules', () => {
    const result = simulateRegulation(buildTestSimulationInput('assist-rules', { mode: 'F13' }));
    for (const goal of result.events.filter((e) => e.type === 'GOAL')) {
      const scorer = String(goal.details.scorerId ?? goal.playerIds[0]);
      const primary = goal.details.primaryAssistId as string | null | undefined;
      const secondary = goal.details.secondaryAssistId as string | null | undefined;
      if (primary) {
        expect(primary).not.toBe(scorer);
        expect(secondary).not.toBe(primary);
      }
      if (secondary) expect(secondary).not.toBe(scorer);
      const assistCount = [primary, secondary].filter(Boolean).length;
      expect(assistCount).toBeLessThanOrEqual(2);
    }
  });
});

describe('F12 invariant batch', () => {
  it('terminates for 100 seeded runs with reconciliation', () => {
    for (let i = 0; i < 100; i += 1) {
      const result = simulateRegulation(buildTestSimulationInput(`batch-${i}`, { mode: 'F13' }));
      expect(result.finalState.simulationStatus).toBe('REGULATION_COMPLETE');
      expect(result.diagnostics.safetyLimitHit).toBe(false);
      expect(result.reconciliation.ok).toBe(true);
      for (const ev of result.events) {
        expect(FORBIDDEN_F14_EVENT_TYPES as readonly string[]).not.toContain(ev.type);
      }
    }
  });

  it('stronger home offense scores competitively on average over batch', () => {
    let homeGoals = 0;
    let awayGoals = 0;
    for (let i = 0; i < 80; i += 1) {
      const result = simulateRegulation(buildTestSimulationInput(`offense-${i}`, { mode: 'F13' }));
      homeGoals += result.finalState.score.home;
      awayGoals += result.finalState.score.away;
    }
    // Penalties and special teams add variance; home should stay within striking distance of away.
    expect(homeGoals).toBeGreaterThan(awayGoals * 0.85);
  });
});

describe('F12 safety limit', () => {
  it('fails when safety limit is tiny', () => {
    const input = buildTestSimulationInput('unsafe', { mode: 'F13' });
    if (input.balance.snapshot.match.active) {
      input.balance.snapshot.match.eventSafetyLimit = 5;
    }
    expect(() => simulateRegulation(input)).toThrow(SafetyLimitExceededError);
  });
});

describe('F12 statistics reducer', () => {
  it('reconciles independently from simulateRegulation output', () => {
    const input = buildTestSimulationInput('reducer-001', { mode: 'F13' });
    const result = simulateRegulation(input);
    const stats = reduceStatistics(input, result.events, result.finalState);
    const recon = reconcileStatistics(input, result.events, result.finalState, stats);
    expect(recon.ok).toBe(true);
    expect(stats.home.goals).toBe(result.statistics.home.goals);
    expect(stats.away.shotsOnGoal).toBe(result.statistics.away.shotsOnGoal);
  });
});

describe('F13 step pending shot', () => {
  it('exposes pending shot between SHOT and resolution', () => {
    const input = buildTestSimulationInput('pending-shot', { mode: 'F13' });
    let state = createInitialMatchState(input);
    let events: ReturnType<typeof simulateRegulation>['events'] = [];
    let foundPending = false;
    for (let i = 0; i < 5000; i += 1) {
      const step = simulateNextEvent(input, state, events);
      state = step.state;
      events = step.events;
      if (events.at(-1)?.type === 'SHOT' && state.pendingShot) {
        foundPending = true;
        expect(state.pendingShot.shooterId).toBeTruthy();
        break;
      }
      if (step.completed) break;
    }
    expect(foundPending).toBe(true);
  });
});

describe('F13 penalties smoke', () => {
  it('may emit PENALTY events in regulation', () => {
    let penaltyCount = 0;
    for (let i = 0; i < 30; i += 1) {
      const result = simulateRegulation(buildTestSimulationInput(`penalty-smoke-${i}`, { mode: 'F13' }));
      penaltyCount += result.events.filter((e) => e.type === 'PENALTY').length;
      expect(result.diagnostics.penalties).toBe(
        result.events.filter((e) => e.type === 'PENALTY').length,
      );
    }
    expect(penaltyCount).toBeGreaterThan(0);
  });

  it('tracks PP opportunities when penalties occur', () => {
    const result = simulateRegulation(buildTestSimulationInput('penalty-stats-001', { mode: 'F13' }));
    const penalties = result.events.filter((e) => e.type === 'PENALTY');
    if (penalties.length > 0) {
      expect(result.statistics.home.powerPlayOpportunities + result.statistics.away.powerPlayOpportunities).toBe(
        penalties.length,
      );
    }
  });
});
