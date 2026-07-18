import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {
  buildNamePoolImportPlan,
  extractApplyReadyNamePoolRows,
  validatePresetEnvelope,
  computePresetPayloadHash,
  normalizeMaintenanceNameToken,
  assertImportTransition,
  canTransitionImportStatus,
  type ConfigurationPresetEnvelope,
  type DuplicatePolicy,
  type ImportPlan,
  type ImportType,
  type MaintenanceConfig,
  type NamePoolImportRow,
} from '@fhm/engine';
import { prisma } from '../db/client.js';
import { maintenanceErrors } from './maintenance-errors.js';
import {
  ensureExportRoot,
  resolveExportFile,
  safeRemove,
  sanitizeDisplayFileName,
} from './maintenance-paths.js';
import { getActiveMaintenanceSnapshot, hashMaintenanceConfigDb } from './maintenance-config.js';
import { appendMaintenanceEvent, auditMaintenanceTx } from './maintenance-history.js';
import { createDatabaseBackup } from './backup-creation.js';
import type { CommissionerAuditSource, Prisma } from '@prisma/client';

const ALLOWED_IMPORT_EXTENSIONS = new Set(['.csv', '.json']);
const ALLOWED_IMPORT_CONTENT_TYPES = new Set([
  'text/csv',
  'application/csv',
  'application/json',
  'text/plain',
  'application/octet-stream',
  '',
]);

export interface ImportUploadResult {
  importRunId: string;
  importType: ImportType;
  sourceFileName: string;
  sourceFileSizeBytes: number;
  sourceFileSha256: string;
  status: 'UPLOADED';
}

/**
 * Accept a multipart file upload, validate size/extension/content-type, compute
 * SHA-256, store under an isolated staging directory, and create an UPLOADED
 * MaintenanceImportRun. The original path is never trusted; the display name
 * is sanitized.
 */
export async function uploadImportFile(args: {
  importType: ImportType;
  fileBuffer: Buffer;
  originalFileName: string;
  contentType: string;
  reason: string;
  requestedBy?: string;
}): Promise<ImportUploadResult> {
  if (process.env.FHM_MAINTENANCE_DEBUG === 'true') {
    console.log('[maintenance-imports] upload start:', { importType: args.importType, size: args.fileBuffer.byteLength, name: args.originalFileName, contentType: args.contentType });
  }
  const snapshot = await getActiveMaintenanceSnapshot(prisma);
  if (args.fileBuffer.byteLength > snapshot.config.limits.maximumImportBytes) {
    throw maintenanceErrors.invalidImportFile(
      `Import file exceeds maximumImportBytes (${snapshot.config.limits.maximumImportBytes})`,
    );
  }
  const ext = path.extname(args.originalFileName).toLowerCase();
  if (!ALLOWED_IMPORT_EXTENSIONS.has(ext)) {
    throw maintenanceErrors.invalidImportFile(`Disallowed import file extension: ${ext}`);
  }
  if (!ALLOWED_IMPORT_CONTENT_TYPES.has(args.contentType)) {
    throw maintenanceErrors.invalidImportFile(`Disallowed content type: ${args.contentType}`);
  }
  const sourceFileSha256 = createHash('sha256').update(args.fileBuffer).digest('hex');
  const root = ensureExportRoot(snapshot.config);
  const stagingDir = path.resolve(root, '.staging');
  if (!fs.existsSync(stagingDir)) fs.mkdirSync(stagingDir, { recursive: true });
  const display = sanitizeDisplayFileName(args.originalFileName);
  const stagedName = `upload-${sourceFileSha256.slice(0, 12)}${ext}`;
  const stagedPath = resolveExportFile(root, path.join('.staging', stagedName));
  fs.writeFileSync(stagedPath, args.fileBuffer);

  const run = await prisma.maintenanceImportRun.create({
    data: {
      importType: args.importType,
      status: 'UPLOADED',
      sourceFileName: display,
      sourceFileSizeBytes: args.fileBuffer.byteLength,
      sourceFileSha256,
      schemaVersion: 1,
      configVersionId: snapshot.version.id,
      configHash: snapshot.version.configHash,
      previewSnapshotText: '{}',
      previewHash: '',
      totalRows: 0,
      validRows: 0,
      warningRows: 0,
      invalidRows: 0,
      requestedBy: args.requestedBy ?? 'system',
      reason: args.reason,
    },
  });
  // Remember the staged path on the run via the previewSnapshotText field
  // (encoded). The preview step reads it back. We never expose this path in
  // any DTO.
  await prisma.maintenanceImportRun.update({
    where: { id: run.id },
    data: { previewSnapshotText: JSON.stringify({ stagedRelativePath: path.join('.staging', stagedName) }) },
  });
  return {
    importRunId: run.id,
    importType: args.importType,
    sourceFileName: display,
    sourceFileSizeBytes: args.fileBuffer.byteLength,
    sourceFileSha256,
    status: 'UPLOADED',
  };
}

