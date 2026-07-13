/** F24 player development — pure types (no Prisma / I/O). */

export const PLAYER_DEVELOPMENT_SCHEMA_VERSION = 1 as const;

export type DevelopmentPlayerType = 'SKATER' | 'GOALIE';

export type DevelopmentOutcome = 'DEVELOPED' | 'DECLINED' | 'STABLE' | 'RETIRED';

export type DevelopmentDirection = 'UP' | 'DOWN' | 'FLAT';

export interface AgeCurveConfig {
  earlyDevelopmentStart: number;
  rapidDevelopmentEnd: number;
  primeStart: number;
  primeEnd: number;
  declineStart: number;
  steepDeclineStart: number;
}

export interface AnnualBudgetConfig {
  minimum: number;
  maximum: number;
  youngBase: number;
  primeBase: number;
  declineBase: number;
  steepDeclineBase: number;
}

export interface PotentialConfig {
  ceilingSoftness: number;
  overPotentialTolerance: number;
  lowPotentialGrowthPenalty: number;
}

export interface VarianceConfig {
  developmentRandomness: number;
  declineRandomness: number;
  attributeRandomness: number;
}

export interface FormConfig {
  annualRegressionToMean: number;
  minimum: number;
  maximum: number;
}

export interface RetirementConfig {
  minimumEvaluationAgeSkater: number;
  minimumEvaluationAgeGoalie: number;
  forcedRetirementAge: number;
  baseProbabilityAtMinimumAge: number;
  annualProbabilityGrowth: number;
  lowAbilityModifier: number;
  unsignedModifier: number;
}

export interface AttributeLimitsConfig {
  minimum: number;
  maximum: number;
}

export interface PlayerDevelopmentConfig {
  schemaVersion: typeof PLAYER_DEVELOPMENT_SCHEMA_VERSION;
  ageCurves: {
    skater: AgeCurveConfig;
    goalie: AgeCurveConfig;
  };
  annualBudget: AnnualBudgetConfig;
  potential: PotentialConfig;
  variance: VarianceConfig;
  form: FormConfig;
  retirement: RetirementConfig;
  attributeLimits: AttributeLimitsConfig;
}

export interface DevelopmentPlayerInput {
  playerId: string;
  playerType: DevelopmentPlayerType;
  birthDate: string; // YYYY-MM-DD
  position: string;
  currentRole: string;
  lifecycleStatus: string;
  currentTeamId: string | null;
  currentTeamName: string | null;
  currentAbility: number;
  potentialCeiling: number;
  potentialFloor: number;
  form: number;
  attributes: Record<string, number>;
  contractStatus: 'SIGNED' | 'UNSIGNED' | 'UNKNOWN';
  sourceType: string;
  developmentRate?: number | null;
}

export interface BudgetBreakdown {
  baseBudget: number;
  ageModifier: number;
  potentialModifier: number;
  usageModifier: number;
  varianceModifier: number;
  finalBudget: number;
}

export interface AttributeChange {
  attributeKey: string;
  beforeValue: number;
  delta: number;
  afterValue: number;
  groupKey: string;
}

export interface FormChange {
  formBefore: number;
  regression: number;
  variance: number;
  formAfter: number;
}

export interface RetirementDecision {
  retired: boolean;
  forced: boolean;
  probability: number;
  sample: number;
  reasonText: string;
}

export interface DevelopmentPlayerResult {
  playerId: string;
  playerType: DevelopmentPlayerType;
  position: string;
  ageOnEffectiveDate: number;
  lifecycleBefore: string;
  lifecycleAfter: string;
  currentAbilityBefore: number;
  currentAbilityAfter: number;
  potentialCeiling: number;
  roleBefore: string;
  roleAfter: string;
  roleChanged: boolean;
  form: FormChange;
  budget: BudgetBreakdown;
  usedBudget: number;
  unusedBudget: number;
  direction: DevelopmentDirection;
  outcome: DevelopmentOutcome;
  retired: boolean;
  retirement: RetirementDecision | null;
  attributeChanges: AttributeChange[];
  attributesAfter: Record<string, number>;
  resultHash: string;
  warnings: string[];
}

export interface DevelopmentRunSummary {
  totalPlayers: number;
  developedCount: number;
  declinedCount: number;
  stableCount: number;
  retiredCount: number;
  warningCount: number;
  averageAbilityChange: number;
  inputHash: string;
  resultHash: string;
}

export class PlayerDevelopmentError extends Error {
  code: string;
  details?: unknown;

  constructor(code: string, message: string, details?: unknown) {
    super(message);
    this.name = 'PlayerDevelopmentError';
    this.code = code;
    this.details = details;
  }
}
