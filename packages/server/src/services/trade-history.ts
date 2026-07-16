import type { Prisma, PrismaClient } from '@prisma/client';
import { prisma } from '../db/client.js';
import { TradeHttpError } from './trade-errors.js';

export type TradeDbClient = PrismaClient | Prisma.TransactionClient;

const completedInclude = {
  tradeProposal: true,
  proposingTeam: true,
  receivingTeam: true,
  effectiveWorldSeason: true,
  assets: { orderBy: { createdAt: 'asc' } },
  transactions: { orderBy: { createdAt: 'asc' } },
} as const;

function mapCompleted(c: Prisma.CompletedTradeGetPayload<{ include: typeof completedInclude }>) {
  return {
    id: c.id,
    tradeProposalId: c.tradeProposalId,
    proposingTeam: { id: c.proposingTeam.id, name: c.proposingTeam.name },
    receivingTeam: { id: c.receivingTeam.id, name: c.receivingTeam.name },
    effectiveWorldSeason: c.effectiveWorldSeason ? { id: c.effectiveWorldSeason.id, label: c.effectiveWorldSeason.label } : null,
    configHash: c.configHash,
    tradeHash: c.tradeHash,
    completedAt: c.completedAt,
    assets: c.assets.map((a) => ({
      id: a.id, side: a.side, assetType: a.assetType, sourceTeamId: a.sourceTeamId, targetTeamId: a.targetTeamId,
      playerId: a.playerId, playerContractId: a.playerContractId, draftPickId: a.draftPickId, playerDraftRightId: a.playerDraftRightId,
      snapshot: safeJson(a.assetSnapshotText),
    })),
    transactions: c.transactions.map((t) => ({
      id: t.id, transactionType: t.transactionType, playerId: t.playerId, contractId: t.contractId, draftPickId: t.draftPickId,
      draftRightId: t.draftRightId, fromTeamId: t.fromTeamId, toTeamId: t.toTeamId, assetNameSnapshot: t.assetNameSnapshot,
      transactionHash: t.transactionHash, createdAt: t.createdAt,
    })),
  };
}
const safeJson = (s: string | null) => { try { return s ? JSON.parse(s) : null; } catch { return null; } };

export async function listCompletedTrades(query: any = {}) {
  const page = Math.max(1, Number(query.page) || 1);
  const pageSize = Math.min(100, Math.max(1, Number(query.pageSize) || 25));
  const where: Prisma.CompletedTradeWhereInput = {};
  if (query.teamId) where.OR = [{ proposingTeamId: query.teamId }, { receivingTeamId: query.teamId }];
  const [total, items] = await Promise.all([
    prisma.completedTrade.count({ where }),
    prisma.completedTrade.findMany({ where, include: completedInclude, orderBy: [{ completedAt: 'desc' }], skip: (page - 1) * pageSize, take: pageSize }),
  ]);
  return { items: items.map(mapCompleted), meta: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) } };
}

export async function getCompletedTrade(id: string) {
  const c = await prisma.completedTrade.findUnique({ where: { id }, include: completedInclude });
  if (!c) throw new TradeHttpError(404, 'CompletedTradeNotFound', 'Completed trade not found');
  return mapCompleted(c);
}

export async function getPlayerTrades(playerId: string) {
  const exists = await prisma.player.findUnique({ where: { id: playerId }, select: { id: true } });
  if (!exists) throw new TradeHttpError(404, 'PlayerNotFound', 'Player not found');
  const transactions = await prisma.tradeTransaction.findMany({ where: { playerId }, include: { completedTrade: { include: { proposingTeam: true, receivingTeam: true } } }, orderBy: { createdAt: 'desc' } });
  return { items: transactions.map((t) => ({ transactionType: t.transactionType, fromTeam: { id: t.completedTrade.proposingTeam.id, name: t.completedTrade.proposingTeam.name }, toTeam: { id: t.completedTrade.receivingTeam.id, name: t.completedTrade.receivingTeam.name }, date: t.completedTrade.completedAt, completedTradeId: t.completedTradeId, transactionHash: t.transactionHash })) };
}

export async function getTeamTrades(teamId: string) {
  const team = await prisma.team.findUnique({ where: { id: teamId }, select: { id: true } });
  if (!team) throw new TradeHttpError(404, 'TeamNotFound', 'Team not found');
  return listCompletedTrades({ teamId, pageSize: 100 });
}

export async function getDraftPickTrades(pickId: string) {
  const exists = await prisma.draftPick.findUnique({ where: { id: pickId }, select: { id: true, originalTeamId: true, currentTeamId: true } });
  if (!exists) throw new TradeHttpError(404, 'DraftPickNotFound', 'Draft pick not found');
  const transactions = await prisma.tradeTransaction.findMany({ where: { draftPickId: pickId }, orderBy: { createdAt: 'desc' } });
  return { pickId, originalTeamId: exists.originalTeamId, currentTeamId: exists.currentTeamId, history: transactions.map((t) => ({ fromTeamId: t.fromTeamId, toTeamId: t.toTeamId, date: t.createdAt, completedTradeId: t.completedTradeId })) };
}

export async function getDraftRightTrades(rightId: string) {
  const exists = await prisma.playerDraftRight.findUnique({ where: { id: rightId }, select: { id: true, teamId: true } });
  if (!exists) throw new TradeHttpError(404, 'DraftRightNotFound', 'Draft right not found');
  const transactions = await prisma.tradeTransaction.findMany({ where: { draftRightId: rightId }, include: { completedTrade: { include: { proposingTeam: true, receivingTeam: true } } }, orderBy: { createdAt: 'desc' } });
  return { rightId, currentTeamId: exists.teamId, history: transactions.map((t) => ({ fromTeamId: t.fromTeamId, toTeamId: t.toTeamId, date: t.createdAt, completedTradeId: t.completedTradeId })) };
}

/** Resolve the current active WorldSeason id, or null if none exists. */
export async function getActiveWorldSeasonId(client: TradeDbClient): Promise<string | null> {
  const season = await client.worldSeason.findFirst({ where: { status: 'ACTIVE' }, orderBy: { startYear: 'asc' }, select: { id: true } });
  if (season) return season.id;
  const latest = await client.worldSeason.findFirst({ orderBy: { startYear: 'desc' }, select: { id: true } });
  return latest?.id ?? null;
}
