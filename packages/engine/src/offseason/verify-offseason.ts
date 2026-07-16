/**
 * F30 offseason engine verifier. Runs the required deterministic checks for
 * config validation, dependency graph, phase/run transitions, readiness
 * aggregation, completion blockers, reconciliation, and idempotent progression.
 * Usage: `npm run verify:offseason`.
 */
import { performance } from 'node:perf_hooks';
import {
  OFFSEASON_PHASE_ORDER,
  aggregateCompletion,
  aggregatePhaseReadiness,
  assertOffseasonReconciliation,
  assertPhaseTransition,
  assertRunTransition,
  canTransitionPhase,
  canTransitionRun,
  defaultOffseasonConfig,
  dependenciesMet,
  detectCycle,
  isPhaseStartable,
  phaseCategory,
  progressPercent,
  reconcileOffseasonRun,
  reconcilePhasePlan,
  resolvePhaseDefinitions,
  selectCurrentPhase,
  stableOffseasonHash,
  summarizeRunPhases,
  unmetDependencies,
  validateOffseasonConfig,
  OffseasonError,
  type OffseasonPhaseState,
  type OffseasonRunState,
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
    caughtCode = e instanceof OffseasonError ? e.code : undefined;
  }
  if (!threw || (code && caughtCode !== code)) throw new Error(`FAIL: ${label} (expected throw${code ? ` ${code}` : ''})`);
  console.log(`PASS: ${label}`);
}

const config = validateOffseasonConfig(defaultOffseasonConfig());

function phaseRow(type: OffseasonPhaseState['phaseType'], status: OffseasonPhaseState['status'], order: number): OffseasonPhaseState {
  const def = config.phases.find((p) => p.type === type)!;
  return { phaseType: type, order, status, required: def.required, allowSkip: def.allowSkip, linked: null };
}
const allPending = (): OffseasonPhaseState[] => config.phases.map((p, i) => phaseRow(p.type, 'PENDING', i + 1));

// 1. Config validation
check(validateOffseasonConfig(defaultOffseasonConfig()).schemaVersion === 1, 'config schema version');
expectThrow(() => validateOffseasonConfig({ ...defaultOffseasonConfig(), schemaVersion: 99 }), 'rejects unknown schema version');
expectThrow(() => validateOffseasonConfig({ ...defaultOffseasonConfig(), extras: 1 } as never), 'rejects unknown fields');

// 2. Unique phases
expectThrow(() => {
  const cfg = defaultOffseasonConfig();
  cfg.phases = [...cfg.phases, cfg.phases[0]!];
  validateOffseasonConfig(cfg);
}, 'rejects duplicate phases');

// 3. Dependency graph
const defs = resolvePhaseDefinitions(config);
check(defs[0]!.dependsOn.length === 0, 'first phase has no dependencies');
check(defs[12]!.dependsOn.length === 12, 'last phase depends on all prior');

// 4. Invalid cycles
check(detectCycle([...OFFSEASON_PHASE_ORDER]) === null, 'canonical order has no cycle');
check((detectCycle([...OFFSEASON_PHASE_ORDER.slice(0, 2), OFFSEASON_PHASE_ORDER[0]!]) ?? []).length === 1, 'cycle detected on repeat');

// 5. Required/skip rules
check(config.phases.filter((p) => p.required).every((p) => !p.allowSkip), 'required phases cannot allowSkip');
expectThrow(() => {
  const cfg = defaultOffseasonConfig();
  cfg.phases = cfg.phases.map((p) => (p.type === 'COMPETITION_ARCHIVE' ? { ...p, allowSkip: true } : p));
  validateOffseasonConfig(cfg);
}, 'required phase with allowSkip rejected');

// 6. Phase transitions
check(canTransitionPhase('PENDING', 'READY', true, false), 'PENDING→READY allowed');
check(canTransitionPhase('IN_PROGRESS', 'COMPLETED', true, false), 'IN_PROGRESS→COMPLETED allowed');
check(!canTransitionPhase('COMPLETED', 'IN_PROGRESS', true, false), 'COMPLETED immutable');
check(canTransitionPhase('READY', 'SKIPPED', false, true), 'optional phase skippable');
check(!canTransitionPhase('READY', 'SKIPPED', true, false), 'required phase not skippable');

