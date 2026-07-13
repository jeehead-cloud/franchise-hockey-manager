import { describe, expect, it } from 'vitest';
import {
  ageOnCutoffDate,
  defaultEligibilityRules,
  evaluateNationalTeamReadiness,
  evaluatePlayerEligibility,
  generateNationalTeamLineup,
  hashEligibilityRules,
  hashRosterPlayers,
  parseEligibilityRules,
  rankEligibleCandidates,
  suggestNationalTeamRoster,
  validateNationalTeamRoster,
  type NationalTeamPlayerInput,
  type RosterPlayerInput,
} from './index.js';

function player(
  id: string,
  opts: Partial<NationalTeamPlayerInput> & { position: string; country: string },
): NationalTeamPlayerInput {
  return {
    playerId: id,
    displayName: id,
    birthDate: opts.birthDate ?? '2000-01-01',
    primaryNationalityCountryId: opts.country,
    citizenshipCountryIds: opts.citizenshipCountryIds ?? [],
    birthCountryId: opts.birthCountryId ?? null,
    position: opts.position,
    shoots: opts.shoots ?? 'L',
    currentAbility: opts.currentAbility ?? 12,
    effectivePerformance: opts.effectivePerformance ?? 12,
    clubTeamId: opts.clubTeamId ?? 'club-1',
    clubTeamName: opts.clubTeamName ?? 'Club',
    injuryStatus: opts.injuryStatus ?? 'HEALTHY',
    activeStatus: opts.activeStatus ?? 'ACTIVE',
  };
}

