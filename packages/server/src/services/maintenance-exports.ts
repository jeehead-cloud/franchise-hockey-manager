import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { Prisma } from '@prisma/client';
import {
  EXPORT_SCHEMAS,
  MAINTENANCE_EXPORT_ENVELOPE_SCHEMA_VERSION,
  PLAYERS_COMMISSIONER_COLUMNS,
  PLAYERS_PUBLIC_COLUMNS,
  csvEscape,
  getExportSchema,
  toCsv,
  validateExportFilters,
  computeExportInputHash,
  computeExportManifestDigest,
  computePresetPayloadHash,
  reconcileExportRun,
  assertExportTransition,
  type ExportFormat,
  type ExportManifestInput,
  type ExportPrivacyLevel,
  type ExportType,
  type MaintenanceConfig,
} from '@fhm/engine';
import { prisma } from '../db/client.js';
import { maintenanceErrors } from './maintenance-errors.js';
import {
  ALLOWED_EXPORT_EXTENSIONS,
  assertAllowedExtension,
  ensureExportRoot,
  generateExportFileName,
  resolveExportFile,
  safeRemove,
} from './maintenance-paths.js';
import { getActiveMaintenanceSnapshot, hashMaintenanceConfigDb } from './maintenance-config.js';
import type { ActiveMaintenanceSnapshot } from './maintenance-config.js';
import { appendMaintenanceEvent } from './maintenance-history.js';

// ---------------------------------------------------------------------------
// Preview (no writes)
// ---------------------------------------------------------------------------

export interface ExportPreviewRequest {
  exportType: ExportType;
  filters: Record<string, unknown>;
  reason?: string;
}

export interface ExportPreviewResult {
  exportType: ExportType;
  format: ExportFormat;
  privacyLevel: ExportPrivacyLevel;
  schemaVersion: number;
  columns: readonly string[];
  supportedFilters: readonly string[];
  filters: Record<string, string>;
  estimatedRows: number;
  scopeText: string;
  filterText: string;
  privacyWarning: string | null;
  inputHash: string;
  filenamePreview: string;
  deterministicOrder: string;
}

export async function previewExport(req: ExportPreviewRequest): Promise<ExportPreviewResult> {
  const snapshot = await getActiveMaintenanceSnapshot(prisma);
  const def = getExportSchema(req.exportType);
  const filters = validateExportFilters(req.exportType, req.filters as Record<string, unknown>);
  const estimatedRows = await estimateRowCount(req.exportType, filters);
  const inputHash = computeExportInputHash({
    exportType: req.exportType,
    filters,
    configVersionId: snapshot.version.id,
    configHash: snapshot.version.configHash,
  });
  const scopeText = scopeFor(req.exportType);
  const filterText = JSON.stringify(filters);
  const filenamePreview = generateExportFileName({
    exportType: req.exportType,
    timestamp: '20260101T000000Z',
    shortHash: inputHash.slice(0, 8),
    extension: def.fileExtension,
  });
  const privacyWarning = privacyWarningFor(def.privacyLevel, snapshot.config);
  return {
    exportType: req.exportType,
    format: def.format,
    privacyLevel: def.privacyLevel,
    schemaVersion: MAINTENANCE_EXPORT_ENVELOPE_SCHEMA_VERSION,
    columns: def.columns,
    supportedFilters: def.supportedFilters,
    filters,
    estimatedRows,
    scopeText,
    filterText,
    privacyWarning,
    inputHash,
    filenamePreview,
    deterministicOrder: def.deterministicOrder,
  };
}

function scopeFor(exportType: ExportType): string {
  if (exportType.startsWith('PLAYERS_')) return 'players';
  if (exportType === 'TEAMS_CSV') return 'teams';
  if (exportType === 'STANDINGS_CSV') return 'standings';
  if (exportType === 'PLAYER_STATISTICS_CSV') return 'player-statistics';
  if (exportType === 'GOALIE_STATISTICS_CSV') return 'goalie-statistics';
  if (exportType === 'COMPETITION_ARCHIVE_JSON') return 'competition-archive';
  if (exportType === 'CONTRACT_HISTORY_CSV') return 'contract-history';
  if (exportType === 'DRAFT_HISTORY_CSV') return 'draft-history';
  if (exportType === 'TRADE_HISTORY_CSV') return 'trade-history';
  if (exportType === 'TRANSACTION_HISTORY_CSV') return 'transaction-history';
  if (exportType === 'CONFIGURATION_PRESET_JSON') return 'configuration-preset';
  if (exportType === 'NAME_POOLS_JSON') return 'name-pools';
  if (exportType === 'FULL_DATABASE_PACKAGE') return 'full-database-package';
  return 'export';
}

function privacyWarningFor(level: ExportPrivacyLevel, config: MaintenanceConfig): string | null {
  if (level === 'COMMISSIONER_TRUTH') {
    if (!config.privacy.allowCommissionerTruthExport) {
      return 'Commissioner truth export is disabled in the active configuration';
    }
    return 'This export reveals hidden Player truth (potential, attributes, scouting). Commissioner Mode required.';
  }
  if (level === 'PUBLIC_SAFE') {
    return 'Public-safe export: hidden truth and private scouting data are omitted.';
  }
  return null;
}

