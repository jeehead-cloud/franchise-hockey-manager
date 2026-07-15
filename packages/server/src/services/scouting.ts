import type { Prisma } from '@prisma/client';
import {
  consolidateScoutingObservations,
  createScoutingObservation,
  assessScoutingStaleness,
  suggestScoutingRanking,
  hashPlayerState,
  type PlayerTruth,
  type ScoutInput,
  type ScoutingObservation as EngineObservation,
} from '@fhm/engine';
import { prisma } from '../db/client.js';
import { derivePublicPlayerModel } from './player-model.js';
import { getActiveScoutingSnapshot } from './scouting-config.js';

export class ScoutingHttpError extends Error {
  constructor(public statusCode: number, public code: string, message: string, public details?: unknown) { super(message); }
}

const json = <T>(value: string): T => JSON.parse(value) as T;
const iso = (value: Date | null) => value?.toISOString() ?? null;

async function auditAssignment(
  tx: Prisma.TransactionClient,
  assignmentId: string,
  action: 'SCOUTING_ASSIGNMENT_CREATED' | 'SCOUTING_ASSIGNMENT_EXECUTED' | 'SCOUTING_ASSIGNMENT_CANCELLED',
  before: unknown,
  after: unknown,
  changedFields: string[],
) {
  await tx.commissionerAuditLog.create({
    data: {
      entityType: 'SCOUTING_ASSIGNMENT',
      entityId: assignmentId,
      action,
      reason: `Team scouting assignment ${action.split('_').at(-1)!.toLowerCase()}`,
      beforeJson: JSON.stringify(before),
      afterJson: JSON.stringify(after),
      changedFieldsJson: JSON.stringify(changedFields),
      source: 'COMMISSIONER_API',
    },
  });
}

async function requireClubTeam(teamId: string) {
  const team = await prisma.team.findUnique({ where: { id: teamId }, select: { id: true, name: true, teamType: true } });
  if (!team) throw new ScoutingHttpError(404, 'TeamNotFound', 'Team not found');
  if (team.teamType !== 'CLUB') throw new ScoutingHttpError(422, 'ClubTeamRequired', 'Scouting is available only to club teams');
  return team;
}

function scoutInput(row: { id: string; evaluatingRating: number; potentialRating: number; skaterRating: number; goalieRating: number; specialtiesJson: string; countryFamiliarityJson: string; positionFamiliarityJson: string; persistentBias: number }): ScoutInput {
  return {
    scoutId: row.id,
    ratings: { evaluating: row.evaluatingRating, potential: row.potentialRating, skater: row.skaterRating, goalie: row.goalieRating },
    specialties: json(row.specialtiesJson),
    countryFamiliarity: json(row.countryFamiliarityJson),
    positionGroupFamiliarity: json(row.positionFamiliarityJson),
    persistentBias: row.persistentBias,
  };
}

function playerTruth(row: any): PlayerTruth {
  const model = derivePublicPlayerModel(row);
  if (!model || model.modelStatus !== 'COMPLETE' || row.potentialFloor == null || row.potentialCeiling == null) {
    throw new ScoutingHttpError(422, 'IncompletePlayerModel', `Player ${row.id} does not have a complete scoutable model`);
  }
  if (row.primaryPosition === 'G') return { playerId: row.id, countryKey: row.nationality.code, position: 'G', kind: 'goalie', attributes: row.goalieAttributes, currentAbility: Math.round(model.ratings.currentAbility), potential: { floor: row.potentialFloor, ceiling: row.potentialCeiling }, role: model.role.role, stateHash: undefined };
  return { playerId: row.id, countryKey: row.nationality.code, position: row.primaryPosition, kind: 'skater', attributes: row.skaterAttributes, currentAbility: Math.round(model.ratings.currentAbility), potential: { floor: row.potentialFloor, ceiling: row.potentialCeiling }, role: model.role.role, stateHash: undefined };
}

const playerInclude = { nationality: true, skaterAttributes: true, goalieAttributes: true } as const;

