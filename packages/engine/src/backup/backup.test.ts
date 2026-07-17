import { describe, it, expect } from 'vitest';
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
  type BackupConfig,
  type BackupRecordInput,
  type RetentionCandidate,
  type DatabaseFingerprintInput,
  type ManifestHashInput,
} from './index.js';

function sampleConfig(): BackupConfig {
  return defaultBackupConfig();
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

function fingerprintInput(over: Partial<DatabaseFingerprintInput> = {}): DatabaseFingerprintInput {
  return {
    migrationNames: ['f1', 'f2'],
    userVersion: 2,
    appMeta: { worldInitialized: true, worldDatasetId: 'd1', worldSchemaVersion: 5 },
    currentWorldSeason: { id: 'ws1', label: '2030/2031', startYear: 2030, endYear: 2031 },
    tableCounts: [{ table: 'Player', count: 100 }, { table: 'Team', count: 10 }],
    ...over,
  };
}

describe('backup config validation', () => {
  it('accepts the default config and round-trips it', () => {
    const cfg = defaultBackupConfig();
    const validated = validateBackupConfig(JSON.parse(canonicalBackupConfig(cfg)));
    expect(validated.schemaVersion).toBe(BACKUP_CONFIG_SCHEMA_VERSION);
    expect(validated.creation.strategy).toBe('VACUUM_INTO');
  });

  it('rejects unknown fields', () => {
    const bad = JSON.parse(canonicalBackupConfig(defaultBackupConfig())) as Record<string, unknown>;
    bad['bogus'] = true;
    expect(() => validateBackupConfig(bad)).toThrow(BackupError);
  });

  it('rejects path traversal in storage.directory', () => {
    const cfg = defaultBackupConfig();
    cfg.storage.directory = '../escape';
    expect(() => validateBackupConfig(JSON.parse(JSON.stringify(cfg)))).toThrow(BackupError);
  });

  it('rejects an absolute directory when allowAbsoluteDirectory is false', () => {
    const cfg = defaultBackupConfig();
    cfg.storage.allowAbsoluteDirectory = false;
    cfg.storage.directory = '/var/backups';
    expect(() => validateBackupConfig(JSON.parse(JSON.stringify(cfg)))).toThrow(BackupError);
  });

  it('rejects an invalid filename pattern (missing token)', () => {
    const cfg = defaultBackupConfig();
    cfg.creation.filenamePattern = 'fhm-{timestamp}.sqlite';
    expect(() => validateBackupConfig(JSON.parse(JSON.stringify(cfg)))).toThrow(BackupError);
  });

  it('rejects a non-.sqlite filename pattern', () => {
    const cfg = defaultBackupConfig();
    cfg.creation.filenamePattern = 'fhm-{timestamp}-{reason}-{shortHash}.db';
    expect(() => validateBackupConfig(JSON.parse(JSON.stringify(cfg)))).toThrow(BackupError);
  });

  it('rejects a bad strategy', () => {
    const bad = JSON.parse(JSON.stringify(defaultBackupConfig()));
    bad.creation.strategy = 'COPY_FILE';
    expect(() => validateBackupConfig(bad)).toThrow(BackupError);
  });

  it('rejects minimumBackupsToKeep > maximumBackups', () => {
    const cfg = defaultBackupConfig();
    cfg.retention.minimumBackupsToKeep = cfg.retention.maximumBackups + 1;
    expect(() => validateBackupConfig(JSON.parse(JSON.stringify(cfg)))).toThrow(BackupError);
  });

  it('rejects wrong schemaVersion', () => {
    const cfg = defaultBackupConfig();
    cfg.schemaVersion = 999 as 1;
    expect(() => validateBackupConfig(JSON.parse(JSON.stringify(cfg)))).toThrow(BackupError);
  });

  it('config hash is deterministic and stable', () => {
    const a = hashBackupConfig(defaultBackupConfig());
    const b = hashBackupConfig(defaultBackupConfig());
    expect(a).toBe(b);
    expect(a).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe('database fingerprint', () => {
  it('is deterministic for identical input', () => {
    expect(computeDatabaseFingerprint(fingerprintInput())).toBe(computeDatabaseFingerprint(fingerprintInput()));
  });

  it('excludes table-count order from the fingerprint (sorted)', () => {
    const a = fingerprintInput({ tableCounts: [{ table: 'Player', count: 100 }, { table: 'Team', count: 10 }] });
    const b = fingerprintInput({ tableCounts: [{ table: 'Team', count: 10 }, { table: 'Player', count: 100 }] });
    expect(computeDatabaseFingerprint(a)).toBe(computeDatabaseFingerprint(b));
  });

  it('changes when migration history changes', () => {
    const a = fingerprintInput();
    const b = fingerprintInput({ migrationNames: ['f1', 'f2', 'f3'] });
    expect(computeDatabaseFingerprint(a)).not.toBe(computeDatabaseFingerprint(b));
  });

  it('changes when current WorldSeason changes', () => {
    const a = fingerprintInput();
    const b = fingerprintInput({ currentWorldSeason: { id: 'ws2', label: '2031/2032', startYear: 2031, endYear: 2032 } });
    expect(computeDatabaseFingerprint(a)).not.toBe(computeDatabaseFingerprint(b));
  });
});

describe('manifest digest', () => {
  function manifestInput(): ManifestHashInput {
    return {
      manifestSchemaVersion: 1,
      backupType: 'MANUAL',
      reasonCode: 'MANUAL',
      sourceDatabaseFileName: 'dev.db',
      sourceDatabaseSizeBytes: 1024,
      backupFileName: 'fhm-x.sqlite',
      backupSizeBytes: 1024,
      backupSha256: 'a'.repeat(64),
      database: fingerprintInput(),
      configuration: { versionId: 'v1', hash: 'h'.repeat(64) },
      sourceOperation: { type: null, id: null },
    };
  }
  it('is deterministic', () => {
    expect(computeManifestDigest(manifestInput())).toBe(computeManifestDigest(manifestInput()));
  });
});

describe('retention plan', () => {
  const NOW = '2026-07-17T00:00:00.000Z';

  it('keeps protected backups (never prunes them)', () => {
    const cfg = defaultBackupConfig();
    cfg.retention.maximumBackups = 1;
    const candidates = [
      candidate({ id: 'old-protected', protected: true, createdAt: '2020-01-01T00:00:00.000Z' }),
      candidate({ id: 'new', createdAt: NOW }),
    ];
    const plan = computeRetentionPlan({ config: cfg, candidates, referenceTime: NOW });
    expect(plan.pruneIds).not.toContain('old-protected');
    expect(plan.protectedIds).toContain('old-protected');
  });

  it('respects minimumBackupsToKeep', () => {
    const cfg = defaultBackupConfig();
    cfg.retention.maximumBackups = 3;
    cfg.retention.minimumBackupsToKeep = 3;
    cfg.retention.keepLatestPerReason = 0;
    const candidates = Array.from({ length: 5 }, (_, i) =>
      candidate({ id: `b${i}`, reasonCode: 'OTHER', createdAt: `2026-07-1${i}T00:00:00.000Z` }),
    );
    const plan = computeRetentionPlan({ config: cfg, candidates, referenceTime: NOW });
    expect(plan.pruneIds.length + plan.keepIds.filter((id) => candidates.some((c) => c.id === id && c.status === 'VERIFIED')).length)
      .toBeGreaterThanOrEqual(5);
    // At least 3 verified survive.
    const survivingVerified = candidates.filter((c) => c.status === 'VERIFIED' && !plan.pruneIds.includes(c.id));
    expect(survivingVerified.length).toBeGreaterThanOrEqual(3);
  });

  it('keeps the latest N per reason', () => {
    const cfg = defaultBackupConfig();
    cfg.retention.maximumBackups = 100;
    cfg.retention.keepLatestPerReason = 2;
    cfg.retention.maximumAgeDays = 1;
    const candidates = Array.from({ length: 4 }, (_, i) =>
      candidate({ id: `b${i}`, reasonCode: 'PLAYER_DEVELOPMENT', createdAt: `2020-01-0${i + 1}T00:00:00.000Z` }),
    );
    const plan = computeRetentionPlan({ config: cfg, candidates, referenceTime: NOW });
    expect(plan.keepIds).toContain('b3');
    expect(plan.keepIds).toContain('b2');
  });

  it('prunes by age (non-protected only)', () => {
    const cfg = defaultBackupConfig();
    cfg.retention.maximumAgeDays = 10;
    cfg.retention.minimumBackupsToKeep = 0;
    cfg.retention.keepLatestPerReason = 0;
    // Two eligible backups so the "only verified" guard does not save the old one.
    const old = candidate({ id: 'old', createdAt: '2020-01-01T00:00:00.000Z' });
    const fresh = candidate({ id: 'fresh', createdAt: NOW });
    const plan = computeRetentionPlan({ config: cfg, candidates: [old, fresh], referenceTime: NOW });
    expect(plan.pruneIds).toContain('old');
    expect(plan.pruneIds).not.toContain('fresh');
  });

  it('never deletes the only eligible verified backup', () => {
    const cfg = defaultBackupConfig();
    cfg.retention.maximumAgeDays = 1;
    cfg.retention.minimumBackupsToKeep = 0;
    cfg.retention.keepLatestPerReason = 0;
    const only = candidate({ id: 'only', createdAt: '2020-01-01T00:00:00.000Z' });
    const plan = computeRetentionPlan({ config: cfg, candidates: [only], referenceTime: NOW });
    expect(plan.pruneIds).not.toContain('only');
  });

  it('is deterministic for identical input', () => {
    const cfg = defaultBackupConfig();
    const candidates = [candidate({ id: 'a' }), candidate({ id: 'b' })];
    const p1 = computeRetentionPlan({ config: cfg, candidates, referenceTime: NOW });
    const p2 = computeRetentionPlan({ config: cfg, candidates, referenceTime: NOW });
    expect(p1).toEqual(p2);
  });

  it('isProtected honours policy flags', () => {
    const cfg = defaultBackupConfig();
    expect(isBackupProtected(candidate({ backupType: 'MANUAL' }), cfg)).toBe(true);
    expect(isBackupProtected(candidate({ backupType: 'PRE_RESTORE' }), cfg)).toBe(true);
    expect(isBackupProtected(candidate({ backupType: 'AUTOMATIC_OPERATION', protected: true }), cfg)).toBe(true);
    expect(isBackupProtected(candidate({ backupType: 'AUTOMATIC_OPERATION' }), cfg)).toBe(false);
  });
});

describe('compatibility aggregation', () => {
  it('returns compatible when all checks pass', () => {
    const result = aggregateCompatibility({
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
    expect(result.compatible).toBe(true);
    expect(result.severity).toBe('WARNING'); // older backup -> forward-migrate warning
  });

  it('blocks on missing file', () => {
    const result = aggregateCompatibility({
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
    expect(result.compatible).toBe(false);
    expect(result.checks.some((c) => c.code === 'backup.fileMissing')).toBe(true);
  });

  it('blocks on unknown migration (non-additive)', () => {
    const result = aggregateCompatibility({
      backup: verifiedBackup(),
      fileExists: true,
      fileHashMatches: true,
      manifestHashMatches: true,
      integrityOk: true,
      backupMigrationNames: ['f1', 'f_unknown'],
      activeMigrationNames: ['f1'],
      activeBackend: 'sqlite',
      pathInsideRoot: true,
      sourceEqualsActive: false,
      anotherRestoreActive: false,
    });
    expect(result.compatible).toBe(false);
    expect(result.checks.some((c) => c.code === 'backup.migrationUnknown')).toBe(true);
  });

  it('blocks on backend mismatch', () => {
    const result = aggregateCompatibility({
      backup: verifiedBackup(),
      fileExists: true,
      fileHashMatches: true,
      manifestHashMatches: true,
      integrityOk: true,
      backupMigrationNames: ['f1'],
      activeMigrationNames: ['f1'],
      activeBackend: 'postgresql',
      pathInsideRoot: true,
      sourceEqualsActive: false,
      anotherRestoreActive: false,
    });
    expect(result.compatible).toBe(false);
    expect(result.checks.some((c) => c.code === 'backup.backendMismatch')).toBe(true);
  });
});

describe('restore readiness', () => {
  it('is ready when all blockers clear', () => {
    const cfg = defaultBackupConfig();
    const compat = aggregateCompatibility({
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
    const ready = aggregateRestoreReadiness({
      config: cfg,
      compatibility: compat,
      preRestoreBackupCreated: true,
      conflictingWorldOperationRunning: false,
      currentFingerprintMatchesExpectation: true,
      backupFingerprintRecomputes: true,
    });
    expect(ready.ready).toBe(true);
  });

  it('is not ready when a world operation is running', () => {
    const cfg = defaultBackupConfig();
    const compat = { severity: 'OK' as const, compatible: true, checks: [] };
    const ready = aggregateRestoreReadiness({
      config: cfg,
      compatibility: compat,
      preRestoreBackupCreated: true,
      conflictingWorldOperationRunning: true,
      currentFingerprintMatchesExpectation: true,
      backupFingerprintRecomputes: true,
    });
    expect(ready.ready).toBe(false);
  });
});

describe('reconciliation', () => {
  it('flags a VERIFIED backup missing its file hash', () => {
    const result = reconcileBackupRecord({ config: sampleConfig(), backup: verifiedBackup({ fileSha256: null }) });
    expect(result.ok).toBe(false);
    expect(result.issues.some((i) => i.code === 'verified.missingFileSha256')).toBe(true);
  });

  it('passes a complete VERIFIED record', () => {
    const result = reconcileBackupRecord({ config: sampleConfig(), backup: verifiedBackup() });
    expect(result.ok).toBe(true);
  });

  it('flags an unprotected PRE_RESTORE backup', () => {
    const result = reconcileBackupRecord({
      config: sampleConfig(),
      backup: verifiedBackup({ backupType: 'PRE_RESTORE', protected: false }),
    });
    expect(result.ok).toBe(false);
  });
});

describe('status transitions', () => {
  it('allows CREATING -> VERIFYING -> VERIFIED', () => {
    expect(canTransitionBackupStatus('CREATING', 'VERIFYING')).toBe(true);
    expect(canTransitionBackupStatus('VERIFYING', 'VERIFIED')).toBe(true);
  });

  it('allows VERIFIED -> CORRUPT on later detection', () => {
    expect(canTransitionBackupStatus('VERIFIED', 'CORRUPT')).toBe(true);
  });

  it('forbids FAILED -> VERIFIED', () => {
    expect(canTransitionBackupStatus('FAILED', 'VERIFIED')).toBe(false);
  });

  it('restore: PREPARED -> WAITING_FOR_RESTART -> RUNNING -> VERIFYING -> COMPLETED', () => {
    expect(canTransitionRestoreStatus('PREPARED', 'WAITING_FOR_RESTART')).toBe(true);
    expect(canTransitionRestoreStatus('WAITING_FOR_RESTART', 'RUNNING')).toBe(true);
    expect(canTransitionRestoreStatus('RUNNING', 'VERIFYING')).toBe(true);
    expect(canTransitionRestoreStatus('VERIFYING', 'COMPLETED')).toBe(true);
  });

  it('restore: RUNNING/VERIFYING cannot be cancelled', () => {
    expect(canCancelRestore('RUNNING')).toBe(false);
    expect(canCancelRestore('VERIFYING')).toBe(false);
    expect(canCancelRestore('PREPARED')).toBe(true);
  });

  it('COMPLETED restore is terminal/immutable', () => {
    expect(isTerminalRestoreStatus('COMPLETED')).toBe(true);
    expect(isTerminalRestoreStatus('FAILED')).toBe(true);
    expect(isTerminalRestoreStatus('PREPARED')).toBe(false);
  });

  it('ACTIVE_RESTORE_STATUSES excludes terminal statuses', () => {
    expect(ACTIVE_RESTORE_STATUSES).toContain('PREPARED');
    expect(ACTIVE_RESTORE_STATUSES).not.toContain('COMPLETED');
  });
});

describe('no input mutation', () => {
  it('retention does not mutate the candidates array', () => {
    const cfg = defaultBackupConfig();
    const candidates = [candidate({ id: 'a' }), candidate({ id: 'b' })];
    const before = JSON.parse(JSON.stringify(candidates));
    computeRetentionPlan({ config: cfg, candidates, referenceTime: '2026-07-17T00:00:00.000Z' });
    expect(JSON.parse(JSON.stringify(candidates))).toEqual(before);
  });

  it('normalizeDatabaseFingerprintInput does not mutate input', () => {
    const input = fingerprintInput();
    const snapshot = JSON.parse(JSON.stringify(input));
    computeDatabaseFingerprint(input);
    expect(input).toEqual(snapshot);
  });
});
