import type { CommissionerAuditSource, Prisma } from '@prisma/client';
import {
  simulateCompleteMatch as runCompleteMatch,
  validateSimulationInput,
  type CompleteMatchResult,
  type FinalMatchResult,
  type SimulationInput,
  type SimulationResult,
} from '@fhm/engine';
import { prisma } from '../db/client.js';
import { CommissionerHttpError } from '../commissioner/errors.js';
import { getActiveBalanceSnapshot } from './balance-config.js';
import { MatchHttpError, mapMatchServiceError } from './matches.js';
import { generateSeed, toCompleteMatchResult } from './match-simulation.js';
import { persistMatchResultAtomic } from './match-persistence.js';
import { isErrorResult, parsePagination, type ParsedPagination } from './query.js';

async function writeMatchAudit(
  tx: Prisma.TransactionClient,
  opts: {
    entityType: 'MATCH' | 'MATCH_RESULT';
    entityId: string;
    action: 'MATCH_RESIMULATED' | 'MATCH_RESULT_SUPERSEDED';
    reason: string;
    before: unknown;
    after: unknown;
    source: CommissionerAuditSource;
  },
) {
  await tx.commissionerAuditLog.create({
    data: {
      entityType: opts.entityType,
      entityId: opts.entityId,
      action: opts.action,
      reason: opts.reason,
      beforeJson: JSON.stringify(opts.before),
      afterJson: JSON.stringify(opts.after),
      changedFieldsJson: JSON.stringify(['resultId', 'seed']),
      source: opts.source,
    },
  });
}

export async function listMatchAttempts(matchId: string, pagination: ParsedPagination) {
  const match = await prisma.match.findUnique({ where: { id: matchId } });
  if (!match) return null;

  const where = { matchId };
  const [total, rows] = await Promise.all([
    prisma.matchResult.count({ where }),
    prisma.matchResult.findMany({
      where,
      orderBy: { attemptNumber: 'desc' },
      skip: pagination.skip,
      take: pagination.pageSize,
    }),
  ]);

  return {
    matchId,
    currentResultId: match.currentResultId,
    items: rows.map((row) => ({
      id: row.id,
      attemptNumber: row.attemptNumber,
      status: row.status,
      decisionType: row.decisionType,
      homeScore: row.homeScore,
      awayScore: row.awayScore,
      winnerTeamId: row.winnerTeamId,
      randomSeed: row.randomSeed,
      engineVersion: row.engineVersion,
      simulationMode: row.simulationMode,
      traceHash: row.traceHash,
      reconciliationStatus: row.reconciliationStatus,
      startedAt: row.startedAt.toISOString(),
      completedAt: row.completedAt?.toISOString() ?? null,
      supersededAt: row.supersededAt?.toISOString() ?? null,
      supersededByResultId: row.supersededByResultId,
    })),
    total,
  };
}

export interface ResimulateMatchResult {
  matchId: string;
  previousResultId: string;
  resultId: string;
  seed: string;
  decisionType: string;
  homeScore: number;
  awayScore: number;
  traceHash: string;
}

