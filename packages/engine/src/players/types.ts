export type SkaterPosition = 'LW' | 'RW' | 'C' | 'LD' | 'RD';
export type GoaliePosition = 'G';
export type PlayerPosition = SkaterPosition | GoaliePosition;

export type SkaterAttributeKey =
  | 'stickhandling'
  | 'shooting'
  | 'passing'
  | 'strength'
  | 'speed'
  | 'balance'
  | 'aggression'
  | 'offensiveAwareness'
  | 'defensiveAwareness';

export type GoalieAttributeKey =
  | 'reflexes'
  | 'positioning'
  | 'reboundControl'
  | 'glove'
  | 'blocker'
  | 'movement'
  | 'puckHandling'
  | 'consistency'
  | 'stamina';

export type SkaterAttributes = Record<SkaterAttributeKey, number>;
export type GoalieAttributes = Record<GoalieAttributeKey, number>;

export type PublicPotentialEstimate = 'LOW' | 'STANDARD' | 'HIGH' | 'ELITE' | 'UNKNOWN';
export type ModelStatus = 'COMPLETE' | 'INCOMPLETE';

export type CoachingPreference =
  | 'AUTHORITARIAN'
  | 'AUTHORITATIVE'
  | 'DEMOCRATIC'
  | 'DEVELOPMENTAL'
  | 'HANDS_OFF';

export type TacticsPreference =
  | 'COMBINATIONAL'
  | 'PHYSICAL'
  | 'SPEED'
  | 'SYSTEM'
  | 'FORECHECKING';

export type Personality =
  | 'LEADER'
  | 'COMPETITOR'
  | 'PROFESSIONAL'
  | 'CREATIVE'
  | 'GLUE';

export const SKATER_ATTRIBUTE_KEYS: SkaterAttributeKey[] = [
  'stickhandling',
  'shooting',
  'passing',
  'strength',
  'speed',
  'balance',
  'aggression',
  'offensiveAwareness',
  'defensiveAwareness',
];

export const GOALIE_ATTRIBUTE_KEYS: GoalieAttributeKey[] = [
  'reflexes',
  'positioning',
  'reboundControl',
  'glove',
  'blocker',
  'movement',
  'puckHandling',
  'consistency',
  'stamina',
];

export interface SkaterRoleResult {
  role: string;
  roleLabel: string;
  roleRating: number;
  winningPair: { a: SkaterAttributeKey; b: SkaterAttributeKey };
  pairScore: number;
  explanation: string;
}

export interface GoalieRoleResult {
  role: string;
  roleLabel: string;
  roleRating: number;
  profileScore: number;
  explanation: string;
}

export interface SkaterRatings {
  currentAbility: number;
  offensiveRating: number;
  defensiveRating: number;
  roleRating: number;
}

export interface GoalieRatings {
  currentAbility: number;
  roleRating: number;
}

export interface PlayerModelProfileInput {
  preferredCoachingStyle: CoachingPreference;
  preferredTactics: TacticsPreference;
  personality: Personality;
  heroRating: number;
  stability: number;
  developmentRate: number;
  developmentRisk: number;
  potentialFloor: number;
  potentialCeiling: number;
  publicPotentialEstimate: PublicPotentialEstimate;
}

export interface CompleteSkaterInput extends PlayerModelProfileInput {
  primaryPosition: SkaterPosition;
  skaterAttributes: SkaterAttributes;
}

export interface CompleteGoalieInput extends PlayerModelProfileInput {
  primaryPosition: GoaliePosition;
  goalieAttributes: GoalieAttributes;
}

export type CompletePlayerModelInput = CompleteSkaterInput | CompleteGoalieInput;

export interface DerivedSkaterModel {
  kind: 'skater';
  modelStatus: 'COMPLETE';
  attributes: SkaterAttributes;
  ratings: SkaterRatings;
  role: SkaterRoleResult;
  publicPotentialEstimate: PublicPotentialEstimate;
  preferredCoachingStyle: CoachingPreference;
  preferredTactics: TacticsPreference;
  personality: Personality;
  heroRating: number;
  stability: number;
  developmentRate: number;
}

export interface DerivedGoalieModel {
  kind: 'goalie';
  modelStatus: 'COMPLETE';
  attributes: GoalieAttributes;
  ratings: GoalieRatings;
  role: GoalieRoleResult;
  publicPotentialEstimate: PublicPotentialEstimate;
  preferredCoachingStyle: CoachingPreference;
  preferredTactics: TacticsPreference;
  personality: Personality;
  heroRating: number;
  stability: number;
  developmentRate: number;
}

export type DerivedPlayerModel = DerivedSkaterModel | DerivedGoalieModel;

/** Hidden fields — never put these on ordinary public DTOs. */
export interface HiddenPotential {
  potentialFloor: number;
  potentialCeiling: number;
  developmentRisk: number;
}
