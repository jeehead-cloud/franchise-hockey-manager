import type { Prisma } from '@prisma/client';
import { reconcileTradeAssets, stableTradeHash, summarizeProposal, type TradeAssetType } from '@fhm/engine';
import { prisma } from '../db/client.js';
import { getActiveTradeSnapshot } from './trade-config.js';
import { TradeHttpError } from './trade-errors.js';
import { acceptTrade, type AcceptanceResult } from './trade-execution.js';
import { computeProposalValuation, type AssetDescriptor } from './trade-valuations.js';
import { auditTradeAction } from './commissioner-trades.js';

const iso = (d: Date) => d.toISOString();
const updatedIso = (d: Date) => d.toISOString();

export interface CreateProposalInput {
  proposingTeamId: string;
  receivingTeamId: string;
  proposedBy: string;
  reason?: string;
  proposingAssets: AssetDescriptor[];
  receivingAssets: AssetDescriptor[];
}

export async function requireClubTeam(teamId: string) {
  const team = await prisma.team.findUnique({ where: { id: teamId }, select: { id: true, name: true, teamType: true, updatedAt: true } });
  if (!team) throw new TradeHttpError(404, 'TeamNotFound', 'Team not found');
  if (team.teamType !== 'CLUB') throw new TradeHttpError(409, 'PlayerNotTradeEligible', 'National teams cannot participate in trades');
  return team;
}

const proposalInclude = {
  proposingTeam: true,
  receivingTeam: true,
  configVersion: { include: { preset: true } },
  assets: { include: { playerContract: { include: { player: true } }, draftPick: true, playerDraftRight: { include: { player: true } } }, orderBy: { createdAt: 'asc' } },
} as const;
export type LoadedProposal = Prisma.TradeProposalGetPayload<{ include: typeof proposalInclude }>;

function mapProposal(p: LoadedProposal) {
  return {
    id: p.id,
    proposingTeam: { id: p.proposingTeam.id, name: p.proposingTeam.name },
    receivingTeam: { id: p.receivingTeam.id, name: p.receivingTeam.name },
    status: p.status,
    configVersionId: p.configVersionId,
    configHash: p.configHash,
    proposedBy: p.proposedBy,
    reason: p.reason,
    proposingTeamUpdatedAtSnapshot: p.proposingTeamUpdatedAtSnapshot,
    receivingTeamUpdatedAtSnapshot: p.receivingTeamUpdatedAtSnapshot,
    proposalHash: p.proposalHash,
    submittedAt: p.submittedAt,
    acceptedAt: p.acceptedAt,
    rejectedAt: p.rejectedAt,
    withdrawnAt: p.withdrawnAt,
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
    assets: p.assets.map((a) => ({
      id: a.id,
      side: a.side,
      assetType: a.assetType,
      playerContract: a.playerContract ? { id: a.playerContract.id, player: { id: a.playerContract.player.id, name: `${a.playerContract.player.firstName} ${a.playerContract.player.lastName}` } } : null,
      draftPick: a.draftPick ? { id: a.draftPick.id, roundNumber: a.draftPick.roundNumber, overallPick: a.draftPick.overallPick } : null,
      playerDraftRight: a.playerDraftRight ? { id: a.playerDraftRight.id, player: { id: a.playerDraftRight.player.id, name: `${a.playerDraftRight.player.firstName} ${a.playerDraftRight.player.lastName}` } } : null,
      sourceTeamId: a.sourceTeamId,
      targetTeamId: a.targetTeamId,
      snapshot: safeJson(a.assetSnapshotText),
      valuation: safeJson(a.valuationSnapshotText),
    })),
  };
}
const safeJson = (s: string | null) => { try { return s ? JSON.parse(s) : null; } catch { return null; } };

