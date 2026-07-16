import type { Prisma, PrismaClient } from '@prisma/client';
import {
  assertPhaseTransition,
  assertRunTransition,
  defaultOffseasonConfig,
  isTerminalRunStatus,
  OffseasonError,
  phaseCategory,
  progressPercent,
  reconcilePhasePlan,
  reconcileOffseasonRun,
  selectCurrentPhase,
  stableOffseasonHash,
  summarizeRunPhases,
  validateOffseasonConfig,
  type OffseasonConfig,
  type OffseasonLinkedOperations,
  type OffseasonPhaseState,
  type OffseasonPhaseType,
  type OffseasonRunState,
} from '@fhm/engine';
import { prisma } from '../db/client.js';
import { OffseasonHttpError } from './offseason-errors.js';
import {
  canonicalOffseasonConfig,
  getActiveOffseasonSnapshot,
  hashOffseasonConfigDb,
  OFFSEASON_DEFAULT_PRESET_NAME,
} from './offseason-config.js';
import {
  gatherCompletionInput,
  phaseRowToState,
  runRowToState,
} from './offseason-readiness.js';
import {
  findArchivedEditions,
  findCompletedContractExpirationRun,
  findCompletedDevelopmentRun,
  findCompletedDraftEvent,
  findCompletedYouthGenerationRun,
} from './offseason-links.js';
import { createSqliteSafetyBackup } from './sqlite-backup.js';

export type OffseasonDbClient = PrismaClient | Prisma.TransactionClient;

const FULL_RUN_INCLUDE = {
  phases: { orderBy: { phaseOrder: 'asc' as const } },
  events: { orderBy: { createdAt: 'desc' as const }, take: 100 },
  worldSeason: { select: { id: true, label: true, startYear: true, endYear: true, status: true, phase: true } },
  configVersion: { select: { id: true, versionNumber: true, configHash: true, changeReason: true } },
} satisfies Prisma.OffseasonRunInclude;

export interface OffseasonRunRow {
  id: string;
  worldSeasonId: string;
  status: string;
  configVersionId: string;
  configHash: string;
  runVersion: number;
  startedAt: Date | null;
  completedAt: Date | null;
  cancelledAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  currentPhaseType: string | null;
  readinessHash: string | null;
  resultHash: string | null;
  reason: string;
  createdBy: string;
}

// ---------------------------------------------------------------------------
// Status read APIs
// ---------------------------------------------------------------------------

export async function getOffseasonStatus() {
  const season = await prisma.worldSeason.findFirst({ orderBy: { startYear: 'desc' } });
  if (!season) return { initialized: false, worldSeason: null, currentRun: null };
  const current = await prisma.offseasonRun.findFirst({
    where: { worldSeasonId: season.id, status: { not: 'CANCELLED' } },
    include: FULL_RUN_INCLUDE,
    orderBy: { createdAt: 'desc' },
  });
  return {
    initialized: true,
    worldSeason: { id: season.id, label: season.label, startYear: season.startYear, endYear: season.endYear, status: season.status, phase: season.phase },
    currentRun: current ? mapRunDetail(current) : null,
  };
}

export async function listOffseasonRuns(query: { worldSeasonId?: string; status?: string } = {}) {
  const where: Prisma.OffseasonRunWhereInput = {};
  if (query.worldSeasonId) where.worldSeasonId = query.worldSeasonId;
  if (query.status) where.status = query.status as Prisma.OffseasonRunWhereInput['status'];
  const items = await prisma.offseasonRun.findMany({
    where,
    include: { worldSeason: { select: { id: true, label: true, startYear: true, endYear: true } }, _count: { select: { phases: true } } },
    orderBy: { createdAt: 'desc' },
  });
  return {
    items: items.map((r) => ({
      id: r.id,
      worldSeasonId: r.worldSeasonId,
      worldSeasonLabel: r.worldSeason.label,
      status: r.status,
      runVersion: r.runVersion,
      currentPhaseType: r.currentPhaseType,
      startedAt: r.startedAt,
      completedAt: r.completedAt,
      cancelledAt: r.cancelledAt,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
      reason: r.reason,
      createdBy: r.createdBy,
      phaseCount: r._count.phases,
    })),
  };
}

export async function getOffseasonRun(runId: string) {
  const run = await prisma.offseasonRun.findUnique({ where: { id: runId }, include: FULL_RUN_INCLUDE });
  if (!run) throw new OffseasonHttpError(404, 'OffseasonRunNotFound', 'Offseason run not found');
  return mapRunDetail(run);
}

