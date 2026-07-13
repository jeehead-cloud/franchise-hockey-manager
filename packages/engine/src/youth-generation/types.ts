/** F25 — Deterministic youth generation (pure types). */

export const YOUTH_GENERATION_SCHEMA_VERSION = 1 as const;

export type YouthPosition = 'C' | 'LW' | 'RW' | 'LD' | 'RD' | 'G';
export type YouthHandedness = 'LEFT' | 'RIGHT';
export type YouthQualityTier = 'ELITE' | 'HIGH' | 'AVERAGE' | 'LOW' | 'LONG_SHOT';

export interface WeightedAges {
  '15': number;
  '16': number;
  '17': number;
}

export interface WeightedPositions {
  C: number;
  LW: number;
  RW: number;
  LD: number;
  RD: number;
  G: number;
}

export interface WeightedHandedness {
  LEFT: number;
  RIGHT: number;
}

export interface WeightedQualityTiers {
  ELITE: number;
  HIGH: number;
  AVERAGE: number;
  LOW: number;
  LONG_SHOT: number;
}

export interface DistributionBounds {
  mean: number;
  standardDeviation: number;
  minimum: number;
  maximum: number;
}

export interface PhysicalRange {
  mean: number;
  standardDeviation: number;
  minimum: number;
  maximum: number;
}

export interface CountryYouthProfile {
  schemaVersion: typeof YOUTH_GENERATION_SCHEMA_VERSION;
  /** Logical country key used in engine (server maps to Country.id). */
  countryKey: string;
  enabled: boolean;
  cohort: {
    baseSize: number;
    sizeVariance: number;
    minimumSize: number;
    maximumSize: number;
  };
  ages: WeightedAges;
  positions: WeightedPositions;
  handedness: WeightedHandedness;
  qualityTiers: WeightedQualityTiers;
  /** Guides attribute generation (1–20 scale). */
  ability: DistributionBounds;
  /** Guides potentialCeiling generation (0–100 rating scale). */
  potential: DistributionBounds;
  /** Guides developmentRate (existing model 0.1–3). */
  developmentRate: DistributionBounds;
  physical: {
    heightCmByPosition: Record<YouthPosition, PhysicalRange>;
    weightKgByPosition: Record<YouthPosition, PhysicalRange>;
  };
  attributeTendencies: {
    skating: number;
    shooting: number;
    passing: number;
    defense: number;
    physical: number;
    goalieAthleticism: number;
    goalieTechnique: number;
  };
  namePoolKey: string;
}

export interface NamePoolInput {
  poolKey: string;
  firstNames: string[];
  lastNames: string[];
}

export interface YouthGenerationCountryInput {
  countryKey: string;
  countryId: string;
  countryName: string;
  profile: CountryYouthProfile;
  namePool: NamePoolInput;
  namePoolVersionId: string;
  namePoolHash: string;
  profileHash: string;
}

export interface GeneratedYouthPlayer {
  generationIndex: number;
  countryKey: string;
  countryId: string;
  firstName: string;
  lastName: string;
  displayName: string;
  dateOfBirth: string;
  ageOnReferenceDate: 15 | 16 | 17;
  primaryNationalityCountryId: string;
  position: YouthPosition;
  shoots: YouthHandedness;
  heightCm: number;
  weightKg: number;
  qualityTier: YouthQualityTier;
  attributes: Record<string, number>;
  currentAbility: number;
  potentialFloor: number;
  potentialCeiling: number;
  developmentRate: number;
  developmentRisk: number;
  heroRating: number;
  stability: number;
  preferredCoachingStyle: string;
  preferredTactics: string;
  personality: string;
  publicPotentialEstimate: string;
  role: string;
  form: number;
  lifecycleStatus: 'PROSPECT';
  sourceType: 'GENERATED_YOUTH';
  currentTeamId: null;
  generationHash: string;
  warnings: string[];
}

export interface GeneratedYouthCohort {
  countryKey: string;
  countryId: string;
  countryName: string;
  cohortOrder: number;
  profileHash: string;
  namePoolVersionId: string;
  namePoolHash: string;
  plannedSize: number;
  generatedSize: number;
  age15Count: number;
  age16Count: number;
  age17Count: number;
  skaterCount: number;
  goalieCount: number;
  players: GeneratedYouthPlayer[];
  cohortHash: string;
  warnings: string[];
}

export interface YouthGenerationRunResult {
  cohorts: GeneratedYouthCohort[];
  players: GeneratedYouthPlayer[];
  summary: {
    countryCount: number;
    enabledCountryCount: number;
    totalPlannedPlayers: number;
    totalGeneratedPlayers: number;
    age15Count: number;
    age16Count: number;
    age17Count: number;
    skaterCount: number;
    goalieCount: number;
    warningCount: number;
    duplicateNameCount: number;
    inputHash: string;
    resultHash: string;
  };
}

export class YouthGenerationError extends Error {
  code: string;
  details?: unknown;

  constructor(code: string, message: string, details?: unknown) {
    super(message);
    this.name = 'YouthGenerationError';
    this.code = code;
    this.details = details;
  }
}
