/**
 * F32 backup/recovery engine verifier. Runs the required deterministic
 * policy checks for config validation, retention-plan ordering, protected
 * backup handling, minimum backups, latest-per-reason, compatibility
 * aggregation, restore readiness, status transitions, manifest normalized
 * hash input, reconciliation, and no-input-mutation. A small retention
 * benchmark (100 candidate metadata entries) is included.
 * Usage: `npm run verify:backup-recovery`.
 */
import { performance } from 'node:perf_hooks';
import {
  BACKUP_CONFIG_SCHEMA_VERSION,
  BackupError,
  defaultBackupConfig,
  validateBackupConfig,
  canonicalBackupConfig,
  hashBackupConfig,
  computeDatabaseFingerprint,
  computeManifestDigest,
  computeRetentionPlan,
  isProtected as isBackupProtected,
  aggregateCompatibility,
  aggregateRestoreReadiness,
  reconcileBackupRecord,
  canTransitionBackupStatus,
  canTransitionRestoreStatus,
  canCancelRestore,
  isTerminalRestoreStatus,
  ACTIVE_RESTORE_STATUSES,
  normalizeDatabaseFingerprintInput,
  type BackupRecordInput,
  type RetentionCandidate,
  type DatabaseFingerprintInput,
  type ManifestHashInput,
} from './index.js';

const check = (v: unknown, label: string) => {
  if (!v) throw new Error(`FAIL: ${label}`);
  console.log(`PASS: ${label}`);
};

function expectThrow(fn: () => unknown, label: string, code?: string) {
  let threw = false;
  let caughtCode: string | undefined;
  try {
    fn();
  } catch (e) {
    threw = true;
    caughtCode = e instanceof BackupError ? e.code : undefined;
  }
  if (!threw || (code && caughtCode !== code)) throw new Error(`FAIL: ${label} (expected throw${code ? ` ${code}` : ''})`);
  console.log(`PASS: ${label}`);
}

function verifiedBackup(over: Partial<BackupRecordInput> = {}): BackupRecordInput {
  return {
    id: 'b1',
    status: 'VERIFIED',
    backupType: 'MANUAL',
    reasonCode: 'MANUAL',
    sourceOperationType: null,
    sourceOperationId: null,
    sourceEntityType: null,
    sourceEntityId: null,
    protected: false,
    protectionReason: null,
    fileSizeBytes: 1024,
    fileSha256: 'a'.repeat(64),
    manifestSha256: 'b'.repeat(64),
    databaseFingerprint: 'c'.repeat(48),
    schemaMigrationCount: 5,
    latestMigrationName: 'f31',
    worldSeasonIdSnapshot: 'ws1',
    currentWorldSeasonNameSnapshot: '2030/2031',
    verifiedAt: '2026-07-17T00:00:00.000Z',
    createdAt: '2026-07-17T00:00:00.000Z',
    ...over,
  };
}

function candidate(over: Partial<RetentionCandidate> = {}): RetentionCandidate {
  return {
    id: 'b1',
    status: 'VERIFIED',
    backupType: 'AUTOMATIC_OPERATION',
    reasonCode: 'MANUAL',
    protected: false,
    protectionReason: null,
    sourceOperationType: null,
    createdAt: '2026-07-17T00:00:00.000Z',
    verifiedAt: '2026-07-17T00:00:00.000Z',
    ...over,
  };
}

// 1. Config validation
{
  const cfg = defaultBackupConfig();
  const v = validateBackupConfig(JSON.parse(canonicalBackupConfig(cfg)));
  check(v.schemaVersion === BACKUP_CONFIG_SCHEMA_VERSION, 'config validation accepts default');
  expectThrow(() => {
    const bad = JSON.parse(canonicalBackupConfig(cfg)) as Record<string, unknown>;
    bad['bogus'] = true;
    validateBackupConfig(bad);
  }, 'config validation rejects unknown field', 'InvalidBackupConfiguration');
  expectThrow(() => {
    const bad = JSON.parse(JSON.stringify(cfg));
    bad.storage.directory = '../escape';
    validateBackupConfig(bad);
  }, 'config validation rejects path traversal', 'InvalidBackupConfiguration');
}

// 2. Retention-plan ordering (newest-first deterministic)
{
  const cfg = defaultBackupConfig();
  const candidates = [
    candidate({ id: 'a', createdAt: '2026-07-10T00:00:00.000Z' }),
    candidate({ id: 'b', createdAt: '2026-07-15T00:00:00.000Z' }),
    candidate({ id: 'c', createdAt: '2026-07-01T00:00:00.000Z' }),
  ];
  const plan = computeRetentionPlan({ config: cfg, candidates, referenceTime: '2026-07-17T00:00:00.000Z' });
  // The newest ('b') is never pruned under default minimums.
  check(!plan.pruneIds.includes('b'), 'retention keeps newest backup');
}

