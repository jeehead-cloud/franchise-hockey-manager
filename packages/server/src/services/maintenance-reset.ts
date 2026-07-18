import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { Prisma } from '@prisma/client';
import {
  classifyResetReadiness,
  computeResetPreviewHash,
  assertResetTransition,
  type ResetMode,
} from '@fhm/engine';
import { prisma } from '../db/client.js';
import { maintenanceErrors } from './maintenance-errors.js';
import { getActiveMaintenanceSnapshot } from './maintenance-config.js';
import { appendMaintenanceEvent, auditMaintenanceTx } from './maintenance-history.js';
import { createDatabaseBackup } from './backup-creation.js';
import { ensureExportRoot } from './maintenance-paths.js';
import { isRestoreOrMaintenanceActive } from './maintenance-status-utils.js';
import type { CommissionerAuditSource } from '@prisma/client';

const RESET_JOURNAL_FILE = 'maintenance-reset-journal.json';

// Domain tables deleted by RESET_WORLD_TO_EMPTY, in foreign-key-safe order
// (dependents first). Migrations, AppMeta (managed separately), backup files,
// export files, maintenance-history rows, CommissionerAuditLog, and all
// *Preset/*PresetVersion/Active*Configuration tables (configuration, not world
// data) are preserved per the spec ("preserve or rebuild default
// configuration").
const WORLD_DOMAIN_TABLES = [
  // Scouting (depend on Player/Team)
  'TeamScoutingReport',
  'ScoutingObservation',
  'ScoutingAssignmentScout',
  'ScoutingAssignment',
  'TeamProspectWatchlistEntry',
  'TeamProspectKnowledge',
  'ScoutingDepartmentScout',
  'ScoutingDepartment',
  // Draft
  'DraftTeamBoardSnapshot',
  'PlayerDraftRight',
  'DraftLotteryDraw',
  'DraftPick',
  'DraftTeamEntry',
  'DraftEligiblePlayer',
  'DraftEvent',
  // Contracts / trades
  'ContractTransaction',
  'TradeTransaction',
  'CompletedTradeAsset',
  'CompletedTrade',
  'TradeProposalAsset',
  'TradeProposal',
  'ContractOffer',
  'ContractRecommendation',
  'PlayerContract',
  'ContractExpirationRun',
  'ContractInitializationRun',
  // National teams (depend on Player/Team/CompetitionEdition)
  'NationalTeamLineupSlot',
  'NationalTeamLineup',
  'NationalTeamRosterPlayer',
  'NationalTeamStaffAssignment',
  'NationalTeamTactics',
  'NationalTeamCandidate',
  'NationalTeamEdition',
  'NationalTeamProfile',
  // Match + competition play
  'PlayerGameStat',
  'TeamGameStat',
  'MatchEvent',
  'MatchResult',
  'PlayoffSeries',
  'TournamentMedalResult',
  'AggregatedMatchSummary',
  'AggregatedSeasonRun',
  'CompetitionStagePlayerStat',
  'CompetitionStageTeamStat',
  'CompetitionStageStanding',
  'StageParticipant',
  'CompetitionParticipant',
  // Archive children → archive root
  'ArchiveAward',
  'ArchiveSeriesGame',
  'ArchiveSeries',
  'ArchiveMatchSummary',
  'ArchivePlayerStat',
  'ArchiveTeamStat',
  'ArchiveStanding',
  'ArchiveStage',
  'ArchiveParticipant',
  'CompetitionArchive',
  // Matches + competition structure
  'Match',
  'CompetitionStage',
  'CompetitionEdition',
  'Competition',
  // Offseason / season-transition runs (config presets preserved)
  'SeasonTransitionEvent',
  'SeasonTransitionEntityRecord',
  'SeasonTransitionRun',
  'OffseasonPhaseEvent',
  'OffseasonPhase',
  'OffseasonRun',
  // Players/coaches/teams/leagues
  'LineupAssignment',
  'TeamLineup',
  'PlayerSeasonSnapshot',
  'PlayerDevelopmentResult',
  'PlayerDevelopmentRun',
  'YouthGeneratedPlayer',
  'YouthCohort',
  'YouthGenerationRun',
  'PlayerSecondaryPosition',
  'GoalieAttributes',
  'SkaterAttributes',
  'Coach',
  'Player',
  'Team',
  'League',
  // World season + youth profiles/pools
  'WorldSeason',
  'CountryYouthProfileVersion',
  'CountryNamePoolVersion',
  'CountryNamePool',
] as const;

