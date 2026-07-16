import type { TradeConfig, TradeProposalAssetRef, TradeProposalSummaryInput, TradeProposalSummaryResult } from './types.js';
import { stableTradeHash } from './hashing.js';

/** Stable identity key for an asset — used to detect duplicates within a proposal. */
export function assetIdentityKey(ref: TradeProposalAssetRef): string {
  switch (ref.assetType) {
    case 'PLAYER_CONTRACT':
      return `PLAYER_CONTRACT:${ref.playerContractId ?? ''}`;
    case 'DRAFT_PICK':
      return `DRAFT_PICK:${ref.draftPickId ?? ''}`;
    case 'PLAYER_DRAFT_RIGHT':
      return `PLAYER_DRAFT_RIGHT:${ref.playerDraftRightId ?? ''}`;
    default:
      return `UNKNOWN:${JSON.stringify(ref)}`;
  }
}

/**
 * Summarize a proposal: counts, duplicate-asset detection, conflicting-player
 * detection (the same underlying Player offered through two different asset
 * forms, e.g. PLAYER_CONTRACT and PLAYER_DRAFT_RIGHT), and the deterministic
 * proposal hash. This function never mutates its input.
 */
export function summarizeProposal(input: TradeProposalSummaryInput, config: TradeConfig): TradeProposalSummaryResult {
  if (input.proposingTeamId === input.receivingTeamId) {
    throw new Error('A team cannot trade with itself');
  }
  const all = [...input.proposingAssets, ...input.receivingAssets];
  if (input.proposingAssets.length > config.assets.maximumAssetsPerSide || input.receivingAssets.length > config.assets.maximumAssetsPerSide) {
    throw new Error(`A side may include at most ${config.assets.maximumAssetsPerSide} assets`);
  }
  const seen = new Map<string, number>();
  const duplicateAssetKeys: string[] = [];
  for (const ref of all) {
    const key = assetIdentityKey(ref);
    const count = (seen.get(key) ?? 0) + 1;
    seen.set(key, count);
    if (count === 2) duplicateAssetKeys.push(key);
  }

  // Conflicting player: the same playerId referenced by two different asset refs.
  const playerRefs = new Map<string, string[]>();
  for (const ref of all) {
    if (ref.playerId) {
      const arr = playerRefs.get(ref.playerId) ?? [];
      arr.push(assetIdentityKey(ref));
      playerRefs.set(ref.playerId, arr);
    }
  }
  const conflictingPlayerIds = [...playerRefs.entries()].filter(([, keys]) => new Set(keys).size > 1).map(([pid]) => pid);

  return {
    proposingTeamId: input.proposingTeamId,
    receivingTeamId: input.receivingTeamId,
    proposingAssetCount: input.proposingAssets.length,
    receivingAssetCount: input.receivingAssets.length,
    duplicateAssetKeys,
    conflictingPlayerIds,
    proposalHash: stableTradeHash({
      proposingTeamId: input.proposingTeamId,
      receivingTeamId: input.receivingTeamId,
      proposing: input.proposingAssets.map(assetIdentityKey).sort(),
      receiving: input.receivingAssets.map(assetIdentityKey).sort(),
    }),
  };
}

/** True when a proposal summary is internally consistent (no duplicates/conflicts). */
export function isProposalConsistent(summary: TradeProposalSummaryResult): boolean {
  return summary.duplicateAssetKeys.length === 0 && summary.conflictingPlayerIds.length === 0;
}