function publicReport(row: { reportJson: string; createdAt: Date; versionNumber: number }) {
  const report = json<any>(row.reportJson);
  return { versionNumber: row.versionNumber, createdAt: row.createdAt.toISOString(), playerId: report.playerId, playerKind: report.playerKind, observations: report.observations, attributes: report.attributes, currentAbility: report.currentAbility, potential: report.potential, confidence: report.confidence, strengths: report.strengths, weaknesses: report.weaknesses };
}

function toTeamProspectDto(input: {
  player: { id: string; firstName: string; lastName: string; primaryPosition: string };
  report?: { reportJson: string; sourcePlayerStateHash: string; createdAt: Date; versionNumber: number } | null;
  currentTruth?: PlayerTruth;
  watchlist?: { manualPriority: number; note: string | null } | null;
}) {
  const report = input.report ? publicReport(input.report) : null;
  const stale =
    report && input.currentTruth
      ? assessScoutingStaleness(input.currentTruth, {
          sourcePlayerStateHash: input.report!.sourcePlayerStateHash,
        }).stale
      : false;
  return {
    playerId: input.player.id,
    playerName: `${input.player.firstName} ${input.player.lastName}`,
    position: input.player.primaryPosition,
    report: report
      ? {
          currentAbility: report.currentAbility,
          potential: report.potential,
          confidence: report.confidence,
          strengths: report.strengths,
          weaknesses: report.weaknesses,
          observedAt: report.createdAt,
          stale,
        }
      : null,
    watchlist: input.watchlist
      ? { priority: input.watchlist.manualPriority, notes: input.watchlist.note }
      : null,
  };
}

async function resolveTargets(teamId: string, input: { targetType: 'PLAYER' | 'COUNTRY' | 'WATCHLIST'; playerIds?: string[]; countryId?: string }) {
  if (input.targetType === 'PLAYER') {
    const ids = [...new Set(input.playerIds ?? [])];
    if (!ids.length) throw new ScoutingHttpError(400, 'InvalidScoutingRequest', 'playerIds is required for PLAYER target');
    return ids;
  }
  if (input.targetType === 'COUNTRY') {
    if (!input.countryId) throw new ScoutingHttpError(400, 'InvalidScoutingRequest', 'countryId is required for COUNTRY target');
    return (await prisma.player.findMany({ where: { nationalityCountryId: input.countryId, rosterStatus: { not: 'RETIRED' } }, select: { id: true } })).map((p) => p.id);
  }
  return (await prisma.teamProspectWatchlistEntry.findMany({ where: { teamId }, select: { playerId: true } })).map((p) => p.playerId);
}

export async function getScoutingOverview(teamId: string) {
  const team = await requireClubTeam(teamId);
  const [department, assignments, watchlist, reports] = await Promise.all([
    prisma.scoutingDepartment.findUnique({ where: { teamId }, include: { scouts: { include: { scout: true } } } }),
    prisma.scoutingAssignment.count({ where: { teamId, status: 'PREPARED' } }),
    prisma.teamProspectWatchlistEntry.count({ where: { teamId } }),
    prisma.teamScoutingReport.count({ where: { teamId } }),
  ]);
  return { team, department: department ? { id: department.id, name: department.name, scouts: department.scouts.map((x) => ({ id: x.scout.id, name: `${x.scout.firstName} ${x.scout.lastName}`, role: x.role })) } : null, preparedAssignments: assignments, watchlistCount: watchlist, reportCount: reports };
}

export async function getScoutingReadiness(teamId: string) {
  await requireClubTeam(teamId);
  const [department, active] = await Promise.all([prisma.scoutingDepartment.findUnique({ where: { teamId }, include: { scouts: true } }), getActiveScoutingSnapshot()]);
  return { ready: Boolean(department && department.scouts.length), blockers: !department ? ['No scouting department'] : department.scouts.length ? [] : ['No scouts assigned'], activeConfigVersionId: active.version.id };
}

