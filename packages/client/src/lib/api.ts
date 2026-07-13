export interface HealthResponse {
  status: 'ok' | 'degraded' | string;
  service: string;
  version?: string;
  timestamp?: string;
  database?: string;
  engine?: { name: string; version: string };
}

export type ConnectionState = 'loading' | 'connected' | 'unavailable';

function apiBase(): string {
  return (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, '') ?? '';
}

async function readError(res: Response): Promise<string> {
  try {
    const body = (await res.json()) as { message?: string; error?: string };
    return body.message || body.error || `Request failed: ${res.status}`;
  } catch {
    return `Request failed: ${res.status}`;
  }
}

async function getJson<T>(path: string, signal?: AbortSignal): Promise<T> {
  const res = await fetch(`${apiBase()}${path}`, { signal });
  if (!res.ok) {
    const err = new Error(await readError(res)) as Error & { status?: number };
    err.status = res.status;
    throw err;
  }
  return res.json() as Promise<T>;
}

export async function fetchHealth(signal?: AbortSignal): Promise<HealthResponse> {
  return getJson<HealthResponse>('/health', signal);
}

export interface SetupEntityCounts {
  worldSeasons: number;
  countries: number;
  leagues: number;
  teams: number;
  players: number;
  coaches: number;
  competitions: number;
  competitionEditions: number;
}

export interface SetupStatus {
  initialized: boolean;
  canInitialize: boolean;
  dataset: {
    id: string;
    name: string;
    schemaVersion: number;
    sourceName: string;
    sourceUpdatedAt: string;
    fictional: boolean;
    available: boolean;
  } | null;
  datasetError?: string;
  counts: SetupEntityCounts;
  initializedAt?: string | null;
  datasetId?: string | null;
  schemaVersion?: number | null;
  blockReason?: string | null;
}

export interface SetupIssue {
  severity: 'error' | 'warning';
  code: string;
  message: string;
  file?: string;
  externalId?: string;
}

export interface SetupPreview {
  valid: boolean;
  canInitialize: boolean;
  blockReason: string | null;
  dataset: {
    id: string;
    name: string;
    schemaVersion: number;
    sourceName: string;
    sourceUpdatedAt: string;
    worldSeasonLabel: string;
    fictional: boolean;
    notes?: string;
  };
  counts: SetupEntityCounts;
  errors: SetupIssue[];
  warnings: SetupIssue[];
}

export interface SetupInitializeResult {
  initialized: true;
  datasetId: string;
  initializedAt: string;
  created: SetupEntityCounts;
  fictional: boolean;
}

export async function fetchSetupStatus(signal?: AbortSignal): Promise<SetupStatus> {
  return getJson<SetupStatus>('/api/setup/status', signal);
}

export async function fetchSetupPreview(signal?: AbortSignal): Promise<SetupPreview> {
  return getJson<SetupPreview>('/api/setup/preview', signal);
}

export async function postSetupInitialize(): Promise<SetupInitializeResult> {
  const res = await fetch(`${apiBase()}/api/setup/initialize`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{}',
  });
  if (!res.ok) {
    const message = await readError(res);
    throw new Error(`${res.status}: ${message}`);
  }
  return res.json() as Promise<SetupInitializeResult>;
}

export interface Paginated<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export interface CountryRef {
  id: string;
  name: string;
  code: string;
}

export interface LeagueRef {
  id: string;
  name: string;
  shortName: string | null;
}

export interface WorldSummary {
  initialized: boolean;
  fictionalDataset: boolean;
  dataset: {
    id: string | null;
    name: string | null;
    sourceUpdatedAt: string | null;
    schemaVersion: number | null;
    initializedAt: string | null;
    fictional: boolean;
  } | null;
  season: {
    id: string;
    label: string;
    startYear: number;
    endYear: number;
    phase: string;
    status: string;
  } | null;
  counts: SetupEntityCounts;
  structure: {
    detailedLeagues: number;
    aggregatedLeagues: number;
    clubTeams: number;
    nationalTeams: number;
    assignedPlayers: number;
    unassignedPlayers: number;
    playersByRosterStatus: Record<string, number>;
    teamsWithoutPlayers: number;
    teamsWithoutCoaches: number;
    teamsWithoutTacticalStyle?: number;
    readyTeams?: number;
    warningTeams?: number;
    notReadyTeams?: number;
    teamsWithoutLineup?: number;
    teamsWithIncompleteLineup?: number;
    teamsWithValidLineup?: number;
    teamsWithInvalidLineup?: number;
  };
  competitionEditions: Array<{
    id: string;
    displayName: string;
    status: string;
    competition?: { id: string; name: string; type: string };
    worldSeason?: { id: string; label: string };
  }>;
  warnings: Array<{ code: string; message: string; severity: 'info' | 'warning' }>;
  recommendedNextAction: {
    code: string;
    label: string;
    href: string;
    detail: string;
  };
  ageReference: {
    rule: string;
    referenceDate: string;
    seasonStartYear: number;
  } | null;
}

export interface TeamListItem {
  id: string;
  name: string;
  shortName: string | null;
  city: string | null;
  teamType: string;
  country?: CountryRef;
  league?: LeagueRef | null;
  rosterCount: number;
  coach: {
    id: string;
    firstName: string;
    lastName: string;
    coachingStyle?: string;
    tacticalStyle?: string;
    overallCoaching?: number | null;
    playerDevelopment?: number | null;
    offense?: number | null;
    defense?: number | null;
  } | null;
  tacticalStyle?: string | null;
  readinessStatus?: 'READY' | 'WARNING' | 'NOT_READY';
}

export type LineupPresence = 'ABSENT' | 'INCOMPLETE' | 'VALID' | 'INVALID';
export type LineupValidationStatus = 'VALID' | 'INCOMPLETE' | 'INVALID';
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
export type PositionFit = 'PRIMARY' | 'SECONDARY' | 'NONE';
export type AutoLineupMode = 'REPLACE' | 'FILL_EMPTY';

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

export interface LineupPlayerRef {
  id: string;
  firstName: string;
  lastName: string;
  primaryPosition: string;
  secondaryPositions: string[];
  rosterStatus: string;
  currentAbility: number | null;
  role: string | null;
  roleRating: number | null;
  modelStatus: PlayerModelStatus;
  positionFit?: PositionFit;
  eligible?: boolean;
  assignedToLineup?: boolean;
}

export interface LineupAssignment {
  slot: LineupSlot;
  playerId: string;
  player?: LineupPlayerRef;
}

export interface LineupBoard {
  forwardLines: Array<{ lw: LineupPlayerRef | null; c: LineupPlayerRef | null; rw: LineupPlayerRef | null }>;
  defensePairs: Array<{ ld: LineupPlayerRef | null; rd: LineupPlayerRef | null }>;
  goalies: { starter: LineupPlayerRef | null; backup: LineupPlayerRef | null };
}

export interface TeamLineupSummary {
  presence: LineupPresence;
  validationStatus: LineupValidationStatus | null;
  filledSlots: number;
  requiredSlots: number;
  updatedAt: string | null;
}

export interface TeamLineup {
  team: { id: string; name: string; shortName: string | null };
  exists: boolean;
  id?: string;
  updatedAt: string | null;
  version: number | null;
  assignments: LineupAssignment[];
  board: LineupBoard;
  validation: LineupValidationResult;
  presence: LineupPresence;
  filledSlots: number;
  requiredSlots: number;
}

export interface CommissionerTeamLineup extends TeamLineup {
  expectedUpdatedAt: string | null;
  eligiblePlayers: LineupPlayerRef[];
}

export interface CommissionerLineupSavePayload {
  expectedUpdatedAt: string | null;
  reason: string;
  assignments: Array<{ slot: LineupSlot; playerId: string }>;
}

export interface CommissionerLineupAutoFillPayload {
  expectedUpdatedAt: string | null;
  reason: string;
  mode: AutoLineupMode;
}

export interface CommissionerLineupMutationResult {
  item: CommissionerTeamLineup;
  validation: LineupValidationResult;
  presence: LineupPresence;
  auto?: {
    mode: AutoLineupMode;
    unfilledSlots: LineupSlot[];
    warnings: LineupValidationIssue[];
    explanation: Array<{ slot: LineupSlot; selectedPlayerId: string | null; reasons: string[] }>;
  };
}

export interface LineupAuditItem {
  id: string;
  action: string;
  reason: string;
  source: string;
  createdAt: string;
  changedFields: string[];
}