async function readStagedPath(runId: string): Promise<string> {
  const run = await prisma.maintenanceImportRun.findUniqueOrThrow({ where: { id: runId } });
  const meta = JSON.parse(run.previewSnapshotText || '{}') as { stagedRelativePath?: string };
  if (!meta.stagedRelativePath) throw maintenanceErrors.importNotReady(runId);
  const snapshot = await getActiveMaintenanceSnapshot(prisma);
  const root = ensureExportRoot(snapshot.config);
  const abs = resolveExportFile(root, meta.stagedRelativePath);
  if (!fs.existsSync(abs)) throw maintenanceErrors.importNotReady(runId);
  return abs;
}

async function clearStagedPath(runId: string): Promise<void> {
  try {
    const run = await prisma.maintenanceImportRun.findUniqueOrThrow({ where: { id: runId } });
    const meta = JSON.parse(run.previewSnapshotText || '{}') as { stagedRelativePath?: string };
    if (meta.stagedRelativePath) {
      const snapshot = await getActiveMaintenanceSnapshot(prisma);
      const root = ensureExportRoot(snapshot.config);
      safeRemove(resolveExportFile(root, meta.stagedRelativePath));
    }
  } catch {
    /* ignore */
  }
}

// ---------------------------------------------------------------------------
// Preview
// ---------------------------------------------------------------------------

export interface ImportPreviewResult {
  importRunId: string;
  importType: ImportType;
  detectedSchema: string;
  sourceFileSha256: string;
  totalRows: number;
  validRows: number;
  warningRows: number;
  invalidRows: number;
  intendedCreates: number;
  intendedSkips: number;
  duplicatePolicy: DuplicatePolicy;
  sampleIssues: Array<{ rowNumber: number | null; code: string; message: string; severity: string }>;
  blockers: Array<{ code: string; message: string }>;
  previewHash: string;
}

export async function previewImport(args: {
  importRunId: string;
  duplicatePolicy: DuplicatePolicy;
}): Promise<ImportPreviewResult> {
  const run = await prisma.maintenanceImportRun.findUnique({ where: { id: args.importRunId } });
  if (!run) throw maintenanceErrors.importNotFound(args.importRunId);
  if (run.status !== 'UPLOADED' && run.status !== 'PREVIEW_READY') {
    throw maintenanceErrors.importNotReady(args.importRunId);
  }
  await transitionImport(args.importRunId, run.status, 'VALIDATING');
  try {
    const stagedPath = await readStagedPath(args.importRunId);
    const raw = fs.readFileSync(stagedPath, 'utf-8');
    let plan: ImportPlan;
    let detectedSchema: string;
    if (run.importType === 'NAME_POOL') {
      const parsed = parseNamePoolImport(raw);
      detectedSchema = parsed.detectedSchema;
      const existing = await loadExistingNamePoolEntries();
      plan = buildNamePoolImportPlan({
        rows: parsed.rows,
        existing,
        duplicatePolicy: args.duplicatePolicy,
      });
    } else {
      // CONFIGURATION_PRESET
      detectedSchema = 'preset-envelope-v1';
      const envelope = validatePresetEnvelope(JSON.parse(raw));
      plan = buildPresetPseudoPlan(envelope, args.duplicatePolicy);
    }
    const sampleIssues = plan.issues.slice(0, 50).map((i) => ({
      rowNumber: i.rowNumber,
      code: i.code,
      message: i.message,
      severity: i.severity,
    }));
    const blockers = plan.issues
      .filter((i) => i.severity === 'BLOCKER')
      .slice(0, 50)
      .map((i) => ({ code: i.code, message: i.message }));
    await transitionImport(args.importRunId, 'VALIDATING', 'PREVIEW_READY');
    // Preserve the stagedRelativePath that upload wrote; merge it with the
    // plan + detected schema so apply can read the staged file back.
    const priorMeta = JSON.parse(run.previewSnapshotText || '{}') as { stagedRelativePath?: string };
    await prisma.maintenanceImportRun.update({
      where: { id: args.importRunId },
      data: {
        previewSnapshotText: JSON.stringify({ plan, detectedSchema, stagedRelativePath: priorMeta.stagedRelativePath }),
        previewHash: plan.previewHash,
        totalRows: plan.totalRows,
        validRows: plan.validRows,
        warningRows: plan.warningRows,
        invalidRows: plan.invalidRows,
      },
    });
    await appendMaintenanceEvent({
      entityType: 'MAINTENANCE_IMPORT',
      entityId: args.importRunId,
      eventType: 'IMPORT_PREVIEWED',
      statusBefore: run.status,
      statusAfter: 'PREVIEW_READY',
      summary: `${run.importType} preview: ${plan.validRows} valid, ${plan.invalidRows} invalid`,
    });
    return {
      importRunId: args.importRunId,
      importType: run.importType as ImportType,
      detectedSchema,
      sourceFileSha256: run.sourceFileSha256,
      totalRows: plan.totalRows,
      validRows: plan.validRows,
      warningRows: plan.warningRows,
      invalidRows: plan.invalidRows,
      intendedCreates: plan.intendedCreates,
      intendedSkips: plan.intendedSkips,
      duplicatePolicy: plan.duplicatePolicy,
      sampleIssues,
      blockers,
      previewHash: plan.previewHash,
    };
  } catch (e) {
    await markImportFailed(args.importRunId, e);
    throw e instanceof Error ? e : new Error(String(e));
  }
}