export async function previewScoutingAssignment(input: { teamId: string; targetType: 'PLAYER' | 'COUNTRY' | 'WATCHLIST'; playerIds?: string[]; countryId?: string; scoutIds: string[]; observedOn: string; durationDays: number; seed: string }) {
  await requireClubTeam(input.teamId);
  const [config, targetIds, scouts] = await Promise.all([getActiveScoutingSnapshot(), resolveTargets(input.teamId, input), prisma.scout.findMany({ where: { id: { in: input.scoutIds } } })]);
  if (scouts.length !== input.scoutIds.length) throw new ScoutingHttpError(404, 'ScoutNotFound', 'One or more scouts were not found');
  const players = await prisma.player.findMany({ where: { id: { in: targetIds } }, include: playerInclude });
  const observations = players.flatMap((player) => scouts.map((scout) => createScoutingObservation(config.config, scoutInput(scout), playerTruth(player), { assignmentId: 'preview', teamId: input.teamId, seed: input.seed, observedOn: input.observedOn, durationDays: input.durationDays })));
  return { targetCount: players.length, scoutCount: scouts.length, observations: observations.map((o) => ({ playerId: o.playerId, scoutId: o.scoutId, confidence: o.confidence, currentAbility: o.currentAbility, potential: o.potential })) };
}

export async function createScoutingAssignment(input: { teamId: string; targetType: 'PLAYER' | 'COUNTRY' | 'WATCHLIST'; playerIds?: string[]; countryId?: string; scoutIds: string[]; observedOn: string; durationDays: number; seed: string }) {
  await requireClubTeam(input.teamId);
  const [config, targetIds, department] = await Promise.all([getActiveScoutingSnapshot(), resolveTargets(input.teamId, input), prisma.scoutingDepartment.findUnique({ where: { teamId: input.teamId }, include: { scouts: { include: { scout: true } } } })]);
  if (!department) throw new ScoutingHttpError(422, 'ScoutingDepartmentRequired', 'Create a scouting department first');
  const allowed = new Set(department.scouts.filter((s) => s.scout.status === 'ACTIVE').map((s) => s.scoutId));
  if (!input.scoutIds.length || input.scoutIds.some((id) => !allowed.has(id))) throw new ScoutingHttpError(422, 'InvalidScoutingRequest', 'All assigned scouts must belong to this team department');
  if (input.durationDays < config.config.observation.minDurationDays || input.durationDays > config.config.observation.maxDurationDays) throw new ScoutingHttpError(422, 'InvalidScoutingRequest', 'durationDays is outside active config bounds');
  return prisma.$transaction(async (tx) => {
    const row = await tx.scoutingAssignment.create({ data: { teamId: input.teamId, targetType: input.targetType, targetJson: JSON.stringify({ playerIds: targetIds, countryId: input.countryId ?? null }), observedOn: input.observedOn, durationDays: input.durationDays, seed: input.seed, configVersionId: config.version.id, configHash: config.version.configHash, scouts: { create: input.scoutIds.map((scoutId) => ({ scoutId })) } }, include: { scouts: true } });
    await auditAssignment(tx, row.id, 'SCOUTING_ASSIGNMENT_CREATED', null, row, ['teamId', 'targetType', 'targetJson', 'observedOn', 'durationDays', 'seed', 'configVersionId', 'scouts']);
    return row;
  });
}