export async function listProposals(query: any = {}) {
  const page = Math.max(1, Number(query.page) || 1);
  const pageSize = Math.min(100, Math.max(1, Number(query.pageSize) || 25));
  const where: Prisma.TradeProposalWhereInput = {};
  if (query.teamId) where.OR = [{ proposingTeamId: query.teamId }, { receivingTeamId: query.teamId }];
  if (query.status) where.status = query.status;
  if (query.proposingTeamId) where.proposingTeamId = query.proposingTeamId;
  if (query.receivingTeamId) where.receivingTeamId = query.receivingTeamId;
  const [total, items] = await Promise.all([
    prisma.tradeProposal.count({ where }),
    prisma.tradeProposal.findMany({ where, include: proposalInclude, orderBy: [{ createdAt: 'desc' }], skip: (page - 1) * pageSize, take: pageSize }),
  ]);
  return { items: items.map(mapProposal), meta: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) } };
}

export async function getProposal(id: string) {
  return loadProposal(prisma, id);
}

/** Load + map a proposal using a specific client (so transactions can read their own writes). */
export async function loadProposal(client: Prisma.TransactionClient | typeof prisma, id: string) {
  const p = await client.tradeProposal.findUnique({ where: { id }, include: proposalInclude });
  if (!p) throw new TradeHttpError(404, 'TradeProposalNotFound', 'Trade proposal not found');
  return mapProposal(p);
}

/** Validate two club teams + asset descriptors before persisting. */
async function validateProposalInputs(input: { proposingTeamId: string; receivingTeamId: string; proposingAssets: AssetDescriptor[]; receivingAssets: AssetDescriptor[] }) {
  const [proposingTeam, receivingTeam, snapshot] = await Promise.all([
    requireClubTeam(input.proposingTeamId),
    requireClubTeam(input.receivingTeamId),
    getActiveTradeSnapshot(prisma),
  ]);
  if (input.proposingTeamId === input.receivingTeamId) throw new TradeHttpError(409, 'TeamCannotTradeWithItself', 'A team cannot trade with itself');
  return { proposingTeam, receivingTeam, snapshot };
}

/** Create a DRAFT proposal with a frozen asset snapshot. */
export async function createProposal(input: CreateProposalInput) {
  const { proposingTeam, receivingTeam, snapshot } = await validateProposalInputs(input);
  const allowedTypes = new Set<TradeAssetType>(['PLAYER_CONTRACT', 'DRAFT_PICK', 'PLAYER_DRAFT_RIGHT']);
  for (const a of [...input.proposingAssets, ...input.receivingAssets]) {
    if (!allowedTypes.has(a.assetType)) throw new TradeHttpError(422, 'InvalidTradeAsset', `Unsupported asset type ${a.assetType}`);
  }
  const summary = summarizeProposal({
    proposingTeamId: input.proposingTeamId,
    receivingTeamId: input.receivingTeamId,
    proposingAssets: input.proposingAssets,
    receivingAssets: input.receivingAssets,
  }, snapshot.config);
  if (summary.duplicateAssetKeys.length) throw new TradeHttpError(409, 'DuplicateTradeAsset', `Duplicate asset(s): ${summary.duplicateAssetKeys.join(', ')}`);
  if (summary.conflictingPlayerIds.length) throw new TradeHttpError(409, 'ConflictingTradeAsset', `Conflicting player asset(s): ${summary.conflictingPlayerIds.join(', ')}`);
  // Valuation + snapshot (writes nothing — validation may throw on ineligible assets).
  const valuations = await computeProposalValuation(
    { teamId: input.proposingTeamId, evaluatingTeamId: input.proposingTeamId, assets: input.proposingAssets },
    { teamId: input.receivingTeamId, evaluatingTeamId: input.receivingTeamId, assets: input.receivingAssets },
    snapshot.config,
  );
  return prisma.$transaction(async (tx) => {
    const proposal = await tx.tradeProposal.create({
      data: {
        proposingTeamId: input.proposingTeamId,
        receivingTeamId: input.receivingTeamId,
        status: 'DRAFT',
        configVersionId: snapshot.version.id,
        configHash: snapshot.version.configHash,
        proposedBy: input.proposedBy,
        reason: input.reason ?? null,
        proposingTeamUpdatedAtSnapshot: proposingTeam.updatedAt,
        receivingTeamUpdatedAtSnapshot: receivingTeam.updatedAt,
        proposalHash: summary.proposalHash,
      },
    });
    for (const a of valuations.assetSnapshots) {
      await tx.tradeProposalAsset.create({
        data: {
          tradeProposalId: proposal.id,
          side: a.side,
          assetType: a.descriptor.assetType,
          playerContractId: a.descriptor.playerContractId ?? null,
          draftPickId: a.descriptor.draftPickId ?? null,
          playerDraftRightId: a.descriptor.playerDraftRightId ?? null,
          sourceTeamId: a.side === 'PROPOSING' ? input.proposingTeamId : input.receivingTeamId,
          targetTeamId: a.side === 'PROPOSING' ? input.receivingTeamId : input.proposingTeamId,
          assetSnapshotText: JSON.stringify(a.snapshot),
          valuationSnapshotText: JSON.stringify(a.valuation),
          valuationHash: a.valuation.valuationHash,
          assetHash: stableTradeHash(a.snapshot),
        },
      });
    }
    return loadProposal(tx, proposal.id);
  });
}

