import {
  SeasonTransitionError,
  type CarryForwardSummary,
  type PlannedTargetEdition,
  type PlannedTargetStage,
  type SeasonTransitionConfig,
  type SourceCompetitionEditionInput,
  type SourceStageInput,
  type TargetSeasonIdentity,
} from './types.js';
import { stableSeasonTransitionHash } from './hashing.js';

/**
 * Decide whether a source competition definition should produce a target
 * edition. Domestic competitions recur whenever they had a source edition.
 * International competitions recur only when an explicit recurrence flag is
 * set on the definition — otherwise they are left as an explicit manual
 * warning (handled by readiness, not the plan).
 */
export function shouldCarryForwardEdition(
  config: SeasonTransitionConfig,
  edition: SourceCompetitionEditionInput,
): { carry: boolean; reason: string } {
  if (!config.competitions.carryForwardEnabledDefinitions) {
    return { carry: false, reason: 'carryForwardEnabledDefinitions=false' };
  }
  // An edition must have existed in the source season to seed the next one,
  // unless the definition is explicitly recurring.
  const recurring = edition.recurring === true;
  if (edition.isInternational) {
    if (recurring) return { carry: true, reason: 'international definition marked recurring' };
    return { carry: false, reason: 'international competition not marked recurring (manual)' };
  }
  if (!edition.editionId && !recurring) {
    return { carry: false, reason: 'no source edition and not marked recurring (first-version rule)' };
  }
  return { carry: true, reason: recurring ? 'recurring domestic competition' : 'domestic competition with source edition' };
}

/**
 * Derive a deterministic target-edition display name. We reuse the source
 * edition's display name and substitute year tokens deterministically: the
 * source start year → target start year, the source end year → target end
 * year. Substitutions use placeholder tokens to avoid double-replacement when
 * the source start and end years share digits (e.g. 2026/2027 → 2027/2028).
 * If no year appears, we append the target label as a suffix.
 */
export function deriveTargetEditionDisplayName(
  source: SourceCompetitionEditionInput,
  target: TargetSeasonIdentity,
  sourceStartYear: number,
): string {
  const sourceStart = String(sourceStartYear);
  const sourceEnd = String(sourceStartYear + 1);
  const targetStart = String(target.order);
  const targetEnd = String(target.order + 1);
  // Use private-use Unicode placeholders so chained replacements don't collide.
  const START_TOKEN = '\uE000';
  const END_TOKEN = '\uE001';
  let name = source.displayName;
  let touched = false;
  if (name.includes(sourceStart)) {
    name = name.split(sourceStart).join(START_TOKEN);
    touched = true;
  }
  if (name.includes(sourceEnd)) {
    name = name.split(sourceEnd).join(END_TOKEN);
    touched = true;
  }
  if (touched) {
    return name.split(START_TOKEN).join(targetStart).split(END_TOKEN).join(targetEnd);
  }
  return `${source.displayName} ${target.label}`;
}

/**
 * Remap a source stage onto a target stage template. Dependencies are remapped
 * by source stageOrder so the new graph is internally consistent (acyclicity
 * is validated by the caller via {@link validateStageDependencyGraph}).
 *
 * `dependencyStageOrder` is the source stageOrder of the stage this stage
 * depends on (resolved from `sourceStageId`), or null if the stage has no
 * dependency. It becomes `remappedFromStageOrder` on the planned stage.
 */
export function remapStage(
  source: SourceStageInput,
  stageOrderMap: Map<number, number>,
  dependencyStageOrder: number | null,
): PlannedTargetStage {
  return {
    name: source.name,
    stageType: source.stageType,
    stageOrder: stageOrderMap.get(source.stageOrder) ?? source.stageOrder,
    configText: source.configText,
    configHash: source.configHash,
    participantSource: source.participantSource,
    remappedFromStageOrder: dependencyStageOrder,
    expectedQualifierCount: source.expectedQualifierCount,
  };
}

/**
 * Validate that the remapped stage dependency graph is acyclic (each stage may
 * depend on an earlier stage only). Returns the order map for reuse.
 */
export function buildStageOrderMap(stages: SourceStageInput[]): Map<number, number> {
  const sorted = [...stages].sort((a, b) => a.stageOrder - b.stageOrder);
  const map = new Map<number, number>();
  sorted.forEach((s, i) => map.set(s.stageOrder, i + 1));
  return map;
}

