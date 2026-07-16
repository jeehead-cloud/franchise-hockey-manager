import type { PrismaClient } from '@prisma/client';
import {
  aggregatePhaseReadinessInRun,
  isPhaseStartable,
  phaseCategory,
  summarizeRunPhases,
  type OffseasonCompletionInput,
  type OffseasonConfig,
  type OffseasonPhaseState,
  type OffseasonRunState,
  type OffseasonPhaseType,
  type PhaseReadinessInput,
  type PhaseReadinessResult,
  type OffseasonReadinessCheck,
} from '@fhm/engine';
import { prisma } from '../db/client.js';
import {
  findArchivedEditions,
  findCompletedContractExpirationRun,
  findCompletedDevelopmentRun,
  findCompletedDraftEvent,
  findCompletedYouthGenerationRun,
  findNextWorldSeason,
} from './offseason-links.js';

type Db = PrismaClient | Parameters<Parameters<PrismaClient['$transaction']>[0]>[0];

const PHASE_LABEL: Record<OffseasonPhaseType, string> = {
  COMPETITION_ARCHIVE: 'Competition Archive',
  CONTRACT_EXPIRATION: 'Contract Expiration',
  PLAYER_DEVELOPMENT: 'Player Development',
  RETIREMENT_REVIEW: 'Retirement Review',
  YOUTH_GENERATION: 'Youth Generation',
  DRAFT: 'Amateur Draft',
  DRAFTED_PLAYER_SIGNINGS: 'Drafted Player Signings',
  FREE_AGENCY: 'Free Agency',
  TRADES: 'Trades',
  ROSTER_REVIEW: 'Roster Review',
  LINEUP_REVIEW: 'Lineup Review',
  SCOUTING_REVIEW: 'Scouting Review',
  FINAL_REVIEW: 'Final Review',
};

/** Map a persisted phase row to the engine OffseasonPhaseState view. */
export function phaseRowToState(
  row: {
    phaseType: string;
    phaseOrder: number;
    status: string;
    required: boolean;
    allowSkip: boolean;
    competitionArchiveIds: string | null;
    contractExpirationRunId: string | null;
    playerDevelopmentRunId: string | null;
    youthGenerationRunId: string | null;
    draftEventId: string | null;
  },
): OffseasonPhaseState {
  return {
    phaseType: row.phaseType as OffseasonPhaseType,
    order: row.phaseOrder,
    status: row.status as OffseasonPhaseState['status'],
    required: row.required,
    allowSkip: row.allowSkip,
    linked: {
      competitionArchiveIds: row.competitionArchiveIds ? JSON.parse(row.competitionArchiveIds) : undefined,
      contractExpirationRunId: row.contractExpirationRunId,
      playerDevelopmentRunId: row.playerDevelopmentRunId,
      youthGenerationRunId: row.youthGenerationRunId,
      draftEventId: row.draftEventId,
    },
  };
}

/** Map the persisted run + phases into the engine OffseasonRunState view. */
export function runRowToState(run: {
  status: string;
  phases: Array<Parameters<typeof phaseRowToState>[0]>;
}): OffseasonRunState {
  return {
    status: run.status as OffseasonRunState['status'],
    phases: run.phases.map(phaseRowToState),
  };
}

// ---------------------------------------------------------------------------
// Per-phase readiness — gather domain-neutral checks from underlying subsystems
// ---------------------------------------------------------------------------