function buildPresetPseudoPlan(envelope: ConfigurationPresetEnvelope, policy: DuplicatePolicy): ImportPlan {
  // For presets, "rows" are not really row-based — we surface a single
  // synthesized plan describing the intended version creation.
  const basePlan: Omit<ImportPlan, 'previewHash'> = {
    importType: 'CONFIGURATION_PRESET',
    totalRows: 1,
    validRows: 1,
    warningRows: 0,
    invalidRows: 0,
    intendedCreates: 1,
    intendedSkips: 0,
    duplicatePolicy: policy,
    duplicates: [],
    issues: [],
  };
  // Recompute the preview hash deterministically.
  return { ...basePlan, previewHash: computePresetPayloadHash({ envelope }) };
}

// ---------------------------------------------------------------------------
// Apply
// ---------------------------------------------------------------------------

export interface ImportApplyResult {
  importRunId: string;
  status: 'COMPLETED';
  appliedRows: number;
  skippedRows: number;
  backupId: string;
}

export async function applyImport(args: {
  importRunId: string;
  expectedPreviewHash: string;
  reason: string;
  source: CommissionerAuditSource;
  requestedBy?: string;
}): Promise<ImportApplyResult> {
  const run = await prisma.maintenanceImportRun.findUnique({ where: { id: args.importRunId } });
  if (!run) throw maintenanceErrors.importNotFound(args.importRunId);
  if (run.status === 'COMPLETED') throw maintenanceErrors.importAlreadyCompleted(args.importRunId);
  if (run.status !== 'PREVIEW_READY') throw maintenanceErrors.importNotReady(args.importRunId);
  if (run.previewHash !== args.expectedPreviewHash) {
    throw maintenanceErrors.importPreviewStale();
  }
  const meta = JSON.parse(run.previewSnapshotText || '{}') as { plan?: ImportPlan; detectedSchema?: string };
  if (!meta.plan) throw maintenanceErrors.importNotReady(args.importRunId);

  // Block apply when any BLOCKER issues remain.
  const blockerCount = meta.plan.issues.filter((i) => i.severity === 'BLOCKER').length;
  if (blockerCount > 0) {
    throw maintenanceErrors.importValidationFailed(
      `Import has ${blockerCount} unresolved blocker(s); resolve before applying`,
    );
  }

  // Mandatory F32 backup before mutation.
  const backupResult = await createDatabaseBackup({
    backupType: 'MANUAL',
    reasonCode: 'OTHER',
    reasonText: `F33 import ${run.importType} (${args.importRunId})`,
    sourceOperationType: 'MAINTENANCE_IMPORT',
    sourceOperationId: args.importRunId,
    protected: true,
    requestedBy: args.requestedBy,
  }).catch((e) => {
    throw maintenanceErrors.backupFailed(e instanceof Error ? e.message : 'Backup creation failed');
  });

  await transitionImport(args.importRunId, 'PREVIEW_READY', 'APPLYING');
  try {
    let appliedRows = 0;
    let skippedRows = 0;
    if (run.importType === 'NAME_POOL') {
      const result = await applyNamePoolImportByRunId(args.importRunId, args.source, args.reason);
      appliedRows = result.appliedRows;
      skippedRows = result.skippedRows;
    } else {
      // CONFIGURATION_PRESET — create new immutable version, never auto-activate.
      const envelope = JSON.parse(fs.readFileSync(await readStagedPath(args.importRunId), 'utf-8'));
      await applyPresetImport(envelope, args.source, args.reason);
      appliedRows = 1;
    }
    await transitionImport(args.importRunId, 'APPLYING', 'COMPLETED');
    await prisma.maintenanceImportRun.update({
      where: { id: args.importRunId },
      data: {
        appliedRows,
        skippedRows,
        backupId: backupResult.backup.id,
        completedAt: new Date(),
      },
    });
    await clearStagedPath(args.importRunId);
    await appendMaintenanceEvent({
      entityType: 'MAINTENANCE_IMPORT',
      entityId: args.importRunId,
      eventType: 'IMPORT_APPLIED',
      statusBefore: 'APPLYING',
      statusAfter: 'COMPLETED',
      summary: `${run.importType} applied ${appliedRows} rows (skipped ${skippedRows})`,
    });
    return {
      importRunId: args.importRunId,
      status: 'COMPLETED',
      appliedRows,
      skippedRows,
      backupId: backupResult.backup.id,
    };
  } catch (e) {
    await markImportFailed(args.importRunId, e);
    throw e instanceof Error ? e : new Error(String(e));
  }
}