export async function resimulateMatch(
  matchId: string,
  opts: {
    expectedCurrentResultId: string;
    seed?: string | number;
    reason: string;
    inputMode: 'ORIGINAL';
    source: CommissionerAuditSource;
  },
): Promise<ResimulateMatchResult> {
  const match = await prisma.match.findUnique({ where: { id: matchId } });
  if (!match) {
    throw new MatchHttpError(404, 'MatchNotFound', 'Match not found');
  }
  if (match.status !== 'COMPLETED') {
    throw new MatchHttpError(409, 'MatchNotCompleted', 'Only completed matches can be resimulated');
  }

  if (match.competitionStageId) {
    const stage = await prisma.competitionStage.findUnique({
      where: { id: match.competitionStageId },
      select: { id: true, status: true, stageType: true },
    });
    if (stage?.status === 'COMPLETED') {
      throw new MatchHttpError(
        409,
        'PlayoffMatchResimulationLocked',
        'Resimulation is blocked for matches in a COMPLETED competition stage',
        { competitionStageId: stage.id },
      );
    }
    if (match.playoffSeriesId) {
      const series = await prisma.playoffSeries.findUnique({ where: { id: match.playoffSeriesId } });
      if (series?.status === 'COMPLETED') {
        throw new MatchHttpError(
          409,
          'PlayoffMatchResimulationLocked',
          'Resimulation is blocked for completed playoff series',
        );
      }
      const laterGame = await prisma.match.count({
        where: {
          playoffSeriesId: match.playoffSeriesId,
          playoffGameNumber: { gt: match.playoffGameNumber ?? 0 },
        },
      });
      if (laterGame > 0) {
        throw new MatchHttpError(
          409,
          'PlayoffMatchResimulationLocked',
          'Resimulation is blocked once a later game exists in the series',
        );
      }
    }
  }

  if (!match.currentResultId || match.currentResultId !== opts.expectedCurrentResultId) {
    throw new MatchHttpError(409, 'MatchResultStale', 'Current match result changed; refresh and retry', {
      expectedCurrentResultId: opts.expectedCurrentResultId,
      currentResultId: match.currentResultId,
    });
  }

  const currentResult = await prisma.matchResult.findUnique({ where: { id: match.currentResultId } });
  if (!currentResult || currentResult.status !== 'COMPLETED') {
    throw new MatchHttpError(404, 'MatchResultNotFound', 'Current match result not found');
  }

  if (opts.inputMode !== 'ORIGINAL') {
    throw new CommissionerHttpError(400, 'InvalidResimulationRequest', 'Only ORIGINAL input mode is supported');
  }

  let input: SimulationInput;
  try {
    input = JSON.parse(currentResult.simulationInputText) as SimulationInput;
  } catch {
    throw new MatchHttpError(422, 'InvalidStoredSimulationInput', 'Stored simulation input is invalid JSON');
  }

  const seed = opts.seed ?? generateSeed();
  input = {
    ...input,
    seed,
    matchId,
    inputFingerprint: currentResult.inputFingerprint,
  };
  try {
    validateSimulationInput(input);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Invalid stored simulation input';
    throw new MatchHttpError(422, 'InvalidStoredSimulationInput', message);
  }

  const attemptNumber = match.latestSimulationAttemptNumber + 1;
  await prisma.match.update({
    where: { id: matchId },
    data: {
      status: 'SIMULATING',
      latestSimulationAttemptNumber: attemptNumber,
    },
  });

  try {
    const engineOutput = toCompleteMatchResult(input, runCompleteMatch(input));
    const balanceSnapshot = await getActiveBalanceSnapshot();
    const newResultId = await persistMatchResultAtomic(matchId, engineOutput, input, balanceSnapshot, {
      attemptNumber,
      supersedeResultId: currentResult.id,
    });

    await prisma.$transaction(async (tx) => {
      await writeMatchAudit(tx, {
        entityType: 'MATCH',
        entityId: matchId,
        action: 'MATCH_RESIMULATED',
        reason: opts.reason,
        before: {
          currentResultId: currentResult.id,
          seed: currentResult.randomSeed,
        },
        after: {
          currentResultId: newResultId,
          seed: String(seed),
        },
        source: opts.source,
      });

      await writeMatchAudit(tx, {
        entityType: 'MATCH_RESULT',
        entityId: currentResult.id,
        action: 'MATCH_RESULT_SUPERSEDED',
        reason: opts.reason,
        before: { status: 'COMPLETED', resultId: currentResult.id },
        after: { status: 'SUPERSEDED', supersededByResultId: newResultId },
        source: opts.source,
      });
    });

    return {
      matchId,
      previousResultId: currentResult.id,
      resultId: newResultId,
      seed: String(seed),
      decisionType: engineOutput.decisionType,
      homeScore: engineOutput.homeScore,
      awayScore: engineOutput.awayScore,
      traceHash: engineOutput.diagnostics.traceHash,
    };
  } catch (err) {
    await prisma.match.update({
      where: { id: matchId },
      data: { status: 'COMPLETED' },
    });
    throw mapMatchServiceError(err);
  }
}

export { parsePagination };
