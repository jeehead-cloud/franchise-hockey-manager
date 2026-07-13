import type {
  AwardCalculationInput,
  NormalizedArchiveAward,
  NormalizedArchivePlayerStat,
  NormalizedArchiveStanding,
} from './types.js';

const AWARD_NAMES: Record<string, string> = {
  CHAMPION: 'Champion',
  REGULAR_SEASON_CHAMPION: 'Regular Season Champion',
  MOST_POINTS: 'Most Points',
  MOST_GOALS: 'Most Goals',
  MOST_ASSISTS: 'Most Assists',
  BEST_GOALIE_SAVE_PERCENTAGE: 'Best Goalie Save Percentage',
  PLAYOFF_MOST_POINTS: 'Playoff Most Points',
  PLAYOFF_MOST_GOALS: 'Playoff Most Goals',
  BEST_REGULAR_SEASON_RECORD: 'Best Regular Season Record',
};

function participantName(
  input: AwardCalculationInput,
  sourceParticipantId: string | null,
): string | null {
  if (!sourceParticipantId) return null;
  return (
    input.participants.find((p) => p.sourceCompetitionParticipantId === sourceParticipantId)
      ?.teamNameSnapshot ?? null
  );
}

function leaderAwards(
  stats: NormalizedArchivePlayerStat[],
  metric: 'points' | 'goals' | 'assists',
  awardType: NormalizedArchiveAward['awardType'],
  stageId: string | null,
  criteria: string,
): NormalizedArchiveAward[] {
  if (stats.length === 0 || !stageId) return [];
  const stageStats = stats.filter((s) => s.sourceStageId === stageId && !s.isGoalie);
  if (stageStats.length === 0) return [];
  const max = Math.max(...stageStats.map((s) => s[metric]));
  const leaders = stageStats
    .filter((s) => s[metric] === max)
    .sort((a, b) => a.sourcePlayerId.localeCompare(b.sourcePlayerId));
  const shared = leaders.length > 1;
  return leaders.map((s, i) => ({
    awardType,
    awardNameSnapshot: AWARD_NAMES[awardType]!,
    recipientType: 'PLAYER' as const,
    sourceParticipantId: s.sourceParticipantId,
    sourcePlayerId: s.sourcePlayerId,
    playerNameSnapshot: s.playerNameSnapshot,
    teamNameSnapshot: s.teamNameSnapshot,
    valueNumber: s[metric],
    valueText: String(s[metric]),
    rank: i + 1,
    shared,
    criteriaSnapshotText: criteria,
    sourceStageId: stageId,
    sourceSnapshotHash: s.sourceSnapshotHash,
  }));
}

function bestGoalieAwards(
  stats: NormalizedArchivePlayerStat[],
  stageId: string | null,
  minimumGoalieGames: number,
): NormalizedArchiveAward[] {
  if (!stageId) return [];
  const eligible = stats
    .filter(
      (s) =>
        s.sourceStageId === stageId &&
        s.isGoalie &&
        s.gamesPlayed >= minimumGoalieGames &&
        s.savePercentage != null,
    )
    .sort((a, b) => {
      const sp = (b.savePercentage ?? 0) - (a.savePercentage ?? 0);
      if (sp !== 0) return sp;
      return a.sourcePlayerId.localeCompare(b.sourcePlayerId);
    });
  if (eligible.length === 0) return [];
  const best = eligible[0]!.savePercentage!;
  const leaders = eligible.filter((s) => s.savePercentage === best);
  const shared = leaders.length > 1;
  return leaders.map((s, i) => ({
    awardType: 'BEST_GOALIE_SAVE_PERCENTAGE' as const,
    awardNameSnapshot: AWARD_NAMES.BEST_GOALIE_SAVE_PERCENTAGE!,
    recipientType: 'PLAYER' as const,
    sourceParticipantId: s.sourceParticipantId,
    sourcePlayerId: s.sourcePlayerId,
    playerNameSnapshot: s.playerNameSnapshot,
    teamNameSnapshot: s.teamNameSnapshot,
    valueNumber: s.savePercentage,
    valueText: s.savePercentage != null ? s.savePercentage.toFixed(4) : null,
    rank: i + 1,
    shared,
    criteriaSnapshotText: `Highest save percentage among goalies with at least ${minimumGoalieGames} games played`,
    sourceStageId: stageId,
    sourceSnapshotHash: s.sourceSnapshotHash,
  }));
}

function regularSeasonChampion(
  standings: NormalizedArchiveStanding[],
  stageId: string | null,
  input: AwardCalculationInput,
): NormalizedArchiveAward[] {
  if (!stageId) return [];
  const top = standings
    .filter((s) => s.sourceStageId === stageId && s.rank === 1)
    .sort((a, b) => a.sourceParticipantId.localeCompare(b.sourceParticipantId));
  if (top.length === 0) return [];
  const shared = top.length > 1;
  return top.map((s, i) => ({
    awardType: 'REGULAR_SEASON_CHAMPION' as const,
    awardNameSnapshot: AWARD_NAMES.REGULAR_SEASON_CHAMPION!,
    recipientType: 'TEAM' as const,
    sourceParticipantId: s.sourceParticipantId,
    sourcePlayerId: null,
    playerNameSnapshot: null,
    teamNameSnapshot: participantName(input, s.sourceParticipantId),
    valueNumber: s.points,
    valueText: `${s.points} pts`,
    rank: i + 1,
    shared,
    criteriaSnapshotText: 'Rank 1 in final regular-season standings',
    sourceStageId: stageId,
    sourceSnapshotHash: s.sourceSnapshotHash,
  }));
}