function mapRunDetail(run: Prisma.OffseasonRunGetPayload<{ include: typeof FULL_RUN_INCLUDE }>) {
  return {
    id: run.id,
    worldSeasonId: run.worldSeasonId,
    worldSeason: run.worldSeason,
    status: run.status,
    configVersion: run.configVersion,
    configHash: run.configHash,
    runVersion: run.runVersion,
    startedAt: run.startedAt,
    completedAt: run.completedAt,
    cancelledAt: run.cancelledAt,
    createdAt: run.createdAt,
    updatedAt: run.updatedAt,
    currentPhaseType: run.currentPhaseType,
    readinessHash: run.readinessHash,
    resultHash: run.resultHash,
    reason: run.reason,
    createdBy: run.createdBy,
    phases: run.phases.map(mapPhaseRow),
    events: run.events.map((e) => ({
      id: e.id,
      eventType: e.eventType,
      offseasonPhaseId: e.offseasonPhaseId,
      statusBefore: e.statusBefore,
      statusAfter: e.statusAfter,
      linkedEntityType: e.linkedEntityType,
      linkedEntityId: e.linkedEntityId,
      summaryText: e.summaryText,
      reason: e.reason,
      eventHash: e.eventHash,
      createdAt: e.createdAt,
    })),
  };
}

function mapPhaseRow(p: {
  id: string;
  offseasonRunId: string;
  phaseType: string;
  phaseOrder: number;
  status: string;
  required: boolean;
  allowSkip: boolean;
  competitionArchiveIds: string | null;
  contractExpirationRunId: string | null;
  playerDevelopmentRunId: string | null;
  youthGenerationRunId: string | null;
  draftEventId: string | null;
  startedAt: Date | null;
  completedAt: Date | null;
  skippedAt: Date | null;
  failedAt: Date | null;
  readinessText: string;
  readinessHash: string | null;
  resultText: string | null;
  resultHash: string | null;
  reason: string | null;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: p.id,
    offseasonRunId: p.offseasonRunId,
    phaseType: p.phaseType,
    phaseOrder: p.phaseOrder,
    status: p.status,
    required: p.required,
    allowSkip: p.allowSkip,
    category: phaseCategory(p.phaseType as OffseasonPhaseType),
    competitionArchiveIds: p.competitionArchiveIds,
    contractExpirationRunId: p.contractExpirationRunId,
    playerDevelopmentRunId: p.playerDevelopmentRunId,
    youthGenerationRunId: p.youthGenerationRunId,
    draftEventId: p.draftEventId,
    startedAt: p.startedAt,
    completedAt: p.completedAt,
    skippedAt: p.skippedAt,
    failedAt: p.failedAt,
    readinessText: p.readinessText,
    readinessHash: p.readinessHash,
    resultText: p.resultText,
    resultHash: p.resultHash,
    reason: p.reason,
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
  };
}

// ---------------------------------------------------------------------------
// Commissioner-controlled mutations
// ---------------------------------------------------------------------------

function assertCommissionerWrites() {
  // Commissioner gate is enforced at the route layer; this is a placeholder for
  // any future server-side kill switch (FHM_COMMISSIONER_WRITES_ENABLED).
}

async function appendEvent(
  tx: Prisma.TransactionClient,
  offseasonRunId: string,
  eventType: string,
  opts: {
    offseasonPhaseId?: string | null;
    statusBefore?: string | null;
    statusAfter?: string | null;
    linkedEntityType?: string | null;
    linkedEntityId?: string | null;
    summaryText: string;
    reason?: string;
  },
) {
  const eventHash = stableOffseasonHash({
    run: offseasonRunId,
    phase: opts.offseasonPhaseId ?? null,
    type: eventType,
    before: opts.statusBefore ?? null,
    after: opts.statusAfter ?? null,
    summary: opts.summaryText,
    reason: opts.reason ?? '',
    // Microtime breaks deterministic replay only for event identity — events are
    // append-only history, not part of the run/phase result hash.
    nonce: Date.now().toString(36) + Math.random().toString(36).slice(2, 8),
  });
  await tx.offseasonPhaseEvent.create({
    data: {
      offseasonRunId,
      offseasonPhaseId: opts.offseasonPhaseId ?? null,
      eventType: eventType as never,
      statusBefore: opts.statusBefore ?? null,
      statusAfter: opts.statusAfter ?? null,
      linkedEntityType: opts.linkedEntityType ?? null,
      linkedEntityId: opts.linkedEntityId ?? null,
      summaryText: opts.summaryText,
      reason: opts.reason ?? '',
      eventHash,
    },
  });
}

/**
 * Create a new OffseasonRun for a WorldSeason. Performs no domain operations;
 * detects already-completed underlying subsystem runs and links them.
 * Idempotent: a second create for the same season with a live run returns the
 * existing run with 409.
 */
