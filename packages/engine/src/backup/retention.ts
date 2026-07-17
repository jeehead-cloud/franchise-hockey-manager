import type { BackupConfig, RetentionCandidate, RetentionPruneProposal } from './types.js';

/**
 * Compute a deterministic retention/pruning plan from the active backup
 * configuration and the current backup inventory.
 *
 * Rules (all evaluated against VERIFIED backups unless noted):
 *  - Never propose a protected backup for pruning (regardless of age/count).
 *  - Keep at least `minimumBackupsToKeep` VERIFIED backups.
 *  - Keep the `keepLatestPerReason` most-recent VERIFIED backups per reason.
 *  - Enforce `maximumBackups` by pruning the oldest non-protected VERIFIED
 *    backups beyond the cap.
 *  - Enforce `maximumAgeDays` by pruning non-protected VERIFIED backups older
 *    than the cutoff, while still respecting `minimumBackupsToKeep`.
 *  - Never delete the only remaining VERIFIED backup (default policy).
 *
 * The plan is a preview only — the server performs the actual deletion in a
 * separate Commissioner-gated prune step. Deterministic: the same inventory +
 * config + reference time always yield the same plan.
 */
export function computeRetentionPlan(args: {
  config: BackupConfig;
  candidates: RetentionCandidate[];
  /** ISO reference timestamp (the server supplies a fixed "now"). */
  referenceTime: string;
}): RetentionPruneProposal {
  const { config, candidates, referenceTime } = args;
  const retention = config.retention;

  // Non-DELETED backups are the working set. DELETED rows are excluded.
  const live = candidates.filter((c) => c.status !== 'DELETED');
  const protectedIds = new Set(live.filter((c) => isProtected(c, config)).map((c) => c.id));

  if (!retention.enabled) {
    return emptyPlan(live, protectedIds);
  }

  // VERIFIED backups are the retention subject. Non-verified (CREATING/
  // CREATED/VERIFYING/FAILED/MISSING/CORRUPT) are neither "kept" by
  // retention nor pruned by it; they are left for storage-scan cleanup.
  const verified = live.filter((c) => c.status === 'VERIFIED');
  // Newest-first by createdAt, tie-break by id for determinism.
  const byNewest = [...verified].sort(compareNewestFirst);
  const keep = new Set<string>();
  const reasons: Record<string, string> = {};

  // 1. Always keep protected ones.
  for (const c of verified) {
    if (protectedIds.has(c.id)) keep.add(c.id);
  }

  // 2. Keep the latest N per reason.
  const perReasonCount: Record<string, number> = {};
  for (const c of byNewest) {
    const n = perReasonCount[c.reasonCode] ?? 0;
    if (n < retention.keepLatestPerReason) {
      keep.add(c.id);
      perReasonCount[c.reasonCode] = n + 1;
    }
  }

  // 3. Enforce minimum-to-keep: keep the newest until we reach the floor.
  for (const c of byNewest) {
    if (keep.size >= retention.minimumBackupsToKeep) break;
    keep.add(c.id);
  }

  // 4. Never prune the only VERIFIED backup. If exactly one verified remains
  //    eligible (non-protected) and it would otherwise be pruned, keep it.
  const eligibleNonProtected = verified.filter((c) => !protectedIds.has(c.id));
  if (eligibleNonProtected.length === 1) {
    keep.add(eligibleNonProtected[0]!.id);
  }

  // 5. Age cutoff: mark non-protected, non-kept verified backups older than
  //    the cutoff for pruning.
  const refMs = Date.parse(referenceTime);
  const ageCutoffMs = refMs - retention.maximumAgeDays * 24 * 60 * 60 * 1000;

  // 6. Count cap: beyond maximumBackups verified backups (protected
  //    included), the oldest non-protected ones are pruned.
  // Build the final keep set by walking oldest-first and pruning candidates
  // that are not protected, subject to the rules above.
  const byOldest = [...byNewest].reverse();
  const pruneIds: string[] = [];
  let keptVerifiedCount = 0;
  // First count how many verified survive after keep decisions.
  for (const c of verified) {
    if (keep.has(c.id)) keptVerifiedCount += 1;
  }

  for (const c of byOldest) {
    if (protectedIds.has(c.id)) continue;
    if (keep.has(c.id)) continue;
    const createdMs = Date.parse(c.createdAt);
    const tooOld = Number.isFinite(createdMs) && createdMs < ageCutoffMs;
    const overCap = keptVerifiedCount > retention.maximumBackups;
    if (tooOld || overCap) {
      pruneIds.push(c.id);
      reasons[c.id] = tooOld && overCap
        ? `older than ${retention.maximumAgeDays} days and exceeds maximumBackups (${retention.maximumBackups})`
        : tooOld
          ? `older than ${retention.maximumAgeDays} days`
          : `exceeds maximumBackups (${retention.maximumBackups})`;
      keptVerifiedCount -= 1;
    }
  }

  const keepIds = live.map((c) => c.id).filter((id) => !pruneIds.includes(id));
  return {
    pruneIds,
    keepIds,
    reasons,
    protectedIds: [...protectedIds],
  };
}

/**
 * Policy-level protection check. The server also enforces operation-linked
 * protection (active restores) which it folds into the candidate's `protected`
 * flag before calling the engine.
 */
export function isProtected(candidate: RetentionCandidate, config: BackupConfig): boolean {
  if (candidate.protected) return true;
  const r = config.retention;
  if (r.protectManualBackups && candidate.backupType === 'MANUAL') return true;
  if (r.protectPreRestoreBackups && candidate.backupType === 'PRE_RESTORE') return true;
  if (
    r.protectSuccessfulRestoreSources &&
    candidate.sourceOperationType === 'DATABASE_RESTORE'
  ) {
    return true;
  }
  return false;
}

function compareNewestFirst(a: RetentionCandidate, b: RetentionCandidate): number {
  const at = Date.parse(a.createdAt);
  const bt = Date.parse(b.createdAt);
  if (at !== bt) return bt - at;
  return a.id.localeCompare(b.id);
}

function emptyPlan(live: RetentionCandidate[], protectedIds: Set<string>): RetentionPruneProposal {
  return {
    pruneIds: [],
    keepIds: live.map((c) => c.id),
    reasons: {},
    protectedIds: [...protectedIds],
  };
}
