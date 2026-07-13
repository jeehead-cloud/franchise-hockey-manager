import { describe, expect, it } from 'vitest';
import {
  parsePlayoffConfig,
  parseHomePatternToHosts,
  generatePlayoffBracket,
  normalizeSeededParticipants,
  fixedFirstRoundPairings,
  reseedPairings,
  recomputeSeriesProgression,
  nextRoundReseedPairings,
  nextRoundFixedPairings,
  derivePlayoffGameSeed,
} from './index.js';

const eight = [
  { competitionParticipantId: 'p1', seed: 1 },
  { competitionParticipantId: 'p2', seed: 2 },
  { competitionParticipantId: 'p3', seed: 3 },
  { competitionParticipantId: 'p4', seed: 4 },
  { competitionParticipantId: 'p5', seed: 5 },
  { competitionParticipantId: 'p6', seed: 6 },
  { competitionParticipantId: 'p7', seed: 7 },
  { competitionParticipantId: 'p8', seed: 8 },
];

describe('F19 playoff config', () => {
  it('parses best-of-seven with home pattern', () => {
    const config = parsePlayoffConfig(
      {
        winsRequired: 4,
        homePattern: '2-2-1-1-1',
        reseeding: false,
        qualificationCount: 8,
      },
      { participantCount: 8 },
    );
    expect(config.winsRequired).toBe(4);
    expect(config.normalizedHomePattern).toHaveLength(7);
    expect(config.bracketMode).toBe('FIXED');
    expect(config.matchRules.tiesAllowed).toBe(false);
  });

  it('rejects non-power-of-two and ties', () => {
    expect(() =>
      parsePlayoffConfig({ winsRequired: 4, homePattern: '2-2-1-1-1', qualificationCount: 6 }),
    ).toThrow(/power-of-two/);
    expect(() =>
      parsePlayoffConfig({
        winsRequired: 4,
        homePattern: '2-2-1-1-1',
        qualificationCount: 4,
        matchRules: { tiesAllowed: true, overtimeEnabled: true, shootoutEnabled: false },
      }),
    ).toThrow(/ties/);
  });

  it('expands home pattern hosts', () => {
    expect(parseHomePatternToHosts('2-3-2', 7)).toEqual([
      'HIGHER_SEED',
      'HIGHER_SEED',
      'LOWER_SEED',
      'LOWER_SEED',
      'LOWER_SEED',
      'HIGHER_SEED',
      'HIGHER_SEED',
    ]);
  });
});

describe('F19 seeding and bracket', () => {
  it('builds deterministic 8-team fixed pairings', () => {
    const pairs = fixedFirstRoundPairings(eight);
    expect(pairs.map((p) => [p[0].seed, p[1].seed])).toEqual([
      [1, 8],
      [4, 5],
      [2, 7],
      [3, 6],
    ]);
    const a = generatePlayoffBracket({
      stageId: 'stage-1',
      participants: eight,
      config: parsePlayoffConfig(
        { winsRequired: 4, homePattern: '2-2-1-1-1', qualificationCount: 8 },
        { participantCount: 8 },
      ),
      bracketSeed: 'playoffs-2026',
    });
    const b = generatePlayoffBracket({
      stageId: 'stage-1',
      participants: [...eight].reverse(),
      config: parsePlayoffConfig(
        { winsRequired: 4, homePattern: '2-2-1-1-1', qualificationCount: 8 },
        { participantCount: 8 },
      ),
      bracketSeed: 'playoffs-2026',
    });
    expect(a.bracketHash).toBe(b.bracketHash);
    expect(a.initialSeries).toHaveLength(4);
  });

  it('reseeds winners highest vs lowest', () => {
    const winners = [
      { competitionParticipantId: 'p8', seed: 8 },
      { competitionParticipantId: 'p1', seed: 1 },
      { competitionParticipantId: 'p4', seed: 4 },
      { competitionParticipantId: 'p2', seed: 2 },
    ];
    expect(reseedPairings(winners).map((p) => [p[0].seed, p[1].seed])).toEqual([
      [1, 8],
      [2, 4],
    ]);
    const next = nextRoundReseedPairings(winners, 2);
    expect(next[0]!.participant1Seed).toBe(1);
    expect(next[0]!.participant2Seed).toBe(8);
  });

  it('rejects duplicate seeds', () => {
    expect(() =>
      normalizeSeededParticipants([
        { competitionParticipantId: 'a', seed: 1 },
        { competitionParticipantId: 'b', seed: 1 },
      ]),
    ).toThrow(/Duplicate seed/);
  });
});

describe('F19 series progression', () => {
  it('clinches at winsRequired and rejects post-clinch games', () => {
    const base = {
      participant1Id: 'p1',
      participant2Id: 'p2',
      participant1Seed: 1,
      participant2Seed: 2,
      winsRequired: 4,
    };
    const games = [1, 2, 3, 4].map((n) => ({
      gameNumber: n,
      homeParticipantId: 'p1',
      awayParticipantId: 'p2',
      winnerParticipantId: 'p1',
      decisionType: 'REGULATION',
    }));
    const result = recomputeSeriesProgression({ ...base, games });
    expect(result.clinched).toBe(true);
    expect(result.winnerParticipantId).toBe('p1');
    expect(result.participant1Wins).toBe(4);
    expect(result.nextGameNumber).toBeNull();

    const withExtra = recomputeSeriesProgression({
      ...base,
      games: [
        ...games,
        {
          gameNumber: 5,
          homeParticipantId: 'p1',
          awayParticipantId: 'p2',
          winnerParticipantId: 'p2',
          decisionType: 'REGULATION',
        },
      ],
    });
    expect(withExtra.errors.some((e) => e.includes('after series clinched'))).toBe(true);
  });

  it('advances fixed bracket winners', () => {
    const next = nextRoundFixedPairings(
      [
        { seriesOrder: 1, winnerParticipantId: 'p1', winnerSeed: 1 },
        { seriesOrder: 2, winnerParticipantId: 'p4', winnerSeed: 4 },
        { seriesOrder: 3, winnerParticipantId: 'p2', winnerSeed: 2 },
        { seriesOrder: 4, winnerParticipantId: 'p3', winnerSeed: 3 },
      ],
      2,
    );
    expect(next).toHaveLength(2);
    expect(next[0]!.participant1Id).toBe('p1');
    expect(next[0]!.participant2Id).toBe('p4');
  });

  it('derives stable game seeds', () => {
    expect(derivePlayoffGameSeed('base', 'hash', 1, 'R1-S1', 2)).toBe(
      'base:hash:round:1:series:R1-S1:game:2',
    );
  });
});
