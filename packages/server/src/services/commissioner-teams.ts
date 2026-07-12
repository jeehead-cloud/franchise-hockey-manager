import { prisma } from '../db/client.js';
import { CommissionerHttpError } from '../commissioner/errors.js';
import type { CommissionerRosterStatusInput, CommissionerTeamSetupInput } from '../commissioner/schemas.js';
import { buildTeamReadiness } from './team-readiness.js';
import { isErrorResult, parsePagination } from './query.js';

const teamInclude = {
  coach: { select: { id: true, firstName: true, lastName: true, coachingStyle: true, tacticalStyle: true, overallCoaching: true, playerDevelopment: true, offense: true, defense: true } },
  players: { include: { skaterAttributes: true, goalieAttributes: true } },
} as const;

async function detail(id: string) {
  const team = await prisma.team.findUnique({ where: { id }, include: teamInclude });
  if (!team) return null;
  return {
    id: team.id, tacticalStyle: team.tacticalStyle, updatedAt: team.updatedAt.toISOString(), coach: team.coach,
    readiness: buildTeamReadiness({ hasHeadCoach: Boolean(team.coach), tacticalStyle: team.tacticalStyle, players: team.players }),
  };
}

function audit(tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0], entityType: 'TEAM' | 'PLAYER', entityId: string, action: 'TEAM_TACTICS_UPDATED' | 'HEAD_COACH_ASSIGNED' | 'HEAD_COACH_UNASSIGNED' | 'PLAYER_ROSTER_STATUS_CHANGED', reason: string, before: unknown, after: unknown, source: 'COMMISSIONER_UI' | 'COMMISSIONER_API') {
  return tx.commissionerAuditLog.create({ data: { entityType, entityId, action, reason, beforeJson: JSON.stringify(before), afterJson: JSON.stringify(after), changedFieldsJson: JSON.stringify(Object.keys(after as object)), source } });
}

export async function getCommissionerTeamSetup(id: string) {
  return detail(id);
}

export async function updateCommissionerTeamSetup(id: string, input: CommissionerTeamSetupInput, source: 'COMMISSIONER_UI' | 'COMMISSIONER_API' = 'COMMISSIONER_API') {
  const existing = await prisma.team.findUnique({ where: { id }, include: teamInclude });
  if (!existing) throw new CommissionerHttpError(404, 'TeamNotFound', 'Team not found');
  if (existing.updatedAt.toISOString() !== input.expectedUpdatedAt) throw new CommissionerHttpError(409, 'EditConflict', 'Team was modified since this editor was loaded.', { currentUpdatedAt: existing.updatedAt.toISOString() });
  await prisma.$transaction(async (tx) => {
    const currentCoach = existing.coach;
    if (input.headCoachId) {
      const coach = await tx.coach.findUnique({ where: { id: input.headCoachId } });
      if (!coach) throw new CommissionerHttpError(404, 'CoachNotFound', 'Coach not found');
      const incumbent = await tx.coach.findFirst({ where: { currentTeamId: id } });
      if (incumbent && incumbent.id !== coach.id && !input.replaceExisting) throw new CommissionerHttpError(409, 'HeadCoachAlreadyAssigned', 'Team already has a head coach');
      if (coach.currentTeamId && coach.currentTeamId !== id && !input.moveFromOtherTeam) throw new CommissionerHttpError(409, 'CoachAssignedElsewhere', 'Coach is assigned to another team');
      if (incumbent && incumbent.id !== coach.id) await tx.coach.update({ where: { id: incumbent.id }, data: { currentTeamId: null } });
      await tx.coach.update({ where: { id: coach.id }, data: { currentTeamId: id } });
    } else if (currentCoach) {
      await tx.coach.update({ where: { id: currentCoach.id }, data: { currentTeamId: null } });
    }
    const updated = await tx.team.update({ where: { id }, data: { tacticalStyle: input.tacticalStyle } });
    const action = input.headCoachId !== (currentCoach?.id ?? null)
      ? (input.headCoachId ? 'HEAD_COACH_ASSIGNED' : 'HEAD_COACH_UNASSIGNED')
      : 'TEAM_TACTICS_UPDATED';
    await audit(tx, 'TEAM', id, action, input.reason,
      { tacticalStyle: existing.tacticalStyle, headCoachId: currentCoach?.id ?? null },
      { tacticalStyle: updated.tacticalStyle, headCoachId: input.headCoachId }, source);
  });
  return { item: await detail(id) };
}

export async function updateTeamRosterStatus(teamId: string, input: CommissionerRosterStatusInput, source: 'COMMISSIONER_UI' | 'COMMISSIONER_API' = 'COMMISSIONER_API') {
  const player = await prisma.player.findUnique({ where: { id: input.playerId } });
  if (!player || player.currentTeamId !== teamId) throw new CommissionerHttpError(404, 'PlayerNotFound', 'Player is not on this team');
  if (player.updatedAt.toISOString() !== input.expectedUpdatedAt) throw new CommissionerHttpError(409, 'EditConflict', 'Player was modified since this editor was loaded.', { currentUpdatedAt: player.updatedAt.toISOString() });
  await prisma.$transaction(async (tx) => {
    const updated = await tx.player.update({ where: { id: player.id }, data: { rosterStatus: input.rosterStatus } });
    await audit(tx, 'PLAYER', player.id, 'PLAYER_ROSTER_STATUS_CHANGED', input.reason, { rosterStatus: player.rosterStatus }, { rosterStatus: updated.rosterStatus }, source);
  });
  return { item: await detail(teamId) };
}

export async function listTeamAudit(id: string, query: Record<string, unknown> = {}) {
  if (!await prisma.team.findUnique({ where: { id }, select: { id: true } })) return null;
  const pagination = parsePagination(query);
  if (isErrorResult(pagination)) throw new CommissionerHttpError(400, 'InvalidRequest', pagination.error);
  const where = { entityType: 'TEAM' as const, entityId: id };
  const [total, rows] = await Promise.all([prisma.commissionerAuditLog.count({ where }), prisma.commissionerAuditLog.findMany({ where, orderBy: { createdAt: 'desc' }, skip: pagination.skip, take: pagination.pageSize })]);
  return { items: rows.map((row) => ({ ...row, createdAt: row.createdAt.toISOString(), before: JSON.parse(row.beforeJson), after: JSON.parse(row.afterJson), changedFields: JSON.parse(row.changedFieldsJson) })), page: pagination.page, pageSize: pagination.pageSize, total };
}