async function competitionArchiveChecks(worldSeasonId: string, db: Db): Promise<{ checks: OffseasonReadinessCheck[]; linkedOperation: PhaseReadinessInput['linkedOperation'] }> {
  const archived = await findArchivedEditions(worldSeasonId, db);
  const completed = await db.competitionEdition.findMany({
    where: { worldSeasonId, status: 'COMPLETED' },
    select: { id: true, displayName: true },
  });
  const incomplete = await db.competitionEdition.findMany({
    where: { worldSeasonId, status: { in: ['PREPARING', 'READY', 'ACTIVE'] } },
    select: { id: true, displayName: true },
  });
  const checks: OffseasonReadinessCheck[] = [];
  if (incomplete.length > 0) {
    checks.push({ id: 'incomplete_competitions', status: 'WARN', message: `${incomplete.length} competition edition(s) not COMPLETED yet: ${incomplete.slice(0, 3).map((e) => e.displayName).join(', ')}` });
  } else {
    checks.push({ id: 'incomplete_competitions', status: 'PASS', message: 'No incomplete competition editions blocking archive' });
  }
  if (completed.length === 0 && archived.length === 0) {
    checks.push({ id: 'nothing_to_archive', status: 'PASS', message: 'No COMPLETED competition editions require archiving' });
  } else if (completed.length > archived.length) {
    checks.push({ id: 'unarchived_completed', status: 'FAIL', message: `${completed.length - archived.length} completed edition(s) not yet archived` });
  } else {
    checks.push({ id: 'archives_present', status: 'PASS', message: `${archived.length} archive(s) already present` });
  }
  const linked = archived.length > 0 ? { type: 'ARCHIVE_BATCH', id: null, summary: `${archived.length} archived edition(s)` } : null;
  return { checks, linkedOperation: linked };
}

async function contractExpirationChecks(worldSeasonId: string, db: Db): Promise<{ checks: OffseasonReadinessCheck[]; linkedOperation: PhaseReadinessInput['linkedOperation'] }> {
  const meta = await db.appMeta.findUnique({ where: { id: 'default' }, select: { contractsInitializedAt: true } });
  const checks: OffseasonReadinessCheck[] = [];
  if (!meta?.contractsInitializedAt) {
    checks.push({ id: 'contracts_initialized', status: 'FAIL', message: 'F28 contract system not initialized' });
  } else {
    checks.push({ id: 'contracts_initialized', status: 'PASS', message: 'F28 contract system initialized' });
  }
  const preparedOrRunning = await db.contractExpirationRun.findFirst({ where: { worldSeasonId, status: 'PREPARED' } });
  if (preparedOrRunning) {
    checks.push({ id: 'prepared_run', status: 'WARN', message: `A PREPARED expiration run ${preparedOrRunning.id} exists — execute it through F28` });
  }
  const completed = await findCompletedContractExpirationRun(worldSeasonId, db);
  if (completed) {
    checks.push({ id: 'completed_run', status: 'PASS', message: `Completed expiration run linked (${completed.expiredCount} expired, ${completed.activatedFutureCount} activated, ${completed.freeAgentCount} free agents)` });
  } else if (meta?.contractsInitializedAt) {
    checks.push({ id: 'completed_run', status: 'WARN', message: 'No completed ContractExpirationRun yet — prepare and execute through F28' });
  }
  const linked = completed ? { type: 'CONTRACT_EXPIRATION_RUN', id: completed.id, summary: `${completed.expiredCount} expired` } : null;
  return { checks, linkedOperation: linked };
}

async function playerDevelopmentChecks(worldSeasonId: string, db: Db): Promise<{ checks: OffseasonReadinessCheck[]; linkedOperation: PhaseReadinessInput['linkedOperation'] }> {
  const checks: OffseasonReadinessCheck[] = [];
  const preparedOrRunning = await db.playerDevelopmentRun.findFirst({ where: { worldSeasonId, status: { in: ['PREPARED', 'RUNNING'] } } });
  if (preparedOrRunning) {
    checks.push({ id: 'active_run', status: 'WARN', message: `A ${preparedOrRunning.status} development run ${preparedOrRunning.id} exists — execute it through F24` });
  }
  const completed = await findCompletedDevelopmentRun(worldSeasonId, db);
  if (completed) {
    checks.push({ id: 'completed_run', status: 'PASS', message: `Completed development run linked (${completed.developedCount} developed, ${completed.declinedCount} declined, ${completed.retiredCount} retired)` });
  } else {
    checks.push({ id: 'completed_run', status: 'WARN', message: 'No completed PlayerDevelopmentRun yet — prepare and execute through F24' });
  }
  const linked = completed ? { type: 'PLAYER_DEVELOPMENT_RUN', id: completed.id, summary: `${completed.developedCount} developed` } : null;
  return { checks, linkedOperation: linked };
}

