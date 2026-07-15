import { describe, expect, it } from 'vitest';
import {
  applyLotteryToOrder,
  assertDraftReconciliation,
  buildDraftBoard,
  buildDraftOrder,
  buildEligibilityClass,
  defaultDraftConfig,
  draftAgeOnCutoffDate,
  DraftError,
  evaluateEligibility,
  evaluateProgression,
  hashDraftBoard,
  hashDraftConfig,
  hashDraftOrder,
  hashDraftResult,
  hashLottery,
  hashEligibilityClass,
  reconcileDraft,
  runDraftLottery,
  suggestAutoPick,
  validateDraftConfig,
  UNKNOWN_CA,
  UNKNOWN_POTENTIAL,
  type BoardProspectEstimate,
  type DraftConfig,
  type DraftOrderTeamInput,
  type DraftPickRecord,
  type EligibilityPlayerInput,
} from './index.js';

const cutoff = '2028-09-15';

function prospect(overrides: Partial<EligibilityPlayerInput> = {}): EligibilityPlayerInput {
  return {
    playerId: 'p1',
    displayName: 'P One',
    dateOfBirth: '2010-09-15',
    lifecycleStatus: 'PROSPECT',
    sourceType: 'GENERATED_YOUTH',
    currentTeamId: null,
    alreadyDrafted: false,
    ...overrides,
  };
}

function teams(n: number): DraftOrderTeamInput[] {
  return Array.from({ length: n }, (_, i) => ({
    teamId: `t${i + 1}`,
    teamName: `Team ${i + 1}`,
    standingRank: n - i, // t1 worst (rank n), tn best (rank 1)
  }));
}

describe('F27 draft config', () => {
  it('validates the default config', () => {
    const cfg = validateDraftConfig(defaultDraftConfig());
    expect(cfg.schemaVersion).toBe(1);
    expect(cfg.rounds).toBe(7);
  });

  it('rejects unknown fields', () => {
    const bad = { ...defaultDraftConfig(), unexpected: true } as unknown;
    expect(() => validateDraftConfig(bad)).toThrow(DraftError);
  });

  it('rejects lottery weights length mismatch', () => {
    const cfg = defaultDraftConfig();
    cfg.lottery.weights = [1, 2, 3];
    expect(() => validateDraftConfig(cfg)).toThrow(/weights length/);
  });

  it('rejects rounds <= 0 and bad ages', () => {
    const a = defaultDraftConfig();
    a.rounds = 0;
    expect(() => validateDraftConfig(a)).toThrow(/positive integer/);
    const b = defaultDraftConfig();
    b.eligibility.minimumAge = 25;
    b.eligibility.maximumAge = 20;
    expect(() => validateDraftConfig(b)).toThrow(/maximumAge/);
  });

  it('rejects invalid cutoff date', () => {
    const cfg = defaultDraftConfig();
    cfg.eligibility.cutoffDate = '2028-13-40';
    expect(() => validateDraftConfig(cfg)).toThrow();
  });

  it('hashes deterministically and differs on change', () => {
    const h1 = hashDraftConfig(validateDraftConfig(defaultDraftConfig()));
    const h2 = hashDraftConfig(validateDraftConfig(defaultDraftConfig()));
    expect(h1).toBe(h2);
    const modified = defaultDraftConfig();
    modified.rounds = 3;
    expect(hashDraftConfig(validateDraftConfig(modified))).not.toBe(h1);
  });
});