// ---------------------------------------------------------------------------
// Preview
// ---------------------------------------------------------------------------

export interface ResetPreviewResult {
  mode: ResetMode;
  affectedCounts: Array<{ table: string; count: number }>;
  totalAffectedRows: number;
  currentDatabaseFingerprint: string;
  worldShortId: string;
  requiredConfirmationPhrase: string;
  ready: boolean;
  blockers: Array<{ code: string; message: string }>;
  warnings: Array<{ code: string; message: string }>;
  previewHash: string;
}

export async function previewReset(args: { mode: ResetMode }): Promise<ResetPreviewResult> {
  const snapshot = await getActiveMaintenanceSnapshot(prisma);
  const fingerprint = await currentDatabaseFingerprint();
  const worldShortId = await currentWorldShortId();
  const affectedCounts = args.mode === 'RESET_WORLD_TO_EMPTY'
    ? await gatherAffectedCounts()
    : [];
  const totalAffectedRows = affectedCounts.reduce((sum, r) => sum + r.count, 0);
  const appMeta = await prisma.appMeta.findUnique({ where: { id: 'default' } });
  const worldNotEmpty = totalAffectedRows > 0;
  const { blockers: rawBlockers, warnings } = classifyResetReadiness({
    mode: args.mode,
    appMetaInitialized: Boolean(appMeta?.worldInitialized),
    affectedCounts,
    runningWorldOperation: false, // recomputed below
    pendingRestore: await isRestoreOrMaintenanceActive(),
    emptyWorldTables: !worldNotEmpty,
  });
  const blockers = [
    ...rawBlockers.map((b) => ({ code: b.code, message: b.message })),
    ...(await isRestoreOrMaintenanceActive() ? [{ code: 'reset.pendingRestore', message: 'A pending restore conflicts with reset' }] : []),
  ];
  const previewInput = {
    mode: args.mode,
    appMetaInitialized: Boolean(appMeta?.worldInitialized),
    affectedCounts,
    currentDatabaseFingerprint: fingerprint,
    worldShortId,
    runningWorldOperation: false,
    pendingRestore: await isRestoreOrMaintenanceActive(),
  };
  const previewHash = computeResetPreviewHash(previewInput);
  return {
    mode: args.mode,
    affectedCounts,
    totalAffectedRows,
    currentDatabaseFingerprint: fingerprint,
    worldShortId,
    requiredConfirmationPhrase: `RESET WORLD ${worldShortId}`,
    ready: blockers.length === 0,
    blockers,
    warnings: warnings.map((w) => ({ code: w.code, message: w.message })),
    previewHash,
  };
}

// ---------------------------------------------------------------------------
// Prepare (freeze preview)
// ---------------------------------------------------------------------------

export interface ResetPrepareResult {
  runId: string;
  status: 'PREPARED';
  mode: ResetMode;
  previewHash: string;
  requiredConfirmationPhrase: string;
  backupIdThatWillBeCreated: string | null;
}

export async function prepareReset(args: {
  mode: ResetMode;
  reason: string;
  requestedBy?: string;
}): Promise<ResetPrepareResult> {
  const preview = await previewReset({ mode: args.mode });
  if (!preview.ready) {
    throw maintenanceErrors.resetNotReady('Reset has unresolved blockers', { blockers: preview.blockers });
  }
  const confirmationHash = createHash('sha256')
    .update(`${preview.requiredConfirmationPhrase}:${preview.previewHash}`)
    .digest('hex');
  const run = await prisma.initializationResetRun.create({
    data: {
      status: 'PREPARED',
      resetMode: args.mode,
      backupId: null,
      previewSnapshotText: JSON.stringify(preview),
      previewHash: preview.previewHash,
      confirmationHash,
      requestedBy: args.requestedBy ?? 'system',
      reason: args.reason,
    },
  });
  await appendMaintenanceEvent({
    entityType: 'INITIALIZATION_RESET',
    entityId: run.id,
    eventType: 'RESET_PREPARED',
    statusBefore: null,
    statusAfter: 'PREPARED',
    summary: `${args.mode} prepared`,
  });
  return {
    runId: run.id,
    status: 'PREPARED',
    mode: args.mode,
    previewHash: preview.previewHash,
    requiredConfirmationPhrase: preview.requiredConfirmationPhrase,
    backupIdThatWillBeCreated: null,
  };
}

