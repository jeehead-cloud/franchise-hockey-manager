import { describe, expect, it } from 'vitest';
import {
  ageOnEffectiveDate,
  assertReconciliation,
  calculateDevelopmentBudget,
  developPlayer,
  developPlayers,
  evaluateRetirement,
  getDefaultPlayerDevelopmentConfig,
  hashPlayerDevelopmentConfig,
  reconcileDevelopmentResults,
  updateAnnualForm,
  validatePlayerDevelopmentConfig,
} from './index.js';
import type { DevelopmentPlayerInput } from './types.js';

function skater(overrides: Partial<DevelopmentPlayerInput> = {}): DevelopmentPlayerInput {
  return {
    playerId: 'skater-1',
    playerType: 'SKATER',
    birthDate: '2005-01-15',
    position: 'C',
    currentRole: 'PLAYMAKER',
    lifecycleStatus: 'ACTIVE',
    currentTeamId: 'team-1',
    currentTeamName: 'Test FC',
    currentAbility: 50,
    potentialCeiling: 80,
    potentialFloor: 40,
    form: 4,
    attributes: {
      stickhandling: 12,
      shooting: 11,
      passing: 13,
      strength: 10,
      speed: 12,
      balance: 11,
      aggression: 9,
      offensiveAwareness: 12,
      defensiveAwareness: 10,
    },
    contractStatus: 'UNKNOWN',
    sourceType: 'GENERATED',
    developmentRate: 1,
    ...overrides,
  };
}

function goalie(overrides: Partial<DevelopmentPlayerInput> = {}): DevelopmentPlayerInput {
  return {
    playerId: 'goalie-1',
    playerType: 'GOALIE',
    birthDate: '2000-06-01',
    position: 'G',
    currentRole: 'POSITIONAL',
    lifecycleStatus: 'ACTIVE',
    currentTeamId: 'team-1',
    currentTeamName: 'Test FC',
    currentAbility: 55,
    potentialCeiling: 78,
    potentialFloor: 45,
    form: -2,
    attributes: {
      reflexes: 12,
      positioning: 13,
      reboundControl: 11,
      glove: 12,
      blocker: 11,
      movement: 12,
      puckHandling: 10,
      consistency: 12,
      stamina: 11,
    },
    contractStatus: 'UNKNOWN',
    sourceType: 'GENERATED',
    developmentRate: 1,
    ...overrides,
  };
}

describe('ageOnEffectiveDate', () => {
  it('handles birthday boundary', () => {
    expect(ageOnEffectiveDate('2000-07-01', '2020-07-01')).toBe(20);
    expect(ageOnEffectiveDate('2000-07-01', '2020-06-30')).toBe(19);
  });

  it('handles leap day', () => {
    expect(ageOnEffectiveDate('2000-02-29', '2021-02-28')).toBe(20);
    expect(ageOnEffectiveDate('2000-02-29', '2021-03-01')).toBe(21);
  });

  it('rejects invalid dates', () => {
    expect(() => ageOnEffectiveDate('2000-13-01', '2020-01-01')).toThrow();
  });
});

describe('config validation', () => {
  it('accepts default', () => {
    const cfg = getDefaultPlayerDevelopmentConfig();
    expect(validatePlayerDevelopmentConfig(cfg)).toEqual(cfg);
    expect(hashPlayerDevelopmentConfig(cfg)).toHaveLength(64);
  });

  it('rejects unknown fields and bad curves', () => {
    const cfg = getDefaultPlayerDevelopmentConfig();
    expect(() =>
      validatePlayerDevelopmentConfig({ ...cfg, extra: 1 }),
    ).toThrow(/Unknown field/);
    expect(() =>
      validatePlayerDevelopmentConfig({
        ...cfg,
        ageCurves: {
          ...cfg.ageCurves,
          skater: { ...cfg.ageCurves.skater, declineStart: 20 },
        },
      }),
    ).toThrow(/non-decreasing/);
  });
});

describe('budget', () => {
  const cfg = getDefaultPlayerDevelopmentConfig();

  it('young positive, veteran decline, deterministic', () => {
    const young = calculateDevelopmentBudget({
      player: skater({ birthDate: '2008-01-01' }),
      config: cfg,
      effectiveDate: '2027-07-01',
      baseSeed: 'seed-a',
    });
    const vet = calculateDevelopmentBudget({
      player: skater({ playerId: 'v', birthDate: '1988-01-01' }),
      config: cfg,
      effectiveDate: '2027-07-01',
      baseSeed: 'seed-a',
    });
    expect(young.finalBudget).toBeGreaterThan(0);
    expect(vet.finalBudget).toBeLessThan(0);
    const young2 = calculateDevelopmentBudget({
      player: skater({ birthDate: '2008-01-01' }),
      config: cfg,
      effectiveDate: '2027-07-01',
      baseSeed: 'seed-a',
    });
    expect(young2).toEqual(young);
  });
});

