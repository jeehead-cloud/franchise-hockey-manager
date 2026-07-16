import { describe, expect, it } from 'vitest';
import {
  assertPickTradeEligibility,
  assertPlayerTradeEligibility,
  assertRightTradeEligibility,
  assertTradeReconciliation,
  defaultTradeConfig,
  evaluateFairness,
  isProposalConsistent,
  reconcileTradeAssets,
  stableTradeHash,
  summarizeProposal,
  tradeAgeOnDate,
  validateTradeConfig,
  valuePickAsset,
  valuePlayerAsset,
  valueProspectFromEstimates,
  valueRightAsset,
  valueUnknownProspect,
  type TradeConfig,
  TradeError,
} from './index.js';

const config = validateTradeConfig(defaultTradeConfig());

describe('trades engine — config', () => {
  it('round-trips the default config', () => expect(validateTradeConfig(defaultTradeConfig())).toEqual(defaultTradeConfig()));
  it('rejects unknown fields', () => expect(() => validateTradeConfig({ ...defaultTradeConfig(), extra: 1 })).toThrow(TradeError));
  it('rejects wrong schema version', () => expect(() => validateTradeConfig({ ...defaultTradeConfig(), schemaVersion: 2 })).toThrow(/schemaVersion/));
  it('rejects non-unit player weights', () => expect(() => validateTradeConfig({ ...defaultTradeConfig(), playerValue: { ...defaultTradeConfig().playerValue, currentAbilityWeight: 5 } })).toThrow(/sum to 1/));
  it('rejects warning threshold below balanced', () => expect(() => validateTradeConfig({ ...defaultTradeConfig(), fairness: { balancedThreshold: 0.5, warningThreshold: 0.2 } })).toThrow(/>=/));
  it('rejects empty round base values', () => expect(() => validateTradeConfig({ ...defaultTradeConfig(), draftPickValue: { ...defaultTradeConfig().draftPickValue, roundBaseValues: [] } })).toThrow(/roundBaseValues/));
});

describe('trades engine — player eligibility', () => {
  const ok = { playerId: 'p1', rosterStatus: 'ACTIVE', currentTeamId: 't1', sourceTeamId: 't1', activeContractTeamId: 't1', activeContractId: 'c1', hasFutureContract: false, futureContractTeamId: null };
  it('accepts an eligible signed player', () => expect(assertPlayerTradeEligibility(ok).eligible).toBe(true));
  it('rejects retired players', () => expect(assertPlayerTradeEligibility({ ...ok, rosterStatus: 'RETIRED' }).eligible).toBe(false));
  it('rejects free agents', () => expect(assertPlayerTradeEligibility({ ...ok, currentTeamId: null }).eligible).toBe(false));
  it('requires an active contract', () => expect(assertPlayerTradeEligibility({ ...ok, activeContractId: null, activeContractTeamId: null }).eligible).toBe(false));
  it('rejects ownership mismatch', () => expect(assertPlayerTradeEligibility({ ...ok, activeContractTeamId: 't2' }).eligible).toBe(false));
  it('rejects future contract held by another team', () => expect(assertPlayerTradeEligibility({ ...ok, hasFutureContract: true, futureContractTeamId: 't2' }).eligible).toBe(false));
});

describe('trades engine — pick eligibility', () => {
  const ok = { pickId: 'pk1', currentTeamId: 't1', sourceTeamId: 't1', pickStatus: 'PENDING', draftEventStatus: 'READY' };
  it('accepts a pending pick', () => expect(assertPickTradeEligibility(ok).eligible).toBe(true));
  it('rejects completed picks', () => expect(assertPickTradeEligibility({ ...ok, pickStatus: 'COMPLETED' }).eligible).toBe(false));
  it('rejects on-the-clock picks', () => expect(assertPickTradeEligibility({ ...ok, pickStatus: 'ON_THE_CLOCK' }).eligible).toBe(false));
  it('blocks trades once draft is in progress', () => expect(assertPickTradeEligibility({ ...ok, draftEventStatus: 'IN_PROGRESS' }).eligible).toBe(false));
  it('rejects ownership mismatch', () => expect(assertPickTradeEligibility({ ...ok, currentTeamId: 't2' }).eligible).toBe(false));
});