async function retirementReviewChecks(worldSeasonId: string, db: Db): Promise<{ checks: OffseasonReadinessCheck[]; linkedOperation: PhaseReadinessInput['linkedOperation'] }> {
  const devCompleted = await findCompletedDevelopmentRun(worldSeasonId, db);
  const checks: OffseasonReadinessCheck[] = [];
  if (!devCompleted) {
    checks.push({ id: 'development_complete', status: 'FAIL', message: 'PlayerDevelopmentRun must complete first' });
    return { checks, linkedOperation: null };
  }
  checks.push({ id: 'development_complete', status: 'PASS', message: 'Development run complete' });
  const retired = await db.player.count({ where: { rosterStatus: 'RETIRED' } });
  const retiredInLineups = await countRetiredPlayersInActiveLineups(db);
  checks.push({ id: 'retired_count', status: 'PASS', message: `${retired} retired player(s) detected by F24` });
  if (retiredInLineups.blockers > 0) {
    checks.push({ id: 'retired_in_lineup', status: 'FAIL', message: `${retiredInLineups.blockers} retired player(s) still in active lineups — remove them before completing Roster/Lineup review` });
  } else {
    checks.push({ id: 'retired_in_lineup', status: 'PASS', message: 'No retired players in active lineups (will be re-checked at Roster/Lineup review)' });
  }
  return { checks, linkedOperation: null };
}

async function youthGenerationChecks(worldSeasonId: string, db: Db): Promise<{ checks: OffseasonReadinessCheck[]; linkedOperation: PhaseReadinessInput['linkedOperation'] }> {
  const checks: OffseasonReadinessCheck[] = [];
  const preparedOrRunning = await db.youthGenerationRun.findFirst({ where: { worldSeasonId, status: { in: ['PREPARED', 'RUNNING'] } } });
  if (preparedOrRunning) {
    checks.push({ id: 'active_run', status: 'WARN', message: `A ${preparedOrRunning.status} youth-generation run ${preparedOrRunning.id} exists — execute it through F25` });
  }
  const completed = await findCompletedYouthGenerationRun(worldSeasonId, db);
  if (completed) {
    checks.push({ id: 'completed_run', status: 'PASS', message: 'Completed youth-generation run linked' });
  } else {
    checks.push({ id: 'completed_run', status: 'WARN', message: 'No completed YouthGenerationRun yet — prepare and execute through F25' });
  }
  const linked = completed ? { type: 'YOUTH_GENERATION_RUN', id: completed.id, summary: null } : null;
  return { checks, linkedOperation: linked };
}

async function draftChecks(worldSeasonId: string, db: Db): Promise<{ checks: OffseasonReadinessCheck[]; linkedOperation: PhaseReadinessInput['linkedOperation'] }> {
  const checks: OffseasonReadinessCheck[] = [];
  const youth = await findCompletedYouthGenerationRun(worldSeasonId, db);
  if (!youth) {
    checks.push({ id: 'youth_complete', status: 'FAIL', message: 'YouthGenerationRun must complete first' });
    return { checks, linkedOperation: null };
  }
  checks.push({ id: 'youth_complete', status: 'PASS', message: 'Youth generation complete' });
  const openEvent = await db.draftEvent.findFirst({ where: { worldSeasonId, status: { in: ['PLANNED', 'PREPARING', 'READY', 'IN_PROGRESS'] } } });
  if (openEvent) {
    checks.push({ id: 'open_event', status: 'WARN', message: `Draft event ${openEvent.name} (${openEvent.status}) is open — complete it through F27` });
  }
  const completed = await findCompletedDraftEvent(worldSeasonId, db);
  if (completed) {
    checks.push({ id: 'completed_event', status: 'PASS', message: `Completed draft event linked: ${completed.name}` });
  } else {
    checks.push({ id: 'completed_event', status: 'WARN', message: 'No completed DraftEvent yet — create and complete one through F27' });
  }
  const linked = completed ? { type: 'DRAFT_EVENT', id: completed.id, summary: completed.name } : null;
  return { checks, linkedOperation: linked };
}

