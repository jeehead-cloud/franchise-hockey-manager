import type {
  OffseasonConfig,
  OffseasonCompletionInput,
  OffseasonCompletionIssue,
  OffseasonCompletionResult,
  PhaseReadinessInput,
  PhaseReadinessResult,
  OffseasonReadinessCheck,
  ReadinessLevel,
  OffseasonRunState,
} from './types.js';
import { isPhaseStartable } from './progression.js';
import { stableOffseasonHash } from './hashing.js';

/**
 * F30 readiness — aggregates per-phase readiness from domain-neutral inputs the
 * server supplies, and produces a run-level completion result for FINAL_REVIEW.
 *
 * The engine never inspects Players, Contracts, DraftEvents, or lineups
 * directly — it only consumes the structured readiness inputs the server has
 * already gathered from the authoritative subsystems (F20/F24/F25/F27/F28/F29).
 */

function classifyLevel(checks: OffseasonReadinessCheck[]): ReadinessLevel {
  let hasFail = false;
  let hasWarn = false;
  for (const c of checks) {
    if (c.status === 'FAIL') hasFail = true;
    else if (c.status === 'WARN') hasWarn = true;
  }
  if (hasFail) return 'NOT_READY';
  if (hasWarn) return 'WARNING';
  return 'READY';
}

/**
 * Resolve the allowed actions for a phase given its level and the run state.
 * The action set is advisory — the server enforces which are actually permitted
 * based on Commissioner Mode and phase status.
 */
function resolveAllowedActions(
  phaseType: PhaseReadinessInput['phaseType'],
  level: ReadinessLevel,
  startable: boolean,
): PhaseReadinessResult['allowedActions'] {
  const actions: PhaseReadinessResult['allowedActions'] = ['OPEN_SUBSYSTEM'];
  if (level === 'NOT_READY') return actions;
  if (startable) {
    actions.push('START', 'LINK');
    actions.push('COMPLETE');
  }
  return actions;
}

/**
 * Aggregate one phase's readiness from its checks. The server has already
 * gathered the per-subsystem inputs (archive readiness, expiration run state,
 * development/youth/draft run state, retired-player-in-lineup flags, etc.) into
 * `ReadinessCheck` rows. The engine only classifies and hashes.
 */
export function aggregatePhaseReadiness(
  phase: PhaseReadinessInput,
  opts: { startable?: boolean } = {},
): PhaseReadinessResult {
  const level = classifyLevel(phase.checks);
  const blockers = phase.checks.filter((c) => c.status === 'FAIL').map((c) => c.message);
  const warnings = phase.checks.filter((c) => c.status === 'WARN').map((c) => c.message);
  const startable = opts.startable ?? false;
  const allowedActions = resolveAllowedActions(phase.phaseType, level, startable);
  const readinessHash = stableOffseasonHash({
    phaseType: phase.phaseType,
    checks: phase.checks.map((c) => ({ id: c.id, status: c.status })),
    linked: phase.linkedOperation,
  });
  return {
    phaseType: phase.phaseType,
    level,
    status: level,
    blockers,
    warnings,
    checks: phase.checks,
    allowedActions,
    linkedOperation: phase.linkedOperation ?? null,
    readinessHash,
  };
}

/**
 * Run-level FINAL_REVIEW completion aggregation. Consumes the world-integrity
 * inputs the server gathered (unarchived competitions, retired-in-lineup flags,
 * duplicate active contracts, etc.) plus the per-phase summary.
 *
 * Returns blockers (which must be empty for completion) and warnings (advisory).
 */