describe('trades engine — right eligibility', () => {
  const ok = { rightId: 'r1', playerId: 'p9', status: 'ACTIVE', teamId: 't1', sourceTeamId: 't1', playerCurrentTeamId: null };
  it('accepts an active right', () => expect(assertRightTradeEligibility(ok).eligible).toBe(true));
  it('rejects converted rights', () => expect(assertRightTradeEligibility({ ...ok, status: 'CONVERTED_TO_CONTRACT' }).eligible).toBe(false));
  it('rejects expired rights', () => expect(assertRightTradeEligibility({ ...ok, status: 'EXPIRED' }).eligible).toBe(false));
  it('rejects already-signed rights-held player', () => expect(assertRightTradeEligibility({ ...ok, playerCurrentTeamId: 't1' }).eligible).toBe(false));
  it('rejects ownership mismatch', () => expect(assertRightTradeEligibility({ ...ok, teamId: 't2' }).eligible).toBe(false));
});

describe('trades engine — proposal summary', () => {
  const proposing = [{ assetType: 'PLAYER_CONTRACT' as const, playerContractId: 'c1', playerId: 'p1' }];
  const receiving = [{ assetType: 'DRAFT_PICK' as const, draftPickId: 'pk1' }];
  it('detects self-trade', () => expect(() => summarizeProposal({ proposingTeamId: 't1', receivingTeamId: 't1', proposingAssets: [], receivingAssets: [] }, config)).toThrow());
  it('produces a deterministic proposal hash', () => {
    const a = summarizeProposal({ proposingTeamId: 't1', receivingTeamId: 't2', proposingAssets: proposing, receivingAssets: receiving }, config);
    const b = summarizeProposal({ proposingTeamId: 't1', receivingTeamId: 't2', proposingAssets: proposing, receivingAssets: receiving }, config);
    expect(a.proposalHash).toBe(b.proposalHash);
    expect(isProposalConsistent(a)).toBe(true);
  });
  it('flags duplicate assets', () => {
    const s = summarizeProposal({ proposingTeamId: 't1', receivingTeamId: 't2', proposingAssets: [{ assetType: 'DRAFT_PICK', draftPickId: 'pk1' }, { assetType: 'DRAFT_PICK', draftPickId: 'pk1' }], receivingAssets: [] }, config);
    expect(s.duplicateAssetKeys).toHaveLength(1);
  });
  it('flags conflicting player assets', () => {
    const s = summarizeProposal({ proposingTeamId: 't1', receivingTeamId: 't2', proposingAssets: [{ assetType: 'PLAYER_CONTRACT', playerContractId: 'c1', playerId: 'p1' }, { assetType: 'PLAYER_DRAFT_RIGHT', playerDraftRightId: 'r1', playerId: 'p1' }], receivingAssets: [] }, config);
    expect(s.conflictingPlayerIds).toEqual(['p1']);
  });
  it('rejects sides exceeding maximum assets', () => {
    const many = Array.from({ length: config.assets.maximumAssetsPerSide + 1 }, (_, i) => ({ assetType: 'DRAFT_PICK' as const, draftPickId: `pk${i}` }));
    expect(() => summarizeProposal({ proposingTeamId: 't1', receivingTeamId: 't2', proposingAssets: many, receivingAssets: [] }, config)).toThrow();
  });
});

