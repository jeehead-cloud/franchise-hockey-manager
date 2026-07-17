import type { Prisma, PrismaClient } from '@prisma/client';
import {
  assertReadyForPrepare,
  assertTransitionReconciliation,
  canExecuteTransition,
  isInputStillFresh,
  stableSeasonTransitionHash,
  SeasonTransitionError,
  type PlannedTargetEdition,
  type SeasonTransitionConfig,
  type TransitionReadiness,
} from '@fhm/engine';
import { prisma } from '../db/client.js';
import { SeasonTransitionHttpError } from './season-transition-errors.js';
import { buildPreviewInput } from './season-transition-readiness.js';
import { createSqliteSafetyBackup } from './sqlite-backup.js';

const FULL_RUN_INCLUDE = {
  sourceWorldSeason: { select: { id: true, label: true, startYear: true, endYear: true, status: true, phase: true } },
  targetWorldSeason: { select: { id: true, label: true, startYear: true, endYear: true, status: true, phase: true } },
  configVersion: { select: { id: true, versionNumber: true, configHash: true, changeReason: true } },
  events: { orderBy: { createdAt: 'desc' as const }, take: 100 },
  entityRecords: { orderBy: { createdAt: 'desc' as const }, take: 200 },
} satisfies Prisma.SeasonTransitionRunInclude;

export type SeasonTransitionRunDetail = Prisma.SeasonTransitionRunGetPayload<{ include: typeof FULL_RUN_INCLUDE }>;

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

export async function getSeasonTransitionRun(runId: string): Promise<SeasonTransitionRunDetail> {
  const run = await prisma.seasonTransitionRun.findUnique({ where: { id: runId }, include: FULL_RUN_INCLUDE });
  if (!run) throw new SeasonTransitionHttpError(404, 'SeasonTransitionRunNotFound', 'Season transition run not found');
  return run;
}

export async function listSeasonTransitionRuns(query: { sourceWorldSeasonId?: string; status?: string; targetWorldSeasonId?: string } = {}) {
  const where: Prisma.SeasonTransitionRunWhereInput = {};
  if (query.sourceWorldSeasonId) where.sourceWorldSeasonId = query.sourceWorldSeasonId;
  if (query.targetWorldSeasonId) where.targetWorldSeasonId = query.targetWorldSeasonId;
  if (query.status) where.status = query.status as Prisma.SeasonTransitionRunWhereInput['status'];
  const items = await prisma.seasonTransitionRun.findMany({
    where,
    include: {
      sourceWorldSeason: { select: { id: true, label: true, startYear: true, endYear: true, status: true } },
      targetWorldSeason: { select: { id: true, label: true, startYear: true, endYear: true, status: true } },
    },
    orderBy: { createdAt: 'desc' },
  });
  return {
    items: items.map((r) => ({
      id: r.id,
      sourceWorldSeasonId: r.sourceWorldSeasonId,
      sourceWorldSeasonLabel: r.sourceWorldSeason.label,
      targetWorldSeasonId: r.targetWorldSeasonId,
      targetWorldSeasonLabel: r.targetWorldSeason?.label ?? null,
      status: r.status,
      runVersion: r.runVersion,
      targetDisplayName: r.targetDisplayName,
      targetSeasonOrder: r.targetSeasonOrder,
      preparedAt: r.preparedAt,
      completedAt: r.completedAt,
      failedAt: r.failedAt,
      cancelledAt: r.cancelledAt,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
      reason: r.reason,
      createdBy: r.createdBy,
    })),
  };
}

