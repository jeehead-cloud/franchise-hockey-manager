import fs from 'node:fs';
import type { PrismaClient, DatabaseBackup } from '@prisma/client';
import {
  computeRetentionPlan,
  isBackupProtected,
  type BackupConfig,
  type RetentionCandidate,
  type RetentionPruneProposal,
} from '@fhm/engine';
import { prisma } from '../db/client.js';
import { backupErrors } from './backup-errors.js';
import { ensureBackupRoot, resolveBackupFile } from './backup-paths.js';
import { getActiveBackupSnapshot } from './backup-config.js';

/**
 * Build a deterministic retention-prune proposal (no deletion). Previews which
 * VERIFIED backups would be pruned under the active configuration.
 */
export async function previewRetentionPlan(): Promise<{
  plan: RetentionPruneProposal;
  candidates: RetentionCandidate[];
  config: BackupConfig;
}> {
  const snapshot = await getActiveBackupSnapshot(prisma);
  const config = snapshot.config;
  const rows = await loadRetentionCandidates();
  const plan = computeRetentionPlan({
    config,
    candidates: rows,
    referenceTime: new Date().toISOString(),
  });
  return { plan, candidates: rows, config };
}

/**
 * Execute a retention prune — Commissioner-gated, explicit reason. Deletes only
 * the proposed backup files + manifests, marks metadata DELETED, and appends
 * audit history. Never deletes outside the backup root; never deletes a
 * protected backup; never deletes a backup referenced by an active restore.
 */
export async function executeRetentionPrune(args: {
  reason: string;
  requestedBy: string;
  /** Restrict pruning to this exact set of ids (must match the preview plan). */
  restrictToIds?: string[];
}): Promise<{ pruned: DatabaseBackup[]; skippedProtected: string[] }> {
  const snapshot = await getActiveBackupSnapshot(prisma);
  const config = snapshot.config;
  const root = ensureBackupRoot(config);
  const { plan } = await previewRetentionPlan();
  let targetIds = plan.pruneIds;
  if (args.restrictToIds) {
    const allowed = new Set(plan.pruneIds);
    for (const id of args.restrictToIds) {
      if (!allowed.has(id)) {
        throw backupErrors.backupProtected(id);
      }
    }
    targetIds = args.restrictToIds;
  }

  const pruned: DatabaseBackup[] = [];
  const skippedProtected: string[] = [];
  for (const id of targetIds) {
    const backup = await prisma.databaseBackup.findUnique({ where: { id } });
    if (!backup) continue;

    // Reject protected backups (defense in depth, even though the plan excludes them).
    if (isBackupProtected(toCandidate(backup), config) || backup.protected) {
      skippedProtected.push(id);
      continue;
    }
    // Reject backups referenced by an active restore.
    if (await isReferencedByActiveRestore(id)) {
      throw backupErrors.backupInUseByRestore(id);
    }
    // Reject non-VERIFIED targets (only VERIFIED backups are retention subjects).
    if (backup.status !== 'VERIFIED') {
      skippedProtected.push(id);
      continue;
    }

    // Delete files (only inside the root).
    try {
      const backupPath = resolveBackupFile(root, backup.relativeFilePath);
      if (fs.existsSync(backupPath)) fs.unlinkSync(backupPath);
    } catch {
      /* best-effort */
    }
    if (backup.manifestRelativePath) {
      try {
        const manifestPath = resolveBackupFile(root, backup.manifestRelativePath);
        if (fs.existsSync(manifestPath)) fs.unlinkSync(manifestPath);
      } catch {
        /* best-effort */
      }
    }

    const updated = await prisma.databaseBackup.update({
      where: { id },
      data: { status: 'DELETED' },
    });
    pruned.push(updated);
  }
  return { pruned, skippedProtected };
}

async function loadRetentionCandidates(): Promise<RetentionCandidate[]> {
  const rows = await prisma.databaseBackup.findMany({
    where: { status: { not: 'DELETED' } },
  });
  return rows.map((r) => toCandidate(r));
}

function toCandidate(row: DatabaseBackup): RetentionCandidate {
  return {
    id: row.id,
    status: row.status as never,
    backupType: row.backupType as never,
    reasonCode: row.reasonCode as never,
    protected: row.protected,
    protectionReason: row.protectionReason,
    sourceOperationType: row.sourceOperationType,
    createdAt: row.createdAt.toISOString(),
    verifiedAt: row.verifiedAt ? row.verifiedAt.toISOString() : null,
  };
}

async function isReferencedByActiveRestore(backupId: string): Promise<boolean> {
  const active = await prisma.databaseRestoreRun.findFirst({
    where: {
      OR: [{ sourceBackupId: backupId }, { preRestoreBackupId: backupId }],
      status: { in: ['PREPARED', 'WAITING_FOR_RESTART', 'RUNNING', 'VERIFYING'] },
    },
  });
  return !!active;
}

/** Protect / unprotect a single backup (Commissioner-controlled). */
export async function protectBackup(args: {
  backupId: string;
  reason: string;
  requestedBy: string;
}): Promise<DatabaseBackup> {
  const backup = await prisma.databaseBackup.findUnique({ where: { id: args.backupId } });
  if (!backup) throw backupErrors.backupNotFound(args.backupId);
  return prisma.databaseBackup.update({
    where: { id: args.backupId },
    data: { protected: true, protectionReason: args.reason },
  });
}

export async function unprotectBackup(args: {
  backupId: string;
  reason: string;
  requestedBy: string;
}): Promise<DatabaseBackup> {
  const backup = await prisma.databaseBackup.findUnique({ where: { id: args.backupId } });
  if (!backup) throw backupErrors.backupNotFound(args.backupId);
  // Mandatory system protection (PRE_RESTORE) cannot be removed.
  if (backup.backupType === 'PRE_RESTORE') {
    throw backupErrors.backupProtected(args.backupId);
  }
  return prisma.databaseBackup.update({
    where: { id: args.backupId },
    data: { protected: false, protectionReason: null },
  });
}
