import { sortJsonValue } from '../balance/canonicalize.js';
import { PLAYER_MODEL_CONFIG } from '../players/validation.js';
import type {
  CountryYouthProfile,
  DistributionBounds,
  PhysicalRange,
  WeightedAges,
  WeightedHandedness,
  WeightedPositions,
  WeightedQualityTiers,
  YouthPosition,
} from './types.js';
import { YOUTH_GENERATION_SCHEMA_VERSION, YouthGenerationError } from './types.js';

const POSITIONS: YouthPosition[] = ['C', 'LW', 'RW', 'LD', 'RD', 'G'];
const DIST_TOLERANCE = 0.001;

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function reqNumber(obj: Record<string, unknown>, key: string): number {
  const v = obj[key];
  if (typeof v !== 'number' || !Number.isFinite(v)) {
    throw new YouthGenerationError('InvalidYouthProfile', `Invalid ${key}: expected finite number`);
  }
  return v;
}

function reqNonNeg(obj: Record<string, unknown>, key: string): number {
  const v = reqNumber(obj, key);
  if (v < 0) {
    throw new YouthGenerationError('InvalidYouthProfile', `Invalid ${key}: must be ≥ 0`);
  }
  return v;
}

function reqInt(obj: Record<string, unknown>, key: string): number {
  const v = reqNumber(obj, key);
  if (!Number.isInteger(v)) {
    throw new YouthGenerationError('InvalidYouthProfile', `Invalid ${key}: expected integer`);
  }
  return v;
}

function reqString(obj: Record<string, unknown>, key: string): string {
  const v = obj[key];
  if (typeof v !== 'string' || !v.trim()) {
    throw new YouthGenerationError('InvalidYouthProfile', `Invalid ${key}: expected non-empty string`);
  }
  return v.trim();
}

function parseDistribution(raw: unknown, label: string): DistributionBounds {
  if (!isObject(raw)) {
    throw new YouthGenerationError('InvalidYouthProfile', `${label} required`);
  }
  const d = {
    mean: reqNumber(raw, 'mean'),
    standardDeviation: reqNonNeg(raw, 'standardDeviation'),
    minimum: reqNumber(raw, 'minimum'),
    maximum: reqNumber(raw, 'maximum'),
  };
  if (d.minimum > d.maximum) {
    throw new YouthGenerationError('InvalidYouthProfile', `${label}.minimum must be ≤ maximum`);
  }
  return d;
}

function parsePhysicalRange(raw: unknown, label: string): PhysicalRange {
  return parseDistribution(raw, label);
}

function assertWeightsSumToOne(weights: Record<string, number>, label: string): void {
  const sum = Object.values(weights).reduce((a, b) => a + b, 0);
  if (Math.abs(sum - 1) > DIST_TOLERANCE) {
    throw new YouthGenerationError(
      'InvalidYouthProfile',
      `${label} weights must sum to 1 (±${DIST_TOLERANCE}); got ${sum}`,
    );
  }
  for (const [k, v] of Object.entries(weights)) {
    if (v < 0) {
      throw new YouthGenerationError('InvalidYouthProfile', `${label}.${k} must be ≥ 0`);
    }
  }
}

function defaultPhysical(heightMean: number, weightMean: number): PhysicalRange {
  return {
    mean: heightMean,
    standardDeviation: 4,
    minimum: heightMean - 12,
    maximum: heightMean + 12,
  };
}

function defaultWeight(weightMean: number): PhysicalRange {
  return {
    mean: weightMean,
    standardDeviation: 5,
    minimum: weightMean - 15,
    maximum: weightMean + 15,
  };
}

