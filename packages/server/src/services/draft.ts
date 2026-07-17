import type { CommissionerAuditSource, Prisma } from '@prisma/client';
import {
  applyLotteryToOrder,
  buildDraftBoard,
  buildDraftOrder,
  buildEligibilityClass,
  defaultAutoPickWeights,
  DraftError,
  evaluateProgression,
  hashDraftResult,
  hashEligibilityClass,
  reconcileDraft,
  runDraftLottery,
  suggestAutoPick,
  validateDraftConfig,
  type BoardProspectEstimate,
  type DraftConfig,
  type DraftOrderTeamInput,
  type EligibilityPlayerInput,
} from '@fhm/engine';
import { prisma } from '../db/client.js';
import { createSqliteSafetyBackup } from './sqlite-backup.js';
import { getActiveDraftSnapshot } from './draft-config.js';

export class DraftHttpError extends Error {
  statusCode: number;
  code: string;
  details?: unknown;
  constructor(statusCode: number, code: string, message: string, details?: unknown) {
    super(message);
    this.name = code;
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
  }
}

function wrapEngineError(err: unknown): never {
  if (err instanceof DraftHttpError) throw err;
  if (err instanceof DraftError) {
    const status =
      err.code === 'InvalidLotteryConfiguration' ||
      err.code === 'InvalidDraftInput' ||
      err.code === 'DraftReconciliationFailed' ||
      err.code === 'DraftOrderUnavailable'
        ? 422
        : 400;
    throw new DraftHttpError(status, err.code, err.message, err.details);
  }
  throw err;
}

const json = <T>(value: string): T => JSON.parse(value) as T;
const iso = (value: Date | null) => value?.toISOString() ?? null;

async function writeDraftAudit(
  tx: Prisma.TransactionClient,
  entityId: string,
  action:
    | 'DRAFT_CONFIG_CREATED'
    | 'DRAFT_CONFIG_VERSION_CREATED'
    | 'DRAFT_CONFIG_ACTIVATED'
    | 'DRAFT_EVENT_CREATED'
    | 'DRAFT_ELIGIBILITY_GENERATED'
    | 'DRAFT_ORDER_GENERATED'
    | 'DRAFT_LOTTERY_RUN'
    | 'DRAFT_EVENT_STARTED'
    | 'DRAFT_PICK_MADE'
    | 'DRAFT_EVENT_COMPLETED'
    | 'DRAFT_EVENT_CANCELLED',
  reason: string,
  before: unknown,
  after: unknown,
  changedFields: string[],
  source: CommissionerAuditSource,
  entityType:
    | 'DRAFT_CONFIG'
    | 'DRAFT_CONFIG_VERSION'
    | 'DRAFT_EVENT'
    | 'DRAFT_ORDER'
    | 'DRAFT_LOTTERY'
    | 'DRAFT_PICK'
    | 'PLAYER_DRAFT_RIGHT' = 'DRAFT_EVENT',
) {
  await tx.commissionerAuditLog.create({
    data: {
      entityType,
      entityId,
      action,
      reason,
      beforeJson: JSON.stringify(before),
      afterJson: JSON.stringify(after),
      changedFieldsJson: JSON.stringify(changedFields),
      source,
    },
  });
}

const playerInclude = { nationality: true, skaterAttributes: true, goalieAttributes: true } as const;

function snapshotName(p: { firstName: string; lastName: string }): string {
  return `${p.firstName} ${p.lastName}`;
}

/** Build the engine eligibility input from live Player rows (no truth values). */
function toEligibilityInput(p: {
  id: string;
  firstName: string;
  lastName: string;
  dateOfBirth: Date;
  rosterStatus: string;
  sourceType: string;
  currentTeamId: string | null;
}): EligibilityPlayerInput {
  // alreadyDrafted: any ACTIVE PlayerDraftRight on this player.
  return {
    playerId: p.id,
    displayName: snapshotName(p),
    dateOfBirth: p.dateOfBirth.toISOString().slice(0, 10),
    lifecycleStatus: p.rosterStatus,
    sourceType: p.sourceType,
    currentTeamId: p.currentTeamId,
    alreadyDrafted: false, // resolved per-player below in the caller
  };
}

// ---------------------------------------------------------------------------
// Read APIs (public)
// ---------------------------------------------------------------------------

export async function listDrafts(worldSeasonId?: string) {
  const where = worldSeasonId ? { worldSeasonId } : {};
  const rows = await prisma.draftEvent.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    include: { worldSeason: true, presetVersion: { include: { preset: true } } },
  });
  return { items: rows.map(mapDraftEventRow) };
}

export async function getDraft(draftEventId: string) {
  const row = await prisma.draftEvent.findUnique({
    where: { id: draftEventId },
    include: { worldSeason: true, presetVersion: { include: { preset: true } } },
  });
  if (!row) return null;
  return mapDraftEventRow(row);
}

export async function getDraftEligibility(draftEventId: string) {
  const event = await prisma.draftEvent.findUnique({ where: { id: draftEventId } });
  if (!event) return null;
  const rows = await prisma.draftEligiblePlayer.findMany({
    where: { draftEventId },
    orderBy: [{ status: 'asc' }, { playerNameSnapshot: 'asc' }],
  });
  return { items: rows.map(mapEligibleRow) };
}

export async function getDraftOrder(draftEventId: string) {
  const event = await prisma.draftEvent.findUnique({ where: { id: draftEventId } });
  if (!event) return null;
  const [teams, picks] = await Promise.all([
    prisma.draftTeamEntry.findMany({ where: { draftEventId }, orderBy: { finalOrderPosition: 'asc' } }),
    prisma.draftPick.findMany({ where: { draftEventId }, orderBy: { overallPick: 'asc' } }),
  ]);
  return {
    teams: teams.map((t) => ({
      teamId: t.teamId,
      teamName: t.teamNameSnapshot,
      originalOrderPosition: t.originalOrderPosition,
      lotteryOrderPosition: t.lotteryOrderPosition,
      finalOrderPosition: t.finalOrderPosition,
      sourceStandingRank: t.sourceStandingRank,
    })),
    picks: picks.map((p) => ({
      overallPick: p.overallPick,
      roundNumber: p.roundNumber,
      pickInRound: p.pickInRound,
      teamId: p.currentTeamId,
      teamName: p.teamNameSnapshot,
      status: p.status,
      selectedPlayerId: p.selectedPlayerId,
      selectedPlayerName: p.selectedPlayerNameSnapshot,
      selectionSource: p.selectionSource,
    })),
  };
}

