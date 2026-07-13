import type { PrismaClient } from '@prisma/client';
import {
  ARCHIVE_SCHEMA_VERSION,
  calculateArchiveAwards,
  computeSourceSnapshotHash,
  defaultMinimumGoalieGames,
  type ArchivePlayoffResult,
  type NormalizedCompetitionArchive,
  type NormalizedArchiveMatchSummary,
  type NormalizedArchiveSeries,
} from '@fhm/engine';
import { prisma } from '../db/client.js';
import { getArchiveReadiness } from './competition-archive-readiness.js';
import { CommissionerHttpError } from '../commissioner/errors.js';

type Db = PrismaClient;

function playoffResultFor(
  participantId: string,
  championId: string | null,
  series: Array<{
    roundNumber: number;
    winnerParticipantId: string | null;
    participant1Id: string;
    participant2Id: string;
    status: string;
  }>,
  maxRound: number,
  qualified: boolean,
): ArchivePlayoffResult | null {
  if (!qualified) return 'DID_NOT_QUALIFY';
  if (championId && participantId === championId) return 'CHAMPION';
  const lost = series.filter(
    (s) =>
      s.status === 'COMPLETED' &&
      s.winnerParticipantId &&
      s.winnerParticipantId !== participantId &&
      (s.participant1Id === participantId || s.participant2Id === participantId),
  );
  if (lost.length === 0) return 'ELIMINATED';
  const highestLostRound = Math.max(...lost.map((s) => s.roundNumber));
  if (highestLostRound === maxRound) return 'FINALIST';
  if (highestLostRound === maxRound - 1) return 'SEMIFINALIST';
  if (highestLostRound === maxRound - 2) return 'QUARTERFINALIST';
  return 'ELIMINATED';
}

/**
 * Build canonical normalized archive input from a COMPLETED edition.
 */
