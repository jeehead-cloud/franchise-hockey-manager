export {
  PENALTY_INFRACTIONS,
  type PenaltyInfraction,
} from '../../balance/types.js';

export type GoalStrength = 'EVEN_STRENGTH' | 'POWER_PLAY' | 'SHORT_HANDED';

export type PenaltyEndReason =
  | 'EXPIRED'
  | 'POWER_PLAY_GOAL'
  | 'REGULATION_END';

export const SUPPORTED_STRENGTH_STATES = [
  'EVEN_5V5',
  'EVEN_3V3',
  'HOME_POWER_PLAY_5V4',
  'AWAY_POWER_PLAY_5V4',
] as const;
