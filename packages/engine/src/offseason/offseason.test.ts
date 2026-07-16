import { describe, expect, it } from 'vitest';
import {
  OFFSEASON_PHASE_ORDER,
  aggregateCompletion,
  aggregatePhaseReadiness,
  aggregatePhaseReadinessInRun,
  assertOffseasonReconciliation,
  assertPhaseTransition,
  assertRunTransition,
  canTransitionPhase,
  canTransitionRun,
  defaultOffseasonConfig,
  dependenciesMet,
  detectCycle,
  isPhaseStartable,
  isTerminalRunStatus,
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
  type OffseasonConfig,
  type OffseasonPhaseState,
  type OffseasonRunState,
} from './index.js';

const config = validateOffseasonConfig(defaultOffseasonConfig());

function phaseRow(type: OffseasonPhaseState['phaseType'], status: OffseasonPhaseState['status'], order: number): OffseasonPhaseState {
  const def = config.phases.find((p) => p.type === type)!;
  return { phaseType: type, order, status, required: def.required, allowSkip: def.allowSkip, linked: null };
}

function runState(phases: OffseasonPhaseState[]): OffseasonRunState {
  return { status: 'IN_PROGRESS', phases };
}

const allPending = (): OffseasonPhaseState[] =>
  config.phases.map((p, i) => phaseRow(p.type, 'PENDING', i + 1));

describe('offseason engine — config validation', () => {
  it('round-trips the default config', () => {
    expect(validateOffseasonConfig(defaultOffseasonConfig())).toEqual(defaultOffseasonConfig());
  });
  it('rejects wrong schema version', () => {
    expect(() => validateOffseasonConfig({ ...defaultOffseasonConfig(), schemaVersion: 2 })).toThrow(OffseasonError);
  });
  it('rejects unknown fields', () => {
    expect(() => validateOffseasonConfig({ ...defaultOffseasonConfig(), extras: 1 } as unknown as OffseasonConfig)).toThrow(OffseasonError);
  });
  it('rejects duplicate phase types', () => {
    const cfg = defaultOffseasonConfig();
    cfg.phases = [...cfg.phases, cfg.phases[0]!];
    expect(() => validateOffseasonConfig(cfg)).toThrow(OffseasonError);
  });
  it('rejects out-of-order phases', () => {
    const cfg = defaultOffseasonConfig();
    cfg.phases = [...cfg.phases.slice(0, 3).reverse(), ...cfg.phases.slice(3)];
    expect(() => validateOffseasonConfig(cfg)).toThrow(OffseasonError);
  });
  it('rejects FINAL_REVIEW not last', () => {
    const cfg = defaultOffseasonConfig();
    cfg.phases = [cfg.phases[12]!, ...cfg.phases.slice(0, 12)];
    expect(() => validateOffseasonConfig(cfg)).toThrow(OffseasonError);
  });
  it('rejects required phase with allowSkip', () => {
    const cfg = defaultOffseasonConfig();
    cfg.phases = cfg.phases.map((p) => (p.type === 'COMPETITION_ARCHIVE' ? { ...p, allowSkip: true } : p));
    expect(() => validateOffseasonConfig(cfg)).toThrow(OffseasonError);
  });
  it('rejects missing completion field', () => {
    const cfg = defaultOffseasonConfig();
    const broken = { ...cfg, completion: { ...cfg.completion } };
    delete (broken.completion as unknown as Record<string, unknown>).requireDraftCompleted;
    expect(() => validateOffseasonConfig(broken)).toThrow(OffseasonError);
  });
});

describe('offseason engine — phase categories + definitions', () => {
  it('marks automated phases correctly', () => {
    expect(phaseCategory('PLAYER_DEVELOPMENT')).toBe('AUTOMATED');
    expect(phaseCategory('CONTRACT_EXPIRATION')).toBe('AUTOMATED');
    expect(phaseCategory('YOUTH_GENERATION')).toBe('AUTOMATED');
    expect(phaseCategory('COMPETITION_ARCHIVE')).toBe('AUTOMATED');
    expect(phaseCategory('RETIREMENT_REVIEW')).toBe('INTERACTIVE');
    expect(phaseCategory('FINAL_REVIEW')).toBe('INTERACTIVE');
  });
  it('resolves definitions in canonical order with dependencies', () => {
    const defs = resolvePhaseDefinitions(config);
    expect(defs).toHaveLength(config.phases.length);
    expect(defs[0]!.type).toBe('COMPETITION_ARCHIVE');
    expect(defs[0]!.dependsOn).toEqual([]);
    expect(defs[1]!.dependsOn).toEqual(['COMPETITION_ARCHIVE']);
    expect(defs[12]!.type).toBe('FINAL_REVIEW');
    expect(defs[12]!.dependsOn).toHaveLength(12);
  });
});