export async function getDraftPicks(draftEventId: string) {
  const event = await prisma.draftEvent.findUnique({ where: { id: draftEventId } });
  if (!event) return null;
  const rows = await prisma.draftPick.findMany({
    where: { draftEventId },
    orderBy: { overallPick: 'asc' },
  });
  return { items: rows.map(mapPickRow) };
}

export async function getDraftResults(draftEventId: string) {
  const event = await prisma.draftEvent.findUnique({ where: { id: draftEventId } });
  if (!event) return null;
  const [picks, rights] = await Promise.all([
    prisma.draftPick.findMany({ where: { draftEventId, status: 'COMPLETED' }, orderBy: { overallPick: 'asc' } }),
    prisma.playerDraftRight.findMany({ where: { draftEventId }, orderBy: { acquiredAt: 'asc' } }),
  ]);
  const rightsByPick = new Map(rights.map((r) => [r.draftPickId, r]));
  return {
    items: picks.map((p) => ({
      overallPick: p.overallPick,
      roundNumber: p.roundNumber,
      teamId: p.currentTeamId,
      teamName: p.teamNameSnapshot,
      selectedPlayerId: p.selectedPlayerId,
      selectedPlayerName: p.selectedPlayerNameSnapshot,
      selectionSource: p.selectionSource,
      rightStatus: rightsByPick.get(p.id)?.status ?? null,
    })),
    summary: {
      totalSelections: picks.length,
      resultHash: event.resultHash,
      completedAt: iso(event.completedAt),
    },
  };
}

export async function getDraftLottery(draftEventId: string) {
  const event = await prisma.draftEvent.findUnique({ where: { id: draftEventId } });
  if (!event) return null;
  const draws = await prisma.draftLotteryDraw.findMany({
    where: { draftEventId },
    orderBy: { drawNumber: 'asc' },
  });
  return {
    enabled: draws.length > 0,
    lotteryHash: event.lotteryHash,
    draws: draws.map((d) => ({
      drawNumber: d.drawNumber,
      winningTeamId: d.winningTeamId,
      originalPosition: d.originalPosition,
      newPosition: d.newPosition,
      weightSnapshot: d.weightSnapshot,
      seedFragment: d.seedFragment,
      drawHash: d.drawHash,
    })),
  };
}

// ---------------------------------------------------------------------------
// Team draft board (team-private — only the requesting team's estimates)
// ---------------------------------------------------------------------------

/** Build a BoardProspectEstimate[] for one team from its F26 scouting reports. */
async function loadTeamEstimates(teamId: string, eligiblePlayerIds: Set<string>): Promise<BoardProspectEstimate[]> {
  const knowledge = await prisma.teamProspectKnowledge.findMany({
    where: { teamId, playerId: { in: [...eligiblePlayerIds] } },
    include: { reports: { orderBy: { versionNumber: 'desc' }, take: 1 } },
  });
  const watchlist = await prisma.teamProspectWatchlistEntry.findMany({ where: { teamId } });
  const watchByPlayer = new Map(watchlist.map((w) => [w.playerId, w.manualPriority]));
  const estimates: BoardProspectEstimate[] = [];
  for (const player of eligiblePlayerIds) {
    const k = knowledge.find((x) => x.playerId === player);
    const report = k?.reports[0];
    if (report) {
      const r = json<{
        currentAbility: { estimate: number | null };
        potential: { estimate: number | null };
        confidence: number;
      }>(report.reportJson);
      estimates.push({
        playerId: player,
        estimatedCurrentAbility: r.currentAbility.estimate,
        estimatedPotential: r.potential.estimate,
        projectedRole: null,
        confidence: r.confidence,
        stale: false,
        watchlistPriority: watchByPlayer.get(player) ?? 0,
        manualRank: null,
      });
    } else {
      // Unscouted: still available for manual selection, ranked as Unknown/risk.
      estimates.push({
        playerId: player,
        estimatedCurrentAbility: null,
        estimatedPotential: null,
        projectedRole: null,
        confidence: 0,
        stale: true,
        watchlistPriority: watchByPlayer.get(player) ?? 0,
        manualRank: null,
      });
    }
  }
  return estimates;
}

export async function getTeamDraftBoard(draftEventId: string, teamId: string) {
  const [event, team] = await Promise.all([
    prisma.draftEvent.findUnique({ where: { id: draftEventId } }),
    prisma.team.findUnique({ where: { id: teamId }, select: { id: true, name: true, teamType: true } }),
  ]);
  if (!event) throw new DraftHttpError(404, 'DraftEventNotFound', 'Draft event not found');
  if (!team) throw new DraftHttpError(404, 'TeamNotFound', 'Team not found');
  if (team.teamType !== 'CLUB') throw new DraftHttpError(422, 'ClubTeamRequired', 'Draft boards are available only to club teams');

  const eligible = await prisma.draftEligiblePlayer.findMany({ where: { draftEventId } });
  const eligibleIds = new Set(eligible.map((e) => e.playerId));
  const draftedIds = new Set(eligible.filter((e) => e.status === 'DRAFTED').map((e) => e.playerId));

  const estimates = await loadTeamEstimates(teamId, eligibleIds);
  const snapshot = buildDraftBoard(teamId, estimates, { draftedPlayerIds: draftedIds });

  // If the event has a frozen board snapshot for this team, return that hash too.
  const frozen = await prisma.draftTeamBoardSnapshot.findUnique({
    where: { draftEventId_teamId: { draftEventId, teamId } },
  });
  return {
    teamId,
    draftEventId,
    entries: snapshot.entries,
    boardHash: snapshot.boardHash,
    frozenBoardHash: frozen?.boardHash ?? null,
    frozenAt: frozen ? iso(frozen.createdAt) : null,
    // No true potential / current ability / role / quality tier exposed.
  };
}

export async function getTeamDraftResults(draftEventId: string, teamId: string) {
  const [event, team] = await Promise.all([
    prisma.draftEvent.findUnique({ where: { id: draftEventId }, select: { id: true } }),
    prisma.team.findUnique({ where: { id: teamId }, select: { id: true, teamType: true } }),
  ]);
  if (!event) throw new DraftHttpError(404, 'DraftEventNotFound', 'Draft event not found');
  if (!team) throw new DraftHttpError(404, 'TeamNotFound', 'Team not found');
  const picks = await prisma.draftPick.findMany({
    where: { draftEventId, currentTeamId: teamId, status: 'COMPLETED' },
    orderBy: { overallPick: 'asc' },
  });
  const rights = await prisma.playerDraftRight.findMany({
    where: { draftEventId, teamId },
    orderBy: { acquiredAt: 'asc' },
  });
  return {
    picks: picks.map((p) => ({
      overallPick: p.overallPick,
      roundNumber: p.roundNumber,
      selectedPlayerId: p.selectedPlayerId,
      selectedPlayerName: p.selectedPlayerNameSnapshot,
      selectionSource: p.selectionSource,
    })),
    rights: rights.map((r) => ({
      id: r.id,
      playerId: r.playerId,
      playerName: r.playerNameSnapshot,
      status: r.status,
      acquiredAt: iso(r.acquiredAt),
    })),
  };
}

