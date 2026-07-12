export type ChemistryCoachingStyle =
  | 'AUTHORITARIAN'
  | 'AUTHORITATIVE'
  | 'DEMOCRATIC'
  | 'DEVELOPMENTAL'
  | 'HANDS_OFF';

export type ChemistryTacticalStyle =
  | 'COMBINATIONAL'
  | 'PHYSICAL'
  | 'SPEED'
  | 'SYSTEM'
  | 'FORECHECKING';

export type ChemistryPersonality =
  | 'LEADER'
  | 'COMPETITOR'
  | 'PROFESSIONAL'
  | 'CREATIVE'
  | 'GLUE';

export type ChemistryUnitType = 'FORWARD_LINE' | 'DEFENSE_PAIR' | 'GOALIE';

export type ChemistryLabel = 'POOR' | 'WEAK' | 'NEUTRAL' | 'GOOD' | 'EXCELLENT';

export type ChemistryUnitStatus = 'AVAILABLE' | 'UNAVAILABLE';

export interface ChemistryPlayerInput {
  id: string;
  position: 'LW' | 'RW' | 'C' | 'LD' | 'RD' | 'G';
  currentAbility: number;
  role: string;
  roleRating: number;
  personality: ChemistryPersonality;
  preferredCoachingStyle: ChemistryCoachingStyle;
  preferredTactics: ChemistryTacticalStyle;
}

export interface ChemistryCoachInput {
  coachingStyle: ChemistryCoachingStyle;
  tacticalStyle: ChemistryTacticalStyle;
  overallCoaching: number;
  offense: number;
  defense: number;
}

export interface ChemistryContext {
  coach: ChemistryCoachInput | null;
  teamTacticalStyle: ChemistryTacticalStyle | null;
  familiarity?: number;
}

export interface ChemistryFactor {
  code: string;
  label: string;
  impact: number;
  direction: 'POSITIVE' | 'NEGATIVE' | 'NEUTRAL';
  details: string;
}

export interface ChemistryUnitResult {
  unitType: ChemistryUnitType;
  unitKey: string;
  status: ChemistryUnitStatus;
  playerIds: string[];
  baseAbility: number | null;
  roleCompatibility: number | null;
  personalityCompatibility: number | null;
  baseCompatibility: number | null;
  familiarity: number;
  familiarityStatus: 'NOT_TRACKED_YET';
  currentChemistry: number | null;
  label: ChemistryLabel | null;
  coachFit: number | null;
  tacticalFit: number | null;
  totalModifier: number | null;
  effectivePerformance: number | null;
  factors: ChemistryFactor[];
  warnings: string[];
  unavailableReasons: string[];
}

export interface LineupChemistrySummary {
  chemistryConfigVersion: string;
  balance: {
    presetName: string;
    versionNumber: number;
    configHash: string;
    schemaVersion: number;
  } | null;
  forwardLines: ChemistryUnitResult[];
  defensePairs: ChemistryUnitResult[];
  goalies: {
    starter: ChemistryUnitResult;
    backup: ChemistryUnitResult;
  };
  overall: {
    averageForwardEffective: number | null;
    averageDefenseEffective: number | null;
    starterGoalieEffective: number | null;
    averageChemistry: number | null;
    goodOrExcellentUnits: number;
    weakOrPoorUnits: number;
    availableUnits: number;
    unavailableUnits: number;
  };
  warnings: string[];
}

export interface EvaluateUnitInput {
  unitType: ChemistryUnitType;
  unitKey: string;
  players: ChemistryPlayerInput[];
  context: ChemistryContext;
  chemistryConfig?: import('./config.js').ChemistryRuntimeConfig;
}