export async function getSeasonTransitionStatus() {
  const seasons = await prisma.worldSeason.findMany({ orderBy: { startYear: 'desc' } });
  const current = seasons.find((s) => s.status === 'ACTIVE') ?? seasons[0] ?? null;
  if (!current) return { initialized: false, currentSeason: null, latestTransition: null };
  const latestTransition = await prisma.seasonTransitionRun.findFirst({
    where: { sourceWorldSeasonId: current.id },
    include: { targetWorldSeason: { select: { id: true, label: true, status: true } } },
    orderBy: { createdAt: 'desc' },
  });
  return {
    initialized: true,
    currentSeason: { id: current.id, label: current.label, startYear: current.startYear, endYear: current.endYear, status: current.status, phase: current.phase },
    latestTransition: latestTransition
      ? {
        id: latestTransition.id,
        status: latestTransition.status,
        sourceWorldSeasonId: latestTransition.sourceWorldSeasonId,
        targetWorldSeasonId: latestTransition.targetWorldSeasonId,
        targetWorldSeasonLabel: latestTransition.targetWorldSeason?.label ?? null,
        targetDisplayName: latestTransition.targetDisplayName,
        targetSeasonOrder: latestTransition.targetSeasonOrder,
        completedAt: latestTransition.completedAt,
      }
      : null,
  };
}

// ---------------------------------------------------------------------------
// Mutations: prepare / execute / cancel
// ---------------------------------------------------------------------------

/**
 * Freeze the transition input and plan into a PREPARED run. Performs no writes
 * to WorldSeason / CompetitionEdition. Idempotent: a second prepare with
 * identical input returns the existing PREPARED run; conflicting input is
 * rejected with 409.
 */
export async function prepareSeasonTransitionRun(input: {
  sourceWorldSeasonId: string;
  configVersionId?: string;
  targetDisplayNameOverride?: string | null;
  expectedSourceSeasonUpdatedAt?: string;
  reason: string;
  createdBy: string;
}): Promise<SeasonTransitionRunDetail> {
  // Optimistic concurrency on the source season.
  if (input.expectedSourceSeasonUpdatedAt) {
    const season = await prisma.worldSeason.findUnique({ where: { id: input.sourceWorldSeasonId }, select: { updatedAt: true } });
    if (season && season.updatedAt.toISOString() !== input.expectedSourceSeasonUpdatedAt) {
      throw new SeasonTransitionHttpError(409, 'SeasonTransitionInputStale', 'Source WorldSeason has changed; re-preview before preparing');
    }
  }

  const preview = await buildPreviewInput(prisma, input.sourceWorldSeasonId, {
    configVersionId: input.configVersionId,
    targetDisplayNameOverride: input.targetDisplayNameOverride ?? null,
  });
  const { readiness, inputHash, config, configHash, configVersion } = preview;

  // Reject NOT_READY.
  try {
    assertReadyForPrepare(readiness);
  } catch (e) {
    if (e instanceof SeasonTransitionError) {
      throw new SeasonTransitionHttpError(422, e.code, e.message, e.details);
    }
    throw e;
  }

  // Idempotency: an existing active transition for this source season.
  const existingActive = await prisma.seasonTransitionRun.findFirst({
    where: { sourceWorldSeasonId: input.sourceWorldSeasonId, status: { in: ['PREPARED', 'RUNNING', 'COMPLETED'] } },
  });
  if (existingActive) {
    if (existingActive.inputHash === inputHash) {
      return getSeasonTransitionRun(existingActive.id);
    }
    throw new SeasonTransitionHttpError(409, 'SeasonTransitionAlreadyExists', 'A different active transition already exists for this source season', { runId: existingActive.id });
  }

  // Stale-input guard: source season updatedAt must match what was previewed.
  if (input.expectedSourceSeasonUpdatedAt && readiness.sourceSeason.updatedAt !== input.expectedSourceSeasonUpdatedAt) {
    throw new SeasonTransitionHttpError(409, 'SeasonTransitionInputStale', 'Source WorldSeason state changed during prepare');
  }

  const target = readiness.proposedTargetSeason;
  const planSnapshotText = JSON.stringify({
    target,
    competitionPlan: readiness.competitionPlan,
    carryForwardSummary: readiness.carryForwardSummary,
    blockers: readiness.blockers,
    warnings: readiness.warnings,
    readinessHash: readiness.readinessHash,
  });
  const planHash = stableSeasonTransitionHash(planSnapshotText);
  const inputSnapshotText = JSON.stringify({
    configHash,
    sourceSeason: readiness.sourceSeason,
    completedOffseasonRun: readiness.completedOffseasonRun,
    targetDisplayNameOverride: input.targetDisplayNameOverride ?? null,
    readinessHash: readiness.readinessHash,
  });

  const run = await prisma.seasonTransitionRun.create({
    data: {
      sourceWorldSeasonId: input.sourceWorldSeasonId,
      status: 'PREPARED',
      configVersionId: configVersion.id,
      configHash,
      runVersion: 1,
      targetDisplayName: target.displayName,
      targetSeasonOrder: target.order,
      targetStartDateIso: target.startDateIso,
      targetEndDateIso: target.endDateIso,
      inputSnapshotText,
      inputHash,
      planSnapshotText,
      planHash,
      preparedAt: new Date(),
      reason: input.reason,
      createdBy: input.createdBy,
      events: {
        create: {
          eventType: 'PREPARED',
          statusBefore: null,
          statusAfter: 'PREPARED',
          summaryText: `Prepared transition to ${target.label}`,
          reason: input.reason,
          eventHash: stableSeasonTransitionHash({ run: 'new', type: 'PREPARED', summary: target.label }),
        },
      },
    },
    include: FULL_RUN_INCLUDE,
  });
  return run;
}