export async function getPlayerDraftHistory(playerId: string) {
  const rights = await prisma.playerDraftRight.findMany({
    where: { playerId },
    include: { draftEvent: { include: { worldSeason: true } }, draftPick: true },
    orderBy: { acquiredAt: 'desc' },
  });
  return {
    items: rights.map((r) => ({
      draftEventId: r.draftEventId,
      seasonLabel: r.draftEvent.worldSeason.label,
      roundNumber: r.draftPick.roundNumber,
      overallPick: r.draftPick.overallPick,
      teamId: r.teamId,
      teamName: r.teamNameSnapshot,
      rightsStatus: r.status,
      unsigned: true,
    })),
  };
}

export async function getTeamDraftRights(teamId: string) {
  const rights = await prisma.playerDraftRight.findMany({
    where: { teamId },
    include: { draftEvent: { include: { worldSeason: true } } },
    orderBy: { acquiredAt: 'desc' },
  });
  return {
    items: rights.map((r) => ({
      id: r.id,
      playerId: r.playerId,
      playerName: r.playerNameSnapshot,
      draftEventId: r.draftEventId,
      seasonLabel: r.draftEvent.worldSeason.label,
      status: r.status,
      acquiredAt: iso(r.acquiredAt),
    })),
  };
}

export async function getDraftStatus(worldSeasonId?: string) {
  const season = worldSeasonId
    ? await prisma.worldSeason.findUnique({ where: { id: worldSeasonId } })
    : await prisma.worldSeason.findFirst({ orderBy: { createdAt: 'asc' } });
  if (!season) return null;
  const event = await prisma.draftEvent.findFirst({
    where: { worldSeasonId: season.id },
    orderBy: { createdAt: 'desc' },
    include: { presetVersion: { include: { preset: true } } },
  });
  const latestSelections = event
    ? await prisma.draftPick.findMany({
        where: { draftEventId: event.id, status: 'COMPLETED' },
        orderBy: { overallPick: 'desc' },
        take: 5,
      })
    : [];
  return {
    worldSeason: { id: season.id, label: season.label, phase: season.phase, status: season.status },
    draftEvent: event
      ? {
          id: event.id,
          name: event.name,
          status: event.status,
          rounds: event.totalRounds,
          totalPicks: event.totalPicks,
          currentOverallPick: event.currentOverallPick,
          completedPicks: latestSelections.length,
          presetName: event.presetVersion.preset.name,
        }
      : null,
    latestSelections: latestSelections.map((p) => ({
      overallPick: p.overallPick,
      teamName: p.teamNameSnapshot,
      playerName: p.selectedPlayerNameSnapshot,
    })),
  };
}

// ---------------------------------------------------------------------------
// Commissioner lifecycle APIs
// ---------------------------------------------------------------------------

export async function createDraftEvent(
  input: {
    worldSeasonId: string;
    name: string;
    presetVersionId?: string;
    baseSeed: string;
    reason: string;
  },
  source: CommissionerAuditSource,
) {
  const season = await prisma.worldSeason.findUnique({ where: { id: input.worldSeasonId } });
  if (!season) throw new DraftHttpError(404, 'WorldSeasonNotFound', 'WorldSeason not found');
  const existing = await prisma.draftEvent.findFirst({ where: { worldSeasonId: season.id, status: { in: ['PLANNED', 'PREPARING', 'READY', 'IN_PROGRESS'] } } });
  if (existing) throw new DraftHttpError(409, 'DraftAlreadyExistsForSeason', 'An active draft event already exists for this WorldSeason', { draftEventId: existing.id });

  const snapshot = input.presetVersionId
    ? await resolveVersion(input.presetVersionId)
    : await getActiveDraftSnapshot();

  return prisma.$transaction(async (tx) => {
    const row = await tx.draftEvent.create({
      data: {
        worldSeasonId: season.id,
        name: input.name,
        status: 'PLANNED',
        presetVersionId: snapshot.version.id,
        configHash: snapshot.version.configHash,
        cutoffDate: snapshot.config.eligibility.cutoffDate,
        baseSeed: input.baseSeed,
        totalRounds: snapshot.config.rounds,
      },
    });
    await writeDraftAudit(tx, row.id, 'DRAFT_EVENT_CREATED', input.reason, null, { draftEventId: row.id, name: row.name, presetVersionId: row.presetVersionId }, ['event'], source);
    return mapDraftEventRow(row);
  });
}

async function resolveVersion(versionId: string) {
  const version = await prisma.draftPresetVersion.findUnique({
    where: { id: versionId },
    include: { preset: true },
  });
  if (!version) throw new DraftHttpError(404, 'DraftConfigVersionNotFound', 'Draft configuration version not found');
  return {
    preset: { id: version.preset.id, name: version.preset.name },
    version: { id: version.id, versionNumber: version.versionNumber, schemaVersion: version.schemaVersion, configHash: version.configHash },
    config: validateDraftConfig(JSON.parse(version.configJson)),
  };
}