/** Edit a DRAFT proposal's assets (optimistic concurrency via expectedUpdatedAt). */
export async function editProposal(proposalId: string, actorTeamId: string | undefined, input: { proposingAssets: AssetDescriptor[]; receivingAssets: AssetDescriptor[]; reason?: string; expectedUpdatedAt?: string }, commissioner = false) {
  const existing = await prisma.tradeProposal.findUnique({ where: { id: proposalId }, include: proposalInclude });
  if (!existing) throw new TradeHttpError(404, 'TradeProposalNotFound', 'Trade proposal not found');
  if (!commissioner && actorTeamId && existing.proposingTeamId !== actorTeamId) throw new TradeHttpError(404, 'TradeProposalNotFound', 'Trade proposal not found for this team');
  if (existing.status !== 'DRAFT') throw new TradeHttpError(409, 'TradeProposalNotEditable', 'Only draft proposals can be edited');
  if (input.expectedUpdatedAt && updatedIso(existing.updatedAt) !== new Date(input.expectedUpdatedAt).toISOString()) throw new TradeHttpError(409, 'TradeInputStale', 'Proposal was modified by another action');
  const snapshot = await getActiveTradeSnapshot(prisma);
  const summary = summarizeProposal({
    proposingTeamId: existing.proposingTeamId,
    receivingTeamId: existing.receivingTeamId,
    proposingAssets: input.proposingAssets,
    receivingAssets: input.receivingAssets,
  }, snapshot.config);
  if (summary.duplicateAssetKeys.length) throw new TradeHttpError(409, 'DuplicateTradeAsset', `Duplicate asset(s): ${summary.duplicateAssetKeys.join(', ')}`);
  if (summary.conflictingPlayerIds.length) throw new TradeHttpError(409, 'ConflictingTradeAsset', `Conflicting player asset(s): ${summary.conflictingPlayerIds.join(', ')}`);
  const valuations = await computeProposalValuation(
    { teamId: existing.proposingTeamId, evaluatingTeamId: existing.proposingTeamId, assets: input.proposingAssets },
    { teamId: existing.receivingTeamId, evaluatingTeamId: existing.receivingTeamId, assets: input.receivingAssets },
    snapshot.config,
  );
  return prisma.$transaction(async (tx) => {
    await tx.tradeProposalAsset.deleteMany({ where: { tradeProposalId: proposalId } });
    for (const a of valuations.assetSnapshots) {
      await tx.tradeProposalAsset.create({
        data: {
          tradeProposalId: proposalId,
          side: a.side,
          assetType: a.descriptor.assetType,
          playerContractId: a.descriptor.playerContractId ?? null,
          draftPickId: a.descriptor.draftPickId ?? null,
          playerDraftRightId: a.descriptor.playerDraftRightId ?? null,
          sourceTeamId: a.side === 'PROPOSING' ? existing.proposingTeamId : existing.receivingTeamId,
          targetTeamId: a.side === 'PROPOSING' ? existing.receivingTeamId : existing.proposingTeamId,
          assetSnapshotText: JSON.stringify(a.snapshot),
          valuationSnapshotText: JSON.stringify(a.valuation),
          valuationHash: a.valuation.valuationHash,
          assetHash: stableTradeHash(a.snapshot),
        },
      });
    }
    await tx.tradeProposal.update({ where: { id: proposalId }, data: { proposalHash: summary.proposalHash, reason: input.reason ?? existing.reason } });
    return loadProposal(tx, proposalId);
  });
}

