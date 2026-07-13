import type { LabSideMode } from './types.js';

/** Deterministic per-game seed: `<baseSeed>:game:<index>` */
export function deriveGameSeed(baseSeed: string, gameIndex: number): string {
  if (!Number.isInteger(gameIndex) || gameIndex < 0) {
    throw new Error(`gameIndex must be a non-negative integer (got ${gameIndex})`);
  }
  return `${baseSeed}:game:${gameIndex}`;
}

export function deriveGameSeeds(baseSeed: string, count: number): string[] {
  return Array.from({ length: count }, (_, i) => deriveGameSeed(baseSeed, i));
}

export interface SideOrientation {
  homeTeamId: string;
  awayTeamId: string;
  teamAWasHome: boolean;
}

/**
 * FIXED: Team A always home.
 * ALTERNATE: even index → Team A home; odd → Team B home.
 */
export function resolveSideOrientation(
  sideMode: LabSideMode,
  gameIndex: number,
  teamAId: string,
  teamBId: string,
): SideOrientation {
  const teamAWasHome =
    sideMode === 'FIXED' ? true : gameIndex % 2 === 0;
  return teamAWasHome
    ? { homeTeamId: teamAId, awayTeamId: teamBId, teamAWasHome: true }
    : { homeTeamId: teamBId, awayTeamId: teamAId, teamAWasHome: false };
}