async function draftedSigningsChecks(db: Db): Promise<{ checks: OffseasonReadinessCheck[]; linkedOperation: PhaseReadinessInput['linkedOperation'] }> {
  const active = await db.playerDraftRight.count({ where: { status: 'ACTIVE' } });
  const checks: OffseasonReadinessCheck[] = [];
  if (active === 0) {
    checks.push({ id: 'no_active_rights', status: 'PASS', message: 'No ACTIVE draft rights remain unsigned' });
  } else {
    checks.push({ id: 'active_rights', status: 'WARN', message: `${active} ACTIVE draft right(s) remain unsigned (may be skipped if config allows)` });
  }
  return { checks, linkedOperation: null };
}

async function freeAgencyChecks(db: Db): Promise<{ checks: OffseasonReadinessCheck[]; linkedOperation: PhaseReadinessInput['linkedOperation'] }> {
  const submitted = await db.contractOffer.count({ where: { status: 'SUBMITTED' } });
  const freeAgents = await countFreeAgents(db);
  const checks: OffseasonReadinessCheck[] = [];
  if (submitted > 0) checks.push({ id: 'submitted_offers', status: 'WARN', message: `${submitted} submitted contract offer(s) open` });
  else checks.push({ id: 'submitted_offers', status: 'PASS', message: 'No open submitted contract offers' });
  if (freeAgents > 0) checks.push({ id: 'free_agents', status: 'WARN', message: `${freeAgents} free agent(s) remain (allowed to complete phase)` });
  else checks.push({ id: 'free_agents', status: 'PASS', message: 'No free agents remain' });
  return { checks, linkedOperation: null };
}

async function tradesChecks(db: Db): Promise<{ checks: OffseasonReadinessCheck[]; linkedOperation: PhaseReadinessInput['linkedOperation'] }> {
  const open = await db.tradeProposal.count({ where: { status: 'SUBMITTED' } });
  const draft = await db.tradeProposal.count({ where: { status: 'DRAFT' } });
  const checks: OffseasonReadinessCheck[] = [];
  if (open > 0) checks.push({ id: 'submitted_proposals', status: 'WARN', message: `${open} submitted trade proposal(s) open (must be resolved before completion if config disallows)` });
  else checks.push({ id: 'submitted_proposals', status: 'PASS', message: 'No submitted trade proposals' });
  if (draft > 0) checks.push({ id: 'draft_proposals', status: 'WARN', message: `${draft} draft proposal(s) in progress (advisory)` });
  return { checks, linkedOperation: null };
}

async function rosterReviewChecks(db: Db): Promise<{ checks: OffseasonReadinessCheck[]; linkedOperation: PhaseReadinessInput['linkedOperation'] }> {
  const checks: OffseasonReadinessCheck[] = [];
  const mismatch = await countOwnershipMismatches(db);
  if (mismatch.duplicateActiveContracts > 0) {
    checks.push({ id: 'duplicate_active_contracts', status: 'FAIL', message: `${mismatch.duplicateActiveContracts} player(s) have more than one ACTIVE contract` });
  } else {
    checks.push({ id: 'duplicate_active_contracts', status: 'PASS', message: 'No duplicate ACTIVE contracts' });
  }
  if (mismatch.ownershipMismatch > 0) {
    checks.push({ id: 'ownership_mismatch', status: 'FAIL', message: `${mismatch.ownershipMismatch} player(s) where currentTeamId != ACTIVE contract team` });
  } else {
    checks.push({ id: 'ownership_mismatch', status: 'PASS', message: 'Player.currentTeamId matches ACTIVE contract holder' });
  }
  return { checks, linkedOperation: null };
}

