import { evaluatePlayerEligibility } from './eligibility.js';
import {
  positionGroupFromPosition,
  type NationalTeamEligibilityRules,
  type NationalTeamPlayerInput,
  type RosterPlayerInput,
  type RosterValidationIssue,
} from './types.js';

export function validateNationalTeamRoster(input: {
  roster: RosterPlayerInput[];
  playersById: Map<string, NationalTeamPlayerInput>;
  countryId: string;
  rules: NationalTeamEligibilityRules;
  /** Player IDs already confirmed on other national teams in the same edition. */
  otherEditionSelectedPlayerIds?: Set<string>;
}): { ok: boolean; issues: RosterValidationIssue[] } {
  const issues: RosterValidationIssue[] = [];
  const limits = input.rules.rosterLimits;
  const roster = input.roster;
  const ids = roster.map((p) => p.playerId);
  const unique = new Set(ids);
  if (unique.size !== ids.length) {
    issues.push({ code: 'DUPLICATE_PLAYER', message: 'Roster contains duplicate players' });
  }

  if (roster.length < limits.minimumPlayers) {
    issues.push({
      code: 'TOO_FEW',
      message: `Roster has ${roster.length} players; minimum is ${limits.minimumPlayers}`,
    });
  }
  if (roster.length > limits.maximumPlayers) {
    issues.push({
      code: 'TOO_MANY',
      message: `Roster has ${roster.length} players; maximum is ${limits.maximumPlayers}`,
    });
  }

  const active = roster.filter((p) => p.rosterRole !== 'RESERVE');
  const forwards = active.filter((p) => p.rosterRole === 'FORWARD');
  const defense = active.filter((p) => p.rosterRole === 'DEFENSE');
  const goalies = active.filter((p) => p.rosterRole === 'GOALIE');

  if (forwards.length < limits.minimumForwards) {
    issues.push({
      code: 'FORWARD_MIN',
      message: `Need at least ${limits.minimumForwards} forwards`,
    });
  }
  if (defense.length < limits.minimumDefensemen) {
    issues.push({
      code: 'DEFENSE_MIN',
      message: `Need at least ${limits.minimumDefensemen} defensemen`,
    });
  }
  if (goalies.length < limits.minimumGoalies) {
    issues.push({
      code: 'GOALIE_MIN',
      message: `Need at least ${limits.minimumGoalies} goalies`,
    });
  }
  if (goalies.length > limits.maximumGoalies) {
    issues.push({
      code: 'GOALIE_MAX',
      message: `At most ${limits.maximumGoalies} goalies allowed`,
    });
  }

  const captains = roster.filter((p) => p.captainRole === 'CAPTAIN');
  if (captains.length > 1) {
    issues.push({ code: 'CAPTAIN', message: 'Only one captain is allowed' });
  }
  const alts = roster.filter((p) => p.captainRole === 'ALTERNATE');
  if (alts.length > limits.maximumAlternateCaptains) {
    issues.push({
      code: 'ALTERNATES',
      message: `At most ${limits.maximumAlternateCaptains} alternate captains`,
    });
  }

  const jerseys = new Map<number, string>();
  for (const p of roster) {
    if (p.jerseyNumber == null) continue;
    if (p.jerseyNumber < 1 || p.jerseyNumber > 99) {
      issues.push({
        code: 'JERSEY',
        message: `Invalid jersey number ${p.jerseyNumber} for ${p.playerId}`,
      });
    }
    const prev = jerseys.get(p.jerseyNumber);
    if (prev) {
      issues.push({
        code: 'JERSEY_DUP',
        message: `Jersey ${p.jerseyNumber} used by multiple players`,
      });
    }
    jerseys.set(p.jerseyNumber, p.playerId);
  }

  for (const p of roster) {
    const player = input.playersById.get(p.playerId);
    if (!player) {
      issues.push({ code: 'UNKNOWN_PLAYER', message: `Unknown player ${p.playerId}` });
      continue;
    }
    const evalResult = evaluatePlayerEligibility({
      player,
      countryId: input.countryId,
      rules: input.rules,
    });
    if (evalResult.status !== 'ELIGIBLE') {
      issues.push({
        code: 'INELIGIBLE',
        message: `${player.displayName}: ${evalResult.reasons[0] ?? 'ineligible'}`,
      });
    }
    if (p.rosterRole !== 'RESERVE') {
      const group = positionGroupFromPosition(player.position);
      if (p.rosterRole === 'GOALIE' && group !== 'GOALIE') {
        issues.push({
          code: 'ROLE_POSITION',
          message: `${player.displayName} cannot be rostered as GOALIE`,
        });
      }
      if (p.rosterRole === 'DEFENSE' && group !== 'DEFENSE') {
        issues.push({
          code: 'ROLE_POSITION',
          message: `${player.displayName} cannot be rostered as DEFENSE`,
        });
      }
      if (p.rosterRole === 'FORWARD' && group !== 'FORWARD') {
        issues.push({
          code: 'ROLE_POSITION',
          message: `${player.displayName} cannot be rostered as FORWARD`,
        });
      }
    }
    if (input.otherEditionSelectedPlayerIds?.has(p.playerId)) {
      issues.push({
        code: 'CROSS_TEAM',
        message: `${player.displayName} is already selected for another national team in this edition`,
      });
    }
  }

  return { ok: issues.length === 0, issues };
}
