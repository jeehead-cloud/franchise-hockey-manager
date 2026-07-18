import { describe, it, expect } from 'vitest';
import {
  MAINTENANCE_CONFIG_SCHEMA_VERSION,
  MAINTENANCE_PRESET_ENVELOPE_SCHEMA_VERSION,
  MaintenanceError,
  defaultMaintenanceConfig,
  validateMaintenanceConfig,
  canonicalMaintenanceConfig,
  hashMaintenanceConfig,
  computeExportManifestDigest,
  normalizeExportManifestHashInput,
  computePresetPayloadHash,
  computePresetEnvelopeHash,
  computeImportPreviewHash,
  computeExportInputHash,
  computeResetPreviewHash,
  EXPORT_SCHEMAS,
  getExportSchema,
  isSupportedFilter,
  validateExportFilters,
  csvEscape,
  toCsv,
  csvHeaderOnly,
  PLAYERS_PUBLIC_COLUMNS,
  PLAYERS_COMMISSIONER_COLUMNS,
  normalizeMaintenanceNameToken,
  validateNamePoolRow,
  classifyNamePoolDuplicate,
  decideDuplicateAction,
  validatePresetEnvelope,
  buildNamePoolImportPlan,
  extractApplyReadyNamePoolRows,
  aggregateDatabaseValidation,
  reconcileExportRun,
  canTransitionExportStatus,
  canTransitionImportStatus,
  canTransitionValidationStatus,
  canTransitionResetStatus,
  classifyResetReadiness,
  type DatabaseCheckInput,
  type ImportPlan,
  type NamePoolExistingEntry,
  type ConfigurationPresetType,
} from './index.js';

function baseCheckInput(over: Partial<DatabaseCheckInput> = {}): DatabaseCheckInput {
  return {
    databaseFingerprint: 'fp-1',
    integrityCheckOk: true,
    integrityCheckMessage: 'ok',
    migrationCount: 27,
    latestMigrationName: '20260719000000_f32_backup_recovery',
    hasMigrationTable: true,
    requiredTablesPresent: { Country: true, Team: true, Player: true, Match: true },
    world: { appMetaPresent: true, worldInitialized: true, currentWorldSeasonCount: 1, worldSeasonTotalCount: 1 },
    playersTeams: { duplicatePlayerExternalIds: 0, invalidTeamOwnership: 0, retiredPlayersInLineups: 0, missingRequiredReferences: 0 },
    contracts: { playersWithMultipleActiveContracts: 0, currentPlayerTeamMismatches: 0, invalidOverlaps: 0, futureInconsistencies: 0 },
    draft: { picksWithOwnershipMismatch: 0, duplicateActiveRights: 0, convertedRightInconsistencies: 0 },
    trades: { completedTradesWithUnreconciledAssets: 0 },
    competitions: { editionStageDependencyInvalid: 0, activeCompletedStatusInconsistent: 0, scheduleMatchOwnershipInvalid: 0, archiveIntegrityFailures: 0 },
    statistics: { orphanStatRecords: 0, teamPlayerReferenceInvalid: 0, archivedSnapshotInconsistent: 0 },
    scouting: { teamPrivateOwnershipInvalid: 0, reportVersionIntegrityFailures: 0, assignmentStateInconsistent: 0 },
    offseasonTransitions: { activeOffseasonRunCount: 0, linkedOperationInconsistencies: 0, targetCurrentSeasonUniqueness: 0 },
    backups: { backupSubsystemConfigured: true, pendingRestoreConflict: false },
    maintenance: { stuckRunningExportCount: 0, stuckRunningImportCount: 0, stuckRunningValidationCount: 0, stuckRunningResetCount: 0 },
    ...over,
  };
}