describe('offseason engine — dependencies', () => {
  it('unmetDependencies lists all prior phases when none complete', () => {
    const phases = allPending();
    const unmet = unmetDependencies(config, 'FINAL_REVIEW', phases);
    expect(unmet).toHaveLength(12);
  });
  it('dependenciesMet is false for early phases when nothing done', () => {
    expect(dependenciesMet(config, 'ROSTER_REVIEW', allPending())).toBe(false);
  });
  it('dependenciesMet becomes true when all prior complete', () => {
    const phases = config.phases.map((p, i) =>
      p.type === 'ROSTER_REVIEW' ? phaseRow('ROSTER_REVIEW', 'PENDING', i + 1) : phaseRow(p.type, 'COMPLETED', i + 1),
    );
    expect(dependenciesMet(config, 'ROSTER_REVIEW', phases)).toBe(true);
  });
  it('detectCycle returns null for canonical order', () => {
    expect(detectCycle([...OFFSEASON_PHASE_ORDER])).toBeNull();
  });
  it('detectCycle returns the repeated phase', () => {
    const repeated = [...OFFSEASON_PHASE_ORDER.slice(0, 3), OFFSEASON_PHASE_ORDER[1]!];
    expect(detectCycle(repeated)).toEqual([OFFSEASON_PHASE_ORDER[1]]);
  });
});

describe('offseason engine — phase transitions', () => {
  it('PENDING → READY allowed', () => {
    expect(canTransitionPhase('PENDING', 'READY', true, false)).toBe(true);
  });
  it('READY → IN_PROGRESS allowed', () => {
    expect(canTransitionPhase('READY', 'IN_PROGRESS', true, false)).toBe(true);
  });
  it('IN_PROGRESS → COMPLETED allowed', () => {
    expect(canTransitionPhase('IN_PROGRESS', 'COMPLETED', true, false)).toBe(true);
  });
  it('COMPLETED → anything blocked', () => {
    expect(canTransitionPhase('COMPLETED', 'IN_PROGRESS', true, false)).toBe(false);
  });
  it('SKIPPED → anything blocked', () => {
    expect(canTransitionPhase('SKIPPED', 'IN_PROGRESS', true, false)).toBe(false);
  });
  it('required phase cannot be skipped', () => {
    expect(canTransitionPhase('READY', 'SKIPPED', true, false)).toBe(false);
  });
  it('optional phase can be skipped when allowSkip', () => {
    expect(canTransitionPhase('READY', 'SKIPPED', false, true)).toBe(true);
  });
  it('FAILED → PENDING (retry reset) allowed', () => {
    expect(canTransitionPhase('FAILED', 'PENDING', true, false)).toBe(true);
  });
  it('assertPhaseTransition blocks required skip', () => {
    expect(() =>
      assertPhaseTransition({ phaseType: 'COMPETITION_ARCHIVE', to: 'SKIPPED', config, phases: allPending() }),
    ).toThrow(OffseasonError);
  });
  it('assertPhaseTransition blocks start with unmet dependencies', () => {
    expect(() =>
      assertPhaseTransition({ phaseType: 'PLAYER_DEVELOPMENT', to: 'IN_PROGRESS', config, phases: allPending() }),
    ).toThrow(OffseasonError);
  });
  it('assertPhaseTransition blocks re-completion', () => {
    const phases = config.phases.map((p, i) => phaseRow(p.type, 'COMPLETED', i + 1));
    expect(() =>
      assertPhaseTransition({ phaseType: 'COMPETITION_ARCHIVE', to: 'COMPLETED', config, phases }),
    ).toThrow(OffseasonError);
  });
  it('assertPhaseTransition allows start once dependencies complete', () => {
    const phases = config.phases.map((p, i) =>
      p.type === 'PLAYER_DEVELOPMENT' ? phaseRow('PLAYER_DEVELOPMENT', 'PENDING', i + 1) : phaseRow(p.type, 'COMPLETED', i + 1),
    );
    expect(() =>
      assertPhaseTransition({ phaseType: 'PLAYER_DEVELOPMENT', to: 'IN_PROGRESS', config, phases }),
    ).not.toThrow();
  });
});

