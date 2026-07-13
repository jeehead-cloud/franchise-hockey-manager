import type { CommissionerAuditSource, Prisma } from '@prisma/client';
import {
  PERIOD_DURATION_SECONDS,
  REGULATION_PERIODS,
  parseRegularSeasonConfig,
  generateRegularSeasonSchedule,
  toMatchCompletionRules,
  type GeneratedSchedule,
  type RegularSeasonConfig,
  type CompetitionRules,
  RegularSeasonError,
} from '@fhm/engine';
import { prisma } from '../db/client.js';
import { assertExpectedUpdatedAt, parseStoredRules, writeCompetitionAudit } from './competition-helpers.js';
import { assertTeamSimulationReady } from './simulation-input.js';
import { canonicalizeStoredMatchRules, type StoredMatchRules } from './match-rules.js';
import { RegularSeasonHttpError } from './regular-season-errors.js';

export interface StageScheduleContext {
  stage: {
    id: string;
    name: string;
    stageType: string;
    status: string;
    scheduleStatus: string;
    scheduleSeed: string | null;
    scheduleHash: string | null;
    scheduleVersion: number;
    scheduleGeneratedAt: Date | null;
    simulationStartedAt: Date | null;
    completedAt: Date | null;
    configText: string;
    updatedAt: Date;
    competitionEditionId: string;
    participantSource: string;
  };
  edition: {
    id: string;
    status: string;
    rulesSnapshotText: string;
    rulesHash: string;
  };
  participants: Array<{
    participantId: string;
    teamId: string;
    teamNameSnapshot: string;
    status: string;
  }>;
  config: RegularSeasonConfig;
  rules: CompetitionRules;
}

function mapEngineError(err: unknown): never {
  if (err instanceof RegularSeasonError) {
    const status =
      err.code === 'InvalidScheduleConfiguration' || err.code === 'ScheduleGenerationFailed'
        ? 422
        : 400;
    throw new RegularSeasonHttpError(status, err.code, err.message);
  }
  throw err;
}

function parseConfigOrThrow(raw: unknown): RegularSeasonConfig {
  try {
    return parseRegularSeasonConfig(raw);
  } catch (err) {
    mapEngineError(err);
  }
}

