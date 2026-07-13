import {
  canonicalizeBalanceConfig,
  canonicalizeSimulationInput,
  type CompleteMatchResult,
  type SimulationInput,
} from '@fhm/engine';
import type { MatchDecisionType, MatchResultStatus, Prisma } from '@prisma/client';
import { prisma } from '../db/client.js';
import type { ActiveBalanceSnapshot } from './balance-config.js';
import { MatchHttpError } from './matches.js';

export async function claimMatchForSimulation(matchId: string): Promise<{ attemptNumber: number }> {
  return prisma.$transaction(async (tx) => {
    const match = await tx.match.findUnique({ where: { id: matchId } });
    if (!match) {
      throw new MatchHttpError(404, 'MatchNotFound', 'Match not found');
    }
    if (match.status === 'COMPLETED') {
      throw new MatchHttpError(409, 'MatchAlreadyCompleted', 'Match already has a completed result', {
        currentResultId: match.currentResultId,
      });
    }
    if (match.status === 'SIMULATING') {
      throw new MatchHttpError(409, 'MatchSimulationInProgress', 'Match simulation already in progress');
    }
    if (match.status !== 'PREPARED') {
      throw new MatchHttpError(409, 'MatchNotPrepared', `Match status ${match.status} cannot be simulated`);
    }

    const attemptNumber = match.latestSimulationAttemptNumber + 1;
    await tx.match.update({
      where: { id: matchId },
      data: {
        status: 'SIMULATING',
        latestSimulationAttemptNumber: attemptNumber,
      },
    });
    return { attemptNumber };
  });
}

export async function releaseMatchAfterSimulationFailure(matchId: string, permanent: boolean): Promise<void> {
  await prisma.match.updateMany({
    where: { id: matchId, status: 'SIMULATING' },
    data: { status: permanent ? 'FAILED' : 'PREPARED' },
  });
}

function mapDecisionType(value: CompleteMatchResult['decisionType']): MatchDecisionType {
  return value;
}

function buildPlayerStatRows(matchResultId: string, engineOutput: CompleteMatchResult) {
  const rows: Prisma.PlayerGameStatCreateManyInput[] = [];
  for (const skater of engineOutput.statistics.skaters) {
    rows.push({
      matchResultId,
      playerId: skater.playerId,
      teamId: skater.teamId,
      position: skater.primaryPosition,
      statsJson: JSON.stringify(skater),
      goals: skater.goals,
      assists: skater.assists,
      points: skater.points,
      shotsOnGoal: skater.shotsOnGoal,
      penaltyMinutes: skater.penaltyMinutes,
      powerPlayGoals: skater.powerPlayGoals,
      shortHandedGoals: skater.shortHandedGoals,
      shootoutAttempts: 0,
      shootoutGoals: 0,
    });
  }
  for (const goalie of engineOutput.statistics.goalies) {
    rows.push({
      matchResultId,
      playerId: goalie.playerId,
      teamId: goalie.teamId,
      position: 'G',
      statsJson: JSON.stringify(goalie),
      goals: 0,
      assists: 0,
      points: 0,
      shotsOnGoal: 0,
      penaltyMinutes: 0,
      powerPlayGoals: 0,
      shortHandedGoals: 0,
      shootoutAttempts: 0,
      shootoutGoals: 0,
    });
  }
  return rows;
}

function buildTeamStatRows(matchResultId: string, engineOutput: CompleteMatchResult) {
  return [engineOutput.statistics.home, engineOutput.statistics.away].map((team) => ({
    matchResultId,
    teamId: team.teamId,
    side: team.side,
    statsJson: JSON.stringify(team),
    goals: team.goals,
    shotsOnGoal: team.shotsOnGoal,
    penalties: team.penalties,
    penaltyMinutes: team.penaltyMinutes,
    powerPlayGoals: team.powerPlayGoals,
    shortHandedGoals: team.shortHandedGoals,
    shootoutAttempts: team.shootoutAttempts ?? 0,
    shootoutGoals: team.shootoutGoals ?? 0,
  }));
}

function buildEventRows(matchResultId: string, engineOutput: CompleteMatchResult) {
  return engineOutput.events.map((event) => ({
    matchResultId,
    eventIndex: event.index,
    eventType: event.type,
    period: event.period,
    elapsedSeconds: event.elapsedSeconds,
    remainingSeconds: event.remainingSeconds,
    teamId: event.teamId,
    primaryPlayerId: event.playerIds[0] ?? null,
    eventJson: JSON.stringify(event),
    visibility: event.visibility,
  }));
}