describe('offseason engine — run transitions', () => {
  it('PLANNED → READY allowed', () => expect(canTransitionRun('PLANNED', 'READY')).toBe(true));
  it('READY → IN_PROGRESS allowed', () => expect(canTransitionRun('READY', 'IN_PROGRESS')).toBe(true));
  it('IN_PROGRESS → COMPLETED allowed', () => expect(canTransitionRun('IN_PROGRESS', 'COMPLETED')).toBe(true));
  it('COMPLETED → IN_PROGRESS blocked', () => expect(canTransitionRun('COMPLETED', 'IN_PROGRESS')).toBe(false));
  it('assertRunTransition raises on illegal move', () => {
    expect(() => assertRunTransition('COMPLETED', 'IN_PROGRESS')).toThrow(OffseasonError);
  });
  it('isTerminalRunStatus identifies terminal states', () => {
    expect(isTerminalRunStatus('COMPLETED')).toBe(true);
    expect(isTerminalRunStatus('CANCELLED')).toBe(true);
    expect(isTerminalRunStatus('FAILED')).toBe(true);
    expect(isTerminalRunStatus('IN_PROGRESS')).toBe(false);
  });
});

describe('offseason engine — derived state', () => {
  it('selectCurrentPhase picks first non-terminal phase', () => {
    const phases = config.phases.map((p, i) =>
      i < 3 ? phaseRow(p.type, 'COMPLETED', i + 1) : phaseRow(p.type, 'PENDING', i + 1),
    );
    const cur = selectCurrentPhase(runState(phases));
    expect(cur?.phaseType).toBe('RETIREMENT_REVIEW');
  });
  it('selectCurrentPhase returns null when all resolved', () => {
    const phases = config.phases.map((p, i) => phaseRow(p.type, 'COMPLETED', i + 1));
    expect(selectCurrentPhase(runState(phases))).toBeNull();
  });
  it('progressPercent computes a percentage', () => {
    const phases = config.phases.map((p, i) =>
      i < 5 ? phaseRow(p.type, 'COMPLETED', i + 1) : phaseRow(p.type, 'PENDING', i + 1),
    );
    expect(progressPercent(runState(phases))).toBe(Math.round((5 / 13) * 100));
  });
  it('isPhaseStartable respects dependencies', () => {
    expect(isPhaseStartable(config, 'COMPETITION_ARCHIVE', allPending())).toBe(true);
    expect(isPhaseStartable(config, 'PLAYER_DEVELOPMENT', allPending())).toBe(false);
  });
  it('summarizeRunPhases flags missing required', () => {
    const s = summarizeRunPhases(runState(allPending()), config);
    expect(s.allRequiredComplete).toBe(false);
    expect(s.hasIncompleteRequiredPhase).toBe(true);
    expect(s.hasFailedPhase).toBe(false);
  });
  it('summarizeRunPhases flags failed phase', () => {
    const phases = config.phases.map((p, i) =>
      p.type === 'PLAYER_DEVELOPMENT' ? phaseRow('PLAYER_DEVELOPMENT', 'FAILED', i + 1) : phaseRow(p.type, 'COMPLETED', i + 1),
    );
    const s = summarizeRunPhases(runState(phases), config);
    expect(s.hasFailedPhase).toBe(true);
    expect(s.allRequiredComplete).toBe(false);
    expect(s.failedPhases).toEqual(['PLAYER_DEVELOPMENT']);
  });
});