export async function buildNormalizedArchive(
  editionId: string,
  db: Db = prisma,
): Promise<{
  archive: NormalizedCompetitionArchive;
  officialMatchIds: string[];
  standingHashes: string[];
  seriesCount: number;
  scheduledTeamGames: number;
}> {
  const readiness = await getArchiveReadiness(editionId, db);
  if (!readiness) {
    throw new CommissionerHttpError(404, 'CompetitionEditionNotFound', 'Edition not found');
  }
  if (readiness.status === 'NOT_READY') {
    throw new CommissionerHttpError(
      422,
      'ArchiveNotReady',
      readiness.blockers[0] ?? 'Edition is not ready to archive',
      { readiness },
    );
  }

  const edition = await db.competitionEdition.findUniqueOrThrow({
    where: { id: editionId },
    include: {
      competition: true,
      worldSeason: true,
      participants: {
        orderBy: { participantOrder: 'asc' },
        include: {
          team: {
            include: {
              country: true,
              league: true,
            },
          },
          stageParticipants: true,
        },
      },
      stages: {
        orderBy: { stageOrder: 'asc' },
        include: {
          standings: { orderBy: { rank: 'asc' } },
          teamStats: true,
          playerStats: true,
          playoffSeries: { orderBy: [{ roundNumber: 'asc' }, { seriesOrder: 'asc' }] },
          matches: {
            where: { source: 'COMPETITION' },
            orderBy: [{ scheduleOrder: 'asc' }, { playoffGameNumber: 'asc' }],
            include: { results: true },
          },
          aggregatedMatches: {
            orderBy: { scheduleOrder: 'asc' },
            include: { run: true },
          },
        },
      },
    },
  });

  const isAggregated = edition.competition.simulationLevel === 'AGGREGATED';
  const teamIdToParticipant = new Map(
    edition.participants.map((p) => [p.teamId, p] as const),
  );

  const rsStage = edition.stages.find((s) => s.stageType === 'REGULAR_SEASON');
  const playoffStage = edition.stages.find(
    (s) => s.stageType === 'BEST_OF_SERIES' || s.stageType === 'KNOCKOUT',
  );
  const championSourceParticipantId =
    playoffStage?.championParticipantId ?? rsStage?.championParticipantId ?? null;
  const championParticipant = edition.participants.find(
    (p) => p.id === championSourceParticipantId,
  );

  const allSeries = playoffStage?.playoffSeries ?? [];
  const maxRound = allSeries.reduce((m, s) => Math.max(m, s.roundNumber), 0);
  const qualifiedIds = new Set(
    (rsStage?.standings ?? []).filter((s) => s.qualified).map((s) => s.competitionParticipantId),
  );

  const participants = edition.participants.map((p) => {
    const standing = rsStage?.standings.find((s) => s.competitionParticipantId === p.id);
    const qualified = playoffStage
      ? (standing?.qualified ?? qualifiedIds.has(p.id))
      : Boolean(standing);
    const playoffSp = playoffStage?.matches.length
      ? allSeries.find(
          (s) => s.participant1Id === p.id || s.participant2Id === p.id,
        )
      : null;
    const seedFromSeries =
      playoffSp?.participant1Id === p.id
        ? playoffSp.participant1Seed
        : playoffSp?.participant2Id === p.id
          ? playoffSp.participant2Seed
          : null;
    const finalPlayoffResult = playoffStage
      ? playoffResultFor(
          p.id,
          championSourceParticipantId,
          allSeries,
          maxRound,
          Boolean(qualified),
        )
      : p.id === championSourceParticipantId
        ? ('CHAMPION' as const)
        : null;
    return {
      sourceCompetitionParticipantId: p.id,
      sourceTeamId: p.teamId,
      participantOrder: p.participantOrder,
      seed: p.seed,
      finalStatus: p.status,
      teamNameSnapshot: p.teamNameSnapshot,
      teamShortNameSnapshot: p.teamShortNameSnapshot,
      countryNameSnapshot: p.team.country?.name ?? null,
      leagueNameSnapshot: p.team.league?.name ?? null,
      groupKey: p.groupKey,
      qualifiedForPlayoffs: Boolean(qualified),
      playoffSeed: seedFromSeries,
      finalRegularSeasonRank: standing?.rank ?? null,
      finalPlayoffResult,
    };
  });

  const stages = edition.stages.map((s) => ({
    sourceCompetitionStageId: s.id,
    stageOrder: s.stageOrder,
    stageNameSnapshot: s.name,
    stageType: s.stageType,
    finalStatus: s.status,
    configSnapshotText: s.configText,
    configHash: s.configHash,
    scheduleHash: s.scheduleHash,
    bracketHash: s.bracketHash,
    matchCount: isAggregated
      ? s.aggregatedMatches.filter((m) => m.run.isCurrent && m.run.status === 'COMPLETED').length
      : s.matches.length,
    completedAtSnapshot: s.completedAt?.toISOString() ?? null,
    championSourceParticipantId: s.championParticipantId,
    snapshotHash: s.bracketHash || s.scheduleHash || s.configHash || s.id,
    sourceStageSourceId: s.sourceStageId,
  }));

  const standings = edition.stages.flatMap((stage) =>
    stage.standings.map((st) => ({
      sourceStageId: stage.id,
      sourceParticipantId: st.competitionParticipantId,
      rank: st.rank,
      gamesPlayed: st.gamesPlayed,
      regulationWins: st.regulationWins,
      overtimeWins: st.overtimeWins,
      shootoutWins: st.shootoutWins,
      regulationLosses: st.regulationLosses,
      overtimeLosses: st.overtimeLosses,
      shootoutLosses: st.shootoutLosses,
      ties: st.ties,
      wins: st.wins,
      losses: st.losses,
      goalsFor: st.goalsFor,
      goalsAgainst: st.goalsAgainst,
      goalDifference: st.goalDifference,
      points: st.points,
      pointsPercentage: st.pointsPercentage,
      qualified: st.qualified,
      tiebreakerSummaryText: st.tiebreakerSummaryText,
      sourceSnapshotHash: st.snapshotHash,
    })),
  );

  const teamStats = edition.stages.flatMap((stage) =>
    stage.teamStats.map((t) => {
      const wins =
        stage.stageType === 'BEST_OF_SERIES'
          ? allSeries.filter(
              (s) => s.winnerParticipantId === t.competitionParticipantId,
            ).length
          : standings.find(
              (s) =>
                s.sourceStageId === stage.id &&
                s.sourceParticipantId === t.competitionParticipantId,
            )?.wins ?? 0;
      const losses =
        stage.stageType === 'BEST_OF_SERIES'
          ? allSeries.filter(
              (s) =>
                s.status === 'COMPLETED' &&
                s.winnerParticipantId &&
                s.winnerParticipantId !== t.competitionParticipantId &&
                (s.participant1Id === t.competitionParticipantId ||
                  s.participant2Id === t.competitionParticipantId),
            ).length
          : standings.find(
              (s) =>
                s.sourceStageId === stage.id &&
                s.sourceParticipantId === t.competitionParticipantId,
            )?.losses ?? 0;
      return {
        sourceStageId: stage.id,
        sourceParticipantId: t.competitionParticipantId,
        gamesPlayed: t.gamesPlayed,
        goals: t.goals,
        goalsAgainst: t.goalsAgainst,
        shots: t.shotsOnGoal,
        shotAttempts: t.shotAttempts,
        shootingPercentage: t.shootingPercentage,
        penalties: t.penalties,
        penaltyMinutes: t.penaltyMinutes,
        powerPlayOpportunities: t.powerPlayOpportunities,
        powerPlayGoals: t.powerPlayGoals,
        powerPlayPercentage: t.powerPlayPercentage,
        shortHandedGoals: t.shortHandedGoals,
        wins,
        losses,
        overtimeLosses: 0,
        seriesWins: stage.stageType === 'BEST_OF_SERIES' ? wins : 0,
        seriesLosses: stage.stageType === 'BEST_OF_SERIES' ? losses : 0,
        statsSnapshotText: t.statsJson,
        sourceSnapshotHash: t.snapshotHash,
      };
    }),
  );

  const playerStats = edition.stages.flatMap((stage) =>
    stage.playerStats.map((p) => {
      const part = teamIdToParticipant.get(p.teamId);
      return {
        sourceStageId: stage.id,
        sourcePlayerId: p.playerId,
        sourceTeamId: p.teamId,
        sourceParticipantId: part?.id ?? null,
        playerNameSnapshot: `${p.firstNameSnapshot} ${p.lastNameSnapshot}`.trim(),
        teamNameSnapshot: p.teamNameSnapshot,
        positionSnapshot: p.position,
        isGoalie: p.isGoalie,
        gamesPlayed: p.gamesPlayed,
        goals: p.goals,
        assists: p.assists,
        points: p.points,
        shots: p.shotsOnGoal,
        shotAttempts: 0,
        shootingPercentage: p.shootingPercentage,
        penaltyMinutes: p.penaltyMinutes,
        powerPlayGoals: p.powerPlayGoals,
        shortHandedGoals: p.shortHandedGoals,
        shootoutAttempts: p.shootoutAttempts,
        shootoutGoals: p.shootoutGoals,
        goalieWins: p.wins,
        goalieLosses: p.losses,
        overtimeLosses: 0,
        shotsAgainst: p.shotsAgainst,
        saves: p.saves,
        goalsAgainst: p.goalsAgainst,
        savePercentage: p.savePercentage,
        shutouts: p.shutouts,
        statsSnapshotText: p.statsJson,
        sourceSnapshotHash: p.snapshotHash,
      };
    }),
  );

  const matches: NormalizedArchiveMatchSummary[] = [];
  const engineVersions = new Set<string>();
  const balanceVersions = new Set<string>();
  const currentResultIds: string[] = [];
  const resultTraceHashes: string[] = [];

  if (isAggregated) {
    for (const stage of edition.stages) {
      for (const m of stage.aggregatedMatches) {
        if (!m.run.isCurrent || m.run.status !== 'COMPLETED') continue;
        engineVersions.add('aggregated-f21');
        if (m.run.balanceHash) balanceVersions.add(m.run.balanceHash);
        currentResultIds.push(m.id);
        resultTraceHashes.push(m.resultHash);
        matches.push({
          sourceStageId: stage.id,
          sourceMatchId: `agg:${m.id}`,
          sourceCurrentResultId: m.resultHash,
          sourcePlayoffSeriesId: null,
          scheduleOrder: m.scheduleOrder,
          roundNumber: m.roundNumber,
          slotNumber: m.slotNumber,
          gameNumber: null,
          homeSourceParticipantId: m.homeCompetitionParticipantId,
          awaySourceParticipantId: m.awayCompetitionParticipantId,
          homeNameSnapshot: m.homeTeamNameSnapshot,
          awayNameSnapshot: m.awayTeamNameSnapshot,
          homeScore: m.homeScore,
          awayScore: m.awayScore,
          decisionType: m.decisionType,
          matchStatus: 'COMPLETED',
          seed: m.seed,
          engineVersion: 'aggregated-f21',
          balanceVersionSnapshot: m.run.balanceHash ?? 'aggregated',
          resultTraceHash: m.resultHash,
          completedAtSnapshot: m.completedAt?.toISOString() ?? null,
        });
      }
    }
  } else {
    for (const stage of edition.stages) {
      for (const m of stage.matches) {
        if (m.status !== 'COMPLETED' || !m.currentResultId) continue;
        const result = m.results.find((r) => r.id === m.currentResultId);
        if (!result || result.supersededAt) continue;
        const homePart = teamIdToParticipant.get(m.homeTeamId);
        const awayPart = teamIdToParticipant.get(m.awayTeamId);
        if (!homePart || !awayPart) continue;
        engineVersions.add(result.engineVersion);
        const bal = `${result.balancePresetId}@${result.balanceVersionNumber}`;
        balanceVersions.add(bal);
        currentResultIds.push(result.id);
        resultTraceHashes.push(result.traceHash);
        matches.push({
          sourceStageId: stage.id,
          sourceMatchId: m.id,
          sourceCurrentResultId: result.id,
          sourcePlayoffSeriesId: m.playoffSeriesId,
          scheduleOrder: m.scheduleOrder,
          roundNumber: m.competitionRoundNumber,
          slotNumber: m.competitionSlotNumber,
          gameNumber: m.playoffGameNumber,
          homeSourceParticipantId: homePart.id,
          awaySourceParticipantId: awayPart.id,
          homeNameSnapshot: homePart.teamNameSnapshot,
          awayNameSnapshot: awayPart.teamNameSnapshot,
          homeScore: result.homeScore,
          awayScore: result.awayScore,
          decisionType: result.decisionType,
          matchStatus: m.status,
          seed: result.randomSeed,
          engineVersion: result.engineVersion,
          balanceVersionSnapshot: bal,
          resultTraceHash: result.traceHash,
          completedAtSnapshot: result.completedAt?.toISOString() ?? null,
        });
      }
    }
  }

  const series: NormalizedArchiveSeries[] = allSeries.map((s) => {
    const games = (playoffStage?.matches ?? [])
      .filter((m) => m.playoffSeriesId === s.id && m.status === 'COMPLETED' && m.currentResultId)
      .map((m) => {
        const result = m.results.find((r) => r.id === m.currentResultId)!;
        const homePart = teamIdToParticipant.get(m.homeTeamId)!;
        const awayPart = teamIdToParticipant.get(m.awayTeamId)!;
        return {
          sourceMatchId: m.id,
          sourceCurrentResultId: result.id,
          gameNumber: m.playoffGameNumber ?? 0,
          homeSourceParticipantId: homePart.id,
          awaySourceParticipantId: awayPart.id,
          homeScore: result.homeScore,
          awayScore: result.awayScore,
          decisionType: result.decisionType,
          engineVersion: result.engineVersion,
          balanceVersionIdSnapshot: result.balancePresetVersionId,
          seed: result.randomSeed,
          traceHash: result.traceHash,
          completedAtSnapshot: result.completedAt?.toISOString() ?? null,
        };
      })
      .sort((a, b) => a.gameNumber - b.gameNumber);
    return {
      sourceStageId: playoffStage!.id,
      sourcePlayoffSeriesId: s.id,
      roundNumber: s.roundNumber,
      roundNameSnapshot: s.roundName,
      seriesOrder: s.seriesOrder,
      bracketSlot: s.bracketSlot,
      participant1SourceId: s.participant1Id,
      participant2SourceId: s.participant2Id,
      participant1Seed: s.participant1Seed,
      participant2Seed: s.participant2Seed,
      participant1Wins: s.participant1Wins,
      participant2Wins: s.participant2Wins,
      winsRequired: s.winsRequired,
      winnerSourceParticipantId: s.winnerParticipantId,
      homePatternSnapshotText: s.homePatternText,
      status: s.status,
      startedAtSnapshot: s.startedAt?.toISOString() ?? null,
      completedAtSnapshot: s.completedAt?.toISOString() ?? null,
      games,
    };
  });

  const sourceSnapshotHash =
    readiness.sourceSnapshotHash ??
    computeSourceSnapshotHash({
      competitionEditionId: edition.id,
      rulesHash: edition.rulesHash,
      participantIds: edition.participants.map((p) => p.id),
      stageHashes: stages.map((s) => s.snapshotHash),
      standingHashes: standings.map((s) => s.sourceSnapshotHash),
      teamStatHashes: teamStats.map((t) => t.sourceSnapshotHash),
      playerStatHashes: playerStats.map((p) => p.sourceSnapshotHash),
      bracketHashes: stages.map((s) => s.bracketHash).filter(Boolean) as string[],
      championSourceParticipantId,
      currentResultIds,
      resultTraceHashes,
      engineVersions: [...engineVersions],
      balanceVersions: [...balanceVersions],
    });

  const scheduledTeamGames = rsStage
    ? Math.max(
        1,
        Math.floor(
          ((isAggregated
            ? rsStage.aggregatedMatches.filter((m) => m.run.isCurrent && m.run.status === 'COMPLETED')
                .length
            : rsStage.matches.length) *
            2) /
            Math.max(1, edition.participants.length),
        ),
      )
    : 1;
  const minimumGoalieGames = defaultMinimumGoalieGames(scheduledTeamGames);

  const awards = calculateArchiveAwards({
    minimumGoalieGames,
    championSourceParticipantId,
    championNameSnapshot:
      playoffStage?.championTeamNameSnapshot ??
      rsStage?.championTeamNameSnapshot ??
      championParticipant?.teamNameSnapshot ??
      null,
    regularSeasonStageId: rsStage?.id ?? null,
    playoffStageId: playoffStage?.id ?? null,
    standings,
    playerStats,
    participants,
  });

  const archive: NormalizedCompetitionArchive = {
    archiveSchemaVersion: ARCHIVE_SCHEMA_VERSION,
    competitionId: edition.competitionId,
    competitionEditionId: edition.id,
    worldSeasonId: edition.worldSeasonId,
    competitionNameSnapshot: edition.competition.name,
    competitionShortNameSnapshot: edition.competition.shortName,
    editionNameSnapshot: edition.displayName,
    worldSeasonNameSnapshot: edition.worldSeason.label,
    competitionTypeSnapshot: edition.competition.type,
    simulationLevelSnapshot: edition.competition.simulationLevel,
    rulesSnapshotText: edition.rulesSnapshotText,
    rulesHash: edition.rulesHash,
    engineVersions: [...engineVersions].sort(),
    balanceVersions: [...balanceVersions].sort(),
    participantCount: participants.length,
    stageCount: stages.length,
    matchCount: matches.length,
    championSourceParticipantId,
    championTeamSourceId: championParticipant?.teamId ?? null,
    championNameSnapshot:
      playoffStage?.championTeamNameSnapshot ??
      rsStage?.championTeamNameSnapshot ??
      championParticipant?.teamNameSnapshot ??
      null,
    championShortNameSnapshot: championParticipant?.teamShortNameSnapshot ?? null,
    sourceSnapshotHash,
    participants,
    stages,
    standings,
    teamStats,
    playerStats,
    matches,
    series,
    awards,
  };

  return {
    archive,
    officialMatchIds: matches.map((m) => m.sourceMatchId),
    standingHashes: standings.map((s) => s.sourceSnapshotHash),
    seriesCount: series.length,
    scheduledTeamGames,
  };
}
