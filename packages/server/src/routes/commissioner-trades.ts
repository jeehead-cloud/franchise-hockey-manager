import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { CommissionerHttpError, commissionerErrorBody } from '../commissioner/errors.js';
import { detailResponse, listResponse } from '../http.js';
import { TradeHttpError } from '../services/trade-errors.js';
import { listTradeConfigurations } from '../services/trade-config.js';
import { prisma } from '../db/client.js';
import { activateTradeVersion, auditTradeAction, createTradePreset, createTradeVersion } from '../services/commissioner-trades.js';
import { acceptProposal, createProposal, editProposal, getProposal, previewProposal, rejectProposal, submitProposal, withdrawProposal, type CreateProposalInput } from '../services/trade-proposals.js';
import { getCompletedTrade } from '../services/trade-history.js';
import { requireCommissionerAccess } from './trades.js';
import type { AssetDescriptor } from '../services/trade-valuations.js';

function error(r: any, e: unknown) {
  if (e instanceof CommissionerHttpError) return r.status(e.statusCode).send(commissionerErrorBody(e));
  if (e instanceof TradeHttpError) return r.status(e.statusCode).send({ error: e.code, message: e.message, details: e.details });
  if (e instanceof z.ZodError) return r.status(400).send({ error: 'InvalidTradeRequest', message: 'Invalid trade request', details: e.issues });
  throw e;
}
const reason = z.string().trim().min(1).max(500);
const expectedUpdatedAt = z.string().datetime().optional();
const source = (q: any): 'COMMISSIONER_UI' | 'COMMISSIONER_API' => (q.headers['x-fhm-commissioner-source'] === 'ui' ? 'COMMISSIONER_UI' : 'COMMISSIONER_API');

const assetDescriptor = z.object({
  assetType: z.enum(['PLAYER_CONTRACT', 'DRAFT_PICK', 'PLAYER_DRAFT_RIGHT']),
  playerContractId: z.string().min(1).optional(),
  draftPickId: z.string().min(1).optional(),
  playerDraftRightId: z.string().min(1).optional(),
}).strict();
const asDescriptors = (rows: z.infer<typeof assetDescriptor>[]): AssetDescriptor[] => rows.map((r) => ({ assetType: r.assetType, playerContractId: r.playerContractId, draftPickId: r.draftPickId, playerDraftRightId: r.playerDraftRightId }));