/**
 * Atomically publish the target WorldSeason, current-season designation,
 * CompetitionEditions, stages, and participants from the frozen plan. Performs
 * a pre-execution SQLite backup. Idempotent on COMPLETED: returns the existing
 * result. Never generates schedules, Matches, or standings.
 */
export async function executeSeasonTransitionRun(runId: string, options: { expectedUpdatedAt?: string; reason?: string } = {}): Promise<SeasonTransitionRunDetail> {
  const run = await prisma.seasonTransitionRun.findUnique({
    where: { id: runId },
    include: { sourceWorldSeason: true, configVersion: true },
  });
  if (!run) throw new SeasonTransitionHttpError(404, 'SeasonTransitionRunNotFound', 'Season transition run not found');

  // Idempotent COMPLETED.
  if (run.status === 'COMPLETED') {
    return getSeasonTransitionRun(runId);
  }
  if (!canExecuteTransition(run.status as never)) {
    throw new SeasonTransitionHttpError(409, 'SeasonTransitionNotPrepared', `Transition run status ${run.status} cannot execute`);
  }

  // Optimistic concurrency on the run itself.
  if (options.expectedUpdatedAt && run.updatedAt.toISOString() !== options.expectedUpdatedAt) {
    throw new SeasonTransitionHttpError(409, 'SeasonTransitionInputStale', 'Prepared transition run has changed; reload and retry');
  }

  // Stale-input proof: recompute the live input hash and compare.
  const override = (() => {
    try {
      const parsed = JSON.parse(run.inputSnapshotText) as { targetDisplayNameOverride?: string | null };
      return parsed.targetDisplayNameOverride ?? null;
    } catch {
      return null;
    }
  })();
  const livePreview = await buildPreviewInput(prisma, run.sourceWorldSeasonId, {
    configVersionId: run.configVersionId,
    targetDisplayNameOverride: override,
  });
  if (!isInputStillFresh(run.inputHash, livePreview.inputHash)) {
    throw new SeasonTransitionHttpError(409, 'SeasonTransitionInputStale', 'Source world state changed after prepare; re-preview and re-prepare');
  }

  // Pre-execution safety backup (required; not F32 restore).
  let backupMetadata: { backupPath: string; relativeDisplayPath: string; createdAt: string; bytes: number } | null = null;
  try {
    backupMetadata = await createSqliteSafetyBackup({ label: `season-transition-${run.id}`, sourceOperationType: 'SEASON_TRANSITION', sourceOperationId: run.id });
  } catch (e) {
    const code = (e as { code?: string })?.code ?? 'BackupFailed';
    throw new SeasonTransitionHttpError(503, code, (e as Error).message ?? 'Backup failed');
  }

  const config = livePreview.config as SeasonTransitionConfig;
  const readiness = livePreview.readiness as TransitionReadiness;
  const plannedEditions = readiness.competitionPlan as PlannedTargetEdition[];

  // Atomic publication: target WorldSeason + current-season designation +
  // CompetitionEditions + stages + entity summary + COMPLETED, in one tx.
  return prisma.$transaction(async (tx) => {
    // Mark run RUNNING (transient) and record backup + start events.
    const running = await tx.seasonTransitionRun.update({
      where: { id: run.id },
      data: {
        status: 'RUNNING',
        startedAt: new Date(),
        backupMetadataText: backupMetadata ? JSON.stringify(backupMetadata) : null,
      },
    });
    await appendEvent(tx, run.id, { eventType: 'STARTED', statusBefore: 'PREPARED', statusAfter: 'RUNNING', summaryText: 'Execution started', reason: options.reason ?? '' });
    if (backupMetadata) {
      await appendEvent(tx, run.id, { eventType: 'BACKUP_CREATED', summaryText: `Backup ${backupMetadata.relativeDisplayPath}`, reason: options.reason ?? '' });
    }

    // 1. Create the target WorldSeason. `startYear` is the canonical order.
    const targetSeason = await tx.worldSeason.create({
      data: {
        label: readiness.proposedTargetSeason.label,
        startYear: readiness.proposedTargetSeason.order,
        endYear: readiness.proposedTargetSeason.order + 1,
        phase: 'SEASON_PREPARATION',
        status: 'ACTIVE',
      },
    });
    await appendEvent(tx, run.id, { eventType: 'TARGET_SEASON_CREATED', summaryText: `Created ${targetSeason.label}`, reason: options.reason ?? '' });

    // 2. Demote the source season to COMPLETED (historical).
    await tx.worldSeason.update({
      where: { id: run.sourceWorldSeasonId },
      data: { status: 'COMPLETED' },
    });

    // 3. Any other ACTIVE seasons must be demoted too — exactly one current.
    const otherActive = await tx.worldSeason.findMany({ where: { status: 'ACTIVE', id: { not: targetSeason.id } } });
    for (const s of otherActive) {
      await tx.worldSeason.update({ where: { id: s.id }, data: { status: 'COMPLETED' } });
    }

    // 4. Create target CompetitionEditions + stages from the plan.
    let totalStagesCreated = 0;
    let totalParticipantsCarried = 0;
    for (const planned of plannedEditions) {
      const edition = await tx.competitionEdition.create({
        data: {
          competitionId: planned.competitionId,
          worldSeasonId: targetSeason.id,
          displayName: planned.displayName,
          status: planned.initialStatus,
          rulesSnapshotText: planned.rulesSnapshotText,
          rulesHash: planned.rulesHash,
          preparedAt: new Date(),
        },
      });
      // Create stages (template copy only — no schedule/standings/bracket).
      for (const stage of planned.stages) {
        await tx.competitionStage.create({
          data: {
            competitionEditionId: edition.id,
            name: stage.name,
            stageType: stage.stageType as never,
            stageOrder: stage.stageOrder,
            status: 'PLANNED',
            configText: stage.configText,
            configHash: stage.configHash,
            participantSource: stage.participantSource as never,
            expectedQualifierCount: stage.expectedQualifierCount,
          },
        });
        totalStagesCreated += 1;
      }
      // Copy confirmed participants (no seed/group/order beyond what existed).
      if (config.competitions.copyConfirmedParticipants) {
        const sourceParticipants = await tx.competitionParticipant.findMany({
          where: {
            edition: { worldSeasonId: run.sourceWorldSeasonId, competitionId: planned.competitionId },
            status: 'CONFIRMED',
          },
          orderBy: { participantOrder: 'asc' },
        });
        for (const sp of sourceParticipants) {
          await tx.competitionParticipant.create({
            data: {
              competitionEditionId: edition.id,
              teamId: sp.teamId,
              seed: sp.seed,
              groupKey: sp.groupKey,
              participantOrder: sp.participantOrder,
              status: 'CONFIRMED',
              source: 'IMPORTED',
              teamNameSnapshot: sp.teamNameSnapshot,
              teamShortNameSnapshot: sp.teamShortNameSnapshot,
            },
          });
          totalParticipantsCarried += 1;
        }
      }
    }
    await appendEvent(tx, run.id, {
      eventType: 'COMPETITIONS_CREATED',
      summaryText: `${plannedEditions.length} edition(s), ${totalStagesCreated} stage(s), ${totalParticipantsCarried} participant(s)`,
      reason: options.reason ?? '',
    });

    // 5. Lineups: NOT auto-rebuilt. Club lineups persist as working copies and
    //    are marked for review (advisory only — F31 does not add a needsReview
    //    column to TeamLineup; the warning is surfaced in readiness instead).
    await appendEvent(tx, run.id, { eventType: 'STATE_CARRIED', summaryText: 'Players, contracts, draft rights, scouting, lineups, and national-team state preserved (no auto-rebuild)', reason: options.reason ?? '' });

    // 6. Entity summary records (aggregate, not one per Player).
    await tx.seasonTransitionEntityRecord.create({
      data: {
        seasonTransitionRunId: run.id,
        entityType: 'WORLD_SEASON',
        sourceEntityId: run.sourceWorldSeasonId,
        targetEntityId: targetSeason.id,
        action: 'CREATED',
        snapshotText: JSON.stringify({ label: targetSeason.label, order: targetSeason.startYear }),
        snapshotHash: stableSeasonTransitionHash({ id: targetSeason.id, label: targetSeason.label }),
      },
    });
    await tx.seasonTransitionEntityRecord.create({
      data: {
        seasonTransitionRunId: run.id,
        entityType: 'CONTRACT_STATE',
        sourceEntityId: null,
        targetEntityId: null,
        action: 'PRESERVED',
        snapshotText: JSON.stringify({ note: 'All ACTIVE/FUTURE contracts and ACTIVE draft rights preserved without duplication' }),
        snapshotHash: stableSeasonTransitionHash({ preserved: 'contracts-and-rights' }),
      },
    });
    await tx.seasonTransitionEntityRecord.create({
      data: {
        seasonTransitionRunId: run.id,
        entityType: 'CLUB_LINEUP',
        sourceEntityId: null,
        targetEntityId: null,
        action: 'MARKED_FOR_REVIEW',
        snapshotText: JSON.stringify({ note: 'Club lineups carried forward as working copies; review for ownership drift' }),
        snapshotHash: stableSeasonTransitionHash({ lineups: 'review' }),
      },
    });
    await tx.seasonTransitionEntityRecord.create({
      data: {
        seasonTransitionRunId: run.id,
        entityType: 'NATIONAL_TEAM_STATE',
        sourceEntityId: null,
        targetEntityId: null,
        action: 'SKIPPED',
        snapshotText: JSON.stringify({ note: 'Locked national-team rosters not reused; no automatic NT edition preparation' }),
        snapshotHash: stableSeasonTransitionHash({ nt: 'skipped' }),
      },
    });

    // 7. Reconciliation inside the transaction.
    const currentSeasonCount = await tx.worldSeason.count({ where: { status: 'ACTIVE' } });
    const sourceAfter = await tx.worldSeason.findUniqueOrThrow({ where: { id: run.sourceWorldSeasonId } });
    const targetAfter = await tx.worldSeason.findUniqueOrThrow({ where: { id: targetSeason.id } });
    const playerCount = await tx.player.count();
    const matchesCreated = 0; // F31 never creates matches.
    const schedulesGenerated = 0; // F31 never generates schedules.
    const result = assertTransitionReconciliation({
      config,
      sourceSeason: readiness.sourceSeason,
      targetSeason: { ...readiness.proposedTargetSeason, id: targetSeason.id },
      plannedEditions,
      published: {
        targetWorldSeasonId: targetSeason.id,
        targetWorldSeasonOrder: targetSeason.startYear,
        targetWorldSeasonLabel: targetSeason.label,
        targetWorldSeasonStatus: targetAfter.status,
        targetWorldSeasonIsCurrent: targetAfter.status === 'ACTIVE',
        sourceWorldSeasonStatus: sourceAfter.status,
        sourceWorldSeasonIsCurrent: sourceAfter.status === 'ACTIVE',
        editionsCreated: plannedEditions.map((p) => ({
          competitionId: p.competitionId,
          displayName: p.displayName,
          status: p.initialStatus,
          rulesHash: p.rulesHash,
          stageCount: p.stages.length,
          participantCount: config.competitions.copyConfirmedParticipants ? p.participantCount : 0,
        })),
        currentSeasonCount,
        playerCount,
        sourcePlayerCount: playerCount, // F31 never duplicates Players.
        lockedNationalTeamRostersCopied: 0,
        matchesCreated,
        schedulesGenerated,
      },
    });

    // 8. Mark COMPLETED with result hash.
    const resultHash = stableSeasonTransitionHash({ reconciliation: result.checks, runId: run.id, targetSeasonId: targetSeason.id });
    const completed = await tx.seasonTransitionRun.update({
      where: { id: running.id },
      data: {
        status: 'COMPLETED',
        targetWorldSeasonId: targetSeason.id,
        completedAt: new Date(),
        resultHash,
      },
      include: FULL_RUN_INCLUDE,
    });
    await appendEvent(tx, run.id, { eventType: 'COMPLETED', statusBefore: 'RUNNING', statusAfter: 'COMPLETED', summaryText: `Transition completed → ${targetSeason.label}`, reason: options.reason ?? '' });
    return completed;
  });
}