describe('F27 draft eligibility', () => {
  it('measures age against the explicit cutoff date', () => {
    expect(draftAgeOnCutoffDate('2010-09-15', cutoff)).toBe(18);
    expect(draftAgeOnCutoffDate('2010-09-16', cutoff)).toBe(17);
    expect(draftAgeOnCutoffDate('2009-09-14', cutoff)).toBe(19);
  });

  it('accepts an 18-year-old prospect and rejects over-age and under-age', () => {
    const cfg = defaultDraftConfig();
    const ok = evaluateEligibility(cfg, prospect({ dateOfBirth: '2010-09-15' }));
    expect(ok.eligible).toBe(true);
    expect(ok.ageOnCutoffDate).toBe(18);
    const tooOld = evaluateEligibility(cfg, prospect({ dateOfBirth: '2000-01-01' }));
    expect(tooOld.eligible).toBe(false);
    const tooYoung = evaluateEligibility(cfg, prospect({ dateOfBirth: '2015-01-01' }));
    expect(tooYoung.eligible).toBe(false);
  });

  it('excludes already-drafted, owned, and non-prospect players', () => {
    const cfg = defaultDraftConfig();
    expect(evaluateEligibility(cfg, prospect({ alreadyDrafted: true })).eligible).toBe(false);
    expect(evaluateEligibility(cfg, prospect({ currentTeamId: 'club1' })).eligible).toBe(false);
    expect(evaluateEligibility(cfg, prospect({ lifecycleStatus: 'ACTIVE' })).eligible).toBe(false);
    expect(evaluateEligibility(cfg, prospect({ sourceType: 'REAL_INITIAL_DATA' })).eligible).toBe(false);
  });

  it('does not use true ability or potential to decide eligibility', () => {
    const cfg = defaultDraftConfig();
    // EligibilityPlayerInput has no ability/potential fields at all.
    const r = evaluateEligibility(cfg, prospect());
    expect(r.eligible).toBe(true);
    expect(r.reasons).toEqual([]);
  });

  it('builds an eligibility class with stable hashes', () => {
    const cfg = defaultDraftConfig();
    const { eligible } = buildEligibilityClass(cfg, [
      prospect({ playerId: 'a', dateOfBirth: '2010-09-15' }),
      prospect({ playerId: 'b', dateOfBirth: '2010-09-16' }), // 17 -> rejected
    ]);
    expect(eligible.map((p) => p.playerId)).toEqual(['a']);
    const h1 = hashEligibilityClass(eligible);
    const h2 = hashEligibilityClass(buildEligibilityClass(cfg, [
      prospect({ playerId: 'a', dateOfBirth: '2010-09-15' }),
    ]).eligible);
    expect(h1).toBe(h2);
  });
});

describe('F27 draft order', () => {
  it('reverse standings: worst team picks first', () => {
    const cfg = defaultDraftConfig();
    cfg.order.source = 'REVERSE_STANDINGS';
    const order = buildDraftOrder(cfg, teams(4));
    expect(order.picks[0]!.teamId).toBe('t1'); // worst rank first
    expect(order.picks[0]!.overallPick).toBe(1);
    expect(order.picks[0]!.roundNumber).toBe(1);
    expect(order.picks[0]!.pickInRound).toBe(1);
    // Same order repeated across rounds by default.
    expect(order.picks[1]!.teamId).toBe('t2');
    expect(order.picks[4]!.teamId).toBe('t1'); // round 2 pick 1
    expect(order.picks[4]!.roundNumber).toBe(2);
  });

  it('snakes when repeatSameOrderEachRound is false', () => {
    const cfg = defaultDraftConfig();
    cfg.order.repeatSameOrderEachRound = false;
    const order = buildDraftOrder(cfg, teams(3));
    expect(order.picks.map((p) => p.teamId).slice(0, 3)).toEqual(['t1', 't2', 't3']);
    expect(order.picks.map((p) => p.teamId).slice(3, 6)).toEqual(['t3', 't2', 't1']);
  });

  it('manual order uses the supplied team order', () => {
    const cfg = defaultDraftConfig();
    cfg.order.source = 'MANUAL';
    const order = buildDraftOrder(cfg, [
      { teamId: 'x', teamName: 'X', standingRank: null },
      { teamId: 'y', teamName: 'Y', standingRank: null },
    ]);
    expect(order.picks[0]!.teamId).toBe('x');
    expect(order.picks[1]!.teamId).toBe('y');
  });

  it('rejects duplicate teams', () => {
    const cfg = defaultDraftConfig();
    expect(() => buildDraftOrder(cfg, [
      { teamId: 'x', teamName: 'X', standingRank: 1 },
      { teamId: 'x', teamName: 'X', standingRank: 2 },
    ])).toThrow(/Duplicate/);
  });

  it('order hash is deterministic', () => {
    const cfg = defaultDraftConfig();
    const o1 = buildDraftOrder(cfg, teams(4));
    const o2 = buildDraftOrder(cfg, teams(4));
    expect(o1.orderHash).toBe(o2.orderHash);
    expect(hashDraftOrder(o1)).toBe(o1.orderHash);
  });

  it('pick numbering is unique and contiguous across rounds', () => {
    const cfg = defaultDraftConfig();
    cfg.rounds = 3;
    const order = buildDraftOrder(cfg, teams(5));
    const overalls = order.picks.map((p) => p.overallPick);
    expect(overalls).toEqual(Array.from({ length: 15 }, (_, i) => i + 1));
    const slots = order.picks.map((p) => `${p.roundNumber}:${p.pickInRound}`);
    expect(new Set(slots).size).toBe(15);
  });
});