/** Default fictional profile template (not NHL-calibrated). */
export function buildDefaultCountryYouthProfile(
  countryKey: string,
  overrides?: Partial<CountryYouthProfile>,
): CountryYouthProfile {
  const heightCmByPosition = {
    C: defaultPhysical(180, 0),
    LW: defaultPhysical(178, 0),
    RW: defaultPhysical(178, 0),
    LD: defaultPhysical(185, 0),
    RD: defaultPhysical(185, 0),
    G: defaultPhysical(188, 0),
  } as CountryYouthProfile['physical']['heightCmByPosition'];
  // Fix height ranges properly
  heightCmByPosition.C = defaultPhysical(180, 0);
  heightCmByPosition.LW = defaultPhysical(178, 0);
  heightCmByPosition.RW = defaultPhysical(178, 0);
  heightCmByPosition.LD = defaultPhysical(185, 0);
  heightCmByPosition.RD = defaultPhysical(185, 0);
  heightCmByPosition.G = defaultPhysical(188, 0);

  const weightKgByPosition = {
    C: defaultWeight(82),
    LW: defaultWeight(80),
    RW: defaultWeight(80),
    LD: defaultWeight(88),
    RD: defaultWeight(88),
    G: defaultWeight(86),
  } as CountryYouthProfile['physical']['weightKgByPosition'];

  const base: CountryYouthProfile = {
    schemaVersion: YOUTH_GENERATION_SCHEMA_VERSION,
    countryKey,
    enabled: true,
    cohort: {
      baseSize: 12,
      sizeVariance: 0.15,
      minimumSize: 4,
      maximumSize: 40,
    },
    ages: { '15': 0.1, '16': 0.25, '17': 0.65 },
    positions: { C: 0.2, LW: 0.16, RW: 0.16, LD: 0.16, RD: 0.16, G: 0.16 },
    handedness: { LEFT: 0.65, RIGHT: 0.35 },
    qualityTiers: {
      ELITE: 0.01,
      HIGH: 0.07,
      AVERAGE: 0.57,
      LOW: 0.3,
      LONG_SHOT: 0.05,
    },
    ability: {
      mean: 8,
      standardDeviation: 1.6,
      minimum: 3,
      maximum: 14,
    },
    potential: {
      mean: 58,
      standardDeviation: 10,
      minimum: PLAYER_MODEL_CONFIG.ratingMin + 20,
      maximum: PLAYER_MODEL_CONFIG.ratingMax - 5,
    },
    developmentRate: {
      mean: 1.2,
      standardDeviation: 0.35,
      minimum: PLAYER_MODEL_CONFIG.developmentRateMin,
      maximum: PLAYER_MODEL_CONFIG.developmentRateMax,
    },
    physical: { heightCmByPosition, weightKgByPosition },
    attributeTendencies: {
      skating: 0,
      shooting: 0,
      passing: 0,
      defense: 0,
      physical: 0,
      goalieAthleticism: 0,
      goalieTechnique: 0,
    },
    namePoolKey: countryKey,
  };
  return validateCountryYouthProfile({ ...base, ...overrides, countryKey });
}

