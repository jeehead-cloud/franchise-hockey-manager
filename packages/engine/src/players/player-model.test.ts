import { describe, expect, it } from 'vitest';
import {
  deriveGoalieModel,
  deriveGoalieRole,
  derivePlayerModel,
  deriveSkaterModel,
  deriveSkaterRatings,
  deriveSkaterRole,
  getHiddenPotential,
  PlayerModelValidationError,
  validateSkaterAttributes,
} from '../index.js';
import type { CompleteGoalieInput, CompleteSkaterInput, SkaterAttributes } from '../players/types.js';

const baseProfile = {
  preferredCoachingStyle: 'AUTHORITATIVE' as const,
  preferredTactics: 'SYSTEM' as const,
  personality: 'PROFESSIONAL' as const,
  heroRating: 10,
  stability: 12,
  developmentRate: 1.5,
  developmentRisk: 0.3,
  potentialFloor: 45,
  potentialCeiling: 75,
  publicPotentialEstimate: 'STANDARD' as const,
};

function skaterAttrs(overrides: Partial<SkaterAttributes> = {}): SkaterAttributes {
  return {
    stickhandling: 10,
    shooting: 10,
    passing: 10,
    strength: 10,
    speed: 10,
    balance: 10,
    aggression: 10,
    offensiveAwareness: 10,
    defensiveAwareness: 10,
    ...overrides,
  };
}

describe('attribute validation', () => {
  it('accepts 1–20 integers', () => {
    expect(validateSkaterAttributes(skaterAttrs())).toEqual([]);
  });

  it('rejects below minimum', () => {
    expect(validateSkaterAttributes(skaterAttrs({ speed: 0 })).length).toBeGreaterThan(0);
  });

  it('rejects above maximum', () => {
    expect(validateSkaterAttributes(skaterAttrs({ speed: 21 })).length).toBeGreaterThan(0);
  });

  it('rejects non-integers', () => {
    expect(validateSkaterAttributes(skaterAttrs({ speed: 10.5 as number })).length).toBeGreaterThan(0);
  });
});

describe('skater roles', () => {
  it('derives Rocket for STH+SPD dominance on a forward', () => {
    const role = deriveSkaterRole(
      'C',
      skaterAttrs({ stickhandling: 18, speed: 18, shooting: 12 }),
    );
    expect(role.role).toBe('ROCKET');
    expect(role.winningPair).toEqual({ a: 'stickhandling', b: 'speed' });
    expect(role.explanation).toContain('Rocket');
  });

  it('derives Defensive D for defense-oriented defenseman', () => {
    const role = deriveSkaterRole(
      'LD',
      skaterAttrs({
        defensiveAwareness: 18,
        strength: 17,
        aggression: 16,
        stickhandling: 8,
        speed: 8,
        offensiveAwareness: 8,
      }),
    );
    expect(role.role).toBe('DEFENSIVE_D');
  });

  it('rejects goalie position', () => {
    expect(() => deriveSkaterRole('G', skaterAttrs())).toThrow(PlayerModelValidationError);
  });

  it('is deterministic for ties', () => {
    // All attrs equal → every pair score 20; alphabetical role among max pairs
    const a = deriveSkaterRole('C', skaterAttrs());
    const b = deriveSkaterRole('C', skaterAttrs());
    expect(a).toEqual(b);
  });

  it('same input same output', () => {
    const input: CompleteSkaterInput = {
      ...baseProfile,
      primaryPosition: 'RW',
      skaterAttributes: skaterAttrs({ offensiveAwareness: 17, speed: 16 }),
    };
    expect(deriveSkaterModel(input)).toEqual(deriveSkaterModel(input));
  });
});

