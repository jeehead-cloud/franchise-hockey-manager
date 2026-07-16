import { describe, expect, it } from 'vitest';
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
  computeReadiness,
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
  type SeasonTransitionConfig,
  type SourceCompetitionEditionInput,
  type SourceSeasonInput,
} from './index.js';

const defaultConfig = validateSeasonTransitionConfig(defaultSeasonTransitionConfig());

function sourceSeason(overrides: Partial<SourceSeasonInput> = {}): SourceSeasonInput {
  return {
    id: 'season-2026',
    label: '2026/2027',
    startYear: 2026,
    endYear: 2027,
    status: 'COMPLETED',
    phase: 'COMPLETE',
    updatedAt: '2026-07-01T00:00:00.000Z',
    ...overrides,
  };
}

function domesticEdition(overrides: Partial<SourceCompetitionEditionInput> = {}): SourceCompetitionEditionInput {
  return {
    editionId: 'edition-1',
    competitionId: 'comp-nhl',
    competitionName: 'NHL',
    competitionType: 'LEAGUE',
    simulationLevel: 'DETAILED',
    displayName: 'NHL 2026/2027',
    status: 'ARCHIVED',
    isInternational: false,
    recurring: null,
    rulesSnapshotText: '{}',
    rulesHash: 'hash-1',
    defaultRulesJson: '{"points":"two"}',
    stages: [
      { stageId: 's1', name: 'Regular Season', stageType: 'REGULAR_SEASON', stageOrder: 1, configText: '{}', configHash: 'c1', participantSource: 'EDITION_PARTICIPANTS', sourceStageId: null, expectedQualifierCount: 16 },
      { stageId: 's2', name: 'Playoffs', stageType: 'BEST_OF_SERIES', stageOrder: 2, configText: '{}', configHash: 'c2', participantSource: 'PREVIOUS_STAGE_QUALIFIERS', sourceStageId: 's1', expectedQualifierCount: 16 },
    ],
    confirmedParticipantCount: 32,
    archived: true,
    ...overrides,
  };
}

function ownership(overrides: Partial<OwnershipIntegrityInput> = {}): OwnershipIntegrityInput {
  return {
    duplicateActiveContracts: 0,
    ownershipMismatches: 0,
    freeAgentCount: 5,
    unsignedDraftRights: 2,
    retiredPlayersInActiveLineups: 0,
    lineupOwnershipMismatches: 0,
    ...overrides,
  };
}

function runningOps(overrides: Partial<RunningWorldOperationInput> = {}): RunningWorldOperationInput {
  return {
    openOffseasonRun: false,
    preparedContractExpirationRun: false,
    preparedOrRunningDevelopmentRun: false,
    preparedOrRunningYouthRun: false,
    openDraftEvent: false,
    activeCompetitionEdition: false,
    ...overrides,
  };
}

function scouting(overrides: Partial<ScoutingStalenessInput> = {}): ScoutingStalenessInput {
  return { staleReportCount: 3, totalReportCount: 10, ...overrides };
}

function previewInput(overrides: Partial<Parameters<typeof aggregateReadiness>[0]> = {}): Parameters<typeof aggregateReadiness>[0] {
  return {
    config: defaultConfig,
    sourceSeason: sourceSeason(),
    completedOffseasonRun: { id: 'offseason-1', status: 'COMPLETED', resultHash: 'r1', completedAt: '2026-08-01T00:00:00.000Z' },
    offseasonRunsForSeason: [{ id: 'offseason-1', status: 'COMPLETED' }],
    sourceEditions: [domesticEdition()],
    ownership: ownership(),
    runningOperations: runningOps(),
    scoutingStaleness: scouting(),
    targetDisplayNameOverride: null,
    existingTransitionsForSource: [],
    existingSeasonOrders: [2026],
    currentSeasonId: 'season-2026',
    ...overrides,
  };
}

