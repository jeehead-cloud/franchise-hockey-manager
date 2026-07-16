import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { detailResponse, listResponse } from '../http.js';
import { areCommissionerWritesEnabled, hasCommissionerHeader } from '../commissioner/gate.js';
import { CommissionerHttpError, commissionerErrorBody } from '../commissioner/errors.js';
import { listTradeConfigurations } from '../services/trade-config.js';
import { TradeHttpError } from '../services/trade-errors.js';
import { prisma } from '../db/client.js';
import { acceptProposal, createProposal, editProposal, getProposal, listProposals, previewProposal, rejectProposal, submitProposal, withdrawProposal } from '../services/trade-proposals.js';
import { getCompletedTrade, getDraftPickTrades, getDraftRightTrades, getPlayerTrades, getTeamTrades, listCompletedTrades } from '../services/trade-history.js';
import { getTeamTradeOverview, getTradeReadiness } from '../services/trade-readiness.js';
import type { AssetDescriptor } from '../services/trade-valuations.js';

function error(reply: any, e: unknown) {
  if (e instanceof TradeHttpError) return reply.status(e.statusCode).send({ error: e.code, message: e.message, details: e.details });
  if (e instanceof CommissionerHttpError) return reply.status(e.statusCode).send(commissionerErrorBody(e));
  if (e instanceof z.ZodError) return reply.status(400).send({ error: 'InvalidTradeRequest', message: 'Invalid trade request', details: e.issues });
  throw e;
}

const reason = z.string().trim().min(1).max(500);
const expectedUpdatedAt = z.string().datetime().optional();

const assetDescriptor = z.object({
  assetType: z.enum(['PLAYER_CONTRACT', 'DRAFT_PICK', 'PLAYER_DRAFT_RIGHT']),
  playerContractId: z.string().min(1).optional(),
  draftPickId: z.string().min(1).optional(),
  playerDraftRightId: z.string().min(1).optional(),
}).strict();

const createBody = z.object({
  receivingTeamId: z.string().min(1),
  proposedBy: z.string().min(1),
  reason: z.string().max(500).optional(),
  proposingAssets: z.array(assetDescriptor).max(10),
  receivingAssets: z.array(assetDescriptor).max(10),
}).strict();

const editBody = z.object({
  proposingAssets: z.array(assetDescriptor).max(10),
  receivingAssets: z.array(assetDescriptor).max(10),
  reason: z.string().max(500).optional(),
  expectedUpdatedAt,
}).strict();

function asDescriptors(rows: z.infer<typeof assetDescriptor>[]): AssetDescriptor[] {
  return rows.map((r) => ({ assetType: r.assetType, playerContractId: r.playerContractId, draftPickId: r.draftPickId, playerDraftRightId: r.playerDraftRightId }));
}