export async function executeScoutingAssignment(teamId: string, assignmentId: string) {
  await requireClubTeam(teamId);
  return prisma.$transaction(async (tx) => {
    const assignment = await tx.scoutingAssignment.findFirst({ where: { id: assignmentId, teamId }, include: { scouts: { include: { scout: true } }, configVersion: true } });
    if (!assignment) throw new ScoutingHttpError(404, 'ScoutingAssignmentNotFound', 'Scouting assignment not found');
    if (assignment.status !== 'PREPARED') throw new ScoutingHttpError(409, 'ScoutingAssignmentNotPrepared', 'Only prepared assignments can be executed');
    const config = (await import('@fhm/engine')).validateScoutingConfig(JSON.parse(assignment.configVersion.configJson));
    const targetIds = json<{ playerIds: string[] }>(assignment.targetJson).playerIds;
    const players = await tx.player.findMany({ where: { id: { in: targetIds } }, include: playerInclude });
    const generated = players.flatMap((player) => assignment.scouts.map((entry) => createScoutingObservation(config, scoutInput(entry.scout), playerTruth(player), { assignmentId: assignment.id, teamId, seed: assignment.seed, observedOn: assignment.observedOn, durationDays: assignment.durationDays })));
    for (const observation of generated) await tx.scoutingObservation.create({ data: { teamId, playerId: observation.playerId, scoutId: observation.scoutId, assignmentId: assignment.id, observationId: observation.observationId, observationJson: JSON.stringify(observation), sourcePlayerStateHash: observation.sourcePlayerStateHash, observedOn: observation.observedOn, durationDays: observation.durationDays } });
    for (const playerId of [...new Set(generated.map((o) => o.playerId))]) {
      // F26 rescout rule: the current report reflects the newest player state only.
      // Prior observations (older state hashes) remain immutable history but are excluded
      // from the current consolidated report so a developed/edited player can be rescouted
      // without mixing incompatible state snapshots.
      const currentStateHash = generated.find((o) => o.playerId === playerId)!.sourcePlayerStateHash;
      const rows = await tx.scoutingObservation.findMany({ where: { teamId, playerId, sourcePlayerStateHash: currentStateHash }, orderBy: { observationId: 'asc' } });
      const report = consolidateScoutingObservations(config, rows.map((r) => json<EngineObservation>(r.observationJson)));
      const knowledge = await tx.teamProspectKnowledge.upsert({ where: { teamId_playerId: { teamId, playerId } }, create: { teamId, playerId }, update: {} });
      const latest = await tx.teamScoutingReport.findFirst({ where: { knowledgeId: knowledge.id }, orderBy: { versionNumber: 'desc' } });
      await tx.teamScoutingReport.create({ data: { knowledgeId: knowledge.id, teamId, playerId, versionNumber: (latest?.versionNumber ?? 0) + 1, reportJson: JSON.stringify(report), reportHash: report.reportHash, sourcePlayerStateHash: report.sourcePlayerStateHash } });
    }
    const completed = await tx.scoutingAssignment.update({ where: { id: assignment.id }, data: { status: 'COMPLETED', completedAt: new Date() } });
    await auditAssignment(tx, assignment.id, 'SCOUTING_ASSIGNMENT_EXECUTED', assignment, completed, ['status', 'completedAt']);
    return completed;
  });
}

export async function deletePreparedScoutingAssignment(teamId: string, assignmentId: string) {
  await requireClubTeam(teamId);
  await prisma.$transaction(async (tx) => {
    const row = await tx.scoutingAssignment.findFirst({ where: { id: assignmentId, teamId } });
    if (!row) throw new ScoutingHttpError(404, 'ScoutingAssignmentNotFound', 'Scouting assignment not found');
    if (row.status !== 'PREPARED') throw new ScoutingHttpError(409, 'ScoutingAssignmentNotPrepared', 'Only prepared assignments can be cancelled');
    const cancelled = await tx.scoutingAssignment.update({
      where: { id: assignmentId },
      data: { status: 'CANCELLED', cancelledAt: new Date() },
    });
    await auditAssignment(tx, assignmentId, 'SCOUTING_ASSIGNMENT_CANCELLED', row, cancelled, ['status', 'cancelledAt']);
  });
}

export async function listScoutingAssignments(teamId: string) {
  await requireClubTeam(teamId);
  const rows = await prisma.scoutingAssignment.findMany({ where: { teamId }, include: { scouts: { include: { scout: true } } }, orderBy: { createdAt: 'desc' } });
  return rows.map((x) => ({ id: x.id, targetType: x.targetType, target: json(x.targetJson), observedOn: x.observedOn, durationDays: x.durationDays, seed: x.seed, status: x.status, createdAt: x.createdAt.toISOString(), completedAt: iso(x.completedAt), scouts: x.scouts.map((s) => ({ id: s.scout.id, name: `${s.scout.firstName} ${s.scout.lastName}` })) }));
}