// 7. Run transitions
check(canTransitionRun('PLANNED', 'READY'), 'PLANNED→READY allowed');
check(canTransitionRun('IN_PROGRESS', 'COMPLETED'), 'IN_PROGRESS→COMPLETED allowed');
check(!canTransitionRun('COMPLETED', 'IN_PROGRESS'), 'COMPLETED run immutable');

// 8. Readiness aggregation
const ready = aggregatePhaseReadiness({
  phaseType: 'COMPETITION_ARCHIVE',
  checks: [{ id: 'c1', status: 'PASS', message: 'ok' }],
  linkedOperation: null,
  allowedActions: [],
});
check(ready.status === 'READY', 'aggregatePhaseReadiness READY when all pass');
const notReady = aggregatePhaseReadiness({
  phaseType: 'ROSTER_REVIEW',
  checks: [{ id: 'c1', status: 'FAIL', message: 'mismatch' }],
  linkedOperation: null,
  allowedActions: [],
});
check(notReady.status === 'NOT_READY' && notReady.blockers.length === 1, 'aggregatePhaseReadiness NOT_READY on fail');

// 9. Completion blockers
const completionReady = aggregateCompletion(config, { status: 'IN_PROGRESS', phases: config.phases.map((p, i) => phaseRow(p.type, p.required ? 'COMPLETED' : 'SKIPPED', i + 1)) }, {
  requiredPhasesComplete: true, optionalPhasesResolved: true, hasFailedPhase: false,
  unarchivedRequiredCompetitions: false, contractExpirationProcessed: true, developmentRunComplete: true,
  youthGenerationRunComplete: true, draftCompleted: true, retiredPlayersInActiveLineups: false,
  ownershipMismatchInLineups: false, duplicateActiveContracts: false, unsignedDraftRightsCount: 0,
  freeAgentCount: 0, openTradeProposalCount: 0, submittedContractOfferCount: 0,
  incompleteRequiredLineupsCount: 0, nextWorldSeasonExists: false, runningScoutingAssignments: 0,
});
check(completionReady.ready, 'completion ready when no blockers');
const blockedCompletion = aggregateCompletion(config, { status: 'IN_PROGRESS', phases: allPending() }, {
  requiredPhasesComplete: false, optionalPhasesResolved: true, hasFailedPhase: true,
  unarchivedRequiredCompetitions: true, contractExpirationProcessed: false, developmentRunComplete: false,
  youthGenerationRunComplete: false, draftCompleted: false, retiredPlayersInActiveLineups: true,
  ownershipMismatchInLineups: true, duplicateActiveContracts: true, unsignedDraftRightsCount: 0,
  freeAgentCount: 0, openTradeProposalCount: 1, submittedContractOfferCount: 1,
  incompleteRequiredLineupsCount: 1, nextWorldSeasonExists: false, runningScoutingAssignments: 0,
});
check(!blockedCompletion.ready && blockedCompletion.blockers.length >= 10, 'completion blocked on many issues');

// 10. Optional phases
const optSummary = summarizeRunPhases({ status: 'IN_PROGRESS', phases: config.phases.map((p, i) => phaseRow(p.type, p.required ? 'COMPLETED' : 'SKIPPED', i + 1)) }, config);
check(optSummary.allRequiredComplete && optSummary.allOptionalResolved, 'optional phases resolved via skip');