export type ChemistryUnitType = 'FORWARD_LINE' | 'DEFENSE_PAIR' | 'GOALIE';
export type ChemistryLabel = 'POOR' | 'WEAK' | 'NEUTRAL' | 'GOOD' | 'EXCELLENT';
export type ChemistryUnitStatus = 'AVAILABLE' | 'UNAVAILABLE';

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

export interface BalanceMeta {
  presetName: string;
  versionNumber: number;
  configHash: string;
  schemaVersion: number;
}

export interface LineupChemistrySummary {
  chemistryConfigVersion: string;
  balance: BalanceMeta | null;
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

export interface TeamChemistry {
  team: { id: string; name: string; shortName: string | null; tacticalStyle: string | null };
  coach: {
    id: string;
    firstName: string;
    lastName: string;
    coachingStyle: string;
    tacticalStyle: string;
    overallCoaching: number | null;
    offense: number | null;
    defense: number | null;
  } | null;
  lineup: { exists: boolean; presence: string; validationStatus: string | null };
  balance: BalanceMeta;
  chemistry: LineupChemistrySummary;
}

export interface TeamDetail extends TeamListItem {
  externalId: string | null;
  sourceDataset: string | null;
  sourceUpdatedAt: string | null;
  rosterSummary: {
    total: number;
    byPosition: Record<string, number>;
    byRosterStatus: Record<string, number>;
    averageAge: number | null;
    ageReference: { rule: string; referenceDate: string; seasonStartYear: number } | null;
  };
  roster: PlayerListItem[];
  readiness?: { status: 'READY' | 'WARNING' | 'NOT_READY'; checks: Array<{ code: string; label: string; result: string; explanation: string }>; counts: Record<string, number> };
  lineupSummary?: TeamLineupSummary;
}

export interface CoachItem {
  id: string; firstName: string; lastName: string; nationalityCountryId: string | null;
  currentTeamId: string | null; coachingStyle: string; tacticalStyle: string;
  overallCoaching: number | null; playerDevelopment: number | null; offense: number | null; defense: number | null;
  currentTeam?: { id: string; name: string; shortName: string | null } | null;
  updatedAt: string;
}

export type PlayerModelStatus = 'COMPLETE' | 'INCOMPLETE';

export interface PlayerModelCompact {
  modelStatus: PlayerModelStatus;
  currentAbility: number | null;
  role: string | null;
  roleLabel: string | null;
  roleRating: number | null;
  publicPotentialEstimate: string;
}

export type PlayerModelDetail =
  | {
      modelStatus: 'INCOMPLETE';
      message: string;
    }
  | {
      modelStatus: 'COMPLETE';
      kind: 'skater';
      attributes: Record<string, number>;
      currentAbility: number;
      offensiveRating: number;
      defensiveRating: number;
      role: string;
      roleLabel: string;
      roleRating: number;
      roleExplanation: string;
      winningPair?: { a: string; b: string };
      preferredCoachingStyle: string;
      preferredTactics: string;
      personality: string;
      heroRating: number;
      stability: number;
      developmentRate: number;
      publicPotentialEstimate: string;
    }
  | {
      modelStatus: 'COMPLETE';
      kind: 'goalie';
      attributes: Record<string, number>;
      currentAbility: number;
      role: string;
      roleLabel: string;
      roleRating: number;
      roleExplanation: string;
      preferredCoachingStyle: string;
      preferredTactics: string;
      personality: string;
      heroRating: number;
      stability: number;
      developmentRate: number;
      publicPotentialEstimate: string;
    };

export interface PlayerListItem extends PlayerModelCompact {
  id: string;
  firstName: string;
  lastName: string;
  dateOfBirth: string;
  age?: number | null;
  primaryPosition: string;
  secondaryPositions?: string[];
  rosterStatus: string;
  sourceType: string;
  nationality?: CountryRef;
  currentTeam?: { id: string; name: string; shortName?: string | null } | null;
}

export interface PlayerDetail extends PlayerListItem {
  externalId: string | null;
  sourceDataset: string | null;
  sourceUpdatedAt: string | null;
  ageReference: { rule: string; referenceDate: string; seasonStartYear: number } | null;
  currentTeam: {
    id: string;
    name: string;
    shortName: string | null;
    country?: CountryRef;
    league?: LeagueRef | null;
  } | null;
  playerModel: PlayerModelDetail;
}

export interface CompetitionListItem {
  id: string;
  name: string;
  shortName: string | null;
  type: string;
  simulationLevel: string | null;
  countryId?: string | null;
  leagueId?: string | null;
  hasDefaultRules?: boolean;
  editionCount: number;
  currentEdition: {
    id: string;
    displayName: string;
    status: string;
    worldSeason?: { id: string; label: string };
    rulesHash?: string;
  } | null;
}

export interface CompetitionEditionSummary {
  id: string;
  displayName: string;
  status: string;
  rulesHash?: string | null;
  participantCount?: number;
  stageCount?: number;
  worldSeason?: { id: string; label: string; startYear?: number; endYear?: number };
  updatedAt?: string;
}

export interface CompetitionDetail {
  id: string;
  name: string;
  shortName: string | null;
  type: string;
  simulationLevel: string | null;
  countryId?: string | null;
  leagueId?: string | null;
  country?: { id: string; name: string; code: string } | null;
  league?: { id: string; name: string; shortName: string | null } | null;
  hasDefaultRules?: boolean;
  defaultRules?: unknown;
  externalId: string | null;
  sourceDataset: string | null;
  sourceUpdatedAt: string | null;
  updatedAt?: string;
  editions: CompetitionEditionSummary[];
}

export interface CompetitionEditionDetail {
  id: string;
  competitionId: string;
  worldSeasonId: string;
  displayName: string;
  status: string;
  editionNumber: number | null;
  rules: unknown;
  rulesHash: string;
  preparedAt: string | null;
  activatedAt: string | null;
  completedAt: string | null;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
  participantCount: number;
  stageCount: number;
  matchCount: number;
  competition?: {
    id: string;
    name: string;
    type: string;
    shortName?: string | null;
    simulationLevel?: string | null;
  };
  worldSeason?: { id: string; label: string; startYear?: number; endYear?: number };
  readiness: {
    status: string;
    checks: Array<{ code: string; severity: string; message: string }>;
    confirmedParticipantCount: number;
    withdrawnParticipantCount: number;
    stageCount: number;
    blockers: string[];
    warnings: string[];
    allowedNextStatuses: string[];
  };
  participants: Array<{
    id: string;
    teamId: string;
    seed: number | null;
    groupKey: string | null;
    participantOrder: number;
    status: string;
    source: string;
    teamNameSnapshot: string;
    teamShortNameSnapshot: string | null;
    currentTeam: {
      id: string;
      name: string;
      shortName: string | null;
      teamType: string;
    };
  }>;
  stages: Array<{
    id: string;
    name: string;
    stageType: string;
    stageOrder: number;
    status: string;
    participantSource: string;
    sourceStageId: string | null;
    expectedQualifierCount: number | null;
    config: unknown;
    configHash: string;
    participantCount: number;
  }>;
}

export interface CountryItem {
  id: string;
  name: string;
  code: string;
}

export interface LeagueItem {
  id: string;
  name: string;
  shortName: string | null;
  countryId: string | null;
  simulationLevel: string;
}

export interface WorldSeasonItem {
  id: string;
  label: string;
  startYear: number;
  endYear: number;
  phase: string;
  status: string;
}

function qs(params: Record<string, string | number | undefined | null>): string {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null || v === '') continue;
    sp.set(k, String(v));
  }
  const s = sp.toString();
  return s ? `?${s}` : '';
}

export async function getWorldSummary(signal?: AbortSignal): Promise<WorldSummary> {
  return getJson<WorldSummary>('/api/world', signal);
}

export async function getTeams(
  params: Record<string, string | number | undefined | null> = {},
  signal?: AbortSignal,
): Promise<Paginated<TeamListItem>> {
  return getJson(`/api/teams${qs(params)}`, signal);
}

export async function getTeam(id: string, signal?: AbortSignal): Promise<{ item: TeamDetail }> {
  return getJson(`/api/teams/${id}`, signal);
}
export async function getCoaches(params: Record<string, string | number | undefined | null> = {}, signal?: AbortSignal): Promise<Paginated<CoachItem>> {
  return getJson(`/api/coaches${qs(params)}`, signal);
}
export async function getCoach(id: string, signal?: AbortSignal): Promise<{ item: CoachItem }> {
  return getJson(`/api/coaches/${id}`, signal);
}