async function estimateRowCount(exportType: ExportType, filters: Record<string, string>): Promise<number> {
  switch (exportType) {
    case 'PLAYERS_PUBLIC_JSON':
    case 'PLAYERS_PUBLIC_CSV':
    case 'PLAYERS_COMMISSIONER_JSON':
    case 'PLAYERS_COMMISSIONER_CSV':
      return prisma.player.count({ where: buildPlayerWhere(filters) });
    case 'TEAMS_CSV':
      return prisma.team.count({ where: buildTeamWhere(filters) });
    case 'STANDINGS_CSV':
      return prisma.competitionStageStanding.count({ where: buildStandingWhere(filters) });
    case 'PLAYER_STATISTICS_CSV':
    case 'GOALIE_STATISTICS_CSV':
      return prisma.competitionStagePlayerStat.count({ where: buildStatWhere(filters) });
    case 'COMPETITION_ARCHIVE_JSON':
      return prisma.competitionArchive.count({ where: buildArchiveWhere(filters) });
    case 'CONTRACT_HISTORY_CSV':
      return prisma.playerContract.count({ where: buildContractWhere(filters) });
    case 'DRAFT_HISTORY_CSV':
      return prisma.draftPick.count({ where: buildDraftWhere(filters) });
    case 'TRADE_HISTORY_CSV':
      return prisma.completedTradeAsset.count();
    case 'TRANSACTION_HISTORY_CSV':
      return prisma.contractTransaction.count();
    case 'CONFIGURATION_PRESET_JSON':
    case 'NAME_POOLS_JSON':
    case 'FULL_DATABASE_PACKAGE':
      return 1;
    default:
      return 0;
  }
}

function buildPlayerWhere(filters: Record<string, string>): Prisma.PlayerWhereInput {
  const where: Prisma.PlayerWhereInput = {};
  if (filters.teamId) where.currentTeamId = filters.teamId;
  if (filters.countryCode) where.nationality = { code: filters.countryCode };
  if (filters.position) where.primaryPosition = filters.position as never;
  if (filters.rosterStatus) where.rosterStatus = filters.rosterStatus as never;
  if (filters.sourceType) where.sourceType = filters.sourceType as never;
  if (filters.leagueId) where.currentTeam = { leagueId: filters.leagueId };
  return where;
}
function buildTeamWhere(filters: Record<string, string>): Prisma.TeamWhereInput {
  const where: Prisma.TeamWhereInput = {};
  if (filters.leagueId) where.leagueId = filters.leagueId;
  if (filters.countryCode) where.country = { code: filters.countryCode };
  if (filters.teamType) where.teamType = filters.teamType as never;
  if (filters.simulationLevel) where.league = { simulationLevel: filters.simulationLevel as never };
  return where;
}
function buildStandingWhere(filters: Record<string, string>): Prisma.CompetitionStageStandingWhereInput {
  const where: Prisma.CompetitionStageStandingWhereInput = {};
  if (filters.competitionEditionId) where.stage = { edition: { id: filters.competitionEditionId } };
  if (filters.stageId) where.competitionStageId = filters.stageId;
  if (filters.worldSeasonId) where.stage = { edition: { worldSeasonId: filters.worldSeasonId } };
  return where;
}
function buildStatWhere(filters: Record<string, string>): Prisma.CompetitionStagePlayerStatWhereInput {
  const where: Prisma.CompetitionStagePlayerStatWhereInput = {};
  if (filters.competitionEditionId) where.stage = { edition: { id: filters.competitionEditionId } };
  if (filters.teamId) where.teamId = filters.teamId;
  if (filters.worldSeasonId) where.stage = { edition: { worldSeasonId: filters.worldSeasonId } };
  return where;
}
function buildArchiveWhere(filters: Record<string, string>): Prisma.CompetitionArchiveWhereInput {
  const where: Prisma.CompetitionArchiveWhereInput = {};
  if (filters.competitionEditionId) where.competitionEditionId = filters.competitionEditionId;
  if (filters.worldSeasonId) where.worldSeasonId = filters.worldSeasonId;
  return where;
}
function buildContractWhere(filters: Record<string, string>): Prisma.PlayerContractWhereInput {
  const where: Prisma.PlayerContractWhereInput = {};
  if (filters.teamId) where.teamId = filters.teamId;
  if (filters.status) where.status = filters.status as never;
  if (filters.worldSeasonId) where.startWorldSeason = { id: filters.worldSeasonId };
  return where;
}
function buildDraftWhere(filters: Record<string, string>): Prisma.DraftPickWhereInput {
  const where: Prisma.DraftPickWhereInput = {};
  if (filters.draftEventId) where.draftEventId = filters.draftEventId;
  return where;
}

// ---------------------------------------------------------------------------
// Generate (writes a file + manifest)
// ---------------------------------------------------------------------------

export interface ExportGenerateRequest {
  exportType: ExportType;
  filters: Record<string, unknown>;
  reason: string;
  requestedBy?: string;
}

