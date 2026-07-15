import { sortJsonValue } from '../balance/canonicalize.js';
import { stableDigest } from '../simulation/batch/hash.js';
import type { PlayerTruth, ScoutingObservation, ScoutingReport } from './types.js';

export function stableScoutingHash(value: unknown): string {
  return stableDigest(JSON.stringify(sortJsonValue(value)));
}

export function hashPlayerState(player: PlayerTruth): string {
  return player.stateHash ?? stableScoutingHash({
    playerId: player.playerId,
    kind: player.kind,
    position: player.position,
    attributes: player.attributes,
    currentAbility: player.currentAbility,
    potential: player.potential,
    role: player.role,
  });
}

export function hashObservation(observation: Omit<ScoutingObservation, 'observationId'>): string {
  return stableScoutingHash(observation);
}

export function hashReport(report: Omit<ScoutingReport, 'reportHash'>): string {
  return stableScoutingHash(report);
}
