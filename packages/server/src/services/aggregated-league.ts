import {
  AggregatedLeagueError,
  computeStandings,
  parseAggregatedSeasonConfig,
  parseCompetitionRulesJson,
  runAggregatedSeason,
  type AggregatedRosterPlayer,
  type AggregatedTeamStrengthInput,
} from '@fhm/engine';
import { createHash } from 'node:crypto';
import type { CommissionerAuditSource } from '@prisma/client';
import { prisma } from '../db/client.js';
import { assertExpectedUpdatedAt, writeCompetitionAudit } from './competition-helpers.js';
import { createSqliteSafetyBackup } from './sqlite-backup.js';
import { getActiveBalanceSnapshot } from './balance-config.js';

function digest(text: string): string {
  return createHash('sha256').update(text).digest('hex');
}

function wrapEngineError(err: unknown): never {
  if (err instanceof AggregatedHttpError) throw err;
  if (err instanceof AggregatedLeagueError) {
    const status =
      err.code === 'AggregatedRosterNotReady' || err.code === 'InvalidAggregatedConfiguration'
        ? 422
        : err.code === 'AggregatedSimulationReconciliationFailed'
          ? 422
          : 500;
    throw new AggregatedHttpError(status, err.code, err.message);
  }
  throw err;
}

export class AggregatedHttpError extends Error {
  statusCode: number;
  code: string;
  details?: unknown;
  constructor(statusCode: number, code: string, message: string, details?: unknown) {
    super(message);
    this.name = code;
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
  }
}

async function loadStageContext(stageId: string) {
  const stage = await prisma.competitionStage.findUnique({
    where: { id: stageId },
    include: {
      edition: {
        include: {
          competition: true,
          participants: {
            where: { status: 'CONFIRMED' },
            orderBy: { participantOrder: 'asc' },
            include: {
              team: {
                include: {
                  players: {
                    where: { rosterStatus: 'ACTIVE' },
                    include: {
                      skaterAttributes: true,
                      goalieAttributes: true,
                    },
                  },
                  coach: true,
                },
              },
            },
          },
        },
      },
      participants: {
        where: { status: 'CONFIRMED' },
        include: { participant: true },
        orderBy: { stageOrder: 'asc' },
      },
    },
  });
  if (!stage) {
    throw new AggregatedHttpError(404, 'CompetitionStageNotFound', 'Competition stage not found');
  }
  return stage;
}

function assertAggregatedCompetition(stage: Awaited<ReturnType<typeof loadStageContext>>) {
  if (stage.edition.competition.simulationLevel !== 'AGGREGATED') {
    throw new AggregatedHttpError(
      409,
      'CompetitionNotAggregated',
      'This endpoint only supports AGGREGATED competitions',
    );
  }
  if (stage.stageType !== 'REGULAR_SEASON') {
    throw new AggregatedHttpError(
      409,
      'StageNotReady',
      'Aggregated simulation requires a REGULAR_SEASON stage',
    );
  }
  if (stage.edition.status === 'ARCHIVED') {
    throw new AggregatedHttpError(
      409,
      'ArchivedCompetitionEdition',
      'ARCHIVED editions cannot run aggregated simulation',
    );
  }
}