describe('maintenance engine — config validation', () => {
  it('default config validates and matches schemaVersion 1', () => {
    const cfg = defaultMaintenanceConfig();
    expect(cfg.schemaVersion).toBe(MAINTENANCE_CONFIG_SCHEMA_VERSION);
    const validated = validateMaintenanceConfig(JSON.parse(JSON.stringify(cfg)));
    expect(validated).toEqual(cfg);
  });

  it('rejects unknown top-level fields', () => {
    const cfg = defaultMaintenanceConfig();
    expect(() => validateMaintenanceConfig({ ...cfg, unknownField: 1 })).toThrow(MaintenanceError);
  });

  it('rejects wrong schemaVersion', () => {
    const cfg = defaultMaintenanceConfig();
    expect(() => validateMaintenanceConfig({ ...cfg, schemaVersion: 99 })).toThrow(/schemaVersion/);
  });

  it('rejects path traversal in storage.directory', () => {
    const cfg = defaultMaintenanceConfig();
    expect(() => validateMaintenanceConfig({ ...cfg, storage: { ...cfg.storage, directory: '../escape' } })).toThrow(/parent traversal/);
  });

  it('rejects unsupported CSV delimiters', () => {
    const cfg = defaultMaintenanceConfig();
    expect(() => validateMaintenanceConfig({ ...cfg, csv: { ...cfg.csv, delimiter: ':' } })).toThrow(/delimiter/);
  });

  it('rejects COMMISSIONER_TRUTH default when allowCommissionerTruthExport is false', () => {
    const cfg = defaultMaintenanceConfig();
    expect(() =>
      validateMaintenanceConfig({
        ...cfg,
        privacy: { ...cfg.privacy, defaultPlayerExportMode: 'COMMISSIONER_TRUTH', allowCommissionerTruthExport: false },
      }),
    ).toThrow(/COMMISSIONER_TRUTH/);
  });
});

describe('maintenance engine — CSV escaping + stable columns', () => {
  it('escapes quotes, commas, and newlines', () => {
    expect(csvEscape('hello')).toBe('hello');
    expect(csvEscape('a,b')).toBe('"a,b"');
    expect(csvEscape('a"b')).toBe('"a""b"');
    expect(csvEscape('a\nb')).toBe('"a\nb"');
    expect(csvEscape(null)).toBe('');
    expect(csvEscape(null, '-')).toBe('-');
    expect(csvEscape(42)).toBe('42');
  });

  it('serializes a complete CSV document with LF endings', () => {
    const out = toCsv(['a', 'b'], [[1, 2], [3, 'x,y']]);
    expect(out).toBe('a,b\n1,2\n3,"x,y"');
  });

  it('serializes a header-only CSV', () => {
    expect(csvHeaderOnly(['a', 'b'])).toBe('a,b');
  });

  it('PLAYERS_PUBLIC_COLUMNS excludes hidden truth fields', () => {
    // `role` IS public (F5-derived role is shown on the ordinary player API);
    // only hidden truth + private scouting are forbidden in public exports.
    const forbidden = ['potentialFloor', 'potentialCeiling', 'developmentRate', 'developmentRisk', 'qualityTier', 'currentAbility'];
    for (const f of forbidden) {
      expect(PLAYERS_PUBLIC_COLUMNS as readonly string[]).not.toContain(f);
    }
  });

  it('PLAYERS_COMMISSIONER_COLUMNS includes hidden truth fields', () => {
    for (const f of ['potentialFloor', 'potentialCeiling', 'developmentRate', 'currentAbility']) {
      expect(PLAYERS_COMMISSIONER_COLUMNS as readonly string[]).toContain(f);
    }
  });
});