describe('F22 national teams engine', () => {
  it('validates eligibility rules and rejects unknown fields', () => {
    const rules = defaultEligibilityRules('SENIOR_MEN');
    expect(rules.category).toBe('SENIOR_MEN');
    expect(() => parseEligibilityRules({ ...rules, foo: 1 })).toThrow(/Unknown/);
    expect(hashEligibilityRules(rules)).toBe(hashEligibilityRules(rules));
  });

  it('evaluates senior nationality eligibility', () => {
    const rules = defaultEligibilityRules('SENIOR_MEN');
    const ok = evaluatePlayerEligibility({
      player: player('p1', { position: 'C', country: 'c1' }),
      countryId: 'c1',
      rules,
    });
    expect(ok.status).toBe('ELIGIBLE');
    const bad = evaluatePlayerEligibility({
      player: player('p2', { position: 'C', country: 'c2' }),
      countryId: 'c1',
      rules,
    });
    expect(bad.status).toBe('INELIGIBLE');
  });

  it('applies U20 cutoff date boundaries', () => {
    const rules = defaultEligibilityRules('JUNIOR_U20', {
      ageRule: { mode: 'MAX_AGE_ON_DATE', maxAge: 19, cutoffDate: '2026-12-31' },
    });
    expect(ageOnCutoffDate('2007-01-01', '2026-12-31')).toBe(19);
    const eligible = evaluatePlayerEligibility({
      player: player('u1', { position: 'C', country: 'c1', birthDate: '2007-01-01' }),
      countryId: 'c1',
      rules,
    });
    expect(eligible.status).toBe('ELIGIBLE');
    const over = evaluatePlayerEligibility({
      player: player('u2', { position: 'C', country: 'c1', birthDate: '2006-12-31' }),
      countryId: 'c1',
      rules,
    });
    // age on 2026-12-31: born 2006-12-31 → exactly 20
    expect(over.status).toBe('INELIGIBLE');
  });

  it('ranks candidates deterministically without potential', () => {
    const rules = defaultEligibilityRules('SENIOR_MEN');
    const players = [
      player('a', { position: 'C', country: 'c1', effectivePerformance: 10 }),
      player('b', { position: 'C', country: 'c1', effectivePerformance: 14 }),
      player('c', { position: 'C', country: 'c1', effectivePerformance: 14 }),
    ];
    const r1 = rankEligibleCandidates({ players, countryId: 'c1', rules });
    const r2 = rankEligibleCandidates({ players, countryId: 'c1', rules });
    expect(r1.map((x) => x.playerId)).toEqual(r2.map((x) => x.playerId));
    expect(r1[0]?.playerId).toBe('b');
  });

  it('suggests a position-balanced roster', () => {
    const rules = defaultEligibilityRules('SENIOR_MEN');
    const players: NationalTeamPlayerInput[] = [];
    for (let i = 0; i < 16; i += 1) {
      players.push(
        player(`f${i}`, {
          position: i % 3 === 0 ? 'C' : i % 3 === 1 ? 'LW' : 'RW',
          country: 'c1',
          effectivePerformance: 10 + (i % 5),
        }),
      );
    }
    for (let i = 0; i < 8; i += 1) {
      players.push(
        player(`d${i}`, {
          position: i % 2 === 0 ? 'LD' : 'RD',
          country: 'c1',
          effectivePerformance: 11,
        }),
      );
    }
    for (let i = 0; i < 3; i += 1) {
      players.push(
        player(`g${i}`, { position: 'G', country: 'c1', effectivePerformance: 12 - i }),
      );
    }
    const s1 = suggestNationalTeamRoster({ players, countryId: 'c1', rules, targetRosterSize: 23 });
    const s2 = suggestNationalTeamRoster({ players, countryId: 'c1', rules, targetRosterSize: 23 });
    expect(s1.rosterHash).toBe(s2.rosterHash);
    expect(s1.goalieCount).toBeGreaterThanOrEqual(2);
    expect(s1.forwardCount).toBeGreaterThanOrEqual(12);
    expect(s1.defenseCount).toBeGreaterThanOrEqual(6);
  });

  it('validates roster rules and cross-team conflicts', () => {
    const rules = defaultEligibilityRules('SENIOR_MEN');
    const players = new Map<string, NationalTeamPlayerInput>();
    const roster: RosterPlayerInput[] = [];
    for (let i = 0; i < 13; i += 1) {
      const id = `f${i}`;
      players.set(id, player(id, { position: 'C', country: 'c1' }));
      roster.push({
        playerId: id,
        positionSnapshot: 'C',
        rosterRole: 'FORWARD',
        rosterOrder: i + 1,
        jerseyNumber: i + 1,
        captainRole: i === 0 ? 'CAPTAIN' : 'NONE',
        selectionSource: 'SUGGESTED',
      });
    }
    for (let i = 0; i < 7; i += 1) {
      const id = `d${i}`;
      players.set(id, player(id, { position: 'LD', country: 'c1' }));
      roster.push({
        playerId: id,
        positionSnapshot: 'LD',
        rosterRole: 'DEFENSE',
        rosterOrder: i + 1,
        jerseyNumber: 20 + i,
        captainRole: 'NONE',
        selectionSource: 'SUGGESTED',
      });
    }
    for (let i = 0; i < 3; i += 1) {
      const id = `g${i}`;
      players.set(id, player(id, { position: 'G', country: 'c1' }));
      roster.push({
        playerId: id,
        positionSnapshot: 'G',
        rosterRole: 'GOALIE',
        rosterOrder: i + 1,
        jerseyNumber: 30 + i,
        captainRole: 'NONE',
        selectionSource: 'SUGGESTED',
      });
    }
    const ok = validateNationalTeamRoster({
      roster,
      playersById: players,
      countryId: 'c1',
      rules,
    });
    expect(ok.ok).toBe(true);
    expect(hashRosterPlayers(roster)).toBe(hashRosterPlayers(roster));

    const conflict = validateNationalTeamRoster({
      roster,
      playersById: players,
      countryId: 'c1',
      rules,
      otherEditionSelectedPlayerIds: new Set(['f0']),
    });
    expect(conflict.ok).toBe(false);
    expect(conflict.issues.some((i) => i.code === 'CROSS_TEAM')).toBe(true);
  });

  it('generates lineup and readiness', () => {
    const roster: RosterPlayerInput[] = [];
    for (let i = 0; i < 12; i += 1) {
      roster.push({
        playerId: `f${i}`,
        positionSnapshot: 'C',
        rosterRole: 'FORWARD',
        rosterOrder: i + 1,
        jerseyNumber: null,
        captainRole: 'NONE',
        selectionSource: 'SUGGESTED',
      });
    }
    for (let i = 0; i < 6; i += 1) {
      roster.push({
        playerId: `d${i}`,
        positionSnapshot: 'LD',
        rosterRole: 'DEFENSE',
        rosterOrder: i + 1,
        jerseyNumber: null,
        captainRole: 'NONE',
        selectionSource: 'SUGGESTED',
      });
    }
    for (let i = 0; i < 2; i += 1) {
      roster.push({
        playerId: `g${i}`,
        positionSnapshot: 'G',
        rosterRole: 'GOALIE',
        rosterOrder: i + 1,
        jerseyNumber: null,
        captainRole: 'NONE',
        selectionSource: 'SUGGESTED',
      });
    }
    const lineup = generateNationalTeamLineup({ roster });
    expect(lineup.slots.some((s) => s.slotType === 'STARTER')).toBe(true);
    const ready = evaluateNationalTeamReadiness({
      hasProfile: true,
      hasCompetitionParticipant: true,
      isInternationalCompetition: true,
      hasEligibilitySnapshot: true,
      candidatePoolGenerated: true,
      rosterConfirmed: true,
      rosterSize: 20,
      minimumPlayers: 20,
      maximumPlayers: 25,
      forwardCount: 12,
      minimumForwards: 12,
      defenseCount: 6,
      minimumDefensemen: 6,
      goalieCount: 2,
      minimumGoalies: 2,
      hasCrossTeamDuplicate: false,
      hasHeadCoach: true,
      hasValidTactics: true,
      hasLineup: true,
      primarySlotsFilled: true,
      hasStarterAndBackupGoalie: true,
      rosterHashMatchesLineup: true,
      editionArchived: false,
      hasIneligibleRosterPlayer: false,
      status: 'READY',
      reserveCount: 0,
      weakGoalieDepth: true,
    });
    expect(ready.status).toBe('WARNING');
    expect(ready.blockers).toHaveLength(0);
  });
});