describe('season-transition config', () => {
  it('validates the default config', () => {
    const cfg = validateSeasonTransitionConfig(defaultSeasonTransitionConfig());
    expect(cfg.schemaVersion).toBe(SEASON_TRANSITION_SCHEMA_VERSION);
    expect(cfg.season.orderIncrement).toBe(1);
    expect(cfg.competitions.newEditionInitialStatus).toBe('PLANNED');
    expect(cfg.lineups.autoRebuild).toBe(false);
    expect(cfg.nationalTeams.carryLockedTournamentRosters).toBe(false);
  });

  it('rejects unknown top-level fields', () => {
    const bad = { ...defaultSeasonTransitionConfig(), unknown: true } as unknown;
    expect(() => validateSeasonTransitionConfig(bad)).toThrow(SeasonTransitionError);
  });

  it('rejects autoRebuild=true (foundation default)', () => {
    const bad = defaultSeasonTransitionConfig();
    bad.lineups.autoRebuild = true;
    expect(() => validateSeasonTransitionConfig(bad)).toThrow(SeasonTransitionError);
  });

  it('rejects activateEditionsAutomatically=true', () => {
    const bad = defaultSeasonTransitionConfig();
    bad.competitions.activateEditionsAutomatically = true;
    expect(() => validateSeasonTransitionConfig(bad)).toThrow(SeasonTransitionError);
  });

  it('rejects non-positive orderIncrement', () => {
    const bad = defaultSeasonTransitionConfig();
    bad.season.orderIncrement = 0;
    expect(() => validateSeasonTransitionConfig(bad)).toThrow(SeasonTransitionError);
  });

  it('rejects invalid date components', () => {
    const bad = defaultSeasonTransitionConfig();
    bad.season.startDateMonth = 13;
    expect(() => validateSeasonTransitionConfig(bad)).toThrow(SeasonTransitionError);
  });

  it('rejects unsupported display-name tokens', () => {
    const bad = defaultSeasonTransitionConfig();
    bad.season.displayNamePattern = '{foo}/{bar}';
    expect(() => validateSeasonTransitionConfig(bad)).toThrow(SeasonTransitionError);
  });

  it('rejects incompatible combination: stages without rules', () => {
    const bad = defaultSeasonTransitionConfig();
    bad.competitions.copyDefaultRulesIntoNewEditionSnapshot = false;
    expect(() => validateSeasonTransitionConfig(bad)).toThrow(SeasonTransitionError);
  });

  it('rejects incompatible combination: lineups without tactics', () => {
    const bad = defaultSeasonTransitionConfig();
    bad.lineups.copyTactics = false;
    expect(() => validateSeasonTransitionConfig(bad)).toThrow(SeasonTransitionError);
  });
});

describe('season-transition identity', () => {
  it('computes deterministic target order', () => {
    expect(computeTargetOrder(2026, 1)).toBe(2027);
    expect(computeTargetOrder(2026, 2)).toBe(2028);
  });

  it('rejects non-positive increment', () => {
    expect(() => computeTargetOrder(2026, 0)).toThrow(SeasonTransitionError);
    expect(() => computeTargetOrder(2026, -1)).toThrow(SeasonTransitionError);
  });

  it('applies display-name pattern', () => {
    expect(applyDisplayNamePattern('{startYear}/{endYear}', 2027, 2028)).toBe('2027/2028');
    expect(applyDisplayNamePattern('{startYear}', 2027, 2028)).toBe('2027');
  });

  it('resolves deterministic identity from config + source', () => {
    const id = resolveTargetIdentity(defaultConfig, sourceSeason(), null);
    expect(id.order).toBe(2027);
    expect(id.label).toBe('2027/2028');
    expect(id.displayName).toBe('2027/2028');
    expect(id.manuallyNamed).toBe(false);
    expect(id.startDateIso).toBe('2027-07-01');
    expect(id.endDateIso).toBe('2028-06-30');
  });

  it('accepts an explicit display-name override without changing order', () => {
    const id = resolveTargetIdentity(defaultConfig, sourceSeason(), 'My Custom Season');
    expect(id.order).toBe(2027);
    expect(id.label).toBe('2027/2028');
    expect(id.displayName).toBe('My Custom Season');
    expect(id.manuallyNamed).toBe(true);
  });

  it('ignores blank/whitespace overrides', () => {
    const id = resolveTargetIdentity(defaultConfig, sourceSeason(), '   ');
    expect(id.manuallyNamed).toBe(false);
    expect(id.displayName).toBe('2027/2028');
  });
});