export async function generateEligibility(
  draftEventId: string,
  reason: string,
  source: CommissionerAuditSource,
) {
  const event = await prisma.draftEvent.findUnique({ where: { id: draftEventId }, include: { presetVersion: true } });
  if (!event) throw new DraftHttpError(404, 'DraftEventNotFound', 'Draft event not found');
  if (event.status === 'IN_PROGRESS' || event.status === 'COMPLETED') {
    throw new DraftHttpError(409, 'DraftEventNotEditable', `Draft event in status ${event.status} cannot regenerate eligibility`);
  }
  const config = validateDraftConfig(JSON.parse(event.presetVersion.configJson));

  // Load candidate prospects (PROSPECT lifecycle) and resolve alreadyDrafted.
  const candidates = await prisma.player.findMany({
    where: { rosterStatus: 'PROSPECT' },
    include: playerInclude,
  });
  const activeRights = await prisma.playerDraftRight.findMany({ where: { status: 'ACTIVE', playerId: { in: candidates.map((c) => c.id) } }, select: { playerId: true } });
  const draftedSet = new Set(activeRights.map((r) => r.playerId));

  const inputs: EligibilityPlayerInput[] = candidates.map((c) => ({
    playerId: c.id,
    displayName: snapshotName(c),
    dateOfBirth: c.dateOfBirth.toISOString().slice(0, 10),
    lifecycleStatus: c.rosterStatus,
    sourceType: c.sourceType,
    currentTeamId: c.currentTeamId,
    alreadyDrafted: draftedSet.has(c.id),
  }));

  const { eligible, rejected } = buildEligibilityClass(config, inputs, {
    countrySnapshot: (id) => candidates.find((c) => c.id === id)?.nationality?.code ?? null,
    positionSnapshot: (id) => candidates.find((c) => c.id === id)?.primaryPosition ?? null,
  });

  const eligibilityHash = hashEligibilityClass(eligible);
  return prisma.$transaction(async (tx) => {
    await tx.draftEligiblePlayer.deleteMany({ where: { draftEventId } });
    for (const e of eligible) {
      await tx.draftEligiblePlayer.create({
        data: {
          draftEventId,
          playerId: e.playerId,
          playerNameSnapshot: e.displayName,
          birthDateSnapshot: e.dateOfBirth,
          ageOnCutoffDate: e.ageOnCutoffDate,
          countrySnapshot: e.countrySnapshot,
          positionSnapshot: e.positionSnapshot,
          lifecycleSnapshot: e.lifecycleStatus,
          sourceTypeSnapshot: e.sourceType,
          eligibilityHash: e.eligibilityHash,
          status: 'AVAILABLE',
        },
      });
    }
    await tx.draftEvent.update({ where: { id: draftEventId }, data: { eligibilityHash, status: 'PREPARING' } });
    await writeDraftAudit(tx, draftEventId, 'DRAFT_ELIGIBILITY_GENERATED', reason, null, { eligibleCount: eligible.length, rejectedCount: rejected.length, eligibilityHash }, ['eligibility'], source);
    return { eligibleCount: eligible.length, rejectedCount: rejected.length, eligibilityHash };
  });
}

export async function generateOrder(
  draftEventId: string,
  input: {
    source?: 'REVERSE_STANDINGS' | 'MANUAL';
    sourceCompetitionStageId?: string;
    participatingTeamIds?: string[];
    manualOrder?: string[];
    reason: string;
  },
  source: CommissionerAuditSource,
) {
  const event = await prisma.draftEvent.findUnique({ where: { id: draftEventId }, include: { presetVersion: true } });
  if (!event) throw new DraftHttpError(404, 'DraftEventNotFound', 'Draft event not found');
  if (event.status === 'IN_PROGRESS' || event.status === 'COMPLETED') {
    throw new DraftHttpError(409, 'DraftEventNotEditable', `Draft event in status ${event.status} cannot regenerate order`);
  }
  const config = validateDraftConfig(JSON.parse(event.presetVersion.configJson));
  const orderSource = input.source ?? config.order.source;

  let teamInputs: DraftOrderTeamInput[];
  if (orderSource === 'MANUAL') {
    const order = input.manualOrder ?? input.participatingTeamIds ?? [];
    if (order.length === 0) throw new DraftHttpError(422, 'DraftOrderUnavailable', 'MANUAL order requires manualOrder or participatingTeamIds');
    const teams = await prisma.team.findMany({ where: { id: { in: order }, teamType: 'CLUB' } });
    const byId = new Map(teams.map((t) => [t.id, t]));
    teamInputs = order.map((id, idx) => {
      const t = byId.get(id);
      if (!t) throw new DraftHttpError(404, 'TeamNotFound', `Team ${id} not found or not a club`);
      return { teamId: t.id, teamName: t.name, standingRank: idx + 1 };
    });
  } else {
    // REVERSE_STANDINGS: derive final standing ranks from a completed stage, or fall back to supplied order.
    const participating = input.participatingTeamIds ?? (input.sourceCompetitionStageId ? await teamsFromStage(input.sourceCompetitionStageId) : []);
    if (participating.length === 0) throw new DraftHttpError(422, 'DraftOrderUnavailable', 'REVERSE_STANDINGS order requires sourceCompetitionStageId or participatingTeamIds');
    const ranks = input.sourceCompetitionStageId ? await ranksFromStage(input.sourceCompetitionStageId, participating) : new Map<string, number>();
    const teams = await prisma.team.findMany({ where: { id: { in: participating }, teamType: 'CLUB' } });
    const byId = new Map(teams.map((t) => [t.id, t]));
    teamInputs = participating.map((id) => {
      const t = byId.get(id);
      if (!t) throw new DraftHttpError(404, 'TeamNotFound', `Team ${id} not found or not a club`);
      return { teamId: t.id, teamName: t.name, standingRank: ranks.get(id) ?? null };
    });
  }

  const order = buildDraftOrder({ ...config, order: { ...config.order, source: orderSource } }, teamInputs);

  return prisma.$transaction(async (tx) => {
    await tx.draftTeamEntry.deleteMany({ where: { draftEventId } });
    await tx.draftPick.deleteMany({ where: { draftEventId } });
    // Team entries: original order = first-round team order before any lottery.
    const firstRoundTeams = order.picks.filter((p) => p.roundNumber === 1);
    for (let i = 0; i < firstRoundTeams.length; i += 1) {
      const slot = firstRoundTeams[i]!;
      await tx.draftTeamEntry.create({
        data: {
          draftEventId,
          teamId: slot.teamId,
          teamNameSnapshot: slot.teamName,
          originalOrderPosition: i + 1,
          finalOrderPosition: i + 1,
          sourceStandingRank: teamInputs.find((t) => t.teamId === slot.teamId)?.standingRank ?? null,
        },
      });
    }
    for (const pick of order.picks) {
      await tx.draftPick.create({
        data: {
          draftEventId,
          roundNumber: pick.roundNumber,
          pickInRound: pick.pickInRound,
          overallPick: pick.overallPick,
          originalTeamId: pick.teamId,
          currentTeamId: pick.teamId,
          teamNameSnapshot: pick.teamName,
          status: 'PENDING',
        },
      });
    }
    await tx.draftEvent.update({ where: { id: draftEventId }, data: { initialOrderHash: order.orderHash, finalOrderHash: order.orderHash, status: 'PREPARING' } });
    await writeDraftAudit(tx, draftEventId, 'DRAFT_ORDER_GENERATED', input.reason, null, { orderHash: order.orderHash, teamCount: firstRoundTeams.length, totalPicks: order.picks.length }, ['order'], source, 'DRAFT_ORDER');
    return { orderHash: order.orderHash, teamCount: firstRoundTeams.length, totalPicks: order.picks.length };
  });
}

