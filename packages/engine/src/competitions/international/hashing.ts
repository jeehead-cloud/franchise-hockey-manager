import { stableDigest } from '../../simulation/batch/hash.js';
import { sortJsonValue } from '../../balance/canonicalize.js';
import { canonicalizeInternationalTemplate } from './config.js';
import type {
  GroupAssignment,
  GroupScheduleMatchSpec,
  InternationalTournamentTemplate,
  KnockoutMatchupSpec,
  TournamentMedalResultSpec,
} from './types.js';

export function hashInternationalTemplate(template: InternationalTournamentTemplate): string {
  return stableDigest(canonicalizeInternationalTemplate(template));
}

export function hashGroupAssignment(groups: GroupAssignment[]): string {
  return stableDigest(
    JSON.stringify(
      sortJsonValue(
        groups.map((g) => ({
          groupKey: g.groupKey,
          participantIds: [...g.participantIds].sort(),
        })),
      ),
    ),
  );
}

export function hashGroupSchedule(matches: GroupScheduleMatchSpec[]): string {
  return stableDigest(
    JSON.stringify(
      sortJsonValue(
        matches.map((m) => ({
          scheduleKey: m.scheduleKey,
          groupKey: m.groupKey,
          homeParticipantId: m.homeParticipantId,
          awayParticipantId: m.awayParticipantId,
          roundNumber: m.roundNumber,
          slotNumber: m.slotNumber,
          scheduleOrder: m.scheduleOrder,
        })),
      ),
    ),
  );
}

export function hashKnockoutBracket(matchups: KnockoutMatchupSpec[]): string {
  return stableDigest(
    JSON.stringify(
      sortJsonValue(
        matchups.map((m) => ({
          roundName: m.roundName,
          roundNumber: m.roundNumber,
          seriesOrder: m.seriesOrder,
          bracketSlot: m.bracketSlot,
          participant1Id: m.participant1Id,
          participant2Id: m.participant2Id,
          isBronze: m.isBronze,
          isFinal: m.isFinal,
        })),
      ),
    ),
  );
}

export function hashTournamentMedals(medals: TournamentMedalResultSpec[]): string {
  return stableDigest(
    JSON.stringify(
      sortJsonValue(
        medals.map((m) => ({
          medalType: m.medalType,
          participantId: m.participantId,
          finalPlacement: m.finalPlacement,
        })),
      ),
    ),
  );
}

export function hashTournamentResult(input: {
  scheduleHash: string;
  bracketHash: string;
  medalsHash: string;
  standingsHashes: string[];
}): string {
  return stableDigest(
    JSON.stringify(
      sortJsonValue({
        scheduleHash: input.scheduleHash,
        bracketHash: input.bracketHash,
        medalsHash: input.medalsHash,
        standingsHashes: [...input.standingsHashes].sort(),
      }),
    ),
  );
}