describe('season-transition dates', () => {
  it('composes valid ISO dates', () => {
    expect(composeIsoDate(2027, 7, 1)).toBe('2027-07-01');
    expect(composeIsoDate(2028, 6, 30)).toBe('2028-06-30');
  });

  it('handles leap-day February', () => {
    expect(composeIsoDate(2024, 2, 29)).toBe('2024-02-29');
    expect(() => composeIsoDate(2023, 2, 29)).toThrow(SeasonTransitionError);
  });

  it('rejects invalid month/day', () => {
    expect(() => composeIsoDate(2027, 13, 1)).toThrow(SeasonTransitionError);
    expect(() => composeIsoDate(2027, 4, 31)).toThrow(SeasonTransitionError);
  });

  it('derives completed years without mutating birth dates', () => {
    expect(completedYearsOnDate('2000-07-01', '2026-07-01')).toBe(26);
    expect(completedYearsOnDate('2000-07-02', '2026-07-01')).toBe(25);
    expect(completedYearsOnDate('2000-06-30', '2026-07-01')).toBe(26);
  });
});

describe('season-transition carry-forward', () => {
  it('carries domestic competitions with a source edition', () => {
    const target = resolveTargetIdentity(defaultConfig, sourceSeason(), null);
    const plan = buildCarryForwardPlan(defaultConfig, 2026, target, [domesticEdition()]);
    expect(plan).toHaveLength(1);
    expect(plan[0]!.competitionId).toBe('comp-nhl');
    expect(plan[0]!.stages).toHaveLength(2);
    expect(plan[0]!.stages[0]!.stageOrder).toBe(1);
    expect(plan[0]!.stages[1]!.stageOrder).toBe(2);
    expect(plan[0]!.stages[1]!.remappedFromStageOrder).toBe(1);
  });

  it('replaces source start-year in target edition display name', () => {
    const target = resolveTargetIdentity(defaultConfig, sourceSeason(), null);
    const plan = buildCarryForwardPlan(defaultConfig, 2026, target, [domesticEdition()]);
    expect(plan[0]!.displayName).toBe('NHL 2027/2028');
  });

  it('omits international competitions without explicit recurrence', () => {
    const target = resolveTargetIdentity(defaultConfig, sourceSeason(), null);
    const plan = buildCarryForwardPlan(defaultConfig, 2026, target, [
      domesticEdition(),
      domesticEdition({ editionId: 'ed-wjc', competitionId: 'comp-wjc', competitionName: 'WJC', displayName: 'WJC 2027', isInternational: true, recurring: null }),
    ]);
    expect(plan.map((p) => p.competitionId)).toEqual(['comp-nhl']);
  });

  it('includes recurring international competitions', () => {
    const target = resolveTargetIdentity(defaultConfig, sourceSeason(), null);
    const plan = buildCarryForwardPlan(defaultConfig, 2026, target, [
      domesticEdition(),
      domesticEdition({ editionId: 'ed-wjc', competitionId: 'comp-wjc', competitionName: 'WJC', displayName: 'WJC 2027', isInternational: true, recurring: true }),
    ]);
    expect(plan.map((p) => p.competitionId).sort()).toEqual(['comp-nhl', 'comp-wjc']);
  });

  it('shouldCarryForwardEdition respects enabled flag', () => {
    const cfg = { ...defaultConfig, competitions: { ...defaultConfig.competitions, carryForwardEnabledDefinitions: false } };
    expect(shouldCarryForwardEdition(cfg, domesticEdition()).carry).toBe(false);
  });

  it('builds stage order map deterministically regardless of input order', () => {
    const stages = domesticEdition().stages;
    const map1 = buildStageOrderMap(stages);
    const map2 = buildStageOrderMap([...stages].reverse());
    expect(map1).toEqual(map2);
    expect(map1.get(2)).toBe(2);
  });

  it('validates acyclic stage dependencies after remapping', () => {
    const target = resolveTargetIdentity(defaultConfig, sourceSeason(), null);
    expect(() => buildCarryForwardPlan(defaultConfig, 2026, target, [domesticEdition()])).not.toThrow();
  });

  it('rejects a cycle in stage dependencies', () => {
    // Manually build a cyclic stage list and pass it to the validator.
    const cyclic = [
      { name: 'A', stageType: 'REGULAR_SEASON' as const, stageOrder: 1, configText: '{}', configHash: 'a', participantSource: 'EDITION_PARTICIPANTS' as const, remappedFromStageOrder: 2, expectedQualifierCount: null },
      { name: 'B', stageType: 'BEST_OF_SERIES' as const, stageOrder: 2, configText: '{}', configHash: 'b', participantSource: 'PREVIOUS_STAGE_QUALIFIERS' as const, remappedFromStageOrder: null, expectedQualifierCount: null },
    ];
    expect(() => validateStageDependencyGraph(cyclic)).toThrow(SeasonTransitionError);
  });

  it('deduplicates duplicate source competitions', () => {
    const target = resolveTargetIdentity(defaultConfig, sourceSeason(), null);
    const dup = [domesticEdition(), domesticEdition()];
    expect(() => buildCarryForwardPlan(defaultConfig, 2026, target, dup)).toThrow(SeasonTransitionError);
  });

  it('builds a carry-forward summary', () => {
    const summary = buildCarryForwardSummary(defaultConfig, { freeAgentCount: 5 }, 2, { staleReportCount: 3, totalReportCount: 10 });
    expect(summary.contracts.freeAgents).toBe(5);
    expect(summary.draftRights.unsignedCount).toBe(2);
    expect(summary.scouting.staleReports).toBe(3);
    expect(summary.lineups.autoRebuild).toBe(false);
  });
});