describe('developPlayer', () => {
  const cfg = getDefaultPlayerDevelopmentConfig();

  it('is deterministic and keeps potential', () => {
    const a = developPlayer({
      player: skater(),
      config: cfg,
      effectiveDate: '2027-07-01',
      baseSeed: 'dev-1',
    });
    const b = developPlayer({
      player: skater(),
      config: cfg,
      effectiveDate: '2027-07-01',
      baseSeed: 'dev-1',
    });
    expect(a.resultHash).toBe(b.resultHash);
    expect(a.potentialCeiling).toBe(80);
    expect(a.attributeChanges.every((c) => c.afterValue >= 1 && c.afterValue <= 20)).toBe(
      true,
    );
  });

  it('goalie uses separate pathway', () => {
    const r = developPlayer({
      player: goalie({ birthDate: '2008-01-01' }),
      config: cfg,
      effectiveDate: '2027-07-01',
      baseSeed: 'g1',
    });
    expect(r.playerType).toBe('GOALIE');
    expect(r.attributeChanges.every((c) => !('shooting' === c.attributeKey))).toBe(true);
  });

  it('form regresses toward mean', () => {
    const f = updateAnnualForm({
      formBefore: 8,
      config: cfg,
      playerId: 'p',
      baseSeed: 'f',
      effectiveDate: '2027-07-01',
    });
    expect(Math.abs(f.formAfter)).toBeLessThan(Math.abs(8));
  });
});

describe('retirement', () => {
  const cfg = getDefaultPlayerDevelopmentConfig();

  it('below min age false; forced age true; deterministic', () => {
    const young = evaluateRetirement({
      player: skater(),
      age: 25,
      currentAbilityAfter: 50,
      config: cfg,
      baseSeed: 'r',
      effectiveDate: '2027-07-01',
    });
    expect(young.retired).toBe(false);
    const forced = evaluateRetirement({
      player: skater({ playerId: 'old' }),
      age: 45,
      currentAbilityAfter: 40,
      config: cfg,
      baseSeed: 'r',
      effectiveDate: '2027-07-01',
    });
    expect(forced.retired).toBe(true);
    expect(forced.forced).toBe(true);
  });
});

describe('batch + reconciliation', () => {
  const cfg = getDefaultPlayerDevelopmentConfig();

  it('developPlayers hashes stable and reconciles', () => {
    const players = [
      skater({ playerId: 'a', birthDate: '2006-01-01' }),
      skater({ playerId: 'b', birthDate: '1995-01-01' }),
      goalie({ playerId: 'c', birthDate: '2004-01-01' }),
    ];
    const run1 = developPlayers({
      players,
      config: cfg,
      worldSeasonId: 'ws1',
      effectiveDate: '2027-07-01',
      baseSeed: 'batch',
    });
    const run2 = developPlayers({
      players,
      config: cfg,
      worldSeasonId: 'ws1',
      effectiveDate: '2027-07-01',
      baseSeed: 'batch',
    });
    expect(run1.summary.resultHash).toBe(run2.summary.resultHash);
    expect(run1.summary.inputHash).toBe(run2.summary.inputHash);

    const map = new Map(players.map((p) => [p.playerId, p]));
    assertReconciliation({
      eligiblePlayerIds: players.map((p) => p.playerId),
      results: run1.results,
      inputsByPlayerId: map,
      config: cfg,
    });

    const bad = reconcileDevelopmentResults({
      eligiblePlayerIds: ['a', 'b', 'c', 'missing'],
      results: run1.results,
      inputsByPlayerId: map,
      config: cfg,
    });
    expect(bad.ok).toBe(false);
  });

  it('different seed usually changes something', () => {
    const players = Array.from({ length: 20 }, (_, i) =>
      skater({
        playerId: `p${i}`,
        birthDate: `${1990 + (i % 20)}-03-01`,
        form: (i % 7) - 3,
      }),
    );
    const a = developPlayers({
      players,
      config: cfg,
      worldSeasonId: 'ws',
      effectiveDate: '2027-07-01',
      baseSeed: 'seed-1',
    });
    const b = developPlayers({
      players,
      config: cfg,
      worldSeasonId: 'ws',
      effectiveDate: '2027-07-01',
      baseSeed: 'seed-2',
    });
    expect(a.summary.resultHash).not.toBe(b.summary.resultHash);
  });
});
