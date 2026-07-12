import { prisma } from '../db/client.js';
import { mapCoach } from '../mappers.js';
import { CommissionerHttpError } from '../commissioner/errors.js';
import type {
  CommissionerCoachCreateInput,
  CommissionerCoachEditInput,
} from '../commissioner/schemas.js';
import { isErrorResult, parsePagination } from './query.js';

const coachInclude = {
  nationality: { select: { id: true, name: true, code: true } },
  currentTeam: { select: { id: true, name: true, shortName: true } },
} as const;

function dto(row: Awaited<ReturnType<typeof prisma.coach.findUniqueOrThrow>>) {
  return { ...mapCoach(row), updatedAt: row.updatedAt.toISOString() };
}

async function validateAssignment(
  tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0],
  coachId: string | null,
  teamId: string | null,
  replaceExisting?: boolean,
  moveFromOtherTeam?: boolean,
) {
  if (!teamId) return;
  const [team, incumbent, coach] = await Promise.all([
    tx.team.findUnique({ where: { id: teamId } }),
    tx.coach.findFirst({ where: { currentTeamId: teamId } }),
    coachId ? tx.coach.findUnique({ where: { id: coachId } }) : null,
  ]);
  if (!team) throw new CommissionerHttpError(404, 'TeamNotFound', 'Team not found');
  if (incumbent && incumbent.id !== coachId && !replaceExisting) {
    throw new CommissionerHttpError(409, 'HeadCoachAlreadyAssigned', 'Team already has a head coach');
  }
  if (coach?.currentTeamId && coach.currentTeamId !== teamId && !moveFromOtherTeam) {
    throw new CommissionerHttpError(409, 'CoachAssignedElsewhere', 'Coach is assigned to another team');
  }
  if (incumbent && incumbent.id !== coachId && replaceExisting) {
    await tx.coach.update({ where: { id: incumbent.id }, data: { currentTeamId: null } });
  }
}

function audit(tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0], data: {
  entityId: string; action: 'COACH_UPDATED' | 'COACH_CREATED' | 'HEAD_COACH_ASSIGNED' | 'HEAD_COACH_UNASSIGNED';
  reason: string; before: unknown; after: unknown; changed: string[]; source: 'COMMISSIONER_UI' | 'COMMISSIONER_API';
}) {
  return tx.commissionerAuditLog.create({
    data: {
      entityType: 'COACH', entityId: data.entityId, action: data.action, reason: data.reason,
      beforeJson: JSON.stringify(data.before), afterJson: JSON.stringify(data.after),
      changedFieldsJson: JSON.stringify(data.changed), source: data.source,
    },
  });
}

export async function getCommissionerCoach(id: string) {
  const row = await prisma.coach.findUnique({ where: { id }, include: coachInclude });
  return row ? dto(row) : null;
}

export async function updateCommissionerCoach(id: string, input: CommissionerCoachEditInput, source: 'COMMISSIONER_UI' | 'COMMISSIONER_API' = 'COMMISSIONER_API') {
  const existing = await prisma.coach.findUnique({ where: { id }, include: coachInclude });
  if (!existing) throw new CommissionerHttpError(404, 'CoachNotFound', 'Coach not found');
  if (existing.updatedAt.toISOString() !== input.expectedUpdatedAt) {
    throw new CommissionerHttpError(409, 'EditConflict', 'Coach was modified since this editor was loaded.', { currentUpdatedAt: existing.updatedAt.toISOString() });
  }
  if (input.identity.nationalityCountryId && !await prisma.country.findUnique({ where: { id: input.identity.nationalityCountryId } })) {
    throw new CommissionerHttpError(404, 'CountryNotFound', 'Nationality country not found');
  }
  await prisma.$transaction(async (tx) => {
    await validateAssignment(tx, id, input.currentTeamId, input.replaceExisting, input.moveFromOtherTeam);
    const before = dto(existing);
    const updated = await tx.coach.update({ where: { id }, data: {
      ...input.identity, ...input.styles, ...input.ratings, currentTeamId: input.currentTeamId,
    }, include: coachInclude });
    await audit(tx, { entityId: id, action: 'COACH_UPDATED', reason: input.reason, before, after: dto(updated), changed: ['identity', 'styles', 'ratings', 'currentTeamId'], source });
  });
  return { item: await getCommissionerCoach(id) };
}

export async function createCommissionerCoach(input: CommissionerCoachCreateInput, source: 'COMMISSIONER_UI' | 'COMMISSIONER_API' = 'COMMISSIONER_API') {
  if (input.identity.nationalityCountryId && !await prisma.country.findUnique({ where: { id: input.identity.nationalityCountryId } })) {
    throw new CommissionerHttpError(404, 'CountryNotFound', 'Nationality country not found');
  }
  const coach = await prisma.$transaction(async (tx) => {
    await validateAssignment(tx, null, input.currentTeamId, input.replaceExisting, input.moveFromOtherTeam);
    const created = await tx.coach.create({ data: {
      ...input.identity, ...input.styles, ...input.ratings, currentTeamId: input.currentTeamId,
    }, include: coachInclude });
    await audit(tx, { entityId: created.id, action: 'COACH_CREATED', reason: input.reason, before: null, after: dto(created), changed: ['created'], source });
    return created;
  });
  return { item: dto(coach) };
}

export async function listCoachAudit(id: string, query: Record<string, unknown> = {}) {
  if (!await prisma.coach.findUnique({ where: { id }, select: { id: true } })) return null;
  const pagination = parsePagination(query);
  if (isErrorResult(pagination)) throw new CommissionerHttpError(400, 'InvalidRequest', pagination.error);
  const where = { entityType: 'COACH' as const, entityId: id };
  const [total, rows] = await Promise.all([
    prisma.commissionerAuditLog.count({ where }),
    prisma.commissionerAuditLog.findMany({ where, orderBy: { createdAt: 'desc' }, skip: pagination.skip, take: pagination.pageSize }),
  ]);
  return { items: rows.map((row) => ({ ...row, createdAt: row.createdAt.toISOString(), before: JSON.parse(row.beforeJson), after: JSON.parse(row.afterJson), changedFields: JSON.parse(row.changedFieldsJson) })), page: pagination.page, pageSize: pagination.pageSize, total };
}
