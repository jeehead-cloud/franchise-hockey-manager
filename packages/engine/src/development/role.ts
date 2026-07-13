import {
  deriveGoalieRatings,
  deriveSkaterRatings,
} from '../players/ratings.js';
import { deriveSkaterRole } from '../players/roles.js';
import { deriveGoalieRole } from '../goalies/roles.js';
import {
  GOALIE_ATTRIBUTE_KEYS,
  SKATER_ATTRIBUTE_KEYS,
  type GoalieAttributes,
  type SkaterAttributes,
} from '../players/types.js';
import type { DevelopmentPlayerType } from './types.js';
import { PlayerDevelopmentError } from './types.js';

export function recalculateCurrentAbility(
  playerType: DevelopmentPlayerType,
  attributes: Record<string, number>,
): number {
  if (playerType === 'GOALIE') {
    const attrs = pickGoalie(attributes);
    return deriveGoalieRatings(attrs).currentAbility;
  }
  const attrs = pickSkater(attributes);
  return deriveSkaterRatings(attrs).currentAbility;
}

export function deriveRoleAfter(
  playerType: DevelopmentPlayerType,
  position: string,
  attributes: Record<string, number>,
): string {
  if (playerType === 'GOALIE') {
    if (position !== 'G') {
      throw new PlayerDevelopmentError(
        'InvalidPlayerDevelopmentInput',
        'Goalie must have position G',
      );
    }
    return deriveGoalieRole(position, pickGoalie(attributes)).role;
  }
  return deriveSkaterRole(position, pickSkater(attributes)).role;
}

function pickSkater(attributes: Record<string, number>): SkaterAttributes {
  const out = {} as SkaterAttributes;
  for (const k of SKATER_ATTRIBUTE_KEYS) {
    const v = attributes[k];
    if (typeof v !== 'number') {
      throw new PlayerDevelopmentError(
        'InvalidPlayerDevelopmentInput',
        `Missing skater attribute ${k}`,
      );
    }
    out[k] = v;
  }
  return out;
}

function pickGoalie(attributes: Record<string, number>): GoalieAttributes {
  const out = {} as GoalieAttributes;
  for (const k of GOALIE_ATTRIBUTE_KEYS) {
    const v = attributes[k];
    if (typeof v !== 'number') {
      throw new PlayerDevelopmentError(
        'InvalidPlayerDevelopmentInput',
        `Missing goalie attribute ${k}`,
      );
    }
    out[k] = v;
  }
  return out;
}
