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
