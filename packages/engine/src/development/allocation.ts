import {
  GOALIE_ATTRIBUTE_KEYS,
  SKATER_ATTRIBUTE_KEYS,
  type GoalieAttributeKey,
  type SkaterAttributeKey,
} from '../players/types.js';
import { seededUnit } from './budget.js';
import type { AttributeChange, DevelopmentPlayerInput, PlayerDevelopmentConfig } from './types.js';

type GroupKey =
  | 'puck'
  | 'shooting'
  | 'skating'
  | 'physical'
  | 'offense'
  | 'defense'
  | 'goalie_core'
  | 'goalie_mobility'
  | 'goalie_mental';

const SKATER_GROUPS: Record<GroupKey, SkaterAttributeKey[]> = {
  puck: ['stickhandling', 'passing'],
  shooting: ['shooting'],
  skating: ['speed', 'balance'],
  physical: ['strength', 'aggression'],
  offense: ['offensiveAwareness'],
  defense: ['defensiveAwareness'],
  goalie_core: [],
  goalie_mobility: [],
  goalie_mental: [],
};

const GOALIE_GROUPS: Record<GroupKey, GoalieAttributeKey[]> = {
  puck: [],
  shooting: [],
  skating: [],
  physical: [],
  offense: [],
  defense: [],
  goalie_core: ['reflexes', 'positioning', 'reboundControl', 'glove', 'blocker'],
  goalie_mobility: ['movement', 'puckHandling'],
  goalie_mental: ['consistency', 'stamina'],
};

function positionWeights(position: string, playerType: string): Record<GroupKey, number> {
  if (playerType === 'GOALIE') {
    return {
      puck: 0,
      shooting: 0,
      skating: 0,
      physical: 0,
      offense: 0,
      defense: 0,
      goalie_core: 1.2,
      goalie_mobility: 1.0,
      goalie_mental: 0.9,
    };
  }
  const base: Record<GroupKey, number> = {
    puck: 1,
    shooting: 1,
    skating: 1,
    physical: 1,
    offense: 1,
    defense: 1,
    goalie_core: 0,
    goalie_mobility: 0,
    goalie_mental: 0,
  };
  if (position === 'C') {
    base.puck = 1.25;
    base.offense = 1.1;
  } else if (position === 'LW' || position === 'RW') {
    base.shooting = 1.25;
    base.skating = 1.15;
  } else if (position === 'LD' || position === 'RD') {
    base.defense = 1.3;
    base.physical = 1.15;
  }
  return base;
}

/**
 * Allocate integer attribute deltas from a budget.
 * Positive budget grows; negative declines. Respects attribute bounds.
 */
export function allocateAttributeBudget(input: {
  player: DevelopmentPlayerInput;
  budget: number;
  config: PlayerDevelopmentConfig;
  baseSeed: string;
  effectiveDate: string;
}): { changes: AttributeChange[]; usedBudget: number; unusedBudget: number; attributesAfter: Record<string, number> } {
  const keys =
    input.player.playerType === 'GOALIE'
      ? [...GOALIE_ATTRIBUTE_KEYS]
      : [...SKATER_ATTRIBUTE_KEYS];
  const groups = input.player.playerType === 'GOALIE' ? GOALIE_GROUPS : SKATER_GROUPS;
  const weights = positionWeights(input.player.position, input.player.playerType);
  const min = input.config.attributeLimits.minimum;
  const max = input.config.attributeLimits.maximum;

  const attrs: Record<string, number> = { ...input.player.attributes };
  for (const k of keys) {
    if (typeof attrs[k] !== 'number') attrs[k] = 10;
  }

  let remaining = Math.trunc(input.budget);
  const direction = remaining >= 0 ? 1 : -1;
  let steps = Math.abs(remaining);
  const changesMap = new Map<string, number>();

  // Weighted pick order with deterministic seeded shuffle bias
  const flatKeys: Array<{ key: string; groupKey: GroupKey; weight: number }> = [];
  for (const [groupKey, groupAttrs] of Object.entries(groups) as Array<
    [GroupKey, string[]]
  >) {
    const w = weights[groupKey] ?? 0;
    if (w <= 0) continue;
    for (const key of groupAttrs) {
      if (!keys.includes(key as never)) continue;
      const jitter =
        1 +
        seededUnit(
          `${input.baseSeed}:attrw:${input.player.playerId}:${key}:${input.effectiveDate}`,
        ) *
          input.config.variance.attributeRandomness;
      flatKeys.push({ key, groupKey, weight: w * jitter });
    }
  }
  flatKeys.sort(
    (a, b) =>
      b.weight - a.weight ||
      a.key.localeCompare(b.key),
  );

  let guard = 0;
  while (steps > 0 && flatKeys.length > 0 && guard < 10_000) {
    guard += 1;
    let progressed = false;
    for (const item of flatKeys) {
      if (steps <= 0) break;
      const current = attrs[item.key] ?? 10;
      const next = current + direction;
      if (next < min || next > max) continue;
      attrs[item.key] = next;
      changesMap.set(item.key, (changesMap.get(item.key) ?? 0) + direction);
      steps -= 1;
      progressed = true;
    }
    if (!progressed) break;
  }

  const usedBudget = input.budget - direction * steps;
  const unusedBudget = direction * steps;
  const changes: AttributeChange[] = [...changesMap.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([attributeKey, delta]) => {
      const groupKey =
        flatKeys.find((f) => f.key === attributeKey)?.groupKey ?? 'puck';
      const beforeValue = (input.player.attributes[attributeKey] ?? 10) as number;
      return {
        attributeKey,
        beforeValue,
        delta,
        afterValue: beforeValue + delta,
        groupKey,
      };
    });

  return {
    changes,
    usedBudget,
    unusedBudget,
    attributesAfter: attrs,
  };
}
