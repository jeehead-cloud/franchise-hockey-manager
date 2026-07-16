import type { Prisma, PrismaClient } from '@prisma/client';
import {
  aggregateReadiness,
  computeTransitionInputHash,
  type CompletedOffseasonRunInput,
  type OwnershipIntegrityInput,
  type RunningWorldOperationInput,
  type ScoutingStalenessInput,
  type SeasonTransitionConfig,
  type SourceCompetitionEditionInput,
  type SourceSeasonInput,
  type SourceStageInput,
  type TransitionReadiness,
} from '@fhm/engine';
import { SeasonTransitionHttpError } from './season-transition-errors.js';
import { getActiveSeasonTransitionSnapshot, loadSeasonTransitionConfigVersion } from './season-transition-config.js';

type Db = PrismaClient | Prisma.TransactionClient;

// ---------------------------------------------------------------------------
// Source-season + world-state gatherers
// ---------------------------------------------------------------------------

export async function readSourceSeason(db: Db, sourceWorldSeasonId: string): Promise<SourceSeasonInput> {
  const season = await db.worldSeason.findUnique({ where: { id: sourceWorldSeasonId } });
  if (!season) throw new SeasonTransitionHttpError(404, 'WorldSeasonNotFound', 'WorldSeason not found');
  return {
    id: season.id,
    label: season.label,
    startYear: season.startYear,
    endYear: season.endYear,
    status: season.status,
    phase: season.phase,
    updatedAt: season.updatedAt.toISOString(),
  };
}

export async function readCompletedOffseasonRun(db: Db, sourceWorldSeasonId: string): Promise<CompletedOffseasonRunInput | null> {
  const completed = await db.offseasonRun.findFirst({
    where: { worldSeasonId: sourceWorldSeasonId, status: 'COMPLETED' },
    orderBy: { completedAt: 'desc' },
    select: { id: true, status: true, resultHash: true, completedAt: true },
  });
  return completed ? { ...completed, status: completed.status, completedAt: completed.completedAt?.toISOString() ?? null } : null;
}

export async function readOffseasonRunsForSeason(db: Db, sourceWorldSeasonId: string) {
  const rows = await db.offseasonRun.findMany({
    where: { worldSeasonId: sourceWorldSeasonId },
    select: { id: true, status: true },
  });
  return rows.map((r) => ({ id: r.id, status: r.status }));
}

export async function readSourceEditions(db: Db, sourceWorldSeasonId: string): Promise<SourceCompetitionEditionInput[]> {
  const editions = await db.competitionEdition.findMany({
    where: { worldSeasonId: sourceWorldSeasonId },
    include: {
      competition: true,
      stages: { orderBy: { stageOrder: 'asc' } },
      participants: { where: { status: 'CONFIRMED' }, select: { id: true } },
      archives: { where: { isCurrent: true }, select: { id: true } },
    },
    orderBy: { competitionId: 'asc' },
  });
  return editions.map((e) => {
    const isInternational = e.competition.type === 'INTERNATIONAL_TOURNAMENT';
    const stages: SourceStageInput[] = e.stages.map((s) => ({
      stageId: s.id,
      name: s.name,
      stageType: s.stageType,
      stageOrder: s.stageOrder,
      configText: s.configText,
      configHash: s.configHash,
      participantSource: s.participantSource,
      sourceStageId: s.sourceStageId,
      expectedQualifierCount: s.expectedQualifierCount,
    }));
    return {
      editionId: e.id,
      competitionId: e.competitionId,
      competitionName: e.competition.name,
      competitionType: e.competition.type,
      simulationLevel: e.competition.simulationLevel,
      displayName: e.displayName,
      status: e.status,
      isInternational,
      // F31 competition recurrence: stored metadata is not yet modelled, so we
      // treat international competitions as non-recurring by default (manual)
      // and domestic as implicitly recurring when a source edition exists.
      recurring: null,
      rulesSnapshotText: e.rulesSnapshotText,
      rulesHash: e.rulesHash,
      defaultRulesJson: e.competition.defaultRulesJson,
      stages,
      confirmedParticipantCount: e.participants.length,
      archived: e.archives.length > 0 || e.status === 'ARCHIVED',
    };
  });
}

