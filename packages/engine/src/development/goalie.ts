import { allocateAttributeBudget } from './allocation.js';
import type { DevelopmentPlayerInput, PlayerDevelopmentConfig } from './types.js';

/** Goalie pathway — uses goalie attribute groups only. */
export function developGoalieAttributes(input: {
  player: DevelopmentPlayerInput;
  budget: number;
  config: PlayerDevelopmentConfig;
  baseSeed: string;
  effectiveDate: string;
}) {
  if (input.player.playerType !== 'GOALIE') {
    throw new Error('developGoalieAttributes requires GOALIE');
  }
  return allocateAttributeBudget(input);
}
