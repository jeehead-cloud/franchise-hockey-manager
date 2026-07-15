import type { PlayerTruth, ScoutInput } from './types.js';

export function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

export function positionGroup(player: PlayerTruth): 'forward' | 'defense' | 'goalie' {
  return player.kind === 'goalie' ? 'goalie' : player.position === 'LD' || player.position === 'RD' ? 'defense' : 'forward';
}

export function scoutSkill(scout: ScoutInput, player: PlayerTruth, target: 'attribute' | 'potential'): number {
  const specialty = scout.specialties.includes('GENERAL') ||
    scout.specialties.includes(target === 'potential' ? 'POTENTIAL' : player.kind === 'goalie' ? 'GOALIE' : 'SKATER') ? 1 : 0;
  const base = target === 'potential' ? scout.ratings.potential : scout.ratings.evaluating;
  const type = player.kind === 'goalie' ? scout.ratings.goalie : scout.ratings.skater;
  const country = scout.countryFamiliarity[player.countryKey] ?? 0;
  const group = scout.positionGroupFamiliarity[positionGroup(player)] ?? 0;
  return clamp01((base + type + country + group) / 80 + specialty * 0.12);
}
