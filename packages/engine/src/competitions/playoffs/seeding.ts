import type { SeededParticipant } from './types.js';
import { PlayoffError } from './types.js';

export function normalizeSeededParticipants(participants: SeededParticipant[]): SeededParticipant[] {
  if (participants.length < 2) {
    throw new PlayoffError('InvalidPlayoffParticipantCount', 'At least two playoff participants are required');
  }
  if ((participants.length & (participants.length - 1)) !== 0) {
    throw new PlayoffError(
      'InvalidPlayoffParticipantCount',
      'Participant count must be a power of two',
    );
  }

  const ids = new Set<string>();
  const seeds = new Set<number>();
  for (const p of participants) {
    if (!p.competitionParticipantId) {
      throw new PlayoffError('InvalidPlayoffRequest', 'Missing competitionParticipantId');
    }
    if (ids.has(p.competitionParticipantId)) {
      throw new PlayoffError('InvalidPlayoffRequest', 'Duplicate playoff participant');
    }
    if (!Number.isInteger(p.seed) || p.seed < 1) {
      throw new PlayoffError('InvalidPlayoffRequest', 'Seeds must be integers >= 1');
    }
    if (seeds.has(p.seed)) {
      throw new PlayoffError('InvalidPlayoffRequest', `Duplicate seed ${p.seed}`);
    }
    ids.add(p.competitionParticipantId);
    seeds.add(p.seed);
  }

  const ordered = [...participants].sort((a, b) => a.seed - b.seed);
  for (let i = 0; i < ordered.length; i += 1) {
    if (ordered[i]!.seed !== i + 1) {
      throw new PlayoffError(
        'InvalidPlayoffRequest',
        'Seeds must be contiguous starting at 1',
      );
    }
  }
  return ordered;
}

/** Standard highest-vs-lowest first-round pairings in bracket order. */
export function fixedFirstRoundPairings(participants: SeededParticipant[]): Array<[SeededParticipant, SeededParticipant]> {
  const sorted = normalizeSeededParticipants(participants);
  const half = sorted.length / 2;
  const pairs: Array<[SeededParticipant, SeededParticipant]> = [];
  for (let i = 0; i < half; i += 1) {
    pairs.push([sorted[i]!, sorted[sorted.length - 1 - i]!]);
  }
  // Place so #1 and #2 meet in final when possible: interleave 1-vs-n with 2-vs-(n-1) into opposite halves
  if (pairs.length === 2) return pairs;
  if (pairs.length === 4) {
    // 1v8, 4v5 | 2v7, 3v6
    return [pairs[0]!, pairs[3]!, pairs[1]!, pairs[2]!];
  }
  return pairs;
}

export function reseedPairings(winners: SeededParticipant[]): Array<[SeededParticipant, SeededParticipant]> {
  const sorted = [...winners].sort((a, b) => a.seed - b.seed);
  if ((sorted.length & (sorted.length - 1)) !== 0) {
    throw new PlayoffError('InvalidPlayoffParticipantCount', 'Reseed round requires power-of-two winners');
  }
  const pairs: Array<[SeededParticipant, SeededParticipant]> = [];
  const half = sorted.length / 2;
  for (let i = 0; i < half; i += 1) {
    pairs.push([sorted[i]!, sorted[sorted.length - 1 - i]!]);
  }
  return pairs;
}
