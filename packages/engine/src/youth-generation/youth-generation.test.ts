import { describe, expect, it } from 'vitest';
import {
  assertYouthReconciliation,
  buildDefaultCountryYouthProfile,
  generateYouthRun,
  hashCountryYouthProfile,
  validateAndNormalizeNamePool,
  validateCountryYouthProfile,
} from './index.js';
import type { YouthGenerationCountryInput } from './types.js';

function fictionalPool(key: string) {
  const firstNames = Array.from({ length: 24 }, (_, i) => `First${key}${i}`);
  const lastNames = Array.from({ length: 32 }, (_, i) => `Last${key}${i}`);
  return { poolKey: key, firstNames, lastNames };
}

function countryInput(key: string, id: string, name: string): YouthGenerationCountryInput {
  const profile = buildDefaultCountryYouthProfile(key, {
    cohort: { baseSize: 8, sizeVariance: 0.1, minimumSize: 4, maximumSize: 20 },
  });
  return {
    countryKey: key,
    countryId: id,
    countryName: name,
    profile,
    namePool: fictionalPool(key),
    namePoolVersionId: `np-${key}`,
    namePoolHash: 'np-hash',
    profileHash: hashCountryYouthProfile(profile),
  };
}

describe('youth profile validation', () => {
  it('accepts default and rejects bad weights', () => {
    const p = buildDefaultCountryYouthProfile('NAV');
    expect(validateCountryYouthProfile(p).countryKey).toBe('NAV');
    expect(() =>
      validateCountryYouthProfile({
        ...p,
        ages: { '15': 0.5, '16': 0.5, '17': 0.5 },
      }),
    ).toThrow(/sum to 1/);
    expect(() => validateCountryYouthProfile({ ...p, extra: 1 })).toThrow(/Unknown field/);
  });
});

describe('name pools', () => {
  it('normalizes, rejects duplicates, supports unicode', () => {
    const pool = validateAndNormalizeNamePool({
      firstNames: ['  Álex ', 'Bo'],
      lastNames: ['Ñunez', 'Smith'],
    });
    expect(pool.firstNames[0]).toBe('Álex');
    expect(() =>
      validateAndNormalizeNamePool({
        firstNames: ['Alex', 'alex'],
        lastNames: ['A', 'B'],
      }),
    ).toThrow(/Duplicate/);
  });
});

describe('generateYouthRun', () => {
  it('is deterministic and produces ages 15–17 with valid models', () => {
    const countries = [
      countryInput('NAV', 'c1', 'North Avalon'),
      countryInput('SGL', 'c2', 'South Glacier'),
    ];
    const a = generateYouthRun({
      worldSeasonId: 'ws1',
      referenceDate: '2027-07-01',
      baseSeed: 'youth-test',
      profileSetHash: 'ps1',
      countries,
    });
    const b = generateYouthRun({
      worldSeasonId: 'ws1',
      referenceDate: '2027-07-01',
      baseSeed: 'youth-test',
      profileSetHash: 'ps1',
      countries,
    });
    expect(a.summary.resultHash).toBe(b.summary.resultHash);
    expect(a.summary.inputHash).toBe(b.summary.inputHash);
    expect(a.players.length).toBeGreaterThan(0);
    expect(a.summary.age17Count).toBeGreaterThanOrEqual(a.summary.age15Count);

    for (const p of a.players) {
      expect([15, 16, 17]).toContain(p.ageOnReferenceDate);
      expect(p.sourceType).toBe('GENERATED_YOUTH');
      expect(p.lifecycleStatus).toBe('PROSPECT');
      expect(p.currentTeamId).toBeNull();
      expect(p.potentialFloor).toBeLessThanOrEqual(p.potentialCeiling);
      if (p.position === 'G') {
        expect(p.attributes.reflexes).toBeTypeOf('number');
        expect(p.attributes.shooting).toBeUndefined();
      } else {
        expect(p.attributes.shooting).toBeTypeOf('number');
        expect(p.attributes.reflexes).toBeUndefined();
      }
    }

    assertYouthReconciliation({
      enabledCountries: countries,
      cohorts: a.cohorts,
      referenceDate: '2027-07-01',
    });

    const c = generateYouthRun({
      worldSeasonId: 'ws1',
      referenceDate: '2027-07-01',
      baseSeed: 'youth-test-alt',
      profileSetHash: 'ps1',
      countries,
    });
    expect(c.summary.resultHash).not.toBe(a.summary.resultHash);
  });
});
