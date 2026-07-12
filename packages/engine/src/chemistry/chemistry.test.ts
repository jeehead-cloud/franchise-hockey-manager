import { describe, expect, it } from 'vitest';
import {
  CHEMISTRY_CONFIG_VERSION,
  coachFitScore,
  computeBaseAbility,
  computeEffectivePerformance,
  evaluateChemistryUnit,
  evaluateLineupChemistry,
  getRolePairScore,
  pairKey,
  personalityCompatibilityScore,
  roleCompatibilityScore,
  validateChemistryConfig,
  type ChemistryContext,
  type ChemistryPlayerInput,
} from '../index.js';

function player(
  partial: Partial<ChemistryPlayerInput> & Pick<ChemistryPlayerInput, 'id' | 'role' | 'position'>,
): ChemistryPlayerInput {
  return {
    currentAbility: 70,
    roleRating: 50,
    personality: 'PROFESSIONAL',
    preferredCoachingStyle: 'AUTHORITATIVE',
    preferredTactics: 'SYSTEM',
    ...partial,
  };
}

const matchedContext: ChemistryContext = {
  coach: {
    coachingStyle: 'AUTHORITATIVE',
    tacticalStyle: 'SYSTEM',
    overallCoaching: 16,
    offense: 15,
    defense: 14,
  },
  teamTacticalStyle: 'SYSTEM',
  familiarity: 0,
};

const mismatchedContext: ChemistryContext = {
  coach: {
    coachingStyle: 'HANDS_OFF',
    tacticalStyle: 'PHYSICAL',
    overallCoaching: 8,
    offense: 8,
    defense: 8,
  },
  teamTacticalStyle: 'PHYSICAL',
  familiarity: 0,
};

describe('chemistry config', () => {
  it('validates without errors', () => {
    expect(validateChemistryConfig()).toEqual([]);
    expect(CHEMISTRY_CONFIG_VERSION).toBe('f9-v1');
  });

  it('uses symmetric role pair keys', () => {
    expect(pairKey('PLAYMAKER', 'POWER_FORWARD')).toBe(pairKey('POWER_FORWARD', 'PLAYMAKER'));
    expect(getRolePairScore('PLAYMAKER', 'POWER_FORWARD')).toBe(
      getRolePairScore('POWER_FORWARD', 'PLAYMAKER'),
    );
  });
});

describe('role and personality', () => {
  it('scores complementary forwards higher than redundant forwards', () => {
    const complementary = roleCompatibilityScore([
      player({ id: 'a', position: 'C', role: 'PLAYMAKER' }),
      player({ id: 'b', position: 'LW', role: 'POWER_FORWARD' }),
      player({ id: 'c', position: 'RW', role: 'GRINDER' }),
    ]);
    const redundant = roleCompatibilityScore([
      player({ id: 'a', position: 'C', role: 'PLAYMAKER' }),
      player({ id: 'b', position: 'LW', role: 'PLAYMAKER' }),
      player({ id: 'c', position: 'RW', role: 'PLAYMAKER' }),
    ]);
    expect(complementary.score).toBeGreaterThan(redundant.score);
    expect(complementary.score).toBeGreaterThan(0.3);
    expect(redundant.score).toBeLessThan(-0.3);
  });

  it('scores complementary defense pairs positively', () => {
    const score = roleCompatibilityScore([
      player({ id: 'a', position: 'LD', role: 'QUARTERBACK' }),
      player({ id: 'b', position: 'RD', role: 'DEFENSIVE_D' }),
    ]);
    expect(score.score).toBeGreaterThan(0.5);
  });

  it('is order-independent for role and personality', () => {
    const a = [
      player({ id: 'z', position: 'C', role: 'PLAYMAKER', personality: 'LEADER' }),
      player({ id: 'a', position: 'LW', role: 'POWER_FORWARD', personality: 'GLUE' }),
      player({ id: 'm', position: 'RW', role: 'GRINDER', personality: 'COMPETITOR' }),
    ];
    const b = [...a].reverse();
    expect(roleCompatibilityScore(a)).toEqual(roleCompatibilityScore(b));
    expect(personalityCompatibilityScore(a)).toEqual(personalityCompatibilityScore(b));
  });

  it('keeps personality contribution modest and positive for GLUE', () => {
    const withGlue = personalityCompatibilityScore([
      player({ id: 'a', position: 'C', role: 'PLAYMAKER', personality: 'GLUE' }),
      player({ id: 'b', position: 'LW', role: 'ROCKET', personality: 'LEADER' }),
    ]);
    expect(withGlue.score).toBeGreaterThan(0.2);
    expect(withGlue.score).toBeLessThanOrEqual(1);
  });
});