export async function readOwnershipIntegrity(db: Db): Promise<OwnershipIntegrityInput> {
  const dupRows = await db.playerContract.groupBy({
    by: ['playerId'],
    where: { status: 'ACTIVE' },
    _count: { id: true },
    having: { id: { _count: { gt: 1 } } },
  });
  const activeContracts = await db.playerContract.findMany({
    where: { status: 'ACTIVE' },
    select: { playerId: true, teamId: true },
  });
  const byPlayer = new Map<string, string>();
  for (const c of activeContracts) byPlayer.set(c.playerId, c.teamId);
  const playerIds = [...byPlayer.keys()];
  const players = await db.player.findMany({ where: { id: { in: playerIds } }, select: { id: true, currentTeamId: true } });
  let ownershipMismatches = 0;
  for (const p of players) {
    const expected = byPlayer.get(p.id);
    if (expected && p.currentTeamId !== expected) ownershipMismatches += 1;
  }
  const retiredInLineup = await db.lineupAssignment.count({ where: { player: { rosterStatus: 'RETIRED' } } });
  // Lineup ownership mismatches (slot references a player no longer on the team).
  const assignments = await db.lineupAssignment.findMany({
    where: { player: { currentTeamId: { not: null } } },
    select: { playerId: true, lineup: { select: { teamId: true } } },
  });
  const assignmentPlayers = await db.player.findMany({
    where: { id: { in: [...new Set(assignments.map((a) => a.playerId))] } },
    select: { id: true, currentTeamId: true },
  });
  const currentTeam = new Map<string, string | null>();
  for (const p of assignmentPlayers) currentTeam.set(p.id, p.currentTeamId);
  let lineupOwnershipMismatches = 0;
  for (const a of assignments) {
    const expected = currentTeam.get(a.playerId);
    if (expected && expected !== a.lineup.teamId) lineupOwnershipMismatches += 1;
  }
  const freeAgentCount = await db.player.count({
    where: { currentTeamId: null, rosterStatus: 'ACTIVE', contracts: { none: { status: 'ACTIVE' } } },
  });
  const unsignedDraftRights = await db.playerDraftRight.count({ where: { status: 'ACTIVE' } });
  return {
    duplicateActiveContracts: dupRows.length,
    ownershipMismatches,
    freeAgentCount,
    unsignedDraftRights,
    retiredPlayersInActiveLineups: retiredInLineup,
    lineupOwnershipMismatches,
  };
}

export async function readRunningOperations(db: Db, sourceWorldSeasonId: string): Promise<RunningWorldOperationInput> {
  const [
    openOffseasonRun,
    preparedContractExpirationRun,
    preparedOrRunningDevelopmentRun,
    preparedOrRunningYouthRun,
    openDraftEvent,
    activeCompetitionEdition,
  ] = await Promise.all([
    db.offseasonRun.findFirst({ where: { worldSeasonId: sourceWorldSeasonId, status: { in: ['PLANNED', 'READY', 'IN_PROGRESS', 'BLOCKED'] } } }),
    db.contractExpirationRun.findFirst({ where: { worldSeasonId: sourceWorldSeasonId, status: 'PREPARED' } }),
    db.playerDevelopmentRun.findFirst({ where: { worldSeasonId: sourceWorldSeasonId, status: { in: ['PREPARED', 'RUNNING'] } } }),
    db.youthGenerationRun.findFirst({ where: { worldSeasonId: sourceWorldSeasonId, status: { in: ['PREPARED', 'RUNNING'] } } }),
    db.draftEvent.findFirst({ where: { worldSeasonId: sourceWorldSeasonId, status: { in: ['PLANNED', 'PREPARING', 'READY', 'IN_PROGRESS'] } } }),
    db.competitionEdition.findFirst({ where: { worldSeasonId: sourceWorldSeasonId, status: { in: ['ACTIVE', 'PREPARING', 'READY'] } } }),
  ]);
  return {
    openOffseasonRun: openOffseasonRun !== null,
    preparedContractExpirationRun: preparedContractExpirationRun !== null,
    preparedOrRunningDevelopmentRun: preparedOrRunningDevelopmentRun !== null,
    preparedOrRunningYouthRun: preparedOrRunningYouthRun !== null,
    openDraftEvent: openDraftEvent !== null,
    activeCompetitionEdition: activeCompetitionEdition !== null,
  };
}

export async function readScoutingStaleness(db: Db): Promise<ScoutingStalenessInput> {
  // F26 staleness is computed dynamically against the player-state hash. F31
  // never rewrites historical reports; it reports an advisory count only. The
  // precise stale-vs-fresh classification belongs to F26's read path; here we
  // expose the total report count and approximate the stale count as the
  // number of *current* report versions (the highest version per team/player),
  // which is the upper bound of reports that could be stale. The readiness UI
  // surfaces this as a warning, not a blocker.
  const totalReportCount = await db.teamScoutingReport.count();
  // Current reports: highest versionNumber per (teamId, playerId). SQLite
  // doesn't make this trivial in a single Prisma query, so we approximate by
  // counting distinct (teamId, playerId) pairs that have at least one report.
  const distinctPairs = await db.teamScoutingReport.groupBy({
    by: ['teamId', 'playerId'],
    _count: { id: true },
  });
  const staleReportCount = distinctPairs.length;
  return { totalReportCount, staleReportCount };
}

