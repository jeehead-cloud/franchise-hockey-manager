import type { ActivePenalty, PossessionSide, StrengthState } from './types.js';

export function strengthFromActivePenalty(penalty: ActivePenalty | null): StrengthState {
  if (!penalty) return 'EVEN_5V5';
  return penalty.advantagedSide === 'HOME' ? 'HOME_POWER_PLAY_5V4' : 'AWAY_POWER_PLAY_5V4';
}

export function isPowerPlayForSide(strength: StrengthState, side: PossessionSide): boolean {
  if (side === 'NONE') return false;
  if (strength === 'HOME_POWER_PLAY_5V4') return side === 'HOME';
  if (strength === 'AWAY_POWER_PLAY_5V4') return side === 'AWAY';
  return false;
}

export function isShortHandedForSide(strength: StrengthState, side: PossessionSide): boolean {
  if (side === 'NONE') return false;
  if (strength === 'HOME_POWER_PLAY_5V4') return side === 'AWAY';
  if (strength === 'AWAY_POWER_PLAY_5V4') return side === 'HOME';
  return false;
}

export function advantagedSideFromStrength(strength: StrengthState): 'HOME' | 'AWAY' | null {
  if (strength === 'HOME_POWER_PLAY_5V4') return 'HOME';
  if (strength === 'AWAY_POWER_PLAY_5V4') return 'AWAY';
  return null;
}

export function formatStrengthLabel(strength: StrengthState): string {
  switch (strength) {
    case 'HOME_POWER_PLAY_5V4':
      return 'Home PP 5v4';
    case 'AWAY_POWER_PLAY_5V4':
      return 'Away PP 5v4';
    default:
      return '5v5';
  }
}