function bestRecord(
  standings: NormalizedArchiveStanding[],
  stageId: string | null,
  input: AwardCalculationInput,
): NormalizedArchiveAward[] {
  if (!stageId) return [];
  const rows = standings.filter((s) => s.sourceStageId === stageId);
  if (rows.length === 0) return [];
  const maxPp = Math.max(...rows.map((s) => s.pointsPercentage));
  const leaders = rows
    .filter((s) => s.pointsPercentage === maxPp)
    .sort((a, b) => a.sourceParticipantId.localeCompare(b.sourceParticipantId));
  const shared = leaders.length > 1;
  return leaders.map((s, i) => ({
    awardType: 'BEST_REGULAR_SEASON_RECORD' as const,
    awardNameSnapshot: AWARD_NAMES.BEST_REGULAR_SEASON_RECORD!,
    recipientType: 'TEAM' as const,
    sourceParticipantId: s.sourceParticipantId,
    sourcePlayerId: null,
    playerNameSnapshot: null,
    teamNameSnapshot: participantName(input, s.sourceParticipantId),
    valueNumber: s.pointsPercentage,
    valueText: s.pointsPercentage.toFixed(4),
    rank: i + 1,
    shared,
    criteriaSnapshotText: 'Highest points percentage in final regular-season standings',
    sourceStageId: stageId,
    sourceSnapshotHash: s.sourceSnapshotHash,
  }));
}

/**
 * Pure award calculation from archived final snapshots.
 * Ties produce shared awards with stable recipient ordering.
 */
export function calculateArchiveAwards(input: AwardCalculationInput): NormalizedArchiveAward[] {
  const awards: NormalizedArchiveAward[] = [];

  if (input.championSourceParticipantId) {
    awards.push({
      awardType: 'CHAMPION',
      awardNameSnapshot: AWARD_NAMES.CHAMPION!,
      recipientType: 'TEAM',
      sourceParticipantId: input.championSourceParticipantId,
      sourcePlayerId: null,
      playerNameSnapshot: null,
      teamNameSnapshot: input.championNameSnapshot ?? participantName(input, input.championSourceParticipantId),
      valueNumber: null,
      valueText: 'Champion',
      rank: 1,
      shared: false,
      criteriaSnapshotText: 'Final playoff champion',
      sourceStageId: input.playoffStageId,
      sourceSnapshotHash: `champion:${input.championSourceParticipantId}`,
    });
  }

  awards.push(...regularSeasonChampion(input.standings, input.regularSeasonStageId, input));
  awards.push(...bestRecord(input.standings, input.regularSeasonStageId, input));
  awards.push(
    ...leaderAwards(
      input.playerStats,
      'points',
      'MOST_POINTS',
      input.regularSeasonStageId,
      'Highest regular-season player points',
    ),
  );
  awards.push(
    ...leaderAwards(
      input.playerStats,
      'goals',
      'MOST_GOALS',
      input.regularSeasonStageId,
      'Highest regular-season player goals',
    ),
  );
  awards.push(
    ...leaderAwards(
      input.playerStats,
      'assists',
      'MOST_ASSISTS',
      input.regularSeasonStageId,
      'Highest regular-season player assists',
    ),
  );
  awards.push(
    ...bestGoalieAwards(input.playerStats, input.regularSeasonStageId, input.minimumGoalieGames),
  );
  awards.push(
    ...leaderAwards(
      input.playerStats,
      'points',
      'PLAYOFF_MOST_POINTS',
      input.playoffStageId,
      'Highest playoff player points',
    ),
  );
  awards.push(
    ...leaderAwards(
      input.playerStats,
      'goals',
      'PLAYOFF_MOST_GOALS',
      input.playoffStageId,
      'Highest playoff player goals',
    ),
  );

  return awards.sort((a, b) => {
    const t = a.awardType.localeCompare(b.awardType);
    if (t !== 0) return t;
    if (a.rank !== b.rank) return a.rank - b.rank;
    return (a.sourcePlayerId ?? a.sourceParticipantId ?? '').localeCompare(
      b.sourcePlayerId ?? b.sourceParticipantId ?? '',
    );
  });
}

/** Default minimum goalie games: 25% of scheduled team games, rounded up, min 1. */
export function defaultMinimumGoalieGames(teamScheduledGames: number): number {
  if (teamScheduledGames <= 0) return 1;
  return Math.max(1, Math.ceil(teamScheduledGames * 0.25));
}