export async function listScoutingProspects(teamId: string) {
  await requireClubTeam(teamId);
  const [players, knowledge, watchlist] = await Promise.all([
    prisma.player.findMany({
      where: { rosterStatus: 'PROSPECT' },
      include: playerInclude,
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
    }),
    prisma.teamProspectKnowledge.findMany({
      where: { teamId },
      include: { reports: { orderBy: { versionNumber: 'desc' }, take: 1 } },
    }),
    prisma.teamProspectWatchlistEntry.findMany({ where: { teamId } }),
  ]);
  const knowledgeByPlayer = new Map(knowledge.map((item) => [item.playerId, item]));
  const watchlistByPlayer = new Map(watchlist.map((item) => [item.playerId, item]));
  return players.map((player) =>
    toTeamProspectDto({
      player,
      report: knowledgeByPlayer.get(player.id)?.reports[0] ?? null,
      currentTruth: playerTruth(player),
      watchlist: watchlistByPlayer.get(player.id) ?? null,
    }),
  );
}

export async function getScoutingAssignment(teamId: string, assignmentId: string) {
  await requireClubTeam(teamId);
  const assignment = await prisma.scoutingAssignment.findFirst({
    where: { id: assignmentId, teamId },
    include: { scouts: { include: { scout: true } } },
  });
  if (!assignment) {
    throw new ScoutingHttpError(404, 'ScoutingAssignmentNotFound', 'Scouting assignment not found');
  }
  const target = json<{ playerIds?: string[]; countryId?: string | null }>(assignment.targetJson);
  return {
    id: assignment.id,
    targetType: assignment.targetType,
    status: assignment.status,
    observedOn: assignment.observedOn,
    durationDays: assignment.durationDays,
    targetCount: target.playerIds?.length ?? 0,
    scouts: assignment.scouts.map((entry) => ({
      id: entry.scout.id,
      name: `${entry.scout.firstName} ${entry.scout.lastName}`,
    })),
    createdAt: assignment.createdAt.toISOString(),
    completedAt: iso(assignment.completedAt),
  };
}

export async function getScoutingProspect(teamId: string, playerId: string) {
  await requireClubTeam(teamId);
  const player = await prisma.player.findUnique({
    where: { id: playerId },
    include: playerInclude,
  });
  if (!player || player.rosterStatus !== 'PROSPECT') {
    throw new ScoutingHttpError(404, 'ProspectNotFound', 'Prospect not found');
  }
  const [knowledge, watchlist] = await Promise.all([
    prisma.teamProspectKnowledge.findUnique({
      where: { teamId_playerId: { teamId, playerId } },
      include: {
        reports: { orderBy: { versionNumber: 'desc' }, take: 1 },
        team: { select: { id: true } },
      },
    }),
    prisma.teamProspectWatchlistEntry.findUnique({
      where: { teamId_playerId: { teamId, playerId } },
    }),
  ]);
  return {
    ...toTeamProspectDto({
      player,
      report: knowledge?.reports[0] ?? null,
      currentTruth: playerTruth(player),
      watchlist,
    }),
    observations: knowledge
      ? await prisma.scoutingObservation.findMany({
          where: { teamId, playerId },
          select: { id: true, scoutId: true, observedOn: true, createdAt: true },
          orderBy: { createdAt: 'asc' },
        })
      : [],
  };
}

export async function listScoutingReports(teamId: string) {
  await requireClubTeam(teamId);
  const rows = await prisma.teamScoutingReport.findMany({
    where: { teamId },
    include: { player: { select: { firstName: true, lastName: true } } },
    orderBy: [{ playerId: 'asc' }, { versionNumber: 'desc' }],
  });
  return rows.map((row) => ({
    id: row.id,
    playerId: row.playerId,
    playerName: `${row.player.firstName} ${row.player.lastName}`,
    report: publicReport(row),
  }));
}

