import type { LineupPosition, LineupSlot } from './types.js';

export const LINEUP_REQUIRED_SLOT_COUNT = 20 as const;

export const LINEUP_SLOTS: readonly LineupSlot[] = [
  'F1_LW',
  'F1_C',
  'F1_RW',
  'F2_LW',
  'F2_C',
  'F2_RW',
  'F3_LW',
  'F3_C',
  'F3_RW',
  'F4_LW',
  'F4_C',
  'F4_RW',
  'D1_LD',
  'D1_RD',
  'D2_LD',
  'D2_RD',
  'D3_LD',
  'D3_RD',
  'G_STARTER',
  'G_BACKUP',
] as const;

export const SKATER_POSITIONS: readonly LineupPosition[] = ['LW', 'RW', 'C', 'LD', 'RD'] as const;

/** Slot → required position for exact primary/secondary match. */
export const SLOT_REQUIRED_POSITION: Record<LineupSlot, LineupPosition> = {
  F1_LW: 'LW',
  F1_C: 'C',
  F1_RW: 'RW',
  F2_LW: 'LW',
  F2_C: 'C',
  F2_RW: 'RW',
  F3_LW: 'LW',
  F3_C: 'C',
  F3_RW: 'RW',
  F4_LW: 'LW',
  F4_C: 'C',
  F4_RW: 'RW',
  D1_LD: 'LD',
  D1_RD: 'RD',
  D2_LD: 'LD',
  D2_RD: 'RD',
  D3_LD: 'LD',
  D3_RD: 'RD',
  G_STARTER: 'G',
  G_BACKUP: 'G',
};

export const FORWARD_C_SLOTS: readonly LineupSlot[] = ['F1_C', 'F2_C', 'F3_C', 'F4_C'];
export const FORWARD_LW_SLOTS: readonly LineupSlot[] = ['F1_LW', 'F2_LW', 'F3_LW', 'F4_LW'];
export const FORWARD_RW_SLOTS: readonly LineupSlot[] = ['F1_RW', 'F2_RW', 'F3_RW', 'F4_RW'];
export const DEFENSE_LD_SLOTS: readonly LineupSlot[] = ['D1_LD', 'D2_LD', 'D3_LD'];
export const DEFENSE_RD_SLOTS: readonly LineupSlot[] = ['D1_RD', 'D2_RD', 'D3_RD'];
export const GOALIE_SLOTS: readonly LineupSlot[] = ['G_STARTER', 'G_BACKUP'];

export function isLineupSlot(value: string): value is LineupSlot {
  return (LINEUP_SLOTS as readonly string[]).includes(value);
}

export function isSkaterPosition(value: string): value is Exclude<LineupPosition, 'G'> {
  return (SKATER_POSITIONS as readonly string[]).includes(value);
}

export function slotGroup(slot: LineupSlot): 'FORWARD' | 'DEFENSE' | 'GOALIE' {
  if (slot.startsWith('G_')) return 'GOALIE';
  if (slot.startsWith('D')) return 'DEFENSE';
  return 'FORWARD';
}