export async function createOffseasonRun(input: { worldSeasonId: string; configVersionId?: string; reason: string; createdBy: string }) {
  assertCommissionerWrites();
  const season = await prisma.worldSeason.findUnique({ where: { id: input.worldSeasonId } });
  if (!season) throw new OffseasonHttpError(404, 'WorldSeasonNotFound', 'WorldSeason not found');

  const existing = await prisma.offseasonRun.findFirst({
    where: { worldSeasonId: input.worldSeasonId, status: { not: 'CANCELLED' } },
  });
  if (existing) {
    throw new OffseasonHttpError(409, 'OffseasonAlreadyExistsForSeason', 'A non-cancelled OffseasonRun already exists for this WorldSeason', { runId: existing.id });
  }

  const snapshot = input.configVersionId
    ? await loadConfigVersion(input.configVersionId)
    : await getActiveOffseasonSnapshot(prisma);
  const config = snapshot.config;
  const configVersionId = snapshot.version.id;

  // Build phase rows from config (all start PENDING). We do NOT pre-link any
  // underlying run here — linking happens through phase refresh / link.
  const phaseRows = config.phases.map((p, i) => ({
    phaseType: p.type,
    phaseOrder: i + 1,
    status: 'PENDING' as const,
    required: p.required,
    allowSkip: p.allowSkip,
    readinessText: '{}',
  }));
  const planRecon = reconcilePhasePlan(phaseRows.map((p) => ({ phaseType: p.phaseType as OffseasonPhaseType, order: p.phaseOrder, status: 'PENDING', required: p.required, allowSkip: p.allowSkip, linked: null })));
  if (!planRecon.valid) {
    throw new OffseasonHttpError(500, 'OffseasonOperationFailed', `Phase plan invalid: ${planRecon.issues.map((i) => i.message).join('; ')}`);
  }

  const created = await prisma.offseasonRun.create({
    data: {
      worldSeasonId: input.worldSeasonId,
      status: 'PLANNED',
      configVersionId,
      configHash: snapshot.version.configHash,
      runVersion: 1,
      reason: input.reason,
      createdBy: input.createdBy,
      phases: { create: phaseRows },
    },
    include: FULL_RUN_INCLUDE,
  });

  await prisma.$transaction(async (tx) => {
    await appendEvent(tx, created.id, 'RUN_CREATED', {
      statusBefore: null,
      statusAfter: 'PLANNED',
      summaryText: `Offseason run created for ${season.label}`,
      reason: input.reason,
    });
  });

  // Detect any underlying runs that completed before run creation and link them.
  await refreshAllPhaseLinks(created.id);

  return mapRunDetail(await prisma.offseasonRun.findUniqueOrThrow({ where: { id: created.id }, include: FULL_RUN_INCLUDE }));
}

async function loadConfigVersion(versionId: string) {
  const version = await prisma.offseasonPresetVersion.findUnique({
    where: { id: versionId },
    include: { preset: true },
  });
  if (!version) throw new OffseasonHttpError(404, 'OffseasonConfigNotFound', 'Offseason configuration version not found');
  return {
    preset: { id: version.preset.id, name: version.preset.name },
    version: { id: version.id, versionNumber: version.versionNumber, configHash: version.configHash },
    config: validateOffseasonConfig(JSON.parse(version.configJson)),
  };
}

export { loadConfigVersion };

/**
 * Refresh linked-operation columns for every phase of a run. Idempotent: only
 * writes when a column changes; never invokes a domain write API. Used at run
 * creation, run start, refresh, and after restart.
 */
export async function refreshAllPhaseLinks(runId: string) {
  const run = await prisma.offseasonRun.findUnique({ where: { id: runId }, include: { phases: true } });
  if (!run) throw new OffseasonHttpError(404, 'OffseasonRunNotFound', 'Offseason run not found');
  const snapshot = await loadConfigVersion(run.configVersionId);
  const config = snapshot.config;
  for (const phase of run.phases) {
    const links = await detectLinks(config, phase.phaseType as OffseasonPhaseType, run.worldSeasonId);
    if (!links) continue;
    const archiveIdsJson = links.competitionArchiveIds ? JSON.stringify(links.competitionArchiveIds) : null;
    // Only update if something actually changes (idempotency).
    const needsUpdate =
      (phase.competitionArchiveIds ?? null) !== (archiveIdsJson ?? null) ||
      (phase.contractExpirationRunId ?? null) !== (links.contractExpirationRunId ?? null) ||
      (phase.playerDevelopmentRunId ?? null) !== (links.playerDevelopmentRunId ?? null) ||
      (phase.youthGenerationRunId ?? null) !== (links.youthGenerationRunId ?? null) ||
      (phase.draftEventId ?? null) !== (links.draftEventId ?? null);
    if (!needsUpdate) continue;
    await prisma.offseasonPhase.update({
      where: { id: phase.id },
      data: {
        competitionArchiveIds: archiveIdsJson,
        contractExpirationRunId: links.contractExpirationRunId ?? null,
        playerDevelopmentRunId: links.playerDevelopmentRunId ?? null,
        youthGenerationRunId: links.youthGenerationRunId ?? null,
        draftEventId: links.draftEventId ?? null,
      },
    });
    await prisma.$transaction(async (tx) => {
      const summaryParts: string[] = [];
      if (links.competitionArchiveIds?.length) summaryParts.push(`${links.competitionArchiveIds.length} archive(s)`);
      if (links.contractExpirationRunId) summaryParts.push(`expiration ${links.contractExpirationRunId}`);
      if (links.playerDevelopmentRunId) summaryParts.push(`development ${links.playerDevelopmentRunId}`);
      if (links.youthGenerationRunId) summaryParts.push(`youth ${links.youthGenerationRunId}`);
      if (links.draftEventId) summaryParts.push(`draft ${links.draftEventId}`);
      await appendEvent(tx, runId, 'DOMAIN_OPERATION_LINKED', {
        offseasonPhaseId: phase.id,
        linkedEntityType: phase.phaseType,
        summaryText: summaryParts.length ? `Linked: ${summaryParts.join(', ')}` : 'No underlying operation to link',
        reason: 'Automatic detection',
      });
    });
  }
}