function avgAttrs(attrs: Record<string, unknown> | null | undefined): number {
  if (!attrs) return 10;
  const nums = Object.entries(attrs)
    .filter(([k, v]) => k !== 'playerId' && k !== 'createdAt' && k !== 'updatedAt' && typeof v === 'number')
    .map(([, v]) => v as number);
  if (nums.length === 0) return 10;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

function abilityFromPlayer(p: {
  primaryPosition: string;
  skaterAttributes: Record<string, unknown> | null;
  goalieAttributes: Record<string, unknown> | null;
}): number {
  if (p.primaryPosition === 'G') return avgAttrs(p.goalieAttributes);
  return avgAttrs(p.skaterAttributes);
}

function buildTeamInputs(
  stage: Awaited<ReturnType<typeof loadStageContext>>,
): AggregatedTeamStrengthInput[] {
  const editionParticipants = stage.edition.participants;
  const stageParticipantIds = new Set(
    stage.participants.map((sp) => sp.competitionParticipantId),
  );
  const participants =
    stageParticipantIds.size > 0
      ? editionParticipants.filter((p) => stageParticipantIds.has(p.id))
      : editionParticipants;

  return participants.map((p) => {
    const players: AggregatedRosterPlayer[] = p.team.players.map((pl) => {
      const ability = abilityFromPlayer(pl);
      return {
        playerId: pl.id,
        firstName: pl.firstName,
        lastName: pl.lastName,
        position: pl.primaryPosition,
        isGoalie: pl.primaryPosition === 'G',
        ability,
        offense: ability,
        defense: ability,
      };
    });
    const coachOverall = p.team.coach?.overallCoaching ?? 10;
    return {
      competitionParticipantId: p.id,
      teamId: p.teamId,
      teamNameSnapshot: p.teamNameSnapshot,
      players,
      chemistryModifier: 0,
      coachingModifier: ((coachOverall - 10) / 20) * 0.08,
    };
  });
}

function parseStageAggregatedConfig(configText: string) {
  try {
    const raw = JSON.parse(configText || '{}') as Record<string, unknown>;
    const nested =
      raw.aggregated && typeof raw.aggregated === 'object'
        ? (raw.aggregated as Record<string, unknown>)
        : {};
    return parseAggregatedSeasonConfig({
      schemaVersion: 1,
      simulationMode: 'AGGREGATED',
      scheduleFormat: (raw.scheduleFormat as string) ?? nested.scheduleFormat ?? 'DOUBLE_ROUND_ROBIN',
      gamesPerTeam: raw.gamesPerTeam ?? nested.gamesPerTeam,
      qualifiersCount: raw.qualifiersCount ?? nested.qualifiersCount ?? 0,
      homeAdvantage: nested.homeAdvantage,
      strengthRandomness: nested.strengthRandomness,
      scoreVariance: nested.scoreVariance,
      overtimeRateTarget: nested.overtimeRateTarget,
      shootoutRateTarget: nested.shootoutRateTarget,
      statAllocation: nested.statAllocation,
      minimumTeamGoalsPerGame: nested.minimumTeamGoalsPerGame,
      maximumTeamGoalsPerGame: nested.maximumTeamGoalsPerGame,
    });
  } catch (err) {
    throw new AggregatedHttpError(
      422,
      'InvalidAggregatedConfiguration',
      err instanceof Error ? err.message : 'Invalid aggregated configuration',
    );
  }
}

function loadRules(rulesText: string) {
  const rules = parseCompetitionRulesJson(rulesText);
  return {
    points: rules.points ?? {
      regulationWin: 2,
      overtimeWin: 2,
      shootoutWin: 2,
      overtimeLoss: 1,
      shootoutLoss: 1,
      regulationLoss: 0,
      tie: 1,
    },
    tiebreakers: rules.tiebreakers ?? (['GOAL_DIFFERENCE', 'GOALS_FOR'] as const),
    tiesAllowed: rules.matchRules?.tiesAllowed ?? false,
  };
}

export async function previewAggregatedSeason(stageId: string): Promise<{
  persisted: false;
  participantCount: number;
  scheduleGames: number;
  config: unknown;
  configHash: string;
  inputHash: string;
  scheduleHash: string;
  strengths: Array<Record<string, unknown>>;
  warnings: unknown[];
  notice: string;
}> {
  const stage = await loadStageContext(stageId);
  assertAggregatedCompetition(stage);
  try {
    const teams = buildTeamInputs(stage);
    const config = parseStageAggregatedConfig(stage.configText);
    const rules = loadRules(stage.edition.rulesSnapshotText);
    const dry = runAggregatedSeason({
      competitionEditionId: stage.competitionEditionId,
      competitionStageId: stageId,
      seed: 'preview-only',
      config,
      teams,
      pointsRules: rules.points,
      tiebreakers: [...rules.tiebreakers],
      tiesAllowed: rules.tiesAllowed,
    });

    return {
      persisted: false,
      participantCount: teams.length,
      scheduleGames: dry.games.length,
      config,
      configHash: dry.configHash,
      inputHash: dry.inputHash,
      scheduleHash: dry.scheduleHash,
      strengths: dry.strengths.map((s) => ({
        competitionParticipantId: s.competitionParticipantId,
        teamNameSnapshot: s.teamNameSnapshot,
        overallTier: s.overallTier,
        offenseTier: s.offenseTier,
        defenseTier: s.defenseTier,
        goaltendingTier: s.goaltendingTier,
        eligibleSkaterCount: s.eligibleSkaterCount,
        eligibleGoalieCount: s.eligibleGoalieCount,
        depthWarning: s.depthWarning,
      })),
      warnings: dry.anomalies,
      notice: 'Preview only — no writes. Results from preview seed are not official.',
    };
  } catch (err) {
    wrapEngineError(err);
  }
}

export async function prepareAggregatedSeason(
  stageId: string,
  body: {
    expectedUpdatedAt: string;
    seed: string;
    balanceVersionId?: string | null;
    reason: string;
  },
  source: CommissionerAuditSource,
): Promise<{
  run: {
    id: string;
    status: string;
    seed: string;
    inputHash: string;
    configHash: string;
    scheduleHash: string;
    totalGames: number;
    runVersion: number;
  };
  strengths: Array<Record<string, unknown>>;
}> {
  if (!body.reason || body.reason.trim().length < 3) {
    throw new AggregatedHttpError(400, 'InvalidAggregatedLeagueRequest', 'Reason is required');
  }
  if (!body.seed?.trim()) {
    throw new AggregatedHttpError(400, 'InvalidAggregatedLeagueRequest', 'Seed is required');
  }

  const stage = await loadStageContext(stageId);
  assertAggregatedCompetition(stage);
  assertExpectedUpdatedAt(stage.updatedAt, body.expectedUpdatedAt);

  if (stage.status === 'COMPLETED') {
    throw new AggregatedHttpError(
      409,
      'AggregatedSeasonAlreadyCompleted',
      'Completed aggregated stages cannot be prepared again',
    );
  }
  if (stage.edition.status !== 'ACTIVE') {
    throw new AggregatedHttpError(
      409,
      'StageNotReady',
      'Edition must be ACTIVE to prepare an aggregated season',
    );
  }

  const existingPrepared = await prisma.aggregatedSeasonRun.findFirst({
    where: { competitionStageId: stageId, status: 'PREPARED', isCurrent: false },
  });
  if (existingPrepared) {
    throw new AggregatedHttpError(
      409,
      'AggregatedSeasonAlreadyPrepared',
      'A prepared aggregated run already exists; discard it first',
      { runId: existingPrepared.id },
    );
  }

  const teams = buildTeamInputs(stage);
  const config = parseStageAggregatedConfig(stage.configText);
  const rules = loadRules(stage.edition.rulesSnapshotText);
  const balance = await getActiveBalanceSnapshot();
  let dry;
  try {
    dry = runAggregatedSeason({
      competitionEditionId: stage.competitionEditionId,
      competitionStageId: stageId,
      seed: body.seed.trim(),
      config,
      teams,
      pointsRules: rules.points,
      tiebreakers: [...rules.tiebreakers],
      tiesAllowed: rules.tiesAllowed,
      balanceHash: balance.version.configHash,
    });
  } catch (err) {
    wrapEngineError(err);
  }

  const version =
    (await prisma.aggregatedSeasonRun.count({ where: { competitionStageId: stageId } })) + 1;

  const run = await prisma.$transaction(async (tx) => {
    const created = await tx.aggregatedSeasonRun.create({
      data: {
        competitionEditionId: stage.competitionEditionId,
        competitionStageId: stageId,
        runVersion: version,
        status: 'PREPARED',
        seed: body.seed.trim(),
        configSnapshotText: JSON.stringify(dry.config),
        configHash: dry.configHash,
        inputSnapshotText: JSON.stringify({
          strengths: dry.strengths,
          teams: teams.map((t) => ({
            competitionParticipantId: t.competitionParticipantId,
            teamId: t.teamId,
            teamNameSnapshot: t.teamNameSnapshot,
            players: t.players,
            chemistryModifier: t.chemistryModifier,
            coachingModifier: t.coachingModifier,
          })),
        }),
        inputHash: dry.inputHash,
        balanceVersionId: body.balanceVersionId ?? balance.version.id,
        balanceHash: balance.version.configHash,
        scheduleHash: dry.scheduleHash,
        totalGames: dry.games.length,
        isCurrent: false,
      },
    });

    await tx.competitionStage.update({
      where: { id: stageId },
      data: {
        simulationModeSnapshot: 'AGGREGATED',
        scheduleHash: dry.scheduleHash,
        scheduleSeed: body.seed.trim(),
        scheduleStatus: 'GENERATED',
      },
    });

    await writeCompetitionAudit(
      tx,
      'COMPETITION_STAGE',
      stageId,
      'SCHEDULE_GENERATED',
      body.reason.trim(),
      { status: stage.status },
      { preparedRunId: created.id, inputHash: dry.inputHash, configHash: dry.configHash },
      ['aggregatedRun'],
      source,
    );

    return created;
  });

  return {
    run: {
      id: run.id,
      status: run.status,
      seed: run.seed,
      inputHash: run.inputHash,
      configHash: run.configHash,
      scheduleHash: run.scheduleHash,
      totalGames: run.totalGames,
      runVersion: run.runVersion,
    },
    strengths: dry.strengths.map((s) => ({
      competitionParticipantId: s.competitionParticipantId,
      teamNameSnapshot: s.teamNameSnapshot,
      overallTier: s.overallTier,
      offenseTier: s.offenseTier,
      defenseTier: s.defenseTier,
      goaltendingTier: s.goaltendingTier,
      depthWarning: s.depthWarning,
    })),
  };
}

export async function discardPreparedAggregatedRun(
  stageId: string,
  runId: string,
  body: { expectedUpdatedAt: string; reason: string },
  source: CommissionerAuditSource,
) {
  const stage = await loadStageContext(stageId);
  assertAggregatedCompetition(stage);
  assertExpectedUpdatedAt(stage.updatedAt, body.expectedUpdatedAt);
  const run = await prisma.aggregatedSeasonRun.findUnique({ where: { id: runId } });
  if (!run || run.competitionStageId !== stageId) {
    throw new AggregatedHttpError(404, 'AggregatedSeasonRunNotFound', 'Run not found');
  }
  if (run.status !== 'PREPARED') {
    throw new AggregatedHttpError(409, 'AggregatedSeasonLocked', 'Only PREPARED runs can be discarded');
  }
  await prisma.$transaction(async (tx) => {
    await tx.aggregatedSeasonRun.update({
      where: { id: runId },
      data: { status: 'CANCELLED', cancelledAt: new Date() },
    });
    await writeCompetitionAudit(
      tx,
      'COMPETITION_STAGE',
      stageId,
      'STAGE_UPDATED',
      body.reason.trim(),
      { runId, status: 'PREPARED' },
      { runId, status: 'CANCELLED' },
      ['aggregatedRun'],
      source,
    );
  });
  return { discarded: true, runId };
}

export async function simulateAggregatedSeason(
  stageId: string,
  body: { runId: string; confirmation?: boolean },
) {
  if (!body.confirmation) {
    throw new AggregatedHttpError(
      400,
      'InvalidAggregatedLeagueRequest',
      'confirmation: true is required',
    );
  }
  const stage = await loadStageContext(stageId);
  assertAggregatedCompetition(stage);
  if (stage.status === 'COMPLETED') {
    throw new AggregatedHttpError(
      409,
      'AggregatedSeasonAlreadyCompleted',
      'Stage already completed',
    );
  }
  if (stage.edition.status !== 'ACTIVE') {
    throw new AggregatedHttpError(409, 'StageNotReady', 'Edition must be ACTIVE');
  }

  const run = await prisma.aggregatedSeasonRun.findUnique({ where: { id: body.runId } });
  if (!run || run.competitionStageId !== stageId) {
    throw new AggregatedHttpError(404, 'AggregatedSeasonRunNotFound', 'Run not found');
  }
  if (run.status !== 'PREPARED') {
    throw new AggregatedHttpError(
      409,
      'AggregatedSeasonLocked',
      `Run status ${run.status} cannot be simulated`,
    );
  }

  let backup;
  try {
    backup = await createSqliteSafetyBackup({ label: 'f21-aggregated', sourceOperationType: 'AGGREGATED_SIMULATION', sourceOperationId: run.id });
  } catch (err) {
    throw new AggregatedHttpError(
      503,
      'BackupFailed',
      err instanceof Error ? err.message : 'Backup failed',
    );
  }

  await prisma.aggregatedSeasonRun.update({
    where: { id: run.id },
    data: { status: 'RUNNING', startedAt: new Date() },
  });

  try {
    const inputSnap = JSON.parse(run.inputSnapshotText) as {
      teams: AggregatedTeamStrengthInput[];
    };
    const config = parseAggregatedSeasonConfig(JSON.parse(run.configSnapshotText));
    const rules = loadRules(stage.edition.rulesSnapshotText);
    const result = runAggregatedSeason({
      competitionEditionId: stage.competitionEditionId,
      competitionStageId: stageId,
      seed: run.seed,
      config,
      teams: inputSnap.teams,
      pointsRules: rules.points,
      tiebreakers: [...rules.tiebreakers],
      tiesAllowed: rules.tiesAllowed,
      balanceHash: run.balanceHash,
    });

    if (result.inputHash !== run.inputHash || result.configHash !== run.configHash) {
      throw new AggregatedHttpError(
        422,
        'AggregatedSimulationReconciliationFailed',
        'Prepared input/config hash mismatch on simulation',
      );
    }

    const published = await prisma.$transaction(async (tx) => {
      await tx.aggregatedMatchSummary.deleteMany({ where: { runId: run.id } });
      for (const g of result.games) {
        await tx.aggregatedMatchSummary.create({
          data: {
            competitionEditionId: stage.competitionEditionId,
            competitionStageId: stageId,
            runId: run.id,
            scheduleKey: g.scheduleKey,
            scheduleOrder: g.scheduleOrder,
            roundNumber: g.roundNumber,
            slotNumber: g.slotNumber,
            homeCompetitionParticipantId: g.homeCompetitionParticipantId,
            awayCompetitionParticipantId: g.awayCompetitionParticipantId,
            homeTeamNameSnapshot: g.homeTeamNameSnapshot,
            awayTeamNameSnapshot: g.awayTeamNameSnapshot,
            homeScore: g.homeScore,
            awayScore: g.awayScore,
            decisionType: g.decisionType,
            homePoints: g.homePoints,
            awayPoints: g.awayPoints,
            homeShots: g.homeShots,
            awayShots: g.awayShots,
            homeSaves: g.homeSaves,
            awaySaves: g.awaySaves,
            homePenalties: g.homePenalties,
            awayPenalties: g.awayPenalties,
            homePim: g.homePim,
            awayPim: g.awayPim,
            homePpOpportunities: g.homePpOpportunities,
            awayPpOpportunities: g.awayPpOpportunities,
            homePpGoals: g.homePpGoals,
            awayPpGoals: g.awayPpGoals,
            homePossessionEstimate: g.homePossessionEstimate,
            awayPossessionEstimate: g.awayPossessionEstimate,
            seed: g.seed,
            resultHash: g.resultHash,
            completedAt: new Date(),
          },
        });
      }

      await tx.competitionStageStanding.deleteMany({ where: { competitionStageId: stageId } });
      await tx.competitionStageTeamStat.deleteMany({ where: { competitionStageId: stageId } });
      await tx.competitionStagePlayerStat.deleteMany({ where: { competitionStageId: stageId } });

      const byId = new Map(result.strengths.map((s) => [s.competitionParticipantId, s]));
      const standings = computeStandings({
        participants: result.strengths.map((s) => ({
          participantId: s.competitionParticipantId,
          teamId: s.teamId,
          teamNameSnapshot: s.teamNameSnapshot,
        })),
        matches: result.games.map((g) => ({
          scheduleOrder: g.scheduleOrder,
          homeParticipantId: g.homeCompetitionParticipantId,
          awayParticipantId: g.awayCompetitionParticipantId,
          homeTeamId: byId.get(g.homeCompetitionParticipantId)!.teamId,
          awayTeamId: byId.get(g.awayCompetitionParticipantId)!.teamId,
          homeScore: g.homeScore,
          awayScore: g.awayScore,
          homeRegulationScore: g.homeRegulationScore,
          awayRegulationScore: g.awayRegulationScore,
          decisionType: g.decisionType,
          winnerParticipantId: g.winnerParticipantId,
        })),
        pointsRules: rules.points,
        tiebreakers: rules.tiebreakers ?? ['GOAL_DIFFERENCE', 'GOALS_FOR'],
        qualifiersCount: result.config.qualifiersCount,
        scheduledMatchCount: result.games.length,
        standingsSeed: `${run.seed}:standings`,
        provisional: false,
      });

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
            snapshotHash: standings.standingsHash,
          },
        });
      }

      for (const t of result.teamStats) {
        await tx.competitionStageTeamStat.create({
          data: {
            competitionStageId: stageId,
            competitionParticipantId: t.competitionParticipantId,
            teamId: t.teamId,
            teamNameSnapshot: t.teamNameSnapshot,
            gamesPlayed: t.gamesPlayed,
            goals: t.goals,
            goalsAgainst: t.goalsAgainst,
            shotsOnGoal: t.shots,
            shotAttempts: t.shots,
            penalties: t.penalties,
            penaltyMinutes: t.penaltyMinutes,
            powerPlayGoals: t.powerPlayGoals,
            powerPlayOpportunities: t.powerPlayOpportunities,
            shortHandedGoals: 0,
            shootingPercentage: t.shootingPercentage,
            powerPlayPercentage: t.powerPlayPercentage,
            penaltyKillPercentage: t.penaltyKillPercentage,
            statsJson: JSON.stringify({ source: 'AGGREGATED', ...t }),
            snapshotHash: digest(JSON.stringify(t)),
          },
        });
      }

      for (const p of result.playerStats) {
        const [firstName, ...rest] = p.playerNameSnapshot.split(' ');
        await tx.competitionStagePlayerStat.create({
          data: {
            competitionStageId: stageId,
            playerId: p.playerId,
            teamId: p.teamId,
            teamNameSnapshot: p.teamNameSnapshot ?? '',
            firstNameSnapshot: firstName || p.playerNameSnapshot,
            lastNameSnapshot: rest.join(' ') || '',
            position: p.positionSnapshot,
            isGoalie: p.isGoalie,
            gamesPlayed: p.gamesPlayed,
            goals: p.goals,
            assists: p.assists,
            points: p.points,
            shotsOnGoal: p.shots,
            penaltyMinutes: p.penaltyMinutes,
            powerPlayGoals: p.powerPlayGoals,
            shortHandedGoals: p.shortHandedGoals,
            wins: p.goalieWins,
            losses: p.goalieLosses,
            shotsAgainst: p.shotsAgainst,
            saves: p.saves,
            goalsAgainst: p.goalsAgainst,
            shutouts: p.shutouts,
            savePercentage: p.savePercentage,
            shootingPercentage: p.shots > 0 ? p.goals / p.shots : null,
            statsJson: JSON.stringify({ source: 'AGGREGATED', estimate: true }),
            snapshotHash: digest(JSON.stringify(p)),
          },
        });
      }

      await tx.aggregatedSeasonRun.updateMany({
        where: { competitionStageId: stageId, isCurrent: true },
        data: { isCurrent: false, status: 'SUPERSEDED', supersededByRunId: run.id },
      });

      const completed = await tx.aggregatedSeasonRun.update({
        where: { id: run.id },
        data: {
          status: 'COMPLETED',
          isCurrent: true,
          resultHash: result.resultHash,
          anomaliesText: JSON.stringify(result.anomalies),
          completedGames: result.games.length,
          progress: 1,
          completedAt: new Date(),
        },
      });

      const championName =
        result.strengths.find((s) => s.competitionParticipantId === result.championParticipantId)
          ?.teamNameSnapshot ?? null;

      await tx.competitionStage.update({
        where: { id: stageId },
        data: {
          status: 'COMPLETED',
          scheduleStatus: 'LOCKED',
          completedAt: new Date(),
          currentAggregatedRunId: run.id,
          simulationModeSnapshot: 'AGGREGATED',
          championParticipantId: result.championParticipantId,
          championTeamNameSnapshot: championName,
        },
      });

      return { run: completed, championParticipantId: result.championParticipantId, championName };
    });

    return {
      backup,
      runId: published.run.id,
      resultHash: published.run.resultHash,
      championParticipantId: published.championParticipantId,
      championName: published.championName,
      games: result.games.length,
      anomalies: result.anomalies,
      notice: 'Aggregated Final — no detailed match events were simulated.',
    };
  } catch (err) {
    await prisma.aggregatedSeasonRun.update({
      where: { id: run.id },
      data: {
        status: 'FAILED',
        failedAt: new Date(),
        errorMessage: err instanceof Error ? err.message : 'Simulation failed',
      },
    });
    if (err instanceof AggregatedHttpError) throw err;
    if (err instanceof AggregatedLeagueError) {
      wrapEngineError(err);
    }
    throw new AggregatedHttpError(
      500,
      'AggregatedSimulationFailed',
      err instanceof Error ? err.message : 'Aggregated simulation failed',
    );
  }
}