describe('goalie roles', () => {
  const goalieAttrs = {
    reflexes: 10,
    positioning: 10,
    reboundControl: 10,
    glove: 10,
    blocker: 10,
    movement: 10,
    puckHandling: 10,
    consistency: 10,
    stamina: 10,
  };

  it('selects reflex profile', () => {
    const role = deriveGoalieRole('G', {
      ...goalieAttrs,
      reflexes: 18,
      movement: 17,
      glove: 16,
    });
    expect(role.role).toBe('REFLEX_GOALIE');
  });

  it('selects puck-playing profile', () => {
    const role = deriveGoalieRole('G', {
      ...goalieAttrs,
      puckHandling: 18,
      movement: 17,
      positioning: 15,
    });
    expect(role.role).toBe('PUCK_PLAYING_GOALIE');
  });

  it('selects positional profile', () => {
    const role = deriveGoalieRole('G', {
      ...goalieAttrs,
      positioning: 18,
      reboundControl: 17,
      consistency: 16,
    });
    expect(role.role).toBe('POSITIONAL_GOALIE');
  });

  it('is deterministic', () => {
    expect(deriveGoalieRole('G', goalieAttrs)).toEqual(deriveGoalieRole('G', goalieAttrs));
  });
});

describe('ratings', () => {
  it('are bounded 0–100', () => {
    const r = deriveSkaterRatings(skaterAttrs({ stickhandling: 20, shooting: 20, passing: 20 }));
    expect(r.currentAbility).toBeGreaterThanOrEqual(0);
    expect(r.currentAbility).toBeLessThanOrEqual(100);
    expect(r.offensiveRating).toBeLessThanOrEqual(100);
  });

  it('offensive rating rises with offensive attributes', () => {
    const low = deriveSkaterRatings(skaterAttrs({ shooting: 5, offensiveAwareness: 5 }));
    const high = deriveSkaterRatings(skaterAttrs({ shooting: 18, offensiveAwareness: 18 }));
    expect(high.offensiveRating).toBeGreaterThan(low.offensiveRating);
  });

  it('hidden potential does not change current ability', () => {
    const base: CompleteSkaterInput = {
      ...baseProfile,
      primaryPosition: 'C',
      skaterAttributes: skaterAttrs(),
    };
    const highPot = { ...base, potentialFloor: 80, potentialCeiling: 95, developmentRisk: 0.9 };
    expect(deriveSkaterModel(base).ratings.currentAbility).toBe(
      deriveSkaterModel(highPot).ratings.currentAbility,
    );
  });

  it('preferences do not change permanent ratings', () => {
    const a: CompleteSkaterInput = {
      ...baseProfile,
      primaryPosition: 'C',
      skaterAttributes: skaterAttrs(),
    };
    const b = { ...a, personality: 'LEADER' as const, preferredTactics: 'SPEED' as const };
    expect(deriveSkaterModel(a).ratings).toEqual(deriveSkaterModel(b).ratings);
  });
});

describe('player-model invariants', () => {
  it('rejects skater with goalie attrs via derivePlayerModel', () => {
    expect(() =>
      derivePlayerModel({
        ...baseProfile,
        primaryPosition: 'C',
        skaterAttributes: skaterAttrs(),
        goalieAttributes: {
          reflexes: 10,
          positioning: 10,
          reboundControl: 10,
          glove: 10,
          blocker: 10,
          movement: 10,
          puckHandling: 10,
          consistency: 10,
          stamina: 10,
        },
      } as never),
    ).toThrow(/must not include goalieAttributes/);
  });

  it('rejects invalid potential range', () => {
    expect(() =>
      deriveSkaterModel({
        ...baseProfile,
        potentialFloor: 80,
        potentialCeiling: 40,
        primaryPosition: 'C',
        skaterAttributes: skaterAttrs(),
      }),
    ).toThrow(PlayerModelValidationError);
  });

  it('goalie model works', () => {
    const input: CompleteGoalieInput = {
      ...baseProfile,
      primaryPosition: 'G',
      goalieAttributes: {
        reflexes: 14,
        positioning: 12,
        reboundControl: 11,
        glove: 13,
        blocker: 12,
        movement: 14,
        puckHandling: 10,
        consistency: 11,
        stamina: 12,
      },
    };
    const model = deriveGoalieModel(input);
    expect(model.kind).toBe('goalie');
    expect(model.ratings.currentAbility).toBeGreaterThan(0);
    expect(getHiddenPotential(input).potentialFloor).toBe(45);
  });
});