export async function getPlayers(
  params: Record<string, string | number | undefined | null> = {},
  signal?: AbortSignal,
): Promise<Paginated<PlayerListItem>> {
  return getJson(`/api/players${qs(params)}`, signal);
}

export async function getPlayer(id: string, signal?: AbortSignal): Promise<{ item: PlayerDetail }> {
  return getJson(`/api/players/${id}`, signal);
}

export async function getCompetitions(
  params: Record<string, string | number | undefined | null> = {},
  signal?: AbortSignal,
): Promise<Paginated<CompetitionListItem>> {
  return getJson(`/api/competitions${qs(params)}`, signal);
}

export async function getCompetition(
  id: string,
  signal?: AbortSignal,
): Promise<{ item: CompetitionDetail }> {
  return getJson(`/api/competitions/${id}`, signal);
}

export async function getCompetitionEdition(
  id: string,
  signal?: AbortSignal,
): Promise<{ item: CompetitionEditionDetail }> {
  return getJson(`/api/competition-editions/${id}`, signal);
}

export async function getCompetitionEditionReadiness(
  id: string,
  signal?: AbortSignal,
): Promise<{ item: { readiness: CompetitionEditionDetail['readiness']; notice: string } }> {
  return getJson(`/api/competition-editions/${id}/readiness`, signal);
}

export async function createCompetitionEdition(
  competitionId: string,
  payload: {
    worldSeasonId: string;
    displayName: string;
    templateKey?: string;
    reason: string;
  },
) {
  return commissionerWrite<{ item: { id: string; status: string; rulesHash: string } }>(
    `/api/commissioner/competitions/${competitionId}/editions`,
    'POST',
    payload,
  );
}

export async function transitionCompetitionEdition(
  editionId: string,
  payload: { expectedUpdatedAt: string; targetStatus: string; reason: string },
) {
  return commissionerWrite<{ item: { id: string; status: string; updatedAt: string } }>(
    `/api/commissioner/competition-editions/${editionId}/transition`,
    'POST',
    payload,
  );
}

export async function addCompetitionParticipantsFromLeague(
  editionId: string,
  payload: {
    expectedUpdatedAt: string;
    leagueId: string;
    status?: string;
    reason: string;
  },
) {
  return commissionerWrite<{ item: { addedCount: number; skippedCount: number } }>(
    `/api/commissioner/competition-editions/${editionId}/participants/from-league`,
    'POST',
    payload,
  );
}

export async function createCompetitionStage(
  editionId: string,
  payload: {
    expectedUpdatedAt: string;
    reason: string;
    name: string;
    stageType: string;
    stageOrder: number;
    participantSource: string;
    sourceStageId?: string | null;
    expectedQualifierCount?: number | null;
    config: Record<string, unknown>;
  },
) {
  return commissionerWrite<{ item: { id: string } }>(
    `/api/commissioner/competition-editions/${editionId}/stages`,
    'POST',
    payload,
  );
}

export async function updateCompetitionEditionRules(
  editionId: string,
  payload: { expectedUpdatedAt: string; reason: string; rules: unknown },
) {
  return commissionerWrite<{ item: { id: string; rulesHash: string; updatedAt: string } }>(
    `/api/commissioner/competition-editions/${editionId}`,
    'PATCH',
    payload,
  );
}

export async function getCompetitionEditionAudit(
  editionId: string,
  params: Record<string, string | number | undefined | null> = {},
  signal?: AbortSignal,
) {
  return commissionerGetJson<{
    items: Array<{
      id: string;
      action: string;
      reason: string;
      entityType: string;
      createdAt: string;
      changedFields: string[];
    }>;
    total: number;
  }>(`/api/commissioner/competition-editions/${editionId}/audit${qs(params)}`, signal);
}

export async function getCountries(signal?: AbortSignal): Promise<{ items: CountryItem[] }> {
  return getJson('/api/countries', signal);
}

export async function getLeagues(signal?: AbortSignal): Promise<{ items: LeagueItem[] }> {
  return getJson('/api/leagues', signal);
}

export async function getWorldSeasons(signal?: AbortSignal): Promise<{ items: WorldSeasonItem[] }> {
  return getJson('/api/world-seasons', signal);
}

const COMMISSIONER_HEADER = 'X-FHM-Commissioner-Mode';

export interface CommissionerStatus {
  writesEnabled: boolean;
  header: string;
  requiredValue: string;
  note: string;
}

export interface CommissionerPlayerDetail extends PlayerDetail {
  updatedAt: string;
  hiddenPotential: {
    potentialFloor: number | null;
    potentialCeiling: number | null;
    developmentRisk: number | null;
  };
  editable: {
    identity: {
      firstName: string;
      lastName: string;
      dateOfBirth: string;
      nationalityCountryId: string;
      currentTeamId: string | null;
      primaryPosition: string;
      secondaryPositions: string[];
      rosterStatus: string;
      sourceType: string;
    };
    profile: {
      preferredCoachingStyle: string | null;
      preferredTactics: string | null;
      personality: string | null;
      heroRating: number | null;
      stability: number | null;
      developmentRate: number | null;
      developmentRisk: number | null;
      potentialFloor: number | null;
      potentialCeiling: number | null;
      publicPotentialEstimate: string | null;
    };
    skaterAttributes: Record<string, number> | null;
    goalieAttributes: Record<string, number> | null;
    modelStatus: PlayerModelStatus;
  };
}

export interface CommissionerPlayerEditPayload {
  expectedUpdatedAt: string;
  reason: string;
  identity: {
    firstName: string;
    lastName: string;
    dateOfBirth: string;
    nationalityCountryId: string;
    currentTeamId: string | null;
    primaryPosition: string;
    secondaryPositions: string[];
    rosterStatus: string;
  };
  profile: {
    preferredCoachingStyle: string;
    preferredTactics: string;
    personality: string;
    heroRating: number;
    stability: number;
    developmentRate: number;
    developmentRisk: number;
    potentialFloor: number;
    potentialCeiling: number;
    publicPotentialEstimate: string;
  };
  skaterAttributes: Record<string, number> | null;
  goalieAttributes: Record<string, number> | null;
}

export interface PlayerAuditItem {
  id: string;
  action: string;
  reason: string;
  source: string;
  createdAt: string;
  changedFields: string[];
  summary: {
    beforePosition?: string;
    afterPosition?: string;
    beforeRole: string | null;
    afterRole: string | null;
    beforeAbility: number | null;
    afterAbility: number | null;
  };
}

async function commissionerGetJson<T>(path: string, signal?: AbortSignal): Promise<T> {
  const res = await fetch(`${apiBase()}${path}`, {
    signal,
    headers: { [COMMISSIONER_HEADER]: 'enabled' },
  });
  if (!res.ok) {
    const err = new Error(await readError(res)) as Error & { status?: number; body?: unknown };
    err.status = res.status;
    try {
      err.body = await res.clone().json();
    } catch {
      /* ignore */
    }
    throw err;
  }
  return res.json() as Promise<T>;
}

export async function getCommissionerStatus(signal?: AbortSignal): Promise<CommissionerStatus> {
  return getJson('/api/commissioner/status', signal);
}

export async function getCommissionerPlayer(
  id: string,
  signal?: AbortSignal,
): Promise<{ item: CommissionerPlayerDetail }> {
  return commissionerGetJson(`/api/commissioner/players/${id}`, signal);
}