async function lineupReviewChecks(db: Db): Promise<{ checks: OffseasonReadinessCheck[]; linkedOperation: PhaseReadinessInput['linkedOperation'] }> {
  const checks: OffseasonReadinessCheck[] = [];
  const result = await countLineupIssues(db);
  if (result.retiredInLineup > 0) {
    checks.push({ id: 'retired_in_lineup', status: 'FAIL', message: `${result.retiredInLineup} lineup slot(s) reference a RETIRED player` });
  } else {
    checks.push({ id: 'retired_in_lineup', status: 'PASS', message: 'No retired players in any lineup slot' });
  }
  if (result.ownershipMismatch > 0) {
    checks.push({ id: 'lineup_ownership_mismatch', status: 'FAIL', message: `${result.ownershipMismatch} lineup slot(s) reference a player no longer on that team` });
  } else {
    checks.push({ id: 'lineup_ownership_mismatch', status: 'PASS', message: 'Every lineup slot belongs to its owning team' });
  }
  if (result.incompleteRequiredLineups > 0) {
    checks.push({ id: 'incomplete_required_lineups', status: 'FAIL', message: `${result.incompleteRequiredLineups} detailed-club lineup(s) are not READY` });
  } else {
    checks.push({ id: 'incomplete_required_lineups', status: 'PASS', message: 'All detailed-club lineups are READY' });
  }
  return { checks, linkedOperation: null };
}

async function scoutingReviewChecks(db: Db): Promise<{ checks: OffseasonReadinessCheck[]; linkedOperation: PhaseReadinessInput['linkedOperation'] }> {
  const checks: OffseasonReadinessCheck[] = [];
  // F26 assignments are PREPARED or COMPLETED (no RUNNING state). Open PREPARED
  // assignments are advisory — the user may still execute them through F26.
  const prepared = await db.scoutingAssignment.count({ where: { status: 'PREPARED' } });
  if (prepared > 0) checks.push({ id: 'prepared_assignments', status: 'WARN', message: `${prepared} PREPARED scouting assignment(s) not yet executed` });
  else checks.push({ id: 'prepared_assignments', status: 'PASS', message: 'No open PREPARED scouting assignments' });
  // Staleness is computed by F26 against the player-state hash; F30 surfaces the
  // latest report count as an advisory, not a stale-vs-current computation.
  const reports = await db.teamScoutingReport.count();
  checks.push({ id: 'reports_present', status: 'PASS', message: `${reports} scouting report version(s) on record (rescout via F26 to refresh stale reports after development)` });
  return { checks, linkedOperation: null };
}

/**
 * Resolve one phase's readiness for the given WorldSeason + run state.
 * Combines domain-neutral checks with the engine aggregator.
 */
export async function computePhaseReadiness(
  config: OffseasonConfig,
  run: OffseasonRunState,
  phaseType: OffseasonPhaseType,
  worldSeasonId: string,
  db: Db = prisma,
): Promise<PhaseReadinessResult> {
  let checks: OffseasonReadinessCheck[] = [];
  let linkedOperation: PhaseReadinessInput['linkedOperation'] = null;
  switch (phaseType) {
    case 'COMPETITION_ARCHIVE': ({ checks, linkedOperation } = await competitionArchiveChecks(worldSeasonId, db)); break;
    case 'CONTRACT_EXPIRATION': ({ checks, linkedOperation } = await contractExpirationChecks(worldSeasonId, db)); break;
    case 'PLAYER_DEVELOPMENT': ({ checks, linkedOperation } = await playerDevelopmentChecks(worldSeasonId, db)); break;
    case 'RETIREMENT_REVIEW': ({ checks, linkedOperation } = await retirementReviewChecks(worldSeasonId, db)); break;
    case 'YOUTH_GENERATION': ({ checks, linkedOperation } = await youthGenerationChecks(worldSeasonId, db)); break;
    case 'DRAFT': ({ checks, linkedOperation } = await draftChecks(worldSeasonId, db)); break;
    case 'DRAFTED_PLAYER_SIGNINGS': ({ checks, linkedOperation } = await draftedSigningsChecks(db)); break;
    case 'FREE_AGENCY': ({ checks, linkedOperation } = await freeAgencyChecks(db)); break;
    case 'TRADES': ({ checks, linkedOperation } = await tradesChecks(db)); break;
    case 'ROSTER_REVIEW': ({ checks, linkedOperation } = await rosterReviewChecks(db)); break;
    case 'LINEUP_REVIEW': ({ checks, linkedOperation } = await lineupReviewChecks(db)); break;
    case 'SCOUTING_REVIEW': ({ checks, linkedOperation } = await scoutingReviewChecks(db)); break;
    case 'FINAL_REVIEW': checks = [{ id: 'final_review', status: 'PASS', message: 'Aggregated final readiness computed on demand' }]; break;
  }
  const phaseRow = run.phases.find((p) => p.phaseType === phaseType);
  // A phase that is already COMPLETED or SKIPPED shows its existing status as PASS.
  if (phaseRow && (phaseRow.status === 'COMPLETED' || phaseRow.status === 'SKIPPED')) {
    checks = [{ id: 'phase_resolved', status: 'PASS', message: `Phase ${phaseRow.status} on ${new Date().toISOString()}` }];
  }
  const input: PhaseReadinessInput = {
    phaseType,
    checks,
    linkedOperation,
    allowedActions: [],
  };
  return aggregatePhaseReadinessInRun(config, run, input);
}