/**
 * Apply a name-pool import atomically. Bulk-creates new CountryNamePool +
 * CountryNamePoolVersion rows. Never modifies existing Players.
 */
export async function applyNamePoolImportByRunId(runId: string, source: CommissionerAuditSource, reason: string): Promise<{ appliedRows: number; skippedRows: number }> {
  const run = await prisma.maintenanceImportRun.findUniqueOrThrow({ where: { id: runId } });
  const meta = JSON.parse(run.previewSnapshotText || '{}') as { plan?: ImportPlan };
  const plan = meta.plan!;
  const stagedPath = await readStagedPath(runId);
  const parsed = parseNamePoolImport(fs.readFileSync(stagedPath, 'utf-8'));
  const validatedRows: NamePoolImportRow[] = [];
  for (const r of parsed.rows) {
    // Re-validate inline (server-side truth, not the engine summary).
    const countryCode = String(r.countryCode ?? '').trim().toUpperCase();
    const firstName = String(r.firstName ?? '').trim();
    const lastName = String(r.lastName ?? '').trim();
    if (!countryCode || !firstName || !lastName) continue;
    validatedRows.push({ rowNumber: r.rowNumber, countryCode, firstName, lastName });
  }
  const applyReady = extractApplyReadyNamePoolRows(plan, validatedRows);
  // Group by (country, name) for de-dup against the live DB (the plan was
  // built against a snapshot taken at preview time; re-check at apply time
  // for safety).
  const existing = await loadExistingNamePoolEntries();
  const existingSet = new Set(existing.map((e) => `${e.countryCode.toUpperCase()}|${e.firstName.toLowerCase()}|${e.lastName.toLowerCase()}`));
  const toCreate: NamePoolImportRow[] = [];
  for (const r of applyReady) {
    const key = `${r.countryCode}|${r.firstName.toLowerCase()}|${r.lastName.toLowerCase()}`;
    if (existingSet.has(key)) {
      // Already present — skip (preserves the existing pool entry + Players).
      continue;
    }
    toCreate.push(r);
    existingSet.add(key);
  }

  await prisma.$transaction(async (tx) => {
    for (const r of toCreate) {
      const country = await tx.country.findUnique({ where: { code: r.countryCode } });
      if (!country) {
        throw maintenanceErrors.importValidationFailed(`Unknown countryCode: ${r.countryCode}`, { countryCode: r.countryCode });
      }
      // One pool per (country, name). Use the country code as the pool name
      // if a pool doesn't already exist for this country.
      const poolName = `${r.countryCode}-imported`;
      const pool = await tx.countryNamePool.upsert({
        where: { countryId_name: { countryId: country.id, name: poolName } },
        create: { countryId: country.id, name: poolName, isSystem: false },
        update: {},
      });
      // Append this name to the latest version's text, or create version 1.
      const latestVersion = await tx.countryNamePoolVersion.findFirst({
        where: { namePoolId: pool.id },
        orderBy: { versionNumber: 'desc' },
      });
      const firstNames = latestVersion ? `${latestVersion.maleFirstNamesText}\n${r.firstName}` : r.firstName;
      const lastNames = latestVersion ? `${latestVersion.lastNamesText}\n${r.lastName}` : r.lastName;
      const firstArr = splitLines(firstNames);
      const lastArr = splitLines(lastNames);
      const poolHash = computeNamePoolHash(firstArr, lastArr);
      const versionNumber = (latestVersion?.versionNumber ?? 0) + 1;
      await tx.countryNamePoolVersion.create({
        data: {
          namePoolId: pool.id,
          versionNumber,
          maleFirstNamesText: firstNames,
          lastNamesText: lastNames,
          firstNameCount: firstArr.length,
          lastNameCount: lastArr.length,
          poolHash,
          changeReason: `F33 import: add ${r.firstName} ${r.lastName}`,
          createdBySource: source,
        },
      });
    }
    await auditMaintenanceTx(tx, 'MAINTENANCE_IMPORT', runId, 'IMPORT_APPLIED', reason, null, { appliedRows: toCreate.length }, source);
  });
  return { appliedRows: toCreate.length, skippedRows: validatedRows.length - toCreate.length };
}