export async function updateCommissionerPlayer(
  id: string,
  payload: CommissionerPlayerEditPayload,
): Promise<{ item: CommissionerPlayerDetail; warnings?: string[] }> {
  const res = await fetch(`${apiBase()}/api/commissioner/players/${id}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      [COMMISSIONER_HEADER]: 'enabled',
      'X-FHM-Commissioner-Source': 'ui',
    },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    let message = `Request failed: ${res.status}`;
    let details: unknown;
    try {
      const body = (await res.json()) as { message?: string; error?: string; details?: unknown };
      message = body.message || body.error || message;
      details = body.details;
    } catch {
      /* ignore */
    }
    const err = new Error(message) as Error & { status?: number; details?: unknown };
    err.status = res.status;
    err.details = details;
    throw err;
  }
  return res.json() as Promise<{ item: CommissionerPlayerDetail; warnings?: string[] }>;
}

export async function getPlayerAuditLog(
  id: string,
  params: Record<string, string | number | undefined | null> = {},
  signal?: AbortSignal,
): Promise<Paginated<PlayerAuditItem>> {
  return commissionerGetJson(`/api/commissioner/players/${id}/audit${qs(params)}`, signal);
}

export interface CommissionerCoachPayload {
  expectedUpdatedAt?: string; reason: string;
  identity: { firstName: string; lastName: string; nationalityCountryId: string | null };
  styles: { coachingStyle: string; tacticalStyle: string };
  ratings: { overallCoaching: number; playerDevelopment: number; offense: number; defense: number };
  currentTeamId: string | null; replaceExisting?: boolean; moveFromOtherTeam?: boolean;
}
async function commissionerWrite<T>(path: string, method: 'POST' | 'PATCH', payload: unknown): Promise<T> {
  const res = await fetch(`${apiBase()}${path}`, { method, headers: { 'Content-Type': 'application/json', [COMMISSIONER_HEADER]: 'enabled', 'X-FHM-Commissioner-Source': 'ui' }, body: JSON.stringify(payload) });
  if (!res.ok) { const err = new Error(await readError(res)) as Error & { status?: number }; err.status = res.status; throw err; }
  return res.json() as Promise<T>;
}
export const getCommissionerCoach = (id: string) => commissionerGetJson<{ item: CoachItem }>(`/api/commissioner/coaches/${id}`);
export const createCommissionerCoach = (payload: CommissionerCoachPayload) => commissionerWrite<{ item: CoachItem }>('/api/commissioner/coaches', 'POST', payload);
export const updateCommissionerCoach = (id: string, payload: CommissionerCoachPayload) => commissionerWrite<{ item: CoachItem }>(`/api/commissioner/coaches/${id}`, 'PATCH', payload);
export const getCommissionerTeamSetup = (id: string) => commissionerGetJson<{ item: { id: string; tacticalStyle: string | null; updatedAt: string; coach: CoachItem | null; readiness: TeamDetail['readiness'] } }>(`/api/commissioner/teams/${id}/setup`);
export const updateCommissionerTeamSetup = (id: string, payload: { expectedUpdatedAt: string; reason: string; headCoachId: string | null; tacticalStyle: string | null; replaceExisting?: boolean; moveFromOtherTeam?: boolean }) => commissionerWrite<{ item: unknown }>(`/api/commissioner/teams/${id}/setup`, 'PATCH', payload);
export const updateTeamRosterStatus = (id: string, payload: { playerId: string; rosterStatus: string; expectedUpdatedAt: string; reason: string }) => commissionerWrite<{ item: unknown }>(`/api/commissioner/teams/${id}/roster-status`, 'PATCH', payload);

export async function getTeamLineup(id: string, signal?: AbortSignal): Promise<{ item: TeamLineup }> {
  return getJson(`/api/teams/${id}/lineup`, signal);
}

export async function getTeamChemistry(
  id: string,
  signal?: AbortSignal,
): Promise<{ item: TeamChemistry }> {
  return getJson(`/api/teams/${id}/chemistry`, signal);
}

export async function getCommissionerTeamLineup(
  id: string,
  signal?: AbortSignal,
): Promise<{ item: CommissionerTeamLineup }> {
  return commissionerGetJson(`/api/commissioner/teams/${id}/lineup`, signal);
}

async function commissionerLineupWrite<T>(
  path: string,
  method: 'PUT' | 'POST',
  payload: unknown,
): Promise<T> {
  const res = await fetch(`${apiBase()}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      [COMMISSIONER_HEADER]: 'enabled',
      'X-FHM-Commissioner-Source': 'ui',
    },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    let message = `Request failed: ${res.status}`;
    let details: unknown;
    try {
      const body = (await res.json()) as { message?: string; error?: string; details?: unknown };
      message = body.message || body.error || message;
      details = body.details;
    } catch {
      /* ignore */
    }
    const err = new Error(message) as Error & { status?: number; details?: unknown };
    err.status = res.status;
    err.details = details;
    throw err;
  }
  return res.json() as Promise<T>;
}

export async function saveCommissionerTeamLineup(
  id: string,
  payload: CommissionerLineupSavePayload,
): Promise<CommissionerLineupMutationResult> {
  return commissionerLineupWrite(`/api/commissioner/teams/${id}/lineup`, 'PUT', payload);
}

export async function autoFillCommissionerTeamLineup(
  id: string,
  payload: CommissionerLineupAutoFillPayload,
): Promise<CommissionerLineupMutationResult> {
  return commissionerLineupWrite(`/api/commissioner/teams/${id}/lineup/auto-fill`, 'POST', payload);
}

export async function getCommissionerLineupAudit(
  id: string,
  params: Record<string, string | number | undefined | null> = {},
  signal?: AbortSignal,
): Promise<Paginated<LineupAuditItem>> {
  return commissionerGetJson(`/api/commissioner/teams/${id}/lineup/audit${qs(params)}`, signal);
}

export type { BalanceConfig, RuntimeSimulationSettings, LoggingLevel } from '@fhm/engine';

export interface ActiveBalanceSnapshot {
  preset: {
    id: string;
    name: string;
    description: string | null;
    isSystem: boolean;
  };
  version: {
    id: string;
    versionNumber: number;
    schemaVersion: number;
    configHash: string;
    createdAt: string;
    changeReason: string;
  };
  config: import('@fhm/engine').BalanceConfig;
  runtimeDefaults: import('@fhm/engine').RuntimeSimulationSettings;
}

export interface BalancePresetVersionSummary {
  id: string;
  versionNumber: number;
  schemaVersion: number;
  configHash: string;
  changeReason: string;
  createdAt: string;
  isActive: boolean;
}

export interface BalancePresetSummary {
  id: string;
  name: string;
  description: string | null;
  isSystem: boolean;
  createdAt: string;
  updatedAt: string;
  latestVersion: BalancePresetVersionSummary | null;
  isActive: boolean;
}

export interface BalancePresetDetail extends BalancePresetSummary {
  versions: Array<
    BalancePresetVersionSummary & {
      presetId: string;
      createdBySource: string | null;
    }
  >;
}

export interface BalancePresetVersionDetail extends BalancePresetVersionSummary {
  presetId: string;
  createdBySource: string | null;
  preset?: {
    id: string;
    name: string;
    description: string | null;
    isSystem: boolean;
  };
  config: import('@fhm/engine').BalanceConfig;
  runtimeDefaults: import('@fhm/engine').RuntimeSimulationSettings;
}

export interface BalanceExportPayload {
  format: 'fhm-balance-export';
  formatVersion: number;
  exportedAt: string;
  preset: {
    id: string;
    name: string;
    description: string | null;
    isSystem: boolean;
  };
  version: {
    id: string;
    versionNumber: number;
    schemaVersion: number;
    configHash: string;
    changeReason: string;
    createdAt: string;
  };
  config: import('@fhm/engine').BalanceConfig;
}

export interface BalanceValidationPreview {
  valid: boolean;
  errors: Array<{ path: string; message: string }>;
  normalized: import('@fhm/engine').BalanceConfig | null;
  hash: string | null;
  changedPaths: string[];
}

export interface BalanceAuditItem {
  id: string;
  entityType: string;
  entityId: string;
  action: string;
  reason: string;
  source: string;
  createdAt: string;
  changedFields: string[];
  before: unknown;
  after: unknown;
}

export interface CommissionerBalanceDuplicatePayload {
  name: string;
  versionId?: string;
  reason: string;
}

export interface CommissionerBalanceRenamePayload {
  expectedUpdatedAt: string;
  reason: string;
  name?: string;
  description?: string | null;
}

export interface CommissionerBalanceCreateVersionPayload {
  expectedLatestVersionId: string;
  reason: string;
  config: unknown;
  activate?: boolean;
}

export interface CommissionerBalanceActivatePayload {
  reason: string;
  expectedActiveVersionId?: string;
}

export interface CommissionerBalanceResetPayload {
  reason: string;
  activate?: boolean;
}

export interface CommissionerBalanceImportPayload {
  name: string;
  description?: string | null;
  reason: string;
  config: unknown;
}

export interface CommissionerBalanceValidatePayload {
  presetId?: string;
  baseVersionId?: string;
  config: unknown;
}

export async function getActiveBalance(signal?: AbortSignal): Promise<{ item: ActiveBalanceSnapshot }> {
  return getJson('/api/balance/active', signal);
}

