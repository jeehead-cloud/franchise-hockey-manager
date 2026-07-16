import type { TradeProposalAssetRef, TradeReconciliationIssue, TradeReconciliationResult } from './types.js';
import { assetIdentityKey } from './proposal.js';

/**
 * Reconcile a set of completed-trade asset refs for internal consistency: each
 * asset identity key appears at most once, and no underlying player is referenced
 * through conflicting asset forms. Used by the verifier and server acceptance.
 */
export function reconcileTradeAssets(proposing: TradeProposalAssetRef[], receiving: TradeProposalAssetRef[]): TradeReconciliationResult {
  const issues: TradeReconciliationIssue[] = [];
  const all = [...proposing, ...receiving];
  const seen = new Map<string, number>();
  for (const ref of all) {
    const key = assetIdentityKey(ref);
    seen.set(key, (seen.get(key) ?? 0) + 1);
  }
  for (const [key, count] of seen) if (count > 1) issues.push({ code: 'DUPLICATE_ASSET', message: `Asset ${key} appears ${count} times` });
  const playerRefs = new Map<string, Set<string>>();
  for (const ref of all) {
    if (ref.playerId) {
      const set = playerRefs.get(ref.playerId) ?? new Set<string>();
      set.add(assetIdentityKey(ref));
      playerRefs.set(ref.playerId, set);
    }
  }
  for (const [pid, set] of playerRefs) if (set.size > 1) issues.push({ code: 'CONFLICTING_PLAYER_ASSET', message: `Player ${pid} referenced through ${set.size} conflicting asset forms` });
  return { valid: issues.length === 0, issues };
}

export function assertTradeReconciliation(result: TradeReconciliationResult): void {
  if (!result.valid) {
    throw new Error(`Trade reconciliation failed: ${result.issues.map((i) => i.message).join('; ')}`);
  }
}