export async function upsertWatchlist(teamId: string, input: { playerId: string; manualPriority?: number; note?: string | null }) {
  await requireClubTeam(teamId);
  const player = await prisma.player.findUnique({ where: { id: input.playerId }, select: { id: true } });
  if (!player) throw new ScoutingHttpError(404, 'PlayerNotFound', 'Player not found');
  return prisma.teamProspectWatchlistEntry.upsert({ where: { teamId_playerId: { teamId, playerId: input.playerId } }, create: { teamId, playerId: input.playerId, manualPriority: input.manualPriority ?? 0, note: input.note ?? null }, update: { manualPriority: input.manualPriority ?? 0, note: input.note ?? null } });
}

export async function deleteWatchlist(teamId: string, playerId: string) {
  await requireClubTeam(teamId);
  await prisma.teamProspectWatchlistEntry.deleteMany({ where: { teamId, playerId } });
}

export async function listWatchlist(teamId: string) {
  await requireClubTeam(teamId);
  return prisma.teamProspectWatchlistEntry.findMany({ where: { teamId }, include: { player: { select: { id: true, firstName: true, lastName: true, primaryPosition: true } } }, orderBy: [{ manualPriority: 'desc' }, { updatedAt: 'desc' }] });
}

export async function listScoutingRankings(teamId: string) {
  const [prospects, watchlist] = await Promise.all([listScoutingProspects(teamId), listWatchlist(teamId)]);
  const priority = new Map(watchlist.map((x) => [x.playerId, x.manualPriority]));
  return suggestScoutingRanking(
    prospects
      .filter((x) => x.report)
      .map((x) => ({
        playerId: x.playerId,
        report: {
          currentAbility: x.report!.currentAbility,
          potential: x.report!.potential,
          confidence: x.report!.confidence,
          strengths: x.report!.strengths,
          weaknesses: x.report!.weaknesses,
        },
        manualPriority: priority.get(x.playerId),
      })),
  );
}

/**
 * Commissioner-only diagnostic: compares a team's current scouting estimate against
 * the player's true hidden values. Must never be exposed on a normal route — it
 * returns exact potential, current ability, development rate, and state hash.
 */
export async function getScoutingProspectDiagnostics(teamId: string, playerId: string) {
  await requireClubTeam(teamId);
  const player = await prisma.player.findUnique({ where: { id: playerId }, include: playerInclude });
  if (!player) throw new ScoutingHttpError(404, 'PlayerNotFound', 'Player not found');
  const truth = playerTruth(player);
  const [knowledge, observations] = await Promise.all([
    prisma.teamProspectKnowledge.findUnique({
      where: { teamId_playerId: { teamId, playerId } },
      include: { reports: { orderBy: { versionNumber: 'desc' }, take: 1 } },
    }),
    prisma.scoutingObservation.findMany({ where: { teamId, playerId }, orderBy: { createdAt: 'asc' } }),
  ]);
  const report = knowledge?.reports[0] ? publicReport(knowledge.reports[0]) : null;
  return {
    playerId,
    teamId,
    estimate: report
      ? { currentAbility: report.currentAbility, potential: report.potential, confidence: report.confidence, strengths: report.strengths, weaknesses: report.weaknesses }
      : null,
    truth: {
      playerKind: truth.kind,
      position: player.primaryPosition,
      currentAbility: truth.currentAbility,
      potential: truth.potential,
      role: truth.role,
      stateHash: hashPlayerState(truth),
    },
    observationCount: observations.length,
    reportVersion: knowledge?.reports[0]?.versionNumber ?? null,
    reportStateHash: knowledge?.reports[0]?.sourcePlayerStateHash ?? null,
    stale: knowledge?.reports[0] ? assessScoutingStaleness(truth, { sourcePlayerStateHash: knowledge.reports[0].sourcePlayerStateHash }).stale : null,
  };
}
