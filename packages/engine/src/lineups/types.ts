export type LineupPosition = 'LW' | 'RW' | 'C' | 'LD' | 'RD' | 'G';
export type LineupRosterStatus = 'ACTIVE' | 'RESERVE' | 'PROSPECT' | 'UNAVAILABLE';
export type LineupModelStatus = 'COMPLETE' | 'INCOMPLETE';

export type LineupSlot =
  | 'F1_LW'
  | 'F1_C'
  | 'F1_RW'
  | 'F2_LW'
  | 'F2_C'
  | 'F2_RW'
  | 'F3_LW'
  | 'F3_C'
  | 'F3_RW'
  | 'F4_LW'
  | 'F4_C'
  | 'F4_RW'
  | 'D1_LD'
  | 'D1_RD'
  | 'D2_LD'
  | 'D2_RD'
  | 'D3_LD'
  | 'D3_RD'
  | 'G_STARTER'
  | 'G_BACKUP';

export type LineupValidationStatus = 'VALID' | 'INCOMPLETE' | 'INVALID';

export type AutoLineupMode = 'REPLACE' | 'FILL_EMPTY';

export interface LineupCandidate {
  id: string;
  primaryPosition: LineupPosition;
  secondaryPositions: LineupPosition[];
  rosterStatus: LineupRosterStatus;
  modelStatus: LineupModelStatus;
  currentAbility: number | null;
  role: string | null;
  roleRating: number | null;
}

export interface LineupAssignmentInput {
  slot: LineupSlot;
  playerId: string;
}

export interface LineupValidationIssue {
  code: string;
  severity: 'error' | 'warning';
  slot?: LineupSlot;
  playerId?: string;
  message: string;
}

export interface LineupValidationResult {
  status: LineupValidationStatus;
  errors: LineupValidationIssue[];
  warnings: LineupValidationIssue[];
  filledSlots: number;
  requiredSlots: number;
  eligiblePlayerCount: number;
}

export interface AutoLineupExplanation {
  slot: LineupSlot;
  selectedPlayerId: string | null;
  reasons: string[];
}

export interface AutoLineupResult {
  assignments: LineupAssignmentInput[];
  unfilledSlots: LineupSlot[];
  warnings: LineupValidationIssue[];
  explanation: AutoLineupExplanation[];
}

export type LineupPresence = 'ABSENT' | 'INCOMPLETE' | 'VALID' | 'INVALID';
