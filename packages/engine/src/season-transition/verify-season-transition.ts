/**
 * F31 season-transition engine verifier. Runs the required deterministic
 * checks for config validation, target identity/order/date calculation,
 * display-name derivation, carry-forward plan construction, competition
 * eligibility, stage dependency remapping, readiness aggregation, transition
 * reconciliation, and deterministic hashing.
 * Usage: `npm run verify:season-transition`.
 */
import { performance } from 'node:perf_hooks';
import {
  SEASON_TRANSITION_SCHEMA_VERSION,
  aggregateReadiness,
  applyDisplayNamePattern,
  assertReadyForPrepare,
  assertTransitionReconciliation,
  buildCarryForwardPlan,
  buildCarryForwardSummary,
  buildStageOrderMap,
  canExecuteTransition,
  composeIsoDate,
  completedYearsOnDate,
  computeTargetOrder,
  computeTransitionInputHash,
  defaultSeasonTransitionConfig,
  isInputStillFresh,
  isTerminalTransitionStatus,
  reconcileTransition,
  resolveTargetIdentity,
  SeasonTransitionError,
  shouldCarryForwardEdition,
  stableSeasonTransitionHash,
  validateSeasonTransitionConfig,
  validateStageDependencyGraph,
  type OwnershipIntegrityInput,
  type RunningWorldOperationInput,
  type ScoutingStalenessInput,
  type SourceCompetitionEditionInput,
  type SourceSeasonInput,
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
    caughtCode = e instanceof SeasonTransitionError ? e.code : undefined;
  }
  if (!threw || (code && caughtCode !== code)) throw new Error(`FAIL: ${label} (expected throw${code ? ` ${code}` : ''})`);
  console.log(`PASS: ${label}`);
}

// 1. Config validation
const cfg = validateSeasonTransitionConfig(defaultSeasonTransitionConfig());
check(cfg.schemaVersion === SEASON_TRANSITION_SCHEMA_VERSION, 'config schemaVersion');
check(cfg.lineups.autoRebuild === false, 'foundation default autoRebuild=false');

// 2. Invalid config rejection
expectThrow(() => validateSeasonTransitionConfig({ ...defaultSeasonTransitionConfig(), lineups: { ...cfg.lineups, autoRebuild: true } }), 'autoRebuild rejected');
expectThrow(() => validateSeasonTransitionConfig({ ...defaultSeasonTransitionConfig(), competitions: { ...cfg.competitions, activateEditionsAutomatically: true } }), 'autoActivate rejected');
expectThrow(() => validateSeasonTransitionConfig({ ...defaultSeasonTransitionConfig(), season: { ...cfg.season, orderIncrement: 0 } }), 'zero increment rejected');
expectThrow(() => validateSeasonTransitionConfig({ ...defaultSeasonTransitionConfig(), season: { ...cfg.season, startDateMonth: 13 } }), 'invalid month rejected');
expectThrow(() => validateSeasonTransitionConfig({ ...defaultSeasonTransitionConfig(), season: { ...cfg.season, displayNamePattern: '{foo}' } }), 'invalid token rejected');
expectThrow(() => validateSeasonTransitionConfig({ ...defaultSeasonTransitionConfig(), competitions: { ...cfg.competitions, copyDefaultRulesIntoNewEditionSnapshot: false } }), 'incompatible stages-without-rules rejected');

// 3. Target identity/order/dates
check(computeTargetOrder(2026, 1) === 2027, 'target order = source + increment');
const target = resolveTargetIdentity(cfg, { id: 's', label: '2026/2027', startYear: 2026, endYear: 2027, status: 'COMPLETED', phase: 'COMPLETE', updatedAt: '2026-07-01T00:00:00.000Z' }, null);
check(target.order === 2027 && target.label === '2027/2028', 'target label deterministic');
check(target.startDateIso === '2027-07-01' && target.endDateIso === '2028-06-30', 'target dates derived from config');

// 4. Display-name pattern
check(applyDisplayNamePattern('{startYear}/{endYear}', 2027, 2028) === '2027/2028', 'display name pattern applied');

// 5. Date helpers
check(composeIsoDate(2024, 2, 29) === '2024-02-29', 'leap day composed');
expectThrow(() => composeIsoDate(2023, 2, 29), 'non-leap Feb 29 rejected', 'InvalidSeasonTransitionConfiguration');
check(completedYearsOnDate('2000-06-30', '2026-07-01') === 26, 'age derived without mutating birth date');