export async function persistMatchResultAtomic(
  matchId: string,
  engineOutput: CompleteMatchResult,
  simulationInput: SimulationInput,
  balanceSnapshot: ActiveBalanceSnapshot,
  opts?: { attemptNumber?: number; supersedeResultId?: string | null },
): Promise<string> {
  const startedAt = new Date();
  const balanceSnapshotText = canonicalizeBalanceConfig(balanceSnapshot.config);
  const simulationInputText = canonicalizeSimulationInput(simulationInput);

  return prisma.$transaction(async (tx) => {
    const match = await tx.match.findUnique({ where: { id: matchId } });
    if (!match) {
      throw new MatchHttpError(404, 'MatchNotFound', 'Match not found');
    }
    if (match.status !== 'SIMULATING' && !opts?.supersedeResultId) {
      throw new MatchHttpError(409, 'MatchNotSimulating', 'Match is not in SIMULATING state');
    }

    const attemptNumber = opts?.attemptNumber ?? match.latestSimulationAttemptNumber;
    if (attemptNumber < 1) {
      throw new MatchHttpError(409, 'InvalidMatchAttempt', 'Invalid simulation attempt number');
    }

    const result = await tx.matchResult.create({
      data: {
        matchId,
        attemptNumber,
        status: 'COMPLETED' satisfies MatchResultStatus,
        decisionType: mapDecisionType(engineOutput.decisionType),
        homeScore: engineOutput.homeScore,
        awayScore: engineOutput.awayScore,
        homeRegulationScore: engineOutput.homeRegulationScore,
        awayRegulationScore: engineOutput.awayRegulationScore,
        homeOvertimeScore: engineOutput.homeOvertimeScore,
        awayOvertimeScore: engineOutput.awayOvertimeScore,
        homeShootoutScore: engineOutput.homeShootoutScore,
        awayShootoutScore: engineOutput.awayShootoutScore,
        winnerTeamId: engineOutput.winnerTeamId,
        engineVersion: engineOutput.metadata.engineVersion,
        simulationMode: engineOutput.metadata.simulationMode,
        randomSeed: String(engineOutput.metadata.seed),
        inputFingerprint: engineOutput.metadata.inputFingerprint,
        balancePresetId: engineOutput.metadata.balancePresetId,
        balancePresetVersionId: engineOutput.metadata.balanceVersionId,
        balanceVersionNumber: engineOutput.metadata.balanceVersionNumber,
        balanceConfigHash: engineOutput.metadata.balanceHash,
        balanceSnapshotText,
        simulationInputText,
        diagnosticsText: JSON.stringify(engineOutput.diagnostics),
        traceHash: engineOutput.diagnostics.traceHash,
        reconciliationStatus: engineOutput.reconciliation.ok ? 'OK' : 'FAIL',
        reconciliationJson: JSON.stringify(engineOutput.reconciliation),
        startedAt,
        completedAt: new Date(),
      },
    });

    const eventRows = buildEventRows(result.id, engineOutput);
    if (eventRows.length > 0) {
      await tx.matchEvent.createMany({ data: eventRows });
    }

    const playerRows = buildPlayerStatRows(result.id, engineOutput);
    if (playerRows.length > 0) {
      await tx.playerGameStat.createMany({ data: playerRows });
    }

    const teamRows = buildTeamStatRows(result.id, engineOutput);
    await tx.teamGameStat.createMany({ data: teamRows });

    if (opts?.supersedeResultId) {
      await tx.matchResult.updateMany({
        where: { id: opts.supersedeResultId, matchId, status: 'COMPLETED' },
        data: {
          status: 'SUPERSEDED',
          supersededAt: new Date(),
          supersededByResultId: result.id,
        },
      });
      await tx.match.update({
        where: { id: matchId },
        data: {
          status: 'COMPLETED',
          currentResultId: result.id,
        },
      });
    } else {
      const updated = await tx.match.updateMany({
        where: { id: matchId, status: 'SIMULATING' },
        data: {
          status: 'COMPLETED',
          currentResultId: result.id,
        },
      });
      if (updated.count !== 1) {
        throw new MatchHttpError(409, 'MatchSimulationStateConflict', 'Match simulation state changed during persistence');
      }
    }

    return result.id;
  });
}

export async function persistFailedMatchAttempt(
  matchId: string,
  attemptNumber: number,
  reason: string,
  simulationInputText: string,
  balanceSnapshot: ActiveBalanceSnapshot,
): Promise<string> {
  return prisma.$transaction(async (tx) => {
    const result = await tx.matchResult.create({
      data: {
        matchId,
        attemptNumber,
        status: 'FAILED',
        decisionType: 'REGULATION',
        homeScore: 0,
        awayScore: 0,
        homeRegulationScore: 0,
        awayRegulationScore: 0,
        engineVersion: 'unknown',
        simulationMode: 'F14_PLAYABLE_MATCH',
        randomSeed: 'unknown',
        inputFingerprint: 'unknown',
        balancePresetId: balanceSnapshot.preset.id,
        balancePresetVersionId: balanceSnapshot.version.id,
        balanceVersionNumber: balanceSnapshot.version.versionNumber,
        balanceConfigHash: balanceSnapshot.version.configHash,
        balanceSnapshotText: canonicalizeBalanceConfig(balanceSnapshot.config),
        simulationInputText,
        traceHash: 'failed',
        reconciliationStatus: 'FAIL',
        diagnosticsText: JSON.stringify({ reason }),
        startedAt: new Date(),
        completedAt: new Date(),
      },
    });
    await tx.match.update({
      where: { id: matchId },
      data: { status: 'FAILED', currentResultId: result.id },
    });
    return result.id;
  });
}