function splitLines(text: string): string[] {
  return text.split(/\r?\n/).map((l) => l.trim()).filter((l) => l.length > 0);
}

function computeNamePoolHash(firstNames: string[], lastNames: string[]): string {
  // Stable SHA-256 of the canonical name pool (sorted, unique-normalized).
  // This is the persisted poolHash on CountryNamePoolVersion; it need not
  // match the engine's browser-safe digest because it is a server-side
  // persisted identifier (proves bytes on disk, like the F32 config hash).
  const canonical = JSON.stringify({
    firstNames: [...new Set(firstNames.map((n) => normalizeMaintenanceNameToken(n) ?? ''))].sort(),
    lastNames: [...new Set(lastNames.map((n) => normalizeMaintenanceNameToken(n) ?? ''))].sort(),
  });
  return createHash('sha256').update(canonical).digest('hex');
}

/**
 * Apply a preset import: create a new immutable preset/version for the
 * matching feature family. Never edits an existing version; never auto-
 * activates. Mapping from envelope.presetType to the feature's preset table.
 */
async function applyPresetImport(envelopeRaw: unknown, source: CommissionerAuditSource, reason: string): Promise<void> {
  const envelope = validatePresetEnvelope(envelopeRaw);
  // For F33 we only support importing MAINTENANCE preset versions (the
  // configuration preset export emits MAINTENAGE envelopes). Other preset
  // types are validated (envelope schema) but their apply paths belong to
  // each feature's own subsystem; F33 does not implement them.
  if (envelope.presetType !== 'MAINTENANCE') {
    throw maintenanceErrors.importConflict(
      `Preset type '${envelope.presetType}' import is not implemented in F33 (only MAINTENANCE)`,
    );
  }
  const { validateMaintenanceConfig } = await import('@fhm/engine');
  const config = validateMaintenanceConfig(envelope.payload);
  const configHash = hashMaintenanceConfigDb(config);
  await prisma.$transaction(async (tx) => {
    const preset = await tx.maintenancePreset.upsert({
      where: { name: envelope.presetName },
      create: { name: envelope.presetName, description: `Imported ${envelope.versionName}`, isSystem: false },
      update: {},
    });
    const existing = await tx.maintenancePresetVersion.findFirst({
      where: { presetId: preset.id, configHash },
    });
    if (existing) {
      // Duplicate payload — explicit link, no new row.
      throw maintenanceErrors.importConflict('Preset payload already exists as an immutable version', { existingVersionId: existing.id });
    }
    const latestVersion = await tx.maintenancePresetVersion.findFirst({
      where: { presetId: preset.id },
      orderBy: { versionNumber: 'desc' },
    });
    const versionNumber = (latestVersion?.versionNumber ?? 0) + 1;
    const created = await tx.maintenancePresetVersion.create({
      data: {
        presetId: preset.id,
        versionNumber,
        schemaVersion: config.schemaVersion,
        configJson: JSON.stringify(config),
        configHash,
        changeReason: reason || `Imported ${envelope.versionName}`,
        createdBySource: source,
      },
    });
    await auditMaintenanceTx(tx, 'MAINTENANCE_CONFIG', created.id, 'MAINTENANCE_CONFIG_VERSION_CREATED', reason, null, { versionNumber, presetName: envelope.presetName }, source);
  });
}

