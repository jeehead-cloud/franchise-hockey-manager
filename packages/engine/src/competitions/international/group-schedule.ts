import { generateRegularSeasonSchedule } from '../regular-season/schedule.js';
import { assignTournamentGroups } from './grouping.js';
import { hashGroupAssignment, hashGroupSchedule } from './hashing.js';
import type {
  GeneratedGroupSchedule,
  GroupScheduleMatchSpec,
  InternationalTournamentTemplate,
  TournamentParticipantSeed,
} from './types.js';
import { InternationalTournamentError } from './types.js';

/**
 * Generate per-group round-robin schedules (no cross-group games).
 * Reuses F18 circle method via generateRegularSeasonSchedule.
 */
export function generateInternationalGroupSchedule(input: {
  participants: TournamentParticipantSeed[];
  template: InternationalTournamentTemplate;
  seed: string;
}): GeneratedGroupSchedule {
  const groups = assignTournamentGroups({
    participants: input.participants,
    template: input.template,
  });

  const double =
    input.template.groupStage.roundRobinMode === 'DOUBLE';
  const matches: GroupScheduleMatchSpec[] = [];
  let scheduleOrder = 0;

  for (const group of groups) {
    const generated = generateRegularSeasonSchedule({
      participantIds: group.participantIds,
      seed: `${input.seed}:group:${group.groupKey}`,
      config: {
        scheduleFormat: double ? 'DOUBLE_ROUND_ROBIN' : 'ROUND_ROBIN',
        homeAwayMode: 'BALANCED',
        allowBackToBack: true,
        minimumRestSlots: 0,
        qualifiersCount: input.template.groupStage.qualifiersPerGroup,
      },
    });

    for (const m of generated.matches) {
      scheduleOrder += 1;
      matches.push({
        scheduleKey: `G${group.groupKey}-${m.scheduleKey}`,
        groupKey: group.groupKey,
        homeParticipantId: m.homeParticipantId,
        awayParticipantId: m.awayParticipantId,
        roundNumber: m.roundNumber,
        slotNumber: m.slotNumber,
        scheduleOrder,
      });
    }
  }

  // validate no self / no cross-group
  const groupOf = new Map<string, string>();
  for (const g of groups) {
    for (const id of g.participantIds) groupOf.set(id, g.groupKey);
  }
  for (const m of matches) {
    if (m.homeParticipantId === m.awayParticipantId) {
      throw new InternationalTournamentError(
        'InvalidGroupAssignment',
        'Self-match in group schedule',
      );
    }
    if (groupOf.get(m.homeParticipantId) !== m.groupKey) {
      throw new InternationalTournamentError(
        'InvalidGroupAssignment',
        'Cross-group or mis-keyed home team',
      );
    }
    if (groupOf.get(m.awayParticipantId) !== m.groupKey) {
      throw new InternationalTournamentError(
        'InvalidGroupAssignment',
        'Cross-group or mis-keyed away team',
      );
    }
  }

  return {
    groups,
    matches,
    matchCount: matches.length,
    scheduleHash: hashGroupSchedule(matches),
    groupAssignmentHash: hashGroupAssignment(groups),
  };
}

export function deriveInternationalGroupMatchSeed(
  baseSeed: string,
  scheduleHash: string,
  groupKey: string,
  scheduleOrder: number,
): string {
  return `${baseSeed}:${scheduleHash}:group:${groupKey}:match:${scheduleOrder}`;
}
