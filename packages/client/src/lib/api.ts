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
  } | null;
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
  editionCount: number;
  currentEdition: {
    id: string;
    displayName: string;
    status: string;
    worldSeason?: { id: string; label: string };
  } | null;
}

export interface CompetitionDetail {
  id: string;
  name: string;
  shortName: string | null;
  type: string;
  simulationLevel: string | null;
  externalId: string | null;
  sourceDataset: string | null;
  sourceUpdatedAt: string | null;
  editions: Array<{
    id: string;
    displayName: string;
    status: string;
    worldSeason?: { id: string; label: string };
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
