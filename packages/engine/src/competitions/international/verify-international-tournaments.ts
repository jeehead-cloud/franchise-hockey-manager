/**
 * Pure F23 international tournament verifier — no Prisma.
 * Builds a 4-team mini tournament through medals and checks determinism.
 */
import {
  buildQualificationAndKnockout,
  deriveMedalsFromKnockout,
  generateInternationalGroupSchedule,
  getTestInternationalTemplate,
  hashTournamentMedals,
  hashTournamentResult,
  progressKnockoutBracket,
  reconcileInternationalTournament,
  validateInternationalTournamentTemplate,
  type TournamentParticipantSeed,
} from './index.js';

function seeds(): TournamentParticipantSeed[] {
  return [
    { participantId: 'p1', teamId: 't1', tournamentSeed: 1 },
    { participantId: 'p2', teamId: 't2', tournamentSeed: 2 },
    { participantId: 'p3', teamId: 't3', tournamentSeed: 3 },
    { participantId: 'p4', teamId: 't4', tournamentSeed: 4 },
  ];
}

function main() {
  const started = Date.now();
  const template = validateInternationalTournamentTemplate(getTestInternationalTemplate('JUNIOR_U20'));
  if (template.category !== 'JUNIOR_U20') {
    throw new Error('WJC-like template must be JUNIOR_U20');
  }

  const schedule1 = generateInternationalGroupSchedule({
    participants: seeds(),
    template,
    seed: 'verify-f23',
  });
  const schedule2 = generateInternationalGroupSchedule({
    participants: seeds(),
    template,
    seed: 'verify-f23',
  });
  if (schedule1.scheduleHash !== schedule2.scheduleHash) {
    throw new Error('Schedule hash not deterministic');
  }

  // Synthetic final group standings (as if all group matches completed)
  const ordered = [...schedule1.groups[0]!.participantIds].sort();
  const standings = {
    A: ordered.map((id, i) => ({
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
      goalsFor: 12 - i * 2,
      goalsAgainst: i * 2,
      goalDifference: 12 - i * 4,
      points: (3 - i) * 3,
      qualified: true,
      tiebreakerSummary: '',
    })),
  };

  const bracket = buildQualificationAndKnockout({ groupStandings: standings, template });
  const sf = bracket.matchups.filter((m) => m.roundName === 'SEMIFINAL');
  if (sf.length !== 2 || !sf[0]!.participant1Id || !sf[0]!.participant2Id) {
    throw new Error('Semifinals not seeded');
  }

  const afterSf = progressKnockoutBracket({
    matchups: bracket.matchups,
    completed: [
      {
        roundName: 'SEMIFINAL',
        bracketSlot: sf[0]!.bracketSlot,
        winnerParticipantId: sf[0]!.participant1Id!,
        loserParticipantId: sf[0]!.participant2Id!,
      },
      {
        roundName: 'SEMIFINAL',
        bracketSlot: sf[1]!.bracketSlot,
        winnerParticipantId: sf[1]!.participant1Id!,
        loserParticipantId: sf[1]!.participant2Id!,
      },
    ],
  });
  const final = afterSf.find((m) => m.isFinal)!;
  const bronze = afterSf.find((m) => m.isBronze)!;
  if (!final.participant1Id || !final.participant2Id || !bronze.participant1Id) {
    throw new Error('Medal games not filled');
  }

  const medals = deriveMedalsFromKnockout({
    completed: [
      {
        roundName: 'FINAL',
        bracketSlot: final.bracketSlot,
        winnerParticipantId: final.participant1Id,
        loserParticipantId: final.participant2Id,
      },
      {
        roundName: 'BRONZE',
        bracketSlot: bronze.bracketSlot,
        winnerParticipantId: bronze.participant1Id,
        loserParticipantId: bronze.participant2Id!,
      },
    ],
    bronzeEnabled: true,
  });

  const rec = reconcileInternationalTournament({
    template,
    schedule: schedule1,
    groupStandings: standings,
    groupMatchCountCompleted: schedule1.matchCount,
    knockoutMatchups: afterSf,
    completedKnockoutRounds: ['SEMIFINAL', 'BRONZE', 'FINAL'],
    medals,
  });
  if (!rec.ok) {
    throw new Error(`Reconciliation failed: ${rec.issues.map((i) => i.message).join('; ')}`);
  }

  const resultHash = hashTournamentResult({
    scheduleHash: schedule1.scheduleHash,
    bracketHash: bracket.bracketHash,
    medalsHash: hashTournamentMedals(medals),
    standingsHashes: ['synthetic'],
  });

  const durationMs = Date.now() - started;
  console.log(
    JSON.stringify({
      ok: true,
      templateKey: template.templateKey,
      category: template.category,
      groupMatches: schedule1.matchCount,
      scheduleHash: schedule1.scheduleHash,
      bracketHash: bracket.bracketHash,
      medals: medals.map((m) => ({ type: m.medalType, id: m.participantId })),
      resultHash,
      durationMs,
      note: 'Pure engine verifier — club ownership unchanged; no Prisma Match rows',
    }),
  );
}

main();