async function teamsFromStage(stageId: string): Promise<string[]> {
  const standings = await prisma.competitionStageStanding.findMany({ where: { competitionStageId: stageId }, orderBy: { rank: 'asc' } });
  return standings.map((s) => s.teamId);
}

async function ranksFromStage(stageId: string, teamIds: string[]): Promise<Map<string, number>> {
  const standings = await prisma.competitionStageStanding.findMany({ where: { competitionStageId: stageId, teamId: { in: teamIds } } });
  return new Map(standings.map((s) => [s.teamId, s.rank]));
}

export async function runLottery(
  draftEventId: string,
  reason: string,
  source: CommissionerAuditSource,
) {
  const event = await prisma.draftEvent.findUnique({ where: { id: draftEventId }, include: { presetVersion: true } });
  if (!event) throw new DraftHttpError(404, 'DraftEventNotFound', 'Draft event not found');
  if (event.status === 'IN_PROGRESS' || event.status === 'COMPLETED') {
    throw new DraftHttpError(409, 'DraftEventNotEditable', `Draft event in status ${event.status} cannot rerun lottery`);
  }
  const config = validateDraftConfig(JSON.parse(event.presetVersion.configJson));
  if (!config.lottery.enabled) throw new DraftHttpError(422, 'InvalidLotteryConfiguration', 'Lottery is disabled in the active config');

  const entries = await prisma.draftTeamEntry.findMany({ where: { draftEventId }, orderBy: { originalOrderPosition: 'asc' } });
  if (entries.length === 0) throw new DraftHttpError(409, 'DraftEventNotReady', 'Generate order before running the lottery');

  // Build an order DTO from current picks (first round).
  const picks = await prisma.draftPick.findMany({ where: { draftEventId }, orderBy: { overallPick: 'asc' } });
  const orderResult = {
    picks: picks.map((p) => ({ roundNumber: p.roundNumber, pickInRound: p.pickInRound, overallPick: p.overallPick, teamId: p.currentTeamId, teamName: p.teamNameSnapshot })),
    orderHash: event.initialOrderHash ?? '',
    source: config.order.source as 'REVERSE_STANDINGS' | 'MANUAL',
  };

  let lottery;
  try {
    lottery = runDraftLottery(config, orderResult, event.baseSeed);
  } catch (err) {
    wrapEngineError(err);
  }
  const applied = applyLotteryToOrder(config, orderResult, lottery);

  return prisma.$transaction(async (tx) => {
    await tx.draftLotteryDraw.deleteMany({ where: { draftEventId } });
    for (const draw of lottery.draws) {
      await tx.draftLotteryDraw.create({
        data: {
          draftEventId,
          drawNumber: draw.drawNumber,
          winningTeamId: draw.winningTeamId,
          originalPosition: draw.originalPosition,
          newPosition: draw.newPosition,
          weightSnapshot: draw.weightSnapshot,
          seedFragment: draw.seedFragment,
          drawHash: draw.drawHash,
        },
      });
    }
    // Update team entries' lottery/final positions.
    const finalFirstRound = lottery.finalFirstRoundOrder;
    for (let i = 0; i < finalFirstRound.length; i += 1) {
      const teamId = finalFirstRound[i]!;
      const entry = entries.find((e) => e.teamId === teamId);
      const lotteryPos = lottery.draws.find((d) => d.winningTeamId === teamId)?.newPosition ?? null;
      await tx.draftTeamEntry.update({
        where: { id: entry!.id },
        data: { lotteryOrderPosition: lotteryPos, finalOrderPosition: i + 1 },
      });
    }
    // Rewrite pick team assignments from the applied order.
    for (const pick of applied.picks) {
      await tx.draftPick.update({
        where: { draftEventId_overallPick: { draftEventId, overallPick: pick.overallPick } },
        data: { currentTeamId: pick.teamId, teamNameSnapshot: pick.teamName, originalTeamId: pick.teamId },
      });
    }
    await tx.draftEvent.update({ where: { id: draftEventId }, data: { lotteryHash: lottery.lotteryHash, finalOrderHash: applied.orderHash, status: 'PREPARING' } });
    await writeDraftAudit(tx, draftEventId, 'DRAFT_LOTTERY_RUN', reason, null, { lotteryHash: lottery.lotteryHash, draws: lottery.draws.length }, ['lottery'], source, 'DRAFT_LOTTERY');
    return { lotteryHash: lottery.lotteryHash, draws: lottery.draws.length, finalOrderHash: applied.orderHash };
  });
}

export async function markDraftReady(
  draftEventId: string,
  reason: string,
  source: CommissionerAuditSource,
) {
  const event = await prisma.draftEvent.findUnique({ where: { id: draftEventId } });
  if (!event) throw new DraftHttpError(404, 'DraftEventNotFound', 'Draft event not found');
  if (event.status !== 'PLANNED' && event.status !== 'PREPARING') {
    throw new DraftHttpError(409, 'DraftEventNotEditable', `Draft event in status ${event.status} cannot be marked READY`);
  }
  const eligibleCount = await prisma.draftEligiblePlayer.count({ where: { draftEventId } });
  if (eligibleCount === 0) throw new DraftHttpError(409, 'DraftEventNotReady', 'Generate eligibility before marking READY');
  const pickCount = await prisma.draftPick.count({ where: { draftEventId } });
  if (pickCount === 0) throw new DraftHttpError(409, 'DraftEventNotReady', 'Generate order before marking READY');
  return prisma.$transaction(async (tx) => {
    const updated = await tx.draftEvent.update({ where: { id: draftEventId }, data: { status: 'READY', totalPicks: pickCount } });
    await writeDraftAudit(tx, draftEventId, 'DRAFT_EVENT_STARTED', reason, { status: event.status }, { status: 'READY' }, ['status'], source);
    return mapDraftEventRow(updated);
  });
}

