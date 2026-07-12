/** Stable F13 special-teams match engine version. */
export const FHM_ENGINE_VERSION = 'f13.1' as const;

export const F13_SIMULATION_MODE = 'F13_SPECIAL_TEAMS' as const;

/** Legacy F12 scoring engine version (snapshots / migration only). */
export const F12_ENGINE_VERSION = 'f12.1' as const;

/** Legacy F12 simulation mode constant. */
export const F12_SIMULATION_MODE = 'F12_SCORING' as const;

/** Legacy F11 technical engine version. */
export const F11_ENGINE_VERSION = 'f11.1' as const;

/** Legacy F11 simulation mode constant. */
export const F11_SIMULATION_MODE = 'F11_TECHNICAL' as const;

export const SNAPSHOT_SCHEMA_VERSION = 3 as const;

export const REGULATION_PERIODS = 3 as const;
export const PERIOD_DURATION_SECONDS = 1200 as const;

export const MINOR_PENALTY_SECONDS = 120 as const;

/** Events deferred until F14+; PENALTY is allowed in F13. */
export const FORBIDDEN_F14_EVENT_TYPES = [
  'OVERTIME_START',
  'SHOOTOUT_ATTEMPT',
  'GAME_END',
] as const;

/** @deprecated Prefer FORBIDDEN_F14_EVENT_TYPES. */
export const FORBIDDEN_F13_EVENT_TYPES = FORBIDDEN_F14_EVENT_TYPES;

/** @deprecated Prefer FORBIDDEN_F14_EVENT_TYPES. */
export const FORBIDDEN_F11_EVENT_TYPES = FORBIDDEN_F14_EVENT_TYPES;

export const NET_FRONT_SHOT_ROLES = ['DEFLECTOR', 'SCREENER', 'GARBAGE_COLLECTOR'] as const;

export const NET_FRONT_POSITIONS = ['LW', 'C', 'RW'] as const;
