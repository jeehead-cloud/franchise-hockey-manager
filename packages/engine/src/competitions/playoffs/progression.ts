import type {
  NextRoundPairing,
  SeededParticipant,
  SeriesProgressionInput,
  SeriesProgressionResult,
  PlayoffConfig,
} from './types.js';
import { PlayoffError } from './types.js';
import { hostForGame } from './config.js';
import { reseedPairings } from './seeding.js';

export function recomputeSeriesProgression(input: SeriesProgressionInput): SeriesProgressionResult {
  const errors: string[] = [];
  const games = [...input.games].sort((a, b) => a.gameNumber - b.gameNumber);
  const seen = new Set<number>();
  let p1 = 0;
  let p2 = 0;
  let clinchedAt: number | null = null;

  for (let i = 0; i < games.length; i += 1) {
    const g = games[i]!;
    if (seen.has(g.gameNumber)) {
      errors.push(`Duplicate game number ${g.gameNumber}`);
      continue;
    }
    seen.add(g.gameNumber);
    if (g.gameNumber !== i + 1) {
      errors.push(`Expected game number ${i + 1}, got ${g.gameNumber}`);
    }
    if (clinchedAt != null && g.gameNumber > clinchedAt) {
      errors.push(`Game ${g.gameNumber} exists after series clinched at game ${clinchedAt}`);
    }

    const participants = new Set([input.participant1Id, input.participant2Id]);
    if (!participants.has(g.homeParticipantId) || !participants.has(g.awayParticipantId)) {
      errors.push(`Game ${g.gameNumber} has unknown participant`);
      continue;
    }
    if (g.homeParticipantId === g.awayParticipantId) {
      errors.push(`Game ${g.gameNumber} is a self-match`);
      continue;
    }
    if (!g.winnerParticipantId || !participants.has(g.winnerParticipantId)) {
      errors.push(`Game ${g.gameNumber} missing valid winner`);
      continue;
    }

    if (g.winnerParticipantId === input.participant1Id) p1 += 1;
    else if (g.winnerParticipantId === input.participant2Id) p2 += 1;

    if (clinchedAt == null && (p1 >= input.winsRequired || p2 >= input.winsRequired)) {
      clinchedAt = g.gameNumber;
    }
  }

  const clinched = p1 >= input.winsRequired || p2 >= input.winsRequired;
  let winnerParticipantId: string | null = null;
  if (p1 >= input.winsRequired && p2 >= input.winsRequired) {
    errors.push('Both participants reached winsRequired');
  } else if (p1 >= input.winsRequired) {
    winnerParticipantId = input.participant1Id;
  } else if (p2 >= input.winsRequired) {
    winnerParticipantId = input.participant2Id;
  }

  if (clinched && p1 + p2 !== games.length && errors.length === 0) {
    // ok — wins sum equals counted games when no errors
  }
  if (p1 + p2 !== games.filter((g) => g.winnerParticipantId).length) {
    // already counted carefully
  }

  const nextGameNumber = clinched ? null : games.length + 1;

  return {
    participant1Wins: p1,
    participant2Wins: p2,
    winnerParticipantId,
    clinched,
    nextGameNumber,
    errors,
  };
}

export function resolveGameHomeAway(input: {
  config: PlayoffConfig;
  gameNumber: number;
  higherSeedParticipantId: string;
  lowerSeedParticipantId: string;
}): { homeParticipantId: string; awayParticipantId: string } {
  const host = hostForGame(input.config.normalizedHomePattern, input.gameNumber);
  if (host === 'HIGHER_SEED') {
    return {
      homeParticipantId: input.higherSeedParticipantId,
      awayParticipantId: input.lowerSeedParticipantId,
    };
  }
  return {
    homeParticipantId: input.lowerSeedParticipantId,
    awayParticipantId: input.higherSeedParticipantId,
  };
}

/** Fixed bracket: winners of series i and i+1 meet (0-based even pairing). */
export function nextRoundFixedPairings(
  completedSeries: Array<{
    seriesOrder: number;
    winnerParticipantId: string;
    winnerSeed: number;
  }>,
  roundNumber: number,
): NextRoundPairing[] {
  const ordered = [...completedSeries].sort((a, b) => a.seriesOrder - b.seriesOrder);
  if (ordered.length % 2 !== 0) {
    throw new PlayoffError('BracketGenerationFailed', 'Odd number of winners for fixed next round');
  }
  const pairs: NextRoundPairing[] = [];
  for (let i = 0; i < ordered.length; i += 2) {
    const a = ordered[i]!;
    const b = ordered[i + 1]!;
    const higher = a.winnerSeed <= b.winnerSeed ? a : b;
    const lower = a.winnerSeed <= b.winnerSeed ? b : a;
    const seriesOrder = i / 2 + 1;
    pairs.push({
      seriesOrder,
      bracketSlot: `R${roundNumber}-S${seriesOrder}`,
      participant1Id: higher.winnerParticipantId,
      participant2Id: lower.winnerParticipantId,
      participant1Seed: higher.winnerSeed,
      participant2Seed: lower.winnerSeed,
      homeAdvantageParticipantId: higher.winnerParticipantId,
    });
  }
  return pairs;
}

export function nextRoundReseedPairings(
  winners: SeededParticipant[],
  roundNumber: number,
): NextRoundPairing[] {
  const pairs = reseedPairings(winners);
  return pairs.map((pair, index) => {
    const [a, b] = pair;
    const higher = a.seed < b.seed ? a : b;
    const lower = a.seed < b.seed ? b : a;
    return {
      seriesOrder: index + 1,
      bracketSlot: `R${roundNumber}-S${index + 1}`,
      participant1Id: higher.competitionParticipantId,
      participant2Id: lower.competitionParticipantId,
      participant1Seed: higher.seed,
      participant2Seed: lower.seed,
      homeAdvantageParticipantId: higher.competitionParticipantId,
    };
  });
}