// ---------------------------------------------------------------------------
// Parsing — name pool CSV/JSON
// ---------------------------------------------------------------------------

function parseNamePoolImport(raw: string): { rows: Array<{ rowNumber: number; countryCode: unknown; firstName: unknown; lastName: unknown }>; detectedSchema: string } {
  const trimmed = raw.trim();
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    // JSON
    const parsed = JSON.parse(trimmed);
    const entries: unknown[] = Array.isArray(parsed) ? parsed : (parsed.entries ?? parsed.rows ?? []);
    const rows = entries.map((e, i) => {
      const o = e as Record<string, unknown>;
      return {
        rowNumber: i + 1,
        countryCode: o.countryCode ?? o.country ?? o.country_code,
        firstName: o.firstName ?? o.first_name ?? o.first,
        lastName: o.lastName ?? o.last_name ?? o.last,
      };
    });
    return { rows, detectedSchema: 'name-pool-json-v1' };
  }
  // CSV: header required
  const lines = trimmed.split(/\r?\n/);
  if (lines.length === 0) return { rows: [], detectedSchema: 'name-pool-csv-v1' };
  const header = lines[0]!.split(',').map((h) => h.trim().toLowerCase());
  const ccIdx = header.findIndex((h) => h === 'countrycode' || h === 'country' || h === 'country_code');
  const fIdx = header.findIndex((h) => h === 'firstname' || h === 'first_name' || h === 'first');
  const lIdx = header.findIndex((h) => h === 'lastname' || h === 'last_name' || h === 'last');
  if (ccIdx === -1 || fIdx === -1 || lIdx === -1) {
    throw maintenanceErrors.invalidImportFile('Name-pool CSV must have countryCode, firstName, lastName columns');
  }
  const rows = lines.slice(1).filter((l) => l.trim().length > 0).map((l, i) => {
    const cols = parseCsvLine(l);
    return {
      rowNumber: i + 2, // account for header
      countryCode: cols[ccIdx],
      firstName: cols[fIdx],
      lastName: cols[lIdx],
    };
  });
  return { rows, detectedSchema: 'name-pool-csv-v1' };
}

function parseCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i += 1) {
    const c = line[i]!;
    if (inQuotes) {
      if (c === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        cur += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ',') {
      out.push(cur);
      cur = '';
    } else {
      cur += c;
    }
  }
  out.push(cur);
  return out.map((s) => s.trim());
}