describe('season-transition readiness', () => {
  it('is READY for a clean completed season', () => {
    const r = aggregateReadiness(previewInput());
    expect(r.status).toBe('WARNING'); // free agents + unsigned rights + stale reports -> WARNING
    expect(r.blockers).toHaveLength(0);
    expect(r.proposedTargetSeason.order).toBe(2027);
  });

  it('is NOT_READY without a completed OffseasonRun', () => {
    const r = aggregateReadiness(previewInput({ completedOffseasonRun: null }));
    expect(r.status).toBe('NOT_READY');
    expect(r.blockers.some((b) => b.code === 'OffseasonRunNotCompleted')).toBe(true);
  });

  it('blocks when a competition edition is still ACTIVE', () => {
    const r = aggregateReadiness(previewInput({
      sourceEditions: [domesticEdition({ status: 'ACTIVE', archived: false })],
    }));
    expect(r.status).toBe('NOT_READY');
    expect(r.blockers.some((b) => b.code === 'ActiveCompetitionEditionRemains')).toBe(true);
  });

  it('blocks when a completed edition is unarchived', () => {
    const r = aggregateReadiness(previewInput({
      sourceEditions: [domesticEdition({ status: 'COMPLETED', archived: false })],
    }));
    expect(r.blockers.some((b) => b.code === 'UnarchivedCompletedCompetition')).toBe(true);
  });

  it('blocks when running world operations exist', () => {
    const r = aggregateReadiness(previewInput({ runningOperations: runningOps({ openDraftEvent: true }) }));
    expect(r.blockers.some((b) => b.code === 'ConflictingWorldOperation')).toBe(true);
  });

  it('blocks duplicate ownership', () => {
    const r = aggregateReadiness(previewInput({ ownership: ownership({ duplicateActiveContracts: 1 }) }));
    expect(r.blockers.some((b) => b.code === 'OwnershipMismatch')).toBe(true);
  });

  it('blocks a duplicate target order with no linked transition', () => {
    const r = aggregateReadiness(previewInput({ existingSeasonOrders: [2026, 2027] }));
    expect(r.blockers.some((b) => b.code === 'TargetWorldSeasonAlreadyExists')).toBe(true);
  });

  it('assertReadyForPrepare throws on NOT_READY', () => {
    const r = aggregateReadiness(previewInput({ completedOffseasonRun: null }));
    expect(() => assertReadyForPrepare(r)).toThrow(SeasonTransitionError);
  });

  it('produces a deterministic readiness hash', () => {
    const r1 = aggregateReadiness(previewInput());
    const r2 = aggregateReadiness(previewInput());
    expect(r1.readinessHash).toBe(r2.readinessHash);
  });

  it('warns about international tournaments not carried', () => {
    const r = aggregateReadiness(previewInput({
      sourceEditions: [domesticEdition(), domesticEdition({ editionId: 'ed-wjc', competitionId: 'comp-wjc', competitionName: 'WJC', displayName: 'WJC 2027', isInternational: true, recurring: null })],
    }));
    expect(r.warnings.some((w) => w.code === 'InternationalTournamentNotPlanned')).toBe(true);
  });
});