// ---------------------------------------------------------------------------
// Execute
// ---------------------------------------------------------------------------

export interface ResetExecuteResult {
  runId: string;
  status: 'COMPLETED';
  mode: ResetMode;
  backupId: string;
  rowsDeleted: number;
}

export async function executeReset(args: {
  runId: string;
  typedConfirmation: string;
  expectedPreviewHash: string;
  currentDatabaseFingerprint: string;
  reason: string;
  source: CommissionerAuditSource;
  requestedBy?: string;
}): Promise<ResetExecuteResult> {
  const run = await prisma.initializationResetRun.findUnique({ where: { id: args.runId } });
  if (!run) throw maintenanceErrors.resetNotFound(args.runId);
  if (run.status === 'COMPLETED') throw maintenanceErrors.resetCompleted(args.runId);
  if (run.status !== 'PREPARED') throw maintenanceErrors.resetNotReady(`Reset run is ${run.status}, not PREPARED`);
  if (run.previewHash !== args.expectedPreviewHash) {
    throw maintenanceErrors.resetInputStale();
  }
  const preview = JSON.parse(run.previewSnapshotText) as ResetPreviewResult;
  // Typed confirmation phrase must match exactly.
  if (args.typedConfirmation !== preview.requiredConfirmationPhrase) {
    throw maintenanceErrors.resetNotReady(
      `Typed confirmation does not match '${preview.requiredConfirmationPhrase}'`,
    );
  }
  // Current fingerprint must match the preview.
  const liveFingerprint = await currentDatabaseFingerprint();
  if (args.currentDatabaseFingerprint !== preview.currentDatabaseFingerprint) {
    throw maintenanceErrors.resetInputStale();
  }
  if (liveFingerprint !== preview.currentDatabaseFingerprint) {
    throw maintenanceErrors.resetInputStale();
  }
  if (await isRestoreOrMaintenanceActive()) {
    throw maintenanceErrors.pendingRestoreExists();
  }

  // Mandatory F32 backup (protected). Block on failure.
  const backup = await createDatabaseBackup({
    backupType: 'MANUAL',
    reasonCode: 'OTHER',
    reasonText: `F33 initialization reset (${run.resetMode})`,
    sourceOperationType: 'INITIALIZATION_RESET',
    sourceOperationId: run.id,
    protected: true,
    requestedBy: args.requestedBy,
  }).catch((e) => {
    throw maintenanceErrors.backupFailed(e instanceof Error ? e.message : 'Backup creation failed');
  });

  assertResetTransition('PREPARED', 'RUNNING');
  await prisma.initializationResetRun.update({ where: { id: run.id }, data: { status: 'RUNNING', startedAt: new Date(), backupId: backup.backup.id } });
  try {
    let rowsDeleted = 0;
    if (run.resetMode === 'RESET_WORLD_TO_EMPTY') {
      rowsDeleted = await executeWorldReset(args.source, args.reason);
      // Clear worldInitialized only after the world is actually empty.
      await prisma.appMeta.update({
        where: { id: 'default' },
        data: { worldInitialized: false, worldDatasetId: null, worldInitializedAt: null, worldSchemaVersion: null, contractsInitializedAt: null },
      });
    } else {
      // RESET_SETUP_STATE_ONLY: world tables already empty (preview enforced
      // this). Just clear the AppMeta init flags so the next setup is a clean
      // first init, not a duplicate.
      await prisma.appMeta.update({
        where: { id: 'default' },
        data: { worldInitialized: false, worldDatasetId: null, worldInitializedAt: null, worldSchemaVersion: null, contractsInitializedAt: null },
      });
    }
    assertResetTransition('RUNNING', 'COMPLETED');
    await prisma.initializationResetRun.update({
      where: { id: run.id },
      data: { status: 'COMPLETED', completedAt: new Date() },
    });
    // Re-bootstrap defaults so maintenance + backup configs survive.
    const { bootstrapMaintenanceConfiguration } = await import('./maintenance-config.js');
    await bootstrapMaintenanceConfiguration(prisma);
    // Record to the external journal (in case the reset deletes the row —
    // though for our row-based delete we keep this row).
    await appendResetJournal({
      runId: run.id,
      mode: run.resetMode,
      backupId: backup.backup.id,
      fingerprintBefore: preview.currentDatabaseFingerprint,
      fingerprintAfter: await currentDatabaseFingerprint(),
      completedAt: new Date().toISOString(),
    });
    await appendMaintenanceEvent({
      entityType: 'INITIALIZATION_RESET',
      entityId: run.id,
      eventType: 'RESET_COMPLETED',
      statusBefore: 'RUNNING',
      statusAfter: 'COMPLETED',
      summary: `${run.resetMode} completed (${rowsDeleted} rows deleted)`,
    });
    await auditMaintenance(args.source === 'COMMISSIONER_UI' ? 'COMMISSIONER_UI' : 'COMMISSIONER_API', 'INITIALIZATION_RESET', run.id, 'RESET_COMPLETED', args.reason, { mode: run.resetMode }, { rowsDeleted }, args.source);
    return {
      runId: run.id,
      status: 'COMPLETED',
      mode: run.resetMode as ResetMode,
      backupId: backup.backup.id,
      rowsDeleted,
    };
  } catch (e) {
    await prisma.initializationResetRun.update({
      where: { id: run.id },
      data: { status: 'FAILED', failedAt: new Date() },
    });
    await appendMaintenanceEvent({
      entityType: 'INITIALIZATION_RESET',
      entityId: run.id,
      eventType: 'RESET_FAILED',
      statusBefore: 'RUNNING',
      statusAfter: 'FAILED',
      summary: e instanceof Error ? e.message.slice(0, 200) : String(e).slice(0, 200),
    });
    throw e instanceof Error ? e : new Error(String(e));
  }
}