describe('F27 draft lottery', () => {
  it('is deterministic for the same seed', () => {
    const cfg = defaultDraftConfig();
    const order = buildDraftOrder(cfg, teams(8));
    const l1 = runDraftLottery(cfg, order, 'seed-x');
    const l2 = runDraftLottery(cfg, order, 'seed-x');
    expect(l1.finalFirstRoundOrder).toEqual(l2.finalFirstRoundOrder);
    expect(l1.lotteryHash).toBe(l2.lotteryHash);
    expect(hashLottery(l1)).toBe(l1.lotteryHash);
  });

  it('different seeds usually produce different outcomes', () => {
    const cfg = defaultDraftConfig();
    const order = buildDraftOrder(cfg, teams(8));
    const l1 = runDraftLottery(cfg, order, 'seed-a');
    const l2 = runDraftLottery(cfg, order, 'seed-b');
    // Not guaranteed to differ on every seed pair, but over many teams it will.
    let differ = false;
    for (let s = 0; s < 8; s += 1) {
      const a = runDraftLottery(cfg, order, `seed-${s}`);
      const b = runDraftLottery(cfg, order, `seed-${s}-b`);
      if (a.lotteryHash !== b.lotteryHash) differ = true;
    }
    expect(differ).toBe(true);
    void l1;
    void l2;
  });

  it('enforces maximumMoveUp', () => {
    const cfg = defaultDraftConfig();
    cfg.lottery.maximumMoveUp = 2;
    const order = buildDraftOrder(cfg, teams(8));
    const lottery = runDraftLottery(cfg, order, 'moveup');
    for (const draw of lottery.draws) {
      expect(draw.originalPosition - draw.newPosition).toBeLessThanOrEqual(2);
    }
  });

  it('does not repeat winners within one lottery', () => {
    const cfg = defaultDraftConfig();
    const order = buildDraftOrder(cfg, teams(8));
    const lottery = runDraftLottery(cfg, order, 'no-repeat');
    const winners = lottery.draws.map((d) => d.winningTeamId);
    expect(new Set(winners).size).toBe(winners.length);
  });

  it('weighted behaviour over a representative sample', () => {
    const cfg = defaultDraftConfig();
    const order = buildDraftOrder(cfg, teams(8));
    const counts = new Map<string, number>();
    for (let i = 0; i < 400; i += 1) {
      const l = runDraftLottery(cfg, order, `sample-${i}`);
      // First draw winner tends to be among the worst (highest-weight) teams.
      const w = l.draws[0]!.winningTeamId;
      counts.set(w, (counts.get(w) ?? 0) + 1);
    }
    // Worst team (t1, weight 18) should win more often than the best lottery
    // team (t8, weight 4) — the weights favour the bottom.
    const t1 = counts.get('t1') ?? 0;
    const t8 = counts.get('t8') ?? 0;
    expect(t1).toBeGreaterThan(t8);
  });

  it('applyLotteryToOrder rewrites the first round and preserves determinism', () => {
    const cfg = defaultDraftConfig();
    const order = buildDraftOrder(cfg, teams(8));
    const lottery = runDraftLottery(cfg, order, 'apply');
    const applied = applyLotteryToOrder(cfg, order, lottery);
    const appliedFirst = applied.picks.filter((p) => p.roundNumber === 1).map((p) => p.teamId);
    expect(appliedFirst).toEqual(lottery.finalFirstRoundOrder);
    expect(applied.orderHash).toBeTruthy();
  });

  it('throws when lottery is disabled', () => {
    const cfg = defaultDraftConfig();
    cfg.lottery.enabled = false;
    const order = buildDraftOrder(cfg, teams(8));
    expect(() => runDraftLottery(cfg, order, 'x')).toThrow(DraftError);
  });
});

