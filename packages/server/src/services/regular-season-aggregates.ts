import {
  aggregatePlayerSeasonStats,
  aggregateTeamSeasonStats,
  buildQualificationPreview,
  computeStandings,
  reconcileStandingsBasics,
  type StandingMatchResult,
  type StandingParticipant,
  type StandingsResult,
  type MatchPlayerStatSummary,
  type MatchTeamStatSummary,
} from '@fhm/engine';
import { prisma } from '../db/client.js';
import { loadRegularSeasonStageContext } from './regular-season-schedule.js';
import { RegularSeasonHttpError } from './regular-season-errors.js';
import { parseStoredRules } from './competition-helpers.js';

async function loadStandingParticipants(stageId: string): Promise<StandingParticipant[]> {
  const stage = await prisma.competitionStage.findUnique({
    where: { id: stageId },
    include: {
      participants: {
        where: { status: 'CONFIRMED' },
        include: { participant: true },
        orderBy: { stageOrder: 'asc' },
      },
      edition: {
        include: {
          participants: {
            where: { status: 'CONFIRMED' },
            orderBy: { participantOrder: 'asc' },
          },
        },
      },
    },
  });
  if (!stage) {
    throw new RegularSeasonHttpError(404, 'CompetitionStageNotFound', 'Competition stage not found');
  }
  if (stage.participants.length > 0) {
    return stage.participants.map((r) => ({
      participantId: r.competitionParticipantId,
      teamId: r.participant.teamId,
      teamNameSnapshot: r.participant.teamNameSnapshot,
    }));
  }
  return stage.edition.participants.map((p) => ({
    participantId: p.id,
    teamId: p.teamId,
    teamNameSnapshot: p.teamNameSnapshot,
  }));
}

async function loadCompletedStandingMatches(stageId: string): Promise<{
  matches: StandingMatchResult[];
  teamGameStats: MatchTeamStatSummary[];
  playerGameStats: MatchPlayerStatSummary[];
  teamNameById: Record<string, string>;
}> {
  const participants = await loadStandingParticipants(stageId);
  const teamToParticipant = new Map(participants.map((p) => [p.teamId, p.participantId]));
  const teamNameById: Record<string, string> = Object.fromEntries(
    participants.map((p) => [p.teamId, p.teamNameSnapshot]),
  );

  const matches = await prisma.match.findMany({
    where: {
      competitionStageId: stageId,
      source: 'COMPETITION',
      status: 'COMPLETED',
      currentResultId: { not: null },
    },
    orderBy: { scheduleOrder: 'asc' },
  });

  const resultIds = matches.map((m) => m.currentResultId!).filter(Boolean);
  const results = await prisma.matchResult.findMany({
    where: { id: { in: resultIds }, status: 'COMPLETED' },
    include: {
      teamStats: true,
      playerStats: true,
    },
  });
  const resultById = new Map(results.map((r) => [r.id, r]));

  const standingMatches: StandingMatchResult[] = [];
  const teamGameStats: MatchTeamStatSummary[] = [];
  const playerGameStats: MatchPlayerStatSummary[] = [];

  for (const m of matches) {
    const result = resultById.get(m.currentResultId!);
    if (!result) continue;
    const homePid = teamToParticipant.get(m.homeTeamId);
    const awayPid = teamToParticipant.get(m.awayTeamId);
    if (!homePid || !awayPid) continue;

    const winnerParticipantId =
      result.winnerTeamId == null
        ? null
        : teamToParticipant.get(result.winnerTeamId) ?? null;

    standingMatches.push({
      scheduleOrder: m.scheduleOrder ?? 0,
      homeParticipantId: homePid,
      awayParticipantId: awayPid,
      homeTeamId: m.homeTeamId,
      awayTeamId: m.awayTeamId,
      homeScore: result.homeScore,
      awayScore: result.awayScore,
      homeRegulationScore: result.homeRegulationScore,
      awayRegulationScore: result.awayRegulationScore,
      decisionType: result.decisionType,
      winnerParticipantId,
    });

    for (const ts of result.teamStats) {
      const opp = result.teamStats.find((o) => o.teamId !== ts.teamId);
      let extras: Record<string, unknown> = {};
      try {
        extras = JSON.parse(ts.statsJson) as Record<string, unknown>;
      } catch {
        extras = {};
      }
      teamGameStats.push({
        teamId: ts.teamId,
        goals: ts.goals,
        shotsOnGoal: ts.shotsOnGoal,
        shotAttempts: typeof extras.shotAttempts === 'number' ? extras.shotAttempts : ts.shotsOnGoal,
        penalties: ts.penalties,
        penaltyMinutes: ts.penaltyMinutes,
        powerPlayGoals: ts.powerPlayGoals,
        powerPlayOpportunities:
          typeof extras.powerPlayOpportunities === 'number' ? extras.powerPlayOpportunities : 0,
        shortHandedGoals: ts.shortHandedGoals,
        shootoutAttempts: ts.shootoutAttempts,
        shootoutGoals: ts.shootoutGoals,
        extras: { ...extras, goalsAgainst: opp?.goals ?? 0 },
      });
    }

    for (const ps of result.playerStats) {
      let extras: Record<string, unknown> = {};
      try {
        extras = JSON.parse(ps.statsJson) as Record<string, unknown>;
      } catch {
        extras = {};
      }
      playerGameStats.push({
        playerId: ps.playerId,
        teamId: ps.teamId,
        position: ps.position,
        firstName: typeof extras.firstName === 'string' ? extras.firstName : undefined,
        lastName: typeof extras.lastName === 'string' ? extras.lastName : undefined,
        goals: ps.goals,
        assists: ps.assists,
        points: ps.points,
        shotsOnGoal: ps.shotsOnGoal,
        penaltyMinutes: ps.penaltyMinutes,
        powerPlayGoals: ps.powerPlayGoals,
        shortHandedGoals: ps.shortHandedGoals,
        shootoutAttempts: ps.shootoutAttempts,
        shootoutGoals: ps.shootoutGoals,
        shotsAgainst: typeof extras.shotsAgainst === 'number' ? extras.shotsAgainst : undefined,
        saves: typeof extras.saves === 'number' ? extras.saves : undefined,
        goalsAgainst: typeof extras.goalsAgainst === 'number' ? extras.goalsAgainst : undefined,
        isShutout: extras.isShutout === true,
        isWin: extras.isWin === true,
        isLoss: extras.isLoss === true,
      });
    }
  }

  return { matches: standingMatches, teamGameStats, playerGameStats, teamNameById };
}