async function auditMaintenance(
  _legacy: string,
  entityType: string,
  entityId: string,
  action: string,
  reason: string,
  before: unknown,
  after: unknown,
  source: CommissionerAuditSource,
) {
  // Use the tx-unaware audit. (The reset commit happens inside the table
  // deletes which themselves are not wrapped in a single tx because DELETE
  // across 60+ tables in one tx is heavy; the audit row is written after.)
  await import('./maintenance-history.js').then(({ auditMaintenance: am }) => am(entityType, entityId, action, reason, before, after, source));
}

/**
 * Delete every world-domain table in foreign-key-safe order. Preserves:
 * migrations (_prisma_migrations), AppMeta (re-cleared separately), backup
 * files (live in FHM_BACKUP_DIR, never touched), export files (live in
 * FHM_EXPORT_DIR, never touched), maintenance run rows, and CommissionerAuditLog.
 */
async function executeWorldReset(source: CommissionerAuditSource, reason: string): Promise<number> {
  let total = 0;
  await prisma.$transaction(async (tx) => {
    for (const table of WORLD_DOMAIN_TABLES) {
      const deleted = await deleteAllFrom(tx, table);
      total += deleted;
    }
    await auditMaintenanceTx(tx, 'INITIALIZATION_RESET', 'world', 'RESET_COMPLETED', reason, null, { totalRowsDeleted: total }, source);
  });
  return total;
}

async function deleteAllFrom(tx: Prisma.TransactionClient, table: string): Promise<number> {
  // Use $executeRawUnsafe for a bounded DELETE per table. Table names come
  // from a fixed allowlist (WORLD_DOMAIN_TABLES) — never user-supplied.
  if (!WORLD_DOMAIN_TABLES.includes(table as never)) {
    throw new Error(`Refusing to delete from unallowlisted table: ${table}`);
  }
  const result = await tx.$executeRawUnsafe(`DELETE FROM "${table}"`);
  return result;
}

export async function cancelReset(runId: string): Promise<void> {
  const run = await prisma.initializationResetRun.findUnique({ where: { id: runId } });
  if (!run) throw maintenanceErrors.resetNotFound(runId);
  if (run.status === 'COMPLETED' || run.status === 'FAILED') return;
  if (run.status === 'RUNNING') {
    throw maintenanceErrors.resetNotReady('Reset is already running; cannot cancel');
  }
  assertResetTransition('PREPARED', 'CANCELLED');
  await prisma.initializationResetRun.update({ where: { id: runId }, data: { status: 'CANCELLED' } });
  await appendMaintenanceEvent({
    entityType: 'INITIALIZATION_RESET',
    entityId: runId,
    eventType: 'RESET_CANCELLED',
    statusBefore: run.status,
    statusAfter: 'CANCELLED',
    summary: 'Reset cancelled',
  });
}

