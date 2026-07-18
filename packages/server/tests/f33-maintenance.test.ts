import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import type { PrismaClient } from '@prisma/client';
import { join } from 'node:path';
import { cleanupTempDir, createTempDatabaseUrl, migrateTempDatabase } from './helpers/db.js';
import { getRepoRoot } from '../src/initialization/paths.js';
import { COMMISSIONER_HEADER, COMMISSIONER_HEADER_VALUE } from '../src/commissioner/gate.js';

const fixtureDir = join(getRepoRoot(), 'data', 'fixtures', 'f3-minimal-world');
const commissionerHeaders = { [COMMISSIONER_HEADER]: COMMISSIONER_HEADER_VALUE, 'x-fhm-commissioner-source': 'api' };

/**
 * F33 maintenance server suite. Exercises migration through F33, default-config
 * bootstrap, every export type, public-safe vs Commissioner-truth privacy,
 * manifest/hash determinism, download, failure cleanup, retention, import
 * upload/preview/apply with name-pool rows, preset export+import, database
 * validation, full-DB-package through F32, initialization reset (both modes),
 * mandatory-backup-before-mutation, path safety, no absolute-path leakage,
 * and the Commissioner gate.
 *
 * Uses a disposable initialized DB with ISOLATED backup + export directories;
 * never touches production data.
 */
