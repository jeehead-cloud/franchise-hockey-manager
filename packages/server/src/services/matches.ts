import type { MatchDecisionType, MatchSource, MatchStatus, Prisma } from '@prisma/client';
import { prisma } from '../db/client.js';
import { isErrorResult, parseEnum, parseOptionalString, parsePagination, type ParsedPagination } from './query.js';
import {
  assertTeamSimulationReady,
  buildSimulationInput,
  SimulationHttpError,
} from './simulation-input.js';
import {
  canonicalizeStoredMatchRules,
  defaultStoredMatchRules,
  parseStoredMatchRules,
  type StoredMatchRules,
} from './match-rules.js';

export class MatchHttpError extends Error {
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

export function mapMatchServiceError(err: unknown): MatchHttpError {
  if (err instanceof MatchHttpError) return err;
  if (err instanceof SimulationHttpError) {
    return new MatchHttpError(err.statusCode, err.code, err.message, err.details);
  }
  return new MatchHttpError(500, 'MatchOperationFailed', 'Match operation failed');
}

const MATCH_STATUSES = ['PREPARED', 'SIMULATING', 'COMPLETED', 'FAILED', 'SUPERSEDED'] as const satisfies readonly MatchStatus[];
const MATCH_DECISION_TYPES = ['REGULATION', 'OVERTIME', 'SHOOTOUT', 'TIE'] as const satisfies readonly MatchDecisionType[];

export interface MatchListFilters {
  status?: MatchStatus;
  decisionType?: MatchDecisionType;
  homeTeamId?: string;
  awayTeamId?: string;
  teamId?: string;
  competitionEditionId?: string;
  source?: MatchSource;
}

export interface MatchCurrentResultSummary {
  id: string;
  decisionType: MatchDecisionType;
  homeScore: number;
  awayScore: number;
  winnerTeamId: string | null;
  completedAt: string | null;
  engineVersion: string;
  randomSeed: string;
  traceHash: string;
}

export interface MatchSummaryDto {
  id: string;
  homeTeamId: string;
  awayTeamId: string;
  homeTeamName: string;
  awayTeamName: string;
  competitionEditionId: string | null;
  status: MatchStatus;
  scheduledAt: string | null;
  currentResultId: string | null;
  currentResult: MatchCurrentResultSummary | null;
  latestSimulationAttemptNumber: number;
  source: MatchSource;
  createdAt: string;
  updatedAt: string;
}

function toMatchSummary(row: {
  id: string;
  homeTeamId: string;
  awayTeamId: string;
  homeTeam: { name: string };
  awayTeam: { name: string };
  competitionEditionId: string | null;
  status: MatchStatus;
  scheduledAt: Date | null;
  currentResultId: string | null;
  latestSimulationAttemptNumber: number;
  source: MatchSource;
  createdAt: Date;
  updatedAt: Date;
}): MatchSummaryDto {
  return {
    id: row.id,
    homeTeamId: row.homeTeamId,
    awayTeamId: row.awayTeamId,
    homeTeamName: row.homeTeam.name,
    awayTeamName: row.awayTeam.name,
    competitionEditionId: row.competitionEditionId,
    status: row.status,
    scheduledAt: row.scheduledAt?.toISOString() ?? null,
    currentResultId: row.currentResultId,
    currentResult: null,
    latestSimulationAttemptNumber: row.latestSimulationAttemptNumber,
    source: row.source,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function validateTeamsReadyForMatch(homeTeamId: string, awayTeamId: string): Promise<void> {
  if (homeTeamId === awayTeamId) {
    throw new MatchHttpError(400, 'InvalidMatchRequest', 'Home and away teams must differ');
  }
  await assertTeamSimulationReady(homeTeamId);
  await assertTeamSimulationReady(awayTeamId);
}

export async function createPreparedMatch(opts: {
  homeTeamId: string;
  awayTeamId: string;
  competitionEditionId?: string | null;
  competitionStageId?: string | null;
  scheduledAt?: Date | null;
  rules?: Partial<StoredMatchRules>;
  source?: MatchSource;
  createdBySource?: string | null;
}) {
  if (opts.competitionEditionId) {
    const edition = await prisma.competitionEdition.findUnique({ where: { id: opts.competitionEditionId } });
    if (!edition) {
      throw new MatchHttpError(404, 'CompetitionEditionNotFound', 'Competition edition not found');
    }
  }

  if (opts.competitionStageId) {
    const stage = await prisma.competitionStage.findUnique({
      where: { id: opts.competitionStageId },
    });
    if (!stage) {
      throw new MatchHttpError(404, 'CompetitionStageNotFound', 'Competition stage not found');
    }
    if (opts.competitionEditionId && stage.competitionEditionId !== opts.competitionEditionId) {
      throw new MatchHttpError(
        422,
        'StageEditionMismatch',
        'competitionStageId must belong to the given competitionEditionId',
      );
    }
    if (!opts.competitionEditionId) {
      throw new MatchHttpError(
        422,
        'StageRequiresEdition',
        'competitionStageId requires competitionEditionId',
      );
    }
  }

  await validateTeamsReadyForMatch(opts.homeTeamId, opts.awayTeamId);

  const [homeTeam, awayTeam] = await Promise.all([
    prisma.team.findUnique({ where: { id: opts.homeTeamId } }),
    prisma.team.findUnique({ where: { id: opts.awayTeamId } }),
  ]);
  if (!homeTeam || !awayTeam) {
    throw new MatchHttpError(404, 'TeamNotFound', 'Home or away team not found');
  }

  const rules: StoredMatchRules = {
    ...defaultStoredMatchRules(),
    ...(opts.rules ?? {}),
    completion: {
      ...defaultStoredMatchRules().completion,
      ...(opts.rules?.completion ?? {}),
    },
  };

  const match = await prisma.match.create({
    data: {
      homeTeamId: opts.homeTeamId,
      awayTeamId: opts.awayTeamId,
      competitionEditionId: opts.competitionEditionId ?? null,
      competitionStageId: opts.competitionStageId ?? null,
      scheduledAt: opts.scheduledAt ?? null,
      status: 'PREPARED',
      source: opts.source ?? 'MANUAL',
      createdBySource: opts.createdBySource ?? null,
      rulesJson: canonicalizeStoredMatchRules(rules),
    },
    include: { homeTeam: true, awayTeam: true },
  });

  return toMatchSummary(match);
}

export function parseMatchListFilters(query: Record<string, unknown>): MatchListFilters | { error: string } {
  const status = parseEnum(query.status, MATCH_STATUSES, 'status');
  if (isErrorResult(status)) return status;
  const decisionType = parseEnum(query.decisionType, MATCH_DECISION_TYPES, 'decisionType');
  if (isErrorResult(decisionType)) return decisionType;
  const source = parseEnum(query.source, ['MANUAL', 'COMPETITION'] as const, 'source');
  if (isErrorResult(source)) return source;
  return {
    status,
    decisionType,
    homeTeamId: parseOptionalString(query.homeTeamId),
    awayTeamId: parseOptionalString(query.awayTeamId),
    teamId: parseOptionalString(query.teamId),
    competitionEditionId: parseOptionalString(query.competitionEditionId),
    source,
  };
}

function toCurrentResultSummary(row: {
  id: string;
  decisionType: MatchDecisionType;
  homeScore: number;
  awayScore: number;
  winnerTeamId: string | null;
  completedAt: Date | null;
  engineVersion: string;
  randomSeed: string;
  traceHash: string;
}): MatchCurrentResultSummary {
  return {
    id: row.id,
    decisionType: row.decisionType,
    homeScore: row.homeScore,
    awayScore: row.awayScore,
    winnerTeamId: row.winnerTeamId,
    completedAt: row.completedAt?.toISOString() ?? null,
    engineVersion: row.engineVersion,
    randomSeed: row.randomSeed,
    traceHash: row.traceHash,
  };
}

export async function listMatches(filters: MatchListFilters, pagination: ParsedPagination) {
  const where: Prisma.MatchWhereInput = {};
  if (filters.status) where.status = filters.status;
  if (filters.competitionEditionId) where.competitionEditionId = filters.competitionEditionId;
  if (filters.source) where.source = filters.source;
  if (filters.homeTeamId) where.homeTeamId = filters.homeTeamId;
  if (filters.awayTeamId) where.awayTeamId = filters.awayTeamId;
  if (filters.teamId) {
    where.OR = [{ homeTeamId: filters.teamId }, { awayTeamId: filters.teamId }];
  }
  if (filters.decisionType) {
    const matchingResults = await prisma.matchResult.findMany({
      where: { decisionType: filters.decisionType, status: 'COMPLETED' },
      select: { id: true },
    });
    where.currentResultId = { in: matchingResults.map((row) => row.id) };
  }

  const [total, rows] = await Promise.all([
    prisma.match.count({ where }),
    prisma.match.findMany({
      where,
      include: { homeTeam: true, awayTeam: true },
      orderBy: [{ scheduledAt: 'desc' }, { createdAt: 'desc' }],
      skip: pagination.skip,
      take: pagination.pageSize,
    }),
  ]);

  const currentResultIds = rows.map((row) => row.currentResultId).filter((id): id is string => Boolean(id));
  const currentResults =
    currentResultIds.length > 0
      ? await prisma.matchResult.findMany({ where: { id: { in: currentResultIds } } })
      : [];
  const resultById = new Map(currentResults.map((row) => [row.id, row]));

  return {
    items: rows.map((row) => ({
      ...toMatchSummary(row),
      currentResult: row.currentResultId
        ? toCurrentResultSummary(resultById.get(row.currentResultId)!)
        : null,
    })),
    total,
  };
}

export async function getMatchById(id: string) {
  const match = await prisma.match.findUnique({
    where: { id },
    include: { homeTeam: true, awayTeam: true, competitionEdition: true },
  });
  if (!match) return null;

  const rules = parseStoredMatchRules(match.rulesJson);
  const currentResult = match.currentResultId
    ? await prisma.matchResult.findUnique({ where: { id: match.currentResultId } })
    : null;
  return {
    ...toMatchSummary(match),
    currentResult: currentResult ? toCurrentResultSummary(currentResult) : null,
    rules,
    competitionEdition: match.competitionEdition
      ? {
          id: match.competitionEdition.id,
          displayName: match.competitionEdition.displayName,
          status: match.competitionEdition.status,
        }
      : null,
  };
}

/** Smoke validation that teams remain simulation-ready (same gate as simulation input). */
export async function validateMatchTeamsReady(matchId: string): Promise<void> {
  const match = await prisma.match.findUnique({ where: { id: matchId } });
  if (!match) {
    throw new MatchHttpError(404, 'MatchNotFound', 'Match not found');
  }
  await validateTeamsReadyForMatch(match.homeTeamId, match.awayTeamId);
}

export async function previewMatchSimulationInput(matchId: string, seed: string | number) {
  const match = await prisma.match.findUnique({ where: { id: matchId } });
  if (!match) throw new MatchHttpError(404, 'MatchNotFound', 'Match not found');
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