export async function getStageProgress(stageId: string) {
  const ctx = await loadRegularSeasonStageContext(stageId);
  const where = { competitionStageId: stageId, source: 'COMPETITION' as const };
  const [total, completed, prepared, simulating, failed] = await Promise.all([
    prisma.match.count({ where }),
    prisma.match.count({ where: { ...where, status: 'COMPLETED' } }),
    prisma.match.count({ where: { ...where, status: 'PREPARED' } }),
    prisma.match.count({ where: { ...where, status: 'SIMULATING' } }),
    prisma.match.count({ where: { ...where, status: 'FAILED' } }),
  ]);
  const remaining = total - completed;
  const percent = total === 0 ? 0 : Math.round((completed / total) * 1000) / 10;

  return {
    stageId,
    status: ctx.stage.status,
    scheduleStatus: ctx.stage.scheduleStatus,
    scheduleHash: ctx.stage.scheduleHash,
    totalScheduledMatches: total,
    completedMatches: completed,
    remainingMatches: remaining,
    preparedMatches: prepared,
    simulatingMatches: simulating,
    failedMatches: failed,
    percentComplete: percent,
    simulationStartedAt: ctx.stage.simulationStartedAt?.toISOString() ?? null,
    completedAt: ctx.stage.completedAt?.toISOString() ?? null,
  };
}