// 3. Protected backup handling
{
  const cfg = defaultBackupConfig();
  cfg.retention.maximumBackups = 1;
  const candidates = [
    candidate({ id: 'protected', protected: true, createdAt: '2020-01-01T00:00:00.000Z' }),
    candidate({ id: 'fresh', createdAt: '2026-07-17T00:00:00.000Z' }),
  ];
  const plan = computeRetentionPlan({ config: cfg, candidates, referenceTime: '2026-07-17T00:00:00.000Z' });
  check(!plan.pruneIds.includes('protected'), 'retention never prunes protected backup');
  check(plan.protectedIds.includes('protected'), 'retention reports protected ids');
}

// 4. Minimum backups enforced
{
  const cfg = defaultBackupConfig();
  cfg.retention.maximumBackups = 2;
  cfg.retention.minimumBackupsToKeep = 2;
  cfg.retention.keepLatestPerReason = 0;
  const candidates = Array.from({ length: 5 }, (_, i) =>
    candidate({ id: `b${i}`, reasonCode: 'OTHER', createdAt: `2026-07-1${i}T00:00:00.000Z` }),
  );
  const plan = computeRetentionPlan({ config: cfg, candidates, referenceTime: '2026-07-17T00:00:00.000Z' });
  const surviving = candidates.filter((c) => !plan.pruneIds.includes(c.id));
  check(surviving.length >= 2, 'retention respects minimumBackupsToKeep');
}

// 5. Latest-per-reason kept
{
  const cfg = defaultBackupConfig();
  cfg.retention.keepLatestPerReason = 1;
  cfg.retention.maximumAgeDays = 1;
  cfg.retention.minimumBackupsToKeep = 0;
  const candidates = [
    candidate({ id: 'dev-old', reasonCode: 'PLAYER_DEVELOPMENT', createdAt: '2020-01-01T00:00:00.000Z' }),
    candidate({ id: 'dev-new', reasonCode: 'PLAYER_DEVELOPMENT', createdAt: '2026-07-16T00:00:00.000Z' }),
    candidate({ id: 'youth-new', reasonCode: 'YOUTH_GENERATION', createdAt: '2026-07-16T00:00:00.000Z' }),
  ];
  const plan = computeRetentionPlan({ config: cfg, candidates, referenceTime: '2026-07-17T00:00:00.000Z' });
  check(!plan.pruneIds.includes('dev-new'), 'retention keeps latest per reason (development)');
  check(!plan.pruneIds.includes('youth-new'), 'retention keeps latest per reason (youth)');
}

// 6. Compatibility aggregation
{
  const ok = aggregateCompatibility({
    backup: verifiedBackup(),
    fileExists: true,
    fileHashMatches: true,
    manifestHashMatches: true,
    integrityOk: true,
    backupMigrationNames: ['f1', 'f2'],
    activeMigrationNames: ['f1', 'f2', 'f3'],
    activeBackend: 'sqlite',
    pathInsideRoot: true,
    sourceEqualsActive: false,
    anotherRestoreActive: false,
  });
  check(ok.compatible, 'compatibility returns compatible when all checks pass');
  const blocked = aggregateCompatibility({
    backup: verifiedBackup(),
    fileExists: false,
    fileHashMatches: false,
    manifestHashMatches: true,
    integrityOk: true,
    backupMigrationNames: ['f1'],
    activeMigrationNames: ['f1'],
    activeBackend: 'sqlite',
    pathInsideRoot: true,
    sourceEqualsActive: false,
    anotherRestoreActive: false,
  });
  check(!blocked.compatible && blocked.severity === 'BLOCKER', 'compatibility blocks on missing file');
}

// 7. Restore readiness
{
  const cfg = defaultBackupConfig();
  const compat = aggregateCompatibility({
    backup: verifiedBackup(),
    fileExists: true,
    fileHashMatches: true,
    manifestHashMatches: true,
    integrityOk: true,
    backupMigrationNames: ['f1', 'f2'],
    activeMigrationNames: ['f1', 'f2'],
    activeBackend: 'sqlite',
    pathInsideRoot: true,
    sourceEqualsActive: false,
    anotherRestoreActive: false,
  });
  const ready = aggregateRestoreReadiness({
    config: cfg,
    compatibility: compat,
    preRestoreBackupCreated: true,
    conflictingWorldOperationRunning: false,
    currentFingerprintMatchesExpectation: true,
    backupFingerprintRecomputes: true,
  });
  check(ready.ready, 'restore readiness is ready when blockers clear');
}

