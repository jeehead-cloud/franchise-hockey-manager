export const CONTRACT_SCHEMA_VERSION = 1 as const;

export type ContractStatus = 'FUTURE' | 'ACTIVE' | 'EXPIRED' | 'TERMINATED' | 'CANCELLED';
export type ContractType = 'STANDARD' | 'ENTRY';
export type ContractOfferType = 'EXTENSION' | 'FREE_AGENT' | 'DRAFT_RIGHTS';
export type ExtensionRecommendationType = 'RECOMMEND_EXTEND' | 'RECOMMEND_RELEASE' | 'REVIEW';

export interface ContractAbilityBand {
  minimumAbility: number;
  maximumAbility: number;
  baseSalary: number;
}

export interface ContractConfig {
  schemaVersion: 1;
  salary: {
    minimum: number;
    maximum: number;
    roundingIncrement: number;
    abilityBands: ContractAbilityBand[];
  };
  term: {
    minimumYears: number;
    maximumYears: number;
    youngPlayerMaximumYears: number;
    veteranMaximumYears: number;
  };
  recommendation: {
    ageWeight: number;
    abilityWeight: number;
    roleWeight: number;
    recentPerformanceWeight: number;
    developmentTrendWeight: number;
    retirementRiskWeight: number;
  };
  offers: {
    minimumOfferDurationYears: number;
    maximumOpenOffersPerPlayer: number;
    offerExpirationSeasonOffset: number;
  };
  rights: { requireActiveDraftRightForDraftedProspect: boolean };
}

export interface ContractSeasonRef { id: string; order: number; label?: string }
export interface ContractRange { id?: string; startOrder: number; endOrder: number; status: ContractStatus }

export interface ContractPlayerInput {
  playerId: string;
  dateOfBirth: string;
  effectiveDate: string;
  currentAbility: number;
  roleRating?: number | null;
  recentPerformance?: number | null;
  developmentTrend?: number | null;
  rosterStatus: string;
  currentTeamId: string | null;
  activeContractTeamId?: string | null;
  hasFutureContract?: boolean;
  activeDraftRightTeamId?: string | null;
  currentAnnualSalary?: number | null;
}

export interface ContractValuation {
  recommendedAnnualSalary: number;
  recommendedTermYears: number;
  minimumReasonableSalary: number;
  maximumReasonableSalary: number;
  recommendationConfidence: number;
  factors: string[];
  recommendationHash: string;
}

export interface ExtensionRecommendation extends ContractValuation {
  recommendationType: ExtensionRecommendationType;
}

export interface OfferTerms {
  offerType: ContractOfferType;
  offeringTeamId: string;
  startSeason: ContractSeasonRef;
  endSeason: ContractSeasonRef;
  annualSalary: number;
}

export interface OfferComparisonInput { offerId: string; annualSalary: number; years: number; submittedAt?: string }
export interface ExpirationContractInput extends ContractRange { playerId: string; teamId: string }
export interface ExpirationDecision { contractId?: string; playerId: string; action: 'NONE' | 'EXPIRE_TO_FREE_AGENT' | 'EXPIRE_AND_ACTIVATE_FUTURE'; futureContractId?: string }
export interface ReconciliationIssue { code: string; playerId?: string; message: string }

export class ContractEngineError extends Error {
  constructor(public code: string, message: string) { super(message); this.name = code; }
}