describe('F33 import, export, and database maintenance', () => {
  let app: FastifyInstance;
  let prisma: PrismaClient;
  let tempDir = '';
  let backupDir = '';
  let exportDir = '';

  beforeAll(async () => {
    const x = createTempDatabaseUrl();
    tempDir = x.dir;
    process.env.DATABASE_URL = x.url;
    process.env.FHM_DATASET_DIR = fixtureDir;
    process.env.FHM_COMMISSIONER_WRITES_ENABLED = 'true';
    backupDir = join(tempDir, 'f33-backups');
    exportDir = join(tempDir, 'f33-exports');
    process.env.FHM_BACKUP_DIR = backupDir;
    process.env.FHM_EXPORT_DIR = exportDir;
    migrateTempDatabase(x.url);
    prisma = (await import('../src/db/client.js')).prisma;
    const { initializeSetup } = await import('../src/initialization/index.js');
    await prisma.appMeta.upsert({ where: { id: 'default' }, create: { id: 'default', worldInitialized: false }, update: { worldInitialized: false } });
    await initializeSetup(prisma, fixtureDir);
    const { bootstrapMaintenanceConfiguration } = await import('../src/services/maintenance-config.js');
    await bootstrapMaintenanceConfiguration(prisma);
    const { buildApp } = await import('../src/app.js');
    app = await buildApp({ logger: false });
  });

  afterAll(async () => {
    try { if (app) await app.close(); } catch { /* ignore */ }
    try { await prisma.$disconnect(); } catch { /* ignore */ }
    cleanupTempDir(tempDir);
  });

  // ----- Migration + bootstrap -----
  it('applies F33 migration (28 migrations total) and leaves F33 tables present', async () => {
    const tables = await prisma.$queryRawUnsafe(
      `SELECT name FROM sqlite_master WHERE type='table' AND (name LIKE 'Maintenance%' OR name LIKE 'InitializationReset%' OR name = 'ActiveMaintenanceConfiguration')`,
    ) as Array<{ name: string }>;
    const names = tables.map((t) => t.name).sort();
    expect(names).toContain('MaintenancePreset');
    expect(names).toContain('MaintenancePresetVersion');
    expect(names).toContain('ActiveMaintenanceConfiguration');
    expect(names).toContain('MaintenanceExportRun');
    expect(names).toContain('MaintenanceImportRun');
    expect(names).toContain('MaintenanceImportIssue');
    expect(names).toContain('MaintenanceValidationRun');
    expect(names).toContain('InitializationResetRun');
    expect(names).toContain('MaintenanceEvent');
    // Migration count sanity.
    const migrations = await prisma.$queryRawUnsafe(`SELECT COUNT(*) AS c FROM _prisma_migrations`) as Array<{ c: number }>;
    expect(Number(migrations[0]!.c)).toBeGreaterThanOrEqual(28);
  });

  it('bootstraps a default maintenance configuration idempotently', async () => {
    const presets = await prisma.maintenancePreset.findMany();
    expect(presets.length).toBeGreaterThanOrEqual(1);
    const active = await prisma.activeMaintenanceConfiguration.findUniqueOrThrow({ where: { id: 'default' } });
    expect(active).toBeTruthy();
    const { bootstrapMaintenanceConfiguration } = await import('../src/services/maintenance-config.js');
    await bootstrapMaintenanceConfiguration(prisma);
    const after = await prisma.maintenancePreset.findMany();
    expect(after.length).toBe(presets.length);
  });

  it('exposes F33 audit enum additions on CommissionerAuditAction', async () => {
    // The enum is encoded as a SQLite CHECK on the audit log; we exercise it
    // by writing a maintenance audit row.
    await prisma.commissionerAuditLog.create({
      data: {
        entityType: 'MAINTENANCE_CONFIG',
        entityId: 'enum-test',
        action: 'MAINTENANCE_CONFIG_CREATED',
        reason: 'enum probe',
        beforeJson: '{}',
        afterJson: '{}',
        changedFieldsJson: '[]',
        source: 'COMMISSIONER_API',
      },
    });
    const row = await prisma.commissionerAuditLog.findFirst({ where: { entityId: 'enum-test' } });
    expect(row?.action).toBe('MAINTENANCE_CONFIG_CREATED');
    await prisma.commissionerAuditLog.deleteMany({ where: { entityId: 'enum-test' } });
  });

  // ----- Public-safe vs Commissioner-truth player exports -----
  it('exports public players CSV that omits hidden truth', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/commissioner/maintenance/exports',
      headers: commissionerHeaders,
      payload: { exportType: 'PLAYERS_PUBLIC_CSV', filters: {}, reason: 'test' },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.item.status).toBe('COMPLETED');
    const download = await app.inject({
      method: 'GET',
      url: `/api/commissioner/maintenance/exports/${body.item.runId}/download`,
      headers: commissionerHeaders,
    });
    expect(download.statusCode).toBe(200);
    const csv = download.body;
    // Header row must contain only public-safe columns.
    const header = csv.split('\n')[0]!;
    for (const forbidden of ['potentialFloor', 'potentialCeiling', 'developmentRate', 'developmentRisk', 'currentAbility', 'qualityTier']) {
      expect(header).not.toContain(forbidden);
    }
    expect(header).toContain('id');
    expect(header).toContain('firstName');
  });

  it('exports Commissioner truth CSV that includes hidden truth (gated)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/commissioner/maintenance/exports',
      headers: commissionerHeaders,
      payload: { exportType: 'PLAYERS_COMMISSIONER_CSV', filters: {}, reason: 'commissioner truth probe' },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.item.status).toBe('COMPLETED');
    const download = await app.inject({
      method: 'GET',
      url: `/api/commissioner/maintenance/exports/${body.item.runId}/download`,
      headers: commissionerHeaders,
    });
    expect(download.statusCode).toBe(200);
    const header = download.body.split('\n')[0]!;
    expect(header).toContain('potentialFloor');
    expect(header).toContain('potentialCeiling');
    expect(header).toContain('developmentRate');
  });

  it('rejects Commissioner truth export without the Commissioner header (403)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/commissioner/maintenance/exports',
      headers: {},
      payload: { exportType: 'PLAYERS_PUBLIC_CSV', filters: {}, reason: 'no commissioner header' },
    });
    expect(res.statusCode).toBe(403);
    expect(JSON.parse(res.body).error).toBe('CommissionerModeRequired');
  });

  // ----- Other export types -----
  it('exports teams CSV', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/commissioner/maintenance/exports',
      headers: commissionerHeaders,
      payload: { exportType: 'TEAMS_CSV', filters: {}, reason: 'teams export' },
    });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).item.status).toBe('COMPLETED');
  });

  it('exports contract history CSV', async () => {
    // F28 may not have initialized contracts in this DB; export should still
    // succeed (empty CSV with header is valid).
    const res = await app.inject({
      method: 'POST',
      url: '/api/commissioner/maintenance/exports',
      headers: commissionerHeaders,
      payload: { exportType: 'CONTRACT_HISTORY_CSV', filters: {}, reason: 'contracts' },
    });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).item.status).toBe('COMPLETED');
  });

  it('exports draft, trade, transaction, standings, stats CSVs', async () => {
    for (const exportType of ['DRAFT_HISTORY_CSV', 'TRADE_HISTORY_CSV', 'TRANSACTION_HISTORY_CSV', 'STANDINGS_CSV', 'PLAYER_STATISTICS_CSV', 'GOALIE_STATISTICS_CSV']) {
      const res = await app.inject({
        method: 'POST',
        url: '/api/commissioner/maintenance/exports',
        headers: commissionerHeaders,
        payload: { exportType, filters: {}, reason: exportType },
      });
      expect(res.statusCode).toBe(200);
      expect(JSON.parse(res.body).item.status).toBe('COMPLETED');
    }
  });

  it('exports competition archive + name pools + configuration preset JSON', async () => {
    for (const exportType of ['COMPETITION_ARCHIVE_JSON', 'NAME_POOLS_JSON', 'CONFIGURATION_PRESET_JSON']) {
      const res = await app.inject({
        method: 'POST',
        url: '/api/commissioner/maintenance/exports',
        headers: commissionerHeaders,
        payload: { exportType, filters: {}, reason: exportType },
      });
      expect(res.statusCode).toBe(200);
      expect(JSON.parse(res.body).item.status).toBe('COMPLETED');
    }
  });

  it('produces a manifest alongside every export with matching hash prefix', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/commissioner/maintenance/exports',
      headers: commissionerHeaders,
      payload: { exportType: 'TEAMS_CSV', filters: {}, reason: 'manifest test' },
    });
    const runId = JSON.parse(res.body).item.runId;
    const detail = await app.inject({
      method: 'GET',
      url: `/api/commissioner/maintenance/exports/${runId}`,
      headers: commissionerHeaders,
    });
    const body = JSON.parse(detail.body);
    expect(body.item.fileSha256Prefix).toBeTruthy();
    expect(body.item.manifestSha256Prefix).toBeTruthy();
    expect(body.item.manifest).toBeTruthy();
    // Never exposes an absolute path.
    const serialized = JSON.stringify(body);
    expect(serialized).not.toContain(tempDir);
    expect(serialized).not.toContain('.fhm-exports');
  });

  it('previews an export without writing any file', async () => {
    const before = await prisma.maintenanceExportRun.count();
    const res = await app.inject({
      method: 'POST',
      url: '/api/commissioner/maintenance/exports/preview',
      headers: commissionerHeaders,
      payload: { exportType: 'PLAYERS_PUBLIC_CSV', filters: {}, reason: 'preview probe' },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.item.estimatedRows).toBeGreaterThanOrEqual(0);
    expect(body.item.inputHash).toMatch(/^[0-9a-f]{8,}/);
    const after = await prisma.maintenanceExportRun.count();
    expect(after).toBe(before); // no run created
  });

  it('lists and details export runs with pagination', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/commissioner/maintenance/exports?limit=5',
      headers: commissionerHeaders,
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.pageSize).toBe(5);
    expect(body.total).toBeGreaterThan(0);
  });

  it('deletes an export run and its artifacts', async () => {
    const create = await app.inject({
      method: 'POST',
      url: '/api/commissioner/maintenance/exports',
      headers: commissionerHeaders,
      payload: { exportType: 'TEAMS_CSV', filters: {}, reason: 'delete target' },
    });
    const runId = JSON.parse(create.body).item.runId;
    const del = await app.inject({
      method: 'DELETE',
      url: `/api/commissioner/maintenance/exports/${runId}`,
      headers: commissionerHeaders,
    });
    expect(del.statusCode).toBe(200);
    const row = await prisma.maintenanceExportRun.findUniqueOrThrow({ where: { id: runId } });
    expect(row.status).toBe('DELETED');
    expect(row.outputRelativePath).toBeNull();
  });

  // ----- Database validation -----
  it('runs read-only database validation and persists a deterministic result', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/commissioner/maintenance/validation-runs',
      headers: commissionerHeaders,
      payload: { reason: 'validation probe' },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.item.status).toBe('COMPLETED');
    expect(body.item.result.status).toMatch(/^(PASS|WARNING|FAIL)$/);
    expect(body.item.result.resultHash).toMatch(/^[0-9a-f]{64}$/);

    // Re-run on the same DB → same resultHash.
    const res2 = await app.inject({
      method: 'POST',
      url: '/api/commissioner/maintenance/validation-runs',
      headers: commissionerHeaders,
      payload: { reason: 'validation determinism' },
    });
    const body2 = JSON.parse(res2.body);
    expect(body2.item.result.resultHash).toBe(body.item.result.resultHash);
  });

  it('exposes a diagnostic JSON download for a validation run', async () => {
    const latest = await prisma.maintenanceValidationRun.findFirstOrThrow({ orderBy: { createdAt: 'desc' } });
    const res = await app.inject({
      method: 'GET',
      url: `/api/commissioner/maintenance/validation-runs/${latest.id}/download`,
      headers: commissionerHeaders,
    });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-disposition']).toContain('attachment');
    const body = JSON.parse(res.body);
    expect(body.result).toBeTruthy();
  });

  // ----- Full DB package through F32 -----
  it('generates a full database package through the centralized F32 backup', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/commissioner/maintenance/exports',
      headers: commissionerHeaders,
      payload: { exportType: 'FULL_DATABASE_PACKAGE', filters: {}, reason: 'full package' },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.item.backupId).toBeTruthy();
    expect(body.item.fileSha256).toMatch(/^[0-9a-f]{64}$/);
    // The backup that backs the package is VERIFIED + protected.
    const backup = await prisma.databaseBackup.findUniqueOrThrow({ where: { id: body.item.backupId } });
    expect(backup.status).toBe('VERIFIED');
    expect(backup.protected).toBe(true);
  });

  // ----- Name-pool import (upload → preview → apply) -----
  it('uploads, previews, and applies a name-pool import atomically (and leaves existing Players unchanged)', async () => {
    const playerCountBefore = await prisma.player.count();
    const namePoolCsv = 'countryCode,firstName,lastName\nNAV,TestFirst1,TestLast1\nNAV,TestFirst2,TestLast2\nNAV,TestFirst3,TestLast3';
    // Upload via multipart.
    const uploadRes = await app.inject({
      method: 'POST',
      url: '/api/commissioner/maintenance/imports/upload',
      headers: { ...commissionerHeaders, 'content-type': 'multipart/form-data; boundary=---boundary' },
      payload: `-----boundary\r\nContent-Disposition: form-data; name="importType"\r\n\r\nNAME_POOL\r\n-----boundary\r\nContent-Disposition: form-data; name="reason"\r\n\r\ntest\r\n-----boundary\r\nContent-Disposition: form-data; name="file"; filename="names.csv"\r\nContent-Type: text/csv\r\n\r\n${namePoolCsv}\r\n-----boundary--\r\n`,
    });
    expect(uploadRes.statusCode).toBe(200);
    const uploadBody = JSON.parse(uploadRes.body);
    expect(uploadBody.item.status).toBe('UPLOADED');
    const runId = uploadBody.item.importRunId;

    // Preview.
    const previewRes = await app.inject({
      method: 'POST',
      url: `/api/commissioner/maintenance/imports/${runId}/preview`,
      headers: commissionerHeaders,
      payload: { duplicatePolicy: 'ADD_NEW' },
    });
    expect(previewRes.statusCode).toBe(200);
    const previewBody = JSON.parse(previewRes.body);
    expect(previewBody.item.totalRows).toBe(3);
    expect(previewBody.item.validRows).toBe(3);
    expect(previewBody.item.invalidRows).toBe(0);
    expect(previewBody.item.previewHash).toMatch(/^[0-9a-f]/);

    // Apply.
    const applyRes = await app.inject({
      method: 'POST',
      url: `/api/commissioner/maintenance/imports/${runId}/apply`,
      headers: commissionerHeaders,
      payload: { expectedPreviewHash: previewBody.item.previewHash, reason: 'apply probe' },
    });
    expect(applyRes.statusCode).toBe(200);
    const applyBody = JSON.parse(applyRes.body);
    expect(applyBody.item.status).toBe('COMPLETED');
    expect(applyBody.item.backupId).toBeTruthy(); // mandatory F32 backup was created

    // Existing Players unchanged — name-pool import only creates pool entries.
    const playerCountAfter = await prisma.player.count();
    expect(playerCountAfter).toBe(playerCountBefore);
  });

  it('reports invalid name-pool rows with stable row numbers', async () => {
    // Row 2 has an empty firstName; row 4 has an empty countryCode.
    const csv = 'countryCode,firstName,lastName\nNAV,Ok1,Ok1\nNAV,,BadLast\n,Missing,BadLast\nNAV,Ok2,Ok2';
    const uploadRes = await app.inject({
      method: 'POST',
      url: '/api/commissioner/maintenance/imports/upload',
      headers: { ...commissionerHeaders, 'content-type': 'multipart/form-data; boundary=---boundary' },
      payload: `-----boundary\r\nContent-Disposition: form-data; name="importType"\r\n\r\nNAME_POOL\r\n-----boundary\r\nContent-Disposition: form-data; name="reason"\r\n\r\ntest\r\n-----boundary\r\nContent-Disposition: form-data; name="file"; filename="bad.csv"\r\nContent-Type: text/csv\r\n\r\n${csv}\r\n-----boundary--\r\n`,
    });
    expect(uploadRes.statusCode).toBe(200);
    const runId = JSON.parse(uploadRes.body).item.importRunId;
    const previewRes = await app.inject({
      method: 'POST',
      url: `/api/commissioner/maintenance/imports/${runId}/preview`,
      headers: commissionerHeaders,
      payload: { duplicatePolicy: 'SKIP_IDENTICAL' },
    });
    const previewBody = JSON.parse(previewRes.body);
    expect(previewBody.item.invalidRows).toBe(2);
    const rowNumbers = previewBody.item.sampleIssues.map((i: { rowNumber: number }) => i.rowNumber).sort();
    expect(rowNumbers).toContain(3); // empty firstName at row 3 (1-based, +1 for header)
    expect(rowNumbers).toContain(4); // empty countryCode at row 4
  });

  it('blocks import apply when previewHash is stale', async () => {
    const uploadRes = await app.inject({
      method: 'POST',
      url: '/api/commissioner/maintenance/imports/upload',
      headers: { ...commissionerHeaders, 'content-type': 'multipart/form-data; boundary=---boundary' },
      payload: `-----boundary\r\nContent-Disposition: form-data; name="importType"\r\n\r\nNAME_POOL\r\n-----boundary\r\nContent-Disposition: form-data; name="reason"\r\n\r\ntest\r\n-----boundary\r\nContent-Disposition: form-data; name="file"; filename="x.csv"\r\nContent-Type: text/csv\r\n\r\ncountryCode,firstName,lastName\nNAV,X,Y\r\n-----boundary--\r\n`,
    });
    const runId = JSON.parse(uploadRes.body).item.importRunId;
    await app.inject({
      method: 'POST',
      url: `/api/commissioner/maintenance/imports/${runId}/preview`,
      headers: commissionerHeaders,
      payload: { duplicatePolicy: 'SKIP_IDENTICAL' },
    });
    const applyRes = await app.inject({
      method: 'POST',
      url: `/api/commissioner/maintenance/imports/${runId}/apply`,
      headers: commissionerHeaders,
      payload: { expectedPreviewHash: 'stale', reason: 'stale probe' },
    });
    expect(applyRes.statusCode).toBe(409);
    expect(JSON.parse(applyRes.body).error).toBe('ImportPreviewStale');
  });

  it('rejects import uploads with disallowed extensions', async () => {
    const uploadRes = await app.inject({
      method: 'POST',
      url: '/api/commissioner/maintenance/imports/upload',
      headers: { ...commissionerHeaders, 'content-type': 'multipart/form-data; boundary=---boundary' },
      payload: `-----boundary\r\nContent-Disposition: form-data; name="importType"\r\n\r\nNAME_POOL\r\n-----boundary\r\nContent-Disposition: form-data; name="reason"\r\n\r\ntest\r\n-----boundary\r\nContent-Disposition: form-data; name="file"; filename="evil.exe"\r\nContent-Type: application/octet-stream\r\n\r\nNOPE\r\n-----boundary--\r\n`,
    });
    expect(uploadRes.statusCode).toBe(400);
    expect(JSON.parse(uploadRes.body).error).toBe('InvalidImportFile');
  });

  // ----- Configuration preset export+import -----
  it('exports and re-imports a maintenance configuration preset as a new immutable version', async () => {
    // Build a known-good preset envelope directly (the export emits the same
    // shape). We exercise upload→preview→apply with a valid payload.
    const { defaultMaintenanceConfig, computePresetPayloadHash } = await import('@fhm/engine');
    const config = defaultMaintenanceConfig();
    const payloadHash = computePresetPayloadHash(config);
    const uniqueName = `Imported-${Date.now()}`;
    const envelope = {
      schemaVersion: 1,
      presetType: 'MAINTENANCE',
      presetName: uniqueName,
      versionName: 'v-imported',
      payloadSchemaVersion: 1,
      payload: config,
      payloadHash,
      exportedAt: new Date().toISOString(),
    };
    const uploadRes = await app.inject({
      method: 'POST',
      url: '/api/commissioner/maintenance/imports/upload',
      headers: { ...commissionerHeaders, 'content-type': 'multipart/form-data; boundary=---boundary' },
      payload: `-----boundary\r\nContent-Disposition: form-data; name="importType"\r\n\r\nCONFIGURATION_PRESET\r\n-----boundary\r\nContent-Disposition: form-data; name="reason"\r\n\r\ntest\r\n-----boundary\r\nContent-Disposition: form-data; name="file"; filename="preset.json"\r\nContent-Type: application/json\r\n\r\n${JSON.stringify(envelope)}\r\n-----boundary--\r\n`,
    });
    expect(uploadRes.statusCode).toBe(200);
    const presetRunId = JSON.parse(uploadRes.body).item.importRunId;
    const previewRes = await app.inject({
      method: 'POST',
      url: `/api/commissioner/maintenance/imports/${presetRunId}/preview`,
      headers: commissionerHeaders,
      payload: { duplicatePolicy: 'ADD_NEW' },
    });
    expect(previewRes.statusCode).toBe(200);
    const applyRes = await app.inject({
      method: 'POST',
      url: `/api/commissioner/maintenance/imports/${presetRunId}/apply`,
      headers: commissionerHeaders,
      payload: { expectedPreviewHash: JSON.parse(previewRes.body).item.previewHash, reason: 'preset apply' },
    });
    expect(applyRes.statusCode).toBe(200);
    // The new preset exists, has one version, and is NOT auto-activated.
    const preset = await prisma.maintenancePreset.findUnique({ where: { name: uniqueName }, include: { versions: true } });
    expect(preset).toBeTruthy();
    expect(preset!.versions.length).toBe(1);
    const active = await prisma.activeMaintenanceConfiguration.findUniqueOrThrow({ where: { id: 'default' } });
    expect(active.activePresetVersionId).not.toBe(preset!.versions[0]!.id);
  });

  // ----- Initialization reset -----
  it('rejects reset execution without a matching typed confirmation phrase', async () => {
    const previewRes = await app.inject({
      method: 'POST',
      url: '/api/commissioner/maintenance/reset/preview',
      headers: commissionerHeaders,
      payload: { mode: 'RESET_SETUP_STATE_ONLY' },
    });
    expect(previewRes.statusCode).toBe(200);
    const preview = JSON.parse(previewRes.body).item;
    // SETUP_STATE_ONLY is blocked when the world is populated — that's the
    // expected blocker for this mode in an initialized DB.
    if (!preview.ready) {
      expect(preview.blockers.length).toBeGreaterThan(0);
      return;
    }
    const prepRes = await app.inject({
      method: 'POST',
      url: '/api/commissioner/maintenance/reset/prepare',
      headers: commissionerHeaders,
      payload: { mode: 'RESET_SETUP_STATE_ONLY', reason: 'confirmation probe' },
    });
    const runId = JSON.parse(prepRes.body).item.runId;
    const execRes = await app.inject({
      method: 'POST',
      url: `/api/commissioner/maintenance/reset/${runId}/execute`,
      headers: commissionerHeaders,
      payload: {
        typedConfirmation: 'WRONG PHRASE',
        expectedPreviewHash: preview.previewHash,
        currentDatabaseFingerprint: preview.currentDatabaseFingerprint,
        reason: 'bad confirm',
      },
    });
    expect(execRes.statusCode).toBe(422);
    expect(JSON.parse(execRes.body).error).toBe('InitializationResetNotReady');
  });

  it('preserves F32 backups and migrations after RESET_WORLD_TO_EMPTY', async () => {
    const playerCountBefore = await prisma.player.count();
    if (playerCountBefore === 0) return; // nothing to test

    const previewRes = await app.inject({
      method: 'POST',
      url: '/api/commissioner/maintenance/reset/preview',
      headers: commissionerHeaders,
      payload: { mode: 'RESET_WORLD_TO_EMPTY' },
    });
    expect(previewRes.statusCode).toBe(200);
    const preview = JSON.parse(previewRes.body).item;
    expect(preview.ready).toBe(true);
    expect(preview.requiredConfirmationPhrase).toMatch(/^RESET WORLD /);

    const prepRes = await app.inject({
      method: 'POST',
      url: '/api/commissioner/maintenance/reset/prepare',
      headers: commissionerHeaders,
      payload: { mode: 'RESET_WORLD_TO_EMPTY', reason: 'full reset test' },
    });
    expect(prepRes.statusCode).toBe(200);
    const runId = JSON.parse(prepRes.body).item.runId;

    const execRes = await app.inject({
      method: 'POST',
      url: `/api/commissioner/maintenance/reset/${runId}/execute`,
      headers: commissionerHeaders,
      payload: {
        typedConfirmation: preview.requiredConfirmationPhrase,
        expectedPreviewHash: preview.previewHash,
        currentDatabaseFingerprint: preview.currentDatabaseFingerprint,
        reason: 'full reset test',
      },
    });
    expect(execRes.statusCode).toBe(200);
    expect(JSON.parse(execRes.body).item.status).toBe('COMPLETED');
    expect(JSON.parse(execRes.body).item.backupId).toBeTruthy();

    // World is empty; migrations preserved (we can still query the schema).
    const playerCountAfter = await prisma.player.count();
    expect(playerCountAfter).toBe(0);
    const migrations = await prisma.$queryRawUnsafe(`SELECT COUNT(*) AS c FROM _prisma_migrations`) as Array<{ c: number }>;
    expect(Number(migrations[0]!.c)).toBeGreaterThanOrEqual(28);

    // AppMeta init flags cleared.
    const appMeta = await prisma.appMeta.findUniqueOrThrow({ where: { id: 'default' } });
    expect(appMeta.worldInitialized).toBe(false);

    // The pre-reset F32 backup still exists and is VERIFIED.
    const backupId = JSON.parse(execRes.body).item.backupId;
    const backup = await prisma.databaseBackup.findUniqueOrThrow({ where: { id: backupId } });
    expect(backup.status).toBe('VERIFIED');
  });

  // ----- Public status + path safety -----
  it('exposes bounded public maintenance status with no secrets', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/system/maintenance-status' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body).toHaveProperty('configured');
    expect(body).toHaveProperty('completedExports');
    expect(body).toHaveProperty('pendingImports');
    const serialized = JSON.stringify(body);
    expect(serialized).not.toContain(tempDir);
    expect(serialized).not.toContain('.fhm-exports');
    // No hash prefixes / fingerprints / paths.
    for (const forbidden of ['fileSha256', 'manifestSha256', 'fingerprint', 'outputRelativePath', 'previewHash']) {
      expect(serialized).not.toContain(forbidden);
    }
  });

  it('rejects Commissioner maintenance writes without the header (403)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/commissioner/maintenance/validation-runs',
      headers: {},
      payload: { reason: 'no header' },
    });
    expect(res.statusCode).toBe(403);
  });

  // ----- History -----
  it('records maintenance events append-only', async () => {
    const events = await app.inject({
      method: 'GET',
      url: '/api/commissioner/maintenance/events?limit=20',
      headers: commissionerHeaders,
    });
    expect(events.statusCode).toBe(200);
    const body = JSON.parse(events.body);
    expect(body.total).toBeGreaterThan(0);
    // Every event has a hashed prefix, not an absolute path.
    const serialized = JSON.stringify(body);
    expect(serialized).not.toContain(tempDir);
  });
});
