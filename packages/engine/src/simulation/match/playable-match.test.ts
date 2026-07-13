import { describe, expect, it } from 'vitest';
import {
  simulateCompleteMatch,
  simulateStep,
  computeTraceHash,
  F14_SIMULATION_MODE,
  FORBIDDEN_F14_EVENT_TYPES,
} from '../../index.js';
import { buildTestSimulationInput } from './fixture.js';

function findSeed(
  predicate: (seed: string) => boolean,
  prefix: string,
  max = 500,
): string | null {
  for (let i = 0; i < max; i += 1) {
    const seed = `${prefix}-${i}`;
    if (predicate(seed)) return seed;
  }
  return null;
}

describe('F14 playable match', () => {
  it('uses F14 mode and v5 balance in default fixture', () => {
    const input = buildTestSimulationInput();
    expect(input.simulationMode).toBe(F14_SIMULATION_MODE);
    expect(input.balance.snapshot.schemaVersion).toBeGreaterThanOrEqual(5);
    expect(input.completionRules?.overtimeEnabled).toBe(true);
  });

  it('regulation win ends with MATCH_END and no overtime', () => {
    const seed =
      findSeed((s) => {
        const r = simulateCompleteMatch(buildTestSimulationInput(s));
        return r.finalResult.decisionType === 'REGULATION';
      }, 'f14-reg-win') ?? 'f14-reg-win-0';

    const result = simulateCompleteMatch(buildTestSimulationInput(seed));
    expect(result.finalState.simulationStatus).toBe('MATCH_COMPLETE');
    expect(result.events.at(-1)?.type).toBe('MATCH_END');
    expect(result.finalResult.decisionType).toBe('REGULATION');
    expect(result.events.some((e) => e.type === 'OVERTIME_START')).toBe(false);
    expect(result.events.some((e) => e.type === 'SHOOTOUT_START')).toBe(false);
    expect(result.reconciliation.ok).toBe(true);
  });

  it('tied regulation with OT can end via overtime decision', () => {
    const seed =
      findSeed((s) => {
        const r = simulateCompleteMatch(buildTestSimulationInput(s));
        return r.finalResult.decisionType === 'OVERTIME';
      }, 'f14-ot-win') ?? null;

    expect(seed).not.toBeNull();
    const result = simulateCompleteMatch(buildTestSimulationInput(seed!));
    expect(result.events.some((e) => e.type === 'OVERTIME_START')).toBe(true);
    expect(result.finalResult.decisionType).toBe('OVERTIME');
    expect(result.finalResult.overtimeScore.home + result.finalResult.overtimeScore.away).toBeGreaterThan(
      0,
    );
    expect(result.finalResult.winnerSide).not.toBeNull();
  });

  it('tied after OT can be decided by shootout', () => {
    const seed =
      findSeed((s) => {
        const r = simulateCompleteMatch(buildTestSimulationInput(s));
        return r.finalResult.decisionType === 'SHOOTOUT';
      }, 'f14-so-win') ?? null;

    expect(seed).not.toBeNull();
    const result = simulateCompleteMatch(buildTestSimulationInput(seed!));
    expect(result.events.some((e) => e.type === 'SHOOTOUT_START')).toBe(true);
    expect(result.events.some((e) => e.type === 'SHOOTOUT_ATTEMPT')).toBe(true);
    expect(result.finalResult.decisionType).toBe('SHOOTOUT');
    expect(result.finalResult.winnerSide).not.toBeNull();
    expect(result.finalResult.displayScore.home).toBe(result.finalResult.displayScore.away);
  });

  it('shootout goals are not counted in player goal totals', () => {
    const seed =
      findSeed((s) => {
        const r = simulateCompleteMatch(buildTestSimulationInput(s));
        return r.finalResult.decisionType === 'SHOOTOUT';
      }, 'f14-so-stats') ?? null;

    expect(seed).not.toBeNull();
    const result = simulateCompleteMatch(buildTestSimulationInput(seed!));
    const skaterGoals = result.statistics.skaters.reduce((n, s) => n + s.goals, 0);
    const teamGoals = result.statistics.home.goals + result.statistics.away.goals;
    expect(skaterGoals).toBe(teamGoals);
    expect(teamGoals).toBe(
      result.finalResult.regulationScore.home +
        result.finalResult.regulationScore.away +
        result.finalResult.overtimeScore.home +
        result.finalResult.overtimeScore.away,
    );
    expect(result.statistics.home.shootoutGoals + result.statistics.away.shootoutGoals).toBeGreaterThan(
      0,
    );
  });

  it('is deterministic for the same seed', () => {
    const a = simulateCompleteMatch(buildTestSimulationInput('f14-det-001'));
    const b = simulateCompleteMatch(buildTestSimulationInput('f14-det-001'));
    expect(a.diagnostics.traceHash).toBe(b.diagnostics.traceHash);
    expect(a.finalResult).toEqual(b.finalResult);
  });

  it('pause/resume through overtime matches full run when OT occurs', () => {
    const seed =
      findSeed((s) => {
        const r = simulateCompleteMatch(buildTestSimulationInput(s));
        return r.events.some((e) => e.type === 'OVERTIME_START');
      }, 'f14-ot-resume') ?? null;

    if (!seed) return;

    const input = buildTestSimulationInput(seed);
    const full = simulateCompleteMatch(input);
    let snap = null;
    let events: typeof full.events = [];
    let completed = false;
    while (!completed) {
      const step = simulateStep(input, snap, 'NEXT_EVENT');
      snap = step.snapshot;
      events = [...events, ...step.events];
      completed = step.completed;
    }
    expect(computeTraceHash(events)).toBe(full.diagnostics.traceHash);
  });

  it('does not emit forbidden F14-deferred events', () => {
    const result = simulateCompleteMatch(buildTestSimulationInput('f14-forbidden-check'));
    for (const ev of result.events) {
      expect(FORBIDDEN_F14_EVENT_TYPES as readonly string[]).not.toContain(ev.type);
    }
  });
});