async function detectLinks(config: OffseasonConfig, phaseType: OffseasonPhaseType, worldSeasonId: string): Promise<OffseasonLinkedOperations | null> {
  switch (phaseType) {
    case 'COMPETITION_ARCHIVE': {
      const archived = await findArchivedEditions(worldSeasonId);
      return archived.length > 0 ? { competitionArchiveIds: archived.map((a) => a.archiveId) } : {};
    }
    case 'CONTRACT_EXPIRATION': {
      const run = await findCompletedContractExpirationRun(worldSeasonId);
      return { contractExpirationRunId: run?.id ?? null };
    }
    case 'PLAYER_DEVELOPMENT': {
      const run = await findCompletedDevelopmentRun(worldSeasonId);
      return { playerDevelopmentRunId: run?.id ?? null };
    }
    case 'YOUTH_GENERATION': {
      const run = await findCompletedYouthGenerationRun(worldSeasonId);
      return { youthGenerationRunId: run?.id ?? null };
    }
    case 'DRAFT': {
      const event = await findCompletedDraftEvent(worldSeasonId);
      return { draftEventId: event?.id ?? null };
    }
    default:
      return null;
  }
}

/**
 * Start an OffseasonRun: PLANNED/READY → IN_PROGRESS. No backup is taken here —
 * backups happen before each world-mutating phase (matching F28/F29 behavior).
 */
export async function startOffseasonRun(runId: string, expectedUpdatedAt: string | undefined, reason: string) {
  assertCommissionerWrites();
  return prisma.$transaction(async (tx) => {
    const run = await tx.offseasonRun.findUnique({ where: { id: runId }, include: { phases: true } });
    if (!run) throw new OffseasonHttpError(404, 'OffseasonRunNotFound', 'Offseason run not found');
    assertExpectedUpdatedAt(run.updatedAt, expectedUpdatedAt);
    if (run.status !== 'PLANNED' && run.status !== 'READY') {
      throw new OffseasonHttpError(409, 'OffseasonRunNotEditable', `Run must be PLANNED or READY to start (current: ${run.status})`);
    }
    assertRunTransition(run.status as never, 'IN_PROGRESS');
    const config = (await loadConfigVersion(run.configVersionId)).config;
    const state: OffseasonRunState = runRowToState(run);
    const current = selectCurrentPhase(state);
    const updated = await tx.offseasonRun.update({
      where: { id: runId },
      data: { status: 'IN_PROGRESS', startedAt: run.startedAt ?? new Date(), currentPhaseType: current?.phaseType ?? null },
    });
    await appendEvent(tx, runId, 'RUN_STARTED', {
      statusBefore: run.status,
      statusAfter: 'IN_PROGRESS',
      summaryText: `Run started${current ? ` — current phase ${current.phaseType}` : ''}`,
      reason,
    });
    void config;
    return mapRunDetail(await tx.offseasonRun.findUniqueOrThrow({ where: { id: runId }, include: FULL_RUN_INCLUDE }));
  });
}

export async function cancelOffseasonRun(runId: string, expectedUpdatedAt: string | undefined, reason: string) {
  assertCommissionerWrites();
  return prisma.$transaction(async (tx) => {
    const run = await tx.offseasonRun.findUnique({ where: { id: runId } });
    if (!run) throw new OffseasonHttpError(404, 'OffseasonRunNotFound', 'Offseason run not found');
    assertExpectedUpdatedAt(run.updatedAt, expectedUpdatedAt);
    if (isTerminalRunStatus(run.status as never)) {
      throw new OffseasonHttpError(409, 'OffseasonRunNotEditable', `Run is already terminal (current: ${run.status})`);
    }
    const updated = await tx.offseasonRun.update({
      where: { id: runId },
      data: { status: 'CANCELLED', cancelledAt: new Date() },
    });
    await appendEvent(tx, runId, 'RUN_CANCELLED', {
      statusBefore: run.status,
      statusAfter: 'CANCELLED',
      summaryText: 'Run cancelled',
      reason,
    });
    return mapRunDetail(await tx.offseasonRun.findUniqueOrThrow({ where: { id: runId }, include: FULL_RUN_INCLUDE }));
  });
}