// ---------------------------------------------------------------------------
// Inventory / detail
// ---------------------------------------------------------------------------

export async function listResetRuns(opts: { status?: string; limit?: number; offset?: number } = {}) {
  const where: Prisma.InitializationResetRunWhereInput = {};
  if (opts.status) where.status = opts.status;
  const limit = Math.min(opts.limit ?? 100, 500);
  const offset = opts.offset ?? 0;
  const [items, total] = await Promise.all([
    prisma.initializationResetRun.findMany({ where, orderBy: { createdAt: 'desc' }, take: limit, skip: offset }),
    prisma.initializationResetRun.count({ where }),
  ]);
  return {
    items: items.map((r) => ({
      id: r.id,
      status: r.status,
      resetMode: r.resetMode,
      backupId: r.backupId,
      previewHashPrefix: r.previewHash.slice(0, 12),
      reason: r.reason,
      preparedAt: r.preparedAt,
      completedAt: r.completedAt,
      failedAt: r.failedAt,
      createdAt: r.createdAt,
    })),
    total,
    limit,
    offset,
  };
}

export async function getResetRunDetail(runId: string) {
  const r = await prisma.initializationResetRun.findUnique({ where: { id: runId } });
  if (!r) throw maintenanceErrors.resetNotFound(runId);
  return {
    id: r.id,
    status: r.status,
    resetMode: r.resetMode,
    backupId: r.backupId,
    previewHashPrefix: r.previewHash.slice(0, 12),
    confirmationHashPrefix: r.confirmationHash.slice(0, 12),
    reason: r.reason,
    preparedAt: r.preparedAt,
    completedAt: r.completedAt,
    failedAt: r.failedAt,
    createdAt: r.createdAt,
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function gatherAffectedCounts(): Promise<Array<{ table: string; count: number }>> {
  const out: Array<{ table: string; count: number }> = [];
  for (const table of WORLD_DOMAIN_TABLES) {
    try {
      const row = await prisma.$queryRawUnsafe(`SELECT COUNT(*) AS c FROM "${table}"`) as Array<{ c: number }>;
      out.push({ table, count: Number(row[0]?.c ?? 0) });
    } catch {
      // Table may not exist (e.g. older DBs) — skip.
    }
  }
  return out.filter((r) => r.count > 0);
}

async function currentDatabaseFingerprint(): Promise<string> {
  try {
    const { resolveActiveDatabasePath } = await import('./maintenance-paths.js');
    const { openReadOnlyDatabase } = await import('../sqlite-readonly.js');
    const { gatherFingerprintInput, computeFingerprintFromDatabase } = await import('./backup-fingerprint.js');
    const { dbPath } = resolveActiveDatabasePath();
    const db = openReadOnlyDatabase(dbPath);
    return computeFingerprintFromDatabase(db);
  } catch {
    return 'unknown';
  }
}

async function currentWorldShortId(): Promise<string> {
  const season = await prisma.worldSeason.findFirst({ where: { status: 'ACTIVE' } });
  if (season) return `WS-${season.startYear}`;
  return 'EMPTY';
}

interface ResetJournalEntry {
  runId: string;
  mode: string;
  backupId: string;
  fingerprintBefore: string;
  fingerprintAfter: string;
  completedAt: string;
}

async function appendResetJournal(entry: ResetJournalEntry): Promise<void> {
  const snapshot = await getActiveMaintenanceSnapshot(prisma);
  const root = ensureExportRoot(snapshot.config);
  const journalPath = path.resolve(root, RESET_JOURNAL_FILE);
  let entries: ResetJournalEntry[] = [];
  try {
    if (fs.existsSync(journalPath)) {
      entries = JSON.parse(fs.readFileSync(journalPath, 'utf-8')) as ResetJournalEntry[];
    }
  } catch {
    entries = [];
  }
  entries.push(entry);
  // Atomic write via tmp+rename.
  const tmp = `${journalPath}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(entries, null, 2));
  fs.renameSync(tmp, journalPath);
}
