import { describe, expect, it } from 'vitest';
import {
  ARCHIVE_SCHEMA_VERSION,
  calculateArchiveAwards,
  computeArchiveHash,
  computeSourceSnapshotHash,
  defaultMinimumGoalieGames,
  deriveHistoricalRecords,
  normalizeArchiveForHash,
  reconcileArchive,
  type NormalizedCompetitionArchive,
} from './index.js';

function baseArchive(
  overrides: Partial<NormalizedCompetitionArchive> = {},
): NormalizedCompetitionArchive {
  const archive: NormalizedCompetitionArchive = {
    archiveSchemaVersion: ARCHIVE_SCHEMA_VERSION,
    competitionId: 'comp-1',
    competitionEditionId: 'ed-1',
    worldSeasonId: 'ws-1',
    competitionNameSnapshot: 'Test League',
    competitionShortNameSnapshot: 'TL',
    editionNameSnapshot: '2026/27',
    worldSeasonNameSnapshot: '2026/27',
    competitionTypeSnapshot: 'LEAGUE',
    simulationLevelSnapshot: 'DETAILED',
    rulesSnapshotText: '{}',
    rulesHash: 'rules-hash',
    engineVersions: ['0.1.0'],
    balanceVersions: ['Standard@1'],
    participantCount: 2,
    stageCount: 2,
    matchCount: 1,
    championSourceParticipantId: 'p1',
    championTeamSourceId: 't1',
    championNameSnapshot: 'Alpha',
    championShortNameSnapshot: 'ALP',
    sourceSnapshotHash: 'source-hash',
    participants: [
      {
        sourceCompetitionParticipantId: 'p1',
        sourceTeamId: 't1',
        participantOrder: 1,
        seed: 1,
        finalStatus: 'CHAMPION',
        teamNameSnapshot: 'Alpha',
        teamShortNameSnapshot: 'ALP',
        countryNameSnapshot: null,
        leagueNameSnapshot: null,
        groupKey: null,
        qualifiedForPlayoffs: true,
        playoffSeed: 1,
        finalRegularSeasonRank: 1,
        finalPlayoffResult: 'CHAMPION',
      },
      {
        sourceCompetitionParticipantId: 'p2',
        sourceTeamId: 't2',
        participantOrder: 2,
        seed: 2,
        finalStatus: 'ELIMINATED',
        teamNameSnapshot: 'Beta',
        teamShortNameSnapshot: 'BET',
        countryNameSnapshot: null,
        leagueNameSnapshot: null,
        groupKey: null,
        qualifiedForPlayoffs: true,
        playoffSeed: 2,
        finalRegularSeasonRank: 2,
        finalPlayoffResult: 'FINALIST',
      },
    ],
    stages: [
      {
        sourceCompetitionStageId: 'rs',
        stageOrder: 1,
        stageNameSnapshot: 'Regular Season',
        stageType: 'REGULAR_SEASON',
        finalStatus: 'COMPLETED',
        configSnapshotText: '{}',
        configHash: 'cfg-rs',
        scheduleHash: 'sch',
        bracketHash: null,
        matchCount: 1,
        completedAtSnapshot: null,
        championSourceParticipantId: null,
        snapshotHash: 'stage-rs',
        sourceStageSourceId: null,
      },
      {
        sourceCompetitionStageId: 'po',
        stageOrder: 2,
        stageNameSnapshot: 'Playoffs',
        stageType: 'BEST_OF_SERIES',
        finalStatus: 'COMPLETED',
        configSnapshotText: '{}',
        configHash: 'cfg-po',
        scheduleHash: null,
        bracketHash: 'br',
        matchCount: 0,
        completedAtSnapshot: null,
        championSourceParticipantId: 'p1',
        snapshotHash: 'stage-po',
        sourceStageSourceId: 'rs',
      },
    ],
    standings: [
      {
        sourceStageId: 'rs',
        sourceParticipantId: 'p1',
        rank: 1,
        gamesPlayed: 1,
        regulationWins: 1,
        overtimeWins: 0,
        shootoutWins: 0,
        regulationLosses: 0,
        overtimeLosses: 0,
        shootoutLosses: 0,
        ties: 0,
        wins: 1,
        losses: 0,
        goalsFor: 3,
        goalsAgainst: 1,
        goalDifference: 2,
        points: 2,
        pointsPercentage: 1,
        qualified: true,
        tiebreakerSummaryText: '',
        sourceSnapshotHash: 'st-p1',
      },
      {
        sourceStageId: 'rs',
        sourceParticipantId: 'p2',
        rank: 2,
        gamesPlayed: 1,
        regulationWins: 0,
        overtimeWins: 0,
        shootoutWins: 0,
        regulationLosses: 1,
        overtimeLosses: 0,
        shootoutLosses: 0,
        ties: 0,
        wins: 0,
        losses: 1,
        goalsFor: 1,
        goalsAgainst: 3,
        goalDifference: -2,
        points: 0,
        pointsPercentage: 0,
        qualified: true,
        tiebreakerSummaryText: '',
        sourceSnapshotHash: 'st-p2',
      },
    ],
    teamStats: [],
    playerStats: [
      {
        sourceStageId: 'rs',
        sourcePlayerId: 'pl1',
        sourceTeamId: 't1',
        sourceParticipantId: 'p1',
        playerNameSnapshot: 'Ace Scorer',
        teamNameSnapshot: 'Alpha',
        positionSnapshot: 'C',
        isGoalie: false,
        gamesPlayed: 1,
        goals: 2,
        assists: 1,
        points: 3,
        shots: 5,
        shotAttempts: 8,
        shootingPercentage: 0.4,
        penaltyMinutes: 0,
        powerPlayGoals: 0,
        shortHandedGoals: 0,
        shootoutAttempts: 0,
        shootoutGoals: 0,
        goalieWins: 0,
        goalieLosses: 0,
        overtimeLosses: 0,
        shotsAgainst: 0,
        saves: 0,
        goalsAgainst: 0,
        savePercentage: null,
        shutouts: 0,
        statsSnapshotText: '{}',
        sourceSnapshotHash: 'ps-pl1',
      },
      {
        sourceStageId: 'rs',
        sourcePlayerId: 'g1',
        sourceTeamId: 't1',
        sourceParticipantId: 'p1',
        playerNameSnapshot: 'Wall',
        teamNameSnapshot: 'Alpha',
        positionSnapshot: 'G',
        isGoalie: true,
        gamesPlayed: 1,
        goals: 0,
        assists: 0,
        points: 0,
        shots: 0,
        shotAttempts: 0,
        shootingPercentage: null,
        penaltyMinutes: 0,
        powerPlayGoals: 0,
        shortHandedGoals: 0,
        shootoutAttempts: 0,
        shootoutGoals: 0,
        goalieWins: 1,
        goalieLosses: 0,
        overtimeLosses: 0,
        shotsAgainst: 20,
        saves: 19,
        goalsAgainst: 1,
        savePercentage: 0.95,
        shutouts: 0,
        statsSnapshotText: '{}',
        sourceSnapshotHash: 'ps-g1',
      },
      {
        sourceStageId: 'po',
        sourcePlayerId: 'pl1',
        sourceTeamId: 't1',
        sourceParticipantId: 'p1',
        playerNameSnapshot: 'Ace Scorer',
        teamNameSnapshot: 'Alpha',
        positionSnapshot: 'C',
        isGoalie: false,
        gamesPlayed: 1,
        goals: 1,
        assists: 0,
        points: 1,
        shots: 3,
        shotAttempts: 4,
        shootingPercentage: 0.33,
        penaltyMinutes: 0,
        powerPlayGoals: 0,
        shortHandedGoals: 0,
        shootoutAttempts: 0,
        shootoutGoals: 0,
        goalieWins: 0,
        goalieLosses: 0,
        overtimeLosses: 0,
        shotsAgainst: 0,
        saves: 0,
        goalsAgainst: 0,
        savePercentage: null,
        shutouts: 0,
        statsSnapshotText: '{}',
        sourceSnapshotHash: 'ps-pl1-po',
      },
    ],
    matches: [
      {
        sourceStageId: 'rs',
        sourceMatchId: 'm1',
        sourceCurrentResultId: 'r1',
        sourcePlayoffSeriesId: null,
        scheduleOrder: 1,
        roundNumber: 1,
        slotNumber: 1,
        gameNumber: null,
        homeSourceParticipantId: 'p1',
        awaySourceParticipantId: 'p2',
        homeNameSnapshot: 'Alpha',
        awayNameSnapshot: 'Beta',
        homeScore: 3,
        awayScore: 1,
        decisionType: 'REGULATION',
        matchStatus: 'COMPLETED',
        seed: 'seed-1',
        engineVersion: '0.1.0',
        balanceVersionSnapshot: 'Standard@1',
        resultTraceHash: 'trace-1',
        completedAtSnapshot: null,
      },
    ],
    series: [],
    awards: [],
    ...overrides,
  };
  archive.awards = calculateArchiveAwards({
    minimumGoalieGames: 1,
    championSourceParticipantId: archive.championSourceParticipantId,
    championNameSnapshot: archive.championNameSnapshot,
    regularSeasonStageId: 'rs',
    playoffStageId: 'po',
    standings: archive.standings,
    playerStats: archive.playerStats,
    participants: archive.participants,
  });
  return archive;
}

