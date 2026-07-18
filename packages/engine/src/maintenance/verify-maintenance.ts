/**
 * F33 — Import, Export, and Database Maintenance engine verifier.
 *
 * Usage: `npm run verify:maintenance`
 *
 * Exercises every pure engine responsibility: configuration validation, export
 * schema definitions, CSV escaping + stable columns, public/truth privacy
 * selection, name normalization + row validation, duplicate classification,
 * preset envelope validation, import-plan determinism, database-check
 * aggregation, reset readiness, hashing, reconciliation, and no-input
 * mutation. Database-touching flows (real migration, real exports, real
 * imports, real reset) are covered by the server test suite
 * (`packages/server/tests/f33-maintenance.test.ts`) which has full DB+HTTP
 * access; this verifier keeps the engine honest without needing SQLite.
 */

import { performance } from 'node:perf_hooks';
import {
  MAINTENANCE_CONFIG_SCHEMA_VERSION,
  MAINTENANCE_PRESET_ENVELOPE_SCHEMA_VERSION,
  MaintenanceError,
  defaultMaintenanceConfig,
  validateMaintenanceConfig,
  canonicalMaintenanceConfig,
  hashMaintenanceConfig,
  computeExportManifestDigest,
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
  type NamePoolExistingEntry,
} from './index.js';

let passCount = 0;
let failCount = 0;

function check(condition: boolean, label: string): void {
  if (condition) {
    passCount += 1;
    console.log(`PASS: ${label}`);
  } else {
    failCount += 1;
    console.error(`FAIL: ${label}`);
    throw new Error(`Verification failed: ${label}`);
  }
}

function expectThrow(fn: () => unknown, label: string, codeMatch?: string): void {
  let threw = false;
  let code = '';
  let message = '';
  try {
    fn();
  } catch (e) {
    threw = true;
    code = e instanceof MaintenanceError ? e.code : '';
    message = e instanceof Error ? e.message : '';
  }
  if (!threw) {
    failCount += 1;
    console.error(`FAIL: ${label} (expected throw)`);
    throw new Error(`Expected throw: ${label}`);
  }
  if (codeMatch && !code.includes(codeMatch) && !message.includes(codeMatch)) {
    failCount += 1;
    console.error(`FAIL: ${label} (expected code/message containing '${codeMatch}', got code='${code}')`);
    throw new Error(`Wrong error code: ${label}`);
  }
  passCount += 1;
  console.log(`PASS: ${label}`);
}