// ---------------------------------------------------------------------------
// World-integrity counters used by FINAL_REVIEW completion
// ---------------------------------------------------------------------------

async function countRetiredPlayersInActiveLineups(db: Db): Promise<{ blockers: number }> {
  const rows = await db.lineupAssignment.count({
    where: { player: { rosterStatus: 'RETIRED' } },
  });
  return { blockers: rows };
}

async function countOwnershipMismatches(db: Db): Promise<{ duplicateActiveContracts: number; ownershipMismatch: number }> {
  // Duplicate ACTIVE contracts: players with > 1 ACTIVE contract.
  const dupRows = await db.playerContract.groupBy({
    by: ['playerId'],
    where: { status: 'ACTIVE' },
    _count: { id: true },
    having: { id: { _count: { gt: 1 } } },
  });
  // currentTeamId != ACTIVE contract team (where the player has an ACTIVE contract and a current team).
  const activeContracts = await db.playerContract.findMany({
    where: { status: 'ACTIVE' },
    select: { playerId: true, teamId: true },
  });
  const byPlayer = new Map<string, string>();
  for (const c of activeContracts) byPlayer.set(c.playerId, c.teamId);
  const playerIds = [...byPlayer.keys()];
  const players = await db.player.findMany({ where: { id: { in: playerIds } }, select: { id: true, currentTeamId: true } });
  let mismatch = 0;
  for (const p of players) {
    const expected = byPlayer.get(p.id);
    if (expected && p.currentTeamId !== expected) mismatch += 1;
  }
  return { duplicateActiveContracts: dupRows.length, ownershipMismatch: mismatch };
}

async function countLineupIssues(db: Db): Promise<{ retiredInLineup: number; ownershipMismatch: number; incompleteRequiredLineups: number }> {
  // LineupAssignment has no teamId — reach the team through lineup.teamId.
  const retiredAssignments = await db.lineupAssignment.findMany({
    where: { player: { rosterStatus: 'RETIRED' } },
    select: { playerId: true, lineup: { select: { teamId: true } } },
  });
  // Ownership mismatch: lineup slots referencing a player whose currentTeamId
  // differs from the lineup's team. Bounded: join through lineup.teamId.
  const assignments = await db.lineupAssignment.findMany({
    where: { player: { currentTeamId: { not: null } } },
    select: { playerId: true, lineup: { select: { teamId: true } } },
  });
  const playerIds = [...new Set(assignments.map((a) => a.playerId))];
  const players = await db.player.findMany({ where: { id: { in: playerIds } }, select: { id: true, currentTeamId: true } });
  const currentTeam = new Map<string, string | null>();
  for (const p of players) currentTeam.set(p.id, p.currentTeamId);
  let lineupOwnershipMismatch = 0;
  for (const a of assignments) {
    const expected = currentTeam.get(a.playerId);
    if (expected && expected !== a.lineup.teamId) lineupOwnershipMismatch += 1;
  }
  // Incomplete required lineups: detailed CLUB teams with no lineup assignments
  // at all. F30 does not enforce a full 20-slot cap; readiness warnings remain.
  const detailedTeams = await db.team.findMany({
    where: { teamType: 'CLUB', league: { simulationLevel: 'DETAILED' } },
    select: { id: true, lineup: { select: { _count: { select: { assignments: true } } } } },
  });
  const incompleteRequiredLineups = detailedTeams.filter((t) => (t.lineup?._count.assignments ?? 0) === 0).length;
  return { retiredInLineup: retiredAssignments.length, ownershipMismatch: lineupOwnershipMismatch, incompleteRequiredLineups };
}

