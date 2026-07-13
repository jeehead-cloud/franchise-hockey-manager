import type {
  GroupAssignment,
  InternationalTournamentTemplate,
  TournamentParticipantSeed,
} from './types.js';
import { InternationalTournamentError } from './types.js';

function groupKeys(count: number): string[] {
  return Array.from({ length: count }, (_, i) => String.fromCharCode(65 + i));
}

/**
 * Deterministic group assignment.
 * SEEDED_SNAKE: 1→A, 2→B, 3→B, 4→A, ...
 */
export function assignTournamentGroups(input: {
  participants: TournamentParticipantSeed[];
  template: InternationalTournamentTemplate;
}): GroupAssignment[] {
  const { participants, template } = input;
  const { groupCount, teamsPerGroup, assignmentMode } = template.groupStage;

  if (participants.length !== template.participantCount) {
    throw new InternationalTournamentError(
      'InvalidGroupAssignment',
      `Expected ${template.participantCount} participants, got ${participants.length}`,
    );
  }

  const ids = new Set(participants.map((p) => p.participantId));
  if (ids.size !== participants.length) {
    throw new InternationalTournamentError(
      'InvalidGroupAssignment',
      'Duplicate participant in tournament',
    );
  }

  const keys = groupKeys(groupCount);
  const buckets = new Map<string, string[]>(keys.map((k) => [k, []]));

  if (assignmentMode === 'MANUAL') {
    for (const p of participants) {
      const gk = p.groupKey?.trim();
      if (!gk || !buckets.has(gk)) {
        throw new InternationalTournamentError(
          'InvalidGroupAssignment',
          `Participant ${p.participantId} missing valid manual groupKey`,
        );
      }
      buckets.get(gk)!.push(p.participantId);
    }
  } else {
    const ordered = [...participants].sort(
      (a, b) =>
        a.tournamentSeed - b.tournamentSeed ||
        a.participantId.localeCompare(b.participantId),
    );

    if (assignmentMode === 'SEEDED_SNAKE') {
      for (let i = 0; i < ordered.length; i += 1) {
        const pairIndex = Math.floor(i / groupCount);
        const within = i % groupCount;
        const groupIndex = pairIndex % 2 === 0 ? within : groupCount - 1 - within;
        buckets.get(keys[groupIndex]!)!.push(ordered[i]!.participantId);
      }
    } else {
      // SEEDED_BALANCED: fill groups in order by seed
      for (let i = 0; i < ordered.length; i += 1) {
        const groupIndex = i % groupCount;
        buckets.get(keys[groupIndex]!)!.push(ordered[i]!.participantId);
      }
    }
  }

  const groups: GroupAssignment[] = keys.map((groupKey) => {
    const participantIds = buckets.get(groupKey)!;
    if (participantIds.length !== teamsPerGroup) {
      throw new InternationalTournamentError(
        'InvalidGroupAssignment',
        `Group ${groupKey} has ${participantIds.length} teams (expected ${teamsPerGroup})`,
      );
    }
    return { groupKey, participantIds: [...participantIds].sort() };
  });

  // no team in two groups
  const seen = new Set<string>();
  for (const g of groups) {
    for (const id of g.participantIds) {
      if (seen.has(id)) {
        throw new InternationalTournamentError(
          'InvalidGroupAssignment',
          `Participant ${id} appears in multiple groups`,
        );
      }
      seen.add(id);
    }
  }

  return groups;
}