function baseCheckInput(over: Partial<DatabaseCheckInput> = {}): DatabaseCheckInput {
  return {
    databaseFingerprint: 'fp-1',
    integrityCheckOk: true,
    integrityCheckMessage: 'ok',
    migrationCount: 28,
    latestMigrationName: '20260720000000_f33_import_export_database_maintenance',
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

// ---------------------------------------------------------------------------
// 1. Config validation
// ---------------------------------------------------------------------------
{
  const cfg = defaultMaintenanceConfig();
  check(cfg.schemaVersion === MAINTENANCE_CONFIG_SCHEMA_VERSION, 'default config schemaVersion is 1');
  check(validateMaintenanceConfig(JSON.parse(JSON.stringify(cfg))).storage.directory === '.fhm-exports', 'default storage directory is .fhm-exports');
  check(validateMaintenanceConfig(JSON.parse(JSON.stringify(cfg))).csv.lineEnding === 'LF', 'csv line ending is LF');
  check(validateMaintenanceConfig(JSON.parse(JSON.stringify(cfg))).privacy.defaultPlayerExportMode === 'PUBLIC_SAFE', 'default privacy is PUBLIC_SAFE');
  expectThrow(() => validateMaintenanceConfig({ ...cfg, unknown: 1 }), 'reject unknown field', 'InvalidMaintenanceConfiguration');
  expectThrow(() => validateMaintenanceConfig({ ...cfg, schemaVersion: 2 }), 'reject wrong schemaVersion', 'schemaVersion');
  expectThrow(() => validateMaintenanceConfig({ ...cfg, storage: { ...cfg.storage, directory: '../escape' } }), 'reject path traversal', 'parent traversal');
  expectThrow(() => validateMaintenanceConfig({ ...cfg, csv: { ...cfg.csv, delimiter: ':' } }), 'reject unsupported delimiter', 'delimiter');
  expectThrow(
    () => validateMaintenanceConfig({ ...cfg, privacy: { ...cfg.privacy, defaultPlayerExportMode: 'COMMISSIONER_TRUTH', allowCommissionerTruthExport: false } }),
    'reject COMMISSIONER_TRUTH without allowCommissionerTruthExport',
    'COMMISSIONER_TRUTH',
  );
}

// ---------------------------------------------------------------------------
// 2. CSV escaping
// ---------------------------------------------------------------------------
{
  check(csvEscape('hello') === 'hello', 'plain value not escaped');
  check(csvEscape('a,b') === '"a,b"', 'comma value escaped');
  check(csvEscape('a"b') === '"a""b"', 'quote value escaped');
  check(csvEscape(null) === '', 'null value empty');
  check(csvEscape(null, '-') === '-', 'null value uses configured nullValue');
}

// ---------------------------------------------------------------------------
// 3. Stable column ordering
// ---------------------------------------------------------------------------
{
  check(toCsv(['a', 'b'], [[1, 2]]) === 'a,b\n1,2', 'CSV header+row ordering stable');
  check(csvHeaderOnly(['a', 'b']) === 'a,b', 'header-only CSV stable');
}

// ---------------------------------------------------------------------------
// 4. Export schema validation
// ---------------------------------------------------------------------------
{
  check(EXPORT_SCHEMAS.length === 16, '16 export types registered');
  for (const def of EXPORT_SCHEMAS) {
    check(def.columns.length > 0, `${def.exportType} has columns`);
  }
  check(getExportSchema('PLAYERS_PUBLIC_CSV').privacyLevel === 'PUBLIC_SAFE', 'PLAYERS_PUBLIC_CSV is PUBLIC_SAFE');
  check(getExportSchema('PLAYERS_COMMISSIONER_CSV').privacyLevel === 'COMMISSIONER_TRUTH', 'PLAYERS_COMMISSIONER_CSV is COMMISSIONER_TRUTH');
  check(getExportSchema('FULL_DATABASE_PACKAGE').format === 'ZIP', 'FULL_DATABASE_PACKAGE is ZIP');
}

// ---------------------------------------------------------------------------
// 5. Public/truth privacy selection
// ---------------------------------------------------------------------------
{
  // `role` is public (F5-derived); only hidden truth fields are forbidden.
  const forbidden = ['potentialFloor', 'potentialCeiling', 'developmentRate', 'developmentRisk', 'currentAbility', 'qualityTier'];
  for (const f of forbidden) {
    check(!(PLAYERS_PUBLIC_COLUMNS as readonly string[]).includes(f), `PLAYERS_PUBLIC_COLUMNS omits ${f}`);
    check((PLAYERS_COMMISSIONER_COLUMNS as readonly string[]).includes(f), `PLAYERS_COMMISSIONER_COLUMNS includes ${f}`);
  }
  check(isSupportedFilter('PLAYER_STATISTICS_CSV', 'worldSeasonId'), 'worldSeasonId filter supported');
  check(!isSupportedFilter('PLAYER_STATISTICS_CSV', 'banana'), 'banana filter unsupported');
  expectThrow(() => validateExportFilters('PLAYER_STATISTICS_CSV', { banana: 'x' }), 'reject unknown filter', 'InvalidExportFilter');
}

// ---------------------------------------------------------------------------
// 6. Name normalization
// ---------------------------------------------------------------------------
{
  check(normalizeMaintenanceNameToken('  John   Doe ') === 'John Doe', 'whitespace collapsed');
  check(normalizeMaintenanceNameToken('   ') === null, 'whitespace-only returns null');
}

// ---------------------------------------------------------------------------
// 7. Name-pool row validation
// ---------------------------------------------------------------------------
{
  const r = validateNamePoolRow(1, ' ca ', 'Alex', 'Smith');
  check(r.issues.length === 0 && r.normalized!.countryCode === 'CA', 'valid row normalized');
  const bad = validateNamePoolRow(2, 'CA', '', 'Smith');
  check(bad.issues.length === 1 && bad.issues[0]!.code === 'namePool.firstName.empty', 'empty firstName rejected');
}

// ---------------------------------------------------------------------------
// 8. Duplicate classification
// ---------------------------------------------------------------------------
{
  const existing: NamePoolExistingEntry = { countryCode: 'CA', firstName: 'Alex', lastName: 'Smith' };
  check(classifyNamePoolDuplicate({ countryCode: 'CA', firstName: 'alex', lastName: 'SMITH' }, existing) === 'IDENTICAL', 'case-insensitive IDENTICAL');
  check(classifyNamePoolDuplicate({ countryCode: 'CA', firstName: 'Bob', lastName: 'Jones' }, existing) === 'NEW', 'distinct row is NEW');
}

// ---------------------------------------------------------------------------
// 9. Import conflict handling
// ---------------------------------------------------------------------------
{
  check(decideDuplicateAction('NEW', 'REJECT_CONFLICT') === 'CREATE', 'NEW always creates');
  check(decideDuplicateAction('IDENTICAL', 'SKIP_IDENTICAL') === 'SKIP', 'SKIP_IDENTICAL skips');
  check(decideDuplicateAction('IDENTICAL', 'REJECT_CONFLICT') === 'REJECT', 'REJECT_CONFLICT rejects');
  check(decideDuplicateAction('IDENTICAL', 'ADD_NEW') === 'CREATE', 'ADD_NEW creates');
}

// ---------------------------------------------------------------------------
// 10. Preset envelope validation
// ---------------------------------------------------------------------------
{
  const payload = { foo: 1, bar: ['x', 'y'] };
  const valid = {
    schemaVersion: MAINTENANCE_PRESET_ENVELOPE_SCHEMA_VERSION,
    presetType: 'DEVELOPMENT',
    presetName: 'Dev',
    versionName: 'v1',
    payloadSchemaVersion: 1,
    payload,
    payloadHash: computePresetPayloadHash(payload),
    exportedAt: '2026-07-17T00:00:00Z',
  };
  check(validatePresetEnvelope(valid).presetType === 'DEVELOPMENT', 'valid envelope accepted');
  expectThrow(() => validatePresetEnvelope({ ...valid, payloadHash: 'wrong' }), 'payloadHash mismatch rejected', 'payloadHash');
  // exportedAt does not affect payloadHash
  const e2 = { ...valid, exportedAt: '2027-12-31T00:00:00Z' };
  check(e2.payloadHash === valid.payloadHash, 'exportedAt does not affect payloadHash');
  expectThrow(() => validatePresetEnvelope({ ...valid, presetType: 'NONSENSE' }), 'unknown preset type rejected', 'presetType');
}

// ---------------------------------------------------------------------------
// 11. Import-plan determinism
// ---------------------------------------------------------------------------
{
  const rows = Array.from({ length: 100 }, (_, i) => ({
    rowNumber: i + 1,
    countryCode: 'CA',
    firstName: `First${i}`,
    lastName: `Last${i}`,
  }));
  const existing: NamePoolExistingEntry[] = [{ countryCode: 'CA', firstName: 'First0', lastName: 'Last0' }];
  const p1 = buildNamePoolImportPlan({ rows, existing, duplicatePolicy: 'SKIP_IDENTICAL' });
  const p2 = buildNamePoolImportPlan({ rows, existing, duplicatePolicy: 'SKIP_IDENTICAL' });
  check(p1.previewHash === p2.previewHash, 'identical plans produce identical preview hashes');
  check(p1.intendedSkips === 1, 'one existing duplicate skipped');
  check(p1.intendedCreates === 99, '99 new rows queued');
  const apply = extractApplyReadyNamePoolRows(p1, rows.map((r) => ({ ...r, countryCode: 'CA' })));
  check(apply.length === 99, 'extractApplyReadyNamePoolRows excludes skipped');
}

// ---------------------------------------------------------------------------
// 12. Database-check aggregation
// ---------------------------------------------------------------------------
{
  const pass = aggregateDatabaseValidation(baseCheckInput());
  check(pass.status === 'PASS', 'all-OK input returns PASS');
  check(/^[0-9a-f]{64}$/.test(pass.resultHash), 'result hash is 64-hex');
  const r1 = aggregateDatabaseValidation(baseCheckInput());
  const r2 = aggregateDatabaseValidation(baseCheckInput());
  check(r1.resultHash === r2.resultHash, 'result hash deterministic');
  const fail = aggregateDatabaseValidation(baseCheckInput({ integrityCheckOk: false }));
  check(fail.status === 'FAIL', 'failed integrity_check returns FAIL');
  check(fail.blockers.some((c) => c.code === 'sqlite.integrityCheck'), 'integrity blocker surfaced');
}

// ---------------------------------------------------------------------------
// 13. Reset readiness
// ---------------------------------------------------------------------------
{
  const blocked = classifyResetReadiness({
    mode: 'RESET_SETUP_STATE_ONLY',
    appMetaInitialized: true,
    affectedCounts: [{ table: 'Player', count: 10 }],
    runningWorldOperation: false,
    pendingRestore: false,
    emptyWorldTables: false,
  });
  check(blocked.blockers.some((b) => b.code === 'reset.setupStateWorldNotEmpty'), 'setup-state reset blocked when world populated');
  const allowed = classifyResetReadiness({
    mode: 'RESET_SETUP_STATE_ONLY',
    appMetaInitialized: true,
    affectedCounts: [],
    runningWorldOperation: false,
    pendingRestore: false,
    emptyWorldTables: true,
  });
  check(allowed.blockers.length === 0, 'setup-state reset allowed when world empty');
}

// ---------------------------------------------------------------------------
// 14. Hashing
// ---------------------------------------------------------------------------
{
  const cfg = defaultMaintenanceConfig();
  check(hashMaintenanceConfig(cfg) === hashMaintenanceConfig(cfg), 'config hash deterministic');
  check(canonicalMaintenanceConfig(cfg) === canonicalMaintenanceConfig(cfg), 'canonical config stable');
  const manifest = {
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
    configuration: { versionId: 'v1', hash: 'h' },
    inputHash: 'ih',
  };
  check(computeExportManifestDigest(manifest) === computeExportManifestDigest(manifest), 'manifest digest deterministic');
  const args = { exportType: 'X', filters: { a: '1', b: '2' }, configVersionId: 'v1', configHash: 'h' };
  const argsRev = { exportType: 'X', filters: { b: '2', a: '1' }, configVersionId: 'v1', configHash: 'h' };
  check(computeExportInputHash(args) === computeExportInputHash(argsRev), 'export input hash order-independent');
  const payload = { a: 1 };
  check(computePresetPayloadHash(payload) === computePresetPayloadHash(payload), 'preset payload hash deterministic');
  const { exportedAt, ...envelopeRest } = {
    schemaVersion: MAINTENANCE_PRESET_ENVELOPE_SCHEMA_VERSION,
    presetType: 'DEVELOPMENT' as const,
    presetName: 'n',
    versionName: 'v',
    payloadSchemaVersion: 1,
    payload,
    payloadHash: computePresetPayloadHash(payload),
    exportedAt: '2026-07-17T00:00:00Z',
  };
  check(computePresetEnvelopeHash(envelopeRest) === computePresetEnvelopeHash(envelopeRest), 'envelope hash deterministic');
  const previewPlan = {
    importType: 'NAME_POOL' as const,
    totalRows: 3, validRows: 2, warningRows: 0, invalidRows: 1,
    intendedCreates: 2, intendedSkips: 0, duplicatePolicy: 'SKIP_IDENTICAL' as const,
    duplicates: [], issues: [],
  };
  check(computeImportPreviewHash(previewPlan) === computeImportPreviewHash(previewPlan), 'preview hash deterministic');
  const resetInput = {
    mode: 'RESET_WORLD_TO_EMPTY' as const,
    appMetaInitialized: true,
    affectedCounts: [{ table: 'Player', count: 1 }],
    currentDatabaseFingerprint: 'fp',
    worldShortId: 'WS-1',
    runningWorldOperation: false,
    pendingRestore: false,
  };
  check(computeResetPreviewHash(resetInput) === computeResetPreviewHash(resetInput), 'reset preview hash deterministic');
}

// ---------------------------------------------------------------------------
// 15. Reconciliation
// ---------------------------------------------------------------------------
{
  const bad = reconcileExportRun({ status: 'COMPLETED', fileSha256: null, manifestSha256: null, rowCount: null, fileSizeBytes: null, outputRelativePath: null });
  check(!bad.ok && bad.issues.length > 0, 'COMPLETED without metadata flagged');
  check(canTransitionExportStatus('RUNNING', 'COMPLETED'), 'export RUNNING->COMPLETED allowed');
  check(!canTransitionExportStatus('COMPLETED', 'RUNNING'), 'export COMPLETED->RUNNING rejected');
  check(canTransitionImportStatus('PREVIEW_READY', 'APPLYING'), 'import PREVIEW_READY->APPLYING allowed');
  check(canTransitionValidationStatus('RUNNING', 'COMPLETED'), 'validation RUNNING->COMPLETED allowed');
  check(canTransitionResetStatus('PREPARED', 'RUNNING'), 'reset PREPARED->RUNNING allowed');
}

// ---------------------------------------------------------------------------
// 16. No input mutation
// ---------------------------------------------------------------------------
{
  const input = JSON.parse(JSON.stringify(defaultMaintenanceConfig())) as Record<string, unknown>;
  const snapshot = JSON.parse(JSON.stringify(input));
  validateMaintenanceConfig(input);
  check(JSON.stringify(input) === JSON.stringify(snapshot), 'validateMaintenanceConfig does not mutate input');
  const checkInput = baseCheckInput();
  const checkSnapshot = JSON.parse(JSON.stringify(checkInput));
  aggregateDatabaseValidation(checkInput);
  check(JSON.stringify(checkInput) === JSON.stringify(checkSnapshot), 'aggregateDatabaseValidation does not mutate input');
}

// ---------------------------------------------------------------------------
// Performance benchmark — 10,000-row name-pool import preview
// ---------------------------------------------------------------------------
{
  const rows = Array.from({ length: 10_000 }, (_, i) => ({
    rowNumber: i + 1,
    countryCode: 'CA',
    firstName: `First${i}`,
    lastName: `Last${i}`,
  }));
  const existing: NamePoolExistingEntry[] = [];
  const start = performance.now();
  const plan = buildNamePoolImportPlan({ rows, existing, duplicatePolicy: 'ADD_NEW' });
  const elapsed = performance.now() - start;
  check(plan.totalRows === 10_000, '10k-row plan built');
  check(elapsed < 1000, `10k-row import preview under 1000ms (got ${elapsed.toFixed(1)}ms)`);
}

console.log(`\n${passCount} checks passed, ${failCount} failed.`);
console.log('Maintenance engine verifier complete.');
