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
  FORBIDDEN_F11_EVENT_TYPES,
  getStandardBalanceConfig,
} from '../../index.js';
import { buildTestSimulationInput } from './fixture.js';

describe('F11 match engine RNG', () => {
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
    const rng = createRng('weights');
    const first = weightedPick(rng, { F1: 0.3, F2: 0.7 });
    const second = weightedPick(createRng('weights'), { F1: 0.3, F2: 0.7 });
    expect(first.value).toBe(second.value);
  });

  it('rejects invalid weights and probabilities', () => {
    expect(() => weightedPick(createRng(1), {} as never)).toThrow();
    expect(() => chance(createRng(1), 1.5)).toThrow();
    expect(() => nextInt(createRng(1), 5, 2)).toThrow();
  });
});

describe('F11 simulation input', () => {
  it('accepts valid fixture input', () => {
    expect(() => validateSimulationInput(buildTestSimulationInput())).not.toThrow();
  });

  it('rejects same team and incompatible balance', () => {
    const input = buildTestSimulationInput();
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

describe('F11 regulation simulation', () => {
  it('runs three periods and ends 0-0 with allowed events only', () => {
    const input = buildTestSimulationInput('f11-reg-001');
    const result = simulateRegulation(input);
    expect(result.finalState.simulationStatus).toBe('REGULATION_COMPLETE');
    expect(result.finalState.score).toEqual({ home: 0, away: 0 });
    expect(result.events[0]?.type).toBe('MATCH_START');
    expect(result.events.at(-1)?.type).toBe('REGULATION_END');
    expect(result.events.filter((e) => e.type === 'PERIOD_START')).toHaveLength(3);
    expect(result.events.filter((e) => e.type === 'PERIOD_END')).toHaveLength(3);
    for (const ev of result.events) {
      expect(FORBIDDEN_F11_EVENT_TYPES as readonly string[]).not.toContain(ev.type);
    }
    expect(result.diagnostics.safetyLimitHit).toBe(false);
  });

  it('is deterministic for same seed', () => {
    const a = simulateRegulation(buildTestSimulationInput('det-001'));
    const b = simulateRegulation(buildTestSimulationInput('det-001'));
    expect(a.diagnostics.traceHash).toBe(b.diagnostics.traceHash);
    expect(a.events.length).toBe(b.events.length);
  });

  it('differs by seed', () => {
    const a = simulateRegulation(buildTestSimulationInput('seed-one'));
    const b = simulateRegulation(buildTestSimulationInput('seed-two'));
    expect(a.diagnostics.traceHash).not.toBe(b.diagnostics.traceHash);
  });

  it('pause/resume matches full run', () => {
    const input = buildTestSimulationInput('resume-001');
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
  });

  it('rejects incompatible snapshot metadata', () => {
    const input = buildTestSimulationInput('snap-001');
    const state = createInitialMatchState(input);
    const snap = serializeMatchSnapshot(input, state, []);
    expect(() => restoreMatchSnapshot({ ...snap, balanceHash: 'wrong' }, input)).toThrow(InvalidSnapshotError);
  });

  it('clock stays within period bounds', () => {
    const result = simulateRegulation(buildTestSimulationInput('clock-001'));
    for (const ev of result.events) {
      expect(ev.elapsedSeconds).toBeGreaterThanOrEqual(0);
      expect(ev.elapsedSeconds).toBeLessThanOrEqual(1200);
      expect(Number.isInteger(ev.elapsedSeconds)).toBe(true);
    }
  });
});

describe('F11 invariant batch', () => {
  it('terminates for 100 seeded runs without forbidden events', () => {
    for (let i = 0; i < 100; i += 1) {
      const result = simulateRegulation(buildTestSimulationInput(`batch-${i}`));
      expect(result.finalState.simulationStatus).toBe('REGULATION_COMPLETE');
      expect(result.diagnostics.safetyLimitHit).toBe(false);
      for (const ev of result.events) {
        expect(FORBIDDEN_F11_EVENT_TYPES as readonly string[]).not.toContain(ev.type);
      }
    }
  });
});

describe('F11 safety limit', () => {
  it('fails when safety limit is tiny', () => {
    const input = buildTestSimulationInput('unsafe');
    if (input.balance.snapshot.match.active) {
      input.balance.snapshot.match.eventSafetyLimit = 5;
    }
    expect(() => simulateRegulation(input)).toThrow(SafetyLimitExceededError);
  });
});
