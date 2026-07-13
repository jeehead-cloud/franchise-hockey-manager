import { positionGroupFromPosition, type LineupSlotInput, type RosterPlayerInput } from './types.js';

/**
 * Deterministic national-team auto-lineup from confirmed roster.
 * Builds 4 F lines, 3 D pairs, starter/backup(/third) goalies, simple PP/PK.
 */
export function generateNationalTeamLineup(input: {
  roster: RosterPlayerInput[];
  /** Optional ability map for ordering; defaults to rosterOrder. */
  abilityByPlayerId?: Map<string, number>;
}): { slots: LineupSlotInput[]; warnings: string[] } {
  const warnings: string[] = [];
  const ability = (id: string, fallback: number) =>
    input.abilityByPlayerId?.get(id) ?? fallback;

  const forwards = input.roster
    .filter((p) => p.rosterRole === 'FORWARD')
    .sort(
      (a, b) =>
        ability(b.playerId, -b.rosterOrder) - ability(a.playerId, -a.rosterOrder) ||
        a.playerId.localeCompare(b.playerId),
    );
  const defense = input.roster
    .filter((p) => p.rosterRole === 'DEFENSE')
    .sort(
      (a, b) =>
        ability(b.playerId, -b.rosterOrder) - ability(a.playerId, -a.rosterOrder) ||
        a.playerId.localeCompare(b.playerId),
    );
  const goalies = input.roster
    .filter((p) => p.rosterRole === 'GOALIE')
    .sort(
      (a, b) =>
        ability(b.playerId, -b.rosterOrder) - ability(a.playerId, -a.rosterOrder) ||
        a.playerId.localeCompare(b.playerId),
    );

  const slots: LineupSlotInput[] = [];
  const used = new Set<string>();

  for (let line = 1; line <= 4; line += 1) {
    const slice = forwards.slice((line - 1) * 3, line * 3);
    const types = ['LW', 'C', 'RW'] as const;
    for (let i = 0; i < 3; i += 1) {
      const player = slice[i];
      if (!player) {
        warnings.push(`Forward line ${line} slot ${types[i]} empty`);
        continue;
      }
      used.add(player.playerId);
      slots.push({
        unitType: 'FORWARD_LINE',
        unitNumber: line,
        slotType: types[i]!,
        playerId: player.playerId,
        slotOrder: i + 1,
      });
    }
  }

  for (let pair = 1; pair <= 3; pair += 1) {
    const slice = defense.slice((pair - 1) * 2, pair * 2);
    const types = ['LD', 'RD'] as const;
    for (let i = 0; i < 2; i += 1) {
      const player = slice[i];
      if (!player) {
        warnings.push(`Defense pair ${pair} slot ${types[i]} empty`);
        continue;
      }
      used.add(player.playerId);
      slots.push({
        unitType: 'DEFENSE_PAIR',
        unitNumber: pair,
        slotType: types[i]!,
        playerId: player.playerId,
        slotOrder: i + 1,
      });
    }
  }

  const gRoles = ['STARTER', 'BACKUP', 'THIRD'] as const;
  for (let i = 0; i < Math.min(3, goalies.length); i += 1) {
    const g = goalies[i]!;
    used.add(g.playerId);
    slots.push({
      unitType: 'GOALIE',
      unitNumber: 1,
      slotType: gRoles[i]!,
      playerId: g.playerId,
      slotOrder: i + 1,
    });
  }
  if (goalies.length < 2) warnings.push('Need starter and backup goalies');

  // PP1 / PK1 from top skaters
  const ppPool = [...forwards.slice(0, 3), ...defense.slice(0, 2)];
  ppPool.forEach((p, i) => {
    slots.push({
      unitType: 'PP',
      unitNumber: 1,
      slotType: i < 3 ? (`F${i + 1}` as 'F1' | 'F2' | 'F3') : i === 3 ? 'D1' : 'D2',
      playerId: p.playerId,
      slotOrder: i + 1,
    });
  });
  const pkPool = [...forwards.slice(0, 2), ...defense.slice(0, 2)];
  pkPool.forEach((p, i) => {
    slots.push({
      unitType: 'PK',
      unitNumber: 1,
      slotType: i < 2 ? (`F${i + 1}` as 'F1' | 'F2') : i === 2 ? 'D1' : 'D2',
      playerId: p.playerId,
      slotOrder: i + 1,
    });
  });

  return { slots, warnings };
}

export function validateNationalTeamLineup(input: {
  slots: LineupSlotInput[];
  rosterPlayerIds: Set<string>;
  roster: RosterPlayerInput[];
}): { ok: boolean; issues: string[] } {
  const issues: string[] = [];
  const primaryKeys = new Set<string>();
  for (const s of input.slots) {
    if (!input.rosterPlayerIds.has(s.playerId)) {
      issues.push(`Player ${s.playerId} is not on the confirmed roster`);
    }
    if (s.unitType === 'FORWARD_LINE' || s.unitType === 'DEFENSE_PAIR' || s.unitType === 'GOALIE') {
      const key = `${s.unitType}:${s.unitNumber}:${s.slotType}`;
      if (primaryKeys.has(key)) issues.push(`Duplicate slot ${key}`);
      primaryKeys.add(key);
    }
  }

  const evenStrength = input.slots.filter(
    (s) =>
      s.unitType === 'FORWARD_LINE' || s.unitType === 'DEFENSE_PAIR' || s.unitType === 'GOALIE',
  );
  const usedPrimary = new Set<string>();
  for (const s of evenStrength) {
    if (usedPrimary.has(s.playerId) && s.unitType !== 'GOALIE') {
      // allow same player only once across F/D primary units
      const prior = evenStrength.find(
        (x) => x.playerId === s.playerId && x !== s && x.unitType !== 'GOALIE',
      );
      if (prior && prior.unitType !== s.unitType) {
        issues.push(`Player ${s.playerId} appears in multiple primary units`);
      } else if (prior) {
        issues.push(`Player ${s.playerId} duplicated in primary slots`);
      }
    }
    usedPrimary.add(s.playerId);
  }

  const starters = input.slots.filter((s) => s.unitType === 'GOALIE' && s.slotType === 'STARTER');
  const backups = input.slots.filter((s) => s.unitType === 'GOALIE' && s.slotType === 'BACKUP');
  if (starters.length !== 1) issues.push('Exactly one starter goalie required');
  if (backups.length !== 1) issues.push('Exactly one backup goalie required');

  for (let line = 1; line <= 4; line += 1) {
    const count = input.slots.filter(
      (s) => s.unitType === 'FORWARD_LINE' && s.unitNumber === line,
    ).length;
    if (count < 3) issues.push(`Forward line ${line} incomplete`);
  }
  for (let pair = 1; pair <= 3; pair += 1) {
    const count = input.slots.filter(
      (s) => s.unitType === 'DEFENSE_PAIR' && s.unitNumber === pair,
    ).length;
    if (count < 2) issues.push(`Defense pair ${pair} incomplete`);
  }

  // Silence unused helper warning by referencing
  void positionGroupFromPosition;

  return { ok: issues.length === 0, issues };
}
