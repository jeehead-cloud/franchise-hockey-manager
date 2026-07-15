import { createRng, nextFloat } from '../simulation/match/rng.js';
import { UNKNOWN_CA, UNKNOWN_POTENTIAL, UNKNOWN_ROLE, deriveRisk } from './board.js';
import type { AutoPickInput, AutoPickResult, BoardProspectEstimate, DraftAutoPickConfig } from './types.js';
import { DraftError } from './types.js';

/**
 * Deterministic suggested auto-pick.
 *
 * Inputs are **scouting estimates only** — true potential, true current
 * ability, hidden attributes, F25 quality tier, and generation diagnostics
 * must never be passed in. The score is a bounded weighted blend with a
 * watchlist bonus and risk penalty; ties are broken deterministically by a
 * seeded stable fallback so the same board + seed always selects the same
 * player.
 *
 * Unknown (unscouted) prospects receive a bounded fallback value and the
 * highest risk, but remain selectable — a team may still manually pick them.
 */
export function suggestAutoPick(input: AutoPickInput, weights?: DraftAutoPickConfig): AutoPickResult {
  if (input.availableProspects.length === 0) {
    throw new DraftError('DraftOrderUnavailable', 'No available prospects to auto-pick');
  }
  const cfg = input.teamBoardConfig;
  const seed = input.seed;
  const w = weights ?? defaultAutoPickWeights();
  const rng = createRng(`${seed}:autopick`);

  const scored = input.availableProspects.map((p) => scoreProspect(p, rng, seed, w));
  // Re-roll once per prospect to keep the RNG stream consistent/deterministic
  // across reruns without biasing the top pick.

  // Manual rank precedence: if configured and a prospect has an explicit
  // manual rank, the lowest manual rank wins outright.
  if (cfg.respectManualRank) {
    const manuallyRanked = input.availableProspects
      .filter((p) => p.manualRank !== null && p.manualRank > 0)
      .sort((a, b) => (a.manualRank! - b.manualRank!) || a.playerId.localeCompare(b.playerId));
    if (manuallyRanked.length > 0) {
      const winner = manuallyRanked[0]!;
      const winnerScore = scored.find((s) => s.playerId === winner.playerId)!;
      return {
        selectedPlayerId: winner.playerId,
        score: winnerScore.score,
        reason: `manual rank ${winner.manualRank}`,
        scores: scored.map((s) => ({ playerId: s.playerId, score: s.score, components: s.components })),
      };
    }
  }

  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    // Stable fallback: seeded jitter then lexicographic player id.
    return a.playerId.localeCompare(b.playerId);
  });
  const top = scored[0]!;
  return {
    selectedPlayerId: top.playerId,
    score: top.score,
    reason: top.reason,
    scores: scored.map((s) => ({ playerId: s.playerId, score: s.score, components: s.components })),
  };
}

function scoreProspect(
  p: BoardProspectEstimate,
  rng: ReturnType<typeof createRng>,
  seed: string,
  weights: DraftAutoPickConfig,
): {
  playerId: string;
  score: number;
  components: Record<string, number>;
  reason: string;
} {
  // Use a fresh deterministic roll per player purely to break ties stably —
  // never to read hidden truth. Each roll advances the same RNG stream so the
  // sequence is reproducible for the same input order.
  const roll = nextFloat(rng);
  void rng;
  void roll;

  const ca = p.estimatedCurrentAbility ?? UNKNOWN_CA;
  const pot = p.estimatedPotential ?? UNKNOWN_POTENTIAL;
  const role = p.projectedRole ?? UNKNOWN_ROLE;
  const roleScore = roleScoreValue(role);
  const confidence = clamp01(p.confidence);
  const risk = deriveRisk(p);
  const watchBonus = p.watchlistPriority > 0 ? weights.watchlistPriorityBonus * p.watchlistPriority : 0;

  const components = {
    potential: pot * weights.estimatedPotentialWeight,
    currentAbility: ca * weights.estimatedCurrentAbilityWeight,
    confidence: confidence * 100 * weights.confidenceWeight,
    projectedRole: roleScore * weights.projectedRoleWeight,
    risk: -risk * 100 * weights.riskPenaltyWeight,
    watchlist: watchBonus * 100,
    // Deterministic stable fallback keyed by player id + seed (no truth).
    fallback: stableFallback(p.playerId, seed),
  };
  const score = Math.round(
    components.potential +
      components.currentAbility +
      components.confidence +
      components.projectedRole +
      components.risk +
      components.watchlist +
      components.fallback,
  );

  const reason = `potential ${pot}, CA ${ca}, role ${role}, confidence ${Math.round(confidence * 100)}%, risk ${Math.round(risk * 100)}%${p.watchlistPriority > 0 ? `, watchlist ${p.watchlistPriority}` : ''}`;
  return { playerId: p.playerId, score, components, reason };
}

export function defaultAutoPickWeights(): DraftAutoPickConfig {
  return {
    estimatedPotentialWeight: 0.45,
    estimatedCurrentAbilityWeight: 0.2,
    confidenceWeight: 0.15,
    projectedRoleWeight: 0.1,
    riskPenaltyWeight: 0.1,
    watchlistPriorityBonus: 0.05,
  };
}

/**
 * Projected-role coarse score used by auto-pick. Only the *estimate* label is
 * consulted (never true role/quality). Unknown roles get a neutral score.
 */
function roleScoreValue(role: string): number {
  switch (role) {
    case 'ELITE':
    case 'FRANCHISE':
      return 100;
    case 'TOP_SIX':
    case 'TOP_PAIR':
    case 'STARTER':
      return 80;
    case 'BOTTOM_SIX':
    case 'BOTTOM_PAIR':
    case 'BACKUP':
      return 55;
    case 'DEPTH':
    case 'TWEENER':
      return 40;
    default:
      return 50; // UNKNOWN or any unrecognized estimate label
  }
}

/** Deterministic small bonus from player id + seed so ties resolve stably. */
function stableFallback(playerId: string, seed: string): number {
  let hash = 2166136261;
  const str = `${seed}|${playerId}`;
  for (let i = 0; i < str.length; i += 1) {
    hash ^= str.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  // Map to [0, 1) of a bounded scale so it can only break ties, not dominate.
  return ((hash >>> 0) % 1000) / 1000;
}

function clamp01(v: number): number {
  if (!Number.isFinite(v)) return 0;
  return Math.max(0, Math.min(1, v));
}
