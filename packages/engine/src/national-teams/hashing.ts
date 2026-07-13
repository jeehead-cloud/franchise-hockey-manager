import { stableDigest } from '../simulation/batch/hash.js';
import type {
  LineupSlotInput,
  NationalTeamEligibilityRules,
  RosterPlayerInput,
} from './types.js';

/** Browser-safe deterministic digest (no node:crypto). */
function digest(payload: unknown): string {
  return stableDigest(JSON.stringify(payload));
}

export function hashEligibilityRules(rules: NationalTeamEligibilityRules): string {
  return digest({
    schemaVersion: rules.schemaVersion,
    category: rules.category,
    nationalityRule: rules.nationalityRule,
    ageRule: rules.ageRule,
    rosterLimits: rules.rosterLimits,
    selection: rules.selection,
  });
}

export function hashRosterPlayers(players: RosterPlayerInput[]): string {
  const normalized = [...players]
    .map((p) => ({
      playerId: p.playerId,
      rosterRole: p.rosterRole,
      rosterOrder: p.rosterOrder,
      jerseyNumber: p.jerseyNumber,
      captainRole: p.captainRole,
      selectionSource: p.selectionSource,
      positionSnapshot: p.positionSnapshot,
    }))
    .sort(
      (a, b) =>
        a.rosterRole.localeCompare(b.rosterRole) ||
        a.rosterOrder - b.rosterOrder ||
        a.playerId.localeCompare(b.playerId),
    );
  return digest(normalized);
}

export function hashLineupSlots(slots: LineupSlotInput[]): string {
  const normalized = [...slots]
    .map((s) => ({
      unitType: s.unitType,
      unitNumber: s.unitNumber,
      slotType: s.slotType,
      playerId: s.playerId,
      slotOrder: s.slotOrder,
    }))
    .sort(
      (a, b) =>
        a.unitType.localeCompare(b.unitType) ||
        a.unitNumber - b.unitNumber ||
        a.slotOrder - b.slotOrder ||
        a.playerId.localeCompare(b.playerId),
    );
  return digest(normalized);
}

export function hashCandidateInput(input: {
  countryId: string;
  rulesHash: string;
  playerIds: string[];
}): string {
  return digest({
    countryId: input.countryId,
    rulesHash: input.rulesHash,
    playerIds: [...input.playerIds].sort(),
  });
}
