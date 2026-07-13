import {
  parsePlayoffConfig,
  recomputeSeriesProgression,
  resolveGameHomeAway,
  nextRoundFixedPairings,
  nextRoundReseedPairings,
  derivePlayoffGameSeed,
  type PlayoffConfig,
} from '@fhm/engine';
import type { Prisma } from '@prisma/client';
import { prisma } from '../db/client.js';
import { parseStoredRules } from './competition-helpers.js';
import { PlayoffHttpError } from './playoff-errors.js';
import { buildPlayoffMatchRules, createSeriesGame1 } from './playoffs-bracket.js';
import { canonicalizeStoredMatchRules } from './match-rules.js';
import {
  aggregatePlayerSeasonStats,
  aggregateTeamSeasonStats,
} from '@fhm/engine';

async function loadSeriesGames(seriesId: string) {
  const matches = await prisma.match.findMany({
    where: { playoffSeriesId: seriesId, status: 'COMPLETED', currentResultId: { not: null } },
    orderBy: { playoffGameNumber: 'asc' },
  });
  const resultIds = matches.map((m) => m.currentResultId!).filter(Boolean);
  const results = await prisma.matchResult.findMany({
    where: { id: { in: resultIds }, status: 'COMPLETED' },
  });
  const byId = new Map(results.map((r) => [r.id, r]));

  const series = await prisma.playoffSeries.findUniqueOrThrow({ where: { id: seriesId } });
  const participantByTeam = new Map<string, string>();
  // Map teams via match home/away to participants using edition participants
  const stageParticipants = await prisma.stageParticipant.findMany({
    where: { competitionStageId: series.competitionStageId },
    include: { participant: true },
  });
  for (const sp of stageParticipants) {
    participantByTeam.set(sp.participant.teamId, sp.competitionParticipantId);
  }

  return matches.map((m) => {
    const result = byId.get(m.currentResultId!)!;
    const homePid = participantByTeam.get(m.homeTeamId)!;
    const awayPid = participantByTeam.get(m.awayTeamId)!;
    const winnerPid =
      result.winnerTeamId == null ? '' : participantByTeam.get(result.winnerTeamId) ?? '';
    return {
      gameNumber: m.playoffGameNumber ?? 0,
      homeParticipantId: homePid,
      awayParticipantId: awayPid,
      winnerParticipantId: winnerPid,
      decisionType: result.decisionType,
    };
  });
}

async function createNextGameIfNeeded(
  tx: Prisma.TransactionClient,
  seriesId: string,
  gameNumber: number,
) {
  const existing = await tx.match.findFirst({
    where: { playoffSeriesId: seriesId, playoffGameNumber: gameNumber },
  });
  if (existing) return existing.id;

  const series = await tx.playoffSeries.findUniqueOrThrow({
    where: { id: seriesId },
    include: { stage: { include: { edition: true, participants: { include: { participant: true } } } } },
  });
  const config = parsePlayoffConfig(JSON.parse(series.stage.configText), {
    participantCount: series.stage.participants.length,
  });
  const rules = parseStoredRules(series.stage.edition.rulesSnapshotText);
  const teamIdByParticipant = new Map(
    series.stage.participants.map((p) => [p.competitionParticipantId, p.participant.teamId]),
  );

  const higher =
    series.participant1Seed <= series.participant2Seed
      ? { id: series.participant1Id, seed: series.participant1Seed }
      : { id: series.participant2Id, seed: series.participant2Seed };
  const lower =
    series.participant1Seed <= series.participant2Seed
      ? { id: series.participant2Id, seed: series.participant2Seed }
      : { id: series.participant1Id, seed: series.participant1Seed };

  const sides = resolveGameHomeAway({
    config,
    gameNumber,
    higherSeedParticipantId: higher.id,
    lowerSeedParticipantId: lower.id,
  });
  const homeTeamId = teamIdByParticipant.get(sides.homeParticipantId)!;
  const awayTeamId = teamIdByParticipant.get(sides.awayParticipantId)!;
  const rulesJson = canonicalizeStoredMatchRules(buildPlayoffMatchRules(rules, config));

  const match = await tx.match.create({
    data: {
      homeTeamId,
      awayTeamId,
      competitionEditionId: series.stage.competitionEditionId,
      competitionStageId: series.competitionStageId,
      playoffSeriesId: seriesId,
      playoffGameNumber: gameNumber,
      status: 'PREPARED',
      source: 'COMPETITION',
      createdBySource: 'PLAYOFF_PROGRESSION',
      rulesJson,
      competitionRulesHash: series.stage.edition.rulesHash,
      scheduleKey: `playoff:${seriesId}:game:${gameNumber}`,
      scheduleOrder: gameNumber,
    },
  });
  return match.id;
}