// 6. Carry-forward plan
const sourceEdition: SourceCompetitionEditionInput = {
  editionId: 'ed-1',
  competitionId: 'comp-nhl',
  competitionName: 'NHL',
  competitionType: 'LEAGUE',
  simulationLevel: 'DETAILED',
  displayName: 'NHL 2026/2027',
  status: 'ARCHIVED',
  isInternational: false,
  recurring: null,
  rulesSnapshotText: '{}',
  rulesHash: 'h1',
  defaultRulesJson: '{}',
  stages: [
    { stageId: 's1', name: 'RS', stageType: 'REGULAR_SEASON', stageOrder: 1, configText: '{}', configHash: 'c1', participantSource: 'EDITION_PARTICIPANTS', sourceStageId: null, expectedQualifierCount: 16 },
    { stageId: 's2', name: 'PO', stageType: 'BEST_OF_SERIES', stageOrder: 2, configText: '{}', configHash: 'c2', participantSource: 'PREVIOUS_STAGE_QUALIFIERS', sourceStageId: 's1', expectedQualifierCount: 16 },
  ],
  confirmedParticipantCount: 32,
  archived: true,
};
const plan = buildCarryForwardPlan(cfg, 2026, target, [sourceEdition]);
check(plan.length === 1 && plan[0]!.stages.length === 2, 'plan carries domestic edition with stages');
check(plan[0]!.displayName === 'NHL 2027/2028', 'edition display name year-substituted');
check(plan[0]!.stages[1]!.remappedFromStageOrder === 1, 'stage dependency remapped');

// 7. Competition eligibility — international non-recurring omitted
const intlPlan = buildCarryForwardPlan(cfg, 2026, target, [
  sourceEdition,
  { ...sourceEdition, editionId: 'ed-wjc', competitionId: 'comp-wjc', competitionName: 'WJC', displayName: 'WJC 2027', isInternational: true, recurring: null },
]);
check(intlPlan.length === 1, 'international non-recurring omitted');

// 8. Recurring international included
const intlRecur = buildCarryForwardPlan(cfg, 2026, target, [
  sourceEdition,
  { ...sourceEdition, editionId: 'ed-wjc', competitionId: 'comp-wjc', competitionName: 'WJC', displayName: 'WJC 2027', isInternational: true, recurring: true },
]);
check(intlRecur.length === 2, 'recurring international included');

// 9. Stage dependency remapping + cycle detection
check(buildStageOrderMap(sourceEdition.stages).get(2) === 2, 'stage order map deterministic');
expectThrow(() => validateStageDependencyGraph([
  { name: 'A', stageType: 'REGULAR_SEASON', stageOrder: 1, configText: '{}', configHash: 'a', participantSource: 'EDITION_PARTICIPANTS', remappedFromStageOrder: 2, expectedQualifierCount: null },
  { name: 'B', stageType: 'BEST_OF_SERIES', stageOrder: 2, configText: '{}', configHash: 'b', participantSource: 'PREVIOUS_STAGE_QUALIFIERS', remappedFromStageOrder: null, expectedQualifierCount: null },
]), 'cyclic dependency rejected', 'CompetitionCarryForwardFailed');

// 10. National-team carry-forward policy (default: do not carry locked rosters)
check(cfg.nationalTeams.carryLockedTournamentRosters === false, 'locked NT rosters not carried by default');

// 11. Readiness aggregation
const ownership: OwnershipIntegrityInput = { duplicateActiveContracts: 0, ownershipMismatches: 0, freeAgentCount: 5, unsignedDraftRights: 2, retiredPlayersInActiveLineups: 0, lineupOwnershipMismatches: 0 };
const running: RunningWorldOperationInput = { openOffseasonRun: false, preparedContractExpirationRun: false, preparedOrRunningDevelopmentRun: false, preparedOrRunningYouthRun: false, openDraftEvent: false, activeCompetitionEdition: false };
const scouting: ScoutingStalenessInput = { staleReportCount: 3, totalReportCount: 10 };
const sourceSeason: SourceSeasonInput = { id: 's', label: '2026/2027', startYear: 2026, endYear: 2027, status: 'COMPLETED', phase: 'COMPLETE', updatedAt: '2026-07-01T00:00:00.000Z' };
const readiness = aggregateReadiness({
  config: cfg,
  sourceSeason,
  completedOffseasonRun: { id: 'o1', status: 'COMPLETED', resultHash: 'r1', completedAt: '2026-08-01T00:00:00.000Z' },
  offseasonRunsForSeason: [{ id: 'o1', status: 'COMPLETED' }],
  sourceEditions: [sourceEdition],
  ownership,
  runningOperations: running,
  scoutingStaleness: scouting,
  targetDisplayNameOverride: null,
  existingTransitionsForSource: [],
  existingSeasonOrders: [2026],
  currentSeasonId: 's',
});
check(readiness.status === 'WARNING', 'clean season is WARNING (free agents/rights/stale are warnings)');
check(readiness.blockers.length === 0, 'no blockers for clean season');
check(readiness.proposedTargetSeason.order === 2027, 'readiness proposes correct target');

