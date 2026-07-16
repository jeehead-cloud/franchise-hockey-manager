import {
  SeasonTransitionError,
  type ReadinessCheck,
  type ReadinessStatus,
  type SeasonTransitionConfig,
  type SourceSeasonInput,
  type TransitionBlocker,
  type TransitionReadiness,
  type TransitionWarning,
  type TransitionPreviewInput,
  type PlannedTargetEdition,
  type CarryForwardSummary,
  type TargetSeasonIdentity,
} from './types.js';
import { resolveTargetIdentity } from './identity.js';
import { buildCarryForwardPlan, buildCarryForwardSummary } from './carry-forward.js';
import { stableSeasonTransitionHash } from './hashing.js';

/**
 * Aggregate readiness for a season transition. The engine only classifies the
 * domain-neutral inputs the server supplies into BLOCKER vs WARNING; it never
 * reads the database. Returns a status plus deterministic readiness hash.
 */
export function aggregateReadiness(input: TransitionPreviewInput): TransitionReadiness {
  const { config, sourceSeason } = input;

  const checks: ReadinessCheck[] = [];
  const blockers: TransitionBlocker[] = [];
  const warnings: TransitionWarning[] = [];

  // --- Target identity (computed early; reused for plan) ---
  const target = resolveTargetIdentity(config, sourceSeason, input.targetDisplayNameOverride);

  // --- Blocker: duplicate target order already exists ---
  if (input.existingSeasonOrders.includes(target.order)) {
    // Idempotent exception: if an existing COMPLETED transition links to a
    // target season with exactly this order, we surface it as an allowed
    // idempotent re-execute (handled by the caller). Here we only block when no
    // such link exists.
    const linked = input.existingTransitionsForSource.find(
      (t) => t.status === 'COMPLETED' && t.targetWorldSeasonId !== null,
    );
    if (!linked) {
      blockers.push({ code: 'TargetWorldSeasonAlreadyExists', message: `A WorldSeason with order ${target.order} already exists and is not linked to this transition` });
    }
  }

  // --- Blocker: existing transition for this source season ---
  const conflicting = input.existingTransitionsForSource.filter((t) => t.status === 'PREPARED' || t.status === 'RUNNING' || t.status === 'COMPLETED');
  if (conflicting.length > 1) {
    blockers.push({ code: 'SeasonTransitionAlreadyExists', message: 'Multiple active transitions exist for this source season' });
  } else if (conflicting.length === 1) {
    const c = conflicting[0]!;
    if (input.targetDisplayNameOverride !== null) {
      // Override cannot change a frozen transition.
      warnings.push({ code: 'ExistingTransitionPresent', message: `An existing ${c.status} transition ${c.id} is present; re-running is idempotent` });
    }
  }

  // --- Blocker: completed F30 OffseasonRun required ---
  let completedOffseasonRun = input.completedOffseasonRun;
  if (config.completion.requireCompletedOffseasonRun) {
    if (!completedOffseasonRun) {
      blockers.push({ code: 'OffseasonRunNotCompleted', message: 'No completed OffseasonRun exists for the source WorldSeason' });
      checks.push({ id: 'completed_offseason_run', status: 'FAIL', message: 'No completed OffseasonRun' });
    } else if (completedOffseasonRun.status !== 'COMPLETED') {
      blockers.push({ code: 'OffseasonRunNotCompleted', message: `Source OffseasonRun status is ${completedOffseasonRun.status}, not COMPLETED` });
      checks.push({ id: 'completed_offseason_run', status: 'FAIL', message: `OffseasonRun status ${completedOffseasonRun.status}` });
    } else {
      checks.push({ id: 'completed_offseason_run', status: 'PASS', message: `Completed OffseasonRun ${completedOffseasonRun.id} linked` });
    }
  } else {
    checks.push({ id: 'completed_offseason_run', status: 'PASS', message: 'Completed OffseasonRun not required by config' });
  }

  // --- Blocker: source status must be finished (COMPLETED/ARCHIVED) ---
  if (sourceSeason.status !== 'COMPLETED' && sourceSeason.status !== 'ARCHIVED' && sourceSeason.status !== 'ACTIVE') {
    blockers.push({ code: 'InvalidSourceSeasonStatus', message: `Source season status ${sourceSeason.status} is not a valid transition source` });
  } else if (sourceSeason.status === 'ACTIVE') {
    // ACTIVE source is allowed only when an OffseasonRun has completed; warn.
    warnings.push({ code: 'SourceStillActive', message: 'Source season is still ACTIVE; it will be marked COMPLETED by the transition' });
  }

  // --- Blocker: archived completed competitions ---
  if (config.completion.requireArchivedCompletedCompetitions) {
    const unarchived = input.sourceEditions.filter((e) => e.status === 'COMPLETED' && !e.archived);
    if (unarchived.length > 0) {
      blockers.push({ code: 'UnarchivedCompletedCompetition', message: `${unarchived.length} COMPLETED competition edition(s) not archived: ${unarchived.slice(0, 3).map((e) => e.displayName).join(', ')}` });
      checks.push({ id: 'archived_competitions', status: 'FAIL', message: `${unarchived.length} unarchived` });
    } else {
      checks.push({ id: 'archived_competitions', status: 'PASS', message: 'All COMPLETED editions archived' });
    }
  }

  // --- Blocker: no ACTIVE/PREPARING competition edition remains ---
  if (config.completion.requireNoActiveCompetitionEdition) {
    const live = input.sourceEditions.filter((e) => e.status === 'ACTIVE' || e.status === 'PREPARING' || e.status === 'READY');
    if (live.length > 0) {
      blockers.push({ code: 'ActiveCompetitionEditionRemains', message: `${live.length} competition edition(s) remain ACTIVE/PREPARING/READY` });
      checks.push({ id: 'no_active_edition', status: 'FAIL', message: `${live.length} live edition(s)` });
    } else {
      checks.push({ id: 'no_active_edition', status: 'PASS', message: 'No live competition editions' });
    }
  }

  // --- Blocker: no running world operation ---
  if (config.completion.requireNoRunningWorldOperation) {
    const ops = input.runningOperations;
    const running: string[] = [];
    if (ops.openOffseasonRun) running.push('OffseasonRun');
    if (ops.preparedContractExpirationRun) running.push('ContractExpirationRun');
    if (ops.preparedOrRunningDevelopmentRun) running.push('PlayerDevelopmentRun');
    if (ops.preparedOrRunningYouthRun) running.push('YouthGenerationRun');
    if (ops.openDraftEvent) running.push('DraftEvent');
    if (running.length > 0) {
      blockers.push({ code: 'ConflictingWorldOperation', message: `Running world operations block transition: ${running.join(', ')}` });
      checks.push({ id: 'no_running_operation', status: 'FAIL', message: running.join(', ') });
    } else {
      checks.push({ id: 'no_running_operation', status: 'PASS', message: 'No running world operations' });
    }
  }

  // --- Blocker: ownership / contract integrity ---
  if (config.contracts.requireNoOwnershipMismatch) {
    if (input.ownership.duplicateActiveContracts > 0) {
      blockers.push({ code: 'OwnershipMismatch', message: `${input.ownership.duplicateActiveContracts} duplicate ACTIVE contract(s)` });
      checks.push({ id: 'duplicate_active_contracts', status: 'FAIL', message: `${input.ownership.duplicateActiveContracts} duplicate(s)` });
    } else {
      checks.push({ id: 'duplicate_active_contracts', status: 'PASS', message: 'No duplicate ACTIVE contracts' });
    }
    if (input.ownership.ownershipMismatches > 0) {
      blockers.push({ code: 'OwnershipMismatch', message: `${input.ownership.ownershipMismatches} contract/Player.currentTeamId mismatch(es)` });
      checks.push({ id: 'ownership_mismatch', status: 'FAIL', message: `${input.ownership.ownershipMismatches} mismatch(es)` });
    } else {
      checks.push({ id: 'ownership_mismatch', status: 'PASS', message: 'No ownership mismatches' });
    }
  }
  if (input.ownership.retiredPlayersInActiveLineups > 0) {
    blockers.push({ code: 'RetiredInLineup', message: `${input.ownership.retiredPlayersInActiveLineups} retired player(s) in active lineups` });
  }
  if (input.ownership.lineupOwnershipMismatches > 0) {
    blockers.push({ code: 'LineupOwnershipMismatch', message: `${input.ownership.lineupOwnershipMismatches} lineup slot(s) reference players no longer on the team` });
  }

  // --- Build carry-forward plan + summary (may throw on invalid deps) ---
  const competitionPlan: PlannedTargetEdition[] = buildCarryForwardPlan(
    config,
    sourceSeason.startYear,
    target,
    input.sourceEditions,
  );

  // Duplicate target edition key check: one planned edition per competition.
  const plannedKeys = new Set<string>();
  for (const p of competitionPlan) {
    const key = `${p.competitionId}`;
    if (plannedKeys.has(key)) {
      blockers.push({ code: 'CompetitionCarryForwardFailed', message: `Duplicate planned target edition for competition ${p.competitionId}` });
    }
    plannedKeys.add(key);
  }

  const carryForwardSummary: CarryForwardSummary = buildCarryForwardSummary(
    config,
    { freeAgentCount: input.ownership.freeAgentCount },
    input.ownership.unsignedDraftRights,
    input.scoutingStaleness,
  );

  // --- Warnings (non-blocking) ---
  if (input.ownership.freeAgentCount > 0) {
    warnings.push({ code: 'FreeAgentsRemain', message: `${input.ownership.freeAgentCount} free agent(s) will carry over unsigned` });
  }
  if (input.ownership.unsignedDraftRights > 0) {
    warnings.push({ code: 'UnsignedDraftRights', message: `${input.ownership.unsignedDraftRights} unsigned draft right(s) remain with their holders` });
  }
  if (input.scoutingStaleness.staleReportCount > 0) {
    warnings.push({ code: 'StaleScoutingReports', message: `${input.scoutingStaleness.staleReportCount} of ${input.scoutingStaleness.totalReportCount} scouting report(s) are stale` });
  }
  const omittedInternational = input.sourceEditions.filter((e) => e.isInternational && !competitionPlan.some((p) => p.competitionId === e.competitionId));
  if (omittedInternational.length > 0) {
    warnings.push({ code: 'InternationalTournamentNotPlanned', message: `${omittedInternational.length} international tournament(s) not carried forward (manual): ${omittedInternational.slice(0, 3).map((e) => e.competitionName).join(', ')}` });
  }
  if (config.lineups.markForReview) {
    warnings.push({ code: 'LineupsRequireReview', message: 'Carried club lineups will be marked for review (no auto-rebuild)' });
  }
  if (!config.contracts.activateApplicableFutureContracts) {
    warnings.push({ code: 'FutureContractsNotActivated', message: 'FUTURE contracts are not auto-activated by transition (resolve through F28)' });
  }
  if (target.manuallyNamed) {
    warnings.push({ code: 'ManuallyNamedTargetSeason', message: `Target season manually named "${target.displayName}"` });
  }
  if (config.nationalTeams.createEditionPreparationAutomatically === false) {
    warnings.push({ code: 'NationalTeamPreparationManual', message: 'National-team edition preparation is not automatic (create through F22)' });
  }

  // --- Status aggregation ---
  const status: ReadinessStatus = blockers.length > 0 ? 'NOT_READY' : warnings.length > 0 ? 'WARNING' : 'READY';
  const allowedActions: string[] = blockers.length === 0 ? ['PREPARE', 'PREVIEW'] : ['PREVIEW'];

  const readinessHash = stableSeasonTransitionHash({
    sourceSeasonId: sourceSeason.id,
    sourceSeasonUpdatedAt: sourceSeason.updatedAt,
    targetOrder: target.order,
    targetLabel: target.label,
    targetDisplayName: target.displayName,
    blockerCodes: blockers.map((b) => b.code).sort(),
    warningCodes: warnings.map((w) => w.code).sort(),
    plannedEditions: competitionPlan.map((p) => ({ competitionId: p.competitionId, displayName: p.displayName, rulesHash: p.rulesHash })).sort((a, b) => a.competitionId.localeCompare(b.competitionId)),
    offseasonRunId: completedOffseasonRun?.id ?? null,
    offseasonRunResultHash: completedOffseasonRun?.resultHash ?? null,
  });

  return {
    status,
    checks,
    blockers,
    warnings,
    sourceSeason,
    completedOffseasonRun,
    proposedTargetSeason: target,
    competitionPlan,
    carryForwardSummary,
    allowedActions,
    readinessHash,
  };
}

/** Convenience: produce the readiness for a single source season from inputs. */
export function computeReadiness(
  sourceSeason: SourceSeasonInput,
  previewInput: Omit<TransitionPreviewInput, 'sourceSeason'>,
): TransitionReadiness {
  return aggregateReadiness({ ...previewInput, sourceSeason });
}

/** Throw a typed error if readiness is not prepared-able. */
export function assertReadyForPrepare(readiness: TransitionReadiness): void {
  if (readiness.status === 'NOT_READY') {
    throw new SeasonTransitionError(
      'SeasonTransitionNotReady',
      `Transition is not ready: ${readiness.blockers.map((b) => b.code).join(', ')}`,
      { blockers: readiness.blockers },
    );
  }
}
