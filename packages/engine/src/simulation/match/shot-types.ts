/**
 * Canonical F12 shot types for the match engine.
 * Kept in sync with balance `SHOT_TYPES` / `ShotType`.
 */
export const SHOT_TYPES = ['WRIST', 'SLAP', 'SNAP', 'BACKHAND', 'TIP', 'DEFLECTION'] as const;

export type ShotType = (typeof SHOT_TYPES)[number];
