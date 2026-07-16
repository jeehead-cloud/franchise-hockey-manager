export * from './types.js';
export * from './config.js';
export * from './dates.js';
export * from './identity.js';
export * from './carry-forward.js';
export * from './readiness.js';
export * from './reconciliation.js';
export * from './hashing.js';

import { stableSeasonTransitionHash } from './hashing.js';
import type {
  SeasonTransitionConfig,
  SourceCompetitionEditionInput,
  SourceSeasonInput,
  OwnershipIntegrityInput,
  RunningWorldOperationInput,
  ScoutingStalenessInput,
  CompletedOffseasonRunInput,
} from './types.js';

/**
 * Compute the frozen "input hash" for a prepared transition. Covers everything
 * that, if changed, must force a re-prepare before execution. Excludes wall
 * clock, run id, and contextual readiness state (existing transitions, current
 * season id, existing season orders) — those are consequences of the world
 * state, not inputs to the transition. The hash captures: active config, source
 * season identity + updatedAt + status, the completed OffseasonRun, all source
 * editions + their rules/stages, ownership integrity, running operations,
 * scouting staleness, and the optional display-name override.
 */
export function computeTransitionInputHash(args: {
  configHash: string;
  sourceSeason: SourceSeasonInput;
  completedOffseasonRun: CompletedOffseasonRunInput | null;
  offseasonRunsForSeason: { id: string; status: string }[];
  sourceEditions: SourceCompetitionEditionInput[];
  ownership: OwnershipIntegrityInput;
  runningOperations: RunningWorldOperationInput;
  scoutingStaleness: ScoutingStalenessInput;
  targetDisplayNameOverride: string | null;
  existingTransitionsForSource: { id: string; status: string; targetWorldSeasonId: string | null; inputHash: string }[];
  existingSeasonOrders: number[];
  currentSeasonId: string | null;
}): string {
  return stableSeasonTransitionHash({
    configHash: args.configHash,
    sourceSeasonId: args.sourceSeason.id,
    sourceSeasonUpdatedAt: args.sourceSeason.updatedAt,
    sourceSeasonStatus: args.sourceSeason.status,
    offseasonRunId: args.completedOffseasonRun?.id ?? null,
    offseasonRunStatus: args.completedOffseasonRun?.status ?? null,
    offseasonRunResultHash: args.completedOffseasonRun?.resultHash ?? null,
    offseasonRunsForSeason: args.offseasonRunsForSeason.map((r) => ({ id: r.id, status: r.status })).sort((a, b) => a.id.localeCompare(b.id)),
    sourceEditions: args.sourceEditions
      .map((e) => ({
        competitionId: e.competitionId,
        editionId: e.editionId,
        displayName: e.displayName,
        status: e.status,
        archived: e.archived,
        rulesHash: e.rulesHash,
        defaultRulesJson: e.defaultRulesJson,
        stages: e.stages.map((s) => ({ stageOrder: s.stageOrder, configHash: s.configHash, sourceStageId: s.sourceStageId })).sort((a, b) => a.stageOrder - b.stageOrder),
        confirmedParticipantCount: e.confirmedParticipantCount,
      }))
      .sort((a, b) => a.competitionId.localeCompare(b.competitionId)),
    ownership: args.ownership,
    runningOperations: args.runningOperations,
    scoutingStaleness: args.scoutingStaleness,
    targetDisplayNameOverride: args.targetDisplayNameOverride,
  });
}

/**
 * Stale-input proof: returns true when the frozen prepared input still matches
 * the live world state. The server calls this before execution.
 */
export function isInputStillFresh(preparedInputHash: string, liveInputHash: string): boolean {
  return preparedInputHash === liveInputHash;
}