describe('F27 draft board', () => {
  const estimates: BoardProspectEstimate[] = [
    { playerId: 'a', estimatedCurrentAbility: 50, estimatedPotential: 80, projectedRole: 'TOP_SIX', confidence: 0.8, stale: false, watchlistPriority: 0, manualRank: null },
    { playerId: 'b', estimatedCurrentAbility: 40, estimatedPotential: 70, projectedRole: 'BOTTOM_SIX', confidence: 0.5, stale: false, watchlistPriority: 0, manualRank: null },
    { playerId: 'c', estimatedCurrentAbility: null, estimatedPotential: null, projectedRole: null, confidence: 0.1, stale: true, watchlistPriority: 0, manualRank: null },
  ];

  it('normalizes estimates into a frozen board with deterministic suggested rank', () => {
    const board = buildDraftBoard('team1', estimates);
    expect(board.entries.length).toBe(3);
    const a = board.entries.find((e) => e.playerId === 'a')!;
    expect(a.suggestedRank).toBe(1);
    expect(board.boardHash).toBe(hashDraftBoard(buildDraftBoard('team1', estimates)));
  });

  it('unscouted prospects get high risk and remain ranked', () => {
    const board = buildDraftBoard('team1', estimates);
    const c = board.entries.find((e) => e.playerId === 'c')!;
    expect(c.risk).toBeGreaterThan(0.5);
    expect(c.suggestedRank).not.toBeNull();
  });

  it('drafted players are excluded from suggested rank', () => {
    const board = buildDraftBoard('team1', estimates, { draftedPlayerIds: new Set(['a']) });
    expect(board.entries.find((e) => e.playerId === 'a')!.drafted).toBe(true);
    expect(board.entries.find((e) => e.playerId === 'a')!.suggestedRank).toBeNull();
    expect(board.entries.find((e) => e.playerId === 'b')!.suggestedRank).toBe(1);
  });
});