async function createNextRound(
  tx: Prisma.TransactionClient,
  stageId: string,
  completedRound: number,
  config: PlayoffConfig,
) {
  const completed = await tx.playoffSeries.findMany({
    where: { competitionStageId: stageId, roundNumber: completedRound, status: 'COMPLETED' },
    orderBy: { seriesOrder: 'asc' },
  });
  const remaining = await tx.playoffSeries.count({
    where: {
      competitionStageId: stageId,
      roundNumber: completedRound,
      status: { not: 'COMPLETED' },
    },
  });
  if (remaining > 0) return null;

  const nextRound = completedRound + 1;
  const existingNext = await tx.playoffSeries.count({
    where: { competitionStageId: stageId, roundNumber: nextRound },
  });
  if (existingNext > 0) return null;

  const stage = await tx.competitionStage.findUniqueOrThrow({
    where: { id: stageId },
    include: {
      edition: true,
      participants: { include: { participant: true } },
    },
  });

  const roundName = config.roundNames[nextRound - 1] ?? `Round ${nextRound}`;
  let pairings;
  if (config.bracketMode === 'RESEED_EACH_ROUND') {
    pairings = nextRoundReseedPairings(
      completed.map((s) => ({
        competitionParticipantId: s.winnerParticipantId!,
        seed:
          s.winnerParticipantId === s.participant1Id ? s.participant1Seed : s.participant2Seed,
      })),
      nextRound,
    );
  } else {
    pairings = nextRoundFixedPairings(
      completed.map((s) => ({
        seriesOrder: s.seriesOrder,
        winnerParticipantId: s.winnerParticipantId!,
        winnerSeed:
          s.winnerParticipantId === s.participant1Id ? s.participant1Seed : s.participant2Seed,
      })),
      nextRound,
    );
  }

  const nameById = new Map(
    stage.participants.map((p) => [p.competitionParticipantId, p.participant.teamNameSnapshot]),
  );
  const teamById = new Map(
    stage.participants.map((p) => [p.competitionParticipantId, p.participant.teamId]),
  );
  const rules = parseStoredRules(stage.edition.rulesSnapshotText);

  for (const pair of pairings) {
    const series = await tx.playoffSeries.create({
      data: {
        competitionStageId: stageId,
        roundNumber: nextRound,
        roundName,
        seriesOrder: pair.seriesOrder,
        bracketSlot: pair.bracketSlot,
        status: 'READY',
        participant1Id: pair.participant1Id,
        participant2Id: pair.participant2Id,
        participant1Seed: pair.participant1Seed,
        participant2Seed: pair.participant2Seed,
        participant1NameSnapshot: nameById.get(pair.participant1Id) ?? pair.participant1Id,
        participant2NameSnapshot: nameById.get(pair.participant2Id) ?? pair.participant2Id,
        winsRequired: config.winsRequired,
        homeAdvantageParticipantId: pair.homeAdvantageParticipantId,
        homePatternText: config.homePattern,
      },
    });
    await createSeriesGame1(tx, {
      seriesId: series.id,
      stageId,
      editionId: stage.competitionEditionId,
      config,
      rules,
      rulesHash: stage.edition.rulesHash,
      participant1Id: pair.participant1Id,
      participant2Id: pair.participant2Id,
      participant1Seed: pair.participant1Seed,
      participant2Seed: pair.participant2Seed,
      teamIdByParticipant: teamById,
    });
  }

  return nextRound;
}

