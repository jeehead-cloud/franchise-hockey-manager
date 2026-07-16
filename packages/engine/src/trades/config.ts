import type { TradeConfig } from './types.js';
import { TRADE_SCHEMA_VERSION, TradeError } from './types.js';

/**
 * Simplified fictional trade-value defaults. Values are on a normalized 0..100
 * scale (advisory only) and are NOT tuned to any real-world trade-chart. Salary
 * uses the same integer-dollar scale as F28 contracts.
 */
export function defaultTradeConfig(): TradeConfig {
  return {
    schemaVersion: TRADE_SCHEMA_VERSION,
    assets: { allowPlayers: true, allowDraftPicks: true, allowDraftRights: true, maximumAssetsPerSide: 10 },
    playerValue: {
      currentAbilityWeight: 0.3,
      contractValueWeight: 0.2,
      ageWeight: 0.15,
      roleWeight: 0.1,
      recentPerformanceWeight: 0.1,
      developmentTrendWeight: 0.1,
      retirementRiskWeight: 0.05,
    },
    prospectValue: {
      estimatedPotentialWeight: 0.45,
      estimatedCurrentAbilityWeight: 0.2,
      confidenceWeight: 0.15,
      projectedRoleWeight: 0.1,
      riskPenaltyWeight: 0.1,
    },
    draftPickValue: {
      roundBaseValues: [100, 70, 48, 32, 22, 15, 10],
      futureSeasonDiscount: 0.88,
      unknownPositionMultiplier: 0.85,
    },
    draftRightValue: {
      estimatedPotentialWeight: 0.55,
      confidenceWeight: 0.2,
      draftPositionWeight: 0.15,
      unsignedRiskWeight: 0.1,
    },
    fairness: { balancedThreshold: 0.15, warningThreshold: 0.35 },
  };
}

const object = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
function exact(o: Record<string, unknown>, keys: string[], label: string) {
  for (const k of Object.keys(o)) if (!keys.includes(k)) throw new TradeError('InvalidTradeConfiguration', `Unknown ${label} field: ${k}`);
}
function finiteWeight(v: unknown, label: string): number {
  if (typeof v !== 'number' || !Number.isFinite(v) || v < 0) throw new TradeError('InvalidTradeConfiguration', `${label} must be a non-negative finite number`);
  return v;
}
function fraction(v: unknown, label: string): number {
  const n = finiteWeight(v, label);
  if (n > 1) throw new TradeError('InvalidTradeConfiguration', `${label} must be <= 1`);
  return n;
}
function integer(v: unknown, label: string, min = 0): number {
  if (!Number.isInteger(v) || (v as number) < min) throw new TradeError('InvalidTradeConfiguration', `${label} must be an integer >= ${min}`);
  return v as number;
}

function assertWeightSum(weights: object, label: string) {
  const sum = Object.values(weights).reduce((a, b) => a + (b as number), 0);
  if (Math.abs(sum - 1) > 1e-9) throw new TradeError('InvalidTradeConfiguration', `${label} weights must sum to 1`);
}