export function validateStageDependencyGraph(planned: PlannedTargetStage[]): void {
  const byOrder = new Map(planned.map((s) => [s.stageOrder, s]));
  const seen = new Set<number>();
  for (const stage of planned) {
    if (stage.remappedFromStageOrder !== null) {
      const dep = byOrder.get(stage.remappedFromStageOrder);
      if (!dep) {
        throw new SeasonTransitionError(
          'CompetitionCarryForwardFailed',
          `Stage ${stage.name} (order ${stage.stageOrder}) references remapped source stage ${stage.remappedFromStageOrder} that is not present`,
        );
      }
      if (dep.stageOrder >= stage.stageOrder) {
        throw new SeasonTransitionError(
          'CompetitionCarryForwardFailed',
          `Stage ${stage.name} (order ${stage.stageOrder}) depends on a later-or-equal stage (order ${dep.stageOrder}) — cycle or invalid order`,
        );
      }
    }
    // Simple DFS cycle guard: each stage can only depend on strictly-earlier
    // stages, which we already enforced above; mark seen for completeness.
    seen.add(stage.stageOrder);
  }
}

/**
 * Build the full carry-forward plan for the target season from domain-neutral
 * source inputs. The server converts this plan into CompetitionEdition rows in
 * one atomic transaction; the engine never touches Prisma.
 */
export function buildCarryForwardPlan(
  config: SeasonTransitionConfig,
  sourceStartYear: number,
  target: TargetSeasonIdentity,
  sourceEditions: SourceCompetitionEditionInput[],
): PlannedTargetEdition[] {
  const planned: PlannedTargetEdition[] = [];
  const seenCompetitions = new Set<string>();
  for (const edition of sourceEditions) {
    if (seenCompetitions.has(edition.competitionId)) {
      throw new SeasonTransitionError(
        'CompetitionCarryForwardFailed',
        `Duplicate source competition ${edition.competitionId} in carry-forward input`,
      );
    }
    seenCompetitions.add(edition.competitionId);
    const decision = shouldCarryForwardEdition(config, edition);
    if (!decision.carry) continue;

    const rulesSnapshotText = config.competitions.copyDefaultRulesIntoNewEditionSnapshot
      ? edition.defaultRulesJson ?? edition.rulesSnapshotText
      : edition.rulesSnapshotText;
    const rulesHash = stableSeasonTransitionHash({ rulesSnapshotText, competitionId: edition.competitionId, targetOrder: target.order });

    const stages: PlannedTargetStage[] = [];
    if (config.competitions.copyStageTemplates) {
      const orderMap = buildStageOrderMap(edition.stages);
      // Resolve each stage's dependency from its source stageId to the
      // source stageOrder, then remap to the target stageOrder.
      const stageIdToOrder = new Map<string, number>();
      for (const s of edition.stages) stageIdToOrder.set(s.stageId, s.stageOrder);
      for (const stage of edition.stages) {
        const depSourceOrder = stage.sourceStageId ? (stageIdToOrder.get(stage.sourceStageId) ?? null) : null;
        const depTargetOrder = depSourceOrder !== null ? (orderMap.get(depSourceOrder) ?? null) : null;
        stages.push(remapStage(stage, orderMap, depTargetOrder));
      }
      validateStageDependencyGraph(stages);
    }

    const participantCount = config.competitions.copyConfirmedParticipants ? edition.confirmedParticipantCount : 0;
    const displayName = deriveTargetEditionDisplayName(edition, target, sourceStartYear);
    planned.push({
      competitionId: edition.competitionId,
      competitionName: edition.competitionName,
      competitionType: edition.competitionType,
      simulationLevel: edition.simulationLevel,
      displayName,
      isInternational: edition.isInternational,
      initialStatus: config.competitions.newEditionInitialStatus,
      rulesSnapshotText,
      rulesHash,
      stages,
      participantCount,
      selectionReason: decision.reason,
    });
  }
  return planned;
}

/** Build the carry-forward summary shown to the Commissioner. */
export function buildCarryForwardSummary(
  config: SeasonTransitionConfig,
  ownership: { freeAgentCount: number },
  unsignedDraftRights: number,
  scoutingStaleness: { staleReportCount: number; totalReportCount: number },
): CarryForwardSummary {
  return {
    lineups: {
      carryForward: config.lineups.carryForwardClubLineups,
      markedForReview: config.lineups.markForReview,
      copyTactics: config.lineups.copyTactics,
      autoRebuild: config.lineups.autoRebuild,
    },
    scouting: {
      preserved: config.scouting.preserveReports,
      staleReports: scoutingStaleness.staleReportCount,
      totalReports: scoutingStaleness.totalReportCount,
    },
    nationalTeams: {
      createPreparation: config.nationalTeams.createEditionPreparationAutomatically,
      carryLockedRosters: config.nationalTeams.carryLockedTournamentRosters,
    },
    contracts: {
      requireNoOwnershipMismatch: config.contracts.requireNoOwnershipMismatch,
      activateFuture: config.contracts.activateApplicableFutureContracts,
      freeAgents: ownership.freeAgentCount,
    },
    draftRights: { carried: true, unsignedCount: unsignedDraftRights },
    players: { preserved: true },
  };
}