export async function listBalancePresets(signal?: AbortSignal): Promise<{ items: BalancePresetSummary[] }> {
  return getJson('/api/balance/presets', signal);
}

export async function getBalancePreset(
  id: string,
  signal?: AbortSignal,
): Promise<{ item: BalancePresetDetail }> {
  return getJson(`/api/balance/presets/${id}`, signal);
}

export async function listBalancePresetVersions(
  presetId: string,
  signal?: AbortSignal,
): Promise<{ items: BalancePresetVersionSummary[] }> {
  return getJson(`/api/balance/presets/${presetId}/versions`, signal);
}

export async function getBalancePresetVersion(
  versionId: string,
  signal?: AbortSignal,
): Promise<{ item: BalancePresetVersionDetail }> {
  return getJson(`/api/balance/versions/${versionId}`, signal);
}

export async function exportBalancePresetVersion(
  versionId: string,
  signal?: AbortSignal,
): Promise<BalanceExportPayload> {
  const res = await fetch(`${apiBase()}/api/balance/versions/${versionId}/export`, { signal });
  if (!res.ok) {
    const err = new Error(await readError(res)) as Error & { status?: number };
    err.status = res.status;
    throw err;
  }
  return res.json() as Promise<BalanceExportPayload>;
}

export async function duplicateCommissionerBalancePreset(
  presetId: string,
  payload: CommissionerBalanceDuplicatePayload,
): Promise<{ item: BalancePresetSummary }> {
  return commissionerWrite(`/api/commissioner/balance/presets/${presetId}/duplicate`, 'POST', payload);
}

export async function renameCommissionerBalancePreset(
  presetId: string,
  payload: CommissionerBalanceRenamePayload,
): Promise<{ item: BalancePresetSummary }> {
  return commissionerWrite(`/api/commissioner/balance/presets/${presetId}`, 'PATCH', payload);
}

export async function createCommissionerBalanceVersion(
  presetId: string,
  payload: CommissionerBalanceCreateVersionPayload,
): Promise<{ item: BalancePresetVersionDetail }> {
  return commissionerWrite(`/api/commissioner/balance/presets/${presetId}/versions`, 'POST', payload);
}

export async function activateCommissionerBalanceVersion(
  versionId: string,
  payload: CommissionerBalanceActivatePayload,
): Promise<{ item: ActiveBalanceSnapshot }> {
  return commissionerWrite(`/api/commissioner/balance/versions/${versionId}/activate`, 'POST', payload);
}

export async function resetCommissionerBalancePreset(
  presetId: string,
  payload: CommissionerBalanceResetPayload,
): Promise<{ item: BalancePresetVersionDetail }> {
  return commissionerWrite(`/api/commissioner/balance/presets/${presetId}/reset`, 'POST', payload);
}

export async function importCommissionerBalancePreset(
  payload: CommissionerBalanceImportPayload,
): Promise<{ item: BalancePresetSummary }> {
  return commissionerWrite('/api/commissioner/balance/import', 'POST', payload);
}

export async function validateCommissionerBalanceConfig(
  payload: CommissionerBalanceValidatePayload,
): Promise<BalanceValidationPreview> {
  return commissionerWrite('/api/commissioner/balance/validate', 'POST', payload);
}

export async function getCommissionerBalanceAudit(
  params: Record<string, string | number | undefined | null> = {},
  signal?: AbortSignal,
): Promise<Paginated<BalanceAuditItem>> {
  return commissionerGetJson(`/api/commissioner/balance/audit${qs(params)}`, signal);
}

export type TechnicalEventDetail = 'NONE' | 'SUMMARY' | 'FULL';
export type TechnicalStepMode = 'NEXT_EVENT' | 'NEXT_SHIFT' | 'END_PERIOD' | 'END_REGULATION';

export interface TechnicalSimulationMetadata {
  engineVersion: string;
  simulationMode: string;
  balancePresetId: string;
  balanceVersionId: string;
  balanceVersionNumber: number;
  balanceHash: string;
  seed: string | number;
  inputFingerprint: string;
}

export interface TechnicalMatchEvent {
  index: number;
  type: string;
  period: number;
  elapsedSeconds: number;
  remainingSeconds: number;
  teamId: string | null;
  playerIds: string[];
  zone: string | null;
  possession: string;
  visibility: string;
  details: Record<string, unknown>;
}

export interface TechnicalSimulationDiagnostics {
  totalEvents: number;
  eventsByType: Record<string, number>;
  traceHash: string;
  faceoffWins: { home: number; away: number };
  possessionSecondsByTeam: { home: number; away: number; none: number };
  safetyLimitHit: boolean;
  shotAttempts?: number;
  shotsBlocked?: number;
  shotsMissed?: number;
  shotsOnGoal?: number;
  saves?: number;
  goals?: number;
  shootingPercentage?: number;
  savePercentage?: number;
  averageShotQuality?: number;
  reconciliationOk?: boolean | null;
  penalties?: number;
  powerPlayOpportunities?: number;
  powerPlayGoals?: number;
  powerPlayPercentage?: number;
  shortHandedGoals?: number;
  penaltiesByInfraction?: Record<string, number>;
  evenStrengthGoals?: number;
}

export interface TechnicalPeriodScore {
  period: number;
  home: number;
  away: number;
}

export interface TechnicalTeamStats {
  teamId: string;
  side: 'HOME' | 'AWAY';
  goals: number;
  shotAttempts: number;
  shotsOnGoal: number;
  blockedShotsAgainst: number;
  missedShots: number;
  saves: number;
  shootingPercentage: number;
  faceoffWins: number;
  possessionSeconds: number;
  offensiveZoneSeconds: number;
  defensiveZoneSeconds: number;
  penalties: number;
  penaltyMinutes: number;
  powerPlayOpportunities: number;
  powerPlayGoals: number;
  powerPlayPercentage: number;
  penaltyKillOpportunities: number;
  penaltyKills: number;
  penaltyKillPercentage: number;
  shortHandedGoals: number;
}

export interface TechnicalSkaterStats {
  playerId: string;
  teamId: string;
  side: 'HOME' | 'AWAY';
  lineupSlot: string;
  primaryPosition: string;
  goals: number;
  assists: number;
  points: number;
  shotsOnGoal: number;
  shotAttempts: number;
  penaltyMinutes: number;
  penaltiesTaken: number;
  powerPlayGoals: number;
  shortHandedGoals: number;
}

export interface TechnicalGoalieStats {
  playerId: string;
  teamId: string;
  side: 'HOME' | 'AWAY';
  lineupSlot: string;
  shotsAgainst: number;
  saves: number;
  goalsAgainst: number;
  savePercentage: number;
}

export interface TechnicalMatchStatistics {
  home: TechnicalTeamStats;
  away: TechnicalTeamStats;
  skaters: TechnicalSkaterStats[];
  goalies: TechnicalGoalieStats[];
  periodScores: TechnicalPeriodScore[];
}

export interface TechnicalReconciliation {
  ok: boolean;
  checks: Array<{ code: string; ok: boolean; message: string }>;
}

export interface TechnicalPlayerDirectoryEntry {
  firstName: string;
  lastName: string;
  teamId: string;
}

export interface TechnicalMatchSnapshot {
  schemaVersion: number;
  engineVersion: string;
  inputFingerprint: string;
  balanceHash: string;
  seed: string | number;
  traceHash: string;
  state: Record<string, unknown>;
  events: TechnicalMatchEvent[];
}