describe('offseason engine — readiness aggregation', () => {
  it('classifies READY when all checks pass', () => {
    const r = aggregatePhaseReadiness({
      phaseType: 'COMPETITION_ARCHIVE',
      checks: [{ id: 'c1', status: 'PASS', message: 'ok' }],
      linkedOperation: null,
      allowedActions: [],
    });
    expect(r.status).toBe('READY');
    expect(r.blockers).toEqual([]);
  });
  it('classifies WARNING when WARN present', () => {
    const r = aggregatePhaseReadiness({
      phaseType: 'SCOUTING_REVIEW',
      checks: [
        { id: 'c1', status: 'PASS', message: 'ok' },
        { id: 'c2', status: 'WARN', message: 'stale report' },
      ],
      linkedOperation: null,
      allowedActions: [],
    });
    expect(r.status).toBe('WARNING');
    expect(r.warnings).toEqual(['stale report']);
  });
  it('classifies NOT_READY when FAIL present', () => {
    const r = aggregatePhaseReadiness({
      phaseType: 'ROSTER_REVIEW',
      checks: [{ id: 'c1', status: 'FAIL', message: 'duplicate ownership' }],
      linkedOperation: null,
      allowedActions: [],
    });
    expect(r.status).toBe('NOT_READY');
    expect(r.blockers).toEqual(['duplicate ownership']);
  });
  it('deterministic readiness hash replays identically', () => {
    const input = {
      phaseType: 'COMPETITION_ARCHIVE' as const,
      checks: [{ id: 'c1', status: 'PASS' as const, message: 'ok' }],
      linkedOperation: { type: 'ARCHIVE_BATCH', id: 'a1', summary: 'two editions' },
      allowedActions: [] as never[],
    };
    const a = aggregatePhaseReadiness(input);
    const b = aggregatePhaseReadiness(input);
    expect(a.readinessHash).toBe(b.readinessHash);
  });
  it('aggregatePhaseReadinessInRun respects startable', () => {
    const run = runState(allPending());
    const r = aggregatePhaseReadinessInRun(config, run, {
      phaseType: 'COMPETITION_ARCHIVE',
      checks: [{ id: 'c1', status: 'PASS', message: 'ok' }],
      linkedOperation: null,
      allowedActions: [],
    });
    expect(r.allowedActions).toContain('START');
    const r2 = aggregatePhaseReadinessInRun(config, run, {
      phaseType: 'PLAYER_DEVELOPMENT',
      checks: [{ id: 'c1', status: 'PASS', message: 'ok' }],
      linkedOperation: null,
      allowedActions: [],
    });
    expect(r2.allowedActions).not.toContain('START');
  });
});

describe('offseason engine — completion aggregation', () => {
  const baseInput = {
    requiredPhasesComplete: true,
    optionalPhasesResolved: true,
    hasFailedPhase: false,
    unarchivedRequiredCompetitions: false,
    contractExpirationProcessed: true,
    developmentRunComplete: true,
    youthGenerationRunComplete: true,
    draftCompleted: true,
    retiredPlayersInActiveLineups: false,
    ownershipMismatchInLineups: false,
    duplicateActiveContracts: false,
    unsignedDraftRightsCount: 0,
    freeAgentCount: 0,
    openTradeProposalCount: 0,
    submittedContractOfferCount: 0,
    incompleteRequiredLineupsCount: 0,
    nextWorldSeasonExists: false,
    runningScoutingAssignments: 0,
  };

  it('is ready when no blockers', () => {
    const run: OffseasonRunState = {
      status: 'IN_PROGRESS',
      phases: config.phases.map((p, i) => phaseRow(p.type, p.required ? 'COMPLETED' : 'SKIPPED', i + 1)),
    };
    const r = aggregateCompletion(config, run, baseInput);
    expect(r.ready).toBe(true);
    expect(r.blockers).toEqual([]);
    // Warnings for no next season (expected — F31 boundary).
    expect(r.warnings.some((w) => w.code === 'NO_NEXT_WORLD_SEASON')).toBe(true);
  });
  it('blocks when unarchived competition exists', () => {
    const r = aggregateCompletion(config, runState(allPending()), { ...baseInput, unarchivedRequiredCompetitions: true });
    expect(r.ready).toBe(false);
    expect(r.blockers.some((b) => b.code === 'UNARCHIVED_COMPETITION')).toBe(true);
  });
  it('blocks when retired player in active lineup', () => {
    const r = aggregateCompletion(config, runState(allPending()), { ...baseInput, retiredPlayersInActiveLineups: true });
    expect(r.ready).toBe(false);
    expect(r.blockers.some((b) => b.code === 'RETIRED_PLAYER_IN_LINEUP')).toBe(true);
  });
  it('blocks when open trade proposals disallowed', () => {
    const r = aggregateCompletion(config, runState(allPending()), { ...baseInput, openTradeProposalCount: 2 });
    expect(r.ready).toBe(false);
    expect(r.blockers.some((b) => b.code === 'OPEN_TRADE_PROPOSALS')).toBe(true);
  });
  it('warns (does not block) on unsigned draft rights when allowed', () => {
    const r = aggregateCompletion(config, runState(allPending()), { ...baseInput, unsignedDraftRightsCount: 3 });
    expect(r.ready).toBe(true);
    expect(r.warnings.some((w) => w.code === 'UNSIGNED_DRAFT_RIGHTS')).toBe(true);
  });
  it('warns (does not block) on free agents when allowed', () => {
    const r = aggregateCompletion(config, runState(allPending()), { ...baseInput, freeAgentCount: 5 });
    expect(r.ready).toBe(true);
    expect(r.warnings.some((w) => w.code === 'FREE_AGENTS_REMAIN')).toBe(true);
  });
  it('blocks on failed phase', () => {
    const r = aggregateCompletion(config, runState(allPending()), { ...baseInput, hasFailedPhase: true });
    expect(r.ready).toBe(false);
    expect(r.blockers.some((b) => b.code === 'FAILED_PHASE')).toBe(true);
  });
});