/**
 * Discard a PREPARED transition. Only PREPARED runs may be discarded; FAILED
 * runs may also be discarded to clear stale state.
 */
export async function cancelSeasonTransitionRun(runId: string, options: { expectedUpdatedAt?: string; reason: string }): Promise<SeasonTransitionRunDetail> {
  const run = await prisma.seasonTransitionRun.findUnique({ where: { id: runId } });
  if (!run) throw new SeasonTransitionHttpError(404, 'SeasonTransitionRunNotFound', 'Season transition run not found');
  if (run.status === 'COMPLETED') {
    throw new SeasonTransitionHttpError(409, 'SeasonTransitionCompleted', 'Completed transitions are immutable');
  }
  if (run.status === 'CANCELLED') {
    return getSeasonTransitionRun(runId);
  }
  if (run.status === 'RUNNING') {
    throw new SeasonTransitionHttpError(409, 'SeasonTransitionNotPrepared', 'Cannot cancel a RUNNING transition');
  }
  if (options.expectedUpdatedAt && run.updatedAt.toISOString() !== options.expectedUpdatedAt) {
    throw new SeasonTransitionHttpError(409, 'SeasonTransitionInputStale', 'Transition run has changed; reload and retry');
  }
  return prisma.$transaction(async (tx) => {
    const updated = await tx.seasonTransitionRun.update({
      where: { id: run.id },
      data: { status: 'CANCELLED', cancelledAt: new Date() },
      include: FULL_RUN_INCLUDE,
    });
    await appendEvent(tx, run.id, { eventType: 'CANCELLED', statusBefore: run.status, statusAfter: 'CANCELLED', summaryText: 'Transition discarded', reason: options.reason });
    return updated;
  });
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function appendEvent(
  tx: Prisma.TransactionClient,
  runId: string,
  opts: {
    eventType: 'PREPARED' | 'STARTED' | 'BACKUP_CREATED' | 'TARGET_SEASON_CREATED' | 'COMPETITIONS_CREATED' | 'STATE_CARRIED' | 'COMPLETED' | 'FAILED' | 'CANCELLED';
    statusBefore?: string | null;
    statusAfter?: string | null;
    summaryText: string;
    reason?: string;
  },
) {
  await tx.seasonTransitionEvent.create({
    data: {
      seasonTransitionRunId: runId,
      eventType: opts.eventType,
      statusBefore: opts.statusBefore ?? null,
      statusAfter: opts.statusAfter ?? null,
      summaryText: opts.summaryText,
      reason: opts.reason ?? '',
      eventHash: stableSeasonTransitionHash({
        run: runId,
        type: opts.eventType,
        before: opts.statusBefore ?? null,
        after: opts.statusAfter ?? null,
        summary: opts.summaryText,
        nonce: Date.now().toString(36) + Math.random().toString(36).slice(2, 8),
      }),
    },
  });
}
