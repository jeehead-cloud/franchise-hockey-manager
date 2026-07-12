import skaterRoles from '../config/skater-roles.json' with { type: 'json' };
import { computeRoleRating } from './ratings.js';
import type { SkaterAttributeKey, SkaterAttributes, SkaterPosition, SkaterRoleResult } from './types.js';
import { assertSkaterPosition, PlayerModelValidationError } from './validation.js';

type Pair = { a: SkaterAttributeKey; b: SkaterAttributeKey; role: string };

function pairScore(attrs: SkaterAttributes, pair: Pair): number {
  return attrs[pair.a] + attrs[pair.b];
}

/**
 * Deterministic skater role derivation from PLAYER_MODEL.md attribute pairs.
 * Tie-break: higher pairScore wins; if tied, lexicographically smaller role key;
 * if still tied, lexicographically smaller "a|b" pair key.
 */
export function deriveSkaterRole(
  primaryPosition: string,
  attrs: SkaterAttributes,
): SkaterRoleResult {
  assertSkaterPosition(primaryPosition);
  const position = primaryPosition as SkaterPosition;
  const isForward = position === 'LW' || position === 'RW' || position === 'C';
  const pairs = (isForward ? skaterRoles.forwardPairs : skaterRoles.defensePairs) as Pair[];

  let best: { pair: Pair; score: number } | null = null;
  for (const pair of pairs) {
    const score = pairScore(attrs, pair);
    if (!best) {
      best = { pair, score };
      continue;
    }
    if (score > best.score) {
      best = { pair, score };
      continue;
    }
    if (score === best.score) {
      if (pair.role < best.pair.role) {
        best = { pair, score };
        continue;
      }
      if (pair.role === best.pair.role) {
        const key = `${pair.a}|${pair.b}`;
        const bestKey = `${best.pair.a}|${best.pair.b}`;
        if (key < bestKey) best = { pair, score };
      }
    }
  }

  if (!best) {
    throw new PlayerModelValidationError(['No skater role pairs configured']);
  }

  const role = best.pair.role;
  const ratingCfg = (
    skaterRoles.roleRatings as Record<string, { attrs: string[]; weights: number[] }>
  )[role];
  if (!ratingCfg) {
    throw new PlayerModelValidationError([`Missing role rating config for ${role}`]);
  }

  const roleRating = computeRoleRating(attrs, ratingCfg.attrs, ratingCfg.weights);
  const roleLabel =
    (skaterRoles.labels as Record<string, string>)[role] ?? role;

  return {
    role,
    roleLabel,
    roleRating,
    winningPair: { a: best.pair.a, b: best.pair.b },
    pairScore: best.score,
    explanation: `${roleLabel} from ${best.pair.a}+${best.pair.b} (pair score ${best.score})`,
  };
}