describe('season-transition reconciliation', () => {
  it('passes when published matches plan', () => {
    const readiness = aggregateReadiness(previewInput());
    const target = readiness.proposedTargetSeason;
    const result = reconcileTransition({
      config: defaultConfig,
      sourceSeason: sourceSeason(),
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
        editionsCreated: readiness.competitionPlan.map((p) => ({
          competitionId: p.competitionId,
          displayName: p.displayName,
          status: p.initialStatus,
          rulesHash: p.rulesHash,
          stageCount: p.stages.length,
          participantCount: p.participantCount,
        })),
        currentSeasonCount: 1,
        playerCount: 1000,
        sourcePlayerCount: 1000,
        lockedNationalTeamRostersCopied: 0,
        matchesCreated: 0,
        schedulesGenerated: 0,
      },
    });
    expect(result.ok).toBe(true);
  });

  it('fails when player count changes', () => {
    const readiness = aggregateReadiness(previewInput());
    const target = readiness.proposedTargetSeason;
    const result = reconcileTransition({
      config: defaultConfig,
      sourceSeason: sourceSeason(),
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
        editionsCreated: readiness.competitionPlan.map((p) => ({
          competitionId: p.competitionId, displayName: p.displayName, status: p.initialStatus, rulesHash: p.rulesHash, stageCount: p.stages.length, participantCount: p.participantCount,
        })),
        currentSeasonCount: 1,
        playerCount: 1001,
        sourcePlayerCount: 1000,
        lockedNationalTeamRostersCopied: 0,
        matchesCreated: 0,
        schedulesGenerated: 0,
      },
    });
    expect(result.ok).toBe(false);
    expect(result.checks.some((c) => c.id === 'player_count')).toBe(true);
  });

  it('fails when matches were created', () => {
    const readiness = aggregateReadiness(previewInput());
    const target = readiness.proposedTargetSeason;
    const result = reconcileTransition({
      config: defaultConfig,
      sourceSeason: sourceSeason(),
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
        editionsCreated: readiness.competitionPlan.map((p) => ({
          competitionId: p.competitionId, displayName: p.displayName, status: p.initialStatus, rulesHash: p.rulesHash, stageCount: p.stages.length, participantCount: p.participantCount,
        })),
        currentSeasonCount: 1,
        playerCount: 1000,
        sourcePlayerCount: 1000,
        lockedNationalTeamRostersCopied: 0,
        matchesCreated: 5,
        schedulesGenerated: 0,
      },
    });
    expect(result.ok).toBe(false);
  });

  it('assertTransitionReconciliation throws on failure', () => {
    const readiness = aggregateReadiness(previewInput());
    const target = readiness.proposedTargetSeason;
    expect(() => assertTransitionReconciliation({
      config: defaultConfig,
      sourceSeason: sourceSeason(),
      targetSeason: { ...target, id: 'target-id' },
      plannedEditions: readiness.competitionPlan,
      published: {
        targetWorldSeasonId: 'wrong-id',
        targetWorldSeasonOrder: target.order,
        targetWorldSeasonLabel: target.label,
        targetWorldSeasonStatus: 'ACTIVE',
        targetWorldSeasonIsCurrent: true,
        sourceWorldSeasonStatus: 'COMPLETED',
        sourceWorldSeasonIsCurrent: false,
        editionsCreated: readiness.competitionPlan.map((p) => ({
          competitionId: p.competitionId, displayName: p.displayName, status: p.initialStatus, rulesHash: p.rulesHash, stageCount: p.stages.length, participantCount: p.participantCount,
        })),
        currentSeasonCount: 1,
        playerCount: 1000,
        sourcePlayerCount: 1000,
        lockedNationalTeamRostersCopied: 0,
        matchesCreated: 0,
        schedulesGenerated: 0,
      },
    })).toThrow(SeasonTransitionError);
  });
});

