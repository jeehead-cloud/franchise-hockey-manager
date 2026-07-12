/** Stable F11 technical match engine version. */
export const FHM_ENGINE_VERSION = 'f11.1' as const;

export const F11_SIMULATION_MODE = 'F11_TECHNICAL' as const;

export const REGULATION_PERIODS = 3 as const;
export const PERIOD_DURATION_SECONDS = 1200 as const;

export const FORBIDDEN_F11_EVENT_TYPES = [
  'SHOT',
  'SHOT_BLOCKED',
  'SHOT_MISSED',
  'SAVE',
  'GOAL',
  'PENALTY',
  'OVERTIME_START',
  'SHOOTOUT_ATTEMPT',
  'GAME_END',
] as const;