export async function getAggregatedStatus(stageId: string) {
  const stage = await prisma.competitionStage.findUnique({
    where: { id: stageId },
    include: {
      edition: { include: { competition: true } },
    },
  });
  if (!stage) return null;
  const run = stage.currentAggregatedRunId
    ? await prisma.aggregatedSeasonRun.findUnique({ where: { id: stage.currentAggregatedRunId } })
    : await prisma.aggregatedSeasonRun.findFirst({
        where: { competitionStageId: stageId },
        orderBy: { runVersion: 'desc' },
      });
  return {
    simulationLevel: stage.edition.competition.simulationLevel,
    simulationMode: stage.simulationModeSnapshot ?? stage.edition.competition.simulationLevel,
    stageStatus: stage.status,
    championParticipantId: stage.championParticipantId,
    championTeamNameSnapshot: stage.championTeamNameSnapshot,
    run: run
      ? {
          id: run.id,
          status: run.status,
          seed: run.seed,
          inputHash: run.inputHash,
          configHash: run.configHash,
          scheduleHash: run.scheduleHash,
          resultHash: run.resultHash,
          progress: run.progress,
          totalGames: run.totalGames,
          completedGames: run.completedGames,
          isCurrent: run.isCurrent,
        }
      : null,
    label: 'Aggregated Simulation',
    notice: 'Fast season model without detailed shift-by-shift events.',
  };
}

