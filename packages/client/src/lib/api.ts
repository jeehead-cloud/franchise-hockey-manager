export interface HealthResponse {
  status: 'ok' | 'degraded' | string;
  service: string;
  version?: string;
  timestamp?: string;
  database?: string;
  engine?: { name: string; version: string };
}

export type ConnectionState = 'loading' | 'connected' | 'unavailable';

export function apiBase(): string {
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
  nationalTeamPreparation?: Array<{
    competitionEditionId: string;
    displayName: string;
    competitionId: string;
    competitionName: string;
    total: number;
    ready: number;
    locked: number;
    blockers: string[];
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
    updatedAt?: string;
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

/** F18 regular-season APIs */
export async function getStageSchedule(
  stageId: string,
  params: Record<string, string | number | undefined | null> = {},
  signal?: AbortSignal,
) {
  return getJson<{ item: unknown }>(`/api/competition-stages/${stageId}/schedule${qs(params)}`, signal);
}

export async function getStageProgress(stageId: string, signal?: AbortSignal) {
  return getJson<{ item: StageProgressDto }>(`/api/competition-stages/${stageId}/progress`, signal);
}

export async function getStageStandings(stageId: string, signal?: AbortSignal) {
  return getJson<{ item: StageStandingsDto }>(`/api/competition-stages/${stageId}/standings`, signal);
}

export async function getStageTeamStats(stageId: string, signal?: AbortSignal) {
  return getJson<{ item: { source: string; items: unknown[] } }>(
    `/api/competition-stages/${stageId}/team-stats`,
    signal,
  );
}

export async function getStagePlayerStats(
  stageId: string,
  params: Record<string, string | number | undefined | null> = {},
  signal?: AbortSignal,
) {
  return getJson<{ source: string; total: number; page: number; pageSize: number; items: unknown[] }>(
    `/api/competition-stages/${stageId}/player-stats${qs(params)}`,
    signal,
  );
}

export async function getStageGoalieStats(
  stageId: string,
  params: Record<string, string | number | undefined | null> = {},
  signal?: AbortSignal,
) {
  return getJson<{ source: string; total: number; page: number; pageSize: number; items: unknown[] }>(
    `/api/competition-stages/${stageId}/goalie-stats${qs(params)}`,
    signal,
  );
}

export async function getStageQualification(stageId: string, signal?: AbortSignal) {
  return getJson<{ item: unknown }>(`/api/competition-stages/${stageId}/qualification`, signal);
}

export async function simulateRegularSeasonStage(
  stageId: string,
  body: { baseSeed: string; mode?: 'ALL_REMAINING'; confirmBackup?: boolean },
) {
  return postJson<{ item: StageSimulationRunDto }>(`/api/competition-stages/${stageId}/simulate`, body);
}

export async function getRegularSeasonSimulationRun(stageId: string, runId: string, signal?: AbortSignal) {
  return getJson<{ item: StageSimulationRunDto }>(
    `/api/competition-stages/${stageId}/simulation-run/${runId}`,
    signal,
  );
}

export async function cancelRegularSeasonSimulation(stageId: string, runId: string) {
  return postJson<{ item: StageSimulationRunDto }>(
    `/api/competition-stages/${stageId}/simulation-run/${runId}/cancel`,
    {},
  );
}

/** F21 Aggregated league */
export async function getAggregatedStatus(stageId: string, signal?: AbortSignal) {
  return getJson<{ item: Record<string, unknown> }>(
    `/api/competition-stages/${stageId}/aggregated-status`,
    signal,
  );
}

export async function getAggregatedMatches(
  stageId: string,
  params: Record<string, string | number | undefined | null> = {},
  signal?: AbortSignal,
) {
  return getJson<{
    items: unknown[];
    total: number;
    page: number;
    pageSize: number;
  }>(`/api/competition-stages/${stageId}/aggregated-matches${qs(params)}`, signal);
}

export async function previewAggregatedSeason(stageId: string) {
  return commissionerWrite<{ item: Record<string, unknown> }>(
    `/api/commissioner/competition-stages/${stageId}/aggregated-preview`,
    'POST',
    {},
  );
}

export async function prepareAggregatedSeason(
  stageId: string,
  payload: {
    expectedUpdatedAt: string;
    seed: string;
    balanceVersionId?: string | null;
    reason: string;
  },
) {
  return commissionerWrite<{ item: Record<string, unknown> }>(
    `/api/commissioner/competition-stages/${stageId}/prepare-aggregated-season`,
    'POST',
    payload,
  );
}

export async function discardPreparedAggregatedRun(
  stageId: string,
  payload: {
    expectedUpdatedAt: string;
    seed?: never;
    reason: string;
    runId: string;
  },
) {
  return commissionerWrite<{ item: { discarded: boolean; runId: string } }>(
    `/api/commissioner/competition-stages/${stageId}/discard-prepared-aggregate-run`,
    'POST',
    payload,
  );
}

export async function simulateAggregatedSeason(
  stageId: string,
  body: { runId: string; confirmation: true },
) {
  return postJson<{ item: Record<string, unknown> }>(
    `/api/competition-stages/${stageId}/simulate-aggregated-season`,
    body,
  );
}

export async function getAggregatedDiagnostics(stageId: string, signal?: AbortSignal) {
  return commissionerGetJson<{ item: Record<string, unknown> }>(
    `/api/commissioner/competition-stages/${stageId}/aggregated-diagnostics`,
    signal,
  );
}

export async function previewRegularSeasonSchedule(stageId: string, body: { seed: string }) {
  return commissionerWrite<{ item: unknown }>(
    `/api/commissioner/competition-stages/${stageId}/schedule-preview`,
    'POST',
    body,
  );
}

export async function generateRegularSeasonSchedule(
  stageId: string,
  body: { expectedUpdatedAt: string; seed: string; reason: string },
) {
  return commissionerWrite<{ item: unknown }>(
    `/api/commissioner/competition-stages/${stageId}/generate-schedule`,
    'POST',
    body,
  );
}

export async function regenerateRegularSeasonSchedule(
  stageId: string,
  body: { expectedUpdatedAt: string; seed: string; reason: string },
) {
  return commissionerWrite<{ item: unknown }>(
    `/api/commissioner/competition-stages/${stageId}/regenerate-schedule`,
    'POST',
    body,
  );
}

export interface StageProgressDto {
  stageId: string;
  status: string;
  scheduleStatus: string;
  scheduleHash: string | null;
  totalScheduledMatches: number;
  completedMatches: number;
  remainingMatches: number;
  percentComplete: number;
  simulationStartedAt: string | null;
  completedAt: string | null;
}

export interface StageStandingsDto {
  source: 'PROVISIONAL' | 'FINAL';
  standings: {
    provisional: boolean;
    rows: Array<{
      rank: number;
      participantId: string;
      teamId: string;
      teamNameSnapshot: string;
      gamesPlayed: number;
      regulationWins: number;
      overtimeWins: number;
      shootoutWins: number;
      regulationLosses: number;
      overtimeLosses: number;
      shootoutLosses: number;
      ties: number;
      wins: number;
      losses: number;
      goalsFor: number;
      goalsAgainst: number;
      goalDifference: number;
      points: number;
      qualified: boolean;
      tiebreakerSummary: string;
    }>;
    standingsHash: string;
    qualificationParticipantIds: string[];
  };
  qualification: {
    qualifiedParticipantIds: string[];
    seedingOrder: Array<{ seed: number; participantId: string; teamId: string; rank: number }>;
  };
}

export interface StageSimulationRunDto {
  id: string;
  stageId: string;
  status: string;
  progress: {
    completed: number;
    total: number;
    currentMatchId: string | null;
  };
  backup: { relativeDisplayPath: string; createdAt: string; bytes: number } | null;
  error: { code: string; message: string } | null;
  note?: string;
  cancelRequested?: boolean;
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

async function patchJson<T>(path: string, payload: unknown): Promise<T> {
  const res = await fetch(`${apiBase()}${path}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const err = new Error(await readError(res)) as Error & { status?: number };
    err.status = res.status;
    throw err;
  }
  return res.json() as Promise<T>;
}

async function putJson<T>(path: string, payload: unknown, signal?: AbortSignal): Promise<T> {
  const res = await fetch(`${apiBase()}${path}`, {
    method: 'PUT',
    signal,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
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

// ---------------------------------------------------------------------------
// F20 — Competition archive & history
// ---------------------------------------------------------------------------

export async function getArchiveReadiness(editionId: string, signal?: AbortSignal) {
  return getJson<{
    item: {
      status: 'READY' | 'WARNING' | 'NOT_READY';
      checks: Array<{ id: string; status: string; message: string }>;
      blockers: string[];
      warnings: string[];
      sourceSnapshotHash: string | null;
    };
  }>(`/api/competition-editions/${editionId}/archive-readiness`, signal);
}

export async function getEditionArchiveSummary(editionId: string, signal?: AbortSignal) {
  return getJson<{
    item: {
      id: string;
      archiveHash: string;
      sourceSnapshotHash: string;
      archivedAt: string;
      archiveVersion: number;
      status: string;
      isCurrent: boolean;
      historyPath: string;
    };
  }>(`/api/competition-editions/${editionId}/archive`, signal);
}

export async function archiveCompetitionEdition(
  editionId: string,
  payload: { expectedUpdatedAt: string; reason: string },
) {
  return commissionerWrite<{
    item: {
      alreadyArchived: boolean;
      archive: { id: string; archiveHash: string; sourceSnapshotHash: string };
      historyPath: string;
      backup: { relativeDisplayPath: string } | null;
    };
  }>(`/api/commissioner/competition-editions/${editionId}/archive`, 'POST', payload);
}

export async function getHistoryLanding(signal?: AbortSignal) {
  return getJson<{
    item: {
      archiveCount: number;
      latest: Array<{
        id: string;
        competitionNameSnapshot: string;
        worldSeasonNameSnapshot: string;
        championNameSnapshot: string | null;
        archivedAt: string;
      }>;
      champions: Array<{
        id: string;
        competitionNameSnapshot: string;
        worldSeasonNameSnapshot: string;
        championNameSnapshot: string | null;
      }>;
    };
  }>('/api/history', signal);
}

export async function getHistoryCompetitions(
  params: Record<string, string | number | undefined | null> = {},
  signal?: AbortSignal,
) {
  return getJson<{
    items: Array<{
      id: string;
      competitionNameSnapshot: string;
      editionNameSnapshot: string;
      worldSeasonNameSnapshot: string;
      championNameSnapshot: string | null;
      matchCount: number;
      participantCount: number;
      archivedAt: string;
      archiveHash: string;
    }>;
    page: number;
    pageSize: number;
    total: number;
  }>(`/api/history/competitions${qs(params)}`, signal);
}

export async function getHistoryArchive(archiveId: string, signal?: AbortSignal) {
  return getJson<{ item: Record<string, unknown> }>(
    `/api/history/competitions/${archiveId}`,
    signal,
  );
}

export async function getHistoryArchiveStandings(archiveId: string, signal?: AbortSignal) {
  return getJson<{ item: unknown[] }>(
    `/api/history/competitions/${archiveId}/standings`,
    signal,
  );
}

export async function getHistoryArchiveMatches(
  archiveId: string,
  params: Record<string, string | number | undefined | null> = {},
  signal?: AbortSignal,
) {
  return getJson<{ items: unknown[]; total: number }>(
    `/api/history/competitions/${archiveId}/matches${qs(params)}`,
    signal,
  );
}

export async function getHistoryArchiveBracket(archiveId: string, signal?: AbortSignal) {
  return getJson<{ item: { series: unknown[]; champion: unknown } }>(
    `/api/history/competitions/${archiveId}/bracket`,
    signal,
  );
}

export async function getHistoryArchiveAwards(archiveId: string, signal?: AbortSignal) {
  return getJson<{ item: unknown[] }>(`/api/history/competitions/${archiveId}/awards`, signal);
}

export async function getHistoryArchivePlayerStats(
  archiveId: string,
  params: Record<string, string | number | undefined | null> = {},
  signal?: AbortSignal,
) {
  return getJson<{ items: unknown[]; total: number }>(
    `/api/history/competitions/${archiveId}/player-stats${qs(params)}`,
    signal,
  );
}

export async function getHistoryArchiveGoalieStats(
  archiveId: string,
  params: Record<string, string | number | undefined | null> = {},
  signal?: AbortSignal,
) {
  return getJson<{ items: unknown[]; total: number }>(
    `/api/history/competitions/${archiveId}/goalie-stats${qs(params)}`,
    signal,
  );
}

export async function getHistoryArchiveTeamStats(archiveId: string, signal?: AbortSignal) {
  return getJson<{ item: unknown[] }>(
    `/api/history/competitions/${archiveId}/team-stats`,
    signal,
  );
}

export async function getHistoryArchiveParticipants(archiveId: string, signal?: AbortSignal) {
  return getJson<{ item: unknown[] }>(
    `/api/history/competitions/${archiveId}/participants`,
    signal,
  );
}

export async function getHistoryChampions(
  params: Record<string, string | number | undefined | null> = {},
  signal?: AbortSignal,
) {
  return getJson<{ items: unknown[]; total: number }>(
    `/api/history/champions${qs(params)}`,
    signal,
  );
}

export async function getHistoryRecords(signal?: AbortSignal) {
  return getJson<{ item: unknown[] }>('/api/history/records', signal);
}

export async function getPlayerHistorySeasons(playerId: string, signal?: AbortSignal) {
  return getJson<{ item: { seasons: unknown[]; awards: unknown[] } }>(
    `/api/history/players/${playerId}/seasons`,
    signal,
  );
}

export async function getTeamHistorySeasons(teamId: string, signal?: AbortSignal) {
  return getJson<{ item: { seasons: unknown[] } }>(
    `/api/history/teams/${teamId}/seasons`,
    signal,
  );
}

/** F22 National Teams */
export async function getNationalTeams(
  params: Record<string, string | number | undefined | null> = {},
  signal?: AbortSignal,
) {
  return getJson<{
    items: unknown[];
    total: number;
    page: number;
    pageSize: number;
  }>(`/api/national-teams${qs(params)}`, signal);
}

export async function getNationalTeam(id: string, signal?: AbortSignal) {
  return getJson<{ item: Record<string, unknown> }>(`/api/national-teams/${id}`, signal);
}

export async function getNationalTeamEditions(
  params: Record<string, string | number | undefined | null> = {},
  signal?: AbortSignal,
) {
  return getJson<{ items: unknown[]; total: number }>(
    `/api/national-team-editions${qs(params)}`,
    signal,
  );
}

export async function getNationalTeamEdition(id: string, signal?: AbortSignal) {
  return getJson<{ item: Record<string, unknown> }>(`/api/national-team-editions/${id}`, signal);
}

export async function getNationalTeamEditionCandidates(id: string, signal?: AbortSignal) {
  return getJson<{ items?: unknown[]; item?: unknown }>(
    `/api/national-team-editions/${id}/candidates`,
    signal,
  );
}

export async function getNationalTeamEditionRoster(id: string, signal?: AbortSignal) {
  return getJson<{ items?: unknown[]; item?: unknown }>(
    `/api/national-team-editions/${id}/roster`,
    signal,
  );
}

export async function getNationalTeamEditionStaff(id: string, signal?: AbortSignal) {
  return getJson<{ items?: unknown[]; item?: unknown }>(
    `/api/national-team-editions/${id}/staff`,
    signal,
  );
}

export async function getNationalTeamEditionTactics(id: string, signal?: AbortSignal) {
  return getJson<{ item: Record<string, unknown> | null }>(
    `/api/national-team-editions/${id}/tactics`,
    signal,
  );
}

export async function getNationalTeamEditionLineup(id: string, signal?: AbortSignal) {
  return getJson<{ item: Record<string, unknown> | null }>(
    `/api/national-team-editions/${id}/lineup`,
    signal,
  );
}

export async function getNationalTeamEditionReadiness(id: string, signal?: AbortSignal) {
  return getJson<{ item: Record<string, unknown> }>(
    `/api/national-team-editions/${id}/readiness`,
    signal,
  );
}

export async function createNationalTeam(payload: {
  countryId: string;
  category: 'SENIOR_MEN' | 'JUNIOR_U20';
  displayName: string;
  shortName?: string | null;
  reason: string;
}) {
  return commissionerWrite<{ item: Record<string, unknown> }>(
    '/api/commissioner/national-teams',
    'POST',
    payload,
  );
}

export async function prepareNationalTeamEdition(
  competitionEditionId: string,
  nationalTeamId: string,
  payload: { reason: string; expectedUpdatedAt: string; rules?: unknown },
) {
  return commissionerWrite<{ item: Record<string, unknown> }>(
    `/api/commissioner/competition-editions/${competitionEditionId}/national-teams/${nationalTeamId}/prepare`,
    'POST',
    payload,
  );
}

export async function updateNationalTeamRoster(
  editionId: string,
  payload: {
    expectedUpdatedAt: string;
    reason: string;
    roster: Array<{
      sourcePlayerId: string;
      rosterRole: string;
      rosterOrder: number;
      jerseyNumber?: number | null;
      captainRole?: string;
    }>;
  },
) {
  return commissionerWrite<{ item: unknown }>(
    `/api/commissioner/national-team-editions/${editionId}/roster`,
    'PATCH',
    payload,
  );
}

export async function reopenNationalTeamRoster(
  editionId: string,
  payload: { expectedUpdatedAt: string; reason: string },
) {
  return commissionerWrite<{ item: unknown }>(
    `/api/commissioner/national-team-editions/${editionId}/reopen-roster`,
    'POST',
    payload,
  );
}

export async function generateNationalTeamCandidates(
  editionId: string,
  payload: { expectedUpdatedAt: string; reason: string },
) {
  return commissionerWrite<{ item: unknown }>(
    `/api/commissioner/national-team-editions/${editionId}/generate-candidates`,
    'POST',
    payload,
  );
}

export async function suggestNationalTeamRoster(
  editionId: string,
  payload: {
    expectedUpdatedAt: string;
    reason: string;
    targetRosterSize?: number;
    confirmReplace?: boolean;
  },
) {
  return commissionerWrite<{ item: unknown }>(
    `/api/commissioner/national-team-editions/${editionId}/suggest-roster`,
    'POST',
    payload,
  );
}

export async function confirmNationalTeamRoster(
  editionId: string,
  payload: { expectedUpdatedAt: string; reason: string },
) {
  return commissionerWrite<{ item: unknown }>(
    `/api/commissioner/national-team-editions/${editionId}/confirm-roster`,
    'POST',
    payload,
  );
}

export async function updateNationalTeamStaff(
  editionId: string,
  payload: {
    expectedUpdatedAt: string;
    reason: string;
    staff: Array<{ sourceCoachId: string; role: string; assignmentOrder?: number }>;
  },
) {
  return commissionerWrite<{ item: unknown }>(
    `/api/commissioner/national-team-editions/${editionId}/staff`,
    'PATCH',
    payload,
  );
}

export async function updateNationalTeamTactics(
  editionId: string,
  payload: {
    expectedUpdatedAt: string;
    reason: string;
    tacticalStyle: string;
    tacticsText?: string;
  },
) {
  return commissionerWrite<{ item: unknown }>(
    `/api/commissioner/national-team-editions/${editionId}/tactics`,
    'PATCH',
    payload,
  );
}

export async function autoNationalTeamLineup(
  editionId: string,
  payload: { expectedUpdatedAt: string; reason: string },
) {
  return commissionerWrite<{ item: unknown }>(
    `/api/commissioner/national-team-editions/${editionId}/auto-lineup`,
    'POST',
    payload,
  );
}

export async function lockNationalTeamEdition(
  editionId: string,
  payload: { expectedUpdatedAt: string; reason: string },
) {
  return commissionerWrite<{ item: unknown }>(
    `/api/commissioner/national-team-editions/${editionId}/lock`,
    'POST',
    payload,
  );
}

/** F23 International Tournaments */
export async function getInternationalTournamentStatus(editionId: string, signal?: AbortSignal) {
  return getJson<{ item: Record<string, unknown> }>(
    `/api/competition-editions/${editionId}/international/status`,
    signal,
  );
}

export async function getInternationalTournamentOverview(editionId: string, signal?: AbortSignal) {
  return getJson<{ item: Record<string, unknown> }>(
    `/api/competition-editions/${editionId}/international/overview`,
    signal,
  );
}

export async function getInternationalTournamentGroups(editionId: string, signal?: AbortSignal) {
  return getJson<{ item: Record<string, unknown> }>(
    `/api/competition-editions/${editionId}/international/groups`,
    signal,
  );
}

export async function getInternationalTournamentMedals(editionId: string, signal?: AbortSignal) {
  return getJson<{ item: Record<string, unknown> }>(
    `/api/competition-editions/${editionId}/international/medals`,
    signal,
  );
}

export async function getInternationalTournamentProgress(editionId: string, signal?: AbortSignal) {
  return getJson<{ item: Record<string, unknown> }>(
    `/api/competition-editions/${editionId}/international/progress`,
    signal,
  );
}

export async function previewInternationalTournament(
  editionId: string,
  payload: { templateKey?: string; useTestTemplate?: boolean },
) {
  return commissionerWrite<{ item: Record<string, unknown> }>(
    `/api/commissioner/competition-editions/${editionId}/international/preview`,
    'POST',
    payload,
  );
}

export async function prepareInternationalTournament(
  editionId: string,
  payload: {
    expectedUpdatedAt: string;
    reason: string;
    templateKey?: string;
    useTestTemplate?: boolean;
    baseSeed?: string;
  },
) {
  return commissionerWrite<{ item: Record<string, unknown> }>(
    `/api/commissioner/competition-editions/${editionId}/prepare-international-tournament`,
    'POST',
    payload,
  );
}

export async function generateInternationalSchedule(
  editionId: string,
  payload: { expectedUpdatedAt: string; reason: string; seed?: string },
) {
  return commissionerWrite<{ item: Record<string, unknown> }>(
    `/api/commissioner/competition-editions/${editionId}/generate-international-schedule`,
    'POST',
    payload,
  );
}

export async function simulateInternationalTournament(
  editionId: string,
  payload: { baseSeed: string; confirmBackup?: boolean },
) {
  return postJson<{ item: Record<string, unknown> }>(
    `/api/competition-editions/${editionId}/simulate-international-tournament`,
    payload,
  );
}

export async function getInternationalSimulationRun(
  editionId: string,
  runId: string,
  signal?: AbortSignal,
) {
  return getJson<{ item: Record<string, unknown> }>(
    `/api/competition-editions/${editionId}/international/simulation-runs/${runId}`,
    signal,
  );
}

export async function cancelInternationalSimulation(editionId: string, runId: string) {
  return postJson<{ item: Record<string, unknown> }>(
    `/api/competition-editions/${editionId}/international/simulation-runs/${runId}/cancel`,
    {},
  );
}

// --- F24 Player Development ---

export type PlayerDevelopmentRunStatus =
  | 'PREPARED'
  | 'RUNNING'
  | 'COMPLETED'
  | 'FAILED'
  | 'CANCELLED';

export type PlayerDevelopmentOutcome =
  | 'DEVELOPED'
  | 'DECLINED'
  | 'STABLE'
  | 'RETIRED'
  | string;

export interface DevelopmentRunSummaryDto {
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

export interface DevelopmentRunDto {
  id: string;
  worldSeasonId: string;
  status: PlayerDevelopmentRunStatus;
  runVersion: number;
  effectiveDate: string;
  baseSeed: string;
  configVersionId: string;
  configHash: string;
  inputHash: string;
  resultHash: string | null;
  totalPlayers: number;
  developedCount: number;
  declinedCount: number;
  stableCount: number;
  retiredCount: number;
  warningCount: number;
  isCurrent: boolean;
  backupPath: string | null;
  failureReason: string | null;
  startedAt: string | null;
  completedAt: string | null;
  failedAt: string | null;
  cancelledAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface DevelopmentStatus {
  worldSeason: {
    id: string;
    label: string;
    status: string;
    phase: string;
    updatedAt: string;
  };
  activeConfig: {
    presetName: string;
    versionId: string;
    versionNumber: number;
    configHash: string;
  };
  currentCompletedRun: DevelopmentRunDto | null;
  activeRun: DevelopmentRunDto | null;
  developmentApplied: boolean;
}

export interface DevelopmentReadiness {
  worldSeasonId: string;
  effectiveDate: string | null;
  status: 'READY' | 'WARNING' | 'NOT_READY';
  checks: Array<{ code: string; status: 'PASS' | 'WARN' | 'FAIL'; message: string }>;
  blockers: string[];
  warnings: string[];
  eligiblePlayerCount: number;
}

export interface DevelopmentPreviewResultDto {
  playerId: string;
  playerName: string;
  playerType: string;
  position: string;
  teamId: string | null;
  teamName: string | null;
  ageOnEffectiveDate: number;
  currentAbilityBefore: number;
  currentAbilityAfter: number;
  roleBefore: string;
  roleAfter: string;
  formBefore: number;
  formAfter: number;
  outcome: string;
  retired: boolean;
  direction: string;
  attributeChangeCount: number;
  warnings: string[];
  potentialCeiling?: number;
}

export interface DevelopmentPreviewResponse {
  preview: true;
  worldSeasonId: string;
  effectiveDate: string;
  baseSeed: string;
  configHash: string;
  summary: DevelopmentRunSummaryDto;
  items: DevelopmentPreviewResultDto[];
  page: number;
  pageSize: number;
  total: number;
}

export interface DevelopmentResultRow {
  id: string;
  runId: string;
  playerId: string;
  playerName: string;
  playerType: string;
  position: string;
  teamId: string | null;
  teamName: string | null;
  ageOnEffectiveDate: number;
  currentAbilityBefore: number;
  currentAbilityAfter: number;
  roleBefore: string;
  roleAfter: string;
  formBefore: number;
  formAfter: number;
  outcome: PlayerDevelopmentOutcome;
  retired: boolean;
  retirementReason: string | null;
  attributeChanges: unknown;
  resultHash: string;
  potentialCeiling?: number;
}

export interface DevelopmentRetirementRow {
  playerId: string;
  playerName: string;
  teamId: string | null;
  teamName: string | null;
  ageOnEffectiveDate: number;
  currentAbilityBefore: number;
  currentAbilityAfter: number;
  retirementReason: string | null;
  outcome: PlayerDevelopmentOutcome;
}

export interface DevelopmentPresetSummary {
  id: string;
  name: string;
  description: string | null;
  isSystem: boolean;
  createdAt: string;
  updatedAt: string;
  latestVersion: {
    id: string;
    versionNumber: number;
    schemaVersion: number;
    configHash: string;
    changeReason: string;
    createdAt: string;
    isActive: boolean;
  } | null;
  isActive: boolean;
}

export interface PlayerDevelopmentHistory {
  playerId: string;
  playerName: string;
  results: Array<
    DevelopmentResultRow & {
      effectiveDate: string;
      runStatus: PlayerDevelopmentRunStatus;
      runCompletedAt: string | null;
    }
  >;
  snapshots: Array<{
    id: string;
    runId: string;
    worldSeasonId: string;
    snapshotType: string;
    snapshotDate: string;
    role: string;
    currentAbility: number;
    form: number;
    playerStatus: string;
    attributesHash: string;
    createdAt: string;
    potentialCeiling?: number;
  }>;
}

export interface DevelopmentRunDiagnostics {
  run: DevelopmentRunDto;
  config: {
    presetName: string;
    versionNumber: number;
    configHash: string;
  };
  sampleTopChanges: Array<{
    playerId: string;
    playerName: string;
    abilityDelta: number;
    outcome: PlayerDevelopmentOutcome;
    retired: boolean;
    diagnostics: unknown;
  }>;
}

export async function getDevelopmentStatus(
  worldSeasonId?: string,
  signal?: AbortSignal,
): Promise<{ item: DevelopmentStatus }> {
  return getJson(`/api/player-development/status${qs({ worldSeasonId })}`, signal);
}

export async function getDevelopmentReadiness(
  params: {
    worldSeasonId: string;
    effectiveDate?: string;
    configVersionId?: string;
  },
  signal?: AbortSignal,
): Promise<{ item: DevelopmentReadiness }> {
  return getJson(`/api/player-development/readiness${qs(params)}`, signal);
}

export async function listDevelopmentRuns(
  worldSeasonId: string,
  signal?: AbortSignal,
): Promise<{ items: DevelopmentRunDto[] }> {
  return getJson(`/api/player-development/runs${qs({ worldSeasonId })}`, signal);
}

export async function getDevelopmentRun(
  runId: string,
  signal?: AbortSignal,
): Promise<{ item: DevelopmentRunDto }> {
  return getJson(`/api/player-development/runs/${runId}`, signal);
}

export async function listDevelopmentResults(
  runId: string,
  params: {
    page?: number;
    pageSize?: number;
    outcome?: string;
  } = {},
  signal?: AbortSignal,
): Promise<Paginated<DevelopmentResultRow>> {
  return getJson(`/api/player-development/runs/${runId}/results${qs(params)}`, signal);
}

export async function listDevelopmentRetirements(
  runId: string,
  signal?: AbortSignal,
): Promise<{ item: { items: DevelopmentRetirementRow[]; total: number } }> {
  return getJson(`/api/player-development/runs/${runId}/retirements`, signal);
}

export async function getPlayerDevelopmentHistory(
  playerId: string,
  signal?: AbortSignal,
): Promise<{ item: PlayerDevelopmentHistory }> {
  return getJson(`/api/players/${playerId}/development-history`, signal);
}

export async function listDevelopmentConfigurations(
  signal?: AbortSignal,
): Promise<{ items: DevelopmentPresetSummary[] }> {
  return getJson('/api/player-development/configurations', signal);
}

async function commissionerDelete<T>(path: string, payload?: unknown): Promise<T> {
  const res = await fetch(`${apiBase()}${path}`, {
    method: 'DELETE',
    headers: {
      'Content-Type': 'application/json',
      [COMMISSIONER_HEADER]: 'enabled',
      'X-FHM-Commissioner-Source': 'ui',
    },
    body: payload != null ? JSON.stringify(payload) : undefined,
  });
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

export async function previewPlayerDevelopment(payload: {
  worldSeasonId: string;
  effectiveDate: string;
  baseSeed: string;
  configVersionId?: string;
  includeRetiredPlayers?: boolean;
  page?: number;
  pageSize?: number;
}): Promise<{ item: DevelopmentPreviewResponse }> {
  return commissionerWrite('/api/commissioner/player-development/preview', 'POST', payload);
}

export async function preparePlayerDevelopmentRun(payload: {
  worldSeasonId: string;
  expectedWorldSeasonUpdatedAt: string;
  effectiveDate: string;
  baseSeed: string;
  configVersionId?: string;
  reason: string;
  includeRetiredPlayers?: boolean;
}): Promise<{ item: DevelopmentRunDto }> {
  return commissionerWrite('/api/commissioner/player-development/prepare', 'POST', payload);
}

export async function executePlayerDevelopmentRun(
  runId: string,
  payload: { confirmation: true; reason: string },
): Promise<{ item: DevelopmentRunDto }> {
  return commissionerWrite(
    `/api/commissioner/player-development/runs/${runId}/execute`,
    'POST',
    payload,
  );
}

export async function discardPlayerDevelopmentRun(
  runId: string,
  payload: { reason: string },
): Promise<{ item: DevelopmentRunDto }> {
  return commissionerDelete(`/api/commissioner/player-development/runs/${runId}`, payload);
}

export async function getPlayerDevelopmentRunDiagnostics(
  runId: string,
  signal?: AbortSignal,
): Promise<{ item: DevelopmentRunDiagnostics }> {
  return commissionerGetJson(
    `/api/commissioner/player-development/runs/${runId}/diagnostics`,
    signal,
  );
}

export async function createDevelopmentConfiguration(payload: {
  name: string;
  description?: string | null;
  reason: string;
}): Promise<{ item: DevelopmentPresetSummary }> {
  return commissionerWrite('/api/commissioner/player-development/configurations', 'POST', payload);
}

export async function createDevelopmentConfigurationVersion(
  presetId: string,
  payload: {
    expectedLatestVersionId: string;
    config: unknown;
    reason: string;
    activate?: boolean;
  },
): Promise<{ item: DevelopmentPresetSummary }> {
  return commissionerWrite(
    `/api/commissioner/player-development/configurations/${presetId}/versions`,
    'POST',
    payload,
  );
}

export async function activateDevelopmentConfigurationVersion(
  versionId: string,
  payload: { reason: string; expectedActiveVersionId?: string },
): Promise<{ item: DevelopmentPresetSummary }> {
  return commissionerWrite(
    `/api/commissioner/player-development/configuration-versions/${versionId}/activate`,
    'POST',
    payload,
  );
}

// ——— F25 Youth Generation ———

export type YouthGenerationRunStatus =
  | 'PREPARED'
  | 'RUNNING'
  | 'COMPLETED'
  | 'FAILED'
  | 'CANCELLED';

export interface YouthRunSummaryDto {
  countryCount: number;
  enabledCountryCount: number;
  totalPlannedPlayers: number;
  totalGeneratedPlayers: number;
  age15Count: number;
  age16Count: number;
  age17Count: number;
  skaterCount: number;
  goalieCount: number;
  warningCount: number;
  duplicateNameCount: number;
  inputHash: string;
  resultHash: string;
}

export interface YouthRunDto {
  id: string;
  worldSeasonId: string;
  status: YouthGenerationRunStatus;
  runVersion: number;
  referenceDate: string;
  baseSeed: string;
  profileSetVersionId: string;
  profileSetHash: string;
  inputHash: string;
  resultHash: string | null;
  countryCount: number;
  enabledCountryCount: number;
  totalPlannedPlayers: number;
  totalGeneratedPlayers: number;
  warningCount: number;
  isCurrent: boolean;
  backupPath: string | null;
  failureReason: string | null;
  startedAt: string | null;
  completedAt: string | null;
  failedAt: string | null;
  cancelledAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface YouthCohortDto {
  id?: string;
  countryId: string;
  countryKey?: string;
  countryName: string;
  cohortOrder: number;
  profileHash: string;
  namePoolVersionId: string;
  namePoolHash: string;
  plannedSize: number;
  generatedSize: number;
  age15Count: number;
  age16Count: number;
  age17Count: number;
  skaterCount: number;
  goalieCount: number;
  cohortHash: string;
  warnings?: string[];
  createdAt?: string;
}

export interface YouthGeneratedPlayerDto {
  generationIndex: number;
  countryId: string;
  countryKey?: string;
  firstName?: string;
  lastName?: string;
  displayName?: string;
  playerName?: string;
  dateOfBirth: string;
  ageOnReferenceDate: number;
  position: string;
  shoots?: string;
  heightCm?: number;
  weightKg?: number;
  currentAbility: number;
  developmentRate: number;
  role: string;
  form?: number;
  lifecycleStatus?: string;
  sourceType?: string;
  currentTeamId?: null;
  generationHash: string;
  warnings?: string[];
  playerId?: string;
  id?: string;
  potentialFloor?: number;
  potentialCeiling?: number;
  qualityTier?: string;
}

export interface YouthGenerationStatus {
  worldSeason: {
    id: string;
    label: string;
    status: string;
    phase: string;
    updatedAt: string;
  };
  activeConfig: {
    profileSetName: string;
    versionId: string;
    versionNumber: number;
    configHash: string;
  } | null;
  currentCompletedRun: YouthRunDto | null;
  activeRun: YouthRunDto | null;
  youthGenerationApplied: boolean;
  generatedProspectCount: number;
}

export interface YouthGenerationReadiness {
  worldSeasonId: string;
  referenceDate: string | null;
  status: 'READY' | 'WARNING' | 'NOT_READY';
  checks: Array<{ code: string; status: 'PASS' | 'WARN' | 'FAIL'; message: string }>;
  blockers: string[];
  warnings: string[];
  enabledCountryCount: number;
  plannedPlayersEstimate: number;
}

export interface YouthPreviewResponse {
  preview: true;
  worldSeasonId: string;
  referenceDate: string;
  baseSeed: string;
  profileSetVersionId: string;
  profileSetHash: string;
  summary: YouthRunSummaryDto;
  cohorts: YouthCohortDto[];
  items: YouthGeneratedPlayerDto[];
  page: number;
  pageSize: number;
  total: number;
}

export interface YouthCountryProfileRow {
  countryId: string;
  countryCode: string;
  countryName: string;
  enabled: boolean;
  cohortBaseSize: number;
  namePoolVersionId: string;
  profileHash: string;
}

export interface YouthProfileSetSummary {
  id: string;
  name: string;
  description: string | null;
  isSystem: boolean;
  createdAt: string;
  updatedAt: string;
  latestVersion: {
    id: string;
    versionNumber: number;
    schemaVersion: number;
    configHash: string;
    changeReason: string;
    createdAt: string;
    isActive: boolean;
  } | null;
  isActive: boolean;
}

export interface YouthGenerationRunDiagnostics {
  run: YouthRunDto;
  config: {
    profileSetName: string;
    versionNumber: number;
    configHash: string;
  };
  cohortSample: Array<{
    countryName: string;
    generatedSize: number;
    age15Count: number;
    age16Count: number;
    age17Count: number;
    goalieCount: number;
    cohortHash: string;
  }>;
  topProspects: Array<{
    playerId: string;
    playerName: string;
    position: string;
    ageOnReferenceDate: number;
    currentAbility: number;
    potentialCeiling: number;
    qualityTier: string;
    role: string;
    diagnostics: unknown;
  }>;
  plannedInput: unknown;
}

export interface YouthPlayerProvenance {
  id: string;
  runId: string;
  cohortId: string;
  playerId: string;
  generationIndex: number;
  countryId: string;
  playerName: string;
  dateOfBirth: string;
  ageOnReferenceDate: number;
  position: string;
  currentAbility: number;
  developmentRate: number;
  role: string;
  heightCm: number | null;
  weightKg: number | null;
  shoots: string | null;
  generationHash: string;
  diagnostics: unknown;
  createdAt: string;
  potentialCeiling?: number;
  qualityTier?: string;
  run?: {
    id: string;
    worldSeasonId: string;
    referenceDate: string;
    status: YouthGenerationRunStatus;
    profileSetVersionId: string;
    completedAt: string | null;
  };
  cohort?: {
    id: string;
    countryName: string;
    profileHash: string;
    namePoolVersionId: string;
    cohortHash: string;
  };
}

export async function getYouthGenerationStatus(
  worldSeasonId?: string,
  signal?: AbortSignal,
): Promise<{ item: YouthGenerationStatus }> {
  return getJson(`/api/youth-generation/status${qs({ worldSeasonId })}`, signal);
}

export async function getYouthGenerationReadiness(
  params: {
    worldSeasonId: string;
    referenceDate?: string;
    profileSetVersionId?: string;
  },
  signal?: AbortSignal,
): Promise<{ item: YouthGenerationReadiness }> {
  return getJson(`/api/youth-generation/readiness${qs(params)}`, signal);
}

export async function listYouthGenerationRuns(
  worldSeasonId: string,
  signal?: AbortSignal,
): Promise<{ items: YouthRunDto[] }> {
  return getJson(`/api/youth-generation/runs${qs({ worldSeasonId })}`, signal);
}

export async function getYouthGenerationRun(
  runId: string,
  signal?: AbortSignal,
): Promise<{ item: YouthRunDto }> {
  return getJson(`/api/youth-generation/runs/${runId}`, signal);
}

export async function listYouthCohorts(
  runId: string,
  params: { page?: number; pageSize?: number } = {},
  signal?: AbortSignal,
): Promise<Paginated<YouthCohortDto>> {
  return getJson(`/api/youth-generation/runs/${runId}/cohorts${qs(params)}`, signal);
}

export async function listYouthGeneratedPlayers(
  runId: string,
  params: { page?: number; pageSize?: number; countryId?: string } = {},
  signal?: AbortSignal,
): Promise<Paginated<YouthGeneratedPlayerDto>> {
  return getJson(`/api/youth-generation/runs/${runId}/players${qs(params)}`, signal);
}

export async function getYouthCountries(
  signal?: AbortSignal,
): Promise<{ item: { items: YouthCountryProfileRow[]; activeProfileSetVersionId: string } }> {
  return getJson('/api/youth-generation/countries', signal);
}

export async function listYouthProfileSets(
  signal?: AbortSignal,
): Promise<{ items: YouthProfileSetSummary[] }> {
  return getJson('/api/youth-generation/profile-sets', signal);
}

export async function getPlayerYouthProvenance(
  playerId: string,
  signal?: AbortSignal,
): Promise<{ item: YouthPlayerProvenance }> {
  return getJson(`/api/players/${playerId}/youth-provenance`, signal);
}

export async function getCommissionerPlayerYouthProvenance(
  playerId: string,
  signal?: AbortSignal,
): Promise<{ item: YouthPlayerProvenance }> {
  return commissionerGetJson(
    `/api/commissioner/players/${playerId}/youth-provenance`,
    signal,
  );
}

// F26 Scouting — these views deliberately contain only team-visible estimates. Do not
// add true potential, quality tier, or hidden-rating fields to these public contracts.
export interface ScoutingEstimate {
  estimate: number | null;
  low: number | null;
  high: number | null;
  confidence: number;
}

export interface ScoutingProspect {
  playerId: string;
  playerName: string;
  position?: string | null;
  age?: number | null;
  teamName?: string | null;
  nationality?: string | null;
  report?: {
    currentAbility?: ScoutingEstimate | null;
    potential?: ScoutingEstimate | null;
    confidence: number;
    strengths?: string[];
    weaknesses?: string[];
    observedAt?: string | null;
    stale?: boolean;
  } | null;
  watchlist?: { priority: number; notes?: string | null } | null;
  suggestedRank?: number | null;
  rankingScore?: number | null;
  rankingReason?: string | null;
}

export interface ScoutingAssignment {
  id: string;
  name?: string | null;
  status: string;
  targetType?: 'PLAYER' | 'COUNTRY' | 'WATCHLIST' | string;
  target?: { playerIds?: string[]; countryId?: string | null };
  scouts?: Array<{ id: string; name: string }>;
  targetCount?: number;
  observedOn?: string;
  durationDays?: number;
  seed?: string;
  createdAt?: string;
  completedAt?: string | null;
}

export interface ScoutingDepartment {
  id?: string;
  teamId?: string;
  name?: string | null;
  scouts?: Array<{ id: string; name: string; role?: string | null }>;
}

export interface ScoutProfile {
  id: string;
  name: string;
  firstName: string;
  lastName: string;
  evaluatingRating: number;
  potentialRating: number;
  skaterRating: number;
  goalieRating: number;
  specialties: string[];
  countryFamiliarity: Record<string, number>;
  positionFamiliarity: Record<string, number>;
  persistentBias: number;
  createdAt?: string;
  updatedAt?: string;
}

export interface ScoutingOverview {
  team: { id: string; name: string };
  department?: ScoutingDepartment | null;
  preparedAssignments: number;
  watchlistCount?: number;
  reportCount: number;
}

export interface ScoutingAssignmentDetail extends ScoutingAssignment {
  targetCount: number;
}

export interface ScoutingReport {
  id: string;
  playerId: string;
  playerName?: string | null;
  report: {
    versionNumber: number;
    createdAt: string;
    currentAbility: ScoutingEstimate;
    potential: ScoutingEstimate;
    confidence: number;
    strengths: string[];
    weaknesses: string[];
  };
}

export interface ScoutingDiagnostics {
  active: {
    preset: { id: string; name: string };
    version: { id: string; versionNumber: number; schemaVersion: number; configHash: string };
  };
  assignments: number;
  observations: number;
  reports: number;
}

export interface ScoutingPreset {
  id: string;
  name: string;
  description?: string | null;
  isSystem?: boolean;
  versions?: Array<{ id: string; versionNumber: number; schemaVersion: number; configHash: string; createdAt: string }>;
}

export interface CommissionerScoutingDepartment {
  id: string;
  teamId: string;
  name: string;
  team: { id: string; name: string };
  scouts: Array<{ scoutId: string; role: string; scout: RawScoutProfile }>;
}

interface RawScoutProfile {
  id: string;
  firstName: string;
  lastName: string;
  evaluatingRating: number;
  potentialRating: number;
  skaterRating: number;
  goalieRating: number;
  specialtiesJson: string;
  countryFamiliarityJson: string;
  positionFamiliarityJson: string;
  persistentBias: number;
  createdAt?: string;
  updatedAt?: string;
}

export interface ScoutPayload {
  firstName: string;
  lastName: string;
  evaluatingRating: number;
  potentialRating: number;
  skaterRating: number;
  goalieRating: number;
  specialties: Array<'GENERAL' | 'SKATER' | 'GOALIE' | 'POTENTIAL'>;
  countryFamiliarity: Record<string, number>;
  positionFamiliarity: Record<string, number>;
  persistentBias: number;
}

function parseScoutingRecord(value: string): Record<string, number> {
  try { return JSON.parse(value) as Record<string, number>; } catch { return {}; }
}

function normalizeScout(row: RawScoutProfile): ScoutProfile {
  let specialties: string[] = [];
  try { specialties = JSON.parse(row.specialtiesJson) as string[]; } catch { /* malformed legacy data */ }
  return {
    ...row,
    name: `${row.firstName} ${row.lastName}`,
    specialties,
    countryFamiliarity: parseScoutingRecord(row.countryFamiliarityJson),
    positionFamiliarity: parseScoutingRecord(row.positionFamiliarityJson),
  };
}

export async function getScoutingOverview(teamId: string, signal?: AbortSignal): Promise<{ item: ScoutingOverview }> {
  return getJson(`/api/teams/${teamId}/scouting`, signal);
}
export async function listScoutingProspects(
  teamId: string, params: Record<string, string | number | undefined | null> = {}, signal?: AbortSignal,
): Promise<Paginated<ScoutingProspect>> {
  return getJson(`/api/teams/${teamId}/scouting/prospects${qs(params)}`, signal);
}
export async function listScoutingWatchlist(teamId: string, signal?: AbortSignal): Promise<{ items: ScoutingProspect[] }> {
  const [watchlist, prospects] = await Promise.all([
    getJson<{ items: Array<{ playerId: string; manualPriority: number; note: string | null; player: { id: string; firstName: string; lastName: string; primaryPosition: string } }> }>(`/api/teams/${teamId}/scouting/watchlist`, signal),
    listScoutingProspects(teamId, {}, signal),
  ]);
  const prospectById = new Map(prospects.items.map((item) => [item.playerId, item]));
  return {
    items: watchlist.items.map((entry) => ({
      ...(prospectById.get(entry.playerId) ?? {
        playerId: entry.playerId,
        playerName: `${entry.player.firstName} ${entry.player.lastName}`,
        position: entry.player.primaryPosition,
      }),
      watchlist: { priority: entry.manualPriority, notes: entry.note },
    })),
  };
}
export async function listScoutingAssignments(teamId: string, signal?: AbortSignal): Promise<{ items: ScoutingAssignment[] }> {
  return getJson(`/api/teams/${teamId}/scouting/assignments`, signal);
}
export async function getScoutingAssignment(
  teamId: string, assignmentId: string, signal?: AbortSignal,
): Promise<{ item: ScoutingAssignmentDetail }> {
  return getJson(`/api/teams/${teamId}/scouting/assignments/${assignmentId}`, signal);
}
export async function getScoutingProspect(
  teamId: string, playerId: string, signal?: AbortSignal,
): Promise<{ item: ScoutingProspect }> {
  return getJson(`/api/teams/${teamId}/scouting/prospects/${playerId}`, signal);
}
export async function listScoutingRankings(teamId: string, signal?: AbortSignal): Promise<{ items: ScoutingProspect[] }> {
  const [rankings, prospects] = await Promise.all([
    getJson<{ items: Array<{ playerId: string; score: number; reason: string }> }>(`/api/teams/${teamId}/scouting/rankings`, signal),
    listScoutingProspects(teamId, {}, signal),
  ]);
  const prospectById = new Map(prospects.items.map((item) => [item.playerId, item]));
  return {
    items: rankings.items.map((ranking, index) => ({
      ...(prospectById.get(ranking.playerId) ?? { playerId: ranking.playerId, playerName: 'Unknown prospect' }),
      suggestedRank: index + 1,
      rankingScore: ranking.score,
      rankingReason: ranking.reason,
    })),
  };
}
export async function listScoutingReports(teamId: string, signal?: AbortSignal): Promise<{ items: ScoutingReport[] }> {
  return getJson(`/api/teams/${teamId}/scouting/reports`, signal);
}
export async function upsertScoutingWatchlistEntry(
  teamId: string, playerId: string, payload: { manualPriority?: number; note?: string | null },
): Promise<{ item: unknown }> {
  return putJson(`/api/teams/${teamId}/scouting/watchlist/${playerId}`, payload);
}
export async function deleteScoutingWatchlistEntry(teamId: string, playerId: string): Promise<void> {
  const res = await fetch(`${apiBase()}/api/teams/${teamId}/scouting/watchlist/${playerId}`, { method: 'DELETE' });
  if (!res.ok) throw new Error(await readError(res));
}
export async function previewScoutingAssignment(
  teamId: string,
  payload: {
    targetType: 'PLAYER' | 'COUNTRY' | 'WATCHLIST';
    playerIds?: string[];
    countryId?: string;
    scoutIds: string[];
    observedOn: string;
    durationDays: number;
    seed: string;
  },
): Promise<{ item: ScoutingAssignmentDetail }> {
  return postJson(`/api/teams/${teamId}/scouting/assignments/preview`, payload);
}
export async function createScoutingAssignment(
  teamId: string,
  payload: {
    targetType: 'PLAYER' | 'COUNTRY' | 'WATCHLIST';
    playerIds?: string[];
    countryId?: string;
    scoutIds: string[];
    observedOn: string;
    durationDays: number;
    seed: string;
  },
): Promise<{ item: ScoutingAssignment }> {
  return postJson(`/api/teams/${teamId}/scouting/assignments`, payload);
}
export async function executeScoutingAssignment(teamId: string, assignmentId: string): Promise<{ item: ScoutingAssignment }> {
  return postJson(`/api/teams/${teamId}/scouting/assignments/${assignmentId}/execute`, {});
}
export async function listCommissionerScouts(signal?: AbortSignal): Promise<{ items: ScoutProfile[] }> {
  const response = await commissionerGetJson<{ items: RawScoutProfile[] }>('/api/commissioner/scouting/scouts', signal);
  return { items: response.items.map(normalizeScout) };
}
export async function getCommissionerScout(id: string, signal?: AbortSignal): Promise<{ item: ScoutProfile }> {
  const response = await listCommissionerScouts(signal);
  const item = response.items.find((scout) => scout.id === id);
  if (!item) throw new Error('Scout not found');
  return { item };
}
export async function listCommissionerScoutingDepartments(signal?: AbortSignal): Promise<{ items: CommissionerScoutingDepartment[] }> {
  return commissionerGetJson('/api/commissioner/scouting/departments', signal);
}
export async function getCommissionerScoutingDepartment(teamId: string, signal?: AbortSignal): Promise<{ item: CommissionerScoutingDepartment | null }> {
  const response = await listCommissionerScoutingDepartments(signal);
  return { item: response.items.find((department) => department.teamId === teamId) ?? null };
}
export async function getCommissionerScoutingConfiguration(signal?: AbortSignal): Promise<{ items: ScoutingPreset[] }> {
  return commissionerGetJson('/api/commissioner/scouting/configurations', signal);
}
export async function getCommissionerScoutingDiagnostics(signal?: AbortSignal): Promise<{ item: ScoutingDiagnostics }> {
  return commissionerGetJson('/api/commissioner/scouting/diagnostics', signal);
}
export const createCommissionerScout = (payload: ScoutPayload) =>
  commissionerWrite<{ item: RawScoutProfile }>('/api/commissioner/scouting/scouts', 'POST', payload);
export const updateCommissionerScout = (id: string, payload: Partial<ScoutPayload>) =>
  commissionerWrite<{ item: RawScoutProfile }>(`/api/commissioner/scouting/scouts/${id}`, 'PATCH', payload);
export const deleteCommissionerScout = (id: string) =>
  commissionerDelete<void>(`/api/commissioner/scouting/scouts/${id}`);
export const createCommissionerScoutingDepartment = (payload: { teamId: string; name: string; scoutIds: string[] }) =>
  commissionerWrite<{ item: CommissionerScoutingDepartment }>('/api/commissioner/scouting/departments', 'POST', payload);
export const updateCommissionerScoutingDepartment = (id: string, payload: { name?: string; scoutIds?: string[] }) =>
  commissionerWrite<{ item: CommissionerScoutingDepartment }>(`/api/commissioner/scouting/departments/${id}`, 'PATCH', payload);

export async function previewYouthGeneration(payload: {
  worldSeasonId: string;
  referenceDate: string;
  baseSeed: string;
  profileSetVersionId?: string;
  filters?: {
    countryIds?: string[];
    age?: number | null;
    position?: string | null;
    qualityTier?: string | null;
  };
  page?: number;
  pageSize?: number;
}): Promise<{ item: YouthPreviewResponse }> {
  return commissionerWrite('/api/commissioner/youth-generation/preview', 'POST', payload);
}

export async function prepareYouthGenerationRun(payload: {
  worldSeasonId: string;
  expectedWorldSeasonUpdatedAt: string;
  referenceDate: string;
  baseSeed: string;
  profileSetVersionId?: string;
  reason: string;
}): Promise<{ item: YouthRunDto }> {
  return commissionerWrite('/api/commissioner/youth-generation/prepare', 'POST', payload);
}

export async function executeYouthGenerationRun(
  runId: string,
  payload: { confirmation: true; reason: string },
): Promise<{ item: YouthRunDto }> {
  return commissionerWrite(
    `/api/commissioner/youth-generation/runs/${runId}/execute`,
    'POST',
    payload,
  );
}

export async function discardYouthGenerationRun(
  runId: string,
  payload: { reason: string },
): Promise<{ item: YouthRunDto }> {
  return commissionerDelete(`/api/commissioner/youth-generation/runs/${runId}`, payload);
}

export async function getYouthGenerationRunDiagnostics(
  runId: string,
  signal?: AbortSignal,
): Promise<{ item: YouthGenerationRunDiagnostics }> {
  return commissionerGetJson(
    `/api/commissioner/youth-generation/runs/${runId}/diagnostics`,
    signal,
  );
}

export async function createYouthProfileSet(payload: {
  name: string;
  description?: string | null;
  reason: string;
}): Promise<{ item: YouthProfileSetSummary }> {
  return commissionerWrite('/api/commissioner/youth-generation/profile-sets', 'POST', payload);
}

export async function createYouthProfileSetVersion(
  profileSetId: string,
  payload: {
    expectedLatestVersionId: string;
    profiles: Array<{ countryId: string; profile: unknown; namePoolVersionId: string }>;
    reason: string;
    activate?: boolean;
  },
): Promise<{ item: YouthProfileSetSummary }> {
  return commissionerWrite(
    `/api/commissioner/youth-generation/profile-sets/${profileSetId}/versions`,
    'POST',
    payload,
  );
}

export async function activateYouthProfileSetVersion(
  versionId: string,
  payload: { reason: string; expectedActiveVersionId?: string },
): Promise<{ item: YouthProfileSetSummary }> {
  return commissionerWrite(
    `/api/commissioner/youth-generation/profile-set-versions/${versionId}/activate`,
    'POST',
    payload,
  );
}

export async function createCountryNamePool(
  countryId: string,
  payload: {
    name: string;
    firstNames: string[];
    lastNames: string[];
    reason: string;
  },
): Promise<{ item: { id: string; name: string; countryId: string } }> {
  return commissionerWrite(`/api/commissioner/countries/${countryId}/name-pools`, 'POST', payload);
}

export async function createCountryNamePoolVersion(
  namePoolId: string,
  payload: {
    firstNames: string[];
    lastNames: string[];
    reason: string;
    expectedLatestVersionId?: string;
  },
): Promise<{ item: { id: string; versionNumber: number } }> {
  return commissionerWrite(`/api/commissioner/country-name-pools/${namePoolId}/versions`, 'POST', payload);
}

// ---------------------------------------------------------------------------
// F27 — NHL Draft
// ---------------------------------------------------------------------------

export type DraftEventStatus = 'PLANNED' | 'PREPARING' | 'READY' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';
export type DraftPickStatus = 'PENDING' | 'ON_THE_CLOCK' | 'COMPLETED' | 'PASSED' | 'CANCELLED';
export type DraftSelectionSource = 'MANUAL' | 'AUTO' | 'COMMISSIONER_CORRECTION';
export type PlayerDraftRightStatus = 'ACTIVE' | 'RENOUNCED' | 'EXPIRED' | 'CONVERTED_TO_CONTRACT';

export interface DraftEventItem {
  id: string;
  worldSeasonId: string;
  seasonLabel: string | null;
  name: string;
  status: DraftEventStatus;
  presetName: string | null;
  presetVersionId: string | null;
  configHash: string;
  cutoffDate: string;
  eligibilityHash: string | null;
  initialOrderHash: string | null;
  lotteryHash: string | null;
  finalOrderHash: string | null;
  currentOverallPick: number;
  totalRounds: number;
  totalPicks: number;
  startedAt: string | null;
  completedAt: string | null;
  resultHash: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface DraftEligiblePlayerItem {
  id: string;
  playerId: string;
  playerName: string;
  birthDate: string;
  ageOnCutoffDate: number;
  country: string | null;
  position: string | null;
  lifecycle: string;
  sourceType: string;
  eligibilityHash: string;
  status: string;
  createdAt: string;
}

export interface DraftOrderPickItem {
  id?: string;
  overallPick: number;
  roundNumber: number;
  pickInRound: number;
  teamId: string;
  teamName: string;
  status: DraftPickStatus;
  selectedPlayerId: string | null;
  selectedPlayerName: string | null;
  selectionSource: DraftSelectionSource | null;
}

export interface DraftOrderDto {
  teams: Array<{
    teamId: string;
    teamName: string;
    originalOrderPosition: number;
    lotteryOrderPosition: number | null;
    finalOrderPosition: number | null;
    sourceStandingRank: number | null;
  }>;
  picks: DraftOrderPickItem[];
}

export interface DraftBoardEntryDto {
  playerId: string;
  estimatedCurrentAbility: number | null;
  estimatedPotential: number | null;
  projectedRole: string | null;
  confidence: number;
  stale: boolean;
  risk: number;
  watchlistPriority: number;
  manualRank: number | null;
  suggestedRank: number | null;
  drafted: boolean;
}

export interface DraftTeamBoardDto {
  teamId: string;
  draftEventId: string;
  entries: DraftBoardEntryDto[];
  boardHash: string;
  frozenBoardHash: string | null;
  frozenAt: string | null;
}

export interface DraftStatusDto {
  worldSeason: { id: string; label: string; phase: string; status: string };
  draftEvent: {
    id: string;
    name: string;
    status: DraftEventStatus;
    rounds: number;
    totalPicks: number;
    currentOverallPick: number;
    completedPicks: number;
    presetName: string;
  } | null;
  latestSelections: Array<{ overallPick: number; teamName: string; playerName: string | null }>;
}

export async function getDrafts(worldSeasonId?: string, signal?: AbortSignal): Promise<{ items: DraftEventItem[] }> {
  return getJson(`/api/drafts${worldSeasonId ? `?worldSeasonId=${encodeURIComponent(worldSeasonId)}` : ''}`, signal);
}
export async function getDraftStatus(signal?: AbortSignal): Promise<{ item: DraftStatusDto }> {
  return getJson('/api/drafts/status', signal);
}
export async function getDraft(id: string, signal?: AbortSignal): Promise<{ item: DraftEventItem }> {
  return getJson(`/api/drafts/${id}`, signal);
}
export async function getDraftEligibility(id: string, signal?: AbortSignal): Promise<{ items: DraftEligiblePlayerItem[] }> {
  return getJson(`/api/drafts/${id}/eligibility`, signal);
}
export async function getDraftOrder(id: string, signal?: AbortSignal): Promise<{ item: DraftOrderDto }> {
  return getJson(`/api/drafts/${id}/order`, signal);
}
export async function getDraftPicks(id: string, signal?: AbortSignal): Promise<{ items: DraftOrderPickItem[] }> {
  return getJson(`/api/drafts/${id}/picks`, signal);
}
export async function getDraftLottery(id: string, signal?: AbortSignal): Promise<{ item: { enabled: boolean; lotteryHash: string | null; draws: unknown[] } }> {
  return getJson(`/api/drafts/${id}/lottery`, signal);
}
export async function getDraftResults(id: string, signal?: AbortSignal): Promise<{ item: { items: DraftOrderPickItem[]; summary: { totalSelections: number; resultHash: string | null; completedAt: string | null } } }> {
  return getJson(`/api/drafts/${id}/results`, signal);
}
export async function getTeamDraftBoard(draftEventId: string, teamId: string, signal?: AbortSignal): Promise<{ item: DraftTeamBoardDto }> {
  return getJson(`/api/drafts/${draftEventId}/teams/${teamId}/board`, signal);
}
export async function getTeamDraftResults(draftEventId: string, teamId: string, signal?: AbortSignal): Promise<{ item: { picks: unknown[]; rights: unknown[] } }> {
  return getJson(`/api/drafts/${draftEventId}/teams/${teamId}/results`, signal);
}
export async function getPlayerDraftHistory(playerId: string, signal?: AbortSignal): Promise<{ items: Array<{ draftEventId: string; seasonLabel: string; roundNumber: number; overallPick: number; teamId: string; teamName: string; rightsStatus: string; unsigned: boolean }> }> {
  return getJson(`/api/players/${playerId}/draft-history`, signal);
}
export async function getTeamDraftRights(teamId: string, signal?: AbortSignal): Promise<{ items: Array<{ id: string; playerId: string; playerName: string; draftEventId: string; seasonLabel: string; status: string; acquiredAt: string | null }> }> {
  return getJson(`/api/teams/${teamId}/draft-rights`, signal);
}

export async function selectDraftPick(draftEventId: string, pickId: string, playerId: string, reason?: string): Promise<{ item: { pickId: string; overallPick: number; selectedPlayerId: string; selectedPlayerName: string; teamId: string; rightId: string } }> {
  return postJson(`/api/drafts/${draftEventId}/picks/${pickId}/select`, { playerId, reason });
}
export async function autoSelectDraftPick(draftEventId: string, pickId: string, reason?: string): Promise<{ item: { pickId: string; overallPick: number; selectedPlayerId: string; selectedPlayerName: string; teamId: string; rightId: string } }> {
  return postJson(`/api/drafts/${draftEventId}/picks/${pickId}/auto-select`, { reason });
}

// Commissioner draft lifecycle
export async function commissionerCreateDraft(payload: { worldSeasonId: string; name: string; presetVersionId?: string; baseSeed: string; reason: string }): Promise<{ item: DraftEventItem }> {
  return commissionerWrite('/api/commissioner/drafts', 'POST', payload);
}
export async function commissionerGenerateEligibility(id: string, reason: string): Promise<{ item: { eligibleCount: number; rejectedCount: number; eligibilityHash: string } }> {
  return commissionerWrite(`/api/commissioner/drafts/${id}/generate-eligibility`, 'POST', { reason });
}
export async function commissionerGenerateOrder(id: string, payload: { source?: 'REVERSE_STANDINGS' | 'MANUAL'; sourceCompetitionStageId?: string; participatingTeamIds?: string[]; manualOrder?: string[]; reason: string }): Promise<{ item: { orderHash: string; teamCount: number; totalPicks: number } }> {
  return commissionerWrite(`/api/commissioner/drafts/${id}/generate-order`, 'POST', payload);
}
export async function commissionerRunLottery(id: string, reason: string): Promise<{ item: { lotteryHash: string; draws: number; finalOrderHash: string } }> {
  return commissionerWrite(`/api/commissioner/drafts/${id}/run-lottery`, 'POST', { reason });
}
export async function commissionerMarkDraftReady(id: string, reason: string): Promise<{ item: DraftEventItem }> {
  return commissionerWrite(`/api/commissioner/drafts/${id}/mark-ready`, 'POST', { reason });
}
export async function commissionerStartDraft(id: string, reason: string): Promise<{ event: DraftEventItem; backupPath: string | null }> {
  return commissionerWrite(`/api/commissioner/drafts/${id}/start`, 'POST', { reason });
}
export async function commissionerCancelDraft(id: string, reason: string): Promise<{ item: DraftEventItem }> {
  return commissionerWrite(`/api/commissioner/drafts/${id}/cancel`, 'POST', { reason });
}

// F28 contracts and free agency ------------------------------------------------
export interface ContractItem {
  id: string; playerId: string; teamId: string;
  player?: { id: string; name: string; position: string };
  team?: { id: string; name: string };
  startSeason: { id: string; label?: string; order: number };
  endSeason: { id: string; label?: string; order: number };
  annualSalary: number; status: string; contractType: string; source: string;
  playerNameSnapshot: string; teamNameSnapshot: string; updatedAt: string;
}
export interface ContractStatusDto { initialized: boolean; initializedAt: string | null; activeContracts: number; openOffers: number; freeAgents: number; rightsHeldUnsignedProspects: number; noSalaryCap: boolean }
export interface FreeAgentItem { player: { id: string; name: string; position: string; country: string; rosterStatus: string; model: { currentAbility: number | null; modelStatus: string } }; previousContract: { annualSalary: number; teamNameSnapshot: string } | null; recommendation: { annualSalary: number; termYears: number; confidence: number }; openOffers: number; eligibleToSign: boolean }
export const getContractsStatus=(signal?:AbortSignal)=>getJson<{item:ContractStatusDto}>('/api/contracts/status',signal);
export const getContracts=(query='',signal?:AbortSignal)=>getJson<{items:ContractItem[];meta:{page:number;pageSize:number;total:number;totalPages:number}}>(`/api/contracts${query}`,signal);
export const getContractById=(id:string,signal?:AbortSignal)=>getJson<{item:ContractItem&{transactions:unknown[];recommendations:unknown[]}}>(`/api/contracts/${id}`,signal);
export const getTeamContracts=(teamId:string,signal?:AbortSignal)=>getJson<{items:ContractItem[];payroll:number;salaryCapEnforced:boolean}>(`/api/teams/${teamId}/contracts`,signal);
export const getTeamContractOffers=(teamId:string,signal?:AbortSignal)=>getJson<{items:Array<{id:string;playerId:string;player:{firstName:string;lastName:string};offerType:string;annualSalary:number;status:string;updatedAt:string;startWorldSeason:{label:string};endWorldSeason:{label:string}}>}>(`/api/teams/${teamId}/free-agent-offers`,signal);
export const getFreeAgents=(teamId?:string,signal?:AbortSignal)=>getJson<{items:FreeAgentItem[];meta:{total:number}}>(`/api/free-agents${teamId?`?teamId=${encodeURIComponent(teamId)}`:''}`,signal);
export const getContractExpirationRuns=(signal?:AbortSignal)=>getJson<{items:Array<{id:string;status:string;worldSeason:{label:string};expiredCount:number;activatedFutureCount:number;freeAgentCount:number;createdAt:string}>}>('/api/contract-expiration-runs',signal);
export const getContractConfigurations=(signal?:AbortSignal)=>getJson<{items:Array<{id:string;name:string;description:string|null;versions:Array<{id:string;versionNumber:number;configHash:string;isActive:boolean}>}>}>('/api/contracts/configurations',signal);
export const createFreeAgentOffer=(teamId:string,payload:{playerId:string;startWorldSeasonId:string;endWorldSeasonId:string;annualSalary:number;reason:string})=>postJson<{item:any}>(`/api/teams/${teamId}/free-agent-offers`,payload);
export const submitContractOffer=(teamId:string,offerId:string,expectedUpdatedAt:string)=>postJson<{item:any}>(`/api/teams/${teamId}/contract-offers/${offerId}/submit`,{expectedUpdatedAt});
export const acceptContractOffer=(offerId:string,reason:string,expectedUpdatedAt:string)=>postJson<{item:any}>(`/api/contract-offers/${offerId}/accept`,{reason,expectedUpdatedAt});
export const rejectContractOffer=(offerId:string,reason:string,expectedUpdatedAt:string)=>postJson<{item:any}>(`/api/contract-offers/${offerId}/reject`,{reason,expectedUpdatedAt});
export const withdrawContractOffer=(teamId:string,offerId:string,reason:string,expectedUpdatedAt:string)=>postJson<{item:any}>(`/api/teams/${teamId}/contract-offers/${offerId}/withdraw`,{reason,expectedUpdatedAt});
export const commissionerInitialContractPreview=(worldSeasonId:string)=>commissionerWrite<{item:any}>('/api/commissioner/contracts/initial-preview','POST',{worldSeasonId});
export const commissionerPrepareInitialContracts=(worldSeasonId:string,reason:string)=>commissionerWrite<{item:any}>('/api/commissioner/contracts/initial-prepare','POST',{worldSeasonId,reason});
export const commissionerExecuteInitialContracts=(runId:string,reason:string)=>commissionerWrite<{item:any}>(`/api/commissioner/contracts/initial-runs/${runId}/execute`,'POST',{reason});
export const commissionerExpirationPreview=(worldSeasonId:string)=>commissionerWrite<{item:any}>('/api/commissioner/contracts/expiration-preview','POST',{worldSeasonId});
export const commissionerPrepareExpiration=(worldSeasonId:string,reason:string)=>commissionerWrite<{item:any}>('/api/commissioner/contracts/expiration-prepare','POST',{worldSeasonId,reason});
export const commissionerExecuteExpiration=(runId:string)=>commissionerWrite<{item:any}>(`/api/commissioner/contracts/expiration-runs/${runId}/execute`,'POST',{});
export async function commissionerSelectPick(draftEventId: string, pickId: string, playerId: string, reason?: string): Promise<{ item: { pickId: string; overallPick: number; selectedPlayerId: string; selectedPlayerName: string; teamId: string; rightId: string } }> {
  return commissionerWrite(`/api/commissioner/drafts/${draftEventId}/picks/${pickId}/select`, 'POST', { playerId, reason });
}
export async function getCommissionerDraftDiagnostics(id: string, signal?: AbortSignal): Promise<{ item: Record<string, unknown> }> {
  return commissionerGetJson(`/api/commissioner/drafts/${id}/diagnostics`, signal);
}
export async function listDraftConfigurations(signal?: AbortSignal): Promise<{ items: Array<{ id: string; name: string; description: string | null; isSystem: boolean; latestVersion: { id: string; versionNumber: number; configHash: string; isActive: boolean } | null }> }> {
  return commissionerGetJson('/api/commissioner/draft/configurations', signal);
}

// F29 trades and rights transfers ---------------------------------------------
export type TradeAssetType = 'PLAYER_CONTRACT' | 'DRAFT_PICK' | 'PLAYER_DRAFT_RIGHT';
export interface TradeAssetDescriptor { assetType: TradeAssetType; playerContractId?: string; draftPickId?: string; playerDraftRightId?: string }
export interface TradeProposalItem {
  id: string; status: string; proposedBy: string; reason: string | null; proposalHash: string;
  proposingTeam: { id: string; name: string }; receivingTeam: { id: string; name: string };
  submittedAt: string | null; acceptedAt: string | null; rejectedAt: string | null; withdrawnAt: string | null;
  updatedAt: string; createdAt: string;
  assets: Array<{ id: string; side: 'PROPOSING' | 'RECEIVING'; assetType: TradeAssetType; sourceTeamId: string; targetTeamId: string;
    playerContract: { id: string; player: { id: string; name: string } } | null;
    draftPick: { id: string; roundNumber: number; overallPick: number } | null;
    playerDraftRight: { id: string; player: { id: string; name: string } } | null;
    snapshot: Record<string, unknown> | null; valuation: { value: number; factors: string[] } | null }>;
}
export interface CompletedTradeItem {
  id: string; tradeProposalId: string; tradeHash: string; completedAt: string;
  proposingTeam: { id: string; name: string }; receivingTeam: { id: string; name: string };
  effectiveWorldSeason: { id: string; label: string } | null;
  assets: Array<{ id: string; side: string; assetType: TradeAssetType; sourceTeamId: string; targetTeamId: string; snapshot: Record<string, unknown> | null }>;
  transactions: Array<{ id: string; transactionType: string; fromTeamId: string; toTeamId: string; assetNameSnapshot: string; transactionHash: string }>;
}
export interface TradeReadinessDto { status: 'READY' | 'WARNING' | 'NOT_READY'; checks: Record<string, number | boolean>; blockers: string[]; warnings: string[]; noSalaryCap: boolean }
export interface TradeCenterOverviewDto {
  team: { id: string; name: string; isClub: boolean };
  openProposals: number; incomingProposals: number; outgoingProposals: number; recentCompletedTrades: number;
  rightsHeldUnsignedProspects: number; availablePicks: number; lineupRequiresReview: boolean; lineupReviewReason: string | null;
}
export interface TradeValuationPreview { proposal: TradeProposalItem; valuations: { proposing: { totalValue: number }; receiving: { totalValue: number }; fairness: { imbalance: number; label: string; warning: boolean } } | null; previewError: { code: string; message: string } | null }

export const getTradeReadiness = (signal?: AbortSignal) => getJson<{ item: TradeReadinessDto }>('/api/trades/readiness', signal);
export const getCompletedTrades = (query = '', signal?: AbortSignal) => getJson<{ items: CompletedTradeItem[]; meta: { total: number; page: number; pageSize: number; totalPages: number } }>(`/api/trades${query}`, signal);
export const getCompletedTradeById = (id: string, signal?: AbortSignal) => getJson<{ item: CompletedTradeItem }>(`/api/trades/${id}`, signal);
export const getTradeProposals = (query = '', signal?: AbortSignal) => getJson<{ items: TradeProposalItem[]; meta: { total: number; page: number; pageSize: number; totalPages: number } }>(`/api/trade-proposals${query}`, signal);
export const getTradeProposalById = (id: string, signal?: AbortSignal) => getJson<{ item: TradeProposalItem }>(`/api/trade-proposals/${id}`, signal);
export const getTradeConfigurations = (signal?: AbortSignal) => getJson<{ items: Array<{ id: string; name: string; description: string | null; isSystem: boolean; versions: Array<{ id: string; versionNumber: number; configHash: string; isActive: boolean }> }> }>('/api/trade/configurations', signal);
export const getPlayerTrades = (playerId: string, signal?: AbortSignal) => getJson<{ items: Array<{ transactionType: string; fromTeam: { id: string; name: string }; toTeam: { id: string; name: string }; date: string; completedTradeId: string }> }>(`/api/players/${playerId}/trades`, signal);
export const getTeamTrades = (teamId: string, signal?: AbortSignal) => getJson<{ items: CompletedTradeItem[]; meta: { total: number } }>(`/api/teams/${teamId}/trades`, signal);
export const getTeamTradeCenter = (teamId: string, signal?: AbortSignal) => getJson<{ item: TradeCenterOverviewDto }>(`/api/teams/${teamId}/trade-center`, signal);
export const getDraftPickTrades = (pickId: string, signal?: AbortSignal) => getJson<{ item: { pickId: string; originalTeamId: string; currentTeamId: string; history: Array<{ fromTeamId: string; toTeamId: string; date: string }> } }>(`/api/draft-picks/${pickId}/trades`, signal);
export const getDraftRightTrades = (rightId: string, signal?: AbortSignal) => getJson<{ item: { rightId: string; currentTeamId: string; history: Array<{ fromTeamId: string; toTeamId: string; date: string }> } }>(`/api/draft-rights/${rightId}/trades`, signal);

export const createTradeProposal = (teamId: string, payload: { receivingTeamId: string; proposedBy: string; reason?: string; proposingAssets: TradeAssetDescriptor[]; receivingAssets: TradeAssetDescriptor[] }) =>
  postJson<{ item: TradeProposalItem }>(`/api/teams/${teamId}/trade-proposals`, payload);
export const editTradeProposal = (teamId: string, proposalId: string, payload: { proposingAssets: TradeAssetDescriptor[]; receivingAssets: TradeAssetDescriptor[]; reason?: string; expectedUpdatedAt?: string }) =>
  patchJson<{ item: TradeProposalItem }>(`/api/teams/${teamId}/trade-proposals/${proposalId}`, payload);
export const previewTradeProposal = (teamId: string, proposalId: string) =>
  postJson<{ item: TradeValuationPreview }>(`/api/teams/${teamId}/trade-proposals/${proposalId}/preview`, {});
export const submitTradeProposal = (teamId: string, proposalId: string, expectedUpdatedAt?: string) =>
  postJson<{ item: TradeProposalItem }>(`/api/teams/${teamId}/trade-proposals/${proposalId}/submit`, { expectedUpdatedAt });
export const withdrawTradeProposal = (teamId: string, proposalId: string, reason: string, expectedUpdatedAt?: string) =>
  postJson<{ item: TradeProposalItem }>(`/api/teams/${teamId}/trade-proposals/${proposalId}/withdraw`, { reason, expectedUpdatedAt });
export const acceptTradeProposal = (teamId: string, proposalId: string, reason: string, expectedUpdatedAt?: string) =>
  postJson<{ item: { completedTradeId: string; tradeHash: string; proposalStatus: string; transfers: unknown[] } }>(`/api/teams/${teamId}/trade-proposals/${proposalId}/accept`, { reason, expectedUpdatedAt });
export const rejectTradeProposal = (teamId: string, proposalId: string, reason: string, expectedUpdatedAt?: string) =>
  postJson<{ item: TradeProposalItem }>(`/api/teams/${teamId}/trade-proposals/${proposalId}/reject`, { reason, expectedUpdatedAt });

// ---------------------------------------------------------------------------
// F30 — Offseason Workflow
//
// Persistent, resumable, Commissioner-controlled offseason orchestration. F30
// coordinates existing F20/F24/F25/F27/F28/F29 subsystems; it does not duplicate
// their logic and never creates the next WorldSeason (F31 does).
// ---------------------------------------------------------------------------

export interface OffseasonPhaseItem {
  id: string;
  phaseType: string;
  phaseOrder: number;
  status: string;
  required: boolean;
  allowSkip: boolean;
  category: 'AUTOMATED' | 'INTERACTIVE';
  competitionArchiveIds: string | null;
  contractExpirationRunId: string | null;
  playerDevelopmentRunId: string | null;
  youthGenerationRunId: string | null;
  draftEventId: string | null;
  startedAt: string | null;
  completedAt: string | null;
  skippedAt: string | null;
  failedAt: string | null;
  readinessHash: string | null;
  resultHash: string | null;
  reason: string | null;
  updatedAt: string;
}

export interface OffseasonRunItem {
  id: string;
  worldSeasonId: string;
  worldSeason: { id: string; label: string; startYear: number; endYear: number; status: string; phase: string };
  status: string;
  configVersion: { id: string; versionNumber: number; configHash: string; changeReason: string };
  configHash: string;
  runVersion: number;
  startedAt: string | null;
  completedAt: string | null;
  cancelledAt: string | null;
  createdAt: string;
  updatedAt: string;
  currentPhaseType: string | null;
  readinessHash: string | null;
  resultHash: string | null;
  reason: string;
  createdBy: string;
  phases: OffseasonPhaseItem[];
  events: Array<{ id: string; eventType: string; offseasonPhaseId: string | null; statusBefore: string | null; statusAfter: string | null; summaryText: string; reason: string; createdAt: string }>;
}

export interface OffseasonStatusDto {
  initialized: boolean;
  worldSeason: { id: string; label: string; startYear: number; endYear: number; status: string; phase: string } | null;
  currentRun: OffseasonRunItem | null;
}

export const getOffseasonStatus = (signal?: AbortSignal) => getJson<{ item: OffseasonStatusDto }>('/api/offseason/status', signal);
export const getOffseasonConfigurations = (signal?: AbortSignal) => getJson<{ items: Array<{ id: string; name: string; description: string | null; isSystem: boolean; versions: Array<{ id: string; versionNumber: number; configHash: string; isActive: boolean }> }> }>('/api/offseason/configurations', signal);
export const getOffseasonRuns = (query = '', signal?: AbortSignal) => getJson<{ items: Array<{ id: string; worldSeasonId: string; worldSeasonLabel: string; status: string; runVersion: number; currentPhaseType: string | null; startedAt: string | null; completedAt: string | null; createdAt: string; reason: string; phaseCount: number }> }>(`/api/offseason/runs${query}`, signal);
export const getOffseasonRun = (id: string, signal?: AbortSignal) => getJson<{ item: OffseasonRunItem }>(`/api/offseason/runs/${id}`, signal);
export const getOffseasonRunPhases = (id: string, signal?: AbortSignal) => getJson<{ items: OffseasonPhaseItem[] }>(`/api/offseason/runs/${id}/phases`, signal);
export const getOffseasonRunReadiness = (id: string, signal?: AbortSignal) => getJson<{ item: { phases: Array<{ phaseType: string; level: string; blockers: string[]; warnings: string[]; allowedActions: string[]; linkedOperation: { type: string; id: string | null; summary?: string | null } | null; readinessHash: string }> } }>(`/api/offseason/runs/${id}/readiness`, signal);
export const getOffseasonRunHistory = (id: string, signal?: AbortSignal) => getJson<{ items: OffseasonRunItem['events'] }>(`/api/offseason/runs/${id}/history`, signal);
export const getOffseasonRunTeams = (id: string, query = '', signal?: AbortSignal) => getJson<{ items: Array<{ id: string; name: string; shortName: string | null }>; page: number; pageSize: number; total: number; totalPages: number }>(`/api/offseason/runs/${id}/teams${query}`, signal);
export const getOffseasonTeamOverview = (runId: string, teamId: string, signal?: AbortSignal) => getJson<{ item: { team: { id: string; name: string; teamType: string }; contracts: { active: number; expiring: number; future: number }; offers: { submittedByThisTeam: number; incomingAgainstThisTeam: number }; freeAgents: number; draftRights: { unsigned: number; signed: number }; trades: { incomingProposals: number; outgoingProposals: number; completedCount: number }; retiredPlayers: number; rosterReadiness: { ownershipMismatch: number; retiredOnRoster: number; blockers: string[] }; lineupReadiness: { present: boolean; slotCount: number; retiredInLineup: number; ownershipMismatch: number; blockers: string[] }; staleScoutingReports: { currentReports: number } } }>(`/api/offseason/runs/${runId}/teams/${teamId}`, signal);
export const getOffseasonFinalReview = (id: string, signal?: AbortSignal) => getJson<{ item: { ready: boolean; blockers: Array<{ code: string; severity: string; message: string }>; warnings: Array<{ code: string; severity: string; message: string }> } }>(`/api/offseason/runs/${id}/final-review`, signal);

export const createOffseasonRun = (payload: { worldSeasonId: string; configVersionId?: string; reason: string; createdBy: string }) =>
  commissionerWrite<{ item: OffseasonRunItem }>('/api/commissioner/offseason/runs', 'POST', payload);
export const startOffseasonRun = (id: string, reason: string, expectedUpdatedAt?: string) =>
  commissionerWrite<{ item: OffseasonRunItem }>(`/api/commissioner/offseason/runs/${id}/start`, 'POST', { reason, expectedUpdatedAt });
export const cancelOffseasonRun = (id: string, reason: string, expectedUpdatedAt?: string) =>
  commissionerWrite<{ item: OffseasonRunItem }>(`/api/commissioner/offseason/runs/${id}/cancel`, 'POST', { reason, expectedUpdatedAt });
export const refreshOffseasonRun = (id: string, expectedUpdatedAt?: string) =>
  commissionerWrite<{ item: OffseasonRunItem }>(`/api/commissioner/offseason/runs/${id}/refresh`, 'POST', { expectedUpdatedAt });
export const completeOffseasonRun = (id: string, reason: string, expectedUpdatedAt?: string) =>
  commissionerWrite<{ item: OffseasonRunItem }>(`/api/commissioner/offseason/runs/${id}/complete`, 'POST', { reason, expectedUpdatedAt });
export const startOffseasonPhase = (phaseId: string, runId: string, reason: string, expectedUpdatedAt?: string) =>
  commissionerWrite<{ item: OffseasonRunItem }>(`/api/commissioner/offseason/phases/${phaseId}/start`, 'POST', { runId, reason, expectedUpdatedAt });
export const completeOffseasonPhase = (phaseId: string, runId: string, reason: string, expectedUpdatedAt?: string) =>
  commissionerWrite<{ item: OffseasonRunItem }>(`/api/commissioner/offseason/phases/${phaseId}/complete`, 'POST', { runId, reason, expectedUpdatedAt });
export const skipOffseasonPhase = (phaseId: string, runId: string, reason: string, expectedUpdatedAt?: string) =>
  commissionerWrite<{ item: OffseasonRunItem }>(`/api/commissioner/offseason/phases/${phaseId}/skip`, 'POST', { runId, reason, expectedUpdatedAt });
export const retryOffseasonPhase = (phaseId: string, runId: string, reason: string, expectedUpdatedAt?: string) =>
  commissionerWrite<{ item: OffseasonRunItem }>(`/api/commissioner/offseason/phases/${phaseId}/retry`, 'POST', { runId, reason, expectedUpdatedAt });
export const linkOffseasonPhase = (phaseId: string, runId: string, operationType: 'CONTRACT_EXPIRATION' | 'PLAYER_DEVELOPMENT' | 'YOUTH_GENERATION' | 'DRAFT' | 'COMPETITION_ARCHIVE', operationId: string, expectedUpdatedAt?: string) =>
  commissionerWrite<{ item: OffseasonRunItem }>(`/api/commissioner/offseason/phases/${phaseId}/link`, 'POST', { runId, operationType, operationId, expectedUpdatedAt });

// F31 — Season Transition (Renewable World Cycle).
// Persistent, deterministic, Commissioner-controlled season-rollover workflow
// that consumes a completed F30 OffseasonRun and creates exactly one next
// WorldSeason plus its CompetitionEditions. One transition per source season;
// the target season is a new record. F31 never generates schedules or Matches
// and never replays F24–F30 operations.

export interface SeasonTransitionReadiness {
  status: 'READY' | 'WARNING' | 'NOT_READY';
  checks: Array<{ id: string; status: 'PASS' | 'WARN' | 'FAIL'; message: string }>;
  blockers: Array<{ code: string; message: string }>;
  warnings: Array<{ code: string; message: string }>;
  sourceSeason: { id: string; label: string; startYear: number; endYear: number; status: string; phase: string; updatedAt: string };
  completedOffseasonRun: { id: string; status: string; resultHash: string | null; completedAt: string | null } | null;
  proposedTargetSeason: {
    order: number;
    label: string;
    displayName: string;
    startDateIso: string;
    endDateIso: string;
    manuallyNamed: boolean;
  };
  competitionPlan: Array<{
    competitionId: string;
    competitionName: string;
    competitionType: string;
    simulationLevel: string | null;
    displayName: string;
    isInternational: boolean;
    initialStatus: string;
    rulesHash: string;
    stages: Array<{ name: string; stageType: string; stageOrder: number; configHash: string; participantSource: string; remappedFromStageOrder: number | null }>;
    participantCount: number;
    selectionReason: string;
  }>;
  carryForwardSummary: {
    lineups: { carryForward: boolean; markedForReview: boolean; copyTactics: boolean; autoRebuild: boolean };
    scouting: { preserved: boolean; staleReports: number; totalReports: number };
    nationalTeams: { createPreparation: boolean; carryLockedRosters: boolean };
    contracts: { requireNoOwnershipMismatch: boolean; activateFuture: boolean; freeAgents: number };
    draftRights: { carried: boolean; unsignedCount: number };
    players: { preserved: boolean };
  };
  allowedActions: string[];
  readinessHash: string;
}

export interface SeasonTransitionRunEvent {
  id: string;
  eventType: string;
  statusBefore: string | null;
  statusAfter: string | null;
  summaryText: string;
  reason: string;
  eventHash: string;
  createdAt: string;
}

export interface SeasonTransitionEntityRecord {
  id: string;
  entityType: string;
  sourceEntityId: string | null;
  targetEntityId: string | null;
  action: string;
  snapshotHash: string;
  createdAt: string;
}

export interface SeasonTransitionRunItem {
  id: string;
  sourceWorldSeasonId: string;
  sourceWorldSeason: { id: string; label: string; startYear: number; endYear: number; status: string; phase?: string };
  targetWorldSeasonId: string | null;
  targetWorldSeason: { id: string; label: string; startYear: number; endYear: number; status: string } | null;
  status: string;
  configVersion: { id: string; versionNumber: number; configHash: string; changeReason: string };
  configHash: string;
  runVersion: number;
  targetDisplayName: string;
  targetSeasonOrder: number;
  targetStartDateIso: string | null;
  targetEndDateIso: string | null;
  inputHash: string;
  planHash: string;
  resultHash: string | null;
  preparedAt: string | null;
  startedAt: string | null;
  completedAt: string | null;
  failedAt: string | null;
  cancelledAt: string | null;
  backupMetadataText: string | null;
  reason: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  events: SeasonTransitionRunEvent[];
  entityRecords: SeasonTransitionEntityRecord[];
}

export interface SeasonTransitionStatusDto {
  initialized: boolean;
  currentSeason: { id: string; label: string; startYear: number; endYear: number; status: string; phase: string } | null;
  latestTransition: { id: string; status: string; sourceWorldSeasonId: string; targetWorldSeasonId: string | null; targetWorldSeasonLabel: string | null; targetDisplayName: string; targetSeasonOrder: number; completedAt: string | null } | null;
}

export interface SeasonTransitionListItem {
  id: string;
  sourceWorldSeasonId: string;
  sourceWorldSeasonLabel: string;
  targetWorldSeasonId: string | null;
  targetWorldSeasonLabel: string | null;
  status: string;
  runVersion: number;
  targetDisplayName: string;
  targetSeasonOrder: number;
  preparedAt: string | null;
  completedAt: string | null;
  failedAt: string | null;
  cancelledAt: string | null;
  createdAt: string;
  updatedAt: string;
  reason: string;
  createdBy: string;
}

export interface SeasonTransitionConfigItem {
  id: string;
  name: string;
  description: string | null;
  isSystem: boolean;
  versions: Array<{ id: string; versionNumber: number; schemaVersion: number; configHash: string; isActive: boolean; createdAt: string }>;
}

export const getCurrentWorldSeason = (signal?: AbortSignal) => getJson<{ item: WorldSeasonItem }>('/api/world-seasons/current', signal);
export const getWorldSeason = (id: string, signal?: AbortSignal) => getJson<{ item: WorldSeasonItem }>(`/api/world-seasons/${id}`, signal);
export const getWorldSeasonReadiness = (id: string, signal?: AbortSignal) =>
  getJson<{ item: { worldSeasonId: string; label: string; status: string; completedOffseasonRun: { id: string; completedAt: string | null } | null; activeCompetitionEditions: number; completedButUnarchived: number; transitionEligible: boolean; transitionEligibleReason: string } }>(`/api/world-seasons/${id}/readiness`, signal);
export const getSeasonTransitionStatus = (signal?: AbortSignal) => getJson<{ item: SeasonTransitionStatusDto }>('/api/season-transitions/status', signal);
export const getSeasonTransitionConfigurations = (signal?: AbortSignal) => getJson<{ items: SeasonTransitionConfigItem[] }>('/api/season-transitions/configurations', signal);
export const getSeasonTransitions = (query = '', signal?: AbortSignal) => getJson<{ items: SeasonTransitionListItem[] }>(`/api/season-transitions${query}`, signal);
export const getSeasonTransitionRun = (id: string, signal?: AbortSignal) => getJson<{ item: SeasonTransitionRunItem }>(`/api/season-transitions/${id}`, signal);
export const getSeasonTransitionRunReadiness = (id: string, signal?: AbortSignal) => getJson<{ item: SeasonTransitionReadiness }>(`/api/season-transitions/${id}/readiness`, signal);
export const getSeasonTransitionRunHistory = (id: string, signal?: AbortSignal) => getJson<{ items: SeasonTransitionRunEvent[] }>(`/api/season-transitions/${id}/history`, signal);
export const getSeasonTransitionRunResult = (id: string, signal?: AbortSignal) => getJson<{ item: { runId: string; status: string; resultHash: string | null; targetWorldSeasonId: string | null; entityRecords: SeasonTransitionEntityRecord[] } }>(`/api/season-transitions/${id}/result`, signal);
export const previewSeasonTransition = (sourceWorldSeasonId: string, signal?: AbortSignal, configVersionId?: string, targetDisplayNameOverride?: string | null) => {
  const params = new URLSearchParams({ sourceWorldSeasonId });
  if (configVersionId) params.set('configVersionId', configVersionId);
  if (targetDisplayNameOverride) params.set('targetDisplayNameOverride', targetDisplayNameOverride);
  return getJson<{ item: { previewOnly: boolean; inputHash: string; readiness: SeasonTransitionReadiness } }>(`/api/season-transitions/preview?${params.toString()}`, signal);
};

export const prepareSeasonTransition = (payload: { sourceWorldSeasonId: string; configVersionId?: string; targetDisplayNameOverride?: string | null; expectedSourceSeasonUpdatedAt?: string; reason: string; createdBy: string }) =>
  commissionerWrite<{ item: SeasonTransitionRunItem }>('/api/commissioner/season-transitions/prepare', 'POST', payload);
export const executeSeasonTransition = (runId: string, reason: string, expectedUpdatedAt?: string) =>
  commissionerWrite<{ item: SeasonTransitionRunItem }>(`/api/commissioner/season-transitions/${runId}/execute`, 'POST', { reason, expectedUpdatedAt });
export const cancelSeasonTransition = (runId: string, reason: string, expectedUpdatedAt?: string) =>
  commissionerDelete<{ item: SeasonTransitionRunItem }>(`/api/commissioner/season-transitions/${runId}`, { reason, expectedUpdatedAt });
export const retrySeasonTransition = (runId: string, reason = 'Retry after failure') =>
  commissionerWrite<{ item: SeasonTransitionRunItem }>(`/api/commissioner/season-transitions/${runId}/retry`, 'POST', { reason });
export const createSeasonTransitionConfiguration = (payload: { name: string; description?: string | null; config: unknown; activate?: boolean; reason: string }) =>
  commissionerWrite<{ item: SeasonTransitionConfigItem }>('/api/commissioner/season-transition-configurations', 'POST', payload);
export const activateSeasonTransitionConfiguration = (versionId: string, reason: string) =>
  commissionerWrite<{ item: unknown }>(`/api/commissioner/season-transition-configuration-versions/${versionId}/activate`, 'POST', { reason });
