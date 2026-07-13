import type {
  KnockoutMatchupSpec,
  TournamentMedalResultSpec,
} from './types.js';
import { InternationalTournamentError } from './types.js';

export interface CompletedKnockoutGame {
  roundName: 'QUARTERFINAL' | 'SEMIFINAL' | 'BRONZE' | 'FINAL';
  bracketSlot: number;
  winnerParticipantId: string;
  loserParticipantId: string;
  scheduleKey?: string;
}

/**
 * Progress knockout: fill next-round matchups from completed games.
 * Returns updated matchup list (does not mutate input).
 */
export function progressKnockoutBracket(input: {
  matchups: KnockoutMatchupSpec[];
  completed: CompletedKnockoutGame[];
}): KnockoutMatchupSpec[] {
  const next = input.matchups.map((m) => ({ ...m }));
  const bySlot = new Map(next.map((m) => [m.bracketSlot, m]));

  const qf = input.completed.filter((c) => c.roundName === 'QUARTERFINAL');
  if (qf.length > 0) {
    // QF slots 1,2 → SF 101; 3,4 → SF 102
    const sf101 = bySlot.get(101);
    const sf102 = bySlot.get(102);
    const winners = new Map(qf.map((c) => [c.bracketSlot, c.winnerParticipantId]));
    if (sf101 && winners.has(1) && winners.has(2)) {
      sf101.participant1Id = winners.get(1)!;
      sf101.participant2Id = winners.get(2)!;
    }
    if (sf102 && winners.has(3) && winners.has(4)) {
      sf102.participant1Id = winners.get(3)!;
      sf102.participant2Id = winners.get(4)!;
    }
  }

  const sf = input.completed.filter((c) => c.roundName === 'SEMIFINAL');
  if (sf.length >= 2) {
    const winners = sf.map((c) => c.winnerParticipantId);
    const losers = sf.map((c) => c.loserParticipantId);
    if (new Set(winners).size !== winners.length || new Set(losers).size !== losers.length) {
      throw new InternationalTournamentError(
        'KnockoutReconciliationFailed',
        'Duplicate team in semifinal results',
      );
    }
    const final = next.find((m) => m.isFinal);
    const bronze = next.find((m) => m.isBronze);
    if (final) {
      final.participant1Id = winners[0]!;
      final.participant2Id = winners[1]!;
    }
    if (bronze) {
      bronze.participant1Id = losers[0]!;
      bronze.participant2Id = losers[1]!;
    }
  }

  return next;
}

export function deriveMedalsFromKnockout(input: {
  completed: CompletedKnockoutGame[];
  bronzeEnabled: boolean;
}): TournamentMedalResultSpec[] {
  const final = input.completed.find((c) => c.roundName === 'FINAL');
  if (!final) {
    throw new InternationalTournamentError(
      'MedalReconciliationFailed',
      'Final result required for medals',
    );
  }
  const medals: TournamentMedalResultSpec[] = [
    {
      medalType: 'GOLD',
      participantId: final.winnerParticipantId,
      finalPlacement: 1,
      sourceMatchKey: final.scheduleKey ?? null,
    },
    {
      medalType: 'SILVER',
      participantId: final.loserParticipantId,
      finalPlacement: 2,
      sourceMatchKey: final.scheduleKey ?? null,
    },
  ];

  if (input.bronzeEnabled) {
    const bronze = input.completed.find((c) => c.roundName === 'BRONZE');
    if (!bronze) {
      throw new InternationalTournamentError(
        'MedalReconciliationFailed',
        'Bronze result required',
      );
    }
    medals.push({
      medalType: 'BRONZE',
      participantId: bronze.winnerParticipantId,
      finalPlacement: 3,
      sourceMatchKey: bronze.scheduleKey ?? null,
    });
  }

  const ids = medals.map((m) => m.participantId);
  if (new Set(ids).size !== ids.length) {
    throw new InternationalTournamentError(
      'MedalReconciliationFailed',
      'Gold, silver, and bronze must be distinct',
    );
  }
  return medals;
}