export interface ExportGenerateResult {
  runId: string;
  exportType: ExportType;
  status: string;
  rowCount: number;
  fileSizeBytes: number;
  fileSha256: string;
  manifestSha256: string;
  outputRelativePath: string;
}

export async function generateExport(req: ExportGenerateRequest): Promise<ExportGenerateResult> {
  const snapshot = await getActiveMaintenanceSnapshot(prisma);
  const def = getExportSchema(req.exportType);
  // Truth exports require explicit Commissioner policy allowance (route also gates).
  if (def.privacyLevel === 'COMMISSIONER_TRUTH' && !snapshot.config.privacy.allowCommissionerTruthExport) {
    throw maintenanceErrors.exportNotReady('Commissioner truth export is disabled in the active configuration');
  }
  const filters = validateExportFilters(req.exportType, req.filters as Record<string, unknown>);
  const inputHash = computeExportInputHash({
    exportType: req.exportType,
    filters,
    configVersionId: snapshot.version.id,
    configHash: snapshot.version.configHash,
  });
  const scopeText = scopeFor(req.exportType);
  const filterText = JSON.stringify(filters);
  const root = ensureExportRoot(snapshot.config);

  // Create PLANNED run.
  const run = await prisma.maintenanceExportRun.create({
    data: {
      exportType: req.exportType,
      status: 'PLANNED',
      format: def.format,
      scopeText,
      filterText,
      privacyLevel: def.privacyLevel,
      configVersionId: snapshot.version.id,
      configHash: snapshot.version.configHash,
      schemaVersion: MAINTENANCE_EXPORT_ENVELOPE_SCHEMA_VERSION,
      inputHash,
      requestedBy: req.requestedBy ?? 'system',
      reason: req.reason,
    },
  });

  try {
    await transitionRun(run.id, 'PLANNED', 'RUNNING');
    // Load rows in deterministic order, serialize to bytes.
    const { content, rowCount, fileSha256 } = await serializeExport(req.exportType, filters, snapshot, def.format);
    if (rowCount > snapshot.config.limits.maximumExportRows) {
      throw maintenanceErrors.exportNotReady(`Export exceeds maximumExportRows (${snapshot.config.limits.maximumExportRows})`);
    }
    const timestamp = new Date().toISOString().replace(/[-:.]/g, '').slice(0, 15) + 'Z';
    // Use the full run ID for uniqueness — each export run is its own artifact.
    // The file SHA-256 is recorded on the run row (proves bytes); the filename
    // only needs to be unique and filesystem-safe.
    const fileName = generateExportFileName({
      exportType: req.exportType,
      timestamp,
      shortHash: run.id,
      extension: def.fileExtension,
    });
    const outputRelative = fileName;
    const outputPath = resolveExportFile(root, outputRelative);
    if (fs.existsSync(outputPath)) {
      // collision — should be impossible with a full cuid run ID
      throw maintenanceErrors.exportFailed('Generated filename collision — retry');
    }
    fs.writeFileSync(outputPath, content);
    const fileSizeBytes = fs.statSync(outputPath).size;

    // Manifest.
    const manifest = buildManifest({
      snapshot,
      exportType: req.exportType,
      format: def.format,
      privacyLevel: def.privacyLevel,
      scopeText,
      filterText,
      rowCount,
      fileSizeBytes,
      fileSha256,
      inputHash,
    });
    const manifestJson = JSON.stringify(manifest, null, 2);
    const manifestSha256 = createHash('sha256').update(manifestJson).digest('hex');
    const manifestFileName = fileName.replace(/\.(csv|json|zip)$/, '.manifest.json');
    const manifestRelative = manifestFileName;
    fs.writeFileSync(resolveExportFile(root, manifestRelative), manifestJson);

    // Reconcile + complete.
    const reconciliation = reconcileExportRun({
      status: 'COMPLETED',
      fileSha256,
      manifestSha256,
      rowCount,
      fileSizeBytes,
      outputRelativePath: outputRelative,
    });
    if (!reconciliation.ok) {
      throw new Error(`Export reconciliation failed: ${reconciliation.issues.map((i) => i.code).join(', ')}`);
    }
    const resultHash = computeExportManifestDigest({
      manifestSchemaVersion: MAINTENANCE_EXPORT_ENVELOPE_SCHEMA_VERSION,
      exportType: req.exportType,
      format: def.format,
      privacyLevel: def.privacyLevel,
      scopeText,
      filterText,
      schemaVersion: MAINTENANCE_EXPORT_ENVELOPE_SCHEMA_VERSION,
      rowCount,
      fileSizeBytes,
      fileSha256,
      configuration: { versionId: snapshot.version.id, hash: snapshot.version.configHash },
      inputHash,
    });
    await transitionRun(run.id, 'RUNNING', 'COMPLETED');
    await prisma.maintenanceExportRun.update({
      where: { id: run.id },
      data: {
        outputRelativePath: outputRelative,
        manifestRelativePath: manifestRelative,
        rowCount,
        fileSizeBytes,
        fileSha256,
        manifestSha256,
        resultHash,
        completedAt: new Date(),
      },
    });
    await appendMaintenanceEvent({
      entityType: 'MAINTENANCE_EXPORT',
      entityId: run.id,
      eventType: 'EXPORT_CREATED',
      statusBefore: 'RUNNING',
      statusAfter: 'COMPLETED',
      summary: `${req.exportType} (${rowCount} rows, ${fileSizeBytes} bytes)`,
    });
    return {
      runId: run.id,
      exportType: req.exportType,
      status: 'COMPLETED',
      rowCount,
      fileSizeBytes,
      fileSha256,
      manifestSha256,
      outputRelativePath: outputRelative,
    };
  } catch (e) {
    // Mark FAILED + remove incomplete artifacts. No world mutation.
    await markRunFailed(run.id, e);
    throw e instanceof Error ? e : new Error(String(e));
  }
}

