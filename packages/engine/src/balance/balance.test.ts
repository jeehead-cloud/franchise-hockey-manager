import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  canonicalizeBalanceConfig,
  collectChangedPaths,
  defaultGoaliesSection,
  defaultShotsSection,
  getStandardBalanceConfig,
  isF12CompatibleBalanceConfig,
  normalizeBalanceConfig,
  SHOT_TYPES,
  validateBalanceConfig,
  validateRuntimeSimulationSettings,
} from './index.js';
import {
  defaultChemistryRuntimeConfig,
  evaluateChemistryUnit,
  chemistryRuntimeFromBalance,
} from '../chemistry/index.js';

function hash(config: ReturnType<typeof getStandardBalanceConfig>) {
  return createHash('sha256').update(canonicalizeBalanceConfig(config)).digest('hex');
}

describe('balance config', () => {
  it('parses Standard defaults with required sections', () => {
    const config = getStandardBalanceConfig();
    expect(config.schemaVersion).toBe(3);
    expect(config.presetKey).toBe('standard');
    expect(config.chemistry.active).toBe(true);
    expect(config.playerModel.active).toBe(true);
    expect(config.match.active).toBe(true);
    expect(config.shots.active).toBe(true);
    expect(config.goalies.active).toBe(true);
    if (config.match.active) {
      expect(config.match.regulationPeriods).toBe(3);
      expect(config.match.offensiveZoneShotOpportunityProbability).toBeCloseTo(0.28);
      expect(config.match.offensiveZoneContinuedPossessionProbability).toBeCloseTo(0.15);
    }
    if (config.shots.active) {
      for (const shotType of SHOT_TYPES) {
        expect(config.shots.shotTypeWeights[shotType]).toBeGreaterThan(0);
      }
    }
    if (config.goalies.active) {
      for (const shotType of SHOT_TYPES) {
        expect(config.goalies.attributeWeightsByShotType[shotType]).toBeTruthy();
      }
    }
    expect(config.chemistry.weights.version).toBe('f9-v1');
    expect(isF12CompatibleBalanceConfig(config)).toBe(true);
    const result = validateBalanceConfig(config);
    expect(result.ok).toBe(true);
  });

  it('default shots and goalies sections validate independently', () => {
    expect(validateBalanceConfig(defaultShotsSection()).ok).toBe(false);
    expect(validateBalanceConfig(defaultGoaliesSection()).ok).toBe(false);
  });

  it('canonicalization is order-independent and hash-stable', () => {
    const a = getStandardBalanceConfig();
    const b = JSON.parse(JSON.stringify(a)) as typeof a;
    // scramble object insertion by rebuilding randomness in reverse key order
    const scrambled = {
      ...b,
      randomness: {
        upsetStrength: b.randomness.upsetStrength,
        penaltyVariance: b.randomness.penaltyVariance,
        goalieVariance: b.randomness.goalieVariance,
        finishingVariance: b.randomness.finishingVariance,
        eventVariance: b.randomness.eventVariance,
        simulationRandomness: b.randomness.simulationRandomness,
      },
    };
    expect(canonicalizeBalanceConfig(normalizeBalanceConfig(scrambled))).toBe(
      canonicalizeBalanceConfig(a),
    );
    expect(hash(a)).toBe(hash(normalizeBalanceConfig(scrambled)));
  });

  it('rejects invalid schema version, unknown fields, and out-of-range values', () => {
    const base = getStandardBalanceConfig();
    expect(validateBalanceConfig({ ...base, schemaVersion: 99 }).ok).toBe(false);
    expect(validateBalanceConfig({ ...base, unexpected: true }).ok).toBe(false);
    expect(
      validateBalanceConfig({
        ...base,
        randomness: { ...base.randomness, simulationRandomness: 1.5 },
      }).ok,
    ).toBe(false);
    expect(
      validateBalanceConfig({
        ...base,
        chemistry: {
          ...base.chemistry,
          weights: {
            ...base.chemistry.weights,
            caps: { ...base.chemistry.weights.caps, totalMin: 0.2, totalMax: 0.1 },
          },
        },
      }).ok,
    ).toBe(false);
  });

  it('rejects schemaVersion 3 config with inactive shots or goalies', () => {
    const base = getStandardBalanceConfig();
    expect(
      validateBalanceConfig({
        ...base,
        shots: {
          active: false,
          status: 'INACTIVE_UNTIL_MILESTONE',
          milestone: 'F12',
          notes: 'inactive',
        },
      }).ok,
    ).toBe(false);
    expect(
      validateBalanceConfig({
        ...base,
        goalies: {
          active: false,
          status: 'INACTIVE_UNTIL_MILESTONE',
          milestone: 'F12',
          notes: 'inactive',
        },
      }).ok,
    ).toBe(false);
  });

  it('rejects asymmetric coach-fit matrix', () => {
    const base = getStandardBalanceConfig();
    const matrix = structuredClone(base.chemistry.coachFit.matrix);
    matrix.AUTHORITATIVE!.DEMOCRATIC = 0.9;
    matrix.DEMOCRATIC!.AUTHORITATIVE = -0.9;
    const result = validateBalanceConfig({
      ...base,
      chemistry: { ...base.chemistry, coachFit: { ...base.chemistry.coachFit, matrix } },
    });
    expect(result.ok).toBe(false);
  });

  it('validates runtime settings', () => {
    expect(
      validateRuntimeSimulationSettings({
        simulationRandomness: 0.5,
        randomSeed: null,
        loggingLevel: 'STANDARD',
      }).ok,
    ).toBe(true);
    expect(
      validateRuntimeSimulationSettings({
        simulationRandomness: 2,
        randomSeed: null,
        loggingLevel: 'STANDARD',
      }).ok,
    ).toBe(false);
  });

  it('collects changed paths', () => {
    const before = getStandardBalanceConfig();
    const after = {
      ...before,
      chemistry: {
        ...before.chemistry,
        weights: {
          ...before.chemistry.weights,
          caps: { ...before.chemistry.weights.caps, totalMax: 0.25 },
        },
      },
    };
    const paths = collectChangedPaths(before, after).map((c) => c.path);
    expect(paths).toContain('chemistry.weights.caps.totalMax');
  });

  it('Standard chemistry runtime matches F9 defaults and injects into evaluation', () => {
    const standard = getStandardBalanceConfig();
    const fromBalance = chemistryRuntimeFromBalance(standard.chemistry);
    const defaults = defaultChemistryRuntimeConfig();
    expect(fromBalance.caps).toEqual(defaults.caps);
    expect(fromBalance.version).toBe(defaults.version);

    const players = [
      {
        id: 'a',
        position: 'C' as const,
        currentAbility: 70,
        role: 'PLAYMAKER',
        roleRating: 70,
        personality: 'LEADER' as const,
        preferredCoachingStyle: 'AUTHORITATIVE' as const,
        preferredTactics: 'SYSTEM' as const,
      },
      {
        id: 'b',
        position: 'LW' as const,
        currentAbility: 68,
        role: 'POWER_FORWARD',
        roleRating: 68,
        personality: 'GLUE' as const,
        preferredCoachingStyle: 'AUTHORITATIVE' as const,
        preferredTactics: 'SYSTEM' as const,
      },
      {
        id: 'c',
        position: 'RW' as const,
        currentAbility: 66,
        role: 'GRINDER',
        roleRating: 66,
        personality: 'COMPETITOR' as const,
        preferredCoachingStyle: 'AUTHORITATIVE' as const,
        preferredTactics: 'SYSTEM' as const,
      },
    ];
    const context = {
      coach: {
        coachingStyle: 'AUTHORITATIVE' as const,
        tacticalStyle: 'SYSTEM' as const,
        overallCoaching: 14,
        offense: 14,
        defense: 14,
      },
      teamTacticalStyle: 'SYSTEM' as const,
    };
    const baseline = evaluateChemistryUnit({
      unitType: 'FORWARD_LINE',
      unitKey: 'F1',
      players,
      context,
    });
    const injected = evaluateChemistryUnit({
      unitType: 'FORWARD_LINE',
      unitKey: 'F1',
      players,
      context,
      chemistryConfig: fromBalance,
    });
    expect(injected.effectivePerformance).toBe(baseline.effectivePerformance);

    const reduced = chemistryRuntimeFromBalance({
      ...standard.chemistry,
      weights: {
        ...standard.chemistry.weights,
        caps: { ...standard.chemistry.weights.caps, chemistry: 0.01, totalMax: 0.05 },
      },
    });
    const capped = evaluateChemistryUnit({
      unitType: 'FORWARD_LINE',
      unitKey: 'F1',
      players,
      context,
      chemistryConfig: reduced,
    });
    expect(capped.totalModifier).toBeLessThanOrEqual(0.05);
  });

  it('does not mutate config objects', () => {
    const config = getStandardBalanceConfig();
    const before = JSON.stringify(config);
    canonicalizeBalanceConfig(config);
    normalizeBalanceConfig(config);
    expect(JSON.stringify(config)).toBe(before);
  });
});