export async function startDraft(
  draftEventId: string,
  reason: string,
  source: CommissionerAuditSource,
) {
  const event = await prisma.draftEvent.findUnique({ where: { id: draftEventId } });
  if (!event) throw new DraftHttpError(404, 'DraftEventNotFound', 'Draft event not found');
  if (event.status === 'IN_PROGRESS') throw new DraftHttpError(409, 'DraftEventAlreadyStarted', 'Draft event already started');
  if (event.status === 'COMPLETED') throw new DraftHttpError(409, 'DraftEventCompleted', 'Draft event already completed');
  if (event.status !== 'READY') throw new DraftHttpError(409, 'DraftEventNotReady', 'Draft event must be READY to start');

  // Safety backup before the first pick (not before every pick).
  let backupPath: string | null = null;
  try {
    const backup = await createSqliteSafetyBackup({ label: 'f27-draft', sourceOperationType: 'DRAFT_START', sourceOperationId: draftEventId });
    backupPath = backup.relativeDisplayPath;
  } catch (err) {
    throw new DraftHttpError(503, 'BackupFailed', err instanceof Error ? err.message : 'Backup failed');
  }

  return prisma.$transaction(async (tx) => {
    // Freeze team board snapshots for every participating team (estimates only).
    const entries = await tx.draftTeamEntry.findMany({ where: { draftEventId } });
    const eligible = await tx.draftEligiblePlayer.findMany({ where: { draftEventId } });
    const eligibleIds = new Set(eligible.map((e) => e.playerId));
    for (const entry of entries) {
      const estimates = await loadTeamEstimatesInTx(tx, entry.teamId, eligibleIds);
      const board = buildDraftBoard(entry.teamId, estimates);
      await tx.draftTeamBoardSnapshot.upsert({
        where: { draftEventId_teamId: { draftEventId, teamId: entry.teamId } },
        create: { draftEventId, teamId: entry.teamId, boardText: JSON.stringify(board), boardHash: board.boardHash },
        update: { boardText: JSON.stringify(board), boardHash: board.boardHash },
      });
    }
    // Set the first pick ON_THE_CLOCK.
    const firstPick = await tx.draftPick.findFirst({ where: { draftEventId, status: 'PENDING' }, orderBy: { overallPick: 'asc' } });
    if (firstPick) await tx.draftPick.update({ where: { id: firstPick.id }, data: { status: 'ON_THE_CLOCK' } });
    const updated = await tx.draftEvent.update({ where: { id: draftEventId }, data: { status: 'IN_PROGRESS', startedAt: new Date() } });
    await writeDraftAudit(tx, draftEventId, 'DRAFT_EVENT_STARTED', reason, { status: 'READY' }, { status: 'IN_PROGRESS', backupPath }, ['status', 'startedAt', 'boardSnapshots'], source);
    return { event: mapDraftEventRow(updated), backupPath };
  });
}

export async function cancelDraft(
  draftEventId: string,
  reason: string,
  source: CommissionerAuditSource,
) {
  const event = await prisma.draftEvent.findUnique({ where: { id: draftEventId } });
  if (!event) throw new DraftHttpError(404, 'DraftEventNotFound', 'Draft event not found');
  if (event.status === 'COMPLETED') throw new DraftHttpError(409, 'DraftEventCompleted', 'Completed draft events cannot be cancelled');
  if (event.status === 'CANCELLED') throw new DraftHttpError(409, 'DraftEventNotEditable', 'Draft event already cancelled');
  return prisma.$transaction(async (tx) => {
    const updated = await tx.draftEvent.update({ where: { id: draftEventId }, data: { status: 'CANCELLED' } });
    await writeDraftAudit(tx, draftEventId, 'DRAFT_EVENT_CANCELLED', reason, { status: event.status }, { status: 'CANCELLED' }, ['status'], source);
    return mapDraftEventRow(updated);
  });
}

// ---------------------------------------------------------------------------
// Pick execution (team + commissioner)
// ---------------------------------------------------------------------------

export async function selectPick(
  draftEventId: string,
  pickId: string,
  input: { playerId: string; selectionSource?: 'MANUAL' | 'AUTO' | 'COMMISSIONER_CORRECTION'; reason?: string },
  source: CommissionerAuditSource,
) {
  const event = await prisma.draftEvent.findUnique({ where: { id: draftEventId } });
  if (!event) throw new DraftHttpError(404, 'DraftEventNotFound', 'Draft event not found');
  if (event.status === 'COMPLETED') throw new DraftHttpError(409, 'DraftEventCompleted', 'Draft event is completed');
  if (event.status !== 'IN_PROGRESS') throw new DraftHttpError(409, 'DraftEventNotReady', 'Draft event is not IN_PROGRESS');

  return prisma.$transaction(async (tx) => {
    const pick = await tx.draftPick.findUnique({ where: { id: pickId } });
    if (!pick || pick.draftEventId !== draftEventId) throw new DraftHttpError(404, 'DraftPickNotFound', 'Draft pick not found');
    if (pick.status !== 'ON_THE_CLOCK') throw new DraftHttpError(409, 'PickNotOnClock', `Pick ${pick.overallPick} is not ON_THE_CLOCK`);

    const eligible = await tx.draftEligiblePlayer.findUnique({ where: { draftEventId_playerId: { draftEventId, playerId: input.playerId } } });
    if (!eligible) throw new DraftHttpError(404, 'ProspectNotFound', 'Player is not in the draft eligibility class');
    if (eligible.status !== 'AVAILABLE') throw new DraftHttpError(409, 'ProspectAlreadyDrafted', `Prospect already ${eligible.status}`);

    // Complete the pick.
    const completed = await tx.draftPick.update({
      where: { id: pick.id },
      data: {
        status: 'COMPLETED',
        selectedPlayerId: eligible.id,
        selectedPlayerNameSnapshot: eligible.playerNameSnapshot,
        selectedAt: new Date(),
        selectionSource: input.selectionSource ?? 'MANUAL',
      },
    });
    // Create ACTIVE draft right (no contract; no club assignment).
    const right = await tx.playerDraftRight.create({
      data: {
        playerId: eligible.playerId,
        teamId: pick.currentTeamId,
        draftEventId,
        draftPickId: pick.id,
        status: 'ACTIVE',
        playerNameSnapshot: eligible.playerNameSnapshot,
        teamNameSnapshot: pick.teamNameSnapshot,
      },
    });
    // Mark eligible player DRAFTED.
    await tx.draftEligiblePlayer.update({ where: { id: eligible.id }, data: { status: 'DRAFTED' } });

    // Advance next pick.
    const next = await tx.draftPick.findFirst({ where: { draftEventId, overallPick: pick.overallPick + 1 } });
    if (next) await tx.draftPick.update({ where: { id: next.id }, data: { status: 'ON_THE_CLOCK' } });

    // Player truth invariants: do NOT update currentTeamId, do NOT create a contract.
    // (No Player update, no Contract create.)

    await writeDraftAudit(tx, pick.id, 'DRAFT_PICK_MADE', input.reason ?? `Pick ${pick.overallPick}`, { status: 'ON_THE_CLOCK' }, { status: 'COMPLETED', selectedPlayerId: eligible.playerId, selectionSource: completed.selectionSource }, ['pick', 'right'], source, 'DRAFT_PICK');

    // Check completion.
    const remaining = await tx.draftPick.count({ where: { draftEventId, status: { in: ['PENDING', 'ON_THE_CLOCK'] } } });
    const availableCount = await tx.draftEligiblePlayer.count({ where: { draftEventId, status: 'AVAILABLE' } });
    if (remaining === 0 || availableCount === 0) {
      await completeDraftInternal(tx, draftEventId, input.reason ?? 'Auto-completed', source);
    } else {
      await tx.draftEvent.update({ where: { id: draftEventId }, data: { currentOverallPick: pick.overallPick } });
    }
    return {
      pickId: pick.id,
      overallPick: pick.overallPick,
      selectedPlayerId: eligible.playerId,
      selectedPlayerName: eligible.playerNameSnapshot,
      teamId: pick.currentTeamId,
      rightId: right.id,
    };
  });
}