describe('offseason engine — reconciliation', () => {
  it('reconcileOffseasonRun passes for a coherent run', () => {
    const phases = config.phases.map((p, i) => phaseRow(p.type, 'PENDING', i + 1));
    const result = reconcileOffseasonRun(config, runState(phases));
    expect(result.valid).toBe(true);
  });
  it('flags phase count mismatch', () => {
    const phases = config.phases.slice(0, 5).map((p, i) => phaseRow(p.type, 'PENDING', i + 1));
    const result = reconcileOffseasonRun(config, runState(phases));
    expect(result.valid).toBe(false);
    expect(result.issues.some((i) => i.code === 'PHASE_COUNT_MISMATCH')).toBe(true);
  });
  it('flags required phase skipped', () => {
    const phases = config.phases.map((p, i) =>
      p.type === 'COMPETITION_ARCHIVE' ? phaseRow('COMPETITION_ARCHIVE', 'SKIPPED', i + 1) : phaseRow(p.type, 'PENDING', i + 1),
    );
    const result = reconcileOffseasonRun(config, runState(phases));
    expect(result.issues.some((i) => i.code === 'REQUIRED_PHASE_SKIPPED')).toBe(true);
  });
  it('flags dependency incomplete', () => {
    const phases = config.phases.map((p, i) =>
      p.type === 'PLAYER_DEVELOPMENT' ? phaseRow('PLAYER_DEVELOPMENT', 'COMPLETED', i + 1) : phaseRow(p.type, 'PENDING', i + 1),
    );
    const result = reconcileOffseasonRun(config, runState(phases));
    expect(result.issues.some((i) => i.code === 'DEPENDENCY_INCOMPLETE')).toBe(true);
  });
  it('reconcilePhasePlan flags out-of-order plan', () => {
    const reversed = [...config.phases].reverse().map((p, i) => phaseRow(p.type, 'PENDING', i + 1));
    const result = reconcilePhasePlan(reversed);
    expect(result.valid).toBe(false);
  });
  it('assertOffseasonReconciliation raises on invalid', () => {
    const phases = config.phases.map((p, i) =>
      p.type === 'COMPETITION_ARCHIVE' ? phaseRow('COMPETITION_ARCHIVE', 'SKIPPED', i + 1) : phaseRow(p.type, 'PENDING', i + 1),
    );
    const result = reconcileOffseasonRun(config, runState(phases));
    expect(() => assertOffseasonReconciliation(result)).toThrow();
  });
});

describe('offseason engine — hashing + no input mutation', () => {
  it('stableOffseasonHash is order-independent', () => {
    expect(stableOffseasonHash({ a: 1, b: 2 })).toBe(stableOffseasonHash({ b: 2, a: 1 }));
  });
  it('aggregation does not mutate input', () => {
    const input = {
      phaseType: 'COMPETITION_ARCHIVE' as const,
      checks: [{ id: 'c1', status: 'PASS' as const, message: 'ok' }],
      linkedOperation: null,
      allowedActions: [] as never[],
    };
    const snapshot = JSON.stringify(input);
    aggregatePhaseReadiness(input);
    expect(JSON.stringify(input)).toBe(snapshot);
  });
});
