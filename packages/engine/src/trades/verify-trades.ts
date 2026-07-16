/**
 * F29 trades engine verifier. Runs the required deterministic checks and a
 * bounded multi-asset benchmark. Usage: `npm run verify:trades`.
 */
import { performance } from 'node:perf_hooks';
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
  validateTradeConfig,
  valuePickAsset,
  valuePlayerAsset,
  valueProspectFromEstimates,
  valueRightAsset,
  valueUnknownProspect,
  type TradeConfig,
  TradeError,
  type TradeDraftPickAssetDto,
  type TradeDraftRightAssetDto,
  type TradePlayerAssetDto,
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
    caughtCode = e instanceof TradeError ? e.code : undefined;
  }
  if (!threw || (code && caughtCode !== code)) throw new Error(`FAIL: ${label} (expected throw${code ? ` ${code}` : ''})`);
  console.log(`PASS: ${label}`);
}

const config = validateTradeConfig(defaultTradeConfig());

// 1. Config validation
check(config.schemaVersion === 1, 'config schema version');
expectThrow(() => validateTradeConfig({ ...defaultTradeConfig(), schemaVersion: 99 }), 'config rejects unknown schema version', 'InvalidTradeConfiguration');
expectThrow(() => validateTradeConfig({ ...defaultTradeConfig(), playerValue: { ...defaultTradeConfig().playerValue, currentAbilityWeight: 5 } }), 'config rejects non-unit weights', 'InvalidTradeConfiguration');
expectThrow(() => validateTradeConfig({ ...defaultTradeConfig(), extras: 1 }), 'config rejects unknown fields', 'InvalidTradeConfiguration');
expectThrow(() => validateTradeConfig({ ...defaultTradeConfig(), fairness: { balancedThreshold: 0.5, warningThreshold: 0.2 } }), 'config rejects warning < balanced', 'InvalidTradeConfiguration');

// 2-5. Player asset eligibility
const okPlayer: Parameters<typeof assertPlayerTradeEligibility>[0] = {
  playerId: 'p1', rosterStatus: 'ACTIVE', currentTeamId: 't1', sourceTeamId: 't1',
  activeContractTeamId: 't1', activeContractId: 'c1', hasFutureContract: false, futureContractTeamId: null,
};
check(assertPlayerTradeEligibility(okPlayer).eligible, 'eligible signed player');
check(!assertPlayerTradeEligibility({ ...okPlayer, rosterStatus: 'RETIRED' }).eligible, 'retired player rejected');
check(!assertPlayerTradeEligibility({ ...okPlayer, currentTeamId: null }).eligible, 'free agent rejected');
check(!assertPlayerTradeEligibility({ ...okPlayer, activeContractId: null }).eligible, 'no active contract rejected');
check(!assertPlayerTradeEligibility({ ...okPlayer, activeContractTeamId: 't2' }).eligible, 'ownership mismatch rejected');

// 6-7. Pick eligibility
const okPick: Parameters<typeof assertPickTradeEligibility>[0] = { pickId: 'pk1', currentTeamId: 't1', sourceTeamId: 't1', pickStatus: 'PENDING', draftEventStatus: 'READY' };
check(assertPickTradeEligibility(okPick).eligible, 'eligible pending pick');
check(!assertPickTradeEligibility({ ...okPick, pickStatus: 'COMPLETED' }).eligible, 'completed pick rejected');
check(!assertPickTradeEligibility({ ...okPick, draftEventStatus: 'IN_PROGRESS' }).eligible, 'draft in progress blocks pick trade');
check(!assertPickTradeEligibility({ ...okPick, currentTeamId: 't2' }).eligible, 'pick ownership mismatch rejected');

// 8. Rights eligibility
const okRight: Parameters<typeof assertRightTradeEligibility>[0] = { rightId: 'r1', playerId: 'p9', status: 'ACTIVE', teamId: 't1', sourceTeamId: 't1', playerCurrentTeamId: null };
check(assertRightTradeEligibility(okRight).eligible, 'eligible active right');
check(!assertRightTradeEligibility({ ...okRight, status: 'CONVERTED_TO_CONTRACT' }).eligible, 'converted right rejected');
check(!assertRightTradeEligibility({ ...okRight, playerCurrentTeamId: 't1' }).eligible, 'signed rights-held player rejected');

// 9-10. Duplicates/conflict + self-trade
const summaryA = summarizeProposal({
  proposingTeamId: 't1', receivingTeamId: 't2',
  proposingAssets: [{ assetType: 'PLAYER_CONTRACT', playerContractId: 'c1', playerId: 'p1' }],
  receivingAssets: [{ assetType: 'DRAFT_PICK', draftPickId: 'pk1' }],
}, config);
check(isProposalConsistent(summaryA), 'consistent proposal');
const dupSummary = summarizeProposal({
  proposingTeamId: 't1', receivingTeamId: 't2',
  proposingAssets: [
    { assetType: 'PLAYER_CONTRACT', playerContractId: 'c1', playerId: 'p1' },
    { assetType: 'PLAYER_DRAFT_RIGHT', playerDraftRightId: 'r1', playerId: 'p1' },
  ],
  receivingAssets: [],
}, config);
check(dupSummary.conflictingPlayerIds.length === 1, 'conflicting player asset detected');
const dupKey = summarizeProposal({
  proposingTeamId: 't1', receivingTeamId: 't2',
  proposingAssets: [
    { assetType: 'DRAFT_PICK', draftPickId: 'pk1' },
    { assetType: 'DRAFT_PICK', draftPickId: 'pk1' },
  ],
  receivingAssets: [],
}, config);
check(dupKey.duplicateAssetKeys.length === 1, 'duplicate asset detected');
expectThrow(() => summarizeProposal({ proposingTeamId: 't1', receivingTeamId: 't1', proposingAssets: [], receivingAssets: [] }, config), 'self-trade rejected');