describe('trades engine — valuations', () => {
  const player = {
    playerId: 'p1', playerName: 'X', position: 'C', dateOfBirth: '2000-01-01', effectiveDate: '2028-09-15',
    currentAbility: 82, roleRating: 75, projectedRole: 'TOP', recentPerformance: 70, developmentTrend: 2,
    rosterStatus: 'ACTIVE', activeContractId: 'c1', activeContractTeamId: 't1', activeAnnualSalary: 7_000_000,
    activeContractEndOrder: 2030, hasFutureContract: false, potentialEstimate: null, retirementRisk: 4,
  };
  it('values a roster player deterministically without mutation', () => {
    const before = structuredClone(player);
    const a = valuePlayerAsset(player, config);
    const b = valuePlayerAsset(player, config);
    expect(a.valuationHash).toBe(b.valuationHash);
    expect(a.value).toBeGreaterThan(0);
    expect(player).toEqual(before);
  });
  it('derives prospect values from estimates only (never true potential)', () => {
    const scouted = valueProspectFromEstimates({ potentialEstimate: { estimate: 85, confidence: 0.7, stale: false }, currentAbilityEstimate: null, projectedRole: 'TOP' }, config).value;
    const unknown = valueUnknownProspect(config);
    expect(scouted).toBeGreaterThan(unknown);
    expect(unknown).toBeLessThan(50);
  });
  it('discounts future picks', () => {
    const now = valuePickAsset({ pickId: 'pk1', draftEventId: 'e1', draftEventStatus: 'READY', roundNumber: 1, overallPick: 1, pickStatus: 'PENDING', originalTeamId: 't1', currentTeamId: 't1', draftSeasonOrder: 2028, currentSeasonOrder: 2028 }, config).value;
    const future = valuePickAsset({ pickId: 'pk1', draftEventId: 'e1', draftEventStatus: 'READY', roundNumber: 1, overallPick: 1, pickStatus: 'PENDING', originalTeamId: 't1', currentTeamId: 't1', draftSeasonOrder: 2031, currentSeasonOrder: 2028 }, config).value;
    expect(future).toBeLessThan(now);
  });
  it('values a draft right from scouting estimates', () => {
    const v = valueRightAsset({ rightId: 'r1', playerId: 'p9', playerName: 'X', position: 'C', dateOfBirth: '2008-01-01', effectiveDate: '2028-09-15', status: 'ACTIVE', originatingRound: 1, potentialEstimate: { estimate: 80, confidence: 0.6, stale: false }, currentAbilityEstimate: { estimate: 42, confidence: 0.6, stale: false }, projectedRole: 'TOP' }, config);
    expect(v.value).toBeGreaterThan(0);
    expect(v.value).toBeLessThanOrEqual(100);
  });
  it('produces team-specific divergence for the same prospect', () => {
    const base = { rosterStatus: 'PROSPECT', currentAbility: null } as const;
    const hi = valuePlayerAsset({ ...player, ...base, potentialEstimate: { estimate: 92, confidence: 0.85, stale: false } }, config).value;
    const lo = valuePlayerAsset({ ...player, ...base, potentialEstimate: { estimate: 50, confidence: 0.25, stale: false } }, config).value;
    expect(hi).not.toBe(lo);
  });
});

describe('trades engine — fairness + reconciliation + hashing', () => {
  it('classifies balanced and imbalanced trades', () => {
    expect(evaluateFairness(50, 50, config).label).toBe('BALANCED');
    expect(evaluateFairness(50, 49, config).label).toBe('BALANCED');
    expect(evaluateFairness(50, 20, config).warning).toBe(true);
  });
  it('reconciles consistent assets and flags conflicts', () => {
    assertTradeReconciliation(reconcileTradeAssets([{ assetType: 'PLAYER_CONTRACT', playerContractId: 'c1', playerId: 'p1' }], [{ assetType: 'DRAFT_PICK', draftPickId: 'pk1' }]));
    const bad = reconcileTradeAssets([{ assetType: 'PLAYER_CONTRACT', playerContractId: 'c1', playerId: 'p1' }, { assetType: 'PLAYER_DRAFT_RIGHT', playerDraftRightId: 'r1', playerId: 'p1' }], []);
    expect(bad.valid).toBe(false);
  });
  it('hashes canonically (order-independent)', () => expect(stableTradeHash({ b: 2, a: 1 })).toBe(stableTradeHash({ a: 1, b: 2 })));
  it('measures age on an explicit date', () => expect(tradeAgeOnDate('2000-09-16', '2028-09-15')).toBe(27));
});

describe('trades engine — config type passthrough', () => {
  it('keeps the validated config assignable', () => {
    const c: TradeConfig = config;
    expect(c.schemaVersion).toBe(1);
  });
});
