import type { NormalizedCompetitionArchive } from './types.js';

function cmp(a: unknown, b: unknown): number {
  if (a === b) return 0;
  if (a == null && b != null) return 1;
  if (a != null && b == null) return -1;
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  return String(a).localeCompare(String(b));
}

function sortByKeys<T>(rows: T[], keys: (keyof T)[]): T[] {
  return [...rows].sort((a, b) => {
    for (const key of keys) {
      const c = cmp(a[key], b[key]);
      if (c !== 0) return c;
    }
    return 0;
  });
}

function deepFreeze<T>(value: T): T {
  if (value === null || typeof value !== 'object') return value;
  Object.freeze(value);
  for (const v of Object.values(value as object)) {
    if (v !== null && typeof v === 'object' && !Object.isFrozen(v)) deepFreeze(v);
  }
  return value;
}

/**
 * Normalize archive DTO for hashing: deterministic ordering, no mutation of input.
 * Excludes timestamps/generated DB IDs that are not intentional snapshot identity.
 */
export function normalizeArchiveForHash(
  input: NormalizedCompetitionArchive,
): NormalizedCompetitionArchive {
  const participants = sortByKeys(input.participants, [
    'participantOrder',
    'sourceCompetitionParticipantId',
  ]);
  const stages = sortByKeys(input.stages, ['stageOrder', 'sourceCompetitionStageId']);
  const standings = sortByKeys(input.standings, ['sourceStageId', 'rank', 'sourceParticipantId']);
  const teamStats = sortByKeys(input.teamStats, ['sourceStageId', 'sourceParticipantId']);
  const playerStats = sortByKeys(input.playerStats, [
    'sourceStageId',
    'isGoalie',
    'points',
    'sourcePlayerId',
  ]);
  const matches = sortByKeys(input.matches, [
    'sourceStageId',
    'scheduleOrder',
    'gameNumber',
    'sourceMatchId',
  ]);
  const series = sortByKeys(
    input.series.map((s) => ({
      ...s,
      games: sortByKeys(s.games, ['gameNumber', 'sourceMatchId']),
    })),
    ['sourceStageId', 'roundNumber', 'seriesOrder', 'sourcePlayoffSeriesId'],
  );
  const awards = sortByKeys(input.awards, [
    'awardType',
    'rank',
    'sourcePlayerId',
    'sourceParticipantId',
  ]);

  const normalized: NormalizedCompetitionArchive = {
    archiveSchemaVersion: input.archiveSchemaVersion,
    competitionId: input.competitionId,
    competitionEditionId: input.competitionEditionId,
    worldSeasonId: input.worldSeasonId,
    competitionNameSnapshot: input.competitionNameSnapshot,
    competitionShortNameSnapshot: input.competitionShortNameSnapshot,
    editionNameSnapshot: input.editionNameSnapshot,
    worldSeasonNameSnapshot: input.worldSeasonNameSnapshot,
    competitionTypeSnapshot: input.competitionTypeSnapshot,
    simulationLevelSnapshot: input.simulationLevelSnapshot,
    rulesSnapshotText: input.rulesSnapshotText,
    rulesHash: input.rulesHash,
    engineVersions: [...input.engineVersions].sort(),
    balanceVersions: [...input.balanceVersions].sort(),
    participantCount: input.participantCount,
    stageCount: input.stageCount,
    matchCount: input.matchCount,
    championSourceParticipantId: input.championSourceParticipantId,
    championTeamSourceId: input.championTeamSourceId,
    championNameSnapshot: input.championNameSnapshot,
    championShortNameSnapshot: input.championShortNameSnapshot,
    sourceSnapshotHash: input.sourceSnapshotHash,
    participants,
    stages,
    standings,
    teamStats,
    playerStats,
    matches,
    series,
    awards,
  };

  return deepFreeze(structuredClone(normalized));
}