export async function readExistingTransitionsForSource(db: Db, sourceWorldSeasonId: string) {
  const rows = await db.seasonTransitionRun.findMany({
    where: { sourceWorldSeasonId },
    select: { id: true, status: true, targetWorldSeasonId: true, inputHash: true },
  });
  return rows.map((r) => ({
    id: r.id,
    status: r.status as 'PREPARED' | 'RUNNING' | 'COMPLETED' | 'FAILED' | 'CANCELLED',
    targetWorldSeasonId: r.targetWorldSeasonId,
    inputHash: r.inputHash,
  }));
}

export async function readExistingSeasonOrders(db: Db) {
  const seasons = await db.worldSeason.findMany({ select: { startYear: true } });
  return seasons.map((s) => s.startYear);
}

export async function readCurrentSeasonId(db: Db): Promise<string | null> {
  const active = await db.worldSeason.findFirst({ where: { status: 'ACTIVE' }, select: { id: true } });
  return active?.id ?? null;
}

// ---------------------------------------------------------------------------
// Top-level preview / readiness assembly
// ---------------------------------------------------------------------------

export interface PreviewOptions {
  configVersionId?: string;
  targetDisplayNameOverride?: string | null;
}

export async function buildPreviewInput(db: Db, sourceWorldSeasonId: string, options: PreviewOptions) {
  const configSnapshot = options.configVersionId
    ? await loadSeasonTransitionConfigVersion(db, options.configVersionId)
    : await getActiveSeasonTransitionSnapshot(db);
  if (!configSnapshot) {
    throw new SeasonTransitionHttpError(404, 'SeasonTransitionConfigurationNotFound', 'Configuration version not found');
  }
  const config = configSnapshot.config as SeasonTransitionConfig;
  const configHash = configSnapshot.version.configHash;

  const [sourceSeason, completedOffseasonRun, offseasonRunsForSeason, sourceEditions, ownership, runningOperations, scoutingStaleness, existingTransitionsForSource, existingSeasonOrders, currentSeasonId] = await Promise.all([
    readSourceSeason(db, sourceWorldSeasonId),
    readCompletedOffseasonRun(db, sourceWorldSeasonId),
    readOffseasonRunsForSeason(db, sourceWorldSeasonId),
    readSourceEditions(db, sourceWorldSeasonId),
    readOwnershipIntegrity(db),
    readRunningOperations(db, sourceWorldSeasonId),
    readScoutingStaleness(db),
    readExistingTransitionsForSource(db, sourceWorldSeasonId),
    readExistingSeasonOrders(db),
    readCurrentSeasonId(db),
  ]);

  const override = options.targetDisplayNameOverride ?? null;
  const inputHash = computeTransitionInputHash({
    configHash,
    sourceSeason,
    completedOffseasonRun,
    offseasonRunsForSeason,
    sourceEditions,
    ownership,
    runningOperations,
    scoutingStaleness,
    targetDisplayNameOverride: override,
    existingTransitionsForSource,
    existingSeasonOrders,
    currentSeasonId,
  });

  const readiness = aggregateReadiness({
    config,
    sourceSeason,
    completedOffseasonRun,
    offseasonRunsForSeason,
    sourceEditions,
    ownership,
    runningOperations,
    scoutingStaleness,
    targetDisplayNameOverride: override,
    existingTransitionsForSource,
    existingSeasonOrders,
    currentSeasonId,
  });

  return { config, configHash, configVersion: configSnapshot.version, inputHash, readiness };
}

export type PreviewResult = Awaited<ReturnType<typeof buildPreviewInput>>;

export async function computePreview(db: PrismaClient, sourceWorldSeasonId: string, options: PreviewOptions): Promise<PreviewResult> {
  return buildPreviewInput(db, sourceWorldSeasonId, options);
}

export async function computeReadinessForRun(runId: string, db: PrismaClient): Promise<TransitionReadiness> {
  const run = await db.seasonTransitionRun.findUnique({ where: { id: runId } });
  if (!run) throw new SeasonTransitionHttpError(404, 'SeasonTransitionRunNotFound', 'Season transition run not found');
  // The override is part of the frozen input snapshot. We restore it from the
  // stored snapshot to reproduce the prepared readiness deterministically.
  let override: string | null = null;
  try {
    const parsed = JSON.parse(run.inputSnapshotText) as { targetDisplayNameOverride?: string | null };
    override = parsed.targetDisplayNameOverride ?? null;
  } catch {
    override = null;
  }
  const { readiness } = await buildPreviewInput(db, run.sourceWorldSeasonId, {
    configVersionId: run.configVersionId,
    targetDisplayNameOverride: override,
  });
  return readiness;
}