async function completePlayoffStage(tx: Prisma.TransactionClient, stageId: string, finalSeriesId: string) {
  const final = await tx.playoffSeries.findUniqueOrThrow({ where: { id: finalSeriesId } });
  if (!final.winnerParticipantId) {
    throw new PlayoffHttpError(422, 'PlayoffStageReconciliationFailed', 'Final series has no winner');
  }
  const winnerName =
    final.winnerParticipantId === final.participant1Id
      ? final.participant1NameSnapshot
      : final.participant2NameSnapshot;
  const winnerSeed =
    final.winnerParticipantId === final.participant1Id
      ? final.participant1Seed
      : final.participant2Seed;

  await tx.competitionStage.update({
    where: { id: stageId },
    data: {
      status: 'COMPLETED',
      scheduleStatus: 'LOCKED',
      completedAt: new Date(),
      championParticipantId: final.winnerParticipantId,
      championTeamNameSnapshot: winnerName,
      championSeed: winnerSeed,
      championshipSeriesId: final.id,
    },
  });

  await tx.competitionParticipant.update({
    where: { id: final.winnerParticipantId },
    data: { status: 'CHAMPION' },
  });

  // Persist stage team/player stats from playoff matches (reuse F18 models)
  const stage = await tx.competitionStage.findUniqueOrThrow({
    where: { id: stageId },
    include: { participants: { include: { participant: true } } },
  });
  const matches = await tx.match.findMany({
    where: { competitionStageId: stageId, playoffSeriesId: { not: null }, status: 'COMPLETED' },
  });
  const resultIds = matches.map((m) => m.currentResultId!).filter(Boolean);
  const results = await tx.matchResult.findMany({
    where: { id: { in: resultIds } },
    include: { teamStats: true, playerStats: true },
  });

  const participants = stage.participants.map((p) => ({
    participantId: p.competitionParticipantId,
    teamId: p.participant.teamId,
    teamNameSnapshot: p.participant.teamNameSnapshot,
  }));
  const teamNameById = Object.fromEntries(participants.map((p) => [p.teamId, p.teamNameSnapshot]));
  const teamGameStats = [];
  const playerGameStats = [];
  for (const r of results) {
    for (const ts of r.teamStats) {
      const opp = r.teamStats.find((o) => o.teamId !== ts.teamId);
      teamGameStats.push({
        teamId: ts.teamId,
        goals: ts.goals,
        shotsOnGoal: ts.shotsOnGoal,
        penalties: ts.penalties,
        penaltyMinutes: ts.penaltyMinutes,
        powerPlayGoals: ts.powerPlayGoals,
        shortHandedGoals: ts.shortHandedGoals,
        shootoutAttempts: ts.shootoutAttempts,
        shootoutGoals: ts.shootoutGoals,
        extras: { goalsAgainst: opp?.goals ?? 0 },
      });
    }
    for (const ps of r.playerStats) {
      playerGameStats.push({
        playerId: ps.playerId,
        teamId: ps.teamId,
        position: ps.position,
        goals: ps.goals,
        assists: ps.assists,
        points: ps.points,
        shotsOnGoal: ps.shotsOnGoal,
        penaltyMinutes: ps.penaltyMinutes,
        powerPlayGoals: ps.powerPlayGoals,
        shortHandedGoals: ps.shortHandedGoals,
        shootoutAttempts: ps.shootoutAttempts,
        shootoutGoals: ps.shootoutGoals,
      });
    }
  }

  const teamStats = aggregateTeamSeasonStats({ participants, teamGameStats });
  const playerStats = aggregatePlayerSeasonStats({ playerGameStats, teamNameById });
  const snapshotHash = `playoff:${stage.bracketHash ?? stageId}`;

  await tx.competitionStageTeamStat.deleteMany({ where: { competitionStageId: stageId } });
  await tx.competitionStagePlayerStat.deleteMany({ where: { competitionStageId: stageId } });

  for (const row of teamStats) {
    await tx.competitionStageTeamStat.create({
      data: {
        competitionStageId: stageId,
        competitionParticipantId: row.participantId,
        teamId: row.teamId,
        teamNameSnapshot: row.teamNameSnapshot,
        gamesPlayed: row.gamesPlayed,
        goals: row.goals,
        goalsAgainst: row.goalsAgainst,
        shotsOnGoal: row.shotsOnGoal,
        shotAttempts: row.shotAttempts,
        penalties: row.penalties,
        penaltyMinutes: row.penaltyMinutes,
        powerPlayGoals: row.powerPlayGoals,
        powerPlayOpportunities: row.powerPlayOpportunities,
        shortHandedGoals: row.shortHandedGoals,
        shootoutAttempts: row.shootoutAttempts,
        shootoutGoals: row.shootoutGoals,
        shootingPercentage: row.shootingPercentage,
        powerPlayPercentage: row.powerPlayPercentage,
        penaltyKillPercentage: row.penaltyKillPercentage,
        statsJson: JSON.stringify(row),
        snapshotHash,
      },
    });
  }
  for (const row of playerStats) {
    await tx.competitionStagePlayerStat.create({
      data: {
        competitionStageId: stageId,
        playerId: row.playerId,
        teamId: row.teamId,
        teamNameSnapshot: row.teamNameSnapshot,
        firstNameSnapshot: row.firstNameSnapshot,
        lastNameSnapshot: row.lastNameSnapshot,
        position: row.position,
        isGoalie: row.isGoalie,
        gamesPlayed: row.gamesPlayed,
        goals: row.goals,
        assists: row.assists,
        points: row.points,
        shotsOnGoal: row.shotsOnGoal,
        penaltyMinutes: row.penaltyMinutes,
        powerPlayGoals: row.powerPlayGoals,
        shortHandedGoals: row.shortHandedGoals,
        shootoutAttempts: row.shootoutAttempts,
        shootoutGoals: row.shootoutGoals,
        wins: row.wins,
        losses: row.losses,
        shotsAgainst: row.shotsAgainst,
        saves: row.saves,
        goalsAgainst: row.goalsAgainst,
        shutouts: row.shutouts,
        savePercentage: row.savePercentage,
        shootingPercentage: row.shootingPercentage,
        statsJson: JSON.stringify(row),
        snapshotHash,
      },
    });
  }

  await tx.commissionerAuditLog.create({
    data: {
      entityType: 'COMPETITION_STAGE',
      entityId: stageId,
      action: 'PLAYOFF_STAGE_COMPLETED',
      reason: 'Playoff stage completed',
      beforeJson: '{}',
      afterJson: JSON.stringify({ championParticipantId: final.winnerParticipantId }),
      changedFieldsJson: JSON.stringify(['status', 'championParticipantId']),
      source: 'COMMISSIONER_API',
      schemaVersion: 1,
    },
  });
}