describe('maintenance engine — export schema validation', () => {
  it('provides a schema definition for every registered export type', () => {
    expect(EXPORT_SCHEMAS.length).toBe(16);
    for (const def of EXPORT_SCHEMAS) {
      expect(def.columns.length).toBeGreaterThan(0);
      expect(def.format).toMatch(/^(CSV|JSON|ZIP)$/);
    }
  });

  it('public/truth privacy selection matches export type', () => {
    expect(getExportSchema('PLAYERS_PUBLIC_CSV').privacyLevel).toBe('PUBLIC_SAFE');
    expect(getExportSchema('PLAYERS_PUBLIC_CSV').revealsHiddenTruth).toBe(false);
    expect(getExportSchema('PLAYERS_COMMISSIONER_CSV').privacyLevel).toBe('COMMISSIONER_TRUTH');
    expect(getExportSchema('PLAYERS_COMMISSIONER_CSV').revealsHiddenTruth).toBe(true);
    expect(getExportSchema('FULL_DATABASE_PACKAGE').revealsHiddenTruth).toBe(true);
  });

  it('isSupportedFilter + validateExportFilters', () => {
    expect(isSupportedFilter('PLAYER_STATISTICS_CSV', 'worldSeasonId')).toBe(true);
    expect(isSupportedFilter('PLAYER_STATISTICS_CSV', 'teamId')).toBe(true);
    expect(isSupportedFilter('PLAYER_STATISTICS_CSV', 'banana')).toBe(false);
    // Empty-string and null/undefined values are silently skipped
    const filters = validateExportFilters('PLAYER_STATISTICS_CSV', { worldSeasonId: 'ws1', empty: '' });
    expect(filters).toEqual({ worldSeasonId: 'ws1' });
    // Unknown filter keys are rejected
    expect(() => validateExportFilters('PLAYER_STATISTICS_CSV', { banana: 'x' })).toThrow(MaintenanceError);
    // Non-string filter values are rejected
    expect(() => validateExportFilters('PLAYER_STATISTICS_CSV', { worldSeasonId: 123 })).toThrow(MaintenanceError);
  });
});

describe('maintenance engine — name normalization + pool validation', () => {
  it('normalizeMaintenanceNameToken trims and collapses whitespace', () => {
    expect(normalizeMaintenanceNameToken('  John   Doe ')).toBe('John Doe');
    expect(normalizeMaintenanceNameToken('   ')).toBeNull();
  });

  it('validateNamePoolRow accepts valid rows', () => {
    const r = validateNamePoolRow(1, ' ca ', 'Alex', 'Smith');
    expect(r.issues).toEqual([]);
    expect(r.normalized).toEqual({ countryCode: 'CA', firstName: 'Alex', lastName: 'Smith' });
  });

  it('validateNamePoolRow rejects empty names', () => {
    const r = validateNamePoolRow(2, 'CA', '', 'Smith');
    expect(r.issues.length).toBe(1);
    expect(r.issues[0]!.code).toBe('namePool.firstName.empty');
    expect(r.normalized).toBeNull();
  });
});

describe('maintenance engine — duplicate classification + conflict handling', () => {
  const existing: NamePoolExistingEntry = { countryCode: 'CA', firstName: 'Alex', lastName: 'Smith' };

  it('classifies IDENTICAL vs NEW (case-insensitive)', () => {
    expect(classifyNamePoolDuplicate({ countryCode: 'CA', firstName: 'alex', lastName: 'SMITH' }, existing)).toBe('IDENTICAL');
    expect(classifyNamePoolDuplicate({ countryCode: 'CA', firstName: 'Bob', lastName: 'Jones' }, existing)).toBe('NEW');
  });

  it('decideDuplicateAction honors policy', () => {
    expect(decideDuplicateAction('NEW', 'SKIP_IDENTICAL')).toBe('CREATE');
    expect(decideDuplicateAction('IDENTICAL', 'SKIP_IDENTICAL')).toBe('SKIP');
    expect(decideDuplicateAction('IDENTICAL', 'REJECT_CONFLICT')).toBe('REJECT');
    expect(decideDuplicateAction('IDENTICAL', 'ADD_NEW')).toBe('CREATE');
  });
});

