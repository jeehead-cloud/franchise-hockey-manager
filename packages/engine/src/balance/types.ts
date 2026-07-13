export const BALANCE_SCHEMA_VERSION = 5 as const;

export const BALANCE_SCHEMA_VERSIONS = [1, 2, 3, 4, 5] as const;

export const SHOT_TYPES = ['WRIST', 'SLAP', 'SNAP', 'BACKHAND', 'TIP', 'DEFLECTION'] as const;

export type ShotType = (typeof SHOT_TYPES)[number];

export const PENALTY_INFRACTIONS = [
  'TRIPPING',
  'HOOKING',
  'HOLDING',
  'INTERFERENCE',
  'SLASHING',
  'ROUGHING',
] as const;

export type PenaltyInfraction = (typeof PENALTY_INFRACTIONS)[number];

export type RoleShotTendencyTier = 'high' | 'medium' | 'low';

export type RolePenaltyTendencyTier = 'high' | 'medium' | 'low';

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

export interface OvertimeBalanceConfig {
  enabled: boolean;
  durationSeconds: number;
  skaterCount: 3;
  generatePenalties: false;
  suddenDeath: boolean;
  possessionModifier: number;
  shotOpportunityModifier: number;
}

export interface ShootoutBalanceConfig {
  enabled: boolean;
  initialRounds: number;
  suddenDeath: boolean;
  shooterWeights: {
    shooting: number;
    offensiveAwareness: number;
    stickhandling: number;
    currentAbility: number;
  };
  goalieWeights: {
    reflexes: number;
    positioning: number;
    consistency: number;
  };
  probabilityFloor: number;
  probabilityCeiling: number;
  heroRatingWeight: number;
}

export interface MatchCompletionBalanceSection {
  active: true;
  overtime: OvertimeBalanceConfig;
  shootout: ShootoutBalanceConfig;
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

export interface PenaltiesBalanceSection {
  active: true;
  enabled: true;
  baseOpportunityProbability: number;
  minimumSecondsBetweenPenalties: number;
  durationSeconds: number;
  infractionWeights: Record<PenaltyInfraction, number>;
  aggressionWeight: number;
  defensiveAwarenessWeight: number;
  pressureWeight: number;
  rolePenaltyTendencies: Record<string, RolePenaltyTendencyTier>;
  rolePenaltyTendencyMultipliers: { high: number; medium: number; low: number };
  penaltyVariance: number;
  powerPlayPossessionModifier: number;
  penaltyKillPossessionModifier: number;
  powerPlayShotOpportunityModifier: number;
  powerPlayShotQualityModifier: number;
  shortHandedShotOpportunityModifier: number;
  powerPlayAttackWeights: {
    offensiveRating: number;
    passing: number;
    shooting: number;
    offensiveAwareness: number;
    coachOffense: number;
  };
  penaltyKillDefenseWeights: {
    defensiveRating: number;
    defensiveAwareness: number;
    speed: number;
    strength: number;
    coachDefense: number;
  };
  maximumActivePenalties: 1;
  allowCoincidental: false;
  allowFiveOnThree: false;
  allowFourOnFour: false;
}

export interface BalanceConfig extends BalanceMetadata {
  randomness: RandomnessConfig;
  playerModel: PlayerModelBalanceSection;
  chemistry: ChemistryBalanceSection;
  tactics: ActiveTacticsSection;
  match: MatchBalanceSection | InactiveSection;
  shots: ShotsBalanceSection | InactiveSection;
  goalies: GoaliesBalanceSection | InactiveSection;
  penalties: PenaltiesBalanceSection | InactiveSection;
  matchCompletion?: MatchCompletionBalanceSection | InactiveSection;
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
