import { stableDigest } from '../../simulation/batch/hash.js';
import { sortJsonValue } from '../../balance/canonicalize.js';
import type {
  GeneratedBracket,
  InitialSeriesSpec,
  PlayoffConfig,
  SeededParticipant,
} from './types.js';
import { PlayoffError } from './types.js';
import { fixedFirstRoundPairings, normalizeSeededParticipants } from './seeding.js';

export function computeBracketHash(input: {
  stageId: string;
  config: PlayoffConfig;
  participants: SeededParticipant[];
  bracketSeed: string;
  initialSeries: Array<{
    roundNumber: number;
    seriesOrder: number;
    bracketSlot: string;
    participant1Id: string;
    participant2Id: string;
  }>;
}): string {
  const payload = {
    stageId: input.stageId,
    bracketSeed: input.bracketSeed,
    bracketMode: input.config.bracketMode,
    winsRequired: input.config.winsRequired,
    homePattern: input.config.homePattern,
    qualificationCount: input.config.qualificationCount,
    participants: input.participants.map((p) => ({
      id: p.competitionParticipantId,
      seed: p.seed,
    })),
    initialSeries: input.initialSeries,
  };
  return stableDigest(JSON.stringify(sortJsonValue(payload)));
}

export function generatePlayoffBracket(input: {
  stageId: string;
  participants: SeededParticipant[];
  config: PlayoffConfig;
  bracketSeed: string;
}): GeneratedBracket {
  const participants = normalizeSeededParticipants(input.participants);
  if (participants.length !== input.config.qualificationCount) {
    throw new PlayoffError(
      'InvalidPlayoffParticipantCount',
      `Expected ${input.config.qualificationCount} participants, got ${participants.length}`,
    );
  }

  const pairs = fixedFirstRoundPairings(participants);
  const roundName = input.config.roundNames[0] ?? 'Round 1';
  const initialSeries: InitialSeriesSpec[] = pairs.map((pair, index) => {
    const [a, b] = pair;
    const higher = a.seed < b.seed ? a : b;
    const lower = a.seed < b.seed ? b : a;
    return {
      roundNumber: 1,
      roundName,
      seriesOrder: index + 1,
      bracketSlot: `R1-S${index + 1}`,
      participant1Id: higher.competitionParticipantId,
      participant2Id: lower.competitionParticipantId,
      participant1Seed: higher.seed,
      participant2Seed: lower.seed,
      homeAdvantageParticipantId: higher.competitionParticipantId,
      winsRequired: input.config.winsRequired,
      homePatternText: input.config.homePattern,
      normalizedHomePattern: input.config.normalizedHomePattern,
    };
  });

  const bracketHash = computeBracketHash({
    stageId: input.stageId,
    config: input.config,
    participants,
    bracketSeed: input.bracketSeed,
    initialSeries: initialSeries.map((s) => ({
      roundNumber: s.roundNumber,
      seriesOrder: s.seriesOrder,
      bracketSlot: s.bracketSlot,
      participant1Id: s.participant1Id,
      participant2Id: s.participant2Id,
    })),
  });

  const rounds = Math.log2(participants.length);
  return {
    rounds,
    initialSeries,
    byeAdvancements: [],
    bracketHash,
    diagnostics: {
      participantCount: participants.length,
      firstRoundSeries: initialSeries.length,
      maxGamesPerSeries: input.config.winsRequired * 2 - 1,
      totalPossibleSeries: participants.length - 1,
      roundNames: input.config.roundNames,
      bracketMode: input.config.bracketMode,
    },
    config: input.config,
    participants,
  };
}

export function derivePlayoffGameSeed(
  baseSeed: string,
  bracketHash: string,
  roundNumber: number,
  seriesSlot: string,
  gameNumber: number,
): string {
  return `${baseSeed}:${bracketHash}:round:${roundNumber}:series:${seriesSlot}:game:${gameNumber}`;
}