export async function autoSelectPick(
  draftEventId: string,
  pickId: string,
  input: { reason?: string },
  source: CommissionerAuditSource,
) {
  const event = await prisma.draftEvent.findUnique({ where: { id: draftEventId }, include: { presetVersion: true } });
  if (!event) throw new DraftHttpError(404, 'DraftEventNotFound', 'Draft event not found');
  if (event.status !== 'IN_PROGRESS') throw new DraftHttpError(409, 'DraftEventNotReady', 'Draft event is not IN_PROGRESS');
  const config = validateDraftConfig(JSON.parse(event.presetVersion.configJson));

  const pick = await prisma.draftPick.findUnique({ where: { id: pickId } });
  if (!pick || pick.draftEventId !== draftEventId) throw new DraftHttpError(404, 'DraftPickNotFound', 'Draft pick not found');
  if (pick.status !== 'ON_THE_CLOCK') throw new DraftHttpError(409, 'TeamNotOnClock', `Team for pick ${pick.overallPick} is not on the clock`);

  const eligibleRows = await prisma.draftEligiblePlayer.findMany({ where: { draftEventId, status: 'AVAILABLE' } });
  const eligibleIds = new Set(eligibleRows.map((e) => e.playerId));
  const estimates = await loadTeamEstimates(pick.currentTeamId, eligibleIds);

  let auto;
  try {
    auto = suggestAutoPick({ availableProspects: estimates, teamBoardConfig: { respectManualRank: true }, seed: `${event.baseSeed}:pick:${pick.overallPick}` }, config.autoPick);
  } catch (err) {
    wrapEngineError(err);
  }
  // The selected eligible record (auto.selectedPlayerId is a player id; eligible rows key on playerId).
  const selected = eligibleRows.find((e) => e.playerId === auto!.selectedPlayerId);
  if (!selected) throw new DraftHttpError(422, 'DraftExecutionFailed', 'Auto-pick selected an unavailable prospect');

  return selectPick(draftEventId, pickId, { playerId: selected.playerId, selectionSource: 'AUTO', reason: input.reason ?? auto.reason }, source);
}

async function completeDraftInternal(
  tx: Prisma.TransactionClient,
  draftEventId: string,
  reason: string,
  source: CommissionerAuditSource,
) {
  const [picks, eligible, rights] = await Promise.all([
    tx.draftPick.findMany({ where: { draftEventId }, orderBy: { overallPick: 'asc' } }),
    tx.draftEligiblePlayer.findMany({ where: { draftEventId } }),
    tx.playerDraftRight.findMany({ where: { draftEventId } }),
  ]);
  // Cancel any remaining pending picks if the class is exhausted.
  for (const p of picks) {
    if (p.status === 'PENDING' || p.status === 'ON_THE_CLOCK') {
      await tx.draftPick.update({ where: { id: p.id }, data: { status: 'CANCELLED' } });
    }
  }
  const updatedPicks = picks.map((p) => ({
    pickId: p.id,
    roundNumber: p.roundNumber,
    pickInRound: p.pickInRound,
    overallPick: p.overallPick,
    teamId: p.currentTeamId,
    status: p.status === 'COMPLETED' ? ('COMPLETED' as const) : ('CANCELLED' as const),
    selectedPlayerId: p.selectedPlayerId ? eligible.find((e) => e.id === p.selectedPlayerId)?.playerId ?? null : null,
    selectionSource: p.selectionSource ?? null,
  }));
  const recon = reconcileDraft({
    picks: updatedPicks,
    eligibilityClass: eligible.map((e) => ({
      playerId: e.playerId,
      displayName: e.playerNameSnapshot,
      dateOfBirth: e.birthDateSnapshot,
      ageOnCutoffDate: e.ageOnCutoffDate,
      lifecycleStatus: e.lifecycleSnapshot,
      sourceType: e.sourceTypeSnapshot,
      countrySnapshot: e.countrySnapshot,
      positionSnapshot: e.positionSnapshot,
      eligibilityHash: e.eligibilityHash,
    })),
    rights: rights.map((r) => ({ id: r.id, playerId: r.playerId, teamId: r.teamId, status: r.status })),
  });
  if (!recon.valid) {
    throw new DraftHttpError(422, 'DraftReconciliationFailed', `Reconciliation failed with ${recon.issues.length} issue(s)`, recon.issues);
  }
  const resultHash = hashDraftResult({ draftEventId, picks: updatedPicks });
  await tx.draftEvent.update({
    where: { id: draftEventId },
    data: { status: 'COMPLETED', completedAt: new Date(), resultHash, currentOverallPick: picks.length },
  });
  await writeDraftAudit(tx, draftEventId, 'DRAFT_EVENT_COMPLETED', reason, null, { resultHash, selections: updatedPicks.filter((p) => p.status === 'COMPLETED').length }, ['status', 'completedAt', 'resultHash'], source);
}

async function loadTeamEstimatesInTx(tx: Prisma.TransactionClient, teamId: string, eligiblePlayerIds: Set<string>): Promise<BoardProspectEstimate[]> {
  const knowledge = await tx.teamProspectKnowledge.findMany({
    where: { teamId, playerId: { in: [...eligiblePlayerIds] } },
    include: { reports: { orderBy: { versionNumber: 'desc' }, take: 1 } },
  });
  const watchlist = await tx.teamProspectWatchlistEntry.findMany({ where: { teamId } });
  const watchByPlayer = new Map(watchlist.map((w) => [w.playerId, w.manualPriority]));
  const estimates: BoardProspectEstimate[] = [];
  for (const player of eligiblePlayerIds) {
    const k = knowledge.find((x) => x.playerId === player);
    const report = k?.reports[0];
    if (report) {
      const r = json<{
        currentAbility: { estimate: number | null };
        potential: { estimate: number | null };
        confidence: number;
      }>(report.reportJson);
      estimates.push({
        playerId: player,
        estimatedCurrentAbility: r.currentAbility.estimate,
        estimatedPotential: r.potential.estimate,
        projectedRole: null,
        confidence: r.confidence,
        stale: false,
        watchlistPriority: watchByPlayer.get(player) ?? 0,
        manualRank: null,
      });
    } else {
      estimates.push({
        playerId: player,
        estimatedCurrentAbility: null,
        estimatedPotential: null,
        projectedRole: null,
        confidence: 0,
        stale: true,
        watchlistPriority: watchByPlayer.get(player) ?? 0,
        manualRank: null,
      });
    }
  }
  return estimates;
}

