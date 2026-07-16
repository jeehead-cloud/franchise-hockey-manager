import {
  SeasonTransitionError,
  type CarryForwardSummary,
  type PlannedTargetEdition,
  type SeasonTransitionConfig,
  type SourceSeasonInput,
  type TargetSeasonIdentity,
  type TransitionReadiness,
} from './types.js';

/**
 * Reconcile a transition result after publication. The server passes the
 * materialized target-season rows back in domain-neutral form; the engine
 * validates that they match the frozen plan exactly and that source invariants
 * (Player count unchanged, exactly one current season, etc.) hold.
 */
export interface ReconciliationInput {
  config: SeasonTransitionConfig;
  sourceSeason: SourceSeasonInput;
  targetSeason: TargetSeasonIdentity & { id: string };
  plannedEditions: PlannedTargetEdition[];
  /** What the server actually created/published. */
  published: {
    targetWorldSeasonId: string;
    targetWorldSeasonOrder: number;
    targetWorldSeasonLabel: string;
    targetWorldSeasonStatus: string;
    targetWorldSeasonIsCurrent: boolean;
    sourceWorldSeasonStatus: string;
    sourceWorldSeasonIsCurrent: boolean;
    editionsCreated: {
      competitionId: string;
      displayName: string;
      status: string;
      rulesHash: string;
      stageCount: number;
      participantCount: number;
    }[];
    currentSeasonCount: number;
    playerCount: number;
    sourcePlayerCount: number;
    lockedNationalTeamRostersCopied: number;
    matchesCreated: number;
    schedulesGenerated: number;
  };
}

export interface ReconciliationResult {
  ok: boolean;
  resultHash: string;
  checks: { id: string; status: 'PASS' | 'FAIL'; message: string }[];
}

/**
 * Validate a published transition. Pure engine: no Prisma, no I/O.
 */
export function reconcileTransition(input: ReconciliationInput): ReconciliationResult {
  const checks: { id: string; status: 'PASS' | 'FAIL'; message: string }[] = [];
  const { published, plannedEditions, targetSeason, config } = input;

  const fail = (id: string, message: string) => {
    checks.push({ id, status: 'FAIL', message });
  };
  const pass = (id: string, message: string) => {
    checks.push({ id, status: 'PASS', message });
  };

  // 1. Target identity.
  if (published.targetWorldSeasonId !== targetSeason.id) {
    fail('target_id', `Target id mismatch: ${published.targetWorldSeasonId} vs ${targetSeason.id}`);
  } else pass('target_id', 'Target id matches');
  if (published.targetWorldSeasonOrder !== targetSeason.order) {
    fail('target_order', `Target order mismatch: ${published.targetWorldSeasonOrder} vs ${targetSeason.order}`);
  } else pass('target_order', 'Target order matches');
  if (published.targetWorldSeasonLabel !== targetSeason.label) {
    fail('target_label', `Target label mismatch`);
  } else pass('target_label', 'Target label matches');

  // 2. Exactly one current season.
  if (published.currentSeasonCount !== 1) {
    fail('current_season_count', `Expected exactly one current WorldSeason, found ${published.currentSeasonCount}`);
  } else pass('current_season_count', 'Exactly one current season');
  if (!published.targetWorldSeasonIsCurrent) {
    fail('target_is_current', 'Target season is not current');
  } else pass('target_is_current', 'Target season is current');
  if (published.sourceWorldSeasonIsCurrent) {
    fail('source_no_longer_current', 'Source season is still current');
  } else pass('source_no_longer_current', 'Source season is no longer current');

  // 3. Player count unchanged (F31 never duplicates or develops Players).
  if (published.playerCount !== published.sourcePlayerCount) {
    fail('player_count', `Player count changed: ${published.sourcePlayerCount} -> ${published.playerCount}`);
  } else pass('player_count', `Player count unchanged (${published.playerCount})`);

  // 4. No Matches / schedules created.
  if (published.matchesCreated !== 0) {
    fail('no_matches', `${published.matchesCreated} Match(es) were created — F31 must not generate matches`);
  } else pass('no_matches', 'No Matches created');
  if (published.schedulesGenerated !== 0) {
    fail('no_schedules', `${published.schedulesGenerated} schedule(s) were generated`);
  } else pass('no_schedules', 'No schedules generated');

  // 5. Editions created match the plan.
  if (published.editionsCreated.length !== plannedEditions.length) {
    fail('edition_count', `Edition count mismatch: planned ${plannedEditions.length}, created ${published.editionsCreated.length}`);
  } else pass('edition_count', `${plannedEditions.length} edition(s) created as planned`);
  for (const planned of plannedEditions) {
    const created = published.editionsCreated.find((e) => e.competitionId === planned.competitionId);
    if (!created) {
      fail(`edition_${planned.competitionId}`, 'Planned edition not created');
      continue;
    }
    if (created.status !== config.competitions.newEditionInitialStatus) {
      fail(`edition_${planned.competitionId}_status`, `Status ${created.status} != configured ${config.competitions.newEditionInitialStatus}`);
    }
    if (created.rulesHash !== planned.rulesHash) {
      fail(`edition_${planned.competitionId}_rules`, 'Rules hash drift');
    }
    if (created.stageCount !== planned.stages.length) {
      fail(`edition_${planned.competitionId}_stages`, `Stage count ${created.stageCount} != planned ${planned.stages.length}`);
    }
  }

  // 6. National-team locked rosters must not be reused.
  if (published.lockedNationalTeamRostersCopied !== 0) {
    fail('national_team_roster_reuse', `${published.lockedNationalTeamRostersCopied} locked national-team roster(s) were copied`);
  } else pass('national_team_roster_reuse', 'No locked national-team rosters reused');

  const ok = checks.every((c) => c.status === 'PASS');
  return { ok, resultHash: '', checks };
}

/** Hash payload helper used by the server for `resultHash`. */
export function transitionResultHashPayload(
  readiness: TransitionReadiness,
  targetSeasonId: string,
): Record<string, unknown> {
  return {
    readinessHash: readiness.readinessHash,
    targetSeasonId,
    targetOrder: readiness.proposedTargetSeason.order,
    targetLabel: readiness.proposedTargetSeason.label,
    editions: readiness.competitionPlan
      .map((p) => ({ competitionId: p.competitionId, displayName: p.displayName, rulesHash: p.rulesHash, stages: p.stages.length }))
      .sort((a, b) => a.competitionId.localeCompare(b.competitionId)),
  };
}

/** Assert reconciliation — throws on any failure. */
export function assertTransitionReconciliation(input: ReconciliationInput): ReconciliationResult {
  const result = reconcileTransition(input);
  if (!result.ok) {
    throw new SeasonTransitionError(
      'SeasonTransitionReconciliationFailed',
      `Transition reconciliation failed: ${result.checks.filter((c) => c.status === 'FAIL').map((c) => c.id).join(', ')}`,
      { checks: result.checks },
    );
  }
  return result;
}
