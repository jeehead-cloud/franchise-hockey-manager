import { stableDigest } from '../simulation/batch/hash.js';
import { rankEligibleCandidates } from './candidate-ranking.js';
import {
  defaultRosterRoleForPosition,
  type NationalTeamEligibilityRules,
  type NationalTeamPlayerInput,
  type SuggestedRosterPlayer,
  type SuggestedRosterResult,
} from './types.js';

function digest(payload: unknown): string {
  return stableDigest(JSON.stringify(payload));
}

/**
 * Deterministic suggested tournament roster.
 * Fills goalies → defense → forwards to targets, then reserves within max.
 */
export function suggestNationalTeamRoster(input: {
  players: NationalTeamPlayerInput[];
  countryId: string;
  rules: NationalTeamEligibilityRules;
  targetRosterSize?: number;
}): SuggestedRosterResult {
  const limits = input.rules.rosterLimits;
  const targetSize = Math.min(
    limits.maximumPlayers,
    Math.max(
      limits.minimumPlayers,
      input.targetRosterSize ??
        limits.targetForwards + limits.targetDefensemen + limits.targetGoalies,
    ),
  );

  const ranked = rankEligibleCandidates(input);
  const byId = new Map(input.players.map((p) => [p.playerId, p]));
  const goalies = ranked.filter((c) => c.positionGroup === 'GOALIE');
  const defense = ranked.filter((c) => c.positionGroup === 'DEFENSE');
  const forwards = ranked.filter((c) => c.positionGroup === 'FORWARD');

  const selected: SuggestedRosterPlayer[] = [];
  const used = new Set<string>();
  const warnings: string[] = [];
  const excludedTop: Array<{ playerId: string; reason: string }> = [];

  const take = (
    pool: typeof ranked,
    count: number,
    role: SuggestedRosterPlayer['rosterRole'],
  ) => {
    let orderBase = selected.filter((p) => p.rosterRole === role).length;
    for (const c of pool) {
      if (selected.length >= targetSize) break;
      if (used.has(c.playerId)) continue;
      if (count <= 0) break;
      orderBase += 1;
      selected.push({
        playerId: c.playerId,
        rosterRole: role,
        rosterOrder: orderBase,
        selectionSource: 'SUGGESTED',
      });
      used.add(c.playerId);
      count -= 1;
    }
  };

  take(goalies, Math.min(limits.targetGoalies, limits.maximumGoalies), 'GOALIE');
  take(defense, limits.targetDefensemen, 'DEFENSE');
  take(forwards, limits.targetForwards, 'FORWARD');

  // Top up to target with remaining best skaters / goalies under max goalies
  for (const c of ranked) {
    if (selected.length >= targetSize) break;
    if (used.has(c.playerId)) continue;
    const player = byId.get(c.playerId)!;
    const role = defaultRosterRoleForPosition(player.position);
    if (role === 'GOALIE') {
      const gCount = selected.filter((p) => p.rosterRole === 'GOALIE').length;
      if (gCount >= limits.maximumGoalies) continue;
    }
    const order =
      selected.filter((p) => p.rosterRole === role).length + 1;
    selected.push({
      playerId: c.playerId,
      rosterRole: role,
      rosterOrder: order,
      selectionSource: 'SUGGESTED',
    });
    used.add(c.playerId);
  }

  // Reserves: remaining eligible up to maximumPlayers (optional padding)
  let reserveOrder = 0;
  for (const c of ranked) {
    if (selected.length >= limits.maximumPlayers) break;
    if (used.has(c.playerId)) continue;
    if (selected.length >= targetSize) {
      reserveOrder += 1;
      selected.push({
        playerId: c.playerId,
        rosterRole: 'RESERVE',
        rosterOrder: reserveOrder,
        selectionSource: 'SUGGESTED',
      });
      used.add(c.playerId);
    }
  }

  const forwardCount = selected.filter((p) => p.rosterRole === 'FORWARD').length;
  const defenseCount = selected.filter((p) => p.rosterRole === 'DEFENSE').length;
  const goalieCount = selected.filter((p) => p.rosterRole === 'GOALIE').length;
  const reserveCount = selected.filter((p) => p.rosterRole === 'RESERVE').length;

  if (goalieCount < limits.minimumGoalies) {
    warnings.push(`Only ${goalieCount} goalies available (minimum ${limits.minimumGoalies})`);
  }
  if (defenseCount < limits.minimumDefensemen) {
    warnings.push(
      `Only ${defenseCount} defensemen available (minimum ${limits.minimumDefensemen})`,
    );
  }
  if (forwardCount < limits.minimumForwards) {
    warnings.push(`Only ${forwardCount} forwards available (minimum ${limits.minimumForwards})`);
  }
  if (selected.length < limits.minimumPlayers) {
    warnings.push(
      `Suggested roster size ${selected.length} below minimum ${limits.minimumPlayers}`,
    );
  }

  for (const c of ranked.slice(0, 8)) {
    if (!used.has(c.playerId)) {
      excludedTop.push({
        playerId: c.playerId,
        reason: 'Not selected after position targets filled',
      });
    }
  }

  const rosterHash = digest({
    players: selected.map((p) => ({
      playerId: p.playerId,
      rosterRole: p.rosterRole,
      rosterOrder: p.rosterOrder,
    })),
    targetSize,
    countryId: input.countryId,
    category: input.rules.category,
  });

  return {
    players: selected,
    eligibleCount: ranked.length,
    selectedCount: selected.length,
    forwardCount,
    defenseCount,
    goalieCount,
    reserveCount,
    warnings,
    rosterHash,
    excludedTopCandidates: excludedTop,
  };
}