export async function registerTradeRoutes(app: FastifyInstance) {
  // Public read APIs
  app.get('/api/trades', async (q, r) => { try { return await listCompletedTrades(q.query) } catch (e) { return error(r, e) } });
  app.get('/api/trades/readiness', async (_q, r) => { try { return detailResponse(await getTradeReadiness()) } catch (e) { return error(r, e) } });
  app.get('/api/trades/:tradeId', async (q, r) => { try { return detailResponse(await getCompletedTrade((q.params as any).tradeId)) } catch (e) { return error(r, e) } });
  app.get('/api/trade-proposals', async (q, r) => { try { return await listProposals(q.query) } catch (e) { return error(r, e) } });
  app.get('/api/trade-proposals/:proposalId', async (q, r) => { try { return detailResponse(await getProposal((q.params as any).proposalId)) } catch (e) { return error(r, e) } });
  app.get('/api/trade/configurations', async (_q, r) => { try { return listResponse(await listTradeConfigurations(prisma)) } catch (e) { return error(r, e) } });
  app.get('/api/players/:playerId/trades', async (q, r) => { try { return await getPlayerTrades((q.params as any).playerId) } catch (e) { return error(r, e) } });
  app.get('/api/teams/:teamId/trades', async (q, r) => { try { return await getTeamTrades((q.params as any).teamId) } catch (e) { return error(r, e) } });
  app.get('/api/teams/:teamId/trade-center', async (q, r) => { try { return detailResponse(await getTeamTradeOverview((q.params as any).teamId)) } catch (e) { return error(r, e) } });
  app.get('/api/draft-picks/:pickId/trades', async (q, r) => { try { return detailResponse(await getDraftPickTrades((q.params as any).pickId)) } catch (e) { return error(r, e) } });
  app.get('/api/draft-rights/:rightId/trades', async (q, r) => { try { return detailResponse(await getDraftRightTrades((q.params as any).rightId)) } catch (e) { return error(r, e) } });

  // Team-scoped proposal actions (proposing team creates/edits/submits/withdraws)
  app.post('/api/teams/:teamId/trade-proposals', async (q, r) => {
    try {
      const b = createBody.parse(q.body);
      return detailResponse(await createProposal({
        proposingTeamId: (q.params as any).teamId,
        receivingTeamId: b.receivingTeamId,
        proposedBy: b.proposedBy,
        reason: b.reason,
        proposingAssets: asDescriptors(b.proposingAssets),
        receivingAssets: asDescriptors(b.receivingAssets),
      }));
    } catch (e) { return error(r, e) }
  });

  app.patch('/api/teams/:teamId/trade-proposals/:proposalId', async (q, r) => {
    try {
      const b = editBody.parse(q.body);
      return detailResponse(await editProposal((q.params as any).proposalId, (q.params as any).teamId, { proposingAssets: asDescriptors(b.proposingAssets), receivingAssets: asDescriptors(b.receivingAssets), reason: b.reason, expectedUpdatedAt: b.expectedUpdatedAt }));
    } catch (e) { return error(r, e) }
  });

  app.post('/api/teams/:teamId/trade-proposals/:proposalId/preview', async (q, r) => { try { return detailResponse(await previewProposal((q.params as any).proposalId)) } catch (e) { return error(r, e) } });
  app.post('/api/teams/:teamId/trade-proposals/:proposalId/submit', async (q, r) => { try { const b = z.object({ expectedUpdatedAt }).parse(q.body ?? {}); return detailResponse(await submitProposal((q.params as any).proposalId, (q.params as any).teamId, b.expectedUpdatedAt)) } catch (e) { return error(r, e) } });
  app.post('/api/teams/:teamId/trade-proposals/:proposalId/withdraw', async (q, r) => { try { const b = z.object({ reason, expectedUpdatedAt }).parse(q.body); return detailResponse(await withdrawProposal((q.params as any).proposalId, (q.params as any).teamId, b.reason, b.expectedUpdatedAt)) } catch (e) { return error(r, e) } });

  // Receiving team accepts / rejects. Commissioner may also accept via the commissioner route.
  app.post('/api/teams/:teamId/trade-proposals/:proposalId/accept', async (q, r) => {
    try {
      const b = z.object({ reason, expectedUpdatedAt }).parse(q.body);
      return detailResponse(await acceptProposal((q.params as any).proposalId, (q.params as any).teamId, b.reason, b.expectedUpdatedAt));
    } catch (e) { return error(r, e) }
  });
  app.post('/api/teams/:teamId/trade-proposals/:proposalId/reject', async (q, r) => { try { const b = z.object({ reason, expectedUpdatedAt }).parse(q.body); return detailResponse(await rejectProposal((q.params as any).proposalId, b.reason, b.expectedUpdatedAt)) } catch (e) { return error(r, e) } });
}

/** Commissioner-mode gate helper shared with the commissioner route file. */
export function requireCommissionerAccess(q: any) {
  if (!hasCommissionerHeader(q.headers)) throw new CommissionerHttpError(403, 'CommissionerModeRequired', 'Commissioner Mode header is required');
  if (!areCommissionerWritesEnabled()) throw new CommissionerHttpError(403, 'CommissionerWritesDisabled', 'Commissioner writes are disabled');
}
