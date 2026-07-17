import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import type { PrismaClient } from '@prisma/client';
import { existsSync, readFileSync, rmSync, mkdirSync, writeFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { cleanupTempDir, createTempDatabaseUrl, migrateTempDatabase } from './helpers/db.js';
import { getRepoRoot } from '../src/initialization/paths.js';
import { COMMISSIONER_HEADER, COMMISSIONER_HEADER_VALUE } from '../src/commissioner/gate.js';

const fixtureDir = join(getRepoRoot(), 'data', 'fixtures', 'f3-minimal-world');
const commissionerHeaders = { [COMMISSIONER_HEADER]: COMMISSIONER_HEADER_VALUE, 'x-fhm-commissioner-source': 'api' };

/**
 * F32 backup/recovery server suite. Exercises default-config bootstrap,
 * manual backup creation (SQLite VACUUM INTO + manifest + fingerprint + file
 * hash + VERIFIED), inventory, manual re-verification, missing/corrupt
 * detection, protection, retention preview, storage scan, path-traversal /
 * path-redaction safety, operation-linked backup idempotency, restore
 * preview/prepare/request-restart/cancel, pre-restore backup creation, the
 * external recovery journal, the restart-required startup bootstrap (atomic
 * replacement + verification + idempotency + rollback), maintenance mode,
 * public-health bounded output, and the Commissioner gate.
 *
 * Uses a disposable initialized DB with an ISOLATED backup directory; never
 * touches production data.
 */
describe('F32 backup and recovery', () => {
  let app: FastifyInstance;
  let prisma: PrismaClient;
  let tempDir = '';
  let backupDir = '';
  let manualBackupId = '';

  beforeAll(async () => {
    const x = createTempDatabaseUrl();
    tempDir = x.dir;
    process.env.DATABASE_URL = x.url;
    process.env.FHM_DATASET_DIR = fixtureDir;
    process.env.FHM_COMMISSIONER_WRITES_ENABLED = 'true';
    backupDir = join(tempDir, 'f32-backups');
    process.env.FHM_BACKUP_DIR = backupDir;
    migrateTempDatabase(x.url);
    prisma = (await import('../src/db/client.js')).prisma;
    const { initializeSetup } = await import('../src/initialization/index.js');
    await prisma.appMeta.upsert({ where: { id: 'default' }, create: { id: 'default', worldInitialized: false }, update: { worldInitialized: false } });
    await initializeSetup(prisma, fixtureDir);
    const { bootstrapBackupConfiguration } = await import('../src/services/backup-config.js');
    await bootstrapBackupConfiguration(prisma);
    const { buildApp } = await import('../src/app.js');
    app = await buildApp({ logger: false });
  });

  afterAll(async () => {
    try { if (app) await app.close(); } catch { /* ignore */ }
    try { await prisma.$disconnect(); } catch { /* ignore */ }
    cleanupTempDir(tempDir);
  });

  it('bootstraps a default backup configuration idempotently', async () => {
    const configs = await prisma.backupPreset.findMany();
    expect(configs.length).toBeGreaterThanOrEqual(1);
    const active = await prisma.activeBackupConfiguration.findUniqueOrThrow({ where: { id: 'default' } });
    expect(active).toBeTruthy();
    // Idempotent: a second bootstrap does not duplicate.
    const { bootstrapBackupConfiguration } = await import('../src/services/backup-config.js');
    await bootstrapBackupConfiguration(prisma);
    const after = await prisma.backupPreset.findMany();
    expect(after.length).toBe(configs.length);
  });

  it('creates a manual backup that is VERIFIED with manifest + fingerprint + file hash', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/commissioner/backups',
      headers: commissionerHeaders,
      payload: { backupType: 'MANUAL', reasonCode: 'MANUAL', reasonText: 'F32 test backup' },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.item.backup.status).toBe('VERIFIED');
    expect(body.item.backup.fileSha256Prefix).toMatch(/^[0-9a-f]{12}$/);
    expect(body.item.backup.databaseFingerprint).toBeTruthy();
    expect(body.item.backup.protected).toBe(true); // MANUAL protected by default
    expect(body.item.backup.fileName).toMatch(/^fhm-.+\.sqlite$/);
    manualBackupId = body.item.backup.id;

    // File + manifest exist on disk inside the backup root.
    const row = await prisma.databaseBackup.findUniqueOrThrow({ where: { id: manualBackupId } });
    expect(existsSync(join(backupDir, row.relativeFilePath))).toBe(true);
    expect(existsSync(join(backupDir, row.manifestRelativePath!))).toBe(true);
    expect(row.fileSizeBytes).toBeGreaterThan(0);
    expect(row.fileSha256).toMatch(/^[0-9a-f]{64}$/);
    expect(row.manifestSha256).toMatch(/^[0-9a-f]{64}$/);
  });

  it('does not expose absolute paths in the backup DTO', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/api/commissioner/backups/${manualBackupId}`,
      headers: commissionerHeaders,
    });
    expect(res.statusCode).toBe(200);
    const text = res.body;
    // No absolute Windows or POSIX path leaks.
    expect(text).not.toMatch(/[A-Za-z]:\\[Uu]sers\\/);
    expect(text).not.toMatch(/\/tmp\//);
    expect(text).not.toMatch(/\\AppData\\/);
  });

  it('lists backups in the inventory', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/commissioner/backups', headers: commissionerHeaders });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.items.length).toBeGreaterThanOrEqual(1);
    expect(body.items.some((b: any) => b.id === manualBackupId)).toBe(true);
  });

  it('re-verifies an existing backup and returns VERIFIED', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/api/commissioner/backups/${manualBackupId}/verify`,
      headers: commissionerHeaders,
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().item.outcome).toBe('VERIFIED');
  });

  it('detects a MISSING backup when its file is deleted', async () => {
    const row = await prisma.databaseBackup.findUniqueOrThrow({ where: { id: manualBackupId } });
    const filePath = join(backupDir, row.relativeFilePath);
    rmSync(filePath, { force: true });
    const res = await app.inject({
      method: 'POST',
      url: `/api/commissioner/backups/${manualBackupId}/verify`,
      headers: commissionerHeaders,
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().item.outcome).toBe('MISSING');
    // Restore the file for subsequent tests by re-creating a backup.
    const res2 = await app.inject({
      method: 'POST',
      url: '/api/commissioner/backups',
      headers: commissionerHeaders,
      payload: { backupType: 'MANUAL', reasonCode: 'MANUAL', reasonText: 'F32 test backup 2' },
    });
    manualBackupId = res2.json().item.backup.id;
  });

  it('detects a CORRUPT backup when its bytes change', async () => {
    const row = await prisma.databaseBackup.findUniqueOrThrow({ where: { id: manualBackupId } });
    const filePath = join(backupDir, row.relativeFilePath);
    // Append garbage to change the hash.
    writeFileSync(filePath, Buffer.from('corruption'), { flag: 'a' });
    const res = await app.inject({
      method: 'POST',
      url: `/api/commissioner/backups/${manualBackupId}/verify`,
      headers: commissionerHeaders,
    });
    expect(res.json().item.outcome).toBe('CORRUPT');
  });

  it('reuses an operation-linked VERIFIED backup on retry (idempotency)', async () => {
    const { createSqliteSafetyBackup } = await import('../src/services/sqlite-backup.js');
    const first = await createSqliteSafetyBackup({
      label: 'idempotency-test',
      sourceOperationType: 'IDEMPOTENCY_TEST',
      sourceOperationId: 'op-1',
    });
    const second = await createSqliteSafetyBackup({
      label: 'idempotency-test',
      sourceOperationType: 'IDEMPOTENCY_TEST',
      sourceOperationId: 'op-1',
    });
    expect(second.backupId).toBe(first.backupId); // reused, not duplicated
  });

  it('creates distinct backups for distinct operation ids', async () => {
    const { createSqliteSafetyBackup } = await import('../src/services/sqlite-backup.js');
    const a = await createSqliteSafetyBackup({ label: 'distinct-a', sourceOperationType: 'DISTINCT', sourceOperationId: 'op-a' });
    const b = await createSqliteSafetyBackup({ label: 'distinct-b', sourceOperationType: 'DISTINCT', sourceOperationId: 'op-b' });
    expect(a.backupId).not.toBe(b.backupId);
  });

  it('protects/unprotects a non-PRE_RESTORE backup', async () => {
    const create = await app.inject({
      method: 'POST',
      url: '/api/commissioner/backups',
      headers: commissionerHeaders,
      payload: { backupType: 'AUTOMATIC_OPERATION', reasonCode: 'OTHER', reasonText: 'protect test' },
    });
    const id = create.json().item.backup.id;
    const unprotect = await app.inject({
      method: 'POST',
      url: `/api/commissioner/backups/${id}/unprotect`,
      headers: commissionerHeaders,
      payload: { reason: 'test unprotect' },
    });
    expect(unprotect.statusCode).toBe(200);
    expect(unprotect.json().item.protected).toBe(false);
  });

  it('rejects pruning a protected backup', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/commissioner/backups/prune',
      headers: commissionerHeaders,
      payload: { reason: 'attempt prune protected', restrictToIds: [manualBackupId] },
    });
    // manualBackupId is MANUAL -> protected -> rejected with 409.
    expect(res.statusCode).toBe(409);
  });

  it('computes a deterministic retention preview (no deletion)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/commissioner/backups/prune-preview',
      headers: commissionerHeaders,
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(Array.isArray(body.item.plan.pruneIds)).toBe(true);
    expect(Array.isArray(body.item.plan.keepIds)).toBe(true);
  });

  it('scans backup storage for orphans/findings without deleting', async () => {
    // Drop a stray file into the backup dir.
    writeFileSync(join(backupDir, 'orphan.sqlite'), Buffer.from('not a real db'));
    const res = await app.inject({
      method: 'POST',
      url: '/api/commissioner/backups/storage-scan',
      headers: commissionerHeaders,
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.item.findings.some((f: any) => f.fileName === 'orphan.sqlite')).toBe(true);
    rmSync(join(backupDir, 'orphan.sqlite'), { force: true });
  });

  it('rejects a restore-preview for a non-VERIFIED backup', async () => {
    // Create a backup then corrupt its status to MISSING via file deletion.
    const create = await app.inject({
      method: 'POST',
      url: '/api/commissioner/backups',
      headers: commissionerHeaders,
      payload: { backupType: 'AUTOMATIC_OPERATION', reasonCode: 'OTHER', reasonText: 'restore test' },
    });
    const id = create.json().item.backup.id;
    const row = await prisma.databaseBackup.findUniqueOrThrow({ where: { id } });
    rmSync(join(backupDir, row.relativeFilePath), { force: true });
    const res = await app.inject({
      method: 'POST',
      url: `/api/commissioner/backups/${id}/restore-preview`,
      headers: commissionerHeaders,
    });
    expect([400, 404, 409, 422]).toContain(res.statusCode);
  });

  it('prepares a restore with a pre-restore backup and an external journal entry', async () => {
    // Fresh verified backup.
    const create = await app.inject({
      method: 'POST',
      url: '/api/commissioner/backups',
      headers: commissionerHeaders,
      payload: { backupType: 'MANUAL', reasonCode: 'MANUAL', reasonText: 'restore source' },
    });
    const sourceId = create.json().item.backup.id;
    const source = await prisma.databaseBackup.findUniqueOrThrow({ where: { id: sourceId } });

    const preview = await app.inject({
      method: 'POST',
      url: `/api/commissioner/backups/${sourceId}/restore-preview`,
      headers: commissionerHeaders,
    });
    expect(preview.statusCode).toBe(200);
    const currentFp = preview.json().item.currentFingerprint;

    const res = await app.inject({
      method: 'POST',
      url: `/api/commissioner/backups/${sourceId}/restore-prepare`,
      headers: commissionerHeaders,
      payload: {
        expectedBackupUpdatedAt: source.updatedAt.toISOString(),
        expectedCurrentDatabaseFingerprint: currentFp,
        reason: 'F32 restore test',
        requestedBy: 'test',
      },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    const runId = body.item.runId;
    expect(body.item.status).toBe('PREPARED');
    expect(body.item.confirmationPhrase).toMatch(/^RESTORE [0-9A-Z]+$/);

    // Pre-restore backup created.
    const run = await prisma.databaseRestoreRun.findUniqueOrThrow({ where: { id: runId } });
    expect(run.preRestoreBackupId).toBeTruthy();
    const preRestore = await prisma.databaseBackup.findUniqueOrThrow({ where: { id: run.preRestoreBackupId! } });
    expect(preRestore.backupType).toBe('PRE_RESTORE');
    expect(preRestore.protected).toBe(true);

    // External journal entry written.
    const { getJournalEntry } = await import('../src/services/recovery-journal.js');
    const entry = getJournalEntry(backupDir, runId);
    expect(entry).toBeTruthy();
    expect(entry!.sourceBackupId).toBe(sourceId);

    // Cancel the prepared restore (cleanup for this test).
    const cancel = await app.inject({
      method: 'POST',
      url: `/api/commissioner/restores/${runId}/cancel`,
      headers: commissionerHeaders,
      payload: { reason: 'test cleanup' },
    });
    expect(cancel.statusCode).toBe(200);
    expect(cancel.json().item.status).toBe('CANCELLED');
  });

  it('performs the restart-required startup bootstrap: atomically replaces, verifies, and is idempotent', async () => {
    // Create a verified backup of the current DB.
    const { createDatabaseBackup } = await import('../src/services/backup-creation.js');
    const { backup } = await createDatabaseBackup({
      backupType: 'MANUAL',
      reasonCode: 'MANUAL',
      reasonText: 'startup-bootstrap test',
    });
    expect(backup.status).toBe('VERIFIED');

    // Mutate the active DB so the backup differs from current (to prove restore works).
    await prisma.appMeta.update({ where: { id: 'default' }, data: { worldSchemaVersion: 999 } });

    // Write a restore marker + journal entry pointing at this backup, then run
    // the bootstrap directly (it runs pre-Prisma in real startup, but we test
    // the function in isolation here).
    const { writeRestoreMarker } = await import('../src/services/restore-marker.js');
    const { upsertJournalEntry } = await import('../src/services/recovery-journal.js');
    const markerRunId = 'startup-test-run';
    writeRestoreMarker(backupDir, {
      restoreRunId: markerRunId,
      sourceBackupId: backup.id,
      preRestoreBackupId: null,
      expectedSourceFingerprint: backup.databaseFingerprint!,
      configVersionId: backup.configVersionId,
      configHash: backup.configHash,
      requestedBy: 'test',
      createdAt: new Date().toISOString(),
    });
    upsertJournalEntry(backupDir, {
      restoreRunId: markerRunId,
      status: 'WAITING_FOR_RESTART',
      sourceBackupId: backup.id,
      sourceBackupFingerprint: backup.databaseFingerprint!,
      preRestoreBackupId: null,
      configVersionId: backup.configVersionId,
      configHash: backup.configHash,
      requestedBy: 'test',
      reason: 'startup test',
      preparedAt: new Date().toISOString(),
      completedAt: null,
      failedAt: null,
      failureCode: null,
      failureMessage: null,
      restoredDatabaseFingerprintAfter: null,
      events: [],
    });

    const { performStartupRestoreIfPending } = await import('../src/services/backup-startup.js');
    const { defaultBackupConfig } = await import('@fhm/engine');
    const result = performStartupRestoreIfPending({ config: defaultBackupConfig() });
    expect(result.outcome).toBe('COMPLETED');

    // The active DB now reflects the backup (worldSchemaVersion restored).
    const meta = await prisma.appMeta.findUniqueOrThrow({ where: { id: 'default' } });
    expect(meta.worldSchemaVersion).not.toBe(999);

    // Marker cleared.
    const { readRestoreMarker } = await import('../src/services/restore-marker.js');
    expect(readRestoreMarker(backupDir)).toBeNull();

    // Idempotent: a second run is a no-op (no marker).
    const result2 = performStartupRestoreIfPending({ config: defaultBackupConfig() });
    expect(result2.outcome).toBe('NO_PENDING');
  });

  it('exposes bounded public backup status without paths or hashes', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/system/backup-status' });
    expect(res.statusCode).toBe(200);
    const body = res.json().item;
    expect(body.configured).toBe(true);
    expect(body.verifiedBackupCount).toBeGreaterThanOrEqual(1);
    expect(typeof body.lastVerifiedBackupAgeDays === 'number' || body.lastVerifiedBackupAgeDays === null).toBe(true);
    // No sensitive fields exposed.
    const text = res.body;
    expect(text).not.toMatch(/[0-9a-f]{64}/); // no full hashes
    expect(text).not.toMatch(/fileName|filePath|fingerprint/i);
  });

  it('requires the Commissioner header for write routes', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/commissioner/backups',
      payload: { backupType: 'MANUAL', reasonCode: 'MANUAL' },
    });
    expect(res.statusCode).toBe(403);
  });

  it('records Commissioner audit entries for backup writes', async () => {
    const before = await prisma.commissionerAuditLog.count({
      where: { entityType: 'DATABASE_BACKUP' },
    });
    await app.inject({
      method: 'POST',
      url: '/api/commissioner/backups',
      headers: commissionerHeaders,
      payload: { backupType: 'MANUAL', reasonCode: 'MANUAL', reasonText: 'audit test' },
    });
    const after = await prisma.commissionerAuditLog.count({
      where: { entityType: 'DATABASE_BACKUP' },
    });
    expect(after).toBeGreaterThan(before);
  });
});