describe('season-transition lifecycle helpers', () => {
  it('identifies terminal statuses', () => {
    expect(isTerminalTransitionStatus('COMPLETED')).toBe(true);
    expect(isTerminalTransitionStatus('CANCELLED')).toBe(true);
    expect(isTerminalTransitionStatus('FAILED')).toBe(true);
    expect(isTerminalTransitionStatus('PREPARED')).toBe(false);
    expect(isTerminalTransitionStatus('RUNNING')).toBe(false);
  });

  it('allows execution only from PREPARED or COMPLETED', () => {
    expect(canExecuteTransition('PREPARED')).toBe(true);
    expect(canExecuteTransition('COMPLETED')).toBe(true);
    expect(canExecuteTransition('RUNNING')).toBe(false);
    expect(canExecuteTransition('FAILED')).toBe(false);
    expect(canExecuteTransition('CANCELLED')).toBe(false);
  });
});

describe('season-transition hashing', () => {
  it('is deterministic and order-independent', () => {
    const a = stableSeasonTransitionHash({ b: 1, a: 2 });
    const b = stableSeasonTransitionHash({ a: 2, b: 1 });
    expect(a).toBe(b);
  });

  it('computeTransitionInputHash is stable for identical inputs', () => {
    const cfg = defaultConfig;
    const args = {
      configHash: 'cfg-1',
      sourceSeason: sourceSeason(),
      completedOffseasonRun: { id: 'o1', status: 'COMPLETED', resultHash: 'r1', completedAt: '2026-08-01T00:00:00.000Z' },
      offseasonRunsForSeason: [{ id: 'o1', status: 'COMPLETED' }],
      sourceEditions: [domesticEdition()],
      ownership: ownership(),
      runningOperations: runningOps(),
      scoutingStaleness: scouting(),
      targetDisplayNameOverride: null,
      existingTransitionsForSource: [],
      existingSeasonOrders: [2026],
      currentSeasonId: 'season-2026',
    };
    expect(computeTransitionInputHash(args)).toBe(computeTransitionInputHash(args));
  });

  it('detects stale input', () => {
    expect(isInputStillFresh('abc', 'abc')).toBe(true);
    expect(isInputStillFresh('abc', 'abd')).toBe(false);
  });

  it('computeReadiness wraps aggregateReadiness', () => {
    const r = computeReadiness(sourceSeason(), {
      config: defaultConfig,
      completedOffseasonRun: { id: 'o1', status: 'COMPLETED', resultHash: 'r1', completedAt: '2026-08-01T00:00:00.000Z' },
      offseasonRunsForSeason: [{ id: 'o1', status: 'COMPLETED' }],
      sourceEditions: [domesticEdition()],
      ownership: ownership(),
      runningOperations: runningOps(),
      scoutingStaleness: scouting(),
      targetDisplayNameOverride: null,
      existingTransitionsForSource: [],
      existingSeasonOrders: [2026],
      currentSeasonId: 'season-2026',
    });
    expect(r.proposedTargetSeason.order).toBe(2027);
  });

  it('does not mutate input', () => {
    const input = previewInput();
    const snapshot = JSON.stringify(input);
    aggregateReadiness(input);
    expect(JSON.stringify(input)).toBe(snapshot);
  });
});
