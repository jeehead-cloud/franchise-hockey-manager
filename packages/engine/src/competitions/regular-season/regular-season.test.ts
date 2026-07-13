import { describe, expect, it } from 'vitest';
import {
  computeStandings,
  defaultPointsRules,
  defaultRegularSeasonConfig,
  deriveMatchSimulationSeed,
  generateRegularSeasonSchedule,
  parseRegularSeasonConfig,
  reconcileStandingsBasics,
} from '../index.js';

describe('F18 regular-season schedule', () => {
  it('generates deterministic round-robin for 3 teams', () => {
    const ids = ['p-c', 'p-a', 'p-b'];
    const config = defaultRegularSeasonConfig({ scheduleFormat: 'ROUND_ROBIN', qualifiersCount: 2 });
    const a = generateRegularSeasonSchedule({ participantIds: ids, config, seed: 's1' });
    const b = generateRegularSeasonSchedule({ participantIds: [...ids].reverse(), config, seed: 's1' });
    expect(a.scheduleHash).toBe(b.scheduleHash);
    expect(a.matches).toHaveLength(3);
    expect(a.diagnostics.totalMatches).toBe(3);
    for (const m of a.matches) {
      expect(m.homeParticipantId).not.toBe(m.awayParticipantId);
    }
  });

  it('generates double round-robin with rematches', () => {
    const config = defaultRegularSeasonConfig({
      scheduleFormat: 'DOUBLE_ROUND_ROBIN',
      qualifiersCount: 2,
    });
    const schedule = generateRegularSeasonSchedule({
      participantIds: ['t1', 't2', 't3'],
      config,
      seed: 'dbl',
    });
    expect(schedule.matches).toHaveLength(6);
    for (const id of ['t1', 't2', 't3']) {
      expect(schedule.diagnostics.gamesPerTeam[id]).toBe(4);
    }
  });

  it('changes hash with different seed', () => {
    const config = defaultRegularSeasonConfig();
    const a = generateRegularSeasonSchedule({
      participantIds: ['a', 'b', 'c', 'd'],
      config,
      seed: 'one',
    });
    const b = generateRegularSeasonSchedule({
      participantIds: ['a', 'b', 'c', 'd'],
      config,
      seed: 'two',
    });
    // Home assignment may differ; hash includes seed so always differs
    expect(a.scheduleHash).not.toBe(b.scheduleHash);
  });

  it('parses legacy stage config', () => {
    const cfg = parseRegularSeasonConfig({ gamesPerTeam: 2, qualifiersCount: 2 });
    expect(cfg.scheduleFormat).toBe('BALANCED_CUSTOM');
    expect(cfg.gamesPerTeam).toBe(2);
  });

  it('derives match seeds stably', () => {
    expect(deriveMatchSimulationSeed('base', 'hash', 3)).toBe('base:hash:match:3');
  });
});

describe('F18 standings', () => {
  it('awards points by decision type and ranks deterministically', () => {
    const points = defaultPointsRules();
    const participants = [
      { participantId: 'p1', teamId: 't1', teamNameSnapshot: 'A' },
      { participantId: 'p2', teamId: 't2', teamNameSnapshot: 'B' },
      { participantId: 'p3', teamId: 't3', teamNameSnapshot: 'C' },
    ];
    const matches = [
      {
        scheduleOrder: 1,
        homeParticipantId: 'p1',
        awayParticipantId: 'p2',
        homeTeamId: 't1',
        awayTeamId: 't2',
        homeScore: 3,
        awayScore: 1,
        homeRegulationScore: 3,
        awayRegulationScore: 1,
        decisionType: 'REGULATION' as const,
        winnerParticipantId: 'p1',
      },
      {
        scheduleOrder: 2,
        homeParticipantId: 'p2',
        awayParticipantId: 'p3',
        homeTeamId: 't2',
        awayTeamId: 't3',
        homeScore: 2,
        awayScore: 1,
        homeRegulationScore: 1,
        awayRegulationScore: 1,
        decisionType: 'OVERTIME' as const,
        winnerParticipantId: 'p2',
      },
    ];
    const standings = computeStandings({
      participants,
      matches,
      pointsRules: points,
      tiebreakers: ['POINTS', 'REGULATION_WINS', 'TOTAL_WINS', 'GOAL_DIFFERENCE', 'GOALS_FOR'],
      qualifiersCount: 2,
      scheduledMatchCount: 3,
      standingsSeed: 'seed',
      provisional: true,
    });
    expect(standings.rows[0]!.participantId).toBe('p1');
    expect(standings.rows[0]!.points).toBe(2);
    expect(standings.rows[1]!.participantId).toBe('p2');
    // p2: regulation loss 0 + OTW 2 = 2. p3: OTL 1.
    expect(standings.rows[1]!.points).toBe(2);
    expect(standings.rows.find((r) => r.participantId === 'p2')!.points).toBe(2);
    expect(standings.rows.find((r) => r.participantId === 'p3')!.points).toBe(1);
    expect(standings.qualificationParticipantIds).toHaveLength(2);
    const errs = reconcileStandingsBasics({
      standings,
      completedMatches: 2,
    });
    expect(errs).toEqual([]);
  });
});