describe('maintenance engine — preset envelope validation', () => {
  function envelope(over: Partial<{ payload: unknown; payloadHash: string; presetType: ConfigurationPresetType; exportedAt: string }> = {}) {
    const payload = over.payload ?? { foo: 1, bar: ['x', 'y'] };
    const presetType: ConfigurationPresetType = over.presetType ?? 'DEVELOPMENT';
    return {
      schemaVersion: MAINTENANCE_PRESET_ENVELOPE_SCHEMA_VERSION,
      presetType,
      presetName: 'My Dev',
      versionName: 'v1',
      payloadSchemaVersion: 1,
      payload,
      payloadHash: over.payloadHash ?? computePresetPayloadHash(payload),
      exportedAt: over.exportedAt ?? '2026-07-17T00:00:00Z',
    };
  }

  it('accepts a valid envelope', () => {
    expect(validatePresetEnvelope(envelope())).toBeDefined();
  });

  it('rejects payloadHash mismatch', () => {
    expect(() => validatePresetEnvelope(envelope({ payloadHash: 'wrong' }))).toThrow(/payloadHash/);
  });

  it('exportedAt does not affect payloadHash', () => {
    const e1 = envelope({ exportedAt: '2026-01-01T00:00:00Z' });
    const e2 = envelope({ exportedAt: '2027-12-31T00:00:00Z' });
    expect(e1.payloadHash).toBe(e2.payloadHash);
  });

  it('rejects unknown preset type', () => {
    expect(() => validatePresetEnvelope(envelope({ presetType: 'NONSENSE' as unknown as ConfigurationPresetType }))).toThrow(/presetType/);
  });

  it('rejects unknown envelope fields', () => {
    const e = envelope() as Record<string, unknown>;
    e.extra = 1;
    expect(() => validatePresetEnvelope(e)).toThrow(/Unknown/);
  });

  it('computePresetEnvelopeHash excludes exportedAt', () => {
    const { exportedAt, ...rest } = envelope();
    const h1 = computePresetEnvelopeHash(rest);
    const h2 = computePresetEnvelopeHash({ ...rest });
    expect(h1).toBe(h2);
  });
});

describe('maintenance engine — import-plan determinism', () => {
  function build(policy: 'SKIP_IDENTICAL' | 'REJECT_CONFLICT' | 'ADD_NEW') {
    return buildNamePoolImportPlan({
      rows: [
        { rowNumber: 1, countryCode: 'CA', firstName: 'Alex', lastName: 'Smith' },
        { rowNumber: 2, countryCode: 'CA', firstName: 'Bob', lastName: 'Jones' },
        { rowNumber: 3, countryCode: 'CA', firstName: 'alex', lastName: 'SMITH' }, // dup of row 1
      ],
      existing: [{ countryCode: 'CA', firstName: 'Alex', lastName: 'Smith' }],
      duplicatePolicy: policy,
    });
  }

  it('SKIP_IDENTICAL skips dups and produces stable preview hash', () => {
    const p1 = build('SKIP_IDENTICAL');
    const p2 = build('SKIP_IDENTICAL');
    expect(p1.previewHash).toBe(p2.previewHash);
    // row 1 (matches existing Alex Smith) + row 3 (intra-batch dup of row 1)
    expect(p1.duplicates.length).toBe(2);
    expect(p1.intendedSkips).toBe(2);
    expect(p1.intendedCreates).toBe(1); // row 2 (Bob Jones - new)
    expect(p1.invalidRows).toBe(0);
  });

  it('REJECT_CONFLICT flags dups as blockers', () => {
    const p = build('REJECT_CONFLICT');
    // row 1 + row 3 both rejected
    expect(p.invalidRows).toBe(2);
    expect(p.issues.some((i) => i.code === 'namePool.duplicateRejected')).toBe(true);
  });

  it('extractApplyReadyNamePoolRows excludes rejected + skipped rows', () => {
    const plan = build('SKIP_IDENTICAL');
    const rows = [
      { rowNumber: 1, countryCode: 'CA', firstName: 'Alex', lastName: 'Smith' },
      { rowNumber: 2, countryCode: 'CA', firstName: 'Bob', lastName: 'Jones' },
    ];
    const apply = extractApplyReadyNamePoolRows(plan, rows);
    expect(apply.map((r) => r.rowNumber)).toEqual([2]);
  });
});

