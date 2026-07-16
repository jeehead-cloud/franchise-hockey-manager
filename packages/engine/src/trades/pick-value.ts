import type { TradeAssetValuation, TradeConfig, TradeDraftPickAssetDto } from './types.js';
import { stableTradeHash } from './hashing.js';

const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n));

/**
 * Deterministic draft-pick value (advisory only). Falls back to a round-base
 * value when the overall position is unknown, discounts future picks, and never
 * reflects true player potential (the prospect may not exist yet).
 */
export function valuePickAsset(asset: TradeDraftPickAssetDto, config: TradeConfig): TradeAssetValuation {
  const cfg = config.draftPickValue;
  const roundIndex = Math.max(0, asset.roundNumber - 1);
  const base = roundIndex < cfg.roundBaseValues.length ? cfg.roundBaseValues[roundIndex]! : cfg.roundBaseValues.at(-1)!;

  // Position multiplier: within a round, earlier overall picks are worth more.
  // We approximate position impact using a mild decay; when the overall pick is
  // the round's first pick or unknown, this stays at/under 1.0.
  let positionMultiplier = 1;
  const picksPerRoundGuess = 32; // league-average; advisory only
  if (typeof asset.overallPick === 'number' && asset.overallPick > 0) {
    const pickInRound = ((asset.overallPick - 1) % picksPerRoundGuess) + 1;
    positionMultiplier = clamp(1.15 - (pickInRound - 1) * (0.15 / Math.max(1, picksPerRoundGuess - 1)), 0.85, 1.15);
  } else {
    positionMultiplier = cfg.unknownPositionMultiplier;
  }

  // Future-pick discount: how many seasons ahead of the current season is the draft.
  let futureMultiplier = 1;
  if (asset.currentSeasonOrder !== null && asset.draftSeasonOrder !== null) {
    const seasonsAhead = Math.max(0, asset.draftSeasonOrder - asset.currentSeasonOrder);
    futureMultiplier = Math.pow(cfg.futureSeasonDiscount, seasonsAhead);
  } else if (asset.currentSeasonOrder !== null && asset.draftSeasonOrder !== null && asset.draftSeasonOrder < asset.currentSeasonOrder) {
    // Same-season or past-order pick (current draft) — no discount.
    futureMultiplier = 1;
  }

  const raw = base * positionMultiplier * futureMultiplier;
  // Normalize against the highest round-base value so output lands on ~0..100.
  const maxBase = Math.max(...cfg.roundBaseValues);
  const value = clamp((raw / maxBase) * 100, 0, 100);
  const factors = [
    `Round ${asset.roundNumber} base value ${base} (chart index ${roundIndex}).`,
    `Position multiplier ${positionMultiplier.toFixed(3)} (overall ${asset.overallPick ?? 'unknown'}).`,
    `Future discount ${futureMultiplier.toFixed(3)} (${asset.draftSeasonOrder ?? '?'}/${asset.currentSeasonOrder ?? '?'} season order).`,
  ];
  const result: Omit<TradeAssetValuation, 'valuationHash'> = { assetType: 'DRAFT_PICK', value: Math.round(value * 100) / 100, factors };
  return { ...result, valuationHash: stableTradeHash({ type: 'DRAFT_PICK', asset, result }) };
}
