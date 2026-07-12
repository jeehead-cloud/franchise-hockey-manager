import type { BalanceConfig } from './types.js';

/** Stable deep sort of plain JSON values for hashing / export. */
export function sortJsonValue(value: unknown): unknown {
  if (value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map(sortJsonValue);
  const obj = value as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(obj).sort()) {
    out[key] = sortJsonValue(obj[key]);
  }
  return out;
}

/** Deterministic JSON string used for config hashing (server SHA-256). */
export function canonicalizeBalanceConfig(config: BalanceConfig): string {
  return JSON.stringify(sortJsonValue(config));
}

/** Normalize via validate+canonical parse round-trip so key order is stable. */
export function normalizeBalanceConfig(config: BalanceConfig): BalanceConfig {
  return JSON.parse(canonicalizeBalanceConfig(config)) as BalanceConfig;
}

export function collectChangedPaths(
  before: unknown,
  after: unknown,
  prefix = '',
): Array<{ path: string; before: unknown; after: unknown }> {
  if (Object.is(before, after)) return [];
  const beforeObj = before !== null && typeof before === 'object' && !Array.isArray(before);
  const afterObj = after !== null && typeof after === 'object' && !Array.isArray(after);
  if (beforeObj && afterObj) {
    const a = before as Record<string, unknown>;
    const b = after as Record<string, unknown>;
    const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
    const changes: Array<{ path: string; before: unknown; after: unknown }> = [];
    for (const key of [...keys].sort()) {
      const path = prefix ? `${prefix}.${key}` : key;
      changes.push(...collectChangedPaths(a[key], b[key], path));
    }
    return changes;
  }
  if (Array.isArray(before) && Array.isArray(after)) {
    if (JSON.stringify(sortJsonValue(before)) === JSON.stringify(sortJsonValue(after))) return [];
    return [{ path: prefix || '(root)', before, after }];
  }
  return [{ path: prefix || '(root)', before, after }];
}
