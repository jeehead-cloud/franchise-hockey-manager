import type { TradeAssetValuation, TradeConfig, TradeDraftRightAssetDto } from './types.js';
import { stableTradeHash } from './hashing.js';
import { valueProspectFromEstimates } from './player-value.js';

const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n));

/**
 * Deterministic draft-right value from the evaluating Team's F26 estimates only
 * (or a conservative Unknown fallback). Never uses true hidden potential.
 */
export function valueRightAsset(asset: TradeDraftRightAssetDto, config: TradeConfig): TradeAssetValuation {
  const w = config.draftRightValue;
  const estimate = valueProspectFromEstimates(
    { potentialEstimate: asset.potentialEstimate, currentAbilityEstimate: asset.currentAbilityEstimate, projectedRole: asset.projectedRole },
    config,
  );
  // Draft-position weighting: earlier originating rounds confer higher value.
  const round = asset.originatingRound ?? null;
  const cfg = config.draftPickValue;
  const maxBase = Math.max(...cfg.roundBaseValues);
  const positionScore = round !== null && round - 1 < cfg.roundBaseValues.length
    ? clamp((cfg.roundBaseValues[round - 1]! / maxBase) * 100, 0, 100)
    : clamp((cfg.roundBaseValues.at(-1)! / maxBase) * 100, 0, 100);

  const confidence = clamp((asset.potentialEstimate?.confidence ?? asset.currentAbilityEstimate?.confidence ?? 0) * 100, 0, 100);
  const unsignedRisk = clamp(100 - confidence, 0, 100); // unsigned → higher risk

  const baseValue = estimate.value; // already a 0..100 prospect estimate
  const value = clamp(
    baseValue * w.estimatedPotentialWeight +
      confidence * w.confidenceWeight +
      positionScore * w.draftPositionWeight -
      unsignedRisk * w.unsignedRiskWeight,
    0,
    100,
  );

  const factors = [
    ...estimate.factors,
    `Originating round ${round ?? 'unknown'} → position score ${Math.round(positionScore)}.`,
    `Unsigned-prospect risk ${Math.round(unsignedRisk)}.`,
  ];
  const result: Omit<TradeAssetValuation, 'valuationHash'> = { assetType: 'PLAYER_DRAFT_RIGHT', value: Math.round(value * 100) / 100, factors };
  return { ...result, valuationHash: stableTradeHash({ type: 'PLAYER_DRAFT_RIGHT', asset, result }) };
}
