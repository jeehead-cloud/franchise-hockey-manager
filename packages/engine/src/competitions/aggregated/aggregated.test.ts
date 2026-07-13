import { describe, expect, it } from 'vitest';
import {
  allocatePlayerStats,
  accumulateTeamStats,
  computeTeamStrength,
  DEFAULT_AGGREGATED_SEASON_CONFIG,
  generateAggregatedSchedule,
  hashAggregatedConfig,
  parseAggregatedSeasonConfig,
  reconcileAggregatedSeason,
  runAggregatedSeason,
  validateAggregatedSeasonConfig,
  type AggregatedRosterPlayer,
  type AggregatedTeamStrengthInput,
} from './index.js';

const POINTS = {
  regulationWin: 2,
  overtimeWin: 2,
  shootoutWin: 2,
  overtimeLoss: 1,
  shootoutLoss: 1,
  regulationLoss: 0,
  tie: 1,
};

function player(
  id: string,
  pos: string,
  ability: number,
  opts?: { isGoalie?: boolean },
): AggregatedRosterPlayer {
  return {
    playerId: id,
    firstName: id,
    lastName: pos,
    position: pos,
    isGoalie: opts?.isGoalie ?? pos === 'G',
    ability,
    offense: ability,
    defense: ability,
  };
}

function team(
  participantId: string,
  teamId: string,
  name: string,
  ability: number,
): AggregatedTeamStrengthInput {
  const skaters: AggregatedRosterPlayer[] = [];
  for (let i = 0; i < 12; i += 1) {
    const pos = i < 8 ? (['C', 'LW', 'RW'][i % 3] as string) : (['LD', 'RD'][i % 2] as string);
    skaters.push(player(`${teamId}-s${i}`, pos, ability - (i % 3)));
  }
  return {
    competitionParticipantId: participantId,
    teamId,
    teamNameSnapshot: name,
    players: [
      ...skaters,
      player(`${teamId}-g1`, 'G', ability, { isGoalie: true }),
      player(`${teamId}-g2`, 'G', ability - 2, { isGoalie: true }),
    ],
    chemistryModifier: 0,
    coachingModifier: 0,
  };
}

