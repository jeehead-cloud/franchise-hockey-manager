import type { CommissionerAuditSource, Prisma } from '@prisma/client';
import {
  computeArchiveHash,
  reconcileArchive,
  type NormalizedCompetitionArchive,
} from '@fhm/engine';
import { prisma } from '../db/client.js';
import { CommissionerHttpError } from '../commissioner/errors.js';
import { assertExpectedUpdatedAt, writeCompetitionAudit } from './competition-helpers.js';
import { createSqliteSafetyBackup } from './sqlite-backup.js';
import { buildNormalizedArchive } from './competition-archive-builder.js';
import { getArchiveReadiness } from './competition-archive-readiness.js';

async function persistArchiveChildren(
  tx: Prisma.TransactionClient,
  archiveId: string,
  archive: NormalizedCompetitionArchive,
) {
  const participantIdBySource = new Map<string, string>();
  const stageIdBySource = new Map<string, string>();

  for (const p of archive.participants) {
    const row = await tx.archiveParticipant.create({
      data: {
        competitionArchiveId: archiveId,
        sourceCompetitionParticipantId: p.sourceCompetitionParticipantId,
        sourceTeamId: p.sourceTeamId,
        participantOrder: p.participantOrder,
        seed: p.seed,
        finalStatus: p.finalStatus,
        teamNameSnapshot: p.teamNameSnapshot,
        teamShortNameSnapshot: p.teamShortNameSnapshot,
        countryNameSnapshot: p.countryNameSnapshot,
        leagueNameSnapshot: p.leagueNameSnapshot,
        groupKey: p.groupKey,
        qualifiedForPlayoffs: p.qualifiedForPlayoffs,
        playoffSeed: p.playoffSeed,
        finalRegularSeasonRank: p.finalRegularSeasonRank,
        finalPlayoffResult: p.finalPlayoffResult,
      },
    });
    participantIdBySource.set(p.sourceCompetitionParticipantId, row.id);
  }

  for (const s of archive.stages) {
    const row = await tx.archiveStage.create({
      data: {
        competitionArchiveId: archiveId,
        sourceCompetitionStageId: s.sourceCompetitionStageId,
        stageOrder: s.stageOrder,
        stageNameSnapshot: s.stageNameSnapshot,
        stageType: s.stageType,
        finalStatus: s.finalStatus,
        configSnapshotText: s.configSnapshotText,
        configHash: s.configHash,
        scheduleHash: s.scheduleHash,
        bracketHash: s.bracketHash,
        matchCount: s.matchCount,
        completedAtSnapshot: s.completedAtSnapshot ? new Date(s.completedAtSnapshot) : null,
        championParticipantArchiveId: s.championSourceParticipantId
          ? participantIdBySource.get(s.championSourceParticipantId) ?? null
          : null,
        sourceStageArchiveId: null,
        snapshotHash: s.snapshotHash,
      },
    });
    stageIdBySource.set(s.sourceCompetitionStageId, row.id);
  }

  // Resolve sourceStageArchiveId now that stages exist
  for (const s of archive.stages) {
    if (!s.sourceStageSourceId) continue;
    const archiveStageId = stageIdBySource.get(s.sourceCompetitionStageId);
    const sourceArchiveId = stageIdBySource.get(s.sourceStageSourceId);
    if (archiveStageId && sourceArchiveId) {
      await tx.archiveStage.update({
        where: { id: archiveStageId },
        data: { sourceStageArchiveId: sourceArchiveId },
      });
    }
  }

  for (const st of archive.standings) {
    await tx.archiveStanding.create({
      data: {
        competitionArchiveId: archiveId,
        archiveStageId: stageIdBySource.get(st.sourceStageId)!,
        archiveParticipantId: participantIdBySource.get(st.sourceParticipantId)!,
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
        sourceSnapshotHash: st.sourceSnapshotHash,
      },
    });
  }

  for (const t of archive.teamStats) {
    await tx.archiveTeamStat.create({
      data: {
        competitionArchiveId: archiveId,
        archiveStageId: stageIdBySource.get(t.sourceStageId)!,
        archiveParticipantId: participantIdBySource.get(t.sourceParticipantId)!,
        gamesPlayed: t.gamesPlayed,
        goals: t.goals,
        goalsAgainst: t.goalsAgainst,
        shots: t.shots,
        shotAttempts: t.shotAttempts,
        shootingPercentage: t.shootingPercentage,
        penalties: t.penalties,
        penaltyMinutes: t.penaltyMinutes,
        powerPlayOpportunities: t.powerPlayOpportunities,
        powerPlayGoals: t.powerPlayGoals,
        powerPlayPercentage: t.powerPlayPercentage,
        shortHandedGoals: t.shortHandedGoals,
        wins: t.wins,
        losses: t.losses,
        overtimeLosses: t.overtimeLosses,
        seriesWins: t.seriesWins,
        seriesLosses: t.seriesLosses,
        statsSnapshotText: t.statsSnapshotText,
        sourceSnapshotHash: t.sourceSnapshotHash,
      },
    });
  }

  for (const p of archive.playerStats) {
    await tx.archivePlayerStat.create({
      data: {
        competitionArchiveId: archiveId,
        archiveStageId: stageIdBySource.get(p.sourceStageId)!,
        sourcePlayerId: p.sourcePlayerId,
        sourceTeamId: p.sourceTeamId,
        archiveParticipantId: p.sourceParticipantId
          ? participantIdBySource.get(p.sourceParticipantId) ?? null
          : null,
        playerNameSnapshot: p.playerNameSnapshot,
        teamNameSnapshot: p.teamNameSnapshot,
        positionSnapshot: p.positionSnapshot,
        isGoalie: p.isGoalie,
        gamesPlayed: p.gamesPlayed,
        goals: p.goals,
        assists: p.assists,
        points: p.points,
        shots: p.shots,
        shotAttempts: p.shotAttempts,
        shootingPercentage: p.shootingPercentage,
        penaltyMinutes: p.penaltyMinutes,
        powerPlayGoals: p.powerPlayGoals,
        shortHandedGoals: p.shortHandedGoals,
        shootoutAttempts: p.shootoutAttempts,
        shootoutGoals: p.shootoutGoals,
        goalieWins: p.goalieWins,
        goalieLosses: p.goalieLosses,
        overtimeLosses: p.overtimeLosses,
        shotsAgainst: p.shotsAgainst,
        saves: p.saves,
        goalsAgainst: p.goalsAgainst,
        savePercentage: p.savePercentage,
        shutouts: p.shutouts,
        statsSnapshotText: p.statsSnapshotText,
        sourceSnapshotHash: p.sourceSnapshotHash,
      },
    });
  }

  for (const m of archive.matches) {
    await tx.archiveMatchSummary.create({
      data: {
        competitionArchiveId: archiveId,
        archiveStageId: stageIdBySource.get(m.sourceStageId)!,
        sourceMatchId: m.sourceMatchId,
        sourceCurrentResultId: m.sourceCurrentResultId,
        sourcePlayoffSeriesId: m.sourcePlayoffSeriesId,
        scheduleOrder: m.scheduleOrder,
        roundNumber: m.roundNumber,
        slotNumber: m.slotNumber,
        gameNumber: m.gameNumber,
        homeArchiveParticipantId: participantIdBySource.get(m.homeSourceParticipantId)!,
        awayArchiveParticipantId: participantIdBySource.get(m.awaySourceParticipantId)!,
        homeNameSnapshot: m.homeNameSnapshot,
        awayNameSnapshot: m.awayNameSnapshot,
        homeScore: m.homeScore,
        awayScore: m.awayScore,
        decisionType: m.decisionType,
        matchStatus: m.matchStatus,
        seed: m.seed,
        engineVersion: m.engineVersion,
        balanceVersionSnapshot: m.balanceVersionSnapshot,
        resultTraceHash: m.resultTraceHash,
        completedAtSnapshot: m.completedAtSnapshot ? new Date(m.completedAtSnapshot) : null,
      },
    });
  }

  for (const s of archive.series) {
    const seriesRow = await tx.archiveSeries.create({
      data: {
        competitionArchiveId: archiveId,
        archiveStageId: stageIdBySource.get(s.sourceStageId)!,
        sourcePlayoffSeriesId: s.sourcePlayoffSeriesId,
        roundNumber: s.roundNumber,
        roundNameSnapshot: s.roundNameSnapshot,
        seriesOrder: s.seriesOrder,
        bracketSlot: s.bracketSlot,
        participant1ArchiveId: participantIdBySource.get(s.participant1SourceId)!,
        participant2ArchiveId: participantIdBySource.get(s.participant2SourceId)!,
        participant1Seed: s.participant1Seed,
        participant2Seed: s.participant2Seed,
        participant1Wins: s.participant1Wins,
        participant2Wins: s.participant2Wins,
        winsRequired: s.winsRequired,
        winnerArchiveParticipantId: s.winnerSourceParticipantId
          ? participantIdBySource.get(s.winnerSourceParticipantId) ?? null
          : null,
        homePatternSnapshotText: s.homePatternSnapshotText,
        status: s.status,
        startedAtSnapshot: s.startedAtSnapshot ? new Date(s.startedAtSnapshot) : null,
        completedAtSnapshot: s.completedAtSnapshot ? new Date(s.completedAtSnapshot) : null,
      },
    });
    for (const g of s.games) {
      await tx.archiveSeriesGame.create({
        data: {
          archiveSeriesId: seriesRow.id,
          sourceMatchId: g.sourceMatchId,
          sourceCurrentResultId: g.sourceCurrentResultId,
          gameNumber: g.gameNumber,
          homeArchiveParticipantId: participantIdBySource.get(g.homeSourceParticipantId)!,
          awayArchiveParticipantId: participantIdBySource.get(g.awaySourceParticipantId)!,
          homeScore: g.homeScore,
          awayScore: g.awayScore,
          decisionType: g.decisionType,
          engineVersion: g.engineVersion,
          balanceVersionIdSnapshot: g.balanceVersionIdSnapshot,
          seed: g.seed,
          traceHash: g.traceHash,
          completedAtSnapshot: g.completedAtSnapshot ? new Date(g.completedAtSnapshot) : null,
        },
      });
    }
  }

  for (const a of archive.awards) {
    await tx.archiveAward.create({
      data: {
        competitionArchiveId: archiveId,
        archiveStageId: a.sourceStageId ? stageIdBySource.get(a.sourceStageId) ?? null : null,
        awardType: a.awardType,
        awardNameSnapshot: a.awardNameSnapshot,
        recipientType: a.recipientType,
        archiveParticipantId: a.sourceParticipantId
          ? participantIdBySource.get(a.sourceParticipantId) ?? null
          : null,
        sourcePlayerId: a.sourcePlayerId,
        playerNameSnapshot: a.playerNameSnapshot,
        teamNameSnapshot: a.teamNameSnapshot,
        valueNumber: a.valueNumber,
        valueText: a.valueText,
        rank: a.rank,
        shared: a.shared,
        criteriaSnapshotText: a.criteriaSnapshotText,
        sourceSnapshotHash: a.sourceSnapshotHash,
      },
    });
  }
}

