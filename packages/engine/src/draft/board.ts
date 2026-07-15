import { hashDraftBoard } from './hashing.js';
import type {
  BoardProspectEstimate,
  DraftBoardEntry,
  DraftBoardSnapshot,
  TeamBoardConfig,
} from './types.js';

/**
 * Normalize a team's scouting estimates into a frozen draft board with a
 * deterministic suggested rank. Estimates only — never player truth.
 *
 * Risk is derived from estimate confidence and staleness: unscouted (null
 * estimate) prospects receive the highest risk, low confidence and stale
 * reports add penalty.
 */
export function buildDraftBoard(
  teamId: string,
  estimates: BoardProspectEstimate[],
  opts?: { draftedPlayerIds?: Set<string>; config?: TeamBoardConfig },
): DraftBoardSnapshot {
  const drafted = opts?.draftedPlayerIds ?? new Set<string>();
  const entries: DraftBoardEntry[] = estimates.map((e) => ({
    playerId: e.playerId,
    estimatedCurrentAbility: e.estimatedCurrentAbility,
    estimatedPotential: e.estimatedPotential,
    projectedRole: e.projectedRole,
    confidence: clamp01(e.confidence),
    stale: e.stale,
    risk: deriveRisk(e),
    watchlistPriority: e.watchlistPriority,
    manualRank: e.manualRank,
    suggestedRank: null,
    drafted: drafted.has(e.playerId),
  }));

  // Suggested rank uses a stable score; ties broken by player id (no truth).
  const ranked = entries
    .filter((e) => !e.drafted)
    .map((e) => ({ entry: e, score: scoreForRank(e) }))
    .sort((a, b) => b.score - a.score || a.entry.playerId.localeCompare(b.entry.playerId));
  ranked.forEach((r, idx) => {
    r.entry.suggestedRank = idx + 1;
  });

  const snapshot: DraftBoardSnapshot = {
    teamId,
    entries: entries.sort((a, b) => {
      // Manual rank first when present, then suggested rank, then player id.
      const am = a.manualRank ?? Number.MAX_SAFE_INTEGER;
      const bm = b.manualRank ?? Number.MAX_SAFE_INTEGER;
      if (am !== bm) return am - bm;
      const asr = a.suggestedRank ?? Number.MAX_SAFE_INTEGER;
      const bsr = b.suggestedRank ?? Number.MAX_SAFE_INTEGER;
      if (asr !== bsr) return asr - bsr;
      return a.playerId.localeCompare(b.playerId);
    }),
    boardHash: '',
  };
  snapshot.boardHash = hashDraftBoard(snapshot);
  return snapshot;
}

/**
 * Suggested-board rank score (separate from auto-pick): pure estimate weighting.
 * Used for the suggested-rank column only.
 */
export function scoreForRank(entry: Pick<DraftBoardEntry, 'estimatedCurrentAbility' | 'estimatedPotential' | 'confidence' | 'watchlistPriority'>): number {
  const ca = entry.estimatedCurrentAbility ?? UNKNOWN_CA;
  const pot = entry.estimatedPotential ?? ca;
  const conf = entry.confidence;
  const watch = entry.watchlistPriority;
  return Math.round((pot * 0.6 + ca * 0.4) * (0.5 + conf * 0.5) + watch * 5);
}

/** Unknown-prospect fallback used when no scouting estimate exists. */
export const UNKNOWN_CA = 25;
export const UNKNOWN_POTENTIAL = 55;
export const UNKNOWN_ROLE = 'UNKNOWN';

export function deriveRisk(e: BoardProspectEstimate): number {
  // Risk ∈ [0, 1]. Higher = riskier.
  let risk = 0;
  if (e.estimatedCurrentAbility === null || e.estimatedPotential === null) {
    // Unscouted: maximal estimate-driven risk.
    risk += 0.6;
  } else {
    risk += (1 - clamp01(e.confidence)) * 0.4;
  }
  if (e.stale) risk += 0.15;
  return Math.min(1, risk);
}

function clamp01(v: number): number {
  if (!Number.isFinite(v)) return 0;
  return Math.max(0, Math.min(1, v));
}