/** Preview valuations/readiness without writing. */
export async function previewProposal(proposalId: string) {
  const p = await getProposal(proposalId);
  const snapshot = await getActiveTradeSnapshot(prisma);
  const proposingAssets: AssetDescriptor[] = p.assets.filter((a) => a.side === 'PROPOSING').map(assetDescriptorFromRow);
  const receivingAssets: AssetDescriptor[] = p.assets.filter((a) => a.side === 'RECEIVING').map(assetDescriptorFromRow);
  let valuations: Awaited<ReturnType<typeof computeProposalValuation>> | null = null;
  let previewError: { code: string; message: string } | null = null;
  try {
    valuations = await computeProposalValuation(
      { teamId: p.proposingTeam.id, evaluatingTeamId: p.proposingTeam.id, assets: proposingAssets },
      { teamId: p.receivingTeam.id, evaluatingTeamId: p.receivingTeam.id, assets: receivingAssets },
      snapshot.config,
    );
  } catch (e: any) {
    previewError = { code: e?.code ?? 'InvalidTradeAsset', message: e?.message ?? 'Preview failed' };
  }
  return { proposal: p, valuations: valuations ?? null, previewError };
}

function assetDescriptorFromRow(a: { assetType: string; playerContract: { id: string } | null; draftPick: { id: string } | null; playerDraftRight: { id: string } | null }): AssetDescriptor {
  return {
    assetType: a.assetType as TradeAssetType,
    playerContractId: a.playerContract?.id ?? null,
    draftPickId: a.draftPick?.id ?? null,
    playerDraftRightId: a.playerDraftRight?.id ?? null,
  };
}

/** Submit: revalidate current ownership, freeze snapshots (already stored), mark SUBMITTED. */
export async function submitProposal(proposalId: string, actorTeamId: string | undefined, expectedUpdatedAt?: string, commissioner = false) {
  const existing = await prisma.tradeProposal.findUnique({ where: { id: proposalId }, include: proposalInclude });
  if (!existing) throw new TradeHttpError(404, 'TradeProposalNotFound', 'Trade proposal not found');
  if (!commissioner && actorTeamId && existing.proposingTeamId !== actorTeamId) throw new TradeHttpError(404, 'TradeProposalNotFound', 'Trade proposal not found for this team');
  if (existing.status !== 'DRAFT') throw new TradeHttpError(409, 'TradeProposalAlreadySubmitted', 'Only draft proposals can be submitted');
  if (expectedUpdatedAt && updatedIso(existing.updatedAt) !== new Date(expectedUpdatedAt).toISOString()) throw new TradeHttpError(409, 'TradeInputStale', 'Proposal was modified by another action');
  if (!existing.assets.length) throw new TradeHttpError(422, 'TradeNotReady', 'A proposal must include at least one asset');
  // Re-run valuation (revalidates current ownership/eligibility — throws on stale state).
  const snapshot = await getActiveTradeSnapshot(prisma);
  const proposingAssets = existing.assets.filter((a) => a.side === 'PROPOSING').map(assetDescriptorFromRow);
  const receivingAssets = existing.assets.filter((a) => a.side === 'RECEIVING').map(assetDescriptorFromRow);
  await computeProposalValuation(
    { teamId: existing.proposingTeamId, evaluatingTeamId: existing.proposingTeamId, assets: proposingAssets },
    { teamId: existing.receivingTeamId, evaluatingTeamId: existing.receivingTeamId, assets: receivingAssets },
    snapshot.config,
  );
  return prisma.$transaction(async (tx) => {
    const updated = await tx.tradeProposal.update({ where: { id: proposalId }, data: { status: 'SUBMITTED', submittedAt: new Date() }, include: proposalInclude });
    return mapProposal(updated);
  });
}