describe('F27 auto-pick', () => {
  const estimates: BoardProspectEstimate[] = [
    { playerId: 'a', estimatedCurrentAbility: 50, estimatedPotential: 80, projectedRole: 'TOP_SIX', confidence: 0.8, stale: false, watchlistPriority: 0, manualRank: null },
    { playerId: 'b', estimatedCurrentAbility: 40, estimatedPotential: 70, projectedRole: 'BOTTOM_SIX', confidence: 0.5, stale: false, watchlistPriority: 0, manualRank: null },
    { playerId: 'c', estimatedCurrentAbility: 45, estimatedPotential: 75, projectedRole: 'TOP_SIX', confidence: 0.6, stale: false, watchlistPriority: 0, manualRank: null },
  ];

  it('selects the highest-estimate prospect deterministically', () => {
    const r1 = suggestAutoPick({ availableProspects: estimates, teamBoardConfig: { respectManualRank: false }, seed: 's' });
    const r2 = suggestAutoPick({ availableProspects: estimates, teamBoardConfig: { respectManualRank: false }, seed: 's' });
    expect(r1.selectedPlayerId).toBe(r2.selectedPlayerId);
    // Highest potential + role + confidence should be 'a'.
    expect(r1.selectedPlayerId).toBe('a');
  });

  it('uses estimates only — input carries no truth fields', () => {
    // BoardProspectEstimate has no true potential/current ability. The function
    // signature physically cannot read truth.
    const r = suggestAutoPick({ availableProspects: estimates.slice(0, 1), teamBoardConfig: { respectManualRank: false }, seed: 's' });
    expect(r.selectedPlayerId).toBe('a');
  });

  it('manual rank takes precedence when configured', () => {
    const withManual = estimates.map((e) => e.playerId === 'b' ? { ...e, manualRank: 1 } : e);
    const r = suggestAutoPick({ availableProspects: withManual, teamBoardConfig: { respectManualRank: true }, seed: 's' });
    expect(r.selectedPlayerId).toBe('b');
  });

  it('unknown unscouted prospects receive bounded fallback and remain selectable', () => {
    const unscouted: BoardProspectEstimate[] = [
      { playerId: 'x', estimatedCurrentAbility: null, estimatedPotential: null, projectedRole: null, confidence: 0.1, stale: true, watchlistPriority: 0, manualRank: null },
    ];
    const r = suggestAutoPick({ availableProspects: unscouted, teamBoardConfig: { respectManualRank: false }, seed: 's' });
    expect(r.selectedPlayerId).toBe('x');
    expect(r.scores[0]!.components.potential).toBe(UNKNOWN_POTENTIAL * 0.45);
    expect(r.scores[0]!.components.currentAbility).toBe(UNKNOWN_CA * 0.2);
  });

  it('stable fallback breaks ties by player id', () => {
    const tied: BoardProspectEstimate[] = [
      { playerId: 'z', estimatedCurrentAbility: 50, estimatedPotential: 80, projectedRole: 'TOP_SIX', confidence: 0.8, stale: false, watchlistPriority: 0, manualRank: null },
      { playerId: 'a', estimatedCurrentAbility: 50, estimatedPotential: 80, projectedRole: 'TOP_SIX', confidence: 0.8, stale: false, watchlistPriority: 0, manualRank: null },
    ];
    const r = suggestAutoPick({ availableProspects: tied, teamBoardConfig: { respectManualRank: false }, seed: 's' });
    expect(r.selectedPlayerId).toBe('a'); // lexicographically smaller wins ties
  });

  it('throws when no prospects are available', () => {
    expect(() => suggestAutoPick({ availableProspects: [], teamBoardConfig: { respectManualRank: false }, seed: 's' })).toThrow(DraftError);
  });
});