async function countFreeAgents(db: Db): Promise<number> {
  // Free agents: players with no currentTeamId and no ACTIVE contract who are not RETIRED/PROSPECT.
  const total = await db.player.count({
    where: { currentTeamId: null, rosterStatus: 'ACTIVE', contracts: { none: { status: 'ACTIVE' } } },
  });
  return total;
}

/**
 * Gather the full OffseasonCompletionInput for FINAL_REVIEW aggregation. Batches
 * world-integrity queries; never invokes a domain write API.
 */
export async function gatherCompletionInput(
  config: OffseasonConfig,
  run: OffseasonRunState,
  worldSeasonId: string,
  db: Db = prisma,
): Promise<OffseasonCompletionInput> {
  const summary = summarizeRunPhases(run, config);
  const archived = await findArchivedEditions(worldSeasonId, db);
  const completedEditions = await db.competitionEdition.count({ where: { worldSeasonId, status: 'COMPLETED' } });
  const dev = await findCompletedDevelopmentRun(worldSeasonId, db);
  const youth = await findCompletedYouthGenerationRun(worldSeasonId, db);
  const draft = await findCompletedDraftEvent(worldSeasonId, db);
  const expiration = await findCompletedContractExpirationRun(worldSeasonId, db);
  const ownership = await countOwnershipMismatches(db);
  const lineups = await countLineupIssues(db);
  const freeAgents = await countFreeAgents(db);
  const openTradeProposals = await db.tradeProposal.count({ where: { status: 'SUBMITTED' } });
  const submittedOffers = await db.contractOffer.count({ where: { status: 'SUBMITTED' } });
  const unsignedRights = await db.playerDraftRight.count({ where: { status: 'ACTIVE' } });
  // F26 has no RUNNING status; surface open PREPARED assignments as the
  // advisory operational analog (warning only — completion rules never block on
  // scouting in the default config).
  const runningScouting = await db.scoutingAssignment.count({ where: { status: 'PREPARED' } });
  const nextSeason = await findNextWorldSeason(worldSeasonId, db);

  return {
    requiredPhasesComplete: summary.allRequiredComplete,
    optionalPhasesResolved: summary.allOptionalResolved,
    hasFailedPhase: summary.hasFailedPhase,
    unarchivedRequiredCompetitions: completedEditions > archived.length,
    contractExpirationProcessed: Boolean(expiration),
    developmentRunComplete: Boolean(dev),
    youthGenerationRunComplete: Boolean(youth),
    draftCompleted: Boolean(draft),
    retiredPlayersInActiveLineups: lineups.retiredInLineup > 0,
    ownershipMismatchInLineups: lineups.ownershipMismatch > 0,
    duplicateActiveContracts: ownership.duplicateActiveContracts > 0,
    unsignedDraftRightsCount: unsignedRights,
    freeAgentCount: freeAgents,
    openTradeProposalCount: openTradeProposals,
    submittedContractOfferCount: submittedOffers,
    incompleteRequiredLineupsCount: lineups.incompleteRequiredLineups,
    nextWorldSeasonExists: Boolean(nextSeason),
    runningScoutingAssignments: runningScouting,
  };
}

export function phaseLabel(type: OffseasonPhaseType): string {
  return PHASE_LABEL[type];
}

export function phaseCategoryLabel(type: OffseasonPhaseType): string {
  return phaseCategory(type);
}

export function isStartable(
  config: OffseasonConfig,
  phaseType: OffseasonPhaseType,
  phases: OffseasonPhaseState[],
): boolean {
  return isPhaseStartable(config, phaseType, phases);
}