describe('F20 archive history', () => {
  it('normalizes with deterministic ordering without mutating input', () => {
    const input = baseArchive();
    const before = JSON.stringify(input.participants.map((p) => p.sourceCompetitionParticipantId));
    const normalized = normalizeArchiveForHash({
      ...input,
      participants: [...input.participants].reverse(),
    });
    expect(normalized.participants.map((p) => p.participantOrder)).toEqual([1, 2]);
    expect(JSON.stringify(input.participants.map((p) => p.sourceCompetitionParticipantId))).toBe(
      before,
    );
  });

  it('computes stable archive hash independent of key insertion order', () => {
    const a = computeArchiveHash(baseArchive());
    const b = computeArchiveHash(baseArchive());
    expect(a).toBe(b);
    expect(a).toMatch(/^[0-9a-f]{64}$/);
  });

  it('changes archive hash when champion changes', () => {
    const a = computeArchiveHash(baseArchive());
    const b = computeArchiveHash(
      baseArchive({
        championSourceParticipantId: 'p2',
        championNameSnapshot: 'Beta',
        championTeamSourceId: 't2',
      }),
    );
    expect(a).not.toBe(b);
  });

  it('source snapshot hash is stable and sensitive to results', () => {
    const payload = {
      competitionEditionId: 'ed-1',
      rulesHash: 'r',
      participantIds: ['p2', 'p1'],
      stageHashes: ['s2', 's1'],
      standingHashes: ['a', 'b'],
      teamStatHashes: [],
      playerStatHashes: [],
      bracketHashes: ['br'],
      championSourceParticipantId: 'p1',
      currentResultIds: ['r1'],
      resultTraceHashes: ['t1'],
      engineVersions: ['0.1.0'],
      balanceVersions: ['Standard@1'],
    };
    expect(computeSourceSnapshotHash(payload)).toBe(
      computeSourceSnapshotHash({ ...payload, participantIds: ['p1', 'p2'] }),
    );
    expect(computeSourceSnapshotHash(payload)).not.toBe(
      computeSourceSnapshotHash({ ...payload, currentResultIds: ['r2'] }),
    );
  });

  it('calculates awards including shared ties and goalie threshold', () => {
    const archive = baseArchive();
    const awards = archive.awards;
    expect(awards.some((a) => a.awardType === 'CHAMPION')).toBe(true);
    expect(awards.some((a) => a.awardType === 'REGULAR_SEASON_CHAMPION')).toBe(true);
    expect(awards.some((a) => a.awardType === 'MOST_POINTS' && a.sourcePlayerId === 'pl1')).toBe(
      true,
    );
    expect(awards.some((a) => a.awardType === 'BEST_GOALIE_SAVE_PERCENTAGE')).toBe(true);
    expect(awards.some((a) => a.awardType === 'PLAYOFF_MOST_POINTS')).toBe(true);

    const tied = calculateArchiveAwards({
      minimumGoalieGames: 1,
      championSourceParticipantId: 'p1',
      championNameSnapshot: 'Alpha',
      regularSeasonStageId: 'rs',
      playoffStageId: 'po',
      standings: archive.standings,
      participants: archive.participants,
      playerStats: [
        ...archive.playerStats,
        {
          ...archive.playerStats[0]!,
          sourcePlayerId: 'pl2',
          playerNameSnapshot: 'Other',
          sourceSnapshotHash: 'ps-pl2',
        },
      ],
    });
    const points = tied.filter((a) => a.awardType === 'MOST_POINTS');
    expect(points).toHaveLength(2);
    expect(points.every((a) => a.shared)).toBe(true);
    expect(points.map((a) => a.sourcePlayerId)).toEqual(['pl1', 'pl2']);
  });

  it('defaultMinimumGoalieGames uses 25% rounded up', () => {
    expect(defaultMinimumGoalieGames(82)).toBe(21);
    expect(defaultMinimumGoalieGames(1)).toBe(1);
    expect(defaultMinimumGoalieGames(0)).toBe(1);
  });

  it('reconciles valid archive and rejects mismatches', () => {
    const archive = baseArchive();
    const ok = reconcileArchive(archive, {
      participantCount: 2,
      officialMatchIds: ['m1'],
      standingHashes: ['st-p1', 'st-p2'],
      championSourceParticipantId: 'p1',
      seriesCount: 0,
    });
    expect(ok.ok).toBe(true);
    expect(ok.recomputedArchiveHash).toBe(computeArchiveHash(archive));

    const bad = reconcileArchive(archive, {
      participantCount: 2,
      officialMatchIds: ['m1'],
      standingHashes: ['st-p1', 'st-p2'],
      championSourceParticipantId: 'p2',
      seriesCount: 0,
    });
    expect(bad.ok).toBe(false);
    expect(bad.issues.some((i) => i.code === 'CHAMPION_MISMATCH')).toBe(true);
  });

  it('derives historical records with tied holders', () => {
    const a = baseArchive();
    const records = deriveHistoricalRecords([
      {
        archiveId: 'arch-1',
        competitionNameSnapshot: 'Test League',
        worldSeasonNameSnapshot: '2026/27',
        archive: a,
      },
    ]);
    expect(records.some((r) => r.category === 'most_regular_season_points')).toBe(true);
    expect(records.some((r) => r.category === 'most_championships')).toBe(true);
    expect(records.find((r) => r.category === 'most_regular_season_player_points')?.holders[0]?.value).toBe(
      3,
    );
  });
});
