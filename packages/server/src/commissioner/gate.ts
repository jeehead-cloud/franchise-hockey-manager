/** Commissioner Mode is a local sandbox safety boundary — not authentication. */

export const COMMISSIONER_HEADER = 'x-fhm-commissioner-mode';
export const COMMISSIONER_HEADER_VALUE = 'enabled';

/**
 * Local-dev default: writes enabled unless explicitly disabled.
 * Tests should set FHM_COMMISSIONER_WRITES_ENABLED explicitly.
 */
export function areCommissionerWritesEnabled(): boolean {
  const raw = process.env.FHM_COMMISSIONER_WRITES_ENABLED;
  if (raw === undefined || raw === '') return true;
  return raw === 'true' || raw === '1';
}

export function hasCommissionerHeader(headers: Record<string, string | string[] | undefined>): boolean {
  const value = headers[COMMISSIONER_HEADER] ?? headers['X-FHM-Commissioner-Mode'];
  const normalized = Array.isArray(value) ? value[0] : value;
  return typeof normalized === 'string' && normalized.trim().toLowerCase() === COMMISSIONER_HEADER_VALUE;
}
