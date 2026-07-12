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

export async function fetchHealth(signal?: AbortSignal): Promise<HealthResponse> {
  const res = await fetch(`${apiBase()}/health`, { signal });
  if (!res.ok) {
    throw new Error(`Health check failed: ${res.status}`);
  }
  return res.json() as Promise<HealthResponse>;
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

async function readError(res: Response): Promise<string> {
  try {
    const body = (await res.json()) as { message?: string; error?: string };
    return body.message || body.error || `Request failed: ${res.status}`;
  } catch {
    return `Request failed: ${res.status}`;
  }
}

export async function fetchSetupStatus(signal?: AbortSignal): Promise<SetupStatus> {
  const res = await fetch(`${apiBase()}/api/setup/status`, { signal });
  if (!res.ok) throw new Error(await readError(res));
  return res.json() as Promise<SetupStatus>;
}

export async function fetchSetupPreview(signal?: AbortSignal): Promise<SetupPreview> {
  const res = await fetch(`${apiBase()}/api/setup/preview`, { signal });
  if (!res.ok) throw new Error(await readError(res));
  return res.json() as Promise<SetupPreview>;
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