// ---------------------------------------------------------------------------
// Commissioner diagnostics (true values revealed only behind the gate)
// ---------------------------------------------------------------------------

export async function getDraftDiagnostics(draftEventId: string) {
  const event = await prisma.draftEvent.findUnique({
    where: { id: draftEventId },
    include: { presetVersion: { include: { preset: true } }, worldSeason: true },
  });
  if (!event) throw new DraftHttpError(404, 'DraftEventNotFound', 'Draft event not found');
  const [picks, rights, eligible, lottery, entries] = await Promise.all([
    prisma.draftPick.findMany({ where: { draftEventId }, orderBy: { overallPick: 'asc' }, take: 20 }),
    prisma.playerDraftRight.findMany({ where: { draftEventId } }),
    prisma.draftEligiblePlayer.count({ where: { draftEventId } }),
    prisma.draftLotteryDraw.findMany({ where: { draftEventId }, orderBy: { drawNumber: 'asc' } }),
    prisma.draftTeamEntry.findMany({ where: { draftEventId }, orderBy: { finalOrderPosition: 'asc' } }),
  ]);
  return {
    event: mapDraftEventRow(event),
    config: {
      presetName: event.presetVersion.preset.name,
      versionNumber: event.presetVersion.versionNumber,
      configHash: event.presetVersion.configHash,
    },
    hashes: {
      eligibilityHash: event.eligibilityHash,
      initialOrderHash: event.initialOrderHash,
      lotteryHash: event.lotteryHash,
      finalOrderHash: event.finalOrderHash,
      resultHash: event.resultHash,
    },
    eligibleCount: eligible,
    rightsCount: rights.length,
    picksSample: picks.map((p) => ({ overallPick: p.overallPick, teamName: p.teamNameSnapshot, status: p.status, selectedPlayerName: p.selectedPlayerNameSnapshot, selectionSource: p.selectionSource })),
    lotteryDraws: lottery.map((d) => ({ drawNumber: d.drawNumber, winningTeamId: d.winningTeamId, from: d.originalPosition, to: d.newPosition, drawHash: d.drawHash })),
    teamEntries: entries.map((e) => ({ teamId: e.teamId, teamName: e.teamNameSnapshot, original: e.originalOrderPosition, lottery: e.lotteryOrderPosition, final: e.finalOrderPosition, standingRank: e.sourceStandingRank })),
  };
}

// ---------------------------------------------------------------------------
// Mappers
// ---------------------------------------------------------------------------

function mapDraftEventRow(row: {
  id: string;
  worldSeasonId: string;
  name: string;
  status: string;
  configHash: string;
  cutoffDate: string;
  baseSeed: string;
  eligibilityHash: string | null;
  initialOrderHash: string | null;
  lotteryHash: string | null;
  finalOrderHash: string | null;
  currentOverallPick: number;
  totalRounds: number;
  totalPicks: number;
  startedAt: Date | null;
  completedAt: Date | null;
  resultHash: string | null;
  createdAt: Date;
  updatedAt: Date;
  worldSeason?: { id: string; label: string } | null;
  presetVersion?: { id: string; versionNumber: number; preset?: { id: string; name: string } } | null;
}) {
  return {
    id: row.id,
    worldSeasonId: row.worldSeasonId,
    seasonLabel: row.worldSeason?.label ?? null,
    name: row.name,
    status: row.status,
    presetName: row.presetVersion?.preset?.name ?? null,
    presetVersionId: row.presetVersion?.id ?? null,
    configHash: row.configHash,
    cutoffDate: row.cutoffDate,
    eligibilityHash: row.eligibilityHash,
    initialOrderHash: row.initialOrderHash,
    lotteryHash: row.lotteryHash,
    finalOrderHash: row.finalOrderHash,
    currentOverallPick: row.currentOverallPick,
    totalRounds: row.totalRounds,
    totalPicks: row.totalPicks,
    startedAt: iso(row.startedAt),
    completedAt: iso(row.completedAt),
    resultHash: row.resultHash,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function mapEligibleRow(row: {
  id: string;
  playerId: string;
  playerNameSnapshot: string;
  birthDateSnapshot: string;
  ageOnCutoffDate: number;
  countrySnapshot: string | null;
  positionSnapshot: string | null;
  lifecycleSnapshot: string;
  sourceTypeSnapshot: string;
  eligibilityHash: string;
  status: string;
  createdAt: Date;
}) {
  return {
    id: row.id,
    playerId: row.playerId,
    playerName: row.playerNameSnapshot,
    birthDate: row.birthDateSnapshot,
    ageOnCutoffDate: row.ageOnCutoffDate,
    country: row.countrySnapshot,
    position: row.positionSnapshot,
    lifecycle: row.lifecycleSnapshot,
    sourceType: row.sourceTypeSnapshot,
    eligibilityHash: row.eligibilityHash,
    status: row.status,
    createdAt: row.createdAt.toISOString(),
  };
}

function mapPickRow(row: {
  id: string;
  roundNumber: number;
  pickInRound: number;
  overallPick: number;
  originalTeamId: string;
  currentTeamId: string;
  teamNameSnapshot: string;
  status: string;
  selectedPlayerId: string | null;
  selectedPlayerNameSnapshot: string | null;
  selectedAt: Date | null;
  selectionSource: string | null;
  pickHash: string | null;
}) {
  return {
    id: row.id,
    roundNumber: row.roundNumber,
    pickInRound: row.pickInRound,
    overallPick: row.overallPick,
    teamId: row.currentTeamId,
    teamName: row.teamNameSnapshot,
    status: row.status,
    selectedPlayerId: row.selectedPlayerId,
    selectedPlayerName: row.selectedPlayerNameSnapshot,
    selectedAt: iso(row.selectedAt),
    selectionSource: row.selectionSource,
    pickHash: row.pickHash,
  };
}

// Re-export for commissioner preset management (kept here to avoid a second import surface).
export { defaultAutoPickWeights };
