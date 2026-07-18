import type {
  CheckSeverity,
  DatabaseCheckInput,
  DatabaseValidationResult,
  ValidationCheck,
  ValidationGroup,
} from './types.js';
import { stableDigest } from '../simulation/batch/hash.js';
import { sortJsonValue } from '../balance/canonicalize.js';

/**
 * Aggregate raw database-check facts into a structured validation result. The
 * server gathers every fact (via read-only SQLite + Prisma read queries); the
 * engine classifies them into OK/WARNING/BLOCKER checks. Pure — no Prisma, no
 * I/O, no silent repair.
 *
 * Returns the overall status (PASS when no WARNING/BLOCKER; WARNING when no
 * BLOCKER; FAIL when any BLOCKER), the full check list, the blocker/warning
 * subsets, the database fingerprint (echoed for diagnostic context), and a
 * deterministic result hash (proves the validation covered the same checks).
 */
export function aggregateDatabaseValidation(input: DatabaseCheckInput): DatabaseValidationResult {
  const checks: ValidationCheck[] = [];

  // --- SQLite / migrations ---
  checks.push({
    group: 'SQLITE',
    code: 'sqlite.integrityCheck',
    severity: input.integrityCheckOk ? 'OK' : 'BLOCKER',
    message: input.integrityCheckOk
      ? 'PRAGMA integrity_check passed'
      : `PRAGMA integrity_check failed: ${input.integrityCheckMessage ?? 'unknown'}`,
  });
  checks.push({
    group: 'SQLITE',
    code: 'sqlite.migrationTable',
    severity: input.hasMigrationTable ? 'OK' : 'BLOCKER',
    message: input.hasMigrationTable ? '_prisma_migrations table present' : '_prisma_migrations table is missing',
  });
  checks.push({
    group: 'SQLITE',
    code: 'sqlite.migrationCount',
    severity: input.migrationCount > 0 ? 'OK' : 'BLOCKER',
    message: input.migrationCount > 0
      ? `${input.migrationCount} migrations applied (latest: ${input.latestMigrationName ?? 'unknown'})`
      : 'No migrations applied',
  });
  const missingTables = Object.entries(input.requiredTablesPresent)
    .filter(([, present]) => !present)
    .map(([table]) => table);
  checks.push({
    group: 'SQLITE',
    code: 'sqlite.requiredTables',
    severity: missingTables.length === 0 ? 'OK' : 'BLOCKER',
    message:
      missingTables.length === 0
        ? 'All required tables present'
        : `Missing required tables: ${missingTables.join(', ')}`,
    details: missingTables.length === 0 ? undefined : { missing: missingTables },
  });

  // --- World / current season ---
  const w = input.world;
  checks.push({
    group: 'WORLD',
    code: 'world.appMeta',
    severity: w.appMetaPresent ? 'OK' : 'BLOCKER',
    message: w.appMetaPresent ? 'AppMeta row present' : 'AppMeta row missing',
  });
  checks.push({
    group: 'WORLD',
    code: 'world.initialized',
    severity: w.worldInitialized ? 'OK' : 'WARNING',
    message: w.worldInitialized ? 'World is initialized' : 'World is not initialized',
  });
  checks.push({
    group: 'WORLD',
    code: 'world.currentWorldSeason',
    severity: w.currentWorldSeasonCount === 1 ? 'OK' : w.currentWorldSeasonCount === 0 ? 'WARNING' : 'BLOCKER',
    message:
      w.currentWorldSeasonCount === 1
        ? 'Exactly one current (ACTIVE) WorldSeason'
        : w.currentWorldSeasonCount === 0
          ? 'No current (ACTIVE) WorldSeason'
          : `${w.currentWorldSeasonCount} current (ACTIVE) WorldSeasons (expected exactly one)`,
    details: { currentWorldSeasonCount: w.currentWorldSeasonCount, worldSeasonTotalCount: w.worldSeasonTotalCount },
  });

  // --- Players / Teams ---
  addCountCheck(checks, 'PLAYERS_TEAMS', 'playersTeams.duplicateExternalIds', input.playersTeams.duplicatePlayerExternalIds, 'duplicate Player externalId references');
  addCountCheck(checks, 'PLAYERS_TEAMS', 'playersTeams.invalidTeamOwnership', input.playersTeams.invalidTeamOwnership, 'invalid Team ownership records');
  addCountCheck(checks, 'PLAYERS_TEAMS', 'playersTeams.retiredInLineup', input.playersTeams.retiredPlayersInLineups, 'retired Players still in active lineups', 'WARNING');
  addCountCheck(checks, 'PLAYERS_TEAMS', 'playersTeams.missingReferences', input.playersTeams.missingRequiredReferences, 'missing required references');

  // --- Contracts ---
  addCountCheck(checks, 'CONTRACTS', 'contracts.multipleActive', input.contracts.playersWithMultipleActiveContracts, 'Players with more than one ACTIVE contract');
  addCountCheck(checks, 'CONTRACTS', 'contracts.currentTeamMismatch', input.contracts.currentPlayerTeamMismatches, 'ACTIVE contract Team != Player.currentTeamId');
  addCountCheck(checks, 'CONTRACTS', 'contracts.invalidOverlaps', input.contracts.invalidOverlaps, 'invalid ACTIVE contract overlaps');
  addCountCheck(checks, 'CONTRACTS', 'contracts.futureInconsistencies', input.contracts.futureInconsistencies, 'FUTURE contract inconsistencies');

  // --- Draft ---
  addCountCheck(checks, 'DRAFT', 'draft.pickOwnershipMismatch', input.draft.picksWithOwnershipMismatch, 'DraftPick ownership mismatches');
  addCountCheck(checks, 'DRAFT', 'draft.duplicateActiveRights', input.draft.duplicateActiveRights, 'duplicate ACTIVE draft rights');
  addCountCheck(checks, 'DRAFT', 'draft.convertedRightInconsistencies', input.draft.convertedRightInconsistencies, 'converted-rights inconsistencies');

  // --- Trades ---
  addCountCheck(checks, 'TRADES', 'trades.unreconciledAssets', input.trades.completedTradesWithUnreconciledAssets, 'completed trades with unreconciled assets');

  // --- Competitions ---
  addCountCheck(checks, 'COMPETITIONS', 'competitions.stageDependencyInvalid', input.competitions.editionStageDependencyInvalid, 'edition/stage dependency violations');
  addCountCheck(checks, 'COMPETITIONS', 'competitions.statusInconsistent', input.competitions.activeCompletedStatusInconsistent, 'active/completed status inconsistencies');
  addCountCheck(checks, 'COMPETITIONS', 'competitions.scheduleMatchOwnership', input.competitions.scheduleMatchOwnershipInvalid, 'schedule/Match ownership violations');
  addCountCheck(checks, 'COMPETITIONS', 'competitions.archiveIntegrity', input.competitions.archiveIntegrityFailures, 'competition archive integrity failures');

  // --- Statistics ---
  addCountCheck(checks, 'STATISTICS', 'statistics.orphanRecords', input.statistics.orphanStatRecords, 'orphan statistics records');
  addCountCheck(checks, 'STATISTICS', 'statistics.referenceInvalid', input.statistics.teamPlayerReferenceInvalid, 'invalid Team/Player references in statistics');
  addCountCheck(checks, 'STATISTICS', 'statistics.archivedSnapshotInconsistent', input.statistics.archivedSnapshotInconsistent, 'archived snapshot inconsistencies');

  // --- Scouting ---
  addCountCheck(checks, 'SCOUTING', 'scouting.teamPrivateOwnership', input.scouting.teamPrivateOwnershipInvalid, 'team-private scouting ownership violations');
  addCountCheck(checks, 'SCOUTING', 'scouting.reportVersionIntegrity', input.scouting.reportVersionIntegrityFailures, 'scouting report/version integrity failures');
  addCountCheck(checks, 'SCOUTING', 'scouting.assignmentState', input.scouting.assignmentStateInconsistent, 'assignment state inconsistencies');

  // --- Offseason / transitions ---
  const ot = input.offseasonTransitions;
  checks.push({
    group: 'OFFSEASON_TRANSITIONS',
    code: 'offseason.activeRunCount',
    severity: ot.activeOffseasonRunCount <= 1 ? 'OK' : 'WARNING',
    message:
      ot.activeOffseasonRunCount === 0
        ? 'No active offseason run'
        : ot.activeOffseasonRunCount === 1
          ? 'One active offseason run'
          : `${ot.activeOffseasonRunCount} active offseason runs (expected at most one)`,
    details: { activeOffseasonRunCount: ot.activeOffseasonRunCount },
  });
  addCountCheck(checks, 'OFFSEASON_TRANSITIONS', 'offseason.linkedOperationInconsistencies', ot.linkedOperationInconsistencies, 'linked-operation inconsistencies');
  addCountCheck(checks, 'OFFSEASON_TRANSITIONS', 'offseason.targetCurrentSeasonUniqueness', ot.targetCurrentSeasonUniqueness, 'target/current-season uniqueness violations');

  // --- Backups ---
  checks.push({
    group: 'BACKUPS',
    code: 'backups.subsystemConfigured',
    severity: input.backups.backupSubsystemConfigured ? 'OK' : 'WARNING',
    message: input.backups.backupSubsystemConfigured
      ? 'Backup subsystem is configured'
      : 'Backup subsystem is not configured',
  });
  checks.push({
    group: 'BACKUPS',
    code: 'backups.pendingRestoreConflict',
    severity: input.backups.pendingRestoreConflict ? 'BLOCKER' : 'OK',
    message: input.backups.pendingRestoreConflict
      ? 'A pending restore conflicts with validation scope'
      : 'No pending restore conflict',
  });

  // --- Maintenance runs (stuck detection) ---
  const mr = input.maintenance;
  const totalStuck =
    mr.stuckRunningExportCount +
    mr.stuckRunningImportCount +
    mr.stuckRunningValidationCount +
    mr.stuckRunningResetCount;
  checks.push({
    group: 'MAINTENANCE',
    code: 'maintenance.stuckRuns',
    severity: totalStuck === 0 ? 'OK' : 'WARNING',
    message:
      totalStuck === 0
        ? 'No stuck RUNNING maintenance runs'
        : `${totalStuck} stuck RUNNING maintenance runs detected`,
    details: {
      stuckRunningExportCount: mr.stuckRunningExportCount,
      stuckRunningImportCount: mr.stuckRunningImportCount,
      stuckRunningValidationCount: mr.stuckRunningValidationCount,
      stuckRunningResetCount: mr.stuckRunningResetCount,
    },
  });

  const blockers = checks.filter((c) => c.severity === 'BLOCKER');
  const warnings = checks.filter((c) => c.severity === 'WARNING');
  const status: DatabaseValidationResult['status'] =
    blockers.length > 0 ? 'FAIL' : warnings.length > 0 ? 'WARNING' : 'PASS';

  // Deterministic result hash — folds in the check codes/severities and the
  // database fingerprint. Same database + same checks → same hash.
  const resultHash = stableDigest(
    JSON.stringify(
      sortJsonValue({
        databaseFingerprint: input.databaseFingerprint,
        checks: checks.map((c) => ({ group: c.group, code: c.code, severity: c.severity })),
      }),
    ),
  );

  return {
    status,
    checks,
    blockers,
    warnings,
    databaseFingerprint: input.databaseFingerprint,
    resultHash,
  };
}

function addCountCheck(
  checks: ValidationCheck[],
  group: ValidationGroup,
  code: string,
  count: number,
  description: string,
  nonZeroSeverity: CheckSeverity = 'BLOCKER',
): void {
  checks.push({
    group,
    code,
    severity: count === 0 ? 'OK' : nonZeroSeverity,
    message: count === 0 ? `No ${description}` : `${count} ${description}`,
    details: count === 0 ? undefined : { count },
  });
}