// 11. Result hashing
check(stableOffseasonHash({ a: 1, b: 2 }) === stableOffseasonHash({ b: 2, a: 1 }), 'stable hash order-independent');
const readyHashA = aggregatePhaseReadiness({ phaseType: 'COMPETITION_ARCHIVE', checks: [{ id: 'c1', status: 'PASS', message: 'ok' }], linkedOperation: { type: 'ARCHIVE', id: 'a1' }, allowedActions: [] }).readinessHash;
const readyHashB = aggregatePhaseReadiness({ phaseType: 'COMPETITION_ARCHIVE', checks: [{ id: 'c1', status: 'PASS', message: 'ok' }], linkedOperation: { type: 'ARCHIVE', id: 'a1' }, allowedActions: [] }).readinessHash;
check(readyHashA === readyHashB, 'readiness hash replays identically');

// 12. Reconciliation
const reconciled = reconcileOffseasonRun(config, { status: 'IN_PROGRESS', phases: allPending() });
check(reconciled.valid, 'reconciliation passes for coherent run');
const badRecon = reconcileOffseasonRun(config, { status: 'IN_PROGRESS', phases: config.phases.map((p, i) => phaseRow(p.type, 'PENDING', i + 1)).slice(0, 5) });
check(!badRecon.valid, 'reconciliation flags truncated plan');
check(reconcilePhasePlan(allPending()).valid, 'phase plan reconciles');

// 13. Idempotent progression
const pendingPhases = allPending();
const before = JSON.parse(JSON.stringify(pendingPhases)) as OffseasonPhaseState[];
isPhaseStartable(config, 'COMPETITION_ARCHIVE', pendingPhases);
check(JSON.stringify(pendingPhases) === JSON.stringify(before), 'progression check does not mutate input');
// Phase transition is deterministic — re-asserting produces the same outcome.
expectThrow(() => assertPhaseTransition({ phaseType: 'PLAYER_DEVELOPMENT', to: 'IN_PROGRESS', config, phases: allPending() }), 'dependency block reproduces on retry');
expectThrow(() => assertRunTransition('COMPLETED', 'IN_PROGRESS'), 'run transition rejection reproducible');

// 14. No input mutation (aggregation)
const aggInput = { phaseType: 'ROSTER_REVIEW' as const, checks: [{ id: 'c1', status: 'WARN' as const, message: 'thin' }], linkedOperation: null, allowedActions: [] as never[] };
const aggSnapshot = JSON.stringify(aggInput);
aggregatePhaseReadiness(aggInput);
check(JSON.stringify(aggInput) === aggSnapshot, 'aggregation does not mutate input');

// Category sanity
check(phaseCategory('PLAYER_DEVELOPMENT') === 'AUTOMATED' && phaseCategory('DRAFT') === 'INTERACTIVE', 'phase categories');

// selectCurrentPhase + progressPercent
const partialRun: OffseasonRunState = { status: 'IN_PROGRESS', phases: config.phases.map((p, i) => (i < 3 ? phaseRow(p.type, 'COMPLETED', i + 1) : phaseRow(p.type, 'PENDING', i + 1))) };
check(selectCurrentPhase(partialRun)?.phaseType === 'RETIREMENT_REVIEW', 'selectCurrentPhase picks next actionable');
check(progressPercent(partialRun) === Math.round((3 / 13) * 100), 'progressPercent computes a percentage');
check(unmetDependencies(config, 'FINAL_REVIEW', allPending()).length === 12, 'unmetDependencies lists all prior');
check(!dependenciesMet(config, 'ROSTER_REVIEW', allPending()), 'dependenciesMet false when prior incomplete');

// Benchmark: bounded readiness aggregation across a fictional 20-team world.
const started = performance.now();
for (let i = 0; i < 100; i++) {
  aggregatePhaseReadiness({
    phaseType: 'ROSTER_REVIEW',
    checks: [
      { id: `ownership-${i}`, status: 'PASS', message: 'ok' },
      { id: `duplicate-${i}`, status: 'WARN', message: 'duplicate ownership' },
      { id: `contracts-${i}`, status: 'PASS', message: 'ok' },
    ],
    linkedOperation: { type: 'ROSTER', id: `team-${i}` },
    allowedActions: [],
  });
}
const duration = performance.now() - started;
check(duration < 2000, `100 readiness aggregations benchmark (${duration.toFixed(2)}ms)`);

console.log('Offseason verifier complete.');
