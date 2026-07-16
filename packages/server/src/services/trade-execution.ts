import type { Prisma } from '@prisma/client';
import { stableTradeHash } from '@fhm/engine';
import { prisma } from '../db/client.js';
import { createSqliteSafetyBackup } from './sqlite-backup.js';
import { TradeHttpError } from './trade-errors.js';
import { getActiveWorldSeasonId } from './trade-history.js';
import type { LoadedProposal } from './trade-proposals.js';

export interface AcceptanceResult {
  completedTradeId: string;
  tradeHash: string;
  proposalStatus: string;
  transfers: { transactionType: string; playerId?: string | null; contractId?: string | null; draftPickId?: string | null; draftRightId?: string | null; fromTeamId: string; toTeamId: string }[];
}

/**
 * Publish a trade atomically inside a single transaction. Before mutation the
 * current ownership/state of every asset is revalidated; any stale asset aborts
 * the whole trade (no partial transfer, no partial history). The proposal must
 * be SUBMITTED. Creates CompletedTrade, CompletedTradeAssets, and TradeTransactions.
 */
export async function acceptTrade(proposal: LoadedProposal, reason: string): Promise<AcceptanceResult> {
  if (proposal.status !== 'SUBMITTED') throw new TradeHttpError(409, 'TradeProposalNotEditable', 'Only a submitted proposal can be accepted');
  if (!proposal.assets.length) throw new TradeHttpError(422, 'TradeNotReady', 'Proposal has no assets');

  // Pre-trade safety backup (one per accepted proposal; failure blocks acceptance).
  await createSqliteSafetyBackup({ label: `trade-accept-${proposal.id}` });

  const transfers: AcceptanceResult['transfers'] = [];

  try {
    const result = await prisma.$transaction(async (tx) => {
      // Reload every asset's CURRENT state and revalidate ownership/state.
      const proposingAssets = proposal.assets.filter((a) => a.side === 'PROPOSING');
      const receivingAssets = proposal.assets.filter((a) => a.side === 'RECEIVING');
      const allAssets = [...proposingAssets, ...receivingAssets];

      for (const asset of allAssets) {
        const sourceTeamId = asset.sourceTeamId;
        const targetTeamId = asset.targetTeamId;
        if (asset.assetType === 'PLAYER_CONTRACT') {
          await revalidatePlayerContract(tx, asset, sourceTeamId);
        } else if (asset.assetType === 'DRAFT_PICK') {
          await revalidateDraftPick(tx, asset, sourceTeamId);
        } else if (asset.assetType === 'PLAYER_DRAFT_RIGHT') {
          await revalidateDraftRight(tx, asset, sourceTeamId);
        }
        void targetTeamId;
      }

      const effectiveWorldSeasonId = await getActiveWorldSeasonId(tx);
      const now = new Date();

      // Create the immutable CompletedTrade first.
      const completed = await tx.completedTrade.create({
        data: {
          tradeProposalId: proposal.id,
          proposingTeamId: proposal.proposingTeamId,
          receivingTeamId: proposal.receivingTeamId,
          proposingTeamNameSnapshot: proposal.proposingTeam.name,
          receivingTeamNameSnapshot: proposal.receivingTeam.name,
          effectiveWorldSeasonId,
          configVersionId: proposal.configVersionId,
          configHash: proposal.configHash,
          tradeHash: 'pending',
        },
      });

      // Transfer each asset and record history.
      for (const asset of allAssets) {
        const sourceTeamId = asset.sourceTeamId;
        const targetTeamId = asset.targetTeamId;
        if (asset.assetType === 'PLAYER_CONTRACT' && asset.playerContractId) {
          const contract = await tx.playerContract.findUniqueOrThrow({ where: { id: asset.playerContractId }, include: { player: true } });
          // ACTIVE contract moves; FUTURE contract for the same player also moves.
          await tx.playerContract.update({ where: { id: contract.id }, data: { teamId: targetTeamId, transferredByTradeId: completed.id } });
          await recordTransaction(tx, completed.id, 'CONTRACT_TRANSFERRED', contract.playerId, contract.id, null, null, sourceTeamId, targetTeamId, `${contract.playerNameSnapshot} contract`, completed.id);
          transfers.push({ transactionType: 'CONTRACT_TRANSFERRED', contractId: contract.id, playerId: contract.playerId, fromTeamId: sourceTeamId, toTeamId: targetTeamId });
          const future = await tx.playerContract.findFirst({ where: { playerId: contract.playerId, status: 'FUTURE' } });
          if (future) {
            await tx.playerContract.update({ where: { id: future.id }, data: { teamId: targetTeamId, transferredByTradeId: completed.id } });
            await recordTransaction(tx, completed.id, 'FUTURE_CONTRACT_TRANSFERRED', future.playerId, future.id, null, null, sourceTeamId, targetTeamId, `${contract.playerNameSnapshot} future contract`, completed.id);
            transfers.push({ transactionType: 'FUTURE_CONTRACT_TRANSFERRED', contractId: future.id, playerId: future.playerId, fromTeamId: sourceTeamId, toTeamId: targetTeamId });
          }
          // Player.currentTeamId follows the ACTIVE contract.
          await tx.player.update({ where: { id: contract.playerId }, data: { currentTeamId: targetTeamId } });
          await recordTransaction(tx, completed.id, 'PLAYER_TRANSFERRED', contract.playerId, null, null, null, sourceTeamId, targetTeamId, `${contract.playerNameSnapshot} player ownership`, completed.id);
          transfers.push({ transactionType: 'PLAYER_TRANSFERRED', playerId: contract.playerId, fromTeamId: sourceTeamId, toTeamId: targetTeamId });
        } else if (asset.assetType === 'DRAFT_PICK' && asset.draftPickId) {
          const pick = await tx.draftPick.findUniqueOrThrow({ where: { id: asset.draftPickId } });
          await tx.draftPick.update({ where: { id: pick.id }, data: { currentTeamId: targetTeamId } });
          await recordTransaction(tx, completed.id, 'DRAFT_PICK_TRANSFERRED', null, null, pick.id, null, sourceTeamId, targetTeamId, `Round ${pick.roundNumber} pick #${pick.overallPick}`, completed.id);
          transfers.push({ transactionType: 'DRAFT_PICK_TRANSFERRED', draftPickId: pick.id, fromTeamId: sourceTeamId, toTeamId: targetTeamId });
        } else if (asset.assetType === 'PLAYER_DRAFT_RIGHT' && asset.playerDraftRightId) {
          const right = await tx.playerDraftRight.findUniqueOrThrow({ where: { id: asset.playerDraftRightId } });
          await tx.playerDraftRight.update({ where: { id: right.id }, data: { teamId: targetTeamId } });
          await recordTransaction(tx, completed.id, 'DRAFT_RIGHT_TRANSFERRED', right.playerId, null, null, right.id, sourceTeamId, targetTeamId, `${right.playerNameSnapshot} draft right`, completed.id);
          transfers.push({ transactionType: 'DRAFT_RIGHT_TRANSFERRED', draftRightId: right.id, playerId: right.playerId, fromTeamId: sourceTeamId, toTeamId: targetTeamId });
        }

        // Record the immutable completed-trade asset row.
        const snapshot = safeJson(asset.assetSnapshotText);
        await tx.completedTradeAsset.create({
          data: {
            completedTradeId: completed.id,
            side: asset.side,
            assetType: asset.assetType,
            sourceTeamId,
            targetTeamId,
            playerId: snapshot?.playerId ?? null,
            playerContractId: asset.playerContractId,
            draftPickId: asset.draftPickId,
            playerDraftRightId: asset.playerDraftRightId,
            assetSnapshotText: asset.assetSnapshotText,
          },
        });
      }

      // Finalize trade hash from the deterministic transfer set.
      const tradeHash = stableTradeHash({
        proposalId: proposal.id,
        proposingTeamId: proposal.proposingTeamId,
        receivingTeamId: proposal.receivingTeamId,
        transfers: transfers.map((t) => ({ type: t.transactionType, playerId: t.playerId ?? null, contractId: t.contractId ?? null, draftPickId: t.draftPickId ?? null, draftRightId: t.draftRightId ?? null, from: t.fromTeamId, to: t.toTeamId })),
      });
      const finalized = await tx.completedTrade.update({ where: { id: completed.id }, data: { tradeHash } });

      // Mark proposal ACCEPTED.
      await tx.tradeProposal.update({ where: { id: proposal.id }, data: { status: 'ACCEPTED', acceptedAt: now } });

      return { completedTradeId: finalized.id, tradeHash, transfers };
    }, { timeout: 30000, maxWait: 30000 });

    return { ...result, proposalStatus: 'ACCEPTED' };
  } catch (e) {
    // Leave the proposal SUBMITTED so the caller can resolve the stale issue or withdraw.
    const code = e instanceof TradeHttpError ? e.code : 'TradeExecutionFailed';
    const message = e instanceof Error ? e.message : 'Trade execution failed';
    throw new TradeHttpError(e instanceof TradeHttpError ? (e as TradeHttpError).statusCode : 500, code, message);
  }
}