export async function computeStageStandings(stageId: string): Promise<{
  source: 'PROVISIONAL' | 'FINAL';
  standings: StandingsResult;
  qualification: ReturnType<typeof buildQualificationPreview>;
}> {
  const ctx = await loadRegularSeasonStageContext(stageId);
  const rules = ctx.rules;
  if (!rules.points || !rules.tiebreakers?.length) {
    throw new RegularSeasonHttpError(
      422,
      'InvalidScheduleConfiguration',
      'Edition rules must define points and tiebreakers',
    );
  }

  if (ctx.stage.status === 'COMPLETED') {
    const rows = await prisma.competitionStageStanding.findMany({
      where: { competitionStageId: stageId },
      orderBy: { rank: 'asc' },
    });
    if (rows.length > 0) {
      const standings: StandingsResult = {
        provisional: false,
        rows: rows.map((r) => ({
          rank: r.rank,
          participantId: r.competitionParticipantId,
          teamId: r.teamId,
          teamNameSnapshot: r.teamNameSnapshot,
          gamesPlayed: r.gamesPlayed,
          regulationWins: r.regulationWins,
          overtimeWins: r.overtimeWins,
          shootoutWins: r.shootoutWins,
          regulationLosses: r.regulationLosses,
          overtimeLosses: r.overtimeLosses,
          shootoutLosses: r.shootoutLosses,
          ties: r.ties,
          wins: r.wins,
          losses: r.losses,
          goalsFor: r.goalsFor,
          goalsAgainst: r.goalsAgainst,
          goalDifference: r.goalDifference,
          points: r.points,
          pointsPercentage: r.pointsPercentage,
          qualified: r.qualified,
          tiebreakerSummary: r.tiebreakerSummaryText,
        })),
        standingsHash: rows[0]?.snapshotHash ?? '',
        qualificationParticipantIds: rows.filter((r) => r.qualified).map((r) => r.competitionParticipantId),
        pointsRules: rules.points,
        tiebreakers: rules.tiebreakers,
        completedMatchCount: rows[0]?.gamesPlayed
          ? Math.round(rows.reduce((s, r) => s + r.gamesPlayed, 0) / 2)
          : 0,
        scheduledMatchCount: await prisma.match.count({
          where: { competitionStageId: stageId, source: 'COMPETITION' },
        }),
      };
      return {
        source: 'FINAL',
        standings,
        qualification: buildQualificationPreview(standings.rows),
      };
    }
  }

  const participants = await loadStandingParticipants(stageId);
  const { matches } = await loadCompletedStandingMatches(stageId);
  const scheduledMatchCount = await prisma.match.count({
    where: { competitionStageId: stageId, source: 'COMPETITION' },
  });
  const qualifiers =
    ctx.config.qualifiersCount ||
    rules.qualification?.qualifiers ||
    Math.min(4, participants.length);

  const standings = computeStandings({
    participants,
    matches,
    pointsRules: rules.points,
    tiebreakers: rules.tiebreakers,
    qualifiersCount: qualifiers,
    scheduledMatchCount,
    standingsSeed: ctx.stage.scheduleSeed ?? ctx.stage.id,
    provisional: ctx.stage.status !== 'COMPLETED',
  });

  return {
    source: standings.provisional ? 'PROVISIONAL' : 'FINAL',
    standings,
    qualification: buildQualificationPreview(standings.rows),
  };
}

export async function getStageTeamStats(stageId: string) {
  const ctx = await loadRegularSeasonStageContext(stageId);
  if (ctx.stage.status === 'COMPLETED') {
    const rows = await prisma.competitionStageTeamStat.findMany({
      where: { competitionStageId: stageId },
      orderBy: { teamNameSnapshot: 'asc' },
    });
    if (rows.length > 0) {
      return { source: 'FINAL' as const, items: rows };
    }
  }
  const participants = await loadStandingParticipants(stageId);
  const { teamGameStats } = await loadCompletedStandingMatches(stageId);
  const items = aggregateTeamSeasonStats({ participants, teamGameStats });
  return { source: 'PROVISIONAL' as const, items };
}

