export const BALANCE_SCHEMA_VERSION = 3 as const;

export const BALANCE_SCHEMA_VERSIONS = [1, 2, 3] as const;

export const SHOT_TYPES = ['WRIST', 'SLAP', 'SNAP', 'BACKHAND', 'TIP', 'DEFLECTION'] as const;

export type ShotType = (typeof SHOT_TYPES)[number];

export type RoleShotTendencyTier = 'high' | 'medium' | 'low';

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
  offensiveZoneShotOpportunityProbability: number;
  offensiveZoneContinuedPossessionProbability: number;
}

export interface ShotsBalanceSection {
  active: true;
  shotTypeWeights: Record<ShotType, number>;
  roleShotTendencyMultipliers: Record<RoleShotTendencyTier, number>;
  roleShotTendencies: Record<string, RoleShotTendencyTier>;
  shooterAttributeWeights: {
    shooting: number;
    offensiveAwareness: number;
    currentAbility: number;
  };
  shotQualityWeights: {
    shooting: number;
    offensiveAwareness: number;
    stickhandling: number;
    attackingUnitEffectivePerformance: number;
    defensivePressure: number;
  };
  passQualityContribution: number;
  screenContribution: number;
  deflectionContribution: number;
  defensivePressureWeights: {
    defensiveAwareness: number;
    strength: number;
    balance: number;
    defendingUnitEffectivePerformance: number;
  };
  blockProbability: number;
  missProbability: number;
  onTargetFloor: number;
  onTargetCeiling: number;
  goalProbabilityFloor: number;
  goalProbabilityCeiling: number;
  shotQualityVariance: number;
}

export interface GoaliesBalanceSection {
  active: true;
  attributeWeightsByShotType: Record<
    ShotType,
    Partial<
      Record<
        | 'reflexes'
        | 'positioning'
        | 'reboundControl'
        | 'glove'
        | 'blocker'
        | 'movement'
        | 'puckHandling'
        | 'consistency'
        | 'stamina',
        number
      >
    >
  >;
  saveProbabilityCurve: {
    intercept: number;
    shotQualitySlope: number;
  };
  consistencyVarianceEffect: number;
  reboundOutcomeWeights: {
    controlled: number;
    rebound: number;
    frozen: number;
  };
  screenPenalty: number;
  lateralMovementEffect: number;
}

export interface BalanceConfig extends BalanceMetadata {
  randomness: RandomnessConfig;
  playerModel: PlayerModelBalanceSection;
  chemistry: ChemistryBalanceSection;
  tactics: ActiveTacticsSection;
  match: MatchBalanceSection | InactiveSection;
  shots: ShotsBalanceSection | InactiveSection;
  goalies: GoaliesBalanceSection | InactiveSection;
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