/** Idempotent refresh: re-detects underlying links and re-reads current phase. */
export async function refreshOffseasonRun(runId: string, expectedUpdatedAt: string | undefined) {
  assertCommissionerWrites();
  const run = await prisma.offseasonRun.findUnique({ where: { id: runId } });
  if (!run) throw new OffseasonHttpError(404, 'OffseasonRunNotFound', 'Offseason run not found');
  assertExpectedUpdatedAt(run.updatedAt, expectedUpdatedAt);
  await refreshAllPhaseLinks(runId);
  const fresh = await prisma.offseasonRun.findUniqueOrThrow({ where: { id: runId }, include: FULL_RUN_INCLUDE });
  const state = runRowToState(fresh);
  const current = selectCurrentPhase(state);
  // Refresh only mutates currentPhaseType — no status changes, no new events.
  if (fresh.currentPhaseType !== (current?.phaseType ?? null)) {
    await prisma.offseasonRun.update({ where: { id: runId }, data: { currentPhaseType: current?.phaseType ?? null } });
  }
  return mapRunDetail(await prisma.offseasonRun.findUniqueOrThrow({ where: { id: runId }, include: FULL_RUN_INCLUDE }));
}

// ---------------------------------------------------------------------------
// Phase actions
// ---------------------------------------------------------------------------

export async function startPhase(runId: string, phaseId: string, expectedUpdatedAt: string | undefined, reason: string) {
  assertCommissionerWrites();
  return prisma.$transaction(async (tx) => {
    const { run, phase, config, state } = await loadPhaseForMutation(tx, runId, phaseId, expectedUpdatedAt);
    if (run.status !== 'IN_PROGRESS') {
      throw new OffseasonHttpError(409, 'OffseasonRunNotEditable', 'Run must be IN_PROGRESS to start a phase');
    }
    if (phase.status === 'COMPLETED') throw new OffseasonHttpError(409, 'OffseasonPhaseCompleted', 'Phase already completed');
    if (phase.status === 'SKIPPED') throw new OffseasonHttpError(409, 'OffseasonPhaseCompleted', 'Phase already skipped');
    assertPhaseTransition({ phaseType: phase.phaseType as OffseasonPhaseType, to: 'IN_PROGRESS', config, phases: state.phases });
    await tx.offseasonPhase.update({
      where: { id: phaseId },
      data: { status: 'IN_PROGRESS', startedAt: phase.startedAt ?? new Date() },
    });
    await appendEvent(tx, runId, 'PHASE_STARTED', {
      offseasonPhaseId: phaseId,
      statusBefore: phase.status,
      statusAfter: 'IN_PROGRESS',
      summaryText: `Phase ${phase.phaseType} started`,
      reason,
    });
    await tx.offseasonRun.update({ where: { id: runId }, data: { currentPhaseType: phase.phaseType } });
    return mapRunDetail(await tx.offseasonRun.findUniqueOrThrow({ where: { id: runId }, include: FULL_RUN_INCLUDE }));
  });
}

/**
 * Complete a phase. The caller must have already driven the underlying domain
 * operation through its own service (F20/F24/F25/F27/F28); F30 only marks the
 * orchestration phase complete and links the resulting run/event ids. A
 * completed underlying run is required for the automated phases.
 */
export async function completePhase(runId: string, phaseId: string, expectedUpdatedAt: string | undefined, reason: string) {
  assertCommissionerWrites();
  return prisma.$transaction(async (tx) => {
    const { run, phase, config, state } = await loadPhaseForMutation(tx, runId, phaseId, expectedUpdatedAt);
    if (run.status !== 'IN_PROGRESS') {
      throw new OffseasonHttpError(409, 'OffseasonRunNotEditable', 'Run must be IN_PROGRESS to complete a phase');
    }
    if (phase.status === 'COMPLETED') {
      // Idempotent: re-complete is a no-op that returns the current state.
      return mapRunDetail(await tx.offseasonRun.findUniqueOrThrow({ where: { id: runId }, include: FULL_RUN_INCLUDE }));
    }
    if (phase.status === 'SKIPPED') throw new OffseasonHttpError(409, 'OffseasonPhaseCompleted', 'Phase already skipped');
    assertPhaseTransition({ phaseType: phase.phaseType as OffseasonPhaseType, to: 'COMPLETED', config, phases: state.phases });
    // Automated phases require the underlying operation be linked & complete.
    if (phaseCategory(phase.phaseType as OffseasonPhaseType) === 'AUTOMATED') {
      assertAutomatedUnderlyingComplete(phase.phaseType as OffseasonPhaseType, phase);
    }
    const resultText = buildPhaseResultText(phase);
    const resultHash = stableOffseasonHash({ phase: phase.phaseType, run: runId, links: extractLinks(phase), result: resultText });
    await tx.offseasonPhase.update({
      where: { id: phaseId },
      data: { status: 'COMPLETED', completedAt: new Date(), resultText, resultHash },
    });
    await appendEvent(tx, runId, 'PHASE_COMPLETED', {
      offseasonPhaseId: phaseId,
      statusBefore: phase.status,
      statusAfter: 'COMPLETED',
      summaryText: `Phase ${phase.phaseType} completed`,
      reason,
    });
    // Advance current phase pointer to the next actionable phase.
    const updated = await tx.offseasonRun.findUniqueOrThrow({ where: { id: runId }, include: { phases: true } });
    const next = selectCurrentPhase(runRowToState(updated));
    await tx.offseasonRun.update({ where: { id: runId }, data: { currentPhaseType: next?.phaseType ?? null } });
    return mapRunDetail(await tx.offseasonRun.findUniqueOrThrow({ where: { id: runId }, include: FULL_RUN_INCLUDE }));
  });
}

