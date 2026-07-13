/**
 * F20 archive/history verifier — deterministic hash + awards smoke checks.
 */
import {
  ARCHIVE_SCHEMA_VERSION,
  calculateArchiveAwards,
  computeArchiveHash,
  computeSourceSnapshotHash,
  reconcileArchive,
  type NormalizedCompetitionArchive,
} from './index.js';

function sample(): NormalizedCompetitionArchive {
  const archive: NormalizedCompetitionArchive = {
    archiveSchemaVersion: ARCHIVE_SCHEMA_VERSION,
    competitionId: 'c',
    competitionEditionId: 'e',
    worldSeasonId: 'w',
    competitionNameSnapshot: 'League',
    competitionShortNameSnapshot: null,
    editionNameSnapshot: 'Edition',
    worldSeasonNameSnapshot: 'Season',
    competitionTypeSnapshot: 'LEAGUE',
    simulationLevelSnapshot: 'DETAILED',
    rulesSnapshotText: '{}',
    rulesHash: 'rh',
    engineVersions: ['0.1.0'],
    balanceVersions: ['b1'],
    participantCount: 1,
    stageCount: 1,
    matchCount: 0,
    championSourceParticipantId: 'p1',
    championTeamSourceId: 't1',
    championNameSnapshot: 'Team',
    championShortNameSnapshot: null,
    sourceSnapshotHash: computeSourceSnapshotHash({
      competitionEditionId: 'e',
      rulesHash: 'rh',
      participantIds: ['p1'],
      stageHashes: ['s1'],
      standingHashes: [],
      teamStatHashes: [],
      playerStatHashes: [],
      bracketHashes: [],
      championSourceParticipantId: 'p1',
      currentResultIds: [],
      resultTraceHashes: [],
      engineVersions: ['0.1.0'],
      balanceVersions: ['b1'],
    }),
    participants: [
      {
        sourceCompetitionParticipantId: 'p1',
        sourceTeamId: 't1',
        participantOrder: 1,
        seed: 1,
        finalStatus: 'CHAMPION',
        teamNameSnapshot: 'Team',
        teamShortNameSnapshot: null,
        countryNameSnapshot: null,
        leagueNameSnapshot: null,
        groupKey: null,
        qualifiedForPlayoffs: true,
        playoffSeed: 1,
        finalRegularSeasonRank: 1,
        finalPlayoffResult: 'CHAMPION',
      },
    ],
    stages: [
      {
        sourceCompetitionStageId: 'po',
        stageOrder: 1,
        stageNameSnapshot: 'Finals',
        stageType: 'BEST_OF_SERIES',
        finalStatus: 'COMPLETED',
        configSnapshotText: '{}',
        configHash: 'c',
        scheduleHash: null,
        bracketHash: null,
        matchCount: 0,
        completedAtSnapshot: null,
        championSourceParticipantId: 'p1',
        snapshotHash: 's1',
        sourceStageSourceId: null,
      },
    ],
    standings: [],
    teamStats: [],
    playerStats: [],
    matches: [],
    series: [],
    awards: [],
  };
  archive.awards = calculateArchiveAwards({
    minimumGoalieGames: 1,
    championSourceParticipantId: 'p1',
    championNameSnapshot: 'Team',
    regularSeasonStageId: null,
    playoffStageId: 'po',
    standings: [],
    playerStats: [],
    participants: archive.participants,
  });
  return archive;
}

function main() {
  const archive = sample();
  const hash1 = computeArchiveHash(archive);
  const hash2 = computeArchiveHash(archive);
  if (hash1 !== hash2) throw new Error('archive hash not stable');
  const recon = reconcileArchive(archive, {
    participantCount: 1,
    officialMatchIds: [],
    standingHashes: [],
    championSourceParticipantId: 'p1',
    seriesCount: 0,
  });
  if (!recon.ok) throw new Error(`reconciliation failed: ${JSON.stringify(recon.issues)}`);
  if (!archive.awards.some((a) => a.awardType === 'CHAMPION')) {
    throw new Error('missing champion award');
  }
  console.log(
    JSON.stringify({
      ok: true,
      archiveSchemaVersion: ARCHIVE_SCHEMA_VERSION,
      archiveHash: hash1,
      sourceSnapshotHash: archive.sourceSnapshotHash,
      awardCount: archive.awards.length,
    }),
  );
}

main();
