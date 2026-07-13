import { allocateAttributeBudget } from './allocation.js';
import type { DevelopmentPlayerInput, PlayerDevelopmentConfig } from './types.js';

/** Skater pathway — uses skater attribute groups only. */
export function developSkaterAttributes(input: {
  player: DevelopmentPlayerInput;
  budget: number;
  config: PlayerDevelopmentConfig;
  baseSeed: string;
  effectiveDate: string;
}) {
  if (input.player.playerType !== 'SKATER') {
    throw new Error('developSkaterAttributes requires SKATER');
  }
  return allocateAttributeBudget(input);
}