describe('F21 aggregated league', () => {
  it('validates config and rejects unknown fields', () => {
    expect(parseAggregatedSeasonConfig({})).toMatchObject({ simulationMode: 'AGGREGATED' });
    expect(() => validateAggregatedSeasonConfig({ simulationMode: 'AGGREGATED', foo: 1 })).toThrow(
      /Unknown/,
    );
    expect(() =>
      validateAggregatedSeasonConfig({
        simulationMode: 'AGGREGATED',
        scheduleFormat: 'BALANCED_CUSTOM',
      }),
    ).toThrow(/gamesPerTeam/);
  });

  it('computes deterministic strength with stronger roster higher', () => {
    const weak = computeTeamStrength(team('p1', 't1', 'Weak', 8));
    const strong = computeTeamStrength(team('p2', 't2', 'Strong', 16));
    expect(strong.overallStrength).toBeGreaterThan(weak.overallStrength);
    expect(computeTeamStrength(team('p1', 't1', 'Weak', 8)).rosterHash).toBe(weak.rosterHash);
  });

  it('rejects missing goalie', () => {
    const t = team('p1', 't1', 'NoG', 12);
    t.players = t.players.filter((p) => !p.isGoalie);
    expect(() => computeTeamStrength(t)).toThrow(/goalie/);
  });

  it('generates deterministic schedule without self-matches', () => {
    const ids = ['a', 'b', 'c', 'd'];
    const s1 = generateAggregatedSchedule({
      participantIds: ids,
      config: DEFAULT_AGGREGATED_SEASON_CONFIG,
      seed: 'sched',
    });
    const s2 = generateAggregatedSchedule({
      participantIds: [...ids].reverse(),
      config: DEFAULT_AGGREGATED_SEASON_CONFIG,
      seed: 'sched',
    });
    expect(s1.scheduleHash).toBe(s2.scheduleHash);
    expect(s1.matches.every((m) => m.homeParticipantId !== m.awayParticipantId)).toBe(true);
  });

  it('runs deterministic season with reconciles totals', () => {
    const teams = [
      team('p1', 't1', 'Alpha', 14),
      team('p2', 't2', 'Beta', 12),
      team('p3', 't3', 'Gamma', 11),
      team('p4', 't4', 'Delta', 10),
    ];
    const a = runAggregatedSeason({
      competitionEditionId: 'ed',
      competitionStageId: 'st',
      seed: 'season-1',
      teams,
      pointsRules: POINTS,
      tiebreakers: ['GOAL_DIFFERENCE', 'GOALS_FOR'],
      tiesAllowed: false,
    });
    const b = runAggregatedSeason({
      competitionEditionId: 'ed',
      competitionStageId: 'st',
      seed: 'season-1',
      teams,
      pointsRules: POINTS,
      tiebreakers: ['GOAL_DIFFERENCE', 'GOALS_FOR'],
      tiesAllowed: false,
    });
    expect(a.resultHash).toBe(b.resultHash);
    expect(a.inputHash).toBe(b.inputHash);
    expect(a.championParticipantId).toBeTruthy();
    expect(a.games.every((g) => g.homeScore >= 0 && g.awayScore >= 0)).toBe(true);

    const recon = reconcileAggregatedSeason({
      expectedScheduleKeys: a.games.map((g) => g.scheduleKey),
      games: a.games,
      teamStats: a.teamStats,
      playerStats: a.playerStats,
      participantCount: 4,
      championParticipantId: a.championParticipantId,
      rank1ParticipantId: a.championParticipantId,
    });
    expect(recon.ok).toBe(true);

    const gf = a.teamStats.reduce((s, t) => s + t.goals, 0);
    const ga = a.teamStats.reduce((s, t) => s + t.goalsAgainst, 0);
    expect(gf).toBe(ga);
  });

  it('changes result hash with different seed', () => {
    const teams = [
      team('p1', 't1', 'Alpha', 14),
      team('p2', 't2', 'Beta', 12),
      team('p3', 't3', 'Gamma', 11),
      team('p4', 't4', 'Delta', 10),
    ];
    const a = runAggregatedSeason({
      competitionEditionId: 'ed',
      competitionStageId: 'st',
      seed: 'a',
      teams,
      pointsRules: POINTS,
      tiebreakers: ['GOAL_DIFFERENCE'],
      tiesAllowed: false,
    });
    const b = runAggregatedSeason({
      competitionEditionId: 'ed',
      competitionStageId: 'st',
      seed: 'b',
      teams,
      pointsRules: POINTS,
      tiebreakers: ['GOAL_DIFFERENCE'],
      tiesAllowed: false,
    });
    expect(a.resultHash).not.toBe(b.resultHash);
  });

  it('config hash is stable', () => {
    expect(hashAggregatedConfig(DEFAULT_AGGREGATED_SEASON_CONFIG)).toBe(
      hashAggregatedConfig({ ...DEFAULT_AGGREGATED_SEASON_CONFIG }),
    );
  });

  it('allocates player goals exactly to team goals', () => {
    const strengths = [
      computeTeamStrength(team('p1', 't1', 'Alpha', 14)),
      computeTeamStrength(team('p2', 't2', 'Beta', 12)),
    ];
    const teamStats = accumulateTeamStats(strengths, []);
    // manually set
    teamStats[0]!.goals = 10;
    teamStats[0]!.shots = 100;
    teamStats[0]!.goalsAgainst = 8;
    teamStats[0]!.saves = 90;
    teamStats[0]!.gamesPlayed = 5;
    teamStats[0]!.wins = 3;
    teamStats[0]!.losses = 2;
    teamStats[0]!.penaltyMinutes = 20;
    teamStats[0]!.powerPlayGoals = 2;
    const rosters = new Map([
      ['p1', team('p1', 't1', 'Alpha', 14).players],
      ['p2', team('p2', 't2', 'Beta', 12).players],
    ]);
    const players = allocatePlayerStats({
      strengths,
      teamStats,
      rosters,
      config: DEFAULT_AGGREGATED_SEASON_CONFIG,
    });
    const goals = players
      .filter((p) => p.competitionParticipantId === 'p1' && !p.isGoalie)
      .reduce((a, p) => a + p.goals, 0);
    expect(goals).toBe(10);
  });
});
