import { describe, expect, it } from 'vitest';
import {
  assignTournamentGroups,
  buildQualificationAndKnockout,
  deriveMedalsFromKnockout,
  generateInternationalGroupSchedule,
  getInternationalTournamentTemplate,
  getTestInternationalTemplate,
  hashGroupSchedule,
  hashInternationalTemplate,
  progressKnockoutBracket,
  reconcileInternationalTournament,
  validateInternationalTournamentTemplate,
  type TournamentParticipantSeed,
} from './index.js';

function seeds(n: number): TournamentParticipantSeed[] {
  return Array.from({ length: n }, (_, i) => ({
    participantId: `p${i + 1}`,
    teamId: `t${i + 1}`,
    tournamentSeed: i + 1,
  }));
}

describe('F23 international tournaments', () => {
  it('validates built-in templates', () => {
    for (const key of ['WORLD_JUNIORS', 'WORLD_CHAMPIONSHIP', 'OLYMPIC_GAMES'] as const) {
      const t = getInternationalTournamentTemplate(key);
      expect(validateInternationalTournamentTemplate(t).templateKey).toBe(key);
    }
    expect(getInternationalTournamentTemplate('WORLD_JUNIORS').category).toBe('JUNIOR_U20');
  });

  it('rejects invalid templates', () => {
    const t = getInternationalTournamentTemplate('WORLD_CHAMPIONSHIP');
    expect(() =>
      validateInternationalTournamentTemplate({ ...t, participantCount: 7 }),
    ).toThrow();
    expect(() =>
      validateInternationalTournamentTemplate({
        ...t,
        matchRules: { ...t.matchRules, tiesAllowed: true },
      }),
    ).toThrow();
    expect(() =>
      validateInternationalTournamentTemplate({ ...t, unknown: true } as never),
    ).toThrow();
  });

  it('assigns seeded snake groups deterministically', () => {
    const template = getInternationalTournamentTemplate('WORLD_JUNIORS');
    const a = assignTournamentGroups({ participants: seeds(8), template });
    const b = assignTournamentGroups({ participants: seeds(8), template });
    expect(a).toEqual(b);
    expect(a.find((g) => g.groupKey === 'A')?.participantIds).toContain('p1');
    // snake: 1A 2B 3B 4A 5A 6B 7B 8A
    expect(a.find((g) => g.groupKey === 'A')?.participantIds.sort()).toEqual(
      ['p1', 'p4', 'p5', 'p8'].sort(),
    );
  });

  it('generates group schedule without cross-group games', () => {
    const template = getTestInternationalTemplate('SENIOR_MEN');
    const schedule = generateInternationalGroupSchedule({
      participants: seeds(4),
      template,
      seed: 'test-seed',
    });
    expect(schedule.matchCount).toBe(6); // C(4,2)
    expect(hashGroupSchedule(schedule.matches)).toBe(schedule.scheduleHash);
    const again = generateInternationalGroupSchedule({
      participants: seeds(4),
      template,
      seed: 'test-seed',
    });
    expect(again.scheduleHash).toBe(schedule.scheduleHash);
  });

  it('builds SF knockout and medals', () => {
    const template = getTestInternationalTemplate('SENIOR_MEN');
    const standings = {
      A: [
        {
          participantId: 'p1',
          groupKey: 'A',
          rank: 1,
          gamesPlayed: 3,
          regulationWins: 3,
          overtimeWins: 0,
          shootoutWins: 0,
          regulationLosses: 0,
          overtimeLosses: 0,
          shootoutLosses: 0,
          goalsFor: 9,
          goalsAgainst: 1,
          goalDifference: 8,
          points: 9,
          qualified: true,
          tiebreakerSummary: '',
        },
        {
          participantId: 'p2',
          groupKey: 'A',
          rank: 2,
          gamesPlayed: 3,
          regulationWins: 2,
          overtimeWins: 0,
          shootoutWins: 0,
          regulationLosses: 1,
          overtimeLosses: 0,
          shootoutLosses: 0,
          goalsFor: 6,
          goalsAgainst: 3,
          goalDifference: 3,
          points: 6,
          qualified: true,
          tiebreakerSummary: '',
        },
        {
          participantId: 'p3',
          groupKey: 'A',
          rank: 3,
          gamesPlayed: 3,
          regulationWins: 1,
          overtimeWins: 0,
          shootoutWins: 0,
          regulationLosses: 2,
          overtimeLosses: 0,
          shootoutLosses: 0,
          goalsFor: 3,
          goalsAgainst: 6,
          goalDifference: -3,
          points: 3,
          qualified: true,
          tiebreakerSummary: '',
        },
        {
          participantId: 'p4',
          groupKey: 'A',
          rank: 4,
          gamesPlayed: 3,
          regulationWins: 0,
          overtimeWins: 0,
          shootoutWins: 0,
          regulationLosses: 3,
          overtimeLosses: 0,
          shootoutLosses: 0,
          goalsFor: 1,
          goalsAgainst: 9,
          goalDifference: -8,
          points: 0,
          qualified: true,
          tiebreakerSummary: '',
        },
      ],
    };
    const bracket = buildQualificationAndKnockout({ groupStandings: standings, template });
    expect(bracket.matchups.some((m) => m.roundName === 'SEMIFINAL')).toBe(true);
    expect(bracket.matchups.some((m) => m.isFinal)).toBe(true);
    expect(bracket.matchups.some((m) => m.isBronze)).toBe(true);

    const progressed = progressKnockoutBracket({
      matchups: bracket.matchups,
      completed: [
        {
          roundName: 'SEMIFINAL',
          bracketSlot: 1,
          winnerParticipantId: 'p1',
          loserParticipantId: 'p4',
        },
        {
          roundName: 'SEMIFINAL',
          bracketSlot: 2,
          winnerParticipantId: 'p2',
          loserParticipantId: 'p3',
        },
      ],
    });
    const final = progressed.find((m) => m.isFinal)!;
    expect(final.participant1Id).toBe('p1');
    expect(final.participant2Id).toBe('p2');

    const medals = deriveMedalsFromKnockout({
      completed: [
        {
          roundName: 'SEMIFINAL',
          bracketSlot: 1,
          winnerParticipantId: 'p1',
          loserParticipantId: 'p4',
        },
        {
          roundName: 'SEMIFINAL',
          bracketSlot: 2,
          winnerParticipantId: 'p2',
          loserParticipantId: 'p3',
        },
        {
          roundName: 'BRONZE',
          bracketSlot: 190,
          winnerParticipantId: 'p3',
          loserParticipantId: 'p4',
        },
        {
          roundName: 'FINAL',
          bracketSlot: 200,
          winnerParticipantId: 'p1',
          loserParticipantId: 'p2',
        },
      ],
      bronzeEnabled: true,
    });
    expect(medals.map((m) => m.medalType)).toEqual(['GOLD', 'SILVER', 'BRONZE']);
    expect(new Set(medals.map((m) => m.participantId)).size).toBe(3);
  });

  it('reconciles a completed mini-tournament', () => {
    const template = getTestInternationalTemplate();
    const schedule = generateInternationalGroupSchedule({
      participants: seeds(4),
      template,
      seed: 'rec',
    });
    const standings = {
      A: schedule.groups[0]!.participantIds.map((id, i) => ({
        participantId: id,
        groupKey: 'A',
        rank: i + 1,
        gamesPlayed: 3,
        regulationWins: 3 - i,
        overtimeWins: 0,
        shootoutWins: 0,
        regulationLosses: i,
        overtimeLosses: 0,
        shootoutLosses: 0,
        goalsFor: 10 - i,
        goalsAgainst: i,
        goalDifference: 10 - 2 * i,
        points: (3 - i) * 3,
        qualified: true,
        tiebreakerSummary: '',
      })),
    };
    const bracket = buildQualificationAndKnockout({ groupStandings: standings, template });
    const medals = deriveMedalsFromKnockout({
      completed: [
        {
          roundName: 'FINAL',
          bracketSlot: 200,
          winnerParticipantId: standings.A[0]!.participantId,
          loserParticipantId: standings.A[1]!.participantId,
        },
        {
          roundName: 'BRONZE',
          bracketSlot: 190,
          winnerParticipantId: standings.A[2]!.participantId,
          loserParticipantId: standings.A[3]!.participantId,
        },
      ],
      bronzeEnabled: true,
    });
    const rec = reconcileInternationalTournament({
      template,
      schedule,
      groupStandings: standings,
      groupMatchCountCompleted: schedule.matchCount,
      knockoutMatchups: bracket.matchups,
      completedKnockoutRounds: ['SEMIFINAL', 'BRONZE', 'FINAL'],
      medals,
    });
    expect(rec.ok).toBe(true);
  });

  it('hashes templates stably', () => {
    const t = getInternationalTournamentTemplate('OLYMPIC_GAMES');
    expect(hashInternationalTemplate(t)).toBe(hashInternationalTemplate({ ...t }));
  });
});
