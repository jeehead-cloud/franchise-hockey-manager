import { randomBytes } from 'node:crypto';
import {
  simulateCompleteMatch as runCompleteMatch,
  InvalidSimulationInputError,
  IncompatibleBalanceConfigError,
  InvalidSnapshotError,
  SafetyLimitExceededError,
  IllegalStateTransitionError,
  StatisticsReconciliationError,
  SimulationError,
  type CompleteMatchResult,
  type SimulationInput,
  type SimulationResult,
  type FinalMatchResult,
} from '@fhm/engine';
import { prisma } from '../db/client.js';
import { buildSimulationInput, SimulationHttpError } from './simulation-input.js';
import { MatchHttpError, mapMatchServiceError } from './matches.js';
import { parseStoredMatchRules } from './match-rules.js';
import {
  persistMatchResultAtomic,
  releaseMatchAfterSimulationFailure,
  claimMatchForSimulation,
} from './match-persistence.js';
import { getActiveBalanceSnapshot } from './balance-config.js';

export function generateSeed(): string {
  return randomBytes(16).toString('hex');
}

export function toCompleteMatchResult(
  input: SimulationInput,
  output: SimulationResult & { finalResult: FinalMatchResult },
): CompleteMatchResult {
  const { finalResult } = output;
  const winnerTeamId =
    finalResult.winnerSide === 'HOME'
      ? input.homeTeam.teamId
      : finalResult.winnerSide === 'AWAY'
        ? input.awayTeam.teamId
        : null;

  return {
    metadata: output.metadata,
    finalState: output.finalState,
    events: output.events,
    diagnostics: output.diagnostics,
    statistics: output.statistics,
    reconciliation: output.reconciliation,
    periodScores: output.periodScores,
    decisionType: finalResult.decisionType,
    homeScore: finalResult.displayScore.home,
    awayScore: finalResult.displayScore.away,
    homeRegulationScore: finalResult.regulationScore.home,
    awayRegulationScore: finalResult.regulationScore.away,
    homeOvertimeScore: finalResult.overtimeScore.home,
    awayOvertimeScore: finalResult.overtimeScore.away,
    homeShootoutScore: finalResult.shootoutScore.home,
    awayShootoutScore: finalResult.shootoutScore.away,
    winnerTeamId,
  };
}

function mapEngineError(err: unknown): MatchHttpError {
  if (err instanceof SimulationHttpError || err instanceof MatchHttpError) {
    return mapMatchServiceError(err);
  }
  if (err instanceof InvalidSnapshotError) {
    return new MatchHttpError(422, 'InvalidSnapshot', err.message);
  }
  if (err instanceof InvalidSimulationInputError) {
    return new MatchHttpError(422, 'InvalidSimulationInput', err.message);
  }
  if (err instanceof IncompatibleBalanceConfigError) {
    return new MatchHttpError(409, 'IncompatibleBalanceConfiguration', err.message);
  }
  if (err instanceof StatisticsReconciliationError) {
    return new MatchHttpError(500, 'StatisticsReconciliationFailed', err.message);
  }
  if (err instanceof SafetyLimitExceededError || err instanceof IllegalStateTransitionError) {
    return new MatchHttpError(500, 'SimulationFailed', err.message);
  }
  if (err instanceof SimulationError) {
    return new MatchHttpError(500, 'SimulationFailed', err.message);
  }
  return new MatchHttpError(500, 'SimulationFailed', 'Simulation failed');
}

export async function buildMatchSimulationInput(matchId: string, seed: string | number): Promise<SimulationInput> {
  const match = await prisma.match.findUnique({ where: { id: matchId } });
  if (!match) {
    throw new MatchHttpError(404, 'MatchNotFound', 'Match not found');
  }

  const rules = parseStoredMatchRules(match.rulesJson);
  return buildSimulationInput({
    homeTeamId: match.homeTeamId,
    awayTeamId: match.awayTeamId,
    seed,
    matchId,
    forPlayableMatch: true,
    completionRules: rules.completion,
    rules: {
      regulationPeriods: rules.regulationPeriods,
      periodDurationSeconds: rules.periodDurationSeconds,
    },
  });
}

export async function simulateMatch(matchId: string, seed?: string | number): Promise<{
  matchId: string;
  resultId: string;
  engineOutput: CompleteMatchResult;
}> {
  const resolvedSeed = seed ?? generateSeed();
  let claimed = false;

  try {
    await claimMatchForSimulation(matchId);
    claimed = true;

    const input = await buildMatchSimulationInput(matchId, resolvedSeed);
    const engineOutput = toCompleteMatchResult(input, runCompleteMatch(input));
    const balanceSnapshot = await getActiveBalanceSnapshot();
    const resultId = await persistMatchResultAtomic(matchId, engineOutput, input, balanceSnapshot);

    return { matchId, resultId, engineOutput };
  } catch (err) {
    if (claimed) {
      await releaseMatchAfterSimulationFailure(matchId, err instanceof StatisticsReconciliationError);
    }
    throw mapEngineError(err);
  }
}