export async function skipPhase(runId: string, phaseId: string, expectedUpdatedAt: string | undefined, reason: string) {
  assertCommissionerWrites();
  return prisma.$transaction(async (tx) => {
    const { run, phase, config, state } = await loadPhaseForMutation(tx, runId, phaseId, expectedUpdatedAt);
    if (run.status !== 'IN_PROGRESS') {
      throw new OffseasonHttpError(409, 'OffseasonRunNotEditable', 'Run must be IN_PROGRESS to skip a phase');
    }
    if (phase.status === 'COMPLETED') throw new OffseasonHttpError(409, 'OffseasonPhaseCompleted', 'Phase already completed');
    if (phase.status === 'SKIPPED') return mapRunDetail(await tx.offseasonRun.findUniqueOrThrow({ where: { id: runId }, include: FULL_RUN_INCLUDE }));
    const def = config.phases.find((p) => p.type === phase.phaseType);
    if (!def || def.required || !def.allowSkip) {
      throw new OffseasonHttpError(409, 'OffseasonPhaseCannotSkip', `Phase ${phase.phaseType} is required and cannot be skipped`);
    }
    assertPhaseTransition({ phaseType: phase.phaseType as OffseasonPhaseType, to: 'SKIPPED', config, phases: state.phases });
    await tx.offseasonPhase.update({
      where: { id: phaseId },
      data: { status: 'SKIPPED', skippedAt: new Date() },
    });
    await appendEvent(tx, runId, 'PHASE_SKIPPED', {
      offseasonPhaseId: phaseId,
      statusBefore: phase.status,
      statusAfter: 'SKIPPED',
      summaryText: `Phase ${phase.phaseType} skipped`,
      reason,
    });
    const updated = await tx.offseasonRun.findUniqueOrThrow({ where: { id: runId }, include: { phases: true } });
    const next = selectCurrentPhase(runRowToState(updated));
    await tx.offseasonRun.update({ where: { id: runId }, data: { currentPhaseType: next?.phaseType ?? null } });
    return mapRunDetail(await tx.offseasonRun.findUniqueOrThrow({ where: { id: runId }, include: FULL_RUN_INCLUDE }));
  });
}

/** Retry a FAILED phase: FAILED → READY (then the user starts it again). */
export async function retryPhase(runId: string, phaseId: string, expectedUpdatedAt: string | undefined, reason: string) {
  assertCommissionerWrites();
  return prisma.$transaction(async (tx) => {
    const { run, phase } = await loadPhaseForMutation(tx, runId, phaseId, expectedUpdatedAt);
    if (run.status !== 'IN_PROGRESS') {
      throw new OffseasonHttpError(409, 'OffseasonRunNotEditable', 'Run must be IN_PROGRESS to retry a phase');
    }
    if (phase.status !== 'FAILED') throw new OffseasonHttpError(409, 'OffseasonPhaseNotReady', 'Only a FAILED phase can be retried');
    await tx.offseasonPhase.update({ where: { id: phaseId }, data: { status: 'PENDING', failedAt: null } });
    await appendEvent(tx, runId, 'RUN_RESUMED', {
      offseasonPhaseId: phaseId,
      statusBefore: phase.status,
      statusAfter: 'PENDING',
      summaryText: `Phase ${phase.phaseType} reset for retry`,
      reason,
    });
    return mapRunDetail(await tx.offseasonRun.findUniqueOrThrow({ where: { id: runId }, include: FULL_RUN_INCLUDE }));
  });
}

/**
 * Explicitly link a domain run/event id to a phase. Idempotent: re-linking the
 * same id is a no-op (no duplicate event row).
 */
