/** F22 National Teams — pure types (database-neutral). */

export const NATIONAL_TEAM_ELIGIBILITY_SCHEMA_VERSION = 1 as const;

export type NationalTeamCategory = 'SENIOR_MEN' | 'JUNIOR_U20';

export type NationalityRuleMode =
  | 'PRIMARY_NATIONALITY'
  | 'ANY_CITIZENSHIP'
  | 'BIRTH_COUNTRY_OR_CITIZENSHIP';

export type AgeRuleMode = 'NONE' | 'MAX_AGE_ON_DATE';

export interface NationalityRule {
  mode: NationalityRuleMode;
}

export interface AgeRule {
  mode: AgeRuleMode;
  /** Inclusive max age on cutoffDate when mode is MAX_AGE_ON_DATE. */
  maxAge?: number;
  /** ISO date YYYY-MM-DD — no wall-clock dependency. */
  cutoffDate?: string;
}

export interface RosterLimits {
  minimumPlayers: number;
  maximumPlayers: number;
  minimumForwards: number;
  minimumDefensemen: number;
  minimumGoalies: number;
  maximumGoalies: number;
  targetForwards: number;
  targetDefensemen: number;
  targetGoalies: number;
  maximumAlternateCaptains: number;
}

export interface SelectionRules {
  minimumEligibleAbility: number;
  allowInjured: boolean;
  allowUnsigned: boolean;
}

export interface NationalTeamEligibilityRules {
  schemaVersion: typeof NATIONAL_TEAM_ELIGIBILITY_SCHEMA_VERSION;
  category: NationalTeamCategory;
  nationalityRule: NationalityRule;
  ageRule: AgeRule;
  rosterLimits: RosterLimits;
  selection: SelectionRules;
}

export type NationalTeamEditionStatus =
  | 'PLANNED'
  | 'PREPARING'
  | 'READY'
  | 'LOCKED'
  | 'CANCELLED';

export type EligibilityStatus = 'ELIGIBLE' | 'INELIGIBLE' | 'MANUALLY_EXCLUDED';

export type RosterRole = 'FORWARD' | 'DEFENSE' | 'GOALIE' | 'RESERVE';

export type CaptainRole = 'NONE' | 'CAPTAIN' | 'ALTERNATE';

export type SelectionSource = 'SUGGESTED' | 'MANUAL' | 'IMPORTED';

export type NationalTeamStaffRole = 'HEAD_COACH' | 'ASSISTANT_COACH' | 'GOALIE_COACH';

export type NationalTeamLineUnitType =
  | 'FORWARD_LINE'
  | 'DEFENSE_PAIR'
  | 'GOALIE'
  | 'PP'
  | 'PK'
  | 'OT';

export type NationalTeamLineSlotType =
  | 'LW'
  | 'C'
  | 'RW'
  | 'LD'
  | 'RD'
  | 'STARTER'
  | 'BACKUP'
  | 'THIRD'
  | 'F1'
  | 'F2'
  | 'F3'
  | 'D1'
  | 'D2';

/** Pure candidate DTO — no hidden potential. */
export interface NationalTeamPlayerInput {
  playerId: string;
  displayName: string;
  birthDate: string | null;
  primaryNationalityCountryId: string;
  citizenshipCountryIds: string[];
  birthCountryId: string | null;
  position: string;
  shoots: string | null;
  currentAbility: number;
  effectivePerformance: number;
  clubTeamId: string | null;
  clubTeamName: string | null;
  injuryStatus: 'HEALTHY' | 'INJURED' | 'UNKNOWN';
  activeStatus: 'ACTIVE' | 'INACTIVE' | 'UNSIGNED';
}

export interface EligibilityEvaluation {
  playerId: string;
  status: EligibilityStatus;
  reasons: string[];
  ageAtCutoff: number | null;
}

export interface RankedCandidate {
  playerId: string;
  rankingScore: number;
  rankingOrder: number;
  positionGroup: 'FORWARD' | 'DEFENSE' | 'GOALIE';
  evaluation: EligibilityEvaluation;
}

export interface SuggestedRosterPlayer {
  playerId: string;
  rosterRole: RosterRole;
  rosterOrder: number;
  selectionSource: 'SUGGESTED';
}

export interface SuggestedRosterResult {
  players: SuggestedRosterPlayer[];
  eligibleCount: number;
  selectedCount: number;
  forwardCount: number;
  defenseCount: number;
  goalieCount: number;
  reserveCount: number;
  warnings: string[];
  rosterHash: string;
  excludedTopCandidates: Array<{ playerId: string; reason: string }>;
}

export interface RosterPlayerInput {
  playerId: string;
  positionSnapshot: string;
  rosterRole: RosterRole;
  rosterOrder: number;
  jerseyNumber: number | null;
  captainRole: CaptainRole;
  selectionSource: SelectionSource;
}

export interface RosterValidationIssue {
  code: string;
  message: string;
}

export interface LineupSlotInput {
  unitType: NationalTeamLineUnitType;
  unitNumber: number;
  slotType: NationalTeamLineSlotType;
  playerId: string;
  slotOrder: number;
}

export interface NationalTeamReadinessCheck {
  id: string;
  status: 'PASS' | 'WARN' | 'FAIL';
  message: string;
}

export interface NationalTeamReadinessResult {
  status: 'READY' | 'WARNING' | 'NOT_READY';
  checks: NationalTeamReadinessCheck[];
  blockers: string[];
  warnings: string[];
}

export class NationalTeamError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = 'NationalTeamError';
    this.code = code;
  }
}

export function positionGroupFromPosition(
  position: string,
): 'FORWARD' | 'DEFENSE' | 'GOALIE' {
  if (position === 'G') return 'GOALIE';
  if (position === 'LD' || position === 'RD' || position === 'D') return 'DEFENSE';
  return 'FORWARD';
}

export function defaultRosterRoleForPosition(position: string): RosterRole {
  const g = positionGroupFromPosition(position);
  if (g === 'GOALIE') return 'GOALIE';
  if (g === 'DEFENSE') return 'DEFENSE';
  return 'FORWARD';
}
