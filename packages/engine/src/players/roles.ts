import roleThresholds from '../config/role-thresholds.json' with { type: 'json' };
import type { AttrCode, Position, SkaterAttributes } from './types.js';

export interface RolePairConfig {
  attrs: [AttrCode, AttrCode];
  forward: string;
  defenseman: string;
  roleRating: {
    attrs: AttrCode[];
    weights: number[];
  };
}

interface RoleThresholdsFile {
  pairs: RolePairConfig[];
}

const config = roleThresholds as RoleThresholdsFile;

function isForward(position: Position): boolean {
  return position === 'LW' || position === 'RW' || position === 'C';
}

function isDefenseman(position: Position): boolean {
  return position === 'LD' || position === 'RD';
}

/**
 * Derive archetype/role from the highest-scoring attribute pair
 * (PLAYER_MODEL.md §5). Goalies have no role.
 */
export function deriveRole(
  position: Position,
  attributes: SkaterAttributes,
): { role: string; roleRating: number; winningPair: [AttrCode, AttrCode] } | null {
  if (!isForward(position) && !isDefenseman(position)) {
    return null;
  }

  let bestScore = -Infinity;
  let bestPair: RolePairConfig | null = null;

  for (const pair of config.pairs) {
    const [a, b] = pair.attrs;
    const score = attributes[a] + attributes[b];
    if (score > bestScore) {
      bestScore = score;
      bestPair = pair;
    }
  }

  if (!bestPair) {
    return null;
  }

  const role = isForward(position) ? bestPair.forward : bestPair.defenseman;
  const roleRating = computeRoleRating(attributes, bestPair);

  return { role, roleRating, winningPair: bestPair.attrs };
}

/**
 * Weighted sum of four role-supporting attributes, divided by 10
 * (prototype scale: weights 3,3,2,2).
 *
 * TODO: per-role weight tables are approximate placeholders transcribed from
 * the pair mapping + example Rocket weights in PLAYER_MODEL.md §5 — full
 * spreadsheet weight tables were not available and should be verified.
 */
export function computeRoleRating(
  attributes: SkaterAttributes,
  pair: RolePairConfig,
): number {
  const { attrs, weights } = pair.roleRating;
  let sum = 0;
  let weightSum = 0;
  for (let i = 0; i < attrs.length; i++) {
    const code = attrs[i]!;
    const w = weights[i] ?? 0;
    sum += attributes[code] * w;
    weightSum += w;
  }
  // Prototype used /10 with weights summing to 10 (3+3+2+2)
  return Math.round((sum / (weightSum || 10)) * 100) / 100;
}

export function getRoleThresholds(): readonly RolePairConfig[] {
  return config.pairs;
}