export async function registerCommissionerTradeRoutes(app: FastifyInstance) {
  // Diagnostics — reveal both team valuations + true comparison behind the gate.
  app.get('/api/commissioner/trade-proposals/:id/diagnostics', async (q, r) => {
    try {
      requireCommissionerAccess(q);
      return detailResponse(await previewProposal((q.params as any).id));
    } catch (e) { return error(r, e) }
  });
  app.get('/api/commissioner/trades/:id/diagnostics', async (q, r) => {
    try {
      requireCommissionerAccess(q);
      return detailResponse(await getCompletedTrade((q.params as any).id));
    } catch (e) { return error(r, e) }
  });

  // Configuration management.
  app.get('/api/commissioner/trade-configurations', async (q, r) => { try { requireCommissionerAccess(q); return listResponse(await listTradeConfigurations(prisma)) } catch (e) { return error(r, e) } });
  app.post('/api/commissioner/trade-configurations', async (q, r) => {
    try {
      requireCommissionerAccess(q);
      const b = z.object({ name: z.string().min(1), description: z.string().nullable().optional(), config: z.unknown(), activate: z.boolean().optional(), reason }).parse(q.body);
      return detailResponse(await createTradePreset(b, source(q)));
    } catch (e) { return error(r, e) }
  });
  app.post('/api/commissioner/trade-configurations/:presetId/versions', async (q, r) => {
    try {
      requireCommissionerAccess(q);
      const b = z.object({ config: z.unknown(), activate: z.boolean().optional(), reason }).parse(q.body);
      return detailResponse(await createTradeVersion((q.params as any).presetId, b, source(q)));
    } catch (e) { return error(r, e) }
  });
  app.post('/api/commissioner/trade-configuration-versions/:versionId/activate', async (q, r) => {
    try {
      requireCommissionerAccess(q);
      const b = z.object({ reason }).parse(q.body);
      return detailResponse(await activateTradeVersion((q.params as any).versionId, b.reason, source(q)));
    } catch (e) { return error(r, e) }
  });

  // Commissioner create/patch proposal (acts on behalf of the proposing team).
  app.post('/api/commissioner/trades', async (q, r) => {
    try {
      requireCommissionerAccess(q);
      const b = z.object({
        proposingTeamId: z.string().min(1), receivingTeamId: z.string().min(1), proposedBy: z.string().min(1), reason: z.string().max(500).optional(),
        proposingAssets: z.array(assetDescriptor).max(10), receivingAssets: z.array(assetDescriptor).max(10),
      }).strict().parse(q.body);
      const input: CreateProposalInput = { proposingTeamId: b.proposingTeamId, receivingTeamId: b.receivingTeamId, proposedBy: b.proposedBy, reason: b.reason, proposingAssets: asDescriptors(b.proposingAssets), receivingAssets: asDescriptors(b.receivingAssets) };
      const item = await createProposal(input);
      await auditTradeAction('TRADE_PROPOSAL', item.id, 'TRADE_PROPOSAL_CREATED', b.reason ?? 'Commissioner created trade proposal', item, source(q));
      return detailResponse(item);
    } catch (e) { return error(r, e) }
  });

  app.patch('/api/commissioner/trade-proposals/:id', async (q, r) => {
    try {
      requireCommissionerAccess(q);
      const b = z.object({ proposingAssets: z.array(assetDescriptor).max(10), receivingAssets: z.array(assetDescriptor).max(10), reason: z.string().max(500).optional(), expectedUpdatedAt }).strict().parse(q.body);
      const item = await editProposal((q.params as any).id, undefined, { proposingAssets: asDescriptors(b.proposingAssets), receivingAssets: asDescriptors(b.receivingAssets), reason: b.reason, expectedUpdatedAt: b.expectedUpdatedAt }, true);
      await auditTradeAction('TRADE_PROPOSAL', item.id, 'TRADE_PROPOSAL_UPDATED', b.reason ?? 'Commissioner edited trade proposal', item, source(q));
      return detailResponse(item);
    } catch (e) { return error(r, e) }
  });

  app.post('/api/commissioner/trade-proposals/:id/submit', async (q, r) => {
    try {
      requireCommissionerAccess(q);
      const b = z.object({ reason: reason.optional(), expectedUpdatedAt }).parse(q.body ?? {});
      const item = await submitProposal((q.params as any).id, undefined, b.expectedUpdatedAt, true);
      await auditTradeAction('TRADE_PROPOSAL', item.id, 'TRADE_PROPOSAL_SUBMITTED', b.reason ?? 'Commissioner submitted trade proposal', item, source(q));
      return detailResponse(item);
    } catch (e) { return error(r, e) }
  });

  app.post('/api/commissioner/trade-proposals/:id/accept', async (q, r) => {
    try {
      requireCommissionerAccess(q);
      const b = z.object({ reason, expectedUpdatedAt }).parse(q.body);
      const item = await acceptProposal((q.params as any).id, undefined, b.reason, b.expectedUpdatedAt, true);
      await auditTradeAction('COMPLETED_TRADE', item.completedTradeId, 'TRADE_ACCEPTED', b.reason, item, source(q));
      return detailResponse(item);
    } catch (e) { return error(r, e) }
  });

  app.post('/api/commissioner/trade-proposals/:id/reject', async (q, r) => {
    try {
      requireCommissionerAccess(q);
      const b = z.object({ reason, expectedUpdatedAt }).parse(q.body);
      const item = await rejectProposal((q.params as any).id, b.reason, b.expectedUpdatedAt);
      await auditTradeAction('TRADE_PROPOSAL', item.id, 'TRADE_PROPOSAL_REJECTED', b.reason, item, source(q));
      return detailResponse(item);
    } catch (e) { return error(r, e) }
  });

  app.post('/api/commissioner/trade-proposals/:id/withdraw', async (q, r) => {
    try {
      requireCommissionerAccess(q);
      const b = z.object({ reason, expectedUpdatedAt }).parse(q.body);
      const item = await withdrawProposal((q.params as any).id, undefined, b.reason, b.expectedUpdatedAt, true);
      await auditTradeAction('TRADE_PROPOSAL', item.id, 'TRADE_PROPOSAL_WITHDRAWN', b.reason, item, source(q));
      return detailResponse(item);
    } catch (e) { return error(r, e) }
  });
}