async function postJson<T>(path: string, payload: unknown, signal?: AbortSignal): Promise<T> {
  const res = await fetch(`${apiBase()}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    signal,
  });
  if (!res.ok) {
    const err = new Error(await readError(res)) as Error & { status?: number };
    err.status = res.status;
    throw err;
  }
  return res.json() as Promise<T>;
}

async function deleteJson<T>(path: string, signal?: AbortSignal): Promise<T> {
  const res = await fetch(`${apiBase()}${path}`, { method: 'DELETE', signal });
  if (!res.ok) {
    const err = new Error(await readError(res)) as Error & { status?: number };
    err.status = res.status;
    throw err;
  }
  if (res.status === 204) return undefined as T;
  const text = await res.text();
  if (!text) return undefined as T;
  return JSON.parse(text) as T;
}

export async function simulateTechnicalRegulation(
  payload: {
    homeTeamId: string;
    awayTeamId: string;
    seed: string | number;
    eventDetail?: TechnicalEventDetail;
  },
  signal?: AbortSignal,
): Promise<{
  item: {
    metadata: TechnicalSimulationMetadata;
    finalState: Record<string, unknown>;
    diagnostics: TechnicalSimulationDiagnostics;
    statistics: TechnicalMatchStatistics;
    reconciliation: TechnicalReconciliation;
    periodScores: TechnicalPeriodScore[];
    playerDirectory: Record<string, TechnicalPlayerDirectoryEntry>;
    events?: TechnicalMatchEvent[];
    eventSummary?: { total: number; byType: Record<string, number> };
    eventsTruncated?: boolean;
    totalEventCount?: number;
    notice: string;
  };
}> {
  return postJson('/api/simulation/debug/regulation', payload, signal);
}

export async function stepTechnicalSimulation(
  payload: {
    homeTeamId: string;
    awayTeamId: string;
    seed: string | number;
    stepMode: TechnicalStepMode;
    snapshot?: TechnicalMatchSnapshot | null;
    eventDetail?: TechnicalEventDetail;
  },
  signal?: AbortSignal,
): Promise<{
  item: {
    metadata: TechnicalSimulationMetadata;
    state: Record<string, unknown>;
    snapshot: TechnicalMatchSnapshot;
    diagnostics: TechnicalSimulationDiagnostics;
    playerDirectory: Record<string, TechnicalPlayerDirectoryEntry>;
    events?: TechnicalMatchEvent[];
    completed: boolean;
    notice: string;
  };
}> {
  return postJson('/api/simulation/debug/step', payload, signal);
}

/** F16 Simulation Lab — client DTOs aligned with `/api/simulation-lab/*`. */
export type LabSimulationCount = 1 | 10 | 100 | 1000;
export type LabSideMode = 'FIXED' | 'ALTERNATE';
export type LabRunStatus = 'QUEUED' | 'RUNNING' | 'COMPLETED' | 'FAILED' | 'CANCELLED';
export type LabExportFormat = 'json' | 'games-csv' | 'players-csv' | 'lines-csv' | 'comparison-csv';
export type LabLoggingLevel = 'MINIMAL' | 'STANDARD' | 'DETAILED' | 'DEBUG';

export type {
  LabAggregate,
  LabAnomaly,
  LabBatchResult,
  LabComparisonResult,
  LabGameSummary,
  LabPlayerAggregate,
  LabUnitAggregate,
} from '@fhm/engine';

export type LabHistogramBucket = import('@fhm/engine').LabAggregate['scoring']['combinedGoalsHistogram'][number];

export interface LabTeamOption {
  id: string;
  name: string;
  shortName?: string | null;
  readiness: 'READY' | 'WARNING' | 'NOT_READY';
  readinessStatus?: 'READY' | 'WARNING' | 'NOT_READY';
}

export interface LabBalanceVersionOption {
  id: string;
  versionId?: string;
  versionNumber: number;
  configHash: string;
  presetId: string;
  presetName: string;
  schemaVersion: number;
  isActive?: boolean;
  changeReason?: string;
  createdAt?: string;
}

export interface LabActiveBalanceOption {
  versionId: string;
  versionNumber: number;
  configHash: string;
  presetId: string;
  presetName: string;
  schemaVersion?: number;
  runtimeDefaults?: LabRuntimeSettingsInput & { randomSeed?: number | null };
}

export interface LabLimits {
  maxCount: number;
  maxConcurrent: number;
  maxRetained: number;
  retentionMs: number;
  chunkSize: number;
}

export interface LabRuntimeSettingsInput {
  simulationRandomness: number;
  loggingLevel: LabLoggingLevel;
}

export interface SimulationLabOptions {
  enabled: boolean;
  teams: LabTeamOption[];
  activeBalance: LabActiveBalanceOption | null;
  balanceVersions: LabBalanceVersionOption[];
  supportedCounts: LabSimulationCount[];
  sideModes: LabSideMode[];
  limits: LabLimits;
  /** @deprecated Prefer activeBalance.runtimeDefaults */
  runtimeDefaults?: LabRuntimeSettingsInput;
}

export interface CreateLabRunPayload {
  teamAId: string;
  teamBId: string;
  baselineBalanceVersionId?: string;
  comparisonBalanceVersionId?: string | null;
  simulationCount: LabSimulationCount;
  baseSeed: string;
  sideMode: LabSideMode;
  runtimeSettings?: Partial<LabRuntimeSettingsInput> & {
    simulationRandomness?: number;
    loggingLevel?: LabLoggingLevel;
    randomSeed?: number | null;
  };
  includeGameSummaries?: boolean;
  includePlayerAggregates?: boolean;
  includeLineAggregates?: boolean;
}

export interface LabRunProgress {
  completed: number;
  total: number;
}

export interface LabRunItem {
  id: string;
  runId?: string;
  status: LabRunStatus;
  progress: LabRunProgress;
  result?: import('@fhm/engine').LabBatchResult | null;
  error?: string | null;
  isPartial?: boolean;
  startedAt: string | null;
  completedAt: string | null;
  createdAt?: string;
}

export async function getSimulationLabOptions(
  signal?: AbortSignal,
): Promise<{ item: SimulationLabOptions }> {
  return getJson('/api/simulation-lab/options', signal);
}

export async function createSimulationLabRun(
  payload: CreateLabRunPayload,
  signal?: AbortSignal,
): Promise<{ item: { runId: string; status: LabRunStatus } }> {
  return postJson('/api/simulation-lab/runs', payload, signal);
}

export async function getSimulationLabRun(
  runId: string,
  signal?: AbortSignal,
): Promise<{ item: LabRunItem }> {
  return getJson(`/api/simulation-lab/runs/${runId}`, signal);
}

export async function cancelSimulationLabRun(
  runId: string,
  signal?: AbortSignal,
): Promise<{ item?: LabRunItem } | void> {
  return deleteJson(`/api/simulation-lab/runs/${runId}`, signal);
}

export async function exportSimulationLabRun(
  runId: string,
  format: LabExportFormat,
  signal?: AbortSignal,
): Promise<void> {
  const ext =
    format === 'json'
      ? 'json'
      : format === 'games-csv'
        ? 'games.csv'
        : format === 'players-csv'
          ? 'players.csv'
          : 'comparison.csv';
  return downloadFromApi(
    `/api/simulation-lab/runs/${runId}/export${qs({ format })}`,
    `lab-run-${runId}.${ext}`,
    { signal },
  );
}

export type MatchStatus = 'PREPARED' | 'SIMULATING' | 'COMPLETED' | 'FAILED' | 'SUPERSEDED';
export type MatchDecisionType = 'REGULATION' | 'OVERTIME' | 'SHOOTOUT' | 'TIE';

export interface MatchCurrentResultSummary {
  id: string;
  decisionType: MatchDecisionType;
  homeScore: number;
  awayScore: number;
  winnerTeamId: string | null;
  completedAt: string | null;
  engineVersion: string;
  randomSeed: string;
  traceHash: string;
}

export interface MatchListItem {
  id: string;
  homeTeamId: string;
  awayTeamId: string;
  homeTeamName: string;
  awayTeamName: string;
  competitionEditionId: string | null;
  status: MatchStatus;
  scheduledAt: string | null;
  currentResultId: string | null;
  currentResult: MatchCurrentResultSummary | null;
  latestSimulationAttemptNumber: number;
  source: 'MANUAL' | 'COMPETITION';
  createdAt: string;
  updatedAt: string;
}

export interface MatchDetail extends MatchListItem {
  rules: {
    regulationPeriods: number;
    periodDurationSeconds: number;
    completion: {
      overtimeEnabled: boolean;
      shootoutEnabled: boolean;
      tiesAllowed: boolean;
    };
  };
  competitionEdition: {
    id: string;
    displayName: string;
    status: string;
  } | null;
}

export interface MatchSimulateResult {
  matchId: string;
  resultId: string;
  decisionType: MatchDecisionType;
  homeScore: number;
  awayScore: number;
  winnerTeamId: string | null;
  traceHash: string;
  reconciliationOk: boolean;
}

export interface MatchPlayerStat {
  playerId: string;
  teamId: string;
  teamName: string | null;
  firstName: string | null;
  lastName: string | null;
  position: string;
  goals: number;
  assists: number;
  points: number;
  shotsOnGoal: number;
  penaltyMinutes: number;
  powerPlayGoals: number;
  shortHandedGoals: number;
  shootoutAttempts: number;
  shootoutGoals: number;
  stats: Record<string, unknown>;
}

export interface MatchTeamStat {
  teamId: string;
  teamName: string | null;
  side: string;
  goals: number;
  shotsOnGoal: number;
  penalties: number;
  penaltyMinutes: number;
  powerPlayGoals: number;
  shortHandedGoals: number;
  shootoutAttempts: number;
  shootoutGoals: number;
  stats: Record<string, unknown>;
}

export interface MatchResultDetail {
  matchId: string;
  resultId: string;
  attemptNumber: number;
  status: string;
  decisionType: MatchDecisionType;
  homeTeam: { id: string; name: string; side: 'HOME' };
  awayTeam: { id: string; name: string; side: 'AWAY' };
  score: {
    home: number;
    away: number;
    homeRegulation: number;
    awayRegulation: number;
    homeOvertime: number;
    awayOvertime: number;
    homeShootout: number;
    awayShootout: number;
  };
  winnerTeamId: string | null;
  engineVersion: string;
  simulationMode: string;
  randomSeed: string;
  inputFingerprint: string;
  balance: {
    presetId: string;
    versionId: string;
    versionNumber: number;
    configHash: string;
  };
  traceHash: string;
  reconciliationStatus: string;
  reconciliation: { ok: boolean; checks: Array<{ code: string; ok: boolean; message: string }> } | null;
  diagnostics: Record<string, unknown> | null;
  startedAt: string;
  completedAt: string | null;
  playerStats: MatchPlayerStat[];
  teamStats: MatchTeamStat[];
}

export interface MatchEventItem {
  id: string;
  eventIndex: number;
  eventType: string;
  period: number;
  elapsedSeconds: number;
  remainingSeconds: number;
  teamId: string | null;
  primaryPlayerId: string | null;
  primaryPlayerName: string | null;
  visibility: string;
  event: {
    type: string;
    details?: Record<string, unknown>;
    playerIds?: string[];
  };
}

export interface MatchAttemptItem {
  id: string;
  attemptNumber: number;
  status: string;
  decisionType: MatchDecisionType;
  homeScore: number;
  awayScore: number;
  winnerTeamId: string | null;
  randomSeed: string;
  engineVersion: string;
  simulationMode: string;
  traceHash: string;
  reconciliationStatus: string;
  startedAt: string;
  completedAt: string | null;
  supersededAt: string | null;
  supersededByResultId: string | null;
}

export async function getMatches(
  params: Record<string, string | number | undefined | null> = {},
  signal?: AbortSignal,
): Promise<Paginated<MatchListItem>> {
  return getJson(`/api/matches${qs(params)}`, signal);
}

export async function getMatch(id: string, signal?: AbortSignal): Promise<{ item: MatchDetail }> {
  return getJson(`/api/matches/${id}`, signal);
}

export async function createMatch(
  payload: {
    homeTeamId: string;
    awayTeamId: string;
    competitionEditionId?: string | null;
  },
  signal?: AbortSignal,
): Promise<{ item: MatchListItem }> {
  return postJson('/api/matches', payload, signal);
}

export async function simulateMatch(
  id: string,
  payload: { seed?: string | number } = {},
  signal?: AbortSignal,
): Promise<{ item: MatchSimulateResult }> {
  return postJson(`/api/matches/${id}/simulate`, payload, signal);
}

export async function getMatchResult(id: string, signal?: AbortSignal): Promise<{ item: MatchResultDetail }> {
  return getJson(`/api/matches/${id}/result`, signal);
}

export async function getMatchEvents(
  id: string,
  params: Record<string, string | number | undefined | null> = {},
  signal?: AbortSignal,
): Promise<Paginated<MatchEventItem>> {
  return getJson(`/api/matches/${id}/events${qs(params)}`, signal);
}

export async function getMatchAttempts(
  id: string,
  params: Record<string, string | number | undefined | null> = {},
  signal?: AbortSignal,
): Promise<Paginated<MatchAttemptItem> & { currentResultId: string | null }> {
  return commissionerGetJson(`/api/commissioner/matches/${id}/attempts${qs(params)}`, signal);
}

export async function resimulateMatch(
  id: string,
  payload: {
    expectedCurrentResultId: string;
    seed?: string | number;
    reason: string;
    inputMode: 'ORIGINAL';
  },
): Promise<{ item: { matchId: string; previousResultId: string; resultId: string; seed: string; decisionType: string; homeScore: number; awayScore: number; traceHash: string } }> {
  return commissionerWrite(`/api/commissioner/matches/${id}/resimulate`, 'POST', payload);
}

export type MatchEventCategory =
  | 'all'
  | 'goals'
  | 'shots'
  | 'saves'
  | 'penalties'
  | 'faceoffs'
  | 'overtime'
  | 'shootout';

export type MatchEventVisibility = 'PUBLIC' | 'TECHNICAL' | 'ALL';

export interface MatchOverviewTeam {
  id: string;
  name: string;
  currentName?: string;
  side: 'HOME' | 'AWAY';
}

export interface MatchOverviewPeriodScore {
  period: number;
  home: number;
  away: number;
}

export interface MatchOverviewScoringPlay {
  period: number;
  remainingSeconds: number;
  teamId: string | null;
  teamName: string | null;
  scorerId: string | null;
  scorerName: string | null;
  primaryAssistId: string | null;
  primaryAssistName: string | null;
  secondaryAssistId: string | null;
  secondaryAssistName: string | null;
  strength: string;
  scoreAfter: { home: number; away: number };
}

export interface MatchOverviewShootoutAttempt {
  round: number | null;
  attemptNumber: number | null;
  teamId: string | null;
  teamName: string | null;
  shooterId: string | null;
  shooterName: string | null;
  goalieId: string | null;
  goalieName: string | null;
  scored: boolean;
  shootoutScore: unknown;
}

export interface MatchOverviewTeamStat {
  teamId: string;
  teamName: string | null;
  side: string;
  goals: number;
  shotsOnGoal: number;
  shotAttempts: number | null;
  blockedAttempts: number | null;
  missedAttempts: number | null;
  saves: number | null;
  shootingPercentage: number | null;
  faceoffWins: number | null;
  possessionSeconds: number | null;
  offensiveZoneSeconds: number | null;
  defensiveZoneSeconds: number | null;
  penalties: number;
  penaltyMinutes: number;
  powerPlayOpportunities: number | null;
  powerPlayGoals: number;
  powerPlayPercentage: number | null;
  penaltyKillOpportunities: number | null;
  penaltyKills: number | null;
  penaltyKillPercentage: number | null;
  shortHandedGoals: number;
  shootoutAttempts: number;
  shootoutGoals: number;
  savePercentage: number | null;
  stats: Record<string, number>;
}

export interface MatchOverviewSkater {
  playerId: string;
  teamId: string;
  teamName: string | null;
  firstName: string | null;
  lastName: string | null;
  position: string;
  lineupSlot: string | null;
  goals: number;
  assists: number;
  points: number;
  shotsOnGoal: number;
  shotAttempts: number | null;
  blockedAttempts: number | null;
  missedAttempts: number | null;
  blocks: number | null;
  penaltyMinutes: number;
  powerPlayGoals: number;
  shortHandedGoals: number;
  shootoutAttempts: number;
  shootoutGoals: number;
  timeOnIceSeconds: number | null;
  stats: Record<string, unknown>;
}

export interface MatchOverviewGoalie {
  playerId: string;
  teamId: string;
  teamName: string | null;
  firstName: string | null;
  lastName: string | null;
  lineupSlot: string | null;
  shotsAgainst: number;
  saves: number;
  goalsAgainst: number;
  savePercentage: number | null;
  timeOnIceSeconds: number | null;
  shootoutAttemptsFaced: number;
  shootoutGoalsAllowed: number;
  didNotPlay: boolean;
  stats: Record<string, number | string>;
}

export interface MatchOverviewLineUnit {
  unitKey: string;
  playerIds: string[];
  playerNames: string[];
  effectivePerformance?: number;
  shiftCount?: number;
}

export interface MatchOverviewLineUsageTeam {
  teamId: string;
  teamName: string;
  forwardLines: MatchOverviewLineUnit[];
  defensePairs: MatchOverviewLineUnit[];
  starterGoalie: MatchOverviewLineUnit;
}

export interface MatchOverviewLineUsage {
  home: MatchOverviewLineUsageTeam;
  away: MatchOverviewLineUsageTeam;
  note: string;
}

export interface MatchOverviewMetadata {
  engineVersion: string;
  simulationMode: string;
  randomSeed: string;
  inputFingerprint: string;
  balance: {
    presetId: string;
    versionId: string;
    versionNumber: number;
    configHash: string;
    presetName: string | null;
    schemaVersion: string | number | null;
  };
  traceHash: string;
  reconciliationStatus: string;
  reconciliationOk: boolean;
}

export interface MatchOverviewResult {
  resultId: string;
  attemptNumber: number;
  status: string;
  decisionType: MatchDecisionType;
  score: {
    home: number;
    away: number;
    homeRegulation: number;
    awayRegulation: number;
    homeOvertime: number;
    awayOvertime: number;
    homeShootout: number;
    awayShootout: number;
  };
  winnerTeamId: string | null;
  completedAt: string | null;
  supersededAt: string | null;
  periodScores: MatchOverviewPeriodScore[];
  scoringSummary: MatchOverviewScoringPlay[];
  shootoutSummary: MatchOverviewShootoutAttempt[];
  teamComparison: {
    home: MatchOverviewTeamStat | null;
    away: MatchOverviewTeamStat | null;
  };
  skaters: MatchOverviewSkater[];
  goalies: MatchOverviewGoalie[];
  lineUsage: MatchOverviewLineUsage | null;
  metadata: MatchOverviewMetadata;
}

export interface MatchOverview {
  matchId: string;
  status: MatchStatus;
  prepared: boolean;
  isCurrent: boolean;
  source: 'MANUAL' | 'COMPETITION';
  currentResultId: string | null;
  competitionEdition: {
    id: string;
    displayName: string;
    status: string;
  } | null;
  homeTeam: MatchOverviewTeam;
  awayTeam: MatchOverviewTeam;
  result: MatchOverviewResult | null;
}

export interface MatchEventViewItem {
  id: string;
  eventIndex: number;
  eventType: string;
  period: number;
  elapsedSeconds: number;
  remainingSeconds: number;
  teamId: string | null;
  teamName: string | null;
  primaryPlayerId: string | null;
  primaryPlayerName: string | null;
  visibility: string;
  summary: string;
  participants: {
    primary?: string | null;
    shooter?: string | null;
    goalie?: string | null;
    blocker?: string | null;
    primaryAssist?: string | null;
    secondaryAssist?: string | null;
  };
  details: Record<string, unknown>;
  technical?: {
    strengthState: string | null;
    zone: string | null;
    possession: string | null;
    shiftNumber: number | null;
    rawDetails: Record<string, unknown>;
  };
}

export interface MatchEventViewPage extends Paginated<MatchEventViewItem> {
  matchId: string;
  resultId: string;
  isCurrent: boolean;
}

export interface MatchDiagnosticsCheck {
  code: string;
  ok: boolean;
  message: string;
}

export interface MatchDiagnostics {
  matchId: string;
  resultId: string;
  attemptNumber: number;
  isCurrent: boolean;
  resultStatus: string;
  identity: {
    engineVersion: string;
    simulationMode: string;
    randomSeed: string;
    inputFingerprint: string;
    balance: {
      presetId: string;
      versionId: string;
      versionNumber: number;
      configHash: string;
      presetName: string | null;
      schemaVersion: string | number | null;
    };
    traceHash: string;
    startedAt: string;
    completedAt: string | null;
    supersededAt: string | null;
    supersededByResultId: string | null;
  };
  reconciliation: {
    status: string;
    stored: { ok: boolean; checks: MatchDiagnosticsCheck[] } | null;
    lightweightChecks: MatchDiagnosticsCheck[];
    overallOk: boolean;
  };
  eventCounts: {
    total: number;
    public: number;
    technical: number;
    byType: Record<string, number>;
    byPeriod: Record<string, number>;
    publicEventTypes: readonly string[];
  };
  diagnostics: Record<string, unknown> | null;
  shotDiagnostics: Record<string, unknown> | null;
  specialTeams: Record<string, unknown> | null;
  possessionAndZones: Record<string, unknown> | null;
  lineUsage: unknown;
  inputSummary: Record<string, unknown> | null;
}

export interface MatchAuditItem {
  id: string;
  entityType: string;
  entityId: string;
  action: string;
  reason: string;
  source: string;
  createdAt: string;
  before: unknown;
  after: unknown;
}

export async function getMatchOverview(
  id: string,
  params: { resultId?: string | null } = {},
  signal?: AbortSignal,
): Promise<{ item: MatchOverview }> {
  return getJson(`/api/matches/${id}/overview${qs({ resultId: params.resultId ?? undefined })}`, signal);
}

export async function getMatchEventsView(
  id: string,
  params: Record<string, string | number | undefined | null> = {},
  signal?: AbortSignal,
): Promise<MatchEventViewPage> {
  return getJson(`/api/matches/${id}/events${qs({ format: 'view', visibility: 'PUBLIC', ...params })}`, signal);
}

export async function getMatchDiagnostics(
  id: string,
  params: { resultId?: string | null } = {},
  signal?: AbortSignal,
): Promise<{ item: MatchDiagnostics }> {
  return commissionerGetJson(
    `/api/commissioner/matches/${id}/diagnostics${qs({ resultId: params.resultId ?? undefined })}`,
    signal,
  );
}

export async function getMatchTechnicalEvents(
  id: string,
  resultId: string,
  params: Record<string, string | number | undefined | null> = {},
  signal?: AbortSignal,
): Promise<MatchEventViewPage> {
  return commissionerGetJson(
    `/api/commissioner/matches/${id}/results/${resultId}/events${qs(params)}`,
    signal,
  );
}

export async function getMatchAudit(
  id: string,
  params: Record<string, string | number | undefined | null> = {},
  signal?: AbortSignal,
): Promise<Paginated<MatchAuditItem>> {
  return commissionerGetJson(`/api/commissioner/matches/${id}/audit${qs(params)}`, signal);
}

function filenameFromDisposition(header: string | null, fallback: string): string {
  if (!header) return fallback;
  const match = /filename="?([^"]+)"?/i.exec(header);
  return match?.[1] ?? fallback;
}

