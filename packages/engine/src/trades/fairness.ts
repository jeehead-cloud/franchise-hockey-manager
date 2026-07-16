import type { TradeConfig, TradeFairnessResult } from './types.js';

/**
 * Fairness is advisory only. It never accepts or rejects a trade. A warning is
 * raised when the relative imbalance between the two sides crosses the configured
 * warning threshold.
 */
export function evaluateFairness(proposingTotal: number, receivingTotal: number, config: TradeConfig): TradeFairnessResult {
  const sum = proposingTotal + receivingTotal;
  if (sum <= 0) {
    return { imbalance: 0, label: 'BALANCED', proposingTotal, receivingTotal, warning: false };
  }
  const imbalance = Math.abs(proposingTotal - receivingTotal) / sum;
  let label: TradeFairnessResult['label'] = 'IMBALANCED';
  if (imbalance <= config.fairness.balancedThreshold) label = 'BALANCED';
  else if (imbalance < config.fairness.warningThreshold) label = 'WARNING';
  return {
    imbalance: Math.round(imbalance * 1000) / 1000,
    label,
    proposingTotal,
    receivingTotal,
    warning: imbalance >= config.fairness.warningThreshold,
  };
}
