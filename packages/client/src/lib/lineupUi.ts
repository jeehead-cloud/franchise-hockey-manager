import {
  LINEUP_SLOTS,
  SLOT_REQUIRED_POSITION,
  positionFit,
  type LineupSlot,
  type PositionFit,
} from '@fhm/engine';
import type { LineupPresence, LineupPlayerRef, LineupValidationStatus } from './api';

export const ALL_LINEUP_SLOTS = LINEUP_SLOTS;

export const FORWARD_LINES: Array<{ label: string; slots: LineupSlot[] }> = [
  { label: 'Line 1', slots: ['F1_LW', 'F1_C', 'F1_RW'] },
  { label: 'Line 2', slots: ['F2_LW', 'F2_C', 'F2_RW'] },
  { label: 'Line 3', slots: ['F3_LW', 'F3_C', 'F3_RW'] },
  { label: 'Line 4', slots: ['F4_LW', 'F4_C', 'F4_RW'] },
];

export const DEFENSE_PAIRS: Array<{ label: string; slots: LineupSlot[] }> = [
  { label: 'Pair 1', slots: ['D1_LD', 'D1_RD'] },
  { label: 'Pair 2', slots: ['D2_LD', 'D2_RD'] },
  { label: 'Pair 3', slots: ['D3_LD', 'D3_RD'] },
];

export const GOALIE_SLOTS: Array<{ label: string; slot: LineupSlot }> = [
  { label: 'Starter', slot: 'G_STARTER' },
  { label: 'Backup', slot: 'G_BACKUP' },
];

export function slotShortLabel(slot: LineupSlot): string {
  return SLOT_REQUIRED_POSITION[slot];
}

export function slotDisplayLabel(slot: LineupSlot): string {
  if (slot === 'G_STARTER') return 'Starter';
  if (slot === 'G_BACKUP') return 'Backup';
  return slot.replace('_', ' ');
}

export function playerDisplayName(p: Pick<LineupPlayerRef, 'firstName' | 'lastName'>): string {
  return `${p.firstName} ${p.lastName}`;
}

export function presenceTone(presence: LineupPresence): 'neutral' | 'success' | 'warning' | 'danger' | 'info' {
  if (presence === 'VALID') return 'success';
  if (presence === 'INCOMPLETE') return 'warning';
  if (presence === 'INVALID') return 'danger';
  return 'neutral';
}

export function validationTone(
  status: LineupValidationStatus | null | undefined,
): 'neutral' | 'success' | 'warning' | 'danger' {
  if (status === 'VALID') return 'success';
  if (status === 'INCOMPLETE') return 'warning';
  if (status === 'INVALID') return 'danger';
  return 'neutral';
}

export function fitTone(fit: PositionFit | undefined): 'success' | 'warning' | 'danger' | 'neutral' {
  if (fit === 'PRIMARY') return 'success';
  if (fit === 'SECONDARY') return 'warning';
  if (fit === 'NONE') return 'danger';
  return 'neutral';
}

export function computeFit(
  player: Pick<LineupPlayerRef, 'primaryPosition' | 'secondaryPositions'>,
  slot: LineupSlot,
): PositionFit {
  return positionFit(
    {
      id: '',
      primaryPosition: player.primaryPosition as never,
      secondaryPositions: (player.secondaryPositions ?? []) as never,
      rosterStatus: 'ACTIVE',
      modelStatus: 'COMPLETE',
      currentAbility: null,
      role: null,
      roleRating: null,
    },
    slot,
  );
}

export function assignmentsEqual(
  a: Array<{ slot: string; playerId: string }>,
  b: Array<{ slot: string; playerId: string }>,
): boolean {
  const norm = (rows: Array<{ slot: string; playerId: string }>) =>
    [...rows]
      .map((r) => `${r.slot}:${r.playerId}`)
      .sort()
      .join('|');
  return norm(a) === norm(b);
}

export function secondaryLabel(secondary: string[] | undefined): string {
  if (!secondary || secondary.length === 0) return '';
  return secondary.join('/');
}
