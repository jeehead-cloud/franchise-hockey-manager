import { createHash } from 'node:crypto';
import type { CommissionerAuditSource, Prisma, PrismaClient } from '@prisma/client';
import { prisma } from '../db/client.js';

/**
 * Append a Commissioner audit row for a maintenance operation. Mirrors the F32
 * inline audit helper. Uses the shared prisma singleton (no tx parameter) —
 * callers that need atomicity should pass a tx-aware variant or call this
 * after their tx commits.
 */
export async function auditMaintenance(
  entityType: string,
  entityId: string,
  action: string,
  reason: string,
  before: unknown,
  after: unknown,
  source: CommissionerAuditSource,
): Promise<void> {
  await prisma.commissionerAuditLog.create({
    data: {
      entityType: entityType as never,
      entityId,
      action: action as never,
      reason,
      beforeJson: JSON.stringify(before),
      afterJson: JSON.stringify(after),
      changedFieldsJson: JSON.stringify(['maintenance']),
      source,
    },
  });
}

/**
 * Tx-aware audit for atomic operations. Commits in the same transaction as
 * the mutation.
 */
export async function auditMaintenanceTx(
  tx: Prisma.TransactionClient,
  entityType: string,
  entityId: string,
  action: string,
  reason: string,
  before: unknown,
  after: unknown,
  source: CommissionerAuditSource,
): Promise<void> {
  await tx.commissionerAuditLog.create({
    data: {
      entityType: entityType as never,
      entityId,
      action: action as never,
      reason,
      beforeJson: JSON.stringify(before),
      afterJson: JSON.stringify(after),
      changedFieldsJson: JSON.stringify(['maintenance']),
      source,
    },
  });
}

/**
 * Append a maintenance event row (separate from CommissionerAuditLog). These
 * feed the maintenance History tab and survive independently. The eventHash is
 * computed from the canonical event summary — never includes secrets.
 */
export async function appendMaintenanceEvent(args: {
  entityType: string;
  entityId: string;
  eventType: string;
  statusBefore: string | null;
  statusAfter: string | null;
  summary: string;
}): Promise<void> {
  const eventHash = createHash('sha256')
    .update(
      JSON.stringify({
        entityType: args.entityType,
        entityId: args.entityId,
        eventType: args.eventType,
        statusBefore: args.statusBefore,
        statusAfter: args.statusAfter,
        summary: args.summary,
      }),
    )
    .digest('hex');
  await prisma.maintenanceEvent.create({
    data: {
      entityType: args.entityType,
      entityId: args.entityId,
      eventType: args.eventType,
      statusBefore: args.statusBefore,
      statusAfter: args.statusAfter,
      summaryText: args.summary,
      eventHash,
    },
  });
}

export interface MaintenanceHistoryFilter {
  entityType?: string;
  entityId?: string;
  eventType?: string;
}

export async function listMaintenanceEvents(opts: {
  filter?: MaintenanceHistoryFilter;
  limit?: number;
  offset?: number;
} = {}) {
  const where: Record<string, unknown> = {};
  if (opts.filter?.entityType) where.entityType = opts.filter.entityType;
  if (opts.filter?.entityId) where.entityId = opts.filter.entityId;
  if (opts.filter?.eventType) where.eventType = opts.filter.eventType;
  const limit = Math.min(opts.limit ?? 100, 500);
  const offset = opts.offset ?? 0;
  const [items, total] = await Promise.all([
    prisma.maintenanceEvent.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: limit,
      skip: offset,
    }),
    prisma.maintenanceEvent.count({ where }),
  ]);
  return {
    items: items.map((e) => ({
      id: e.id,
      entityType: e.entityType,
      entityId: e.entityId,
      eventType: e.eventType,
      statusBefore: e.statusBefore,
      statusAfter: e.statusAfter,
      summary: e.summaryText,
      eventHashPrefix: e.eventHash.slice(0, 12),
      createdAt: e.createdAt,
    })),
    total,
    limit,
    offset,
  };
}

export type { PrismaClient };