const safeJson = (s: string | null) => { try { return s ? JSON.parse(s) : null; } catch { return null; } };

async function recordTransaction(tx: Prisma.TransactionClient, completedTradeId: string, transactionType: string, playerId: string | null, contractId: string | null, draftPickId: string | null, draftRightId: string | null, fromTeamId: string, toTeamId: string, assetNameSnapshot: string, salt: string) {
  const transactionHash = stableTradeHash({ completedTradeId, transactionType, playerId, contractId, draftPickId, draftRightId, fromTeamId, toTeamId, salt });
  return tx.tradeTransaction.upsert({
    where: { transactionHash },
    create: { completedTradeId, transactionType: transactionType as any, playerId, contractId, draftPickId, draftRightId, fromTeamId, toTeamId, assetNameSnapshot, transactionHash },
    update: {},
  });
}

async function revalidatePlayerContract(tx: Prisma.TransactionClient, asset: LoadedProposal['assets'][number], sourceTeamId: string) {
  const contract = await tx.playerContract.findUnique({ where: { id: asset.playerContractId! }, include: { player: true } });
  if (!contract) throw new TradeHttpError(409, 'TradeAssetOwnershipChanged', 'Contract no longer exists');
  if (contract.status !== 'ACTIVE') throw new TradeHttpError(409, 'TradeAssetOwnershipChanged', `Contract ${contract.id} is no longer active (${contract.status})`);
  if (contract.teamId !== sourceTeamId) throw new TradeHttpError(409, 'TradeAssetOwnershipChanged', `Contract ${contract.id} ownership changed`);
  const player = await tx.player.findUniqueOrThrow({ where: { id: contract.playerId } });
  if (player.rosterStatus === 'RETIRED') throw new TradeHttpError(409, 'PlayerNotTradeEligible', `Player ${player.id} is retired`);
  if (player.currentTeamId !== sourceTeamId) throw new TradeHttpError(409, 'TradeAssetOwnershipChanged', `Player ${player.id} no longer owned by source team`);
  const future = await tx.playerContract.findFirst({ where: { playerId: contract.playerId, status: 'FUTURE' } });
  if (future && future.teamId !== sourceTeamId) throw new TradeHttpError(409, 'TradeAssetOwnershipChanged', `Future contract ${future.id} held by a different team`);
}

