import { generateRegularSeasonSchedule } from '../regular-season/schedule.js';
import type { GeneratedSchedule } from '../regular-season/types.js';
import type { AggregatedSeasonConfig } from './types.js';
import { AggregatedLeagueError } from './types.js';

/**
 * Reuse F18 deterministic schedule generation for aggregated encounters.
 */
export function generateAggregatedSchedule(input: {
  participantIds: string[];
  config: AggregatedSeasonConfig;
  seed: string;
}): GeneratedSchedule {
  if (input.participantIds.length < 2) {
    throw new AggregatedLeagueError(
      'InvalidAggregatedConfiguration',
      'Need at least 2 participants',
    );
  }
  return generateRegularSeasonSchedule({
    participantIds: [...input.participantIds].sort(),
    config: {
      scheduleFormat: input.config.scheduleFormat,
      gamesPerTeam: input.config.gamesPerTeam,
      homeAwayMode: 'BALANCED',
      allowBackToBack: true,
      minimumRestSlots: 0,
      qualifiersCount: input.config.qualifiersCount,
    },
    seed: input.seed,
  });
}
