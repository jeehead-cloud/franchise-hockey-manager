export type TeamReadinessStatus = 'READY' | 'WARNING' | 'NOT_READY';

export type RosterPositionGroup = 'FORWARD' | 'DEFENSE' | 'GOALIE';

export interface TeamReadinessRosterMember {
  position: 'LW' | 'RW' | 'C' | 'LD' | 'RD' | 'G';
  rosterStatus: 'ACTIVE' | 'RESERVE' | 'PROSPECT' | 'UNAVAILABLE';
  /** F5 model completeness for ACTIVE/RESERVE players. */
  modelComplete: boolean;
}

export interface TeamReadinessInput {
  hasHeadCoach: boolean;
  hasTacticalStyle: boolean;
  roster: TeamReadinessRosterMember[];
}

export interface TeamReadinessCheck {
  code: string;
  label: string;
  result: 'PASS' | 'WARN' | 'FAIL';
  actual: number | boolean | string;
  required?: number | boolean | string;
  explanation: string;
}

export interface TeamReadinessCounts {
  availableForwards: number;
  availableDefensemen: number;
  availableGoalies: number;
  availableCenters: number;
  availableWingers: number;
  availableLD: number;
  availableRD: number;
  incompleteAvailableModels: number;
  prospectCount: number;
  unavailableCount: number;
  totalRoster: number;
}

export interface TeamReadinessResult {
  status: TeamReadinessStatus;
  checks: TeamReadinessCheck[];
  counts: TeamReadinessCounts;
}

/** F7 main-team depth thresholds for future lineup support. */
export const TEAM_READINESS_THRESHOLDS = {
  availableForwards: 12,
  availableDefensemen: 6,
  availableGoalies: 2,
} as const;

export function positionGroup(
  position: TeamReadinessRosterMember['position'],
): RosterPositionGroup {
  if (position === 'G') return 'GOALIE';
  if (position === 'LD' || position === 'RD') return 'DEFENSE';
  return 'FORWARD';
}

/** ACTIVE and RESERVE count toward main-team depth. PROSPECT and UNAVAILABLE do not. */
export function isAvailableForReadiness(
  status: TeamReadinessRosterMember['rosterStatus'],
): boolean {
  return status === 'ACTIVE' || status === 'RESERVE';
}
