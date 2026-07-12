export const BALANCE_SCHEMA_VERSION = 2 as const;

export const BALANCE_SCHEMA_VERSIONS = [1, 2] as const;

export type LoggingLevel = 'MINIMAL' | 'STANDARD' | 'DETAILED' | 'DEBUG';

export interface BalanceMetadata {
  schemaVersion: typeof BALANCE_SCHEMA_VERSION | number;
  presetKey: string;
  name: string;
  description: string | null;
  engineCompatibility: {
    minimumEngineVersion: string;
  };
}

export interface RandomnessConfig {
  simulationRandomness: number;
  eventVariance: number;
  finishingVariance: number;
  goalieVariance: number;
  penaltyVariance: number;
  upsetStrength: number;
}

export interface InactiveSection {
  active: false;
  status: 'INACTIVE_UNTIL_MILESTONE';
  milestone: string;
  notes: string;
}

export interface ActiveTacticsSection {
  active: true;
  notes: string;
}

export interface ChemistryWeightsSection {
  version: string;
  weights: {
    roleCompatibility: number;
    personalityCompatibility: number;
  };
  roleRatingBaseContribution: number;
  caps: {
    chemistry: number;
    coachFit: number;
    tacticalFit: number;
    totalMin: number;
    totalMax: number;
  };
  labels: Array<{ maxExclusive: number; label: string }>;
  missingCoachFit: number;
  missingTacticsFit: number;
  coachRatingScale: {
    minOverall: number;
    maxOverall: number;
    minMultiplier: number;
    maxMultiplier: number;
  };
  coachAlignmentWeight: number;
  playerTacticsWeight: number;
}

export interface PairScoreSection {
  defaultPairScore: number;
  pairs: Record<string, number>;
}

export interface StyleMatrixSection {
  defaultScore: number;
  matrix: Record<string, Record<string, number>>;
}

export interface ChemistryBalanceSection {
  active: true;
  weights: ChemistryWeightsSection;
  roleCompatibility: PairScoreSection;
  personalityCompatibility: PairScoreSection;
  coachFit: StyleMatrixSection;
  tacticalFit: StyleMatrixSection;
}

export interface PlayerModelBalanceSection {
  active: true;
  attributeMin: number;
  attributeMax: number;
  ratingMin: number;
  ratingMax: number;
  heroRatingMin: number;
  heroRatingMax: number;
  stabilityMin: number;
  stabilityMax: number;
  developmentRateMin: number;
  developmentRateMax: number;
  developmentRiskMin: number;
  developmentRiskMax: number;
  ratingWeights: Record<string, unknown>;
  skaterRoles: Record<string, unknown>;
  goalieRoles: Record<string, unknown>;
  notes?: string;
}

export interface MatchBalanceSection {
  active: true;
  regulationPeriods: number;
  periodDurationSeconds: number;
  minimumShiftSeconds: number;
  maximumShiftSeconds: number;
  averageShiftSeconds: number;
  minimumPossessionSeconds: number;
  maximumPossessionSeconds: number;
  stoppageSeconds: number;
  homeIcePossessionBonus: number;
  faceoffHomeAdvantage: number;
  turnoverBaseProbability: number;
  eventSafetyLimit: number;
  forwardLineUsageWeights: Record<string, number>;
  defensePairUsageWeights: Record<string, number>;
  zoneTransitionWeights: {
    neutralZoneEntry: number;
    defensiveZoneExit: number;
    offensiveHold: number;
    offensiveTurnover: number;
    offensiveStoppage: number;
  };
}

export interface BalanceConfig extends BalanceMetadata {
  randomness: RandomnessConfig;
  playerModel: PlayerModelBalanceSection;
  chemistry: ChemistryBalanceSection;
  tactics: ActiveTacticsSection;
  match: MatchBalanceSection | InactiveSection;
  shots: InactiveSection;
  goalies: InactiveSection;
  penalties: InactiveSection;
  development: InactiveSection;
  scouting: InactiveSection;
  draft: InactiveSection;
  contracts: InactiveSection;
  aggregatedLeagues: InactiveSection;
}

export interface RuntimeSimulationSettings {
  simulationRandomness: number;
  randomSeed: number | null;
  loggingLevel: LoggingLevel;
}

export interface BalanceValidationIssue {
  path: string;
  message: string;
}

export type BalanceValidationResult =
  | { ok: true; config: BalanceConfig }
  | { ok: false; errors: BalanceValidationIssue[] };