export async function withdrawProposal(proposalId: string, actorTeamId: string | undefined, reason: string, expectedUpdatedAt?: string, commissioner = false) {
  const existing = await prisma.tradeProposal.findUnique({ where: { id: proposalId } });
  if (!existing) throw new TradeHttpError(404, 'TradeProposalNotFound', 'Trade proposal not found');
  if (!commissioner && actorTeamId && existing.proposingTeamId !== actorTeamId) throw new TradeHttpError(404, 'TradeProposalNotFound', 'Trade proposal not found for this team');
  if (!['DRAFT', 'SUBMITTED'].includes(existing.status)) throw new TradeHttpError(409, 'TradeProposalNotEditable', 'Proposal cannot be withdrawn');
  if (expectedUpdatedAt && updatedIso(existing.updatedAt) !== new Date(expectedUpdatedAt).toISOString()) throw new TradeHttpError(409, 'TradeInputStale', 'Proposal was modified by another action');
  return prisma.$transaction(async (tx) => {
    const updated = await tx.tradeProposal.update({ where: { id: proposalId }, data: { status: 'WITHDRAWN', withdrawnAt: new Date(), reason }, include: proposalInclude });
    return mapProposal(updated);
  });
}

export async function rejectProposal(proposalId: string, reason: string, expectedUpdatedAt?: string) {
  const existing = await prisma.tradeProposal.findUnique({ where: { id: proposalId } });
  if (!existing) throw new TradeHttpError(404, 'TradeProposalNotFound', 'Trade proposal not found');
  if (existing.status !== 'SUBMITTED') throw new TradeHttpError(409, 'TradeProposalNotEditable', 'Only submitted proposals can be rejected');
  if (expectedUpdatedAt && updatedIso(existing.updatedAt) !== new Date(expectedUpdatedAt).toISOString()) throw new TradeHttpError(409, 'TradeInputStale', 'Proposal was modified by another action');
  return prisma.$transaction(async (tx) => {
    const updated = await tx.tradeProposal.update({ where: { id: proposalId }, data: { status: 'REJECTED', rejectedAt: new Date(), reason }, include: proposalInclude });
    return mapProposal(updated);
  });
}

/** Accept: revalidate ownership, take a backup, publish atomically. Receiving team or Commissioner. */
export async function acceptProposal(proposalId: string, acceptingTeamId: string | undefined, reason: string, expectedUpdatedAt?: string, commissioner = false): Promise<AcceptanceResult> {
  const existing = await prisma.tradeProposal.findUnique({ where: { id: proposalId }, include: proposalInclude });
  if (!existing) throw new TradeHttpError(404, 'TradeProposalNotFound', 'Trade proposal not found');
  if (!commissioner) {
    if (!acceptingTeamId || existing.receivingTeamId !== acceptingTeamId) throw new TradeHttpError(409, 'TradeAcceptanceNotAuthorized', 'Only the receiving team (or Commissioner) may accept');
  }
  if (existing.status !== 'SUBMITTED') throw new TradeHttpError(409, existing.status === 'ACCEPTED' ? 'TradeProposalCompleted' : 'TradeProposalNotEditable', 'Only a submitted proposal can be accepted');
  if (expectedUpdatedAt && updatedIso(existing.updatedAt) !== new Date(expectedUpdatedAt).toISOString()) throw new TradeHttpError(409, 'TradeInputStale', 'Proposal was modified by another action');
  return acceptTrade(existing, reason);
}

export { auditTradeAction };