describe('coach and tactical fit', () => {
  it('rewards exact coaching match and penalizes mismatch', () => {
    const players = [player({ id: 'a', position: 'C', role: 'PLAYMAKER' })];
    const good = coachFitScore(players, matchedContext, 'FORWARD_LINE');
    const bad = coachFitScore(players, mismatchedContext, 'FORWARD_LINE');
    expect(good.score).toBeGreaterThan(bad.score);
    expect(good.score).toBeGreaterThan(0.5);
    expect(bad.score).toBeLessThan(0);
  });

  it('handles missing coach', () => {
    const result = coachFitScore(
      [player({ id: 'a', position: 'C', role: 'PLAYMAKER' })],
      { coach: null, teamTacticalStyle: 'SYSTEM' },
      'FORWARD_LINE',
    );
    expect(result.score).toBeLessThan(0);
    expect(result.factors.some((f) => f.code === 'MISSING_COACH')).toBe(true);
  });
});

describe('effective performance and non-linearity', () => {
  it('enforces total modifier caps and non-negative EP', () => {
    const high = computeEffectivePerformance({
      baseAbility: 80,
      chemistry0to100: 100,
      coachFitNeg1To1: 1,
      tacticalFitNeg1To1: 1,
    });
    expect(high.totalModifier).toBeLessThanOrEqual(0.30);
    expect(high.effectivePerformance).toBeGreaterThan(0);

    const low = computeEffectivePerformance({
      baseAbility: 80,
      chemistry0to100: 0,
      coachFitNeg1To1: -1,
      tacticalFitNeg1To1: -1,
    });
    expect(low.totalModifier).toBeGreaterThanOrEqual(-0.30);
    expect(low.effectivePerformance).toBeGreaterThanOrEqual(0);
  });

  it('proves lower-rated complementary fit can beat higher-rated redundancy', () => {
    const strongFitLowCa = evaluateChemistryUnit({
      unitType: 'FORWARD_LINE',
      unitKey: 'F1',
      players: [
        player({
          id: 'a',
          position: 'C',
          role: 'PLAYMAKER',
          currentAbility: 65,
          preferredCoachingStyle: 'AUTHORITATIVE',
          preferredTactics: 'SYSTEM',
          personality: 'GLUE',
        }),
        player({
          id: 'b',
          position: 'LW',
          role: 'POWER_FORWARD',
          currentAbility: 64,
          preferredCoachingStyle: 'AUTHORITATIVE',
          preferredTactics: 'SYSTEM',
          personality: 'LEADER',
        }),
        player({
          id: 'c',
          position: 'RW',
          role: 'GRINDER',
          currentAbility: 63,
          preferredCoachingStyle: 'AUTHORITATIVE',
          preferredTactics: 'SYSTEM',
          personality: 'COMPETITOR',
        }),
      ],
      context: matchedContext,
    });

    const weakFitHighCa = evaluateChemistryUnit({
      unitType: 'FORWARD_LINE',
      unitKey: 'F2',
      players: [
        player({
          id: 'd',
          position: 'C',
          role: 'PLAYMAKER',
          currentAbility: 90,
          preferredCoachingStyle: 'AUTHORITATIVE',
          preferredTactics: 'SYSTEM',
          personality: 'CREATIVE',
        }),
        player({
          id: 'e',
          position: 'LW',
          role: 'PLAYMAKER',
          currentAbility: 89,
          preferredCoachingStyle: 'AUTHORITATIVE',
          preferredTactics: 'SYSTEM',
          personality: 'CREATIVE',
        }),
        player({
          id: 'f',
          position: 'RW',
          role: 'PLAYMAKER',
          currentAbility: 88,
          preferredCoachingStyle: 'AUTHORITATIVE',
          preferredTactics: 'SYSTEM',
          personality: 'CREATIVE',
        }),
      ],
      context: mismatchedContext,
    });

    expect(strongFitLowCa.status).toBe('AVAILABLE');
    expect(weakFitHighCa.status).toBe('AVAILABLE');
    expect(computeBaseAbility(strongFitLowCa.playerIds.map((id, i) =>
      player({
        id,
        position: i === 0 ? 'C' : i === 1 ? 'LW' : 'RW',
        role: 'PLAYMAKER',
        currentAbility: [65, 64, 63][i]!,
      }),
    ))).toBeLessThan(
      computeBaseAbility([
        player({ id: 'd', position: 'C', role: 'PLAYMAKER', currentAbility: 90 }),
        player({ id: 'e', position: 'LW', role: 'PLAYMAKER', currentAbility: 89 }),
        player({ id: 'f', position: 'RW', role: 'PLAYMAKER', currentAbility: 88 }),
      ]),
    );
    expect(strongFitLowCa.effectivePerformance!).toBeGreaterThan(weakFitHighCa.effectivePerformance!);
    expect(strongFitLowCa.currentChemistry!).toBeGreaterThan(weakFitHighCa.currentChemistry!);
  });

  it('keeps current ability decisive when fit is equal', () => {
    const mk = (ability: number, id: string) =>
      evaluateChemistryUnit({
        unitType: 'FORWARD_LINE',
        unitKey: 'F1',
        players: [
          player({
            id: `${id}-c`,
            position: 'C',
            role: 'PLAYMAKER',
            currentAbility: ability,
            preferredCoachingStyle: 'AUTHORITATIVE',
            preferredTactics: 'SYSTEM',
          }),
          player({
            id: `${id}-lw`,
            position: 'LW',
            role: 'POWER_FORWARD',
            currentAbility: ability,
            preferredCoachingStyle: 'AUTHORITATIVE',
            preferredTactics: 'SYSTEM',
          }),
          player({
            id: `${id}-rw`,
            position: 'RW',
            role: 'GRINDER',
            currentAbility: ability,
            preferredCoachingStyle: 'AUTHORITATIVE',
            preferredTactics: 'SYSTEM',
          }),
        ],
        context: matchedContext,
      });
    expect(mk(80, 'h').effectivePerformance!).toBeGreaterThan(mk(60, 'l').effectivePerformance!);
  });

  it('sets familiarity to 0 and chemistry equals base compatibility', () => {
    const unit = evaluateChemistryUnit({
      unitType: 'FORWARD_LINE',
      unitKey: 'F1',
      players: [
        player({ id: 'a', position: 'C', role: 'PLAYMAKER' }),
        player({ id: 'b', position: 'LW', role: 'POWER_FORWARD' }),
        player({ id: 'c', position: 'RW', role: 'GRINDER' }),
      ],
      context: matchedContext,
    });
    expect(unit.familiarity).toBe(0);
    expect(unit.familiarityStatus).toBe('NOT_TRACKED_YET');
    expect(unit.currentChemistry).toBe(unit.baseCompatibility);
  });

  it('is deterministic and order-independent', () => {
    const players = [
      player({ id: 'c', position: 'C', role: 'PLAYMAKER' }),
      player({ id: 'a', position: 'LW', role: 'POWER_FORWARD' }),
      player({ id: 'b', position: 'RW', role: 'GRINDER' }),
    ];
    const a = evaluateChemistryUnit({
      unitType: 'FORWARD_LINE',
      unitKey: 'F1',
      players,
      context: matchedContext,
    });
    const b = evaluateChemistryUnit({
      unitType: 'FORWARD_LINE',
      unitKey: 'F1',
      players: [...players].reverse(),
      context: matchedContext,
    });
    expect(a).toEqual(b);
  });

  it('marks incomplete units unavailable', () => {
    const unit = evaluateChemistryUnit({
      unitType: 'FORWARD_LINE',
      unitKey: 'F1',
      players: [player({ id: 'a', position: 'C', role: 'PLAYMAKER' })],
      context: matchedContext,
    });
    expect(unit.status).toBe('UNAVAILABLE');
    expect(unit.currentChemistry).toBeNull();
    expect(unit.effectivePerformance).toBeNull();
  });
});