export async function loadRegularSeasonStageContext(stageId: string): Promise<StageScheduleContext> {
  const stage = await prisma.competitionStage.findUnique({
    where: { id: stageId },
    include: {
      edition: {
        include: {
          participants: {
            where: { status: 'CONFIRMED' },
            orderBy: { participantOrder: 'asc' },
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
    throw new RegularSeasonHttpError(404, 'CompetitionStageNotFound', 'Competition stage not found');
  }
  if (stage.stageType !== 'REGULAR_SEASON') {
    throw new RegularSeasonHttpError(409, 'StageNotRegularSeason', 'Stage is not REGULAR_SEASON');
  }

  let config: RegularSeasonConfig;
  try {
    config = parseConfigOrThrow(JSON.parse(stage.configText));
  } catch (err) {
    if (err instanceof SyntaxError) {
      throw new RegularSeasonHttpError(422, 'InvalidScheduleConfiguration', 'Stage config is not valid JSON');
    }
    throw err;
  }

  const rules = parseStoredRules(stage.edition.rulesSnapshotText);

  // EDITION_PARTICIPANTS: use stage rows when present; otherwise edition confirmed participants.
  let participants = stage.participants.map((sp) => ({
    participantId: sp.competitionParticipantId,
    teamId: sp.participant.teamId,
    teamNameSnapshot: sp.participant.teamNameSnapshot,
    status: sp.status,
  }));
  if (participants.length === 0 && stage.participantSource === 'EDITION_PARTICIPANTS') {
    participants = stage.edition.participants.map((p) => ({
      participantId: p.id,
      teamId: p.teamId,
      teamNameSnapshot: p.teamNameSnapshot,
      status: p.status,
    }));
  }

  return {
    stage: {
      id: stage.id,
      name: stage.name,
      stageType: stage.stageType,
      status: stage.status,
      scheduleStatus: stage.scheduleStatus,
      scheduleSeed: stage.scheduleSeed,
      scheduleHash: stage.scheduleHash,
      scheduleVersion: stage.scheduleVersion,
      scheduleGeneratedAt: stage.scheduleGeneratedAt,
      simulationStartedAt: stage.simulationStartedAt,
      completedAt: stage.completedAt,
      configText: stage.configText,
      updatedAt: stage.updatedAt,
      competitionEditionId: stage.competitionEditionId,
      participantSource: stage.participantSource,
    },
    edition: {
      id: stage.edition.id,
      status: stage.edition.status,
      rulesSnapshotText: stage.edition.rulesSnapshotText,
      rulesHash: stage.edition.rulesHash,
    },
    participants,
    config,
    rules,
  };
}

function buildMatchRulesFromEdition(rules: CompetitionRules): StoredMatchRules {
  return {
    regulationPeriods: REGULATION_PERIODS,
    periodDurationSeconds: PERIOD_DURATION_SECONDS,
    completion: toMatchCompletionRules(rules.matchRules),
  };
}

async function assertParticipantsReady(participants: StageScheduleContext['participants']) {
  if (participants.length < 2) {
    throw new RegularSeasonHttpError(
      422,
      'InvalidScheduleConfiguration',
      'At least two confirmed stage participants are required',
    );
  }
  for (const p of participants) {
    try {
      await assertTeamSimulationReady(p.teamId);
    } catch (err) {
      throw new RegularSeasonHttpError(
        409,
        'MatchNotSimulationReady',
        `Team ${p.teamNameSnapshot} is not simulation-ready`,
        { teamId: p.teamId, cause: err instanceof Error ? err.message : String(err) },
      );
    }
  }
}

function assertEditionActive(ctx: StageScheduleContext) {
  if (ctx.edition.status !== 'ACTIVE') {
    throw new RegularSeasonHttpError(
      409,
      'StageNotReady',
      'Competition edition must be ACTIVE to generate a regular-season schedule',
    );
  }
}

function generateScheduleForContext(ctx: StageScheduleContext, seed: string): GeneratedSchedule {
  try {
    return generateRegularSeasonSchedule({
      participantIds: ctx.participants.map((p) => p.participantId),
      config: ctx.config,
      seed,
    });
  } catch (err) {
    mapEngineError(err);
  }
}

async function ensureStageParticipantsMaterialized(
  tx: Prisma.TransactionClient,
  ctx: StageScheduleContext,
) {
  const existing = await tx.stageParticipant.count({
    where: { competitionStageId: ctx.stage.id },
  });
  if (existing > 0) return;
  if (ctx.stage.participantSource !== 'EDITION_PARTICIPANTS') {
    throw new RegularSeasonHttpError(
      422,
      'InvalidScheduleConfiguration',
      'Stage has no confirmed participants',
    );
  }
  let order = 0;
  for (const p of ctx.participants) {
    order += 1;
    await tx.stageParticipant.create({
      data: {
        competitionStageId: ctx.stage.id,
        competitionParticipantId: p.participantId,
        stageOrder: order,
        status: 'CONFIRMED',
      },
    });
  }
}

export async function previewRegularSeasonSchedule(stageId: string, seed: string) {
  const ctx = await loadRegularSeasonStageContext(stageId);
  assertEditionActive(ctx);
  if (
    ctx.stage.status !== 'READY' &&
    ctx.stage.status !== 'SCHEDULED' &&
    ctx.stage.status !== 'PLANNED'
  ) {
    throw new RegularSeasonHttpError(
      409,
      'StageNotReady',
      `Stage status ${ctx.stage.status} cannot preview schedule`,
    );
  }
  await assertParticipantsReady(ctx.participants);
  const schedule = generateScheduleForContext(ctx, seed);
  const teamByParticipant = new Map(ctx.participants.map((p) => [p.participantId, p]));

  return {
    stageId,
    seed,
    scheduleHash: schedule.scheduleHash,
    diagnostics: schedule.diagnostics,
    rounds: schedule.rounds.map((round) => ({
      roundNumber: round.roundNumber,
      displayLabel: `Matchday ${round.roundNumber}`,
      matches: round.matches.map((m) => {
        const home = teamByParticipant.get(m.homeParticipantId)!;
        const away = teamByParticipant.get(m.awayParticipantId)!;
        return {
          ...m,
          homeTeamId: home.teamId,
          awayTeamId: away.teamId,
          homeTeamName: home.teamNameSnapshot,
          awayTeamName: away.teamNameSnapshot,
        };
      }),
    })),
    persisted: false,
  };
}

async function persistGeneratedSchedule(
  tx: Prisma.TransactionClient,
  ctx: StageScheduleContext,
  schedule: GeneratedSchedule,
  seed: string,
  source: CommissionerAuditSource,
  reason: string,
  action: 'SCHEDULE_GENERATED' | 'SCHEDULE_REGENERATED',
) {
  const teamByParticipant = new Map(ctx.participants.map((p) => [p.participantId, p]));
  const matchRules = buildMatchRulesFromEdition(ctx.rules);
  const rulesJson = canonicalizeStoredMatchRules(matchRules);
  const nextVersion = ctx.stage.scheduleVersion + 1;

  // Delete only unsimulated COMPETITION matches for this stage
  const existing = await tx.match.findMany({
    where: { competitionStageId: ctx.stage.id, source: 'COMPETITION' },
    select: { id: true, status: true, currentResultId: true },
  });
  for (const m of existing) {
    if (m.status === 'COMPLETED' || m.currentResultId) {
      throw new RegularSeasonHttpError(
        409,
        'ScheduleLockedByResults',
        'Cannot replace schedule after match results exist',
      );
    }
  }
  if (existing.length > 0) {
    await tx.match.deleteMany({
      where: {
        competitionStageId: ctx.stage.id,
        source: 'COMPETITION',
        status: { in: ['PREPARED', 'FAILED'] },
        currentResultId: null,
      },
    });
  }

  await ensureStageParticipantsMaterialized(tx, ctx);

  for (const m of schedule.matches) {
    const home = teamByParticipant.get(m.homeParticipantId);
    const away = teamByParticipant.get(m.awayParticipantId);
    if (!home || !away) {
      throw new RegularSeasonHttpError(422, 'ScheduleGenerationFailed', 'Participant mapping failed');
    }
    await tx.match.create({
      data: {
        homeTeamId: home.teamId,
        awayTeamId: away.teamId,
        competitionEditionId: ctx.edition.id,
        competitionStageId: ctx.stage.id,
        status: 'PREPARED',
        source: 'COMPETITION',
        createdBySource: 'REGULAR_SEASON_SCHEDULE',
        rulesJson,
        competitionRoundNumber: m.roundNumber,
        competitionSlotNumber: m.slotNumber,
        scheduleKey: m.scheduleKey,
        scheduleOrder: m.scheduleOrder,
        competitionRulesHash: ctx.edition.rulesHash,
      },
    });
  }

  const updated = await tx.competitionStage.update({
    where: { id: ctx.stage.id },
    data: {
      status: 'SCHEDULED',
      scheduleStatus: 'GENERATED',
      scheduleSeed: seed,
      scheduleHash: schedule.scheduleHash,
      scheduleVersion: nextVersion,
      scheduleGeneratedAt: new Date(),
    },
  });

  await writeCompetitionAudit(
    tx,
    'COMPETITION_STAGE',
    ctx.stage.id,
    action,
    reason,
    {
      status: ctx.stage.status,
      scheduleHash: ctx.stage.scheduleHash,
      scheduleVersion: ctx.stage.scheduleVersion,
    },
    {
      status: updated.status,
      scheduleHash: updated.scheduleHash,
      scheduleVersion: updated.scheduleVersion,
      totalMatches: schedule.diagnostics.totalMatches,
    },
    ['status', 'scheduleHash', 'scheduleVersion', 'scheduleSeed'],
    source,
  );

  return { stage: updated, schedule };
}

export async function generateRegularSeasonSchedulePersisted(
  stageId: string,
  opts: { expectedUpdatedAt: string; seed: string; reason: string },
  source: CommissionerAuditSource,
) {
  const ctx = await loadRegularSeasonStageContext(stageId);
  assertEditionActive(ctx);
  assertExpectedUpdatedAt(ctx.stage.updatedAt, opts.expectedUpdatedAt);

  if (ctx.stage.status !== 'READY' && ctx.stage.status !== 'PLANNED') {
    throw new RegularSeasonHttpError(
      409,
      'StageNotReady',
      `Stage must be PLANNED or READY to generate schedule (current: ${ctx.stage.status})`,
    );
  }
  if (ctx.stage.scheduleStatus === 'GENERATED' || ctx.stage.scheduleStatus === 'LOCKED') {
    throw new RegularSeasonHttpError(
      409,
      'ScheduleAlreadyGenerated',
      'Schedule already generated; use regenerate before results exist',
    );
  }

  await assertParticipantsReady(ctx.participants);
  const schedule = generateScheduleForContext(ctx, opts.seed);

  return prisma.$transaction(async (tx) => {
    const result = await persistGeneratedSchedule(
      tx,
      ctx,
      schedule,
      opts.seed,
      source,
      opts.reason,
      'SCHEDULE_GENERATED',
    );
    return {
      stageId,
      status: result.stage.status,
      scheduleStatus: result.stage.scheduleStatus,
      scheduleSeed: result.stage.scheduleSeed,
      scheduleHash: result.stage.scheduleHash,
      scheduleVersion: result.stage.scheduleVersion,
      diagnostics: schedule.diagnostics,
      totalMatches: schedule.diagnostics.totalMatches,
    };
  });
}

export async function regenerateRegularSeasonSchedule(
  stageId: string,
  opts: { expectedUpdatedAt: string; seed: string; reason: string },
  source: CommissionerAuditSource,
) {
  const ctx = await loadRegularSeasonStageContext(stageId);
  assertEditionActive(ctx);
  assertExpectedUpdatedAt(ctx.stage.updatedAt, opts.expectedUpdatedAt);

  const completedCount = await prisma.match.count({
    where: {
      competitionStageId: stageId,
      source: 'COMPETITION',
      OR: [{ status: 'COMPLETED' }, { currentResultId: { not: null } }],
    },
  });
  if (
    completedCount > 0 ||
    ctx.stage.scheduleStatus === 'LOCKED' ||
    ctx.stage.status === 'COMPLETED' ||
    ctx.stage.status === 'IN_PROGRESS'
  ) {
    throw new RegularSeasonHttpError(
      409,
      'ScheduleLockedByResults',
      'Schedule regeneration is blocked after match results exist',
    );
  }

  if (
    ctx.stage.status !== 'READY' &&
    ctx.stage.status !== 'SCHEDULED' &&
    ctx.stage.status !== 'PLANNED'
  ) {
    throw new RegularSeasonHttpError(
      409,
      'StageNotReady',
      `Cannot regenerate schedule in status ${ctx.stage.status}`,
    );
  }

  await assertParticipantsReady(ctx.participants);
  const schedule = generateScheduleForContext(ctx, opts.seed);

  return prisma.$transaction(async (tx) => {
    // Temporarily treat as regeneratable READY path
    const mutableCtx = {
      ...ctx,
      stage: { ...ctx.stage, scheduleVersion: ctx.stage.scheduleVersion },
    };
    const result = await persistGeneratedSchedule(
      tx,
      mutableCtx,
      schedule,
      opts.seed,
      source,
      opts.reason,
      'SCHEDULE_REGENERATED',
    );
    return {
      stageId,
      status: result.stage.status,
      scheduleStatus: result.stage.scheduleStatus,
      scheduleSeed: result.stage.scheduleSeed,
      scheduleHash: result.stage.scheduleHash,
      scheduleVersion: result.stage.scheduleVersion,
      diagnostics: schedule.diagnostics,
      totalMatches: schedule.diagnostics.totalMatches,
    };
  });
}

export async function getStageSchedule(
  stageId: string,
  query: { round?: number; teamId?: string; status?: string; page?: number; pageSize?: number },
) {
  const ctx = await loadRegularSeasonStageContext(stageId);
  const page = Math.max(1, query.page ?? 1);
  const pageSize = Math.min(100, Math.max(1, query.pageSize ?? 50));

  const where: Prisma.MatchWhereInput = {
    competitionStageId: stageId,
    source: 'COMPETITION',
  };
  if (query.round != null) where.competitionRoundNumber = query.round;
  if (query.status) where.status = query.status as Prisma.EnumMatchStatusFilter['equals'];
  if (query.teamId) {
    where.OR = [{ homeTeamId: query.teamId }, { awayTeamId: query.teamId }];
  }

  const [total, matches] = await Promise.all([
    prisma.match.count({ where }),
    prisma.match.findMany({
      where,
      include: {
        homeTeam: { select: { id: true, name: true } },
        awayTeam: { select: { id: true, name: true } },
      },
      orderBy: [{ scheduleOrder: 'asc' }, { createdAt: 'asc' }],
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
  ]);

  const resultIds = matches.map((m) => m.currentResultId).filter(Boolean) as string[];
  const results =
    resultIds.length > 0
      ? await prisma.matchResult.findMany({
          where: { id: { in: resultIds } },
          select: {
            id: true,
            decisionType: true,
            homeScore: true,
            awayScore: true,
            winnerTeamId: true,
            completedAt: true,
          },
        })
      : [];
  const resultById = new Map(results.map((r) => [r.id, r]));

  const roundsMap = new Map<number, typeof matches>();
  for (const m of matches) {
    const rn = m.competitionRoundNumber ?? 0;
    if (!roundsMap.has(rn)) roundsMap.set(rn, []);
    roundsMap.get(rn)!.push(m);
  }

  return {
    stage: {
      id: ctx.stage.id,
      name: ctx.stage.name,
      status: ctx.stage.status,
      scheduleStatus: ctx.stage.scheduleStatus,
      scheduleSeed: ctx.stage.scheduleSeed,
      scheduleHash: ctx.stage.scheduleHash,
      scheduleVersion: ctx.stage.scheduleVersion,
      scheduleGeneratedAt: ctx.stage.scheduleGeneratedAt?.toISOString() ?? null,
    },
    totalMatches: total,
    page,
    pageSize,
    rounds: [...roundsMap.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([roundNumber, roundMatches]) => ({
        roundNumber,
        displayLabel: `Matchday ${roundNumber}`,
        matches: roundMatches.map((m) => {
          const current = m.currentResultId ? resultById.get(m.currentResultId) : null;
          return {
            id: m.id,
            scheduleKey: m.scheduleKey,
            scheduleOrder: m.scheduleOrder,
            competitionRoundNumber: m.competitionRoundNumber,
            competitionSlotNumber: m.competitionSlotNumber,
            homeTeamId: m.homeTeamId,
            awayTeamId: m.awayTeamId,
            homeTeamName: m.homeTeam.name,
            awayTeamName: m.awayTeam.name,
            status: m.status,
            currentResult: current
              ? {
                  id: current.id,
                  decisionType: current.decisionType,
                  homeScore: current.homeScore,
                  awayScore: current.awayScore,
                  winnerTeamId: current.winnerTeamId,
                  completedAt: current.completedAt?.toISOString() ?? null,
                }
              : null,
          };
        }),
      })),
  };
}