// 8. Status transitions
{
  check(canTransitionBackupStatus('CREATING', 'VERIFYING'), 'backup transition CREATING->VERIFYING');
  check(!canTransitionBackupStatus('FAILED', 'VERIFIED'), 'backup forbids FAILED->VERIFIED');
  check(canTransitionRestoreStatus('PREPARED', 'WAITING_FOR_RESTART'), 'restore transition PREPARED->WAITING');
  check(canCancelRestore('PREPARED') && !canCancelRestore('RUNNING'), 'restore cancel rules');
  check(isTerminalRestoreStatus('COMPLETED') && ACTIVE_RESTORE_STATUSES.includes('PREPARED'), 'restore terminal/active sets');
}

// 9. Manifest normalized hash input (deterministic + input-shape stable)
{
  const db: DatabaseFingerprintInput = {
    migrationNames: ['f1', 'f2'],
    userVersion: 2,
    appMeta: { worldInitialized: true, worldDatasetId: 'd1', worldSchemaVersion: 5 },
    currentWorldSeason: { id: 'ws1', label: '2030/2031', startYear: 2030, endYear: 2031 },
    tableCounts: [{ table: 'Player', count: 10 }, { table: 'Team', count: 5 }],
  };
  const manifest: ManifestHashInput = {
    manifestSchemaVersion: 1,
    backupType: 'MANUAL',
    reasonCode: 'MANUAL',
    sourceDatabaseFileName: 'dev.db',
    sourceDatabaseSizeBytes: 1024,
    backupFileName: 'fhm-x.sqlite',
    backupSizeBytes: 1024,
    backupSha256: 'a'.repeat(64),
    database: db,
    configuration: { versionId: 'v1', hash: 'h'.repeat(64) },
    sourceOperation: { type: null, id: null },
  };
  const d1 = computeManifestDigest(manifest);
  const d2 = computeManifestDigest(manifest);
  check(d1 === d2, 'manifest digest is deterministic');
  // Table-count order independence.
  const reordered: ManifestHashInput = {
    ...manifest,
    database: { ...db, tableCounts: [...db.tableCounts].reverse() },
  };
  check(computeManifestDigest(reordered) === d1, 'manifest digest stable across table-count order');
}

// 10. Reconciliation
{
  check(reconcileBackupRecord({ config: defaultBackupConfig(), backup: verifiedBackup() }).ok, 'reconciliation passes complete VERIFIED record');
  check(
    !reconcileBackupRecord({ config: defaultBackupConfig(), backup: verifiedBackup({ fileSha256: null }) }).ok,
    'reconciliation flags missing file hash',
  );
  check(isBackupProtected(candidate({ backupType: 'MANUAL' }), defaultBackupConfig()), 'policy protects MANUAL backups');
}

// 11. No input mutation
{
  const input: DatabaseFingerprintInput = {
    migrationNames: ['f1', 'f2'],
    userVersion: 2,
    appMeta: { worldInitialized: true, worldDatasetId: 'd1', worldSchemaVersion: 5 },
    currentWorldSeason: { id: 'ws1', label: '2030/2031', startYear: 2030, endYear: 2031 },
    tableCounts: [{ table: 'Player', count: 10 }],
  };
  const snapshot = JSON.stringify(input);
  computeDatabaseFingerprint(input);
  normalizeDatabaseFingerprintInput(input);
  check(JSON.stringify(input) === snapshot, 'hashing helpers do not mutate input');
}

// Determinism: config hash
{
  check(hashBackupConfig(defaultBackupConfig()) === hashBackupConfig(defaultBackupConfig()), 'config hash is deterministic');
}

// Benchmark: retention scan over 100 backup metadata entries.
{
  const cfg = defaultBackupConfig();
  const candidates: RetentionCandidate[] = Array.from({ length: 100 }, (_, i) =>
    candidate({
      id: `b${i}`,
      reasonCode: (['MANUAL', 'PLAYER_DEVELOPMENT', 'YOUTH_GENERATION', 'DRAFT_START', 'OTHER'] as const)[i % 5]!,
      createdAt: new Date(Date.UTC(2026, 6, 1) - i * 86_400_000).toISOString(),
    }),
  );
  const start = performance.now();
  const plan = computeRetentionPlan({ config: cfg, candidates, referenceTime: '2026-07-17T00:00:00.000Z' });
  const ms = performance.now() - start;
  check(plan.pruneIds.length + plan.keepIds.length > 0, 'retention benchmark produced a plan');
  console.log(`PASS: retention benchmark (100 entries) ~${ms.toFixed(1)} ms`);
}

console.log('Backup & recovery engine verifier complete.');