export function aggregateCompletion(
  config: OffseasonConfig,
  run: OffseasonRunState,
  input: OffseasonCompletionInput,
): OffseasonCompletionResult {
  const blockers: OffseasonCompletionIssue[] = [];
  const warnings: OffseasonCompletionIssue[] = [];
  const rules = config.completion;
  const push = (
    arr: OffseasonCompletionIssue[],
    code: string,
    message: string,
    severity: 'BLOCKER' | 'WARNING',
  ) => arr.push({ code, message, severity });

  if (!input.requiredPhasesComplete) {
    push(blockers, 'REQUIRED_PHASES_INCOMPLETE', 'One or more required phases are not complete', 'BLOCKER');
  }
  if (!input.optionalPhasesResolved) {
    push(blockers, 'OPTIONAL_PHASES_UNRESOLVED', 'One or more optional phases are not completed or skipped', 'BLOCKER');
  }
  if (input.hasFailedPhase) {
    push(blockers, 'FAILED_PHASE', 'A phase is in FAILED state and must be retried', 'BLOCKER');
  }
  if (rules.requireArchivedCompletedCompetitions && input.unarchivedRequiredCompetitions) {
    push(blockers, 'UNARCHIVED_COMPETITION', 'A required completed CompetitionEdition is not archived', 'BLOCKER');
  }
  if (rules.requireContractExpirationProcessed && !input.contractExpirationProcessed) {
    push(blockers, 'CONTRACT_EXPIRATION_MISSING', 'A completed ContractExpirationRun is required', 'BLOCKER');
  }
  if (rules.requireDevelopmentRun && !input.developmentRunComplete) {
    push(blockers, 'DEVELOPMENT_RUN_MISSING', 'A completed PlayerDevelopmentRun is required', 'BLOCKER');
  }
  if (rules.requireYouthGenerationRun && !input.youthGenerationRunComplete) {
    push(blockers, 'YOUTH_GENERATION_RUN_MISSING', 'A completed YouthGenerationRun is required', 'BLOCKER');
  }
  if (rules.requireDraftCompleted && !input.draftCompleted) {
    push(blockers, 'DRAFT_EVENT_MISSING', 'A completed DraftEvent is required', 'BLOCKER');
  }
  if (rules.requireNoRetiredPlayersInActiveLineups && input.retiredPlayersInActiveLineups) {
    push(blockers, 'RETIRED_PLAYER_IN_LINEUP', 'A retired Player still appears in an active lineup', 'BLOCKER');
  }
  if (rules.requireNoOwnershipMismatchInLineups && input.ownershipMismatchInLineups) {
    push(blockers, 'LINEUP_OWNERSHIP_MISMATCH', 'A lineup references a Player whose currentTeamId differs', 'BLOCKER');
  }
  if (rules.requireNoDuplicateActiveContracts && input.duplicateActiveContracts) {
    push(blockers, 'DUPLICATE_ACTIVE_CONTRACT', 'A Player has more than one ACTIVE contract', 'BLOCKER');
  }
  if (rules.requireNoRetiredPlayersInActiveLineups === false && input.retiredPlayersInActiveLineups) {
    push(warnings, 'RETIRED_PLAYER_IN_LINEUP', 'Retired players remain in active lineups (advisory)', 'WARNING');
  }
  if (!rules.allowOpenTradeProposals && input.openTradeProposalCount > 0) {
    push(blockers, 'OPEN_TRADE_PROPOSALS', `${input.openTradeProposalCount} submitted trade proposal(s) remain open`, 'BLOCKER');
  }
  if (!rules.allowSubmittedContractOffers && input.submittedContractOfferCount > 0) {
    push(blockers, 'SUBMITTED_CONTRACT_OFFERS', `${input.submittedContractOfferCount} submitted contract offer(s) remain open`, 'BLOCKER');
  }
  if (input.incompleteRequiredLineupsCount > 0) {
    push(blockers, 'INCOMPLETE_REQUIRED_LINEUPS', `${input.incompleteRequiredLineupsCount} required Team lineup(s) are not READY`, 'BLOCKER');
  }

  // Warnings (advisory; never block completion).
  if (!rules.allowUnsignedDraftRights && input.unsignedDraftRightsCount > 0) {
    push(warnings, 'UNSIGNED_DRAFT_RIGHTS', `${input.unsignedDraftRightsCount} unsigned ACTIVE draft right(s)`, 'WARNING');
  } else if (rules.allowUnsignedDraftRights && input.unsignedDraftRightsCount > 0) {
    push(warnings, 'UNSIGNED_DRAFT_RIGHTS', `${input.unsignedDraftRightsCount} unsigned ACTIVE draft right(s) (allowed)`, 'WARNING');
  }
  if (rules.allowFreeAgents && input.freeAgentCount > 0) {
    push(warnings, 'FREE_AGENTS_REMAIN', `${input.freeAgentCount} free agent(s) remain unsigned (allowed)`, 'WARNING');
  } else if (!rules.allowFreeAgents && input.freeAgentCount > 0) {
    push(blockers, 'FREE_AGENTS_REMAIN', `${input.freeAgentCount} free agent(s) remain unsigned`, 'BLOCKER');
  }
  if (input.runningScoutingAssignments > 0) {
    push(warnings, 'RUNNING_SCOUTING_ASSIGNMENTS', `${input.runningScoutingAssignments} scouting assignment(s) still RUNNING`, 'WARNING');
  }
  if (!input.nextWorldSeasonExists) {
    push(warnings, 'NO_NEXT_WORLD_SEASON', 'No next WorldSeason exists yet — F31 will create it (this is expected)', 'WARNING');
  }

  return { ready: blockers.length === 0, blockers, warnings };
}

/**
 * Convenience: derive a phase's startable flag from the config + run state and
 * combine with aggregatePhaseReadiness. Used by the server's readiness service.
 */
export function aggregatePhaseReadinessInRun(
  config: OffseasonConfig,
  run: OffseasonRunState,
  phase: PhaseReadinessInput,
): PhaseReadinessResult {
  const startable = isPhaseStartable(config, phase.phaseType, run.phases);
  return aggregatePhaseReadiness(phase, { startable });
}