export function validateTradeConfig(raw: unknown): TradeConfig {
  if (!object(raw)) throw new TradeError('InvalidTradeConfiguration', 'Config must be an object');
  exact(raw, ['schemaVersion', 'assets', 'playerValue', 'prospectValue', 'draftPickValue', 'draftRightValue', 'fairness'], 'config');
  if (raw.schemaVersion !== TRADE_SCHEMA_VERSION) throw new TradeError('InvalidTradeConfiguration', `Unsupported schemaVersion (expected ${TRADE_SCHEMA_VERSION})`);
  for (const key of ['assets', 'playerValue', 'prospectValue', 'draftPickValue', 'draftRightValue', 'fairness']) {
    if (!object(raw[key])) throw new TradeError('InvalidTradeConfiguration', `${key} section required`);
  }
  const assetsRaw = raw.assets as Record<string, unknown>;
  exact(assetsRaw, ['allowPlayers', 'allowDraftPicks', 'allowDraftRights', 'maximumAssetsPerSide'], 'assets');
  for (const flag of ['allowPlayers', 'allowDraftPicks', 'allowDraftRights']) {
    if (typeof assetsRaw[flag] !== 'boolean') throw new TradeError('InvalidTradeConfiguration', `assets.${flag} must be boolean`);
  }
  const maximumAssetsPerSide = integer(assetsRaw.maximumAssetsPerSide, 'assets.maximumAssetsPerSide', 1);
  if (maximumAssetsPerSide > 50) throw new TradeError('InvalidTradeConfiguration', 'assets.maximumAssetsPerSide is unreasonably large');

  const playerKeys = ['currentAbilityWeight', 'contractValueWeight', 'ageWeight', 'roleWeight', 'recentPerformanceWeight', 'developmentTrendWeight', 'retirementRiskWeight'];
  const playerValueRaw = raw.playerValue as Record<string, unknown>;
  exact(playerValueRaw, playerKeys, 'playerValue');
  const playerValue = Object.fromEntries(playerKeys.map((k) => [k, finiteWeight(playerValueRaw[k], `playerValue.${k}`)])) as unknown as TradeConfig['playerValue'];
  assertWeightSum(playerValue, 'playerValue');

  const prospectKeys = ['estimatedPotentialWeight', 'estimatedCurrentAbilityWeight', 'confidenceWeight', 'projectedRoleWeight', 'riskPenaltyWeight'];
  const prospectValueRaw = raw.prospectValue as Record<string, unknown>;
  exact(prospectValueRaw, prospectKeys, 'prospectValue');
  const prospectValue = Object.fromEntries(prospectKeys.map((k) => [k, finiteWeight(prospectValueRaw[k], `prospectValue.${k}`)])) as unknown as TradeConfig['prospectValue'];
  assertWeightSum(prospectValue, 'prospectValue');

  const pickRaw = raw.draftPickValue as Record<string, unknown>;
  exact(pickRaw, ['roundBaseValues', 'futureSeasonDiscount', 'unknownPositionMultiplier'], 'draftPickValue');
  if (!Array.isArray(pickRaw.roundBaseValues) || !pickRaw.roundBaseValues.length) throw new TradeError('InvalidTradeConfiguration', 'draftPickValue.roundBaseValues must be a non-empty array');
  const roundBaseValues = pickRaw.roundBaseValues.map((v, i) => finiteWeight(v, `draftPickValue.roundBaseValues[${i}]`));
  const futureSeasonDiscount = fraction(pickRaw.futureSeasonDiscount, 'draftPickValue.futureSeasonDiscount');
  const unknownPositionMultiplier = fraction(pickRaw.unknownPositionMultiplier, 'draftPickValue.unknownPositionMultiplier');

  const rightKeys = ['estimatedPotentialWeight', 'confidenceWeight', 'draftPositionWeight', 'unsignedRiskWeight'];
  const rightRaw = raw.draftRightValue as Record<string, unknown>;
  exact(rightRaw, rightKeys, 'draftRightValue');
  const draftRightValue = Object.fromEntries(rightKeys.map((k) => [k, finiteWeight(rightRaw[k], `draftRightValue.${k}`)])) as unknown as TradeConfig['draftRightValue'];
  assertWeightSum(draftRightValue, 'draftRightValue');

  const fairnessRaw = raw.fairness as Record<string, unknown>;
  exact(fairnessRaw, ['balancedThreshold', 'warningThreshold'], 'fairness');
  const balancedThreshold = fraction(fairnessRaw.balancedThreshold, 'fairness.balancedThreshold');
  const warningThreshold = fraction(fairnessRaw.warningThreshold, 'fairness.warningThreshold');
  if (warningThreshold < balancedThreshold) throw new TradeError('InvalidTradeConfiguration', 'fairness.warningThreshold must be >= balancedThreshold');

  return {
    schemaVersion: TRADE_SCHEMA_VERSION,
    assets: { ...assetsRaw, maximumAssetsPerSide } as TradeConfig['assets'],
    playerValue,
    prospectValue,
    draftPickValue: { roundBaseValues, futureSeasonDiscount, unknownPositionMultiplier },
    draftRightValue,
    fairness: { balancedThreshold, warningThreshold },
  };
}