// 11. Player valuation determinism
const playerDto: TradePlayerAssetDto = {
  playerId: 'p1', playerName: 'Test Player', position: 'C', dateOfBirth: '2000-01-01', effectiveDate: '2028-09-15',
  currentAbility: 80, roleRating: 70, projectedRole: 'TOP', recentPerformance: 65, developmentTrend: 2,
  rosterStatus: 'ACTIVE', activeContractId: 'c1', activeContractTeamId: 't1', activeAnnualSalary: 6_000_000,
  activeContractEndOrder: 2030, hasFutureContract: false, potentialEstimate: null, retirementRisk: 5,
};
const pv1 = valuePlayerAsset(playerDto, config);
const pv2 = valuePlayerAsset(playerDto, config);
check(pv1.value === pv2.value && pv1.valuationHash === pv2.valuationHash, 'player valuation deterministic replay');

// 12-13. Prospect valuation from estimates / Unknown fallback
const scoutPlayerDto: TradePlayerAssetDto = { ...playerDto, rosterStatus: 'PROSPECT', currentAbility: null, potentialEstimate: { estimate: 78, confidence: 0.6, stale: false } };
const prospectValue = valuePlayerAsset(scoutPlayerDto, config).value;
const prospectFromEstimates = valueProspectFromEstimates({ potentialEstimate: { estimate: 78, confidence: 0.6, stale: false }, currentAbilityEstimate: null, projectedRole: 'TOP' }, config).value;
const unknownValue = valueUnknownProspect(config);
check(prospectValue !== unknownValue, 'prospect estimate differs from Unknown fallback');
check(prospectFromEstimates !== unknownValue, 'prospect-from-estimates differs from Unknown fallback');
check(unknownValue < 50, 'Unknown fallback is conservative');

// 14. Pick valuation
const pickDto: TradeDraftPickAssetDto = { pickId: 'pk1', draftEventId: 'e1', draftEventStatus: 'READY', roundNumber: 1, overallPick: 1, pickStatus: 'PENDING', originalTeamId: 't1', currentTeamId: 't1', draftSeasonOrder: 2028, currentSeasonOrder: 2028 };
const pickVal = valuePickAsset(pickDto, config);
check(pickVal.value > 0 && pickVal.value <= 100, 'pick valuation in range');
const futurePickVal = valuePickAsset({ ...pickDto, draftSeasonOrder: 2030 }, config).value;
check(futurePickVal < pickVal.value, 'future pick discounted');

// 15. Rights valuation
const rightDto: TradeDraftRightAssetDto = { rightId: 'r1', playerId: 'p9', playerName: 'Rights Prospect', position: 'C', dateOfBirth: '2008-01-01', effectiveDate: '2028-09-15', status: 'ACTIVE', originatingRound: 1, potentialEstimate: { estimate: 75, confidence: 0.5, stale: false }, currentAbilityEstimate: { estimate: 40, confidence: 0.5, stale: false }, projectedRole: 'TOP' };
const rightVal = valueRightAsset(rightDto, config);
check(rightVal.value > 0 && rightVal.value <= 100, 'rights valuation in range');

// 16. Team-specific valuation divergence (different estimates → different value)
const teamAView = valuePlayerAsset({ ...scoutPlayerDto, potentialEstimate: { estimate: 90, confidence: 0.8, stale: false } }, config).value;
const teamBView = valuePlayerAsset({ ...scoutPlayerDto, potentialEstimate: { estimate: 55, confidence: 0.3, stale: false } }, config).value;
check(teamAView !== teamBView, 'team-specific valuations diverge');

// 17. Fairness warnings
check(evaluateFairness(50, 50, config).label === 'BALANCED', 'balanced trade');
check(evaluateFairness(50, 20, config).warning, 'imbalanced trade warns');

// 18-20. Hashes + reconciliation
check(stableTradeHash({ a: 1, b: 2 }) === stableTradeHash({ b: 2, a: 1 }), 'stable hash order-independent');
assertTradeReconciliation(reconcileTradeAssets(
  [{ assetType: 'PLAYER_CONTRACT', playerContractId: 'c1', playerId: 'p1' }],
  [{ assetType: 'DRAFT_PICK', draftPickId: 'pk1' }],
));
check(true, 'reconciliation passes for consistent assets');
const badRecon = reconcileTradeAssets(
  [{ assetType: 'PLAYER_CONTRACT', playerContractId: 'c1', playerId: 'p1' }, { assetType: 'PLAYER_DRAFT_RIGHT', playerDraftRightId: 'r1', playerId: 'p1' }],
  [],
);
check(!badRecon.valid, 'reconciliation flags conflicting player asset');

// 21. No input mutation
const inputSnapshot = JSON.parse(JSON.stringify(playerDto)) as TradePlayerAssetDto;
valuePlayerAsset(playerDto, config);
check(JSON.stringify(playerDto) === JSON.stringify(inputSnapshot), 'valuation does not mutate input');

// Benchmark: bounded multi-asset proposal valuation
const started = performance.now();
for (let i = 0; i < 100; i++) {
  valuePlayerAsset({ ...playerDto, playerId: `p${i}`, currentAbility: 40 + (i % 60) }, config);
  valuePickAsset({ ...pickDto, pickId: `pk${i}`, roundNumber: (i % 7) + 1 }, config);
}
const duration = performance.now() - started;
check(duration < 2000, `200 multi-asset valuations benchmark (${duration.toFixed(2)}ms)`);

console.log('Trades verifier complete.');