async function revalidateDraftPick(tx: Prisma.TransactionClient, asset: LoadedProposal['assets'][number], sourceTeamId: string) {
  const pick = await tx.draftPick.findUnique({ where: { id: asset.draftPickId! }, include: { draftEvent: { select: { status: true } } } });
  if (!pick) throw new TradeHttpError(409, 'TradeAssetOwnershipChanged', 'Draft pick no longer exists');
  if (pick.status !== 'PENDING') throw new TradeHttpError(409, 'DraftPickNotTradeEligible', `Pick ${pick.id} is no longer pending (${pick.status})`);
  if (pick.draftEvent.status === 'IN_PROGRESS' || pick.draftEvent.status === 'COMPLETED' || pick.draftEvent.status === 'CANCELLED') {
    throw new TradeHttpError(409, 'DraftInProgress', `Draft event is ${pick.draftEvent.status}; pick trades are blocked`);
  }
  if (pick.currentTeamId !== sourceTeamId) throw new TradeHttpError(409, 'TradeAssetOwnershipChanged', `Pick ${pick.id} ownership changed`);
}

async function revalidateDraftRight(tx: Prisma.TransactionClient, asset: LoadedProposal['assets'][number], sourceTeamId: string) {
  const right = await tx.playerDraftRight.findUnique({ where: { id: asset.playerDraftRightId! }, include: { player: { select: { currentTeamId: true } } } });
  if (!right) throw new TradeHttpError(409, 'TradeAssetOwnershipChanged', 'Draft right no longer exists');
  if (right.status !== 'ACTIVE') throw new TradeHttpError(409, 'DraftRightNotTradeEligible', `Right ${right.id} is no longer active (${right.status})`);
  if (right.teamId !== sourceTeamId) throw new TradeHttpError(409, 'TradeAssetOwnershipChanged', `Right ${right.id} ownership changed`);
  if (right.player.currentTeamId !== null) throw new TradeHttpError(409, 'DraftRightNotTradeEligible', `Rights-held player ${right.playerId} is already signed`);
}
