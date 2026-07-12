import type { CommissionerAuditSource, Prisma } from '@prisma/client';
import { prisma } from '../db/client.js';
import { CommissionerHttpError } from '../commissioner/errors.js';
import type {
  CommissionerLineupAutoFillInput,
  CommissionerLineupSaveInput,
} from '../commissioner/schemas.js';
import {
  buildValidationForTeam,
  lineupPresenceFromValidation,
  loadTeamPlayersForLineup,
  mapAssignmentPlayer,
  runAutoLineup,
  serializeAssignments,
  toPrismaSlots,
  validationSummaryText,
} from './lineup-helpers.js';
import { getTeamLineup } from './lineups.js';
import { isLineupSlot, type LineupSlot } from '@fhm/engine';
import { parsePagination, isErrorResult } from './query.js';

async function audit(
  tx: Prisma.TransactionClient,
  teamId: string,
  action: 'LINEUP_CREATED' | 'LINEUP_UPDATED' | 'LINEUP_AUTO_FILLED' | 'LINEUP_CLEARED',
  reason: string,
  before: unknown,
  after: unknown,
  changedFields: string[],
  source: CommissionerAuditSource,
) {
  await tx.commissionerAuditLog.create({
    data: {
      entityType: 'TEAM_LINEUP',
      entityId: teamId,
      action,
      reason,
      beforeJson: JSON.stringify(before),
      afterJson: JSON.stringify(after),
      changedFieldsJson: JSON.stringify(changedFields),
      source,
      schemaVersion: 1,
    },
  });
}

function assertExpectedUpdatedAt(
  current: Date | null,
  expected: string | null,
) {
  if (current === null) {
    if (expected !== null) {
      throw new CommissionerHttpError(
        409,
        'EditConflict',
        'Lineup did not exist; expectedUpdatedAt must be null for create',
        { currentUpdatedAt: null },
      );
    }
    return;
  }
  if (expected === null || current.toISOString() !== expected) {
    throw new CommissionerHttpError(
      409,
      'EditConflict',
      'Lineup was modified elsewhere; reload and retry',
      { currentUpdatedAt: current.toISOString() },
    );
  }
}

export async function getCommissionerTeamLineup(teamId: string) {
  const base = await getTeamLineup(teamId);
  if (!base) return null;
  const players = await loadTeamPlayersForLineup(teamId);
  const assigned = new Set(base.assignments.map((a) => a.playerId));
  const eligible = players
    .map((p) => mapAssignmentPlayer(p, 'F1_C'))
    .filter((p) => p.eligible)
    .map((p) => ({
      ...p,
      assignedToLineup: assigned.has(p.id),
    }));
  return {
    ...base,
    expectedUpdatedAt: base.updatedAt,
    eligiblePlayers: eligible,
  };
}

export async function saveCommissionerTeamLineup(
  teamId: string,
  input: CommissionerLineupSaveInput,
  source: CommissionerAuditSource,
) {
  const team = await prisma.team.findUnique({ where: { id: teamId } });
  if (!team) return null;

  for (const row of input.assignments) {
    if (!isLineupSlot(row.slot)) {
      throw new CommissionerHttpError(400, 'InvalidSlot', `Unknown slot ${row.slot}`);
    }
  }

  const players = await loadTeamPlayersForLineup(teamId);
  const playerIds = new Set(players.map((p) => p.id));
  for (const row of input.assignments) {
    if (!playerIds.has(row.playerId)) {
      throw new CommissionerHttpError(
        400,
        'PlayerNotOnTeam',
        `Player ${row.playerId} is not on this team`,
        { playerId: row.playerId },
      );
    }
  }

  const validation = buildValidationForTeam(players, input.assignments);
  if (validation.status === 'INVALID') {
    throw new CommissionerHttpError(400, 'InvalidLineup', 'Lineup has blocking validation errors', {
      validation,
    });
  }

  const existing = await prisma.teamLineup.findUnique({
    where: { teamId },
    include: { assignments: true },
  });
  assertExpectedUpdatedAt(existing?.updatedAt ?? null, input.expectedUpdatedAt);

  const before = {
    assignments: existing ? serializeAssignments(existing.assignments) : [],
    validation: existing
      ? buildValidationForTeam(players, serializeAssignments(existing.assignments))
      : null,
  };

  const result = await prisma.$transaction(async (tx) => {
    let lineupId: string;
    let action: 'LINEUP_CREATED' | 'LINEUP_UPDATED' | 'LINEUP_CLEARED';
    if (!existing) {
      const created = await tx.teamLineup.create({
        data: { teamId, version: 1 },
      });
      lineupId = created.id;
      action = input.assignments.length === 0 ? 'LINEUP_CLEARED' : 'LINEUP_CREATED';
    } else {
      await tx.lineupAssignment.deleteMany({ where: { lineupId: existing.id } });
      await tx.teamLineup.update({
        where: { id: existing.id },
        data: { version: { increment: 1 } },
      });
      lineupId = existing.id;
      action =
        input.assignments.length === 0
          ? 'LINEUP_CLEARED'
          : existing.assignments.length === 0
            ? 'LINEUP_CREATED'
            : 'LINEUP_UPDATED';
    }

    if (input.assignments.length > 0) {
      await tx.lineupAssignment.createMany({
        data: toPrismaSlots(input.assignments).map((a) => ({
          lineupId,
          slot: a.slot,
          playerId: a.playerId,
        })),
      });
    }

    const afterValidation = buildValidationForTeam(players, input.assignments);
    const changedSlots = [
      ...new Set([
        ...before.assignments.map((a) => a.slot),
        ...input.assignments.map((a) => a.slot),
      ]),
    ].sort();

    await audit(
      tx,
      teamId,
      action,
      input.reason,
      {
        ...before,
        validationSummary: before.validation ? validationSummaryText(before.validation) : null,
      },
      {
        assignments: input.assignments,
        validation: afterValidation,
        validationSummary: validationSummaryText(afterValidation),
        sourceMode: 'MANUAL',
      },
      changedSlots,
      source,
    );

    return afterValidation;
  });

  const lineup = await getCommissionerTeamLineup(teamId);
  return { item: lineup, validation: result, presence: lineupPresenceFromValidation(true, result) };
}