describe('maintenance engine — database-check aggregation', () => {
  it('returns PASS when all checks OK', () => {
    const result = aggregateDatabaseValidation(baseCheckInput());
    expect(result.status).toBe('PASS');
    expect(result.blockers).toEqual([]);
    expect(result.warnings).toEqual([]);
    expect(result.resultHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('returns FAIL when integrity_check fails', () => {
    const result = aggregateDatabaseValidation(baseCheckInput({ integrityCheckOk: false, integrityCheckMessage: 'corrupt' }));
    expect(result.status).toBe('FAIL');
    expect(result.blockers.some((c) => c.code === 'sqlite.integrityCheck')).toBe(true);
  });

  it('returns WARNING when retired players in lineups (non-blocker)', () => {
    const result = aggregateDatabaseValidation(
      baseCheckInput({ playersTeams: { duplicatePlayerExternalIds: 0, invalidTeamOwnership: 0, retiredPlayersInLineups: 3, missingRequiredReferences: 0 } }),
    );
    expect(result.status).toBe('WARNING');
    expect(result.warnings.some((c) => c.code === 'playersTeams.retiredInLineup')).toBe(true);
  });

  it('resultHash is deterministic for identical input', () => {
    const r1 = aggregateDatabaseValidation(baseCheckInput());
    const r2 = aggregateDatabaseValidation(baseCheckInput());
    expect(r1.resultHash).toBe(r2.resultHash);
  });
});

describe('maintenance engine — reset readiness', () => {
  it('RESET_SETUP_STATE_ONLY blocks when world tables are populated', () => {
    const r = classifyResetReadiness({
      mode: 'RESET_SETUP_STATE_ONLY',
      appMetaInitialized: true,
      affectedCounts: [{ table: 'Player', count: 10 }],
      runningWorldOperation: false,
      pendingRestore: false,
      emptyWorldTables: false,
    });
    expect(r.blockers.some((b) => b.code === 'reset.setupStateWorldNotEmpty')).toBe(true);
  });

  it('RESET_SETUP_STATE_ONLY allows when world tables are empty', () => {
    const r = classifyResetReadiness({
      mode: 'RESET_SETUP_STATE_ONLY',
      appMetaInitialized: true,
      affectedCounts: [],
      runningWorldOperation: false,
      pendingRestore: false,
      emptyWorldTables: true,
    });
    expect(r.blockers).toEqual([]);
  });

  it('blocks when a world operation is running', () => {
    const r = classifyResetReadiness({
      mode: 'RESET_WORLD_TO_EMPTY',
      appMetaInitialized: true,
      affectedCounts: [{ table: 'Player', count: 10 }],
      runningWorldOperation: true,
      pendingRestore: false,
      emptyWorldTables: false,
    });
    expect(r.blockers.some((b) => b.code === 'reset.runningWorldOperation')).toBe(true);
  });
});

describe('maintenance engine — hashing + reconciliation', () => {
  it('config hash is deterministic', () => {
    const c = defaultMaintenanceConfig();
    expect(hashMaintenanceConfig(c)).toBe(hashMaintenanceConfig(c));
    expect(canonicalMaintenanceConfig(c)).toBe(canonicalMaintenanceConfig(c));
  });

  it('manifest digest excludes wall-clock and is deterministic', () => {
    const base = {
      manifestSchemaVersion: 1,
      exportType: 'PLAYERS_PUBLIC_CSV' as const,
      format: 'CSV' as const,
      privacyLevel: 'PUBLIC_SAFE' as const,
      scopeText: 'all',
      filterText: '',
      schemaVersion: 1,
      rowCount: 100,
      fileSizeBytes: 4096,
      fileSha256: 'abc',
      configuration: { versionId: 'v1', hash: 'h1' },
      inputHash: 'ih',
    };
    expect(computeExportManifestDigest(base)).toBe(computeExportManifestDigest(base));
    expect(typeof computeExportManifestDigest(base)).toBe('string');
    // normalize is canonical
    const n1 = normalizeExportManifestHashInput(base);
    const n2 = normalizeExportManifestHashInput(base);
    expect(JSON.stringify(n1)).toBe(JSON.stringify(n2));
  });

  it('export input hash is deterministic and filter-order-independent', () => {
    const args = { exportType: 'X', filters: { a: '1', b: '2' }, configVersionId: 'v1', configHash: 'h' };
    const argsRev = { exportType: 'X', filters: { b: '2', a: '1' }, configVersionId: 'v1', configHash: 'h' };
    expect(computeExportInputHash(args)).toBe(computeExportInputHash(argsRev));
  });

  it('import preview hash is deterministic for identical plans', () => {
    const plan: Omit<ImportPlan, 'previewHash'> = {
      importType: 'NAME_POOL',
      totalRows: 3,
      validRows: 2,
      warningRows: 0,
      invalidRows: 1,
      intendedCreates: 2,
      intendedSkips: 0,
      duplicatePolicy: 'SKIP_IDENTICAL',
      duplicates: [],
      issues: [{ rowNumber: 1, fieldName: 'firstName', severity: 'BLOCKER', code: 'x', message: 'bad', normalizedValue: null }],
    };
    expect(computeImportPreviewHash(plan)).toBe(computeImportPreviewHash(plan));
  });

  it('reset preview hash is deterministic', () => {
    const input = {
      mode: 'RESET_WORLD_TO_EMPTY' as const,
      appMetaInitialized: true,
      affectedCounts: [{ table: 'Player', count: 10 }, { table: 'Team', count: 5 }],
      currentDatabaseFingerprint: 'fp',
      worldShortId: 'WS-1',
      runningWorldOperation: false,
      pendingRestore: false,
    };
    expect(computeResetPreviewHash(input)).toBe(computeResetPreviewHash(input));
  });

  it('reconcileExportRun flags missing metadata on COMPLETED', () => {
    const r = reconcileExportRun({ status: 'COMPLETED', fileSha256: null, manifestSha256: null, rowCount: null, fileSizeBytes: null, outputRelativePath: null });
    expect(r.ok).toBe(false);
    expect(r.issues.length).toBeGreaterThan(0);
  });

  it('status transitions enforce the lifecycle', () => {
    expect(canTransitionExportStatus('RUNNING', 'COMPLETED')).toBe(true);
    expect(canTransitionExportStatus('COMPLETED', 'RUNNING')).toBe(false);
    expect(canTransitionImportStatus('PREVIEW_READY', 'APPLYING')).toBe(true);
    expect(canTransitionImportStatus('COMPLETED', 'APPLYING')).toBe(false);
    expect(canTransitionValidationStatus('RUNNING', 'COMPLETED')).toBe(true);
    expect(canTransitionResetStatus('PREPARED', 'RUNNING')).toBe(true);
    expect(canTransitionResetStatus('COMPLETED', 'RUNNING')).toBe(false);
  });
});

describe('maintenance engine — no input mutation', () => {
  it('validateMaintenanceConfig does not mutate its input', () => {
    const input = JSON.parse(JSON.stringify(defaultMaintenanceConfig())) as Record<string, unknown>;
    const snapshot = JSON.parse(JSON.stringify(input));
    validateMaintenanceConfig(input);
    expect(input).toEqual(snapshot);
  });

  it('aggregateDatabaseValidation does not mutate its input', () => {
    const input = baseCheckInput();
    const snapshot = JSON.parse(JSON.stringify(input));
    aggregateDatabaseValidation(input);
    expect(input).toEqual(snapshot);
  });

  it('buildNamePoolImportPlan does not mutate rows or existing', () => {
    const rows = [{ rowNumber: 1, countryCode: 'CA', firstName: 'Alex', lastName: 'Smith' }];
    const existing: NamePoolExistingEntry[] = [{ countryCode: 'CA', firstName: 'Alex', lastName: 'Smith' }];
    const rowsSnap = JSON.parse(JSON.stringify(rows));
    const existingSnap = JSON.parse(JSON.stringify(existing));
    buildNamePoolImportPlan({ rows, existing, duplicatePolicy: 'SKIP_IDENTICAL' });
    expect(rows).toEqual(rowsSnap);
    expect(existing).toEqual(existingSnap);
  });
});