describe('F27 progression & reconciliation', () => {
  function picks(n: number): DraftPickRecord[] {
    return Array.from({ length: n }, (_, i) => ({
      pickId: `pk${i + 1}`,
      roundNumber: Math.floor(i / 3) + 1,
      pickInRound: (i % 3) + 1,
      overallPick: i + 1,
      teamId: `t${(i % 3) + 1}`,
      status: 'PENDING' as const,
      selectedPlayerId: null,
      selectionSource: null,
    }));
  }

  it('marks the first pending pick as on the clock', () => {
    const r = evaluateProgression({ picks: picks(3), availablePlayerIds: ['p1', 'p2'] });
    expect(r.currentPick!.overallPick).toBe(1);
    expect(r.currentPick!.status).toBe('ON_THE_CLOCK');
    expect(r.completed).toBe(false);
    expect(r.remainingPicks).toBe(3);
  });

  it('completes when no available prospects remain', () => {
    const r = evaluateProgression({ picks: picks(3), availablePlayerIds: [] });
    expect(r.completed).toBe(true);
  });

  it('reconciles a clean completed draft', () => {
    const classPlayers = [
      { playerId: 'p1', displayName: 'P1', dateOfBirth: '2010-01-01', ageOnCutoffDate: 18, lifecycleStatus: 'PROSPECT', sourceType: 'GENERATED_YOUTH', countrySnapshot: null, positionSnapshot: null, eligibilityHash: 'h1' },
      { playerId: 'p2', displayName: 'P2', dateOfBirth: '2010-01-01', ageOnCutoffDate: 18, lifecycleStatus: 'PROSPECT', sourceType: 'GENERATED_YOUTH', countrySnapshot: null, positionSnapshot: null, eligibilityHash: 'h2' },
    ];
    const pickRows: DraftPickRecord[] = [
      { pickId: 'pk1', roundNumber: 1, pickInRound: 1, overallPick: 1, teamId: 't1', status: 'COMPLETED', selectedPlayerId: 'p1', selectionSource: 'MANUAL' },
      { pickId: 'pk2', roundNumber: 1, pickInRound: 2, overallPick: 2, teamId: 't2', status: 'COMPLETED', selectedPlayerId: 'p2', selectionSource: 'AUTO' },
    ];
    const rights = [
      { id: 'r1', playerId: 'p1', teamId: 't1', status: 'ACTIVE' as const },
      { id: 'r2', playerId: 'p2', teamId: 't2', status: 'ACTIVE' as const },
    ];
    const result = reconcileDraft({ picks: pickRows, eligibilityClass: classPlayers, rights });
    expect(result.valid).toBe(true);
    expect(() => assertDraftReconciliation({ picks: pickRows, eligibilityClass: classPlayers, rights })).not.toThrow();
  });

  it('flags duplicate drafted players and missing rights', () => {
    const classPlayers = [
      { playerId: 'p1', displayName: 'P1', dateOfBirth: '2010-01-01', ageOnCutoffDate: 18, lifecycleStatus: 'PROSPECT', sourceType: 'GENERATED_YOUTH', countrySnapshot: null, positionSnapshot: null, eligibilityHash: 'h1' },
    ];
    const pickRows: DraftPickRecord[] = [
      { pickId: 'pk1', roundNumber: 1, pickInRound: 1, overallPick: 1, teamId: 't1', status: 'COMPLETED', selectedPlayerId: 'p1', selectionSource: 'MANUAL' },
      { pickId: 'pk2', roundNumber: 1, pickInRound: 2, overallPick: 2, teamId: 't2', status: 'COMPLETED', selectedPlayerId: 'p1', selectionSource: 'MANUAL' },
    ];
    const result = reconcileDraft({ picks: pickRows, eligibilityClass: classPlayers, rights: [] });
    expect(result.valid).toBe(false);
    expect(result.issues.some((i) => i.code === 'DUPLICATE_DRAFTED_PLAYER')).toBe(true);
    expect(result.issues.some((i) => i.code === 'PICK_WITHOUT_RIGHT')).toBe(true);
  });

  it('result hash is deterministic for the same selections', () => {
    const pickRows: DraftPickRecord[] = [
      { pickId: 'pk1', roundNumber: 1, pickInRound: 1, overallPick: 1, teamId: 't1', status: 'COMPLETED', selectedPlayerId: 'p1', selectionSource: 'MANUAL' },
    ];
    const h1 = hashDraftResult({ draftEventId: 'e1', picks: pickRows });
    const h2 = hashDraftResult({ draftEventId: 'e1', picks: pickRows });
    expect(h1).toBe(h2);
  });
});

describe('F27 no-input-mutation', () => {
  it('eligibility, order, lottery, board, autopick do not mutate their inputs', () => {
    const cfg = validateDraftConfig(defaultDraftConfig());
    const cfgBefore = JSON.parse(JSON.stringify(cfg));

    const players: EligibilityPlayerInput[] = [prospect()];
    const playersBefore = JSON.parse(JSON.stringify(players));
    buildEligibilityClass(cfg, players);
    expect(JSON.parse(JSON.stringify(players))).toEqual(playersBefore);

    const teamInput = teams(8);
    const teamsBefore = JSON.parse(JSON.stringify(teamInput));
    const order = buildDraftOrder(cfg, teamInput);
    expect(JSON.parse(JSON.stringify(teamInput))).toEqual(teamsBefore);

    const orderBefore = JSON.parse(JSON.stringify(order));
    runDraftLottery(cfg, order, 'seed');
    expect(JSON.parse(JSON.stringify(order))).toEqual(orderBefore);

    const estimates: BoardProspectEstimate[] = [
      { playerId: 'a', estimatedCurrentAbility: 50, estimatedPotential: 80, projectedRole: 'TOP_SIX', confidence: 0.8, stale: false, watchlistPriority: 0, manualRank: null },
    ];
    const estBefore = JSON.parse(JSON.stringify(estimates));
    buildDraftBoard('t1', estimates);
    suggestAutoPick({ availableProspects: estimates, teamBoardConfig: { respectManualRank: false }, seed: 's' });
    expect(JSON.parse(JSON.stringify(estimates))).toEqual(estBefore);

    expect(JSON.parse(JSON.stringify(cfg))).toEqual(cfgBefore);
  });
});