export async function getStagePlayerStats(
  stageId: string,
  opts: { goalies?: boolean; sort?: string; page?: number; pageSize?: number },
) {
  const ctx = await loadRegularSeasonStageContext(stageId);
  const page = Math.max(1, opts.page ?? 1);
  const pageSize = Math.min(100, Math.max(1, opts.pageSize ?? 50));
  const sort = opts.sort ?? (opts.goalies ? 'savePercentage' : 'points');

  if (ctx.stage.status === 'COMPLETED') {
    const where = {
      competitionStageId: stageId,
      isGoalie: opts.goalies === true,
    };
    const orderBy =
      sort === 'goals'
        ? { goals: 'desc' as const }
        : sort === 'assists'
          ? { assists: 'desc' as const }
          : sort === 'shots'
            ? { shotsOnGoal: 'desc' as const }
            : sort === 'pim'
              ? { penaltyMinutes: 'desc' as const }
              : sort === 'ppGoals'
                ? { powerPlayGoals: 'desc' as const }
                : sort === 'savePercentage'
                  ? { savePercentage: 'desc' as const }
                  : { points: 'desc' as const };
    const [total, items] = await Promise.all([
      prisma.competitionStagePlayerStat.count({ where }),
      prisma.competitionStagePlayerStat.findMany({
        where,
        orderBy,
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);
    return { source: 'FINAL' as const, total, page, pageSize, items };
  }

  const { playerGameStats, teamNameById } = await loadCompletedStandingMatches(stageId);
  let items = aggregatePlayerSeasonStats({ playerGameStats, teamNameById });
  if (opts.goalies) items = items.filter((i) => i.isGoalie);
  else items = items.filter((i) => !i.isGoalie);

  items.sort((a, b) => {
    if (sort === 'goals') return b.goals - a.goals || a.playerId.localeCompare(b.playerId);
    if (sort === 'assists') return b.assists - a.assists || a.playerId.localeCompare(b.playerId);
    if (sort === 'shots') return b.shotsOnGoal - a.shotsOnGoal || a.playerId.localeCompare(b.playerId);
    if (sort === 'pim') return b.penaltyMinutes - a.penaltyMinutes || a.playerId.localeCompare(b.playerId);
    if (sort === 'ppGoals') return b.powerPlayGoals - a.powerPlayGoals || a.playerId.localeCompare(b.playerId);
    if (sort === 'savePercentage') {
      return (b.savePercentage ?? -1) - (a.savePercentage ?? -1) || a.playerId.localeCompare(b.playerId);
    }
    return b.points - a.points || a.playerId.localeCompare(b.playerId);
  });

  const total = items.length;
  const pageItems = items.slice((page - 1) * pageSize, page * pageSize);
  return { source: 'PROVISIONAL' as const, total, page, pageSize, items: pageItems };
}

export async function getStageQualification(stageId: string) {
  const { standings, qualification, source } = await computeStageStandings(stageId);
  return {
    source,
    provisional: standings.provisional,
    ...qualification,
    standingsHash: standings.standingsHash,
  };
}

/** Persist immutable final snapshots and mark stage COMPLETED. */
export async function completeRegularSeasonStage(stageId: string) {
  const ctx = await loadRegularSeasonStageContext(stageId);
  const progress = await getStageProgress(stageId);

  if (progress.totalScheduledMatches === 0) {
    throw new RegularSeasonHttpError(409, 'StageNotReady', 'No scheduled matches');
  }
  if (progress.remainingMatches > 0 || progress.simulatingMatches > 0 || progress.failedMatches > 0) {
    throw new RegularSeasonHttpError(
      409,
      'StageNotReady',
      'All scheduled matches must have current completed results',
      progress,
    );
  }

  const { standings } = await computeStageStandings(stageId);
  const errs = reconcileStandingsBasics({
    standings,
    completedMatches: progress.completedMatches,
  });
  if (errs.length > 0) {
    throw new RegularSeasonHttpError(422, 'StandingsReconciliationFailed', errs.join('; '), { errs });
  }

  const participants = await loadStandingParticipants(stageId);
  const { teamGameStats, playerGameStats, teamNameById, matches } = await loadCompletedStandingMatches(
    stageId,
  );

  // Goal sum reconciliation
  const gf = standings.rows.reduce((s, r) => s + r.goalsFor, 0);
  const ga = standings.rows.reduce((s, r) => s + r.goalsAgainst, 0);
  if (gf !== ga) {
    throw new RegularSeasonHttpError(
      422,
      'StandingsReconciliationFailed',
      `Goals for (${gf}) must equal goals against (${ga})`,
    );
  }
  if (matches.length !== progress.completedMatches) {
    throw new RegularSeasonHttpError(
      422,
      'StandingsReconciliationFailed',
      'Completed match count mismatch',
    );
  }

  const teamStats = aggregateTeamSeasonStats({ participants, teamGameStats });
  const playerStats = aggregatePlayerSeasonStats({ playerGameStats, teamNameById });

  await prisma.$transaction(async (tx) => {
    await tx.competitionStageStanding.deleteMany({ where: { competitionStageId: stageId } });
    await tx.competitionStageTeamStat.deleteMany({ where: { competitionStageId: stageId } });
    await tx.competitionStagePlayerStat.deleteMany({ where: { competitionStageId: stageId } });

    for (const row of standings.rows) {
      await tx.competitionStageStanding.create({
        data: {
          competitionStageId: stageId,
          competitionParticipantId: row.participantId,
          rank: row.rank,
          teamId: row.teamId,
          teamNameSnapshot: row.teamNameSnapshot,
          gamesPlayed: row.gamesPlayed,
          regulationWins: row.regulationWins,
          overtimeWins: row.overtimeWins,
          shootoutWins: row.shootoutWins,
          regulationLosses: row.regulationLosses,
          overtimeLosses: row.overtimeLosses,
          shootoutLosses: row.shootoutLosses,
          ties: row.ties,
          wins: row.wins,
          losses: row.losses,
          goalsFor: row.goalsFor,
          goalsAgainst: row.goalsAgainst,
          goalDifference: row.goalDifference,
          points: row.points,
          pointsPercentage: row.pointsPercentage,
          qualified: row.qualified,
          tiebreakerSummaryText: row.tiebreakerSummary,
          statisticsJson: JSON.stringify(row),
          snapshotHash: standings.standingsHash,
        },
      });
    }

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
          snapshotHash: standings.standingsHash,
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
          snapshotHash: standings.standingsHash,
        },
      });
    }

    await tx.competitionStage.update({
      where: { id: stageId },
      data: {
        status: 'COMPLETED',
        scheduleStatus: 'LOCKED',
        completedAt: new Date(),
      },
    });
  });

  return {
    stageId,
    status: 'COMPLETED',
    standingsHash: standings.standingsHash,
    qualification: buildQualificationPreview(standings.rows),
  };
}

export { parseStoredRules };