describe('goalie and lineup summary', () => {
  it('evaluates goalie without line chemistry', () => {
    const unit = evaluateChemistryUnit({
      unitType: 'GOALIE',
      unitKey: 'G_STARTER',
      players: [player({ id: 'g', position: 'G', role: 'REFLEX_GOALIE', currentAbility: 82 })],
      context: matchedContext,
    });
    expect(unit.status).toBe('AVAILABLE');
    expect(unit.currentChemistry).toBeNull();
    expect(unit.effectivePerformance).toBeGreaterThan(0);
  });

  it('builds a lineup summary with four lines and three pairs', () => {
    const line = [
      player({ id: 'c', position: 'C', role: 'PLAYMAKER' }),
      player({ id: 'lw', position: 'LW', role: 'POWER_FORWARD' }),
      player({ id: 'rw', position: 'RW', role: 'GRINDER' }),
    ];
    const summary = evaluateLineupChemistry({
      forwardLines: [line, [], [], []],
      defensePairs: [
        [
          player({ id: 'ld', position: 'LD', role: 'QUARTERBACK' }),
          player({ id: 'rd', position: 'RD', role: 'DEFENSIVE_D' }),
        ],
        [],
        [],
      ],
      starterGoalie: player({ id: 'gs', position: 'G', role: 'REFLEX_GOALIE' }),
      backupGoalie: null,
      context: matchedContext,
    });
    expect(summary.forwardLines).toHaveLength(4);
    expect(summary.defensePairs).toHaveLength(3);
    expect(summary.forwardLines[0]!.status).toBe('AVAILABLE');
    expect(summary.forwardLines[1]!.status).toBe('UNAVAILABLE');
    expect(summary.goalies.backup.status).toBe('UNAVAILABLE');
    expect(summary.chemistryConfigVersion).toBe('f9-v1');
  });
});