export function validateCountryYouthProfile(raw: unknown): CountryYouthProfile {
  if (!isObject(raw)) {
    throw new YouthGenerationError('InvalidYouthProfile', 'Profile must be an object');
  }
  const known = new Set([
    'schemaVersion',
    'countryKey',
    'enabled',
    'cohort',
    'ages',
    'positions',
    'handedness',
    'qualityTiers',
    'ability',
    'potential',
    'developmentRate',
    'physical',
    'attributeTendencies',
    'namePoolKey',
  ]);
  for (const key of Object.keys(raw)) {
    if (!known.has(key)) {
      throw new YouthGenerationError('InvalidYouthProfile', `Unknown field: ${key}`);
    }
  }
  if (raw.schemaVersion !== YOUTH_GENERATION_SCHEMA_VERSION) {
    throw new YouthGenerationError(
      'InvalidYouthProfile',
      `Unsupported schemaVersion (expected ${YOUTH_GENERATION_SCHEMA_VERSION})`,
    );
  }
  if (typeof raw.enabled !== 'boolean') {
    throw new YouthGenerationError('InvalidYouthProfile', 'enabled must be boolean');
  }
  if (!isObject(raw.cohort)) {
    throw new YouthGenerationError('InvalidYouthProfile', 'cohort required');
  }
  const cohort = {
    baseSize: reqInt(raw.cohort, 'baseSize'),
    sizeVariance: reqNonNeg(raw.cohort, 'sizeVariance'),
    minimumSize: reqInt(raw.cohort, 'minimumSize'),
    maximumSize: reqInt(raw.cohort, 'maximumSize'),
  };
  if (cohort.minimumSize < 1 || cohort.minimumSize > cohort.maximumSize) {
    throw new YouthGenerationError('InvalidYouthProfile', 'Invalid cohort size bounds');
  }
  if (cohort.baseSize < cohort.minimumSize || cohort.baseSize > cohort.maximumSize) {
    throw new YouthGenerationError('InvalidYouthProfile', 'cohort.baseSize out of min/max');
  }
  if (cohort.sizeVariance > 1) {
    throw new YouthGenerationError('InvalidYouthProfile', 'cohort.sizeVariance must be ≤ 1');
  }

  if (!isObject(raw.ages)) throw new YouthGenerationError('InvalidYouthProfile', 'ages required');
  const ages = {
    '15': reqNonNeg(raw.ages, '15'),
    '16': reqNonNeg(raw.ages, '16'),
    '17': reqNonNeg(raw.ages, '17'),
  } as WeightedAges;
  assertWeightsSumToOne(ages as unknown as Record<string, number>, 'ages');

  if (!isObject(raw.positions)) {
    throw new YouthGenerationError('InvalidYouthProfile', 'positions required');
  }
  const positions = {} as WeightedPositions;
  for (const p of POSITIONS) {
    positions[p] = reqNonNeg(raw.positions, p);
  }
  assertWeightsSumToOne(positions as unknown as Record<string, number>, 'positions');

  if (!isObject(raw.handedness)) {
    throw new YouthGenerationError('InvalidYouthProfile', 'handedness required');
  }
  const handedness = {
    LEFT: reqNonNeg(raw.handedness, 'LEFT'),
    RIGHT: reqNonNeg(raw.handedness, 'RIGHT'),
  } as WeightedHandedness;
  assertWeightsSumToOne(handedness as unknown as Record<string, number>, 'handedness');

  if (!isObject(raw.qualityTiers)) {
    throw new YouthGenerationError('InvalidYouthProfile', 'qualityTiers required');
  }
  const qualityTiers = {
    ELITE: reqNonNeg(raw.qualityTiers, 'ELITE'),
    HIGH: reqNonNeg(raw.qualityTiers, 'HIGH'),
    AVERAGE: reqNonNeg(raw.qualityTiers, 'AVERAGE'),
    LOW: reqNonNeg(raw.qualityTiers, 'LOW'),
    LONG_SHOT: reqNonNeg(raw.qualityTiers, 'LONG_SHOT'),
  } as WeightedQualityTiers;
  assertWeightsSumToOne(qualityTiers as unknown as Record<string, number>, 'qualityTiers');

  const ability = parseDistribution(raw.ability, 'ability');
  const potential = parseDistribution(raw.potential, 'potential');
  const developmentRate = parseDistribution(raw.developmentRate, 'developmentRate');

  if (
    ability.minimum < PLAYER_MODEL_CONFIG.attributeMin ||
    ability.maximum > PLAYER_MODEL_CONFIG.attributeMax
  ) {
    throw new YouthGenerationError(
      'InvalidYouthProfile',
      `ability bounds must be within ${PLAYER_MODEL_CONFIG.attributeMin}–${PLAYER_MODEL_CONFIG.attributeMax}`,
    );
  }
  if (
    potential.minimum < PLAYER_MODEL_CONFIG.ratingMin ||
    potential.maximum > PLAYER_MODEL_CONFIG.ratingMax
  ) {
    throw new YouthGenerationError(
      'InvalidYouthProfile',
      `potential bounds must be within ${PLAYER_MODEL_CONFIG.ratingMin}–${PLAYER_MODEL_CONFIG.ratingMax}`,
    );
  }
  if (
    developmentRate.minimum < PLAYER_MODEL_CONFIG.developmentRateMin ||
    developmentRate.maximum > PLAYER_MODEL_CONFIG.developmentRateMax
  ) {
    throw new YouthGenerationError('InvalidYouthProfile', 'developmentRate bounds invalid');
  }

  if (!isObject(raw.physical)) {
    throw new YouthGenerationError('InvalidYouthProfile', 'physical required');
  }
  if (!isObject(raw.physical.heightCmByPosition) || !isObject(raw.physical.weightKgByPosition)) {
    throw new YouthGenerationError('InvalidYouthProfile', 'physical position maps required');
  }
  const heightCmByPosition = {} as Record<YouthPosition, PhysicalRange>;
  const weightKgByPosition = {} as Record<YouthPosition, PhysicalRange>;
  for (const p of POSITIONS) {
    heightCmByPosition[p] = parsePhysicalRange(
      raw.physical.heightCmByPosition[p],
      `heightCmByPosition.${p}`,
    );
    weightKgByPosition[p] = parsePhysicalRange(
      raw.physical.weightKgByPosition[p],
      `weightKgByPosition.${p}`,
    );
  }

  if (!isObject(raw.attributeTendencies)) {
    throw new YouthGenerationError('InvalidYouthProfile', 'attributeTendencies required');
  }
  const tendencyKeys = [
    'skating',
    'shooting',
    'passing',
    'defense',
    'physical',
    'goalieAthleticism',
    'goalieTechnique',
  ] as const;
  const attributeTendencies = {} as CountryYouthProfile['attributeTendencies'];
  for (const k of tendencyKeys) {
    const v = reqNumber(raw.attributeTendencies, k);
    if (v < -1 || v > 1) {
      throw new YouthGenerationError(
        'InvalidYouthProfile',
        `attributeTendencies.${k} must be within [-1, 1]`,
      );
    }
    attributeTendencies[k] = v;
  }

  return {
    schemaVersion: YOUTH_GENERATION_SCHEMA_VERSION,
    countryKey: reqString(raw, 'countryKey'),
    enabled: raw.enabled,
    cohort,
    ages,
    positions,
    handedness,
    qualityTiers,
    ability,
    potential,
    developmentRate,
    physical: { heightCmByPosition, weightKgByPosition },
    attributeTendencies,
    namePoolKey: reqString(raw, 'namePoolKey'),
  };
}

export function canonicalizeCountryYouthProfile(profile: CountryYouthProfile): string {
  return JSON.stringify(sortJsonValue(profile));
}