export async function linkPhaseOperation(
  runId: string,
  phaseId: string,
  expectedUpdatedAt: string | undefined,
  link: { operationType: 'CONTRACT_EXPIRATION' | 'PLAYER_DEVELOPMENT' | 'YOUTH_GENERATION' | 'DRAFT' | 'COMPETITION_ARCHIVE'; operationId: string },
) {
  assertCommissionerWrites();
  return prisma.$transaction(async (tx) => {
    const { run, phase } = await loadPhaseForMutation(tx, runId, phaseId, expectedUpdatedAt);
    const map: Record<typeof link.operationType, string> = {
      CONTRACT_EXPIRATION: 'contractExpirationRunId',
      PLAYER_DEVELOPMENT: 'playerDevelopmentRunId',
      YOUTH_GENERATION: 'youthGenerationRunId',
      DRAFT: 'draftEventId',
      COMPETITION_ARCHIVE: 'competitionArchiveIds',
    };
    const column = map[link.operationType];
    if (!column) throw new OffseasonHttpError(400, 'InvalidOffseasonRequest', `Cannot link ${link.operationType} to phase ${phase.phaseType}`);
    // Idempotency: no event row if the column already holds this id.
    if (column === 'competitionArchiveIds') {
      const current = phase.competitionArchiveIds ? JSON.parse(phase.competitionArchiveIds) as string[] : [];
      if (current.includes(link.operationId)) {
        return mapRunDetail(await tx.offseasonRun.findUniqueOrThrow({ where: { id: runId }, include: FULL_RUN_INCLUDE }));
      }
      const nextList = [...new Set([...current, link.operationId])];
      await tx.offseasonPhase.update({ where: { id: phaseId }, data: { competitionArchiveIds: JSON.stringify(nextList) } });
    } else {
      const current = (phase as unknown as Record<string, string | null>)[column];
      if (current === link.operationId) {
        return mapRunDetail(await tx.offseasonRun.findUniqueOrThrow({ where: { id: runId }, include: FULL_RUN_INCLUDE }));
      }
      await tx.offseasonPhase.update({ where: { id: phaseId }, data: { [column]: link.operationId } } as never);
    }
    await appendEvent(tx, runId, 'DOMAIN_OPERATION_LINKED', {
      offseasonPhaseId: phaseId,
      linkedEntityType: link.operationType,
      linkedEntityId: link.operationId,
      summaryText: `Linked ${link.operationType} ${link.operationId} to phase ${phase.phaseType}`,
      reason: 'Manual link',
    });
    return mapRunDetail(await tx.offseasonRun.findUniqueOrThrow({ where: { id: runId }, include: FULL_RUN_INCLUDE }));
  });
}

// ---------------------------------------------------------------------------
// Completion
// ---------------------------------------------------------------------------