export async function listAggregatedMatches(
  stageId: string,
  opts: { page: number; pageSize: number },
) {
  const run = await prisma.aggregatedSeasonRun.findFirst({
    where: { competitionStageId: stageId, isCurrent: true, status: 'COMPLETED' },
  });
  if (!run) return { items: [], total: 0, page: opts.page, pageSize: opts.pageSize };
  const where = { runId: run.id };
  const total = await prisma.aggregatedMatchSummary.count({ where });
  const items = await prisma.aggregatedMatchSummary.findMany({
    where,
    orderBy: { scheduleOrder: 'asc' },
    skip: (opts.page - 1) * opts.pageSize,
    take: opts.pageSize,
  });
  return { items, total, page: opts.page, pageSize: opts.pageSize };
}

export async function getAggregatedRun(runId: string) {
  return prisma.aggregatedSeasonRun.findUnique({ where: { id: runId } });
}

export async function getAggregatedDiagnostics(stageId: string) {
  const run = await prisma.aggregatedSeasonRun.findFirst({
    where: { competitionStageId: stageId },
    orderBy: { runVersion: 'desc' },
  });
  if (!run) return null;
  return {
    runId: run.id,
    status: run.status,
    seed: run.seed,
    inputHash: run.inputHash,
    configHash: run.configHash,
    scheduleHash: run.scheduleHash,
    resultHash: run.resultHash,
    balanceHash: run.balanceHash,
    anomalies: JSON.parse(run.anomaliesText || '[]'),
    errorMessage: run.errorMessage,
  };
}