async function loadExistingNamePoolEntries() {
  const pools = await prisma.countryNamePool.findMany({
    include: { country: true, versions: { orderBy: { versionNumber: 'desc' }, take: 1 } },
  });
  const out: Array<{ countryCode: string; firstName: string; lastName: string }> = [];
  for (const p of pools) {
    const v = p.versions[0];
    if (!v) continue;
    const firsts = splitLines(v.maleFirstNamesText);
    const lasts = splitLines(v.lastNamesText);
    // Existing entries are the cartesian-product seeds; for dedup purposes we
    // only need to recognize any (country, first, last) already present.
    // To bound cost we index by (first,last) pairs within each country.
    for (const f of firsts) {
      for (const l of lasts) {
        out.push({ countryCode: p.country.code, firstName: f, lastName: l });
      }
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Lifecycle helpers + inventory
// ---------------------------------------------------------------------------

async function transitionImport(runId: string, from: string, to: string): Promise<void> {
  if (!canTransitionImportStatus(from as never, to as never)) {
    throw new Error(`Illegal import status transition ${from} -> ${to}`);
  }
  assertImportTransition(from as never, to as never);
  await prisma.maintenanceImportRun.update({ where: { id: runId }, data: { status: to } });
}

async function markImportFailed(runId: string, e: unknown): Promise<void> {
  const message = e instanceof Error ? e.message : String(e);
  try {
    await prisma.maintenanceImportRun.update({
      where: { id: runId },
      data: { status: 'FAILED', failedAt: new Date() },
    });
    await appendMaintenanceEvent({
      entityType: 'MAINTENANCE_IMPORT',
      entityId: runId,
      eventType: 'IMPORT_FAILED',
      statusBefore: null,
      statusAfter: 'FAILED',
      summary: message.slice(0, 200),
    });
  } catch {
    /* best-effort */
  }
}

export async function cancelImport(runId: string): Promise<void> {
  const run = await prisma.maintenanceImportRun.findUnique({ where: { id: runId } });
  if (!run) throw maintenanceErrors.importNotFound(runId);
  if (run.status === 'COMPLETED' || run.status === 'FAILED') return;
  if (run.status === 'APPLYING') {
    throw maintenanceErrors.importNotReady(runId);
  }
  await transitionImport(runId, run.status, 'CANCELLED');
  await clearStagedPath(runId);
  await appendMaintenanceEvent({
    entityType: 'MAINTENANCE_IMPORT',
    entityId: runId,
    eventType: 'IMPORT_CANCELLED',
    statusBefore: run.status,
    statusAfter: 'CANCELLED',
    summary: 'Import cancelled',
  });
}

export async function listImportRuns(opts: { importType?: string; status?: string; limit?: number; offset?: number } = {}) {
  const where: Prisma.MaintenanceImportRunWhereInput = {};
  if (opts.importType) where.importType = opts.importType;
  if (opts.status) where.status = opts.status;
  const limit = Math.min(opts.limit ?? 100, 500);
  const offset = opts.offset ?? 0;
  const [items, total] = await Promise.all([
    prisma.maintenanceImportRun.findMany({ where, orderBy: { createdAt: 'desc' }, take: limit, skip: offset }),
    prisma.maintenanceImportRun.count({ where }),
  ]);
  return {
    items: items.map((r) => ({
      id: r.id,
      importType: r.importType,
      status: r.status,
      sourceFileName: r.sourceFileName,
      sourceFileSizeBytes: r.sourceFileSizeBytes,
      sourceFileSha256Prefix: r.sourceFileSha256.slice(0, 12),
      totalRows: r.totalRows,
      validRows: r.validRows,
      warningRows: r.warningRows,
      invalidRows: r.invalidRows,
      appliedRows: r.appliedRows,
      skippedRows: r.skippedRows,
      previewHashPrefix: r.previewHash.slice(0, 12),
      backupId: r.backupId,
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

export async function getImportRunDetail(runId: string) {
  const r = await prisma.maintenanceImportRun.findUnique({ where: { id: runId } });
  if (!r) throw maintenanceErrors.importNotFound(runId);
  return {
    id: r.id,
    importType: r.importType,
    status: r.status,
    sourceFileName: r.sourceFileName,
    sourceFileSizeBytes: r.sourceFileSizeBytes,
    sourceFileSha256Prefix: r.sourceFileSha256.slice(0, 12),
    totalRows: r.totalRows,
    validRows: r.validRows,
    warningRows: r.warningRows,
    invalidRows: r.invalidRows,
    appliedRows: r.appliedRows,
    skippedRows: r.skippedRows,
    previewHashPrefix: r.previewHash.slice(0, 12),
    backupId: r.backupId,
    reason: r.reason,
    preparedAt: r.preparedAt,
    completedAt: r.completedAt,
    failedAt: r.failedAt,
    createdAt: r.createdAt,
  };
}

export async function listImportIssues(runId: string, opts: { limit?: number; offset?: number; severity?: string } = {}) {
  const where: Prisma.MaintenanceImportIssueWhereInput = { importRunId: runId };
  if (opts.severity) where.severity = opts.severity;
  const limit = Math.min(opts.limit ?? 100, 1000);
  const offset = opts.offset ?? 0;
  const [items, total] = await Promise.all([
    prisma.maintenanceImportIssue.findMany({ where, orderBy: [{ rowNumber: 'asc' }, { createdAt: 'asc' }], take: limit, skip: offset }),
    prisma.maintenanceImportIssue.count({ where }),
  ]);
  return {
    items: items.map((i) => ({
      id: i.id,
      rowNumber: i.rowNumber,
      fieldName: i.fieldName,
      severity: i.severity,
      code: i.code,
      message: i.message,
      normalizedValue: i.normalizedValue,
    })),
    total,
    limit,
    offset,
  };
}

export type { MaintenanceConfig };
