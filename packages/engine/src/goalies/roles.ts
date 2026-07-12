import goalieRoles from '../config/goalie-roles.json' with { type: 'json' };
import { computeRoleRating } from '../players/ratings.js';
import type { GoalieAttributes, GoalieRoleResult } from '../players/types.js';
import { assertGoaliePosition, PlayerModelValidationError } from '../players/validation.js';

/**
 * Deterministic goalie role from weighted profiles.
 * Highest profile score wins; alphabetical role key breaks ties.
 */
export function deriveGoalieRole(
  primaryPosition: string,
  attrs: GoalieAttributes,
): GoalieRoleResult {
  assertGoaliePosition(primaryPosition);

  const profiles = goalieRoles.profiles as Record<string, Record<string, number>>;
  let bestRole: string | null = null;
  let bestScore = -Infinity;

  for (const role of Object.keys(profiles).sort()) {
    const weights = profiles[role]!;
    let score = 0;
    let total = 0;
    for (const [key, weight] of Object.entries(weights)) {
      const value = attrs[key as keyof GoalieAttributes];
      if (value === undefined) continue;
      score += value * weight;
      total += weight;
    }
    const normalized = total > 0 ? score / total : 0;
    if (normalized > bestScore || (normalized === bestScore && bestRole !== null && role < bestRole)) {
      bestScore = normalized;
      bestRole = role;
    } else if (bestRole === null) {
      bestScore = normalized;
      bestRole = role;
    }
  }

  if (!bestRole) {
    throw new PlayerModelValidationError(['No goalie role profiles configured']);
  }

  const ratingCfg = (
    goalieRoles.roleRatings as Record<string, { attrs: string[]; weights: number[] }>
  )[bestRole];
  if (!ratingCfg) {
    throw new PlayerModelValidationError([`Missing goalie role rating config for ${bestRole}`]);
  }

  const roleRating = computeRoleRating(attrs, ratingCfg.attrs, ratingCfg.weights);
  const roleLabel = (goalieRoles.labels as Record<string, string>)[bestRole] ?? bestRole;

  return {
    role: bestRole,
    roleLabel,
    roleRating,
    profileScore: Math.round(bestScore * 1000) / 1000,
    explanation: `${roleLabel} from weighted profile (score ${bestScore.toFixed(3)})`,
  };
}