export async function completeOffseasonRun(runId: string, expectedUpdatedAt: string | undefined, reason: string) {
  assertCommissionerWrites();
  const run = await prisma.offseasonRun.findUnique({ where: { id: runId }, include: FULL_RUN_INCLUDE });
  if (!run) throw new OffseasonHttpError(404, 'OffseasonRunNotFound', 'Offseason run not found');
  assertExpectedUpdatedAt(run.updatedAt, expectedUpdatedAt);
  if (run.status === 'COMPLETED') {
    // Idempotent re-complete.
    return mapRunDetail(run);
  }
  if (run.status === 'CANCELLED' || run.status === 'FAILED') {
    throw new OffseasonHttpError(409, 'OffseasonRunNotEditable', `Run is terminal (current: ${run.status})`);
  }
  const config = (await loadConfigVersion(run.configVersionId)).config;
  // Recompute readiness and reconcile before completion.
  await refreshAllPhaseLinks(runId);
  const fresh = await prisma.offseasonRun.findUniqueOrThrow({ where: { id: runId }, include: FULL_RUN_INCLUDE });
  const state = runRowToState(fresh);
  const runRecon = reconcileOffseasonRun(config, state);
  if (!runRecon.valid) {
    throw new OffseasonHttpError(422, 'OffseasonCompletionReconciliationFailed', `Reconciliation failed: ${runRecon.issues.map((i) => i.message).join('; ')}`);
  }
  const summary = summarizeRunPhases(state, config);
  if (!summary.allRequiredComplete) {
    throw new OffseasonHttpError(422, 'OffseasonNotReady', 'Cannot complete: required phases remain incomplete');
  }
  if (!summary.allOptionalResolved) {
    throw new OffseasonHttpError(422, 'OffseasonNotReady', 'Cannot complete: optional phases must be completed or skipped');
  }
  if (summary.hasFailedPhase) {
    throw new OffseasonHttpError(422, 'OffseasonNotReady', `Cannot complete: phase(s) FAILED: ${summary.failedPhases.join(', ')}`);
  }
  // Aggregate FINAL_REVIEW completion from world-integrity inputs.
  const completionInput = await gatherCompletionInput(config, state, run.worldSeasonId);
  const { aggregateCompletion } = await import('@fhm/engine');
  const completion = aggregateCompletion(config, state, completionInput);
  if (!completion.ready) {
    throw new OffseasonHttpError(422, 'OffseasonNotReady', `Cannot complete: ${completion.blockers.length} blocker(s): ${completion.blockers.map((b) => b.message).join('; ')}`, { blockers: completion.blockers, warnings: completion.warnings });
  }
  // Compute the deterministic result hash from phase outcomes + completion.
  const resultHash = stableOffseasonHash({
    run: runId,
    season: run.worldSeasonId,
    phases: state.phases.map((p) => ({ type: p.phaseType, status: p.status, linked: p.linked })),
    completion: { blockers: completion.blockers, warnings: completion.warnings },
  });
  return prisma.$transaction(async (tx) => {
    const updated = await tx.offseasonRun.update({
      where: { id: runId },
      data: {
        status: 'COMPLETED',
        completedAt: new Date(),
        readinessHash: stableOffseasonHash({ run: runId, completion }),
        resultHash,
      },
    });
    await appendEvent(tx, runId, 'RUN_COMPLETED', {
      statusBefore: run.status,
      statusAfter: 'COMPLETED',
      summaryText: 'Offseason run completed (no next WorldSeason created — F31 will create it)',
      reason,
    });
    void updated;
    return mapRunDetail(await tx.offseasonRun.findUniqueOrThrow({ where: { id: runId }, include: FULL_RUN_INCLUDE }));
  });
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function assertExpectedUpdatedAt(actualUpdatedAt: Date, expectedUpdatedAt: string | undefined) {
  if (!expectedUpdatedAt) return;
  const expected = new Date(expectedUpdatedAt).getTime();
  const actual = actualUpdatedAt.getTime();
  if (!Number.isFinite(expected) || expected !== actual) {
    throw new OffseasonHttpError(409, 'OffseasonInputStale', 'Provided expectedUpdatedAt does not match the current row — refresh and retry', { actualUpdatedAt: actualUpdatedAt.toISOString() });
  }
}

async function loadPhaseForMutation(tx: Prisma.TransactionClient, runId: string, phaseId: string, expectedUpdatedAt: string | undefined) {
  const run = await tx.offseasonRun.findUnique({
    where: { id: runId },
    include: { phases: { orderBy: { phaseOrder: 'asc' } } },
  });
  if (!run) throw new OffseasonHttpError(404, 'OffseasonRunNotFound', 'Offseason run not found');
  // Optimistic concurrency on the run row.
  if (expectedUpdatedAt) {
    const expected = new Date(expectedUpdatedAt).getTime();
    if (!Number.isFinite(expected) || expected !== run.updatedAt.getTime()) {
      throw new OffseasonHttpError(409, 'OffseasonInputStale', 'Run row changed — refresh and retry', { actualUpdatedAt: run.updatedAt.toISOString() });
    }
  }
  const phase = run.phases.find((p) => p.id === phaseId);
  if (!phase) throw new OffseasonHttpError(404, 'OffseasonPhaseNotFound', 'Offseason phase not found');
  const snapshot = await loadConfigVersion(run.configVersionId);
  const config = snapshot.config;
  const state = runRowToState(run);
  return { run, phase, config, state };
}

function assertAutomatedUnderlyingComplete(phaseType: OffseasonPhaseType, phase: { contractExpirationRunId: string | null; playerDevelopmentRunId: string | null; youthGenerationRunId: string | null; draftEventId: string | null; competitionArchiveIds: string | null }) {
  switch (phaseType) {
    case 'CONTRACT_EXPIRATION':
      if (!phase.contractExpirationRunId) throw new OffseasonHttpError(422, 'OffseasonPhaseReconciliationFailed', 'ContractExpirationRun must be linked before completing this phase');
      break;
    case 'PLAYER_DEVELOPMENT':
      if (!phase.playerDevelopmentRunId) throw new OffseasonHttpError(422, 'OffseasonPhaseReconciliationFailed', 'PlayerDevelopmentRun must be linked before completing this phase');
      break;
    case 'YOUTH_GENERATION':
      if (!phase.youthGenerationRunId) throw new OffseasonHttpError(422, 'OffseasonPhaseReconciliationFailed', 'YouthGenerationRun must be linked before completing this phase');
      break;
    case 'DRAFT':
      // DRAFT is INTERACTIVE; the underlying DraftEvent is required.
      if (!phase.draftEventId) throw new OffseasonHttpError(422, 'OffseasonPhaseReconciliationFailed', 'DraftEvent must be linked before completing this phase');
      break;
    case 'COMPETITION_ARCHIVE': {
      const ids = phase.competitionArchiveIds ? JSON.parse(phase.competitionArchiveIds) as string[] : [];
      if (ids.length === 0) {
        // Archive phase may pass with zero archives when there are no completed editions.
        // The readiness check at completion time will catch any unarchived completed editions.
      }
      break;
    }
    default:
      break;
  }
}

function buildPhaseResultText(phase: { phaseType: string; status: string; contractExpirationRunId: string | null; playerDevelopmentRunId: string | null; youthGenerationRunId: string | null; draftEventId: string | null; competitionArchiveIds: string | null }): string {
  return JSON.stringify({
    phaseType: phase.phaseType,
    status: phase.status,
    links: extractLinks(phase),
  });
}

function extractLinks(phase: { contractExpirationRunId: string | null; playerDevelopmentRunId: string | null; youthGenerationRunId: string | null; draftEventId: string | null; competitionArchiveIds: string | null }) {
  return {
    competitionArchiveIds: phase.competitionArchiveIds ? JSON.parse(phase.competitionArchiveIds) : null,
    contractExpirationRunId: phase.contractExpirationRunId,
    playerDevelopmentRunId: phase.playerDevelopmentRunId,
    youthGenerationRunId: phase.youthGenerationRunId,
    draftEventId: phase.draftEventId,
  };
}

export { progressPercent, reconcileOffseasonRun, defaultOffseasonConfig, canonicalOffseasonConfig, hashOffseasonConfigDb, OFFSEASON_DEFAULT_PRESET_NAME };

// ---------------------------------------------------------------------------
// Public read helpers used by routes
// ---------------------------------------------------------------------------

export { createSqliteSafetyBackup };