export async function autoFillCommissionerTeamLineup(
  teamId: string,
  input: CommissionerLineupAutoFillInput,
  source: CommissionerAuditSource,
) {
  const team = await prisma.team.findUnique({ where: { id: teamId } });
  if (!team) return null;

  const players = await loadTeamPlayersForLineup(teamId);
  const existing = await prisma.teamLineup.findUnique({
    where: { teamId },
    include: { assignments: true },
  });
  assertExpectedUpdatedAt(existing?.updatedAt ?? null, input.expectedUpdatedAt);

  const existingAssignments = existing ? serializeAssignments(existing.assignments) : [];
  const generated = runAutoLineup(players, input.mode, existingAssignments);
  const validation = buildValidationForTeam(players, generated.assignments);
  if (validation.status === 'INVALID') {
    throw new CommissionerHttpError(400, 'InvalidLineup', 'Auto-lineup produced invalid assignments', {
      validation,
      generated,
    });
  }

  const before = {
    assignments: existingAssignments,
    validation: existing
      ? buildValidationForTeam(players, existingAssignments)
      : null,
  };

  await prisma.$transaction(async (tx) => {
    let lineupId: string;
    if (!existing) {
      const created = await tx.teamLineup.create({ data: { teamId, version: 1 } });
      lineupId = created.id;
    } else {
      await tx.lineupAssignment.deleteMany({ where: { lineupId: existing.id } });
      await tx.teamLineup.update({
        where: { id: existing.id },
        data: { version: { increment: 1 } },
      });
      lineupId = existing.id;
    }
    if (generated.assignments.length > 0) {
      await tx.lineupAssignment.createMany({
        data: toPrismaSlots(generated.assignments).map((a) => ({
          lineupId,
          slot: a.slot,
          playerId: a.playerId,
        })),
      });
    }
    await audit(
      tx,
      teamId,
      'LINEUP_AUTO_FILLED',
      input.reason,
      {
        ...before,
        validationSummary: before.validation ? validationSummaryText(before.validation) : null,
      },
      {
        assignments: generated.assignments,
        validation,
        validationSummary: validationSummaryText(validation),
        sourceMode: 'AUTO',
        autoMode: input.mode,
        unfilledSlots: generated.unfilledSlots,
        explanation: generated.explanation,
      },
      generated.assignments.map((a) => a.slot).sort(),
      source,
    );
  });

  const lineup = await getCommissionerTeamLineup(teamId);
  return {
    item: lineup,
    validation,
    auto: {
      mode: input.mode,
      unfilledSlots: generated.unfilledSlots,
      warnings: generated.warnings,
      explanation: generated.explanation,
    },
    presence: lineupPresenceFromValidation(true, validation),
  };
}

export async function listLineupAudit(teamId: string, query: Record<string, unknown>) {
  const team = await prisma.team.findUnique({ where: { id: teamId }, select: { id: true } });
  if (!team) return null;
  const pagination = parsePagination(query);
  if (isErrorResult(pagination)) throw new CommissionerHttpError(400, 'InvalidRequest', pagination.error);
  const [total, rows] = await Promise.all([
    prisma.commissionerAuditLog.count({
      where: { entityType: 'TEAM_LINEUP', entityId: teamId },
    }),
    prisma.commissionerAuditLog.findMany({
      where: { entityType: 'TEAM_LINEUP', entityId: teamId },
      orderBy: { createdAt: 'desc' },
      skip: pagination.skip,
      take: pagination.pageSize,
    }),
  ]);
  return {
    items: rows.map((r) => ({
      id: r.id,
      action: r.action,
      reason: r.reason,
      source: r.source,
      createdAt: r.createdAt.toISOString(),
      changedFields: JSON.parse(r.changedFieldsJson) as string[],
      before: JSON.parse(r.beforeJson),
      after: JSON.parse(r.afterJson),
    })),
    page: pagination.page,
    pageSize: pagination.pageSize,
    total,
  };
}