/** Recompute series after a playoff match completes; advance bracket as needed. */
export async function progressPlayoffAfterMatch(matchId: string) {
  const match = await prisma.match.findUnique({ where: { id: matchId } });
  if (!match?.playoffSeriesId || !match.competitionStageId) return null;

  if (match.competitionEditionId) {
    const edition = await prisma.competitionEdition.findUnique({
      where: { id: match.competitionEditionId },
      include: { competition: { select: { type: true } } },
    });
    if (edition?.competition.type === 'INTERNATIONAL_TOURNAMENT') {
      const { progressInternationalKnockoutAfterMatch } = await import(
        './international-tournaments.js'
      );
      return progressInternationalKnockoutAfterMatch(matchId);
    }
  }

  const seriesId = match.playoffSeriesId;
  const stageId = match.competitionStageId;
  const games = await loadSeriesGames(seriesId);
  const series = await prisma.playoffSeries.findUniqueOrThrow({ where: { id: seriesId } });
  const stage = await prisma.competitionStage.findUniqueOrThrow({ where: { id: stageId } });
  const config = parsePlayoffConfig(JSON.parse(stage.configText), {
    participantCount: Math.max(2, games.length || 2),
  });

  const progression = recomputeSeriesProgression({
    participant1Id: series.participant1Id,
    participant2Id: series.participant2Id,
    participant1Seed: series.participant1Seed,
    participant2Seed: series.participant2Seed,
    winsRequired: series.winsRequired,
    games,
  });
  if (progression.errors.length) {
    throw new PlayoffHttpError(422, 'SeriesReconciliationFailed', progression.errors.join('; '));
  }

  return prisma.$transaction(async (tx) => {
    if (stage.status === 'SCHEDULED') {
      await tx.competitionStage.update({
        where: { id: stageId },
        data: {
          status: 'IN_PROGRESS',
          simulationStartedAt: stage.simulationStartedAt ?? new Date(),
          scheduleStatus: 'LOCKED',
        },
      });
    }

    if (!progression.clinched) {
      await tx.playoffSeries.update({
        where: { id: seriesId },
        data: {
          status: 'IN_PROGRESS',
          participant1Wins: progression.participant1Wins,
          participant2Wins: progression.participant2Wins,
          startedAt: series.startedAt ?? new Date(),
        },
      });
      if (progression.nextGameNumber) {
        await createNextGameIfNeeded(tx, seriesId, progression.nextGameNumber);
      }
      return { seriesId, clinched: false, winnerParticipantId: null };
    }

    await tx.playoffSeries.update({
      where: { id: seriesId },
      data: {
        status: 'COMPLETED',
        participant1Wins: progression.participant1Wins,
        participant2Wins: progression.participant2Wins,
        winnerParticipantId: progression.winnerParticipantId,
        completedAt: new Date(),
        startedAt: series.startedAt ?? new Date(),
      },
    });

    // Eliminate loser
    const loserId =
      progression.winnerParticipantId === series.participant1Id
        ? series.participant2Id
        : series.participant1Id;
    await tx.competitionParticipant.update({
      where: { id: loserId },
      data: { status: 'ELIMINATED' },
    });

    const openInRound = await tx.playoffSeries.count({
      where: {
        competitionStageId: stageId,
        roundNumber: series.roundNumber,
        status: { not: 'COMPLETED' },
      },
    });

    if (openInRound === 0) {
      const winnersInRound = await tx.playoffSeries.count({
        where: { competitionStageId: stageId, roundNumber: series.roundNumber, status: 'COMPLETED' },
      });
      if (winnersInRound === 1) {
        await completePlayoffStage(tx, stageId, seriesId);
        return {
          seriesId,
          clinched: true,
          winnerParticipantId: progression.winnerParticipantId,
          champion: true,
        };
      }
      await createNextRound(tx, stageId, series.roundNumber, {
        ...config,
        qualificationCount: config.qualificationCount || winnersInRound * 2,
      });
    }

    return { seriesId, clinched: true, winnerParticipantId: progression.winnerParticipantId, champion: false };
  });
}

export function deriveSeriesGameSeed(
  baseSeed: string,
  bracketHash: string,
  roundNumber: number,
  bracketSlot: string,
  gameNumber: number,
) {
  return derivePlayoffGameSeed(baseSeed, bracketHash, roundNumber, bracketSlot, gameNumber);
}
