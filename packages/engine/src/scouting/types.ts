import type {
  GoalieAttributeKey,
  GoalieAttributes,
  SkaterAttributeKey,
  SkaterAttributes,
} from '../players/types.js';

export const SCOUTING_SCHEMA_VERSION = 1 as const;
export type ScoutSpecialty = 'GENERAL' | 'SKATER' | 'GOALIE' | 'POTENTIAL';
export type PlayerTruth =
  | {
      playerId: string;
      countryKey: string;
      position: 'LW' | 'RW' | 'C' | 'LD' | 'RD';
      kind: 'skater';
      attributes: SkaterAttributes;
      currentAbility: number;
      potential: { floor: number; ceiling: number };
      role: string;
      stateHash?: string;
    }
  | {
      playerId: string;
      countryKey: string;
      position: 'G';
      kind: 'goalie';
      attributes: GoalieAttributes;
      currentAbility: number;
      potential: { floor: number; ceiling: number };
      role: string;
      stateHash?: string;
    };

export interface ScoutInput {
  scoutId: string;
  ratings: { evaluating: number; potential: number; skater: number; goalie: number };
  specialties: ScoutSpecialty[];
  countryFamiliarity: Record<string, number>;
  positionGroupFamiliarity: Partial<Record<'forward' | 'defense' | 'goalie', number>>;
  persistentBias: number;
}

export interface ScoutingConfig {
  schemaVersion: typeof SCOUTING_SCHEMA_VERSION;
  observation: {
    minDurationDays: number;
    maxDurationDays: number;
    maximumPlayersPerAssignment: number;
    maximumObservationsPerScoutPlayerState: number;
    baseNoise: number;
    unknownConfidence: number;
    potentialUncertaintyMultiplier: number;
  };
  confidence: { durationCapDays: number; repeatDiminishing: number; diversityBonus: number };
  reporting: { strengthThreshold: number; weaknessThreshold: number; maxHighlights: number };
}

export interface ScoutingAssignment {
  assignmentId: string;
  teamId: string;
  seed: string;
  observedOn: string;
  durationDays: number;
}

export interface AttributeEstimate {
  estimate: number | null;
  low: number | null;
  high: number | null;
  confidence: number;
}

export interface ScoutingObservation {
  schemaVersion: typeof SCOUTING_SCHEMA_VERSION;
  observationId: string;
  playerId: string;
  scoutId: string;
  teamId: string;
  assignmentId: string;
  observedOn: string;
  durationDays: number;
  playerKind: PlayerTruth['kind'];
  attributes: Record<string, AttributeEstimate>;
  currentAbility: AttributeEstimate;
  potential: AttributeEstimate;
  confidence: number;
  sourcePlayerStateHash: string;
}

export interface ScoutingReport {
  schemaVersion: typeof SCOUTING_SCHEMA_VERSION;
  playerId: string;
  playerKind: PlayerTruth['kind'];
  observations: number;
  attributes: Record<string, AttributeEstimate>;
  currentAbility: AttributeEstimate;
  potential: AttributeEstimate;
  confidence: number;
  strengths: string[];
  weaknesses: string[];
  sourcePlayerStateHash: string;
  reportHash: string;
}

export interface SuggestedRankingInput {
  playerId: string;
  report: Pick<ScoutingReport, 'currentAbility' | 'potential' | 'confidence' | 'strengths' | 'weaknesses'>;
  manualPriority?: number;
}

export interface SuggestedRanking {
  playerId: string;
  score: number;
  reason: string;
}

export interface StalenessResult {
  stale: boolean;
  currentStateHash: string;
  reportStateHash: string;
}

export interface ScoutingReconciliationIssue {
  code: string;
  message: string;
}

export interface ScoutingReconciliationResult {
  valid: boolean;
  issues: ScoutingReconciliationIssue[];
}

export type ScoutingAttributeKey = SkaterAttributeKey | GoalieAttributeKey;
