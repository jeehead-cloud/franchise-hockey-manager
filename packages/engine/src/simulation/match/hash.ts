import type { MatchEvent } from './types.js';

/** Pure FNV-1a trace hash for deterministic event sequences. */
export function computeTraceHash(events: readonly MatchEvent[]): string {
  let hash = 2166136261;
  for (const e of events) {
    const payload = `${e.index}|${e.type}|${e.period}|${e.elapsedSeconds}|${e.teamId ?? ''}|${e.possession}|${e.zone ?? ''}`;
    for (let i = 0; i < payload.length; i += 1) {
      hash ^= payload.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}