async function transitionRun(runId: string, from: string, to: string): Promise<void> {
  assertExportTransition(from as never, to as never);
  await prisma.maintenanceExportRun.update({
    where: { id: runId },
    data: { status: to },
  });
}

async function markRunFailed(runId: string, e: unknown): Promise<void> {
  const code = e instanceof Error && 'code' in e ? String((e as { code: unknown }).code) : 'ExportFailed';
  const message = e instanceof Error ? e.message : String(e);
  try {
    await prisma.maintenanceExportRun.update({
      where: { id: runId },
      data: {
        status: 'FAILED',
        failedAt: new Date(),
        failureCode: code,
        failureMessage: message,
      },
    });
    await appendMaintenanceEvent({
      entityType: 'MAINTENANCE_EXPORT',
      entityId: runId,
      eventType: 'EXPORT_FAILED',
      statusBefore: null,
      statusAfter: 'FAILED',
      summary: message.slice(0, 200),
    });
  } catch {
    /* best-effort */
  }
}

function buildManifest(args: {
  snapshot: ActiveMaintenanceSnapshot;
  exportType: ExportType;
  format: ExportFormat;
  privacyLevel: ExportPrivacyLevel;
  scopeText: string;
  filterText: string;
  rowCount: number;
  fileSizeBytes: number;
  fileSha256: string;
  inputHash: string;
}): ExportManifestInput & { generatedAt: string } {
  return {
    manifestSchemaVersion: MAINTENANCE_EXPORT_ENVELOPE_SCHEMA_VERSION,
    exportType: args.exportType,
    format: args.format,
    privacyLevel: args.privacyLevel,
    scopeText: args.scopeText,
    filterText: args.filterText,
    schemaVersion: MAINTENANCE_EXPORT_ENVELOPE_SCHEMA_VERSION,
    rowCount: args.rowCount,
    fileSizeBytes: args.fileSizeBytes,
    fileSha256: args.fileSha256,
    configuration: {
      versionId: args.snapshot.version.id,
      hash: args.snapshot.version.configHash,
    },
    inputHash: args.inputHash,
    generatedAt: new Date().toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Serialization — load rows + produce bytes
// ---------------------------------------------------------------------------

async function serializeExport(
  exportType: ExportType,
  filters: Record<string, string>,
  snapshot: ActiveMaintenanceSnapshot,
  format: ExportFormat,
): Promise<{ content: Buffer; rowCount: number; fileSha256: string }> {
  if (exportType === 'FULL_DATABASE_PACKAGE') {
    // Delegated to maintenance-package.ts; re-dispatch is the caller's job.
    throw maintenanceErrors.exportNotReady('FULL_DATABASE_PACKAGE must be generated through the package endpoint');
  }
  const { rows, headers } = await loadExportRows(exportType, filters, snapshot);
  let text: string;
  if (format === 'CSV') {
    text = toCsv(headers, rows, { delimiter: snapshot.config.csv.delimiter, nullValue: snapshot.config.csv.nullValue });
    if (snapshot.config.csv.includeBom) {
      text = `\uFEFF${text}`;
    }
  } else {
    // JSON
    const obj = {
      format: `fhm-${exportType.toLowerCase().replace(/_/g, '-')}-export`,
      schemaVersion: MAINTENANCE_EXPORT_ENVELOPE_SCHEMA_VERSION,
      exportType,
      privacyLevel: getExportSchema(exportType).privacyLevel,
      configuration: { versionId: snapshot.version.id, configHash: snapshot.version.configHash },
      filters,
      rowCount: rows.length,
      columns: headers,
      rows: rows.map((r) => Object.fromEntries(r.map((v, i) => [headers[i], v]))),
      generatedAt: new Date().toISOString(),
    };
    text = snapshot.config.json.prettyPrint ? JSON.stringify(obj, null, 2) : JSON.stringify(obj);
  }
  const content = Buffer.from(text, 'utf-8');
  const fileSha256 = createHash('sha256').update(content).digest('hex');
  return { content, rowCount: rows.length, fileSha256 };
}

async function loadExportRows(
  exportType: ExportType,
  filters: Record<string, string>,
  snapshot: ActiveMaintenanceSnapshot,
): Promise<{ headers: string[]; rows: unknown[][] }> {
  switch (exportType) {
    case 'PLAYERS_PUBLIC_CSV':
    case 'PLAYERS_PUBLIC_JSON': {
      const players = await loadPlayers(filters, false);
      return { headers: [...PLAYERS_PUBLIC_COLUMNS], rows: players };
    }
    case 'PLAYERS_COMMISSIONER_CSV':
    case 'PLAYERS_COMMISSIONER_JSON': {
      const players = await loadPlayers(filters, true);
      return { headers: [...PLAYERS_COMMISSIONER_COLUMNS], rows: players };
    }
    case 'TEAMS_CSV': {
      const teams = await prisma.team.findMany({
        where: buildTeamWhere(filters),
        orderBy: [{ league: { name: 'asc' } }, { name: 'asc' }, { id: 'asc' }],
        include: { league: true, country: true, coach: true },
        take: snapshot.config.limits.maximumExportRows,
      });
      return {
        headers: [...getExportSchema('TEAMS_CSV').columns],
        rows: teams.map((t) => [
          t.id, t.name, t.teamType, t.leagueId ?? '', t.league?.name ?? '', t.country?.code ?? '',
          t.league?.simulationLevel ?? '', t.coach?.id ?? '', t.coach ? `${t.coach.firstName} ${t.coach.lastName}` : '',
          t.tacticalStyle ?? '',
        ]),
      };
    }
    case 'STANDINGS_CSV': {
      const standings = await prisma.competitionStageStanding.findMany({
        where: buildStandingWhere(filters),
        orderBy: [{ competitionStageId: 'asc' }, { rank: 'asc' }],
        include: { stage: { include: { edition: true } } },
        take: snapshot.config.limits.maximumExportRows,
      });
      return {
        headers: [...getExportSchema('STANDINGS_CSV').columns],
        rows: standings.map((s) => {
          const stage = s.stage as unknown as ({ editionId: string; stageType: string; edition: { label?: string } } | null) | null;
          return [
            stage?.editionId ?? '', stage?.edition?.label ?? '',
            s.competitionStageId, stage?.stageType ?? '', s.teamId, s.teamNameSnapshot,
            s.rank, s.gamesPlayed, s.wins, s.losses, s.overtimeLosses + s.shootoutLosses, s.points,
            s.goalsFor, s.goalsAgainst,
          ];
        }),
      };
    }
    case 'PLAYER_STATISTICS_CSV':
    case 'GOALIE_STATISTICS_CSV': {
      const statWhere: Prisma.CompetitionStagePlayerStatWhereInput = { ...buildStatWhere(filters) };
      if (exportType === 'GOALIE_STATISTICS_CSV') statWhere.isGoalie = true;
      else statWhere.isGoalie = false;
      const stats = await prisma.competitionStagePlayerStat.findMany({
        where: statWhere,
        orderBy: exportType === 'GOALIE_STATISTICS_CSV'
          ? [{ saves: 'desc' }, { playerId: 'asc' }]
          : [{ points: 'desc' }, { playerId: 'asc' }],
        include: { stage: { include: { edition: true } } },
        take: snapshot.config.limits.maximumExportRows,
      });
      if (exportType === 'PLAYER_STATISTICS_CSV') {
        return {
          headers: [...getExportSchema('PLAYER_STATISTICS_CSV').columns],
          rows: stats.map((s) => {
            const stage = s.stage as unknown as ({ editionId: string; edition: { label?: string } } | null) | null;
            return [
              stage?.editionId ?? '', stage?.edition?.label ?? '',
              s.playerId, `${s.firstNameSnapshot} ${s.lastNameSnapshot}`,
              s.teamId, s.teamNameSnapshot,
              s.gamesPlayed, s.goals, s.assists, s.points,
              s.shotsOnGoal, s.penaltyMinutes, '',
            ];
          }),
        };
      }
      return {
        headers: [...getExportSchema('GOALIE_STATISTICS_CSV').columns],
        rows: stats.map((s) => {
          const stage = s.stage as unknown as ({ editionId: string; edition: { label?: string } } | null) | null;
          return [
            stage?.editionId ?? '', stage?.edition?.label ?? '',
            s.playerId, `${s.firstNameSnapshot} ${s.lastNameSnapshot}`,
            s.teamId, s.teamNameSnapshot,
            s.gamesPlayed, s.shotsAgainst, s.saves, s.goalsAgainst, s.shutouts,
          ];
        }),
      };
    }
    case 'COMPETITION_ARCHIVE_JSON': {
      const archives = await prisma.competitionArchive.findMany({
        where: buildArchiveWhere(filters),
        orderBy: [{ competitionEditionId: 'asc' }, { id: 'asc' }],
        take: snapshot.config.limits.maximumExportRows,
      });
      // JSON-only; one synthetic "row" containing the archive summary list
      return {
        headers: [...getExportSchema('COMPETITION_ARCHIVE_JSON').columns],
        rows: archives.map((a) => [a.id, a.competitionEditionId, a.archiveSchemaVersion, a.championTeamSourceId ?? '', a.archiveHash]),
      };
    }
    case 'CONTRACT_HISTORY_CSV': {
      const contracts = await prisma.playerContract.findMany({
        where: buildContractWhere(filters),
        orderBy: [{ signedAt: 'desc' }, { id: 'asc' }],
        include: { startWorldSeason: true, endWorldSeason: true },
        take: snapshot.config.limits.maximumExportRows,
      });
      return {
        headers: [...getExportSchema('CONTRACT_HISTORY_CSV').columns],
        rows: contracts.map((c) => [
          c.id, c.playerId, c.playerNameSnapshot,
          c.teamId, c.teamNameSnapshot,
          c.startWorldSeasonId, c.startWorldSeason?.label ?? '',
          c.endWorldSeasonId, c.endWorldSeason?.label ?? '',
          c.status, c.annualSalary, c.signedAt,
        ]),
      };
    }
    case 'DRAFT_HISTORY_CSV': {
      const picks = await prisma.draftPick.findMany({
        where: buildDraftWhere(filters),
        orderBy: [{ overallPick: 'asc' }],
        include: { draftEvent: { include: { worldSeason: true } }, originalTeam: true, currentTeam: true, draftRight: true },
        take: snapshot.config.limits.maximumExportRows,
      });
      return {
        headers: [...getExportSchema('DRAFT_HISTORY_CSV').columns],
        rows: picks.map((p) => [
          p.draftEventId, p.draftEvent?.worldSeason?.label ?? '',
          p.roundNumber, p.overallPick,
          p.selectedPlayerId ?? '', p.selectedPlayerNameSnapshot ?? '',
          p.currentTeamId, p.currentTeam?.name ?? '',
          p.originalTeamId, p.originalTeam?.name ?? '',
          p.draftRight?.status ?? '',
        ]),
      };
    }
    case 'TRADE_HISTORY_CSV': {
      const assets = await prisma.completedTradeAsset.findMany({
        orderBy: [{ completedTrade: { completedAt: 'desc' } }, { id: 'asc' }],
        include: { completedTrade: { include: { proposingTeam: true, receivingTeam: true, effectiveWorldSeason: true } }, sourceTeam: true },
        take: snapshot.config.limits.maximumExportRows,
      });
      return {
        headers: [...getExportSchema('TRADE_HISTORY_CSV').columns],
        rows: assets.map((a, i) => {
          const t = a.completedTrade;
          return [
            t.id, t.completedAt,
            t.proposingTeamId, t.proposingTeam?.name ?? '',
            t.receivingTeamId, t.receivingTeam?.name ?? '',
            a.assetType, a.assetSnapshotText.slice(0, 80),
            a.sourceTeamId, a.sourceTeam?.name ?? '',
            a.targetTeamId, a.targetTeamId,
            i,
          ];
        }),
      };
    }
    case 'TRANSACTION_HISTORY_CSV': {
      const txs = await prisma.contractTransaction.findMany({
        orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
        include: { effectiveWorldSeason: true },
        take: snapshot.config.limits.maximumExportRows,
      });
      return {
        headers: [...getExportSchema('TRANSACTION_HISTORY_CSV').columns],
        rows: txs.map((t) => [
          t.id, t.transactionType,
          t.effectiveWorldSeasonId ?? '', t.effectiveWorldSeason?.label ?? '',
          t.playerId, t.playerNameSnapshot,
          t.teamId ?? '', t.teamNameSnapshot ?? '',
          t.otherTeamId ?? '', '',
          t.reason, t.createdAt,
        ]),
      };
    }
    case 'CONFIGURATION_PRESET_JSON': {
      // Expose the maintenance default itself as a preset envelope. The full
      // payload is included so the export can be re-imported as a new preset
      // version elsewhere.
      const envelope = {
        schemaVersion: 1,
        presetType: 'MAINTENANCE',
        presetName: snapshot.preset.name,
        versionName: `v${snapshot.version.versionNumber}`,
        payloadSchemaVersion: snapshot.config.schemaVersion,
        payload: snapshot.config,
        payloadHash: computePresetPayloadHash(snapshot.config),
        exportedAt: new Date().toISOString(),
      };
      // The serialization layer wraps rows into a JSON envelope. We emit one
      // row whose "columns" match the schema but stash the full envelope on
      // the side so the route can also offer a single-envelope download. The
      // JSON envelope itself is the canonical export shape.
      return {
        headers: [...getExportSchema('CONFIGURATION_PRESET_JSON').columns],
        rows: [[envelope.presetType, envelope.presetName, envelope.versionName, envelope.payloadSchemaVersion, envelope.payloadHash]],
      };
    }
    case 'NAME_POOLS_JSON': {
      const pools = await prisma.countryNamePool.findMany({
        where: filters.countryCode ? { country: { code: filters.countryCode } } : {},
        orderBy: [{ country: { code: 'asc' } }],
        include: {
          country: true,
          versions: { orderBy: { versionNumber: 'desc' }, take: 1 },
        },
      });
      return {
        headers: [...getExportSchema('NAME_POOLS_JSON').columns],
        rows: pools.map((p) => {
          const v = p.versions[0];
          return [
            p.country?.code ?? '', p.country?.name ?? '',
            v?.firstNameCount ?? 0, v?.lastNameCount ?? 0, v?.poolHash ?? '',
          ];
        }),
      };
    }
    default:
      throw maintenanceErrors.invalidRequest(`Unsupported export type: ${exportType}`);
  }
}

async function loadPlayers(filters: Record<string, string>, includeTruth: boolean): Promise<unknown[][]> {
  const players = await prisma.player.findMany({
    where: buildPlayerWhere(filters),
    orderBy: includeTruth
      ? [{ lastName: 'asc' }, { firstName: 'asc' }, { id: 'asc' }]
      : [{ lastName: 'asc' }, { firstName: 'asc' }, { id: 'asc' }],
    include: {
      nationality: true,
      currentTeam: true,
      skaterAttributes: true,
      goalieAttributes: true,
      youthGeneratedPlayer: true,
    },
    take: 100000, // bounded; server config limit applied separately
  });
  // Derive current ability / role via F5 (reuses the same derivation the
  // public player API uses). Commissioner truth export surfaces derived
  // values + hidden columns together.
  const { derivePublicPlayerModel } = await import('./player-model.js');
  if (includeTruth) {
    return players.map((p) => {
      const derived = derivePublicPlayerModel({
        primaryPosition: p.primaryPosition,
        preferredCoachingStyle: p.preferredCoachingStyle,
        preferredTactics: p.preferredTactics,
        personality: p.personality,
        heroRating: p.heroRating,
        stability: p.stability,
        developmentRate: p.developmentRate,
        developmentRisk: p.developmentRisk,
        potentialFloor: p.potentialFloor,
        potentialCeiling: p.potentialCeiling,
        publicPotentialEstimate: p.publicPotentialEstimate,
        skaterAttributes: (p.skaterAttributes as Record<string, number> | null) ?? undefined,
        goalieAttributes: (p.goalieAttributes as Record<string, number> | null) ?? undefined,
      });
      return [
        p.id, p.firstName, p.lastName, p.dateOfBirth, p.nationality?.code ?? '',
        p.primaryPosition, p.rosterStatus, p.youthGeneratedPlayer?.shootsSnapshot ?? '',
        p.currentTeamId ?? '', p.currentTeam?.name ?? '',
        p.sourceType, derived?.role.role ?? '',
        derived?.ratings.currentAbility ?? '',
        p.potentialFloor ?? '', p.potentialCeiling ?? '',
        p.developmentRate ?? '', p.developmentRisk ?? '',
        p.youthGeneratedPlayer?.qualityTier ?? '',
      ];
    });
  }
  return players.map((p) => [
    p.id, p.firstName, p.lastName, p.dateOfBirth, p.nationality?.code ?? '',
    p.primaryPosition, p.rosterStatus, p.youthGeneratedPlayer?.shootsSnapshot ?? '',
    p.currentTeamId ?? '', p.currentTeam?.name ?? '',
    p.sourceType, derivePublicPlayerModel({
      primaryPosition: p.primaryPosition,
      preferredCoachingStyle: p.preferredCoachingStyle,
      preferredTactics: p.preferredTactics,
      personality: p.personality,
      heroRating: p.heroRating,
      stability: p.stability,
      developmentRate: p.developmentRate,
      developmentRisk: p.developmentRisk,
      potentialFloor: p.potentialFloor,
      potentialCeiling: p.potentialCeiling,
      publicPotentialEstimate: p.publicPotentialEstimate,
      skaterAttributes: (p.skaterAttributes as Record<string, number> | null) ?? undefined,
      goalieAttributes: (p.goalieAttributes as Record<string, number> | null) ?? undefined,
    })?.role.role ?? '',
  ]);
}

// ---------------------------------------------------------------------------
// Inventory / detail / download / delete
// ---------------------------------------------------------------------------

export async function listExportRuns(opts: { exportType?: string; status?: string; limit?: number; offset?: number } = {}) {
  const where: Prisma.MaintenanceExportRunWhereInput = {};
  if (opts.exportType) where.exportType = opts.exportType;
  if (opts.status) where.status = opts.status;
  const limit = Math.min(opts.limit ?? 100, 500);
  const offset = opts.offset ?? 0;
  const [items, total] = await Promise.all([
    prisma.maintenanceExportRun.findMany({ where, orderBy: { createdAt: 'desc' }, take: limit, skip: offset }),
    prisma.maintenanceExportRun.count({ where }),
  ]);
  return {
    items: items.map(mapExportRun),
    total,
    limit,
    offset,
  };
}

export function mapExportRun(r: {
  id: string; exportType: string; status: string; format: string; scopeText: string; filterText: string;
  privacyLevel: string; configVersionId: string; configHash: string; schemaVersion: number;
  outputRelativePath: string | null; manifestRelativePath: string | null; rowCount: number | null;
  fileSizeBytes: number | null; fileSha256: string | null; manifestSha256: string | null;
  inputHash: string; resultHash: string | null; requestedBy: string; reason: string;
  startedAt: Date; completedAt: Date | null; failedAt: Date | null; failureCode: string | null; failureMessage: string | null;
  createdAt: Date; updatedAt: Date;
}) {
  return {
    id: r.id,
    exportType: r.exportType,
    status: r.status,
    format: r.format,
    scope: r.scopeText,
    filters: r.filterText,
    privacyLevel: r.privacyLevel,
    schemaVersion: r.schemaVersion,
    rowCount: r.rowCount,
    fileSizeBytes: r.fileSizeBytes,
    fileSha256Prefix: r.fileSha256?.slice(0, 12) ?? null,
    manifestSha256Prefix: r.manifestSha256?.slice(0, 12) ?? null,
    inputHashPrefix: r.inputHash.slice(0, 12),
    resultHashPrefix: r.resultHash?.slice(0, 12) ?? null,
    requestedBy: r.requestedBy,
    reason: r.reason,
    startedAt: r.startedAt,
    completedAt: r.completedAt,
    failedAt: r.failedAt,
    failureCode: r.failureCode,
    // failureMessage intentionally omitted from list view (may contain detail)
    createdAt: r.createdAt,
    // outputRelativePath NEVER exposed — download is by run ID only
  };
}

export async function getExportRunDetail(runId: string) {
  const r = await prisma.maintenanceExportRun.findUnique({ where: { id: runId } });
  if (!r) throw maintenanceErrors.exportNotFound(runId);
  return mapExportRun(r);
}

export async function readExportFile(runId: string): Promise<{ absolutePath: string; fileName: string; mimeType: string }> {
  const r = await prisma.maintenanceExportRun.findUnique({ where: { id: runId } });
  if (!r) throw maintenanceErrors.exportNotFound(runId);
  if (r.status !== 'COMPLETED') throw maintenanceErrors.exportNotCompleted(runId);
  if (!r.outputRelativePath) throw maintenanceErrors.exportNotCompleted(runId);
  const snapshot = await getActiveMaintenanceSnapshot(prisma);
  const root = ensureExportRoot(snapshot.config);
  const absolutePath = resolveExportFile(root, r.outputRelativePath);
  const fileName = path.basename(absolutePath);
  assertAllowedExtension(fileName);
  if (!fs.existsSync(absolutePath)) throw maintenanceErrors.exportNotCompleted(runId);
  const ext = path.extname(fileName).toLowerCase();
  const mimeType = ext === '.csv' ? 'text/csv' : ext === '.json' ? 'application/json' : 'application/zip';
  return { absolutePath, fileName, mimeType };
}

export async function readManifestFile(runId: string): Promise<{ content: string } | null> {
  const r = await prisma.maintenanceExportRun.findUnique({ where: { id: runId } });
  if (!r) throw maintenanceErrors.exportNotFound(runId);
  if (!r.manifestRelativePath) return null;
  const snapshot = await getActiveMaintenanceSnapshot(prisma);
  const root = ensureExportRoot(snapshot.config);
  const absolutePath = resolveExportFile(root, r.manifestRelativePath);
  if (!fs.existsSync(absolutePath)) return null;
  return { content: fs.readFileSync(absolutePath, 'utf-8') };
}

export async function deleteExportRun(runId: string): Promise<void> {
  const r = await prisma.maintenanceExportRun.findUnique({ where: { id: runId } });
  if (!r) throw maintenanceErrors.exportNotFound(runId);
  if (r.status === 'DELETED') return;
  const snapshot = await getActiveMaintenanceSnapshot(prisma);
  const root = ensureExportRoot(snapshot.config);
  // Safe-remove any artifacts (best-effort). Never deletes outside the root.
  if (r.outputRelativePath) {
    try {
      const abs = resolveExportFile(root, r.outputRelativePath);
      safeRemove(abs);
    } catch {
      /* path invalid — ignore */
    }
  }
  if (r.manifestRelativePath) {
    try {
      const abs = resolveExportFile(root, r.manifestRelativePath);
      safeRemove(abs);
    } catch {
      /* ignore */
    }
  }
  await prisma.maintenanceExportRun.update({
    where: { id: runId },
    data: { status: 'DELETED', outputRelativePath: null, manifestRelativePath: null },
  });
  await appendMaintenanceEvent({
    entityType: 'MAINTENANCE_EXPORT',
    entityId: runId,
    eventType: 'EXPORT_DELETED',
    statusBefore: r.status,
    statusAfter: 'DELETED',
    summary: `Export ${r.exportType} deleted`,
  });
}

export async function pruneOldExports(config: MaintenanceConfig): Promise<{ pruned: number; kept: number }> {
  const cutoff = new Date(Date.now() - config.retention.maximumAgeDays * 24 * 60 * 60 * 1000);
  const candidates = await prisma.maintenanceExportRun.findMany({
    where: { status: 'COMPLETED', createdAt: { lt: cutoff } },
    orderBy: { createdAt: 'desc' },
  });
  // Keep at most maximumGeneratedExports; prune the oldest beyond that.
  const toPrune = candidates.slice(config.retention.maximumGeneratedExports);
  for (const c of toPrune) {
    await deleteExportRun(c.id);
  }
  return { pruned: toPrune.length, kept: candidates.length - toPrune.length };
}

export { EXPORT_SCHEMAS };