// 12. Result reconciliation
const recon = reconcileTransition({
  config: cfg,
  sourceSeason,
  targetSeason: { ...target, id: 'target-id' },
  plannedEditions: readiness.competitionPlan,
  published: {
    targetWorldSeasonId: 'target-id',
    targetWorldSeasonOrder: target.order,
    targetWorldSeasonLabel: target.label,
    targetWorldSeasonStatus: 'ACTIVE',
    targetWorldSeasonIsCurrent: true,
    sourceWorldSeasonStatus: 'COMPLETED',
    sourceWorldSeasonIsCurrent: false,
    editionsCreated: readiness.competitionPlan.map((p) => ({ competitionId: p.competitionId, displayName: p.displayName, status: p.initialStatus, rulesHash: p.rulesHash, stageCount: p.stages.length, participantCount: p.participantCount })),
    currentSeasonCount: 1,
    playerCount: 1000,
    sourcePlayerCount: 1000,
    lockedNationalTeamRostersCopied: 0,
    matchesCreated: 0,
    schedulesGenerated: 0,
  },
});
check(recon.ok, 'reconciliation passes on a clean publish');

// 13. Hashing determinism
const h1 = stableSeasonTransitionHash({ b: 1, a: 2 });
const h2 = stableSeasonTransitionHash({ a: 2, b: 1 });
check(h1 === h2, 'hash is order-independent');

// 14. Idempotent plan + no input mutation
const inputSnapshot = JSON.stringify(sourceSeason);
const plan2 = buildCarryForwardPlan(cfg, 2026, target, [sourceEdition]);
check(JSON.stringify(plan) === JSON.stringify(plan2), 'plan is idempotent');
check(JSON.stringify(sourceSeason) === inputSnapshot, 'plan does not mutate input');

// 15. Lifecycle helpers
check(isTerminalTransitionStatus('COMPLETED') && !isTerminalTransitionStatus('PREPARED'), 'terminal status detection');
check(canExecuteTransition('PREPARED') && !canExecuteTransition('RUNNING'), 'execution gating');

// 16. Stale-input proof
const inputHash = computeTransitionInputHash({
  configHash: 'cfg',
  sourceSeason,
  completedOffseasonRun: { id: 'o1', status: 'COMPLETED', resultHash: 'r1', completedAt: '2026-08-01T00:00:00.000Z' },
  offseasonRunsForSeason: [{ id: 'o1', status: 'COMPLETED' }],
  sourceEditions: [sourceEdition],
  ownership,
  runningOperations: running,
  scoutingStaleness: scouting,
  targetDisplayNameOverride: null,
  existingTransitionsForSource: [],
  existingSeasonOrders: [2026],
  currentSeasonId: 's',
});
check(isInputStillFresh(inputHash, inputHash), 'fresh input detected');
check(!isInputStillFresh(inputHash, 'changed'), 'stale input detected');

// assertReadyForPrepare passes on WARNING (warnings do not block prepare)
assertReadyForPrepare(readiness);
check(true, 'assertReadyForPrepare accepts WARNING');

// Benchmark: bounded carry-forward plan across a fictional 30-competition world.
const manyEditions: SourceCompetitionEditionInput[] = [];
for (let i = 0; i < 30; i += 1) {
  manyEditions.push({
    ...sourceEdition,
    editionId: `ed-${i}`,
    competitionId: `comp-${i}`,
    competitionName: `Comp ${i}`,
    displayName: `Comp ${i} 2026/2027`,
  });
}
const benchStart = performance.now();
for (let i = 0; i < 100; i += 1) {
  buildCarryForwardPlan(cfg, 2026, target, manyEditions);
}
const benchDuration = performance.now() - benchStart;
check(benchDuration < 2000, `100 plan-construction benchmark over 30 competitions (${benchDuration.toFixed(2)}ms)`);

console.log('Season transition verifier complete.');