export async function archiveCompetitionEdition(
  editionId: string,
  body: { expectedUpdatedAt: string; reason: string },
  source: CommissionerAuditSource,
) {
  if (!body.reason || body.reason.trim().length < 3) {
    throw new CommissionerHttpError(400, 'InvalidArchiveRequest', 'Reason is required');
  }

  const existing = await prisma.competitionArchive.findFirst({
    where: { competitionEditionId: editionId, isCurrent: true },
  });
  const edition = await prisma.competitionEdition.findUnique({ where: { id: editionId } });
  if (!edition) {
    throw new CommissionerHttpError(404, 'CompetitionEditionNotFound', 'Edition not found');
  }

  if (existing && edition.status === 'ARCHIVED') {
    return {
      alreadyArchived: true as const,
      archive: existing,
      backup: null,
      historyPath: `/history/competitions/${existing.id}`,
    };
  }

  if (edition.status !== 'COMPLETED') {
    throw new CommissionerHttpError(
      409,
      'CompetitionEditionNotCompleted',
      `Edition must be COMPLETED before archive (current: ${edition.status})`,
    );
  }

  assertExpectedUpdatedAt(edition.updatedAt, body.expectedUpdatedAt);

  const readiness = await getArchiveReadiness(editionId);
  if (!readiness || readiness.status === 'NOT_READY') {
    throw new CommissionerHttpError(
      422,
      'ArchiveNotReady',
      readiness?.blockers[0] ?? 'Edition is not ready to archive',
      { readiness },
    );
  }

  let backup;
  try {
    backup = await createSqliteSafetyBackup({ label: 'f20-archive' });
  } catch (err) {
    throw new CommissionerHttpError(
      503,
      'BackupFailed',
      err instanceof Error ? err.message : 'Pre-archive backup failed',
    );
  }

  const built = await buildNormalizedArchive(editionId);
  const recon = reconcileArchive(built.archive, {
    participantCount: built.archive.participantCount,
    officialMatchIds: built.officialMatchIds,
    standingHashes: built.standingHashes,
    championSourceParticipantId: built.archive.championSourceParticipantId,
    seriesCount: built.seriesCount,
  });
  if (!recon.ok || !recon.recomputedArchiveHash) {
    throw new CommissionerHttpError(
      422,
      'ArchiveReconciliationFailed',
      recon.issues[0]?.message ?? 'Archive reconciliation failed',
      { issues: recon.issues },
    );
  }
  const archiveHash = recon.recomputedArchiveHash;

  try {
    const result = await prisma.$transaction(async (tx) => {
      const row = await tx.competitionEdition.findUnique({ where: { id: editionId } });
      if (!row) {
        throw new CommissionerHttpError(404, 'CompetitionEditionNotFound', 'Edition not found');
      }
      if (row.status === 'ARCHIVED') {
        const cur = await tx.competitionArchive.findFirst({
          where: { competitionEditionId: editionId, isCurrent: true },
        });
        if (cur) return { alreadyArchived: true as const, archive: cur };
      }
      assertExpectedUpdatedAt(row.updatedAt, body.expectedUpdatedAt);
      if (row.status !== 'COMPLETED') {
        throw new CommissionerHttpError(
          409,
          'CompetitionEditionNotCompleted',
          `Edition must be COMPLETED before archive`,
        );
      }

      const created = await tx.competitionArchive.create({
        data: {
          competitionId: built.archive.competitionId,
          competitionEditionId: editionId,
          worldSeasonId: built.archive.worldSeasonId,
          archiveSchemaVersion: built.archive.archiveSchemaVersion,
          archiveVersion: 1,
          status: 'CURRENT',
          competitionNameSnapshot: built.archive.competitionNameSnapshot,
          competitionShortNameSnapshot: built.archive.competitionShortNameSnapshot,
          editionNameSnapshot: built.archive.editionNameSnapshot,
          worldSeasonNameSnapshot: built.archive.worldSeasonNameSnapshot,
          competitionTypeSnapshot: built.archive.competitionTypeSnapshot,
          simulationLevelSnapshot: built.archive.simulationLevelSnapshot,
          rulesSnapshotText: built.archive.rulesSnapshotText,
          rulesHash: built.archive.rulesHash,
          engineVersionsText: JSON.stringify(built.archive.engineVersions),
          balanceVersionsText: JSON.stringify(built.archive.balanceVersions),
          participantCount: built.archive.participantCount,
          stageCount: built.archive.stageCount,
          matchCount: built.archive.matchCount,
          championParticipantSourceId: built.archive.championSourceParticipantId,
          championTeamSourceId: built.archive.championTeamSourceId,
          championNameSnapshot: built.archive.championNameSnapshot,
          championShortNameSnapshot: built.archive.championShortNameSnapshot,
          archiveHash,
          sourceSnapshotHash: built.archive.sourceSnapshotHash,
          canonicalSnapshotText: JSON.stringify(built.archive),
          archivedAt: new Date(),
          archivedBy: source,
          reason: body.reason.trim(),
          isCurrent: true,
        },
      });

      await persistArchiveChildren(tx, created.id, built.archive);

      const updated = await tx.competitionEdition.update({
        where: { id: editionId },
        data: { status: 'ARCHIVED', archivedAt: new Date() },
      });

      await writeCompetitionAudit(
        tx,
        'COMPETITION_EDITION',
        editionId,
        'EDITION_ARCHIVED',
        body.reason.trim(),
        { status: 'COMPLETED' },
        {
          status: 'ARCHIVED',
          archiveId: created.id,
          archiveHash,
          sourceSnapshotHash: built.archive.sourceSnapshotHash,
        },
        ['status', 'archivedAt', 'archiveId'],
        source,
      );

      return { alreadyArchived: false as const, archive: created, edition: updated };
    });

    return {
      ...result,
      backup,
      historyPath: `/history/competitions/${result.archive.id}`,
      archiveHash: result.archive.archiveHash,
      sourceSnapshotHash: result.archive.sourceSnapshotHash,
    };
  } catch (err) {
    if (err instanceof CommissionerHttpError) throw err;
    throw new CommissionerHttpError(
      500,
      'ArchiveCreationFailed',
      err instanceof Error ? err.message : 'Archive creation failed',
    );
  }
}

export async function getEditionArchive(editionId: string) {
  return prisma.competitionArchive.findFirst({
    where: { competitionEditionId: editionId, isCurrent: true },
  });
}

export async function listArchiveVersions(archiveId: string) {
  const archive = await prisma.competitionArchive.findUnique({ where: { id: archiveId } });
  if (!archive) return null;
  return prisma.competitionArchive.findMany({
    where: { competitionEditionId: archive.competitionEditionId },
    orderBy: { archiveVersion: 'asc' },
    select: {
      id: true,
      archiveVersion: true,
      status: true,
      isCurrent: true,
      archiveHash: true,
      sourceSnapshotHash: true,
      archivedAt: true,
      reason: true,
      supersedesArchiveId: true,
      supersededByArchiveId: true,
    },
  });
}

/** Verify archive hash recomputes from stored canonical snapshot (Commissioner diagnostic). */
export function verifyStoredArchiveHash(canonicalSnapshotText: string, expectedHash: string): boolean {
  try {
    const parsed = JSON.parse(canonicalSnapshotText) as NormalizedCompetitionArchive;
    return computeArchiveHash(parsed) === expectedHash;
  } catch {
    return false;
  }
}