async function downloadFromApi(
  path: string,
  fallbackFilename: string,
  opts?: { commissioner?: boolean; signal?: AbortSignal },
): Promise<void> {
  const res = await fetch(`${apiBase()}${path}`, {
    signal: opts?.signal,
    headers: opts?.commissioner ? { [COMMISSIONER_HEADER]: 'enabled' } : undefined,
  });
  if (!res.ok) {
    const err = new Error(await readError(res)) as Error & { status?: number };
    err.status = res.status;
    throw err;
  }
  const blob = await res.blob();
  const filename = filenameFromDisposition(res.headers.get('Content-Disposition'), fallbackFilename);
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export async function exportMatchResultJson(
  id: string,
  params: { resultId?: string | null } = {},
  signal?: AbortSignal,
): Promise<void> {
  return downloadFromApi(
    `/api/matches/${id}/result/export${qs({ resultId: params.resultId ?? undefined })}`,
    `match-${id}-result.json`,
    { signal },
  );
}

export async function exportMatchEventsCsv(
  id: string,
  params: Record<string, string | number | undefined | null> = {},
  signal?: AbortSignal,
): Promise<void> {
  return downloadFromApi(
    `/api/matches/${id}/events/export${qs({ visibility: 'PUBLIC', ...params })}`,
    `match-${id}-events.csv`,
    { signal },
  );
}

export async function exportMatchPlayerStatsCsv(
  id: string,
  params: { resultId?: string | null } = {},
  signal?: AbortSignal,
): Promise<void> {
  return downloadFromApi(
    `/api/matches/${id}/player-stats/export${qs({ resultId: params.resultId ?? undefined })}`,
    `match-${id}-player-stats.csv`,
    { signal },
  );
}

export async function exportMatchTeamStatsCsv(
  id: string,
  params: { resultId?: string | null } = {},
  signal?: AbortSignal,
): Promise<void> {
  return downloadFromApi(
    `/api/matches/${id}/team-stats/export${qs({ resultId: params.resultId ?? undefined })}`,
    `match-${id}-team-stats.csv`,
    { signal },
  );
}

export async function exportMatchDiagnosticsJson(
  id: string,
  params: { resultId?: string | null } = {},
  signal?: AbortSignal,
): Promise<void> {
  return downloadFromApi(
    `/api/commissioner/matches/${id}/diagnostics/export${qs({ resultId: params.resultId ?? undefined })}`,
    `match-${id}-diagnostics.json`,
    { commissioner: true, signal },
  );
}
