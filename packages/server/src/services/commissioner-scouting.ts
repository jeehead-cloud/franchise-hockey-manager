import type {
  CommissionerAuditAction,
  CommissionerAuditEntityType,
  CommissionerAuditSource,
  Prisma,
  ScoutStatus,
} from '@prisma/client';
import { validateScoutingConfig } from '@fhm/engine';
import { CommissionerHttpError } from '../commissioner/errors.js';
import { prisma } from '../db/client.js';
import { canonicalScoutingConfig, hashScoutingConfig } from './scouting-config.js';

type ScoutFields = {
  firstName: string;
  lastName: string;
  evaluatingRating: number;
  potentialRating: number;
  skaterRating: number;
  goalieRating: number;
  specialties: string[];
  countryFamiliarity: Record<string, number>;
  positionFamiliarity: Record<string, number>;
  persistentBias: number;
  status?: ScoutStatus;
};

function assertExpectedUpdatedAt(current: Date, expected: string) {
  if (current.toISOString() !== expected) {
    throw new CommissionerHttpError(409, 'EditConflict', 'The record was modified since it was loaded', {
      currentUpdatedAt: current.toISOString(),
    });
  }
}

async function audit(
  tx: Prisma.TransactionClient,
  entityType: CommissionerAuditEntityType,
  entityId: string,
  action: CommissionerAuditAction,
  reason: string,
  before: unknown,
  after: unknown,
  changedFields: string[],
  source: CommissionerAuditSource,
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

function scoutData(input: Partial<ScoutFields>) {
  return {
    ...(input.firstName !== undefined ? { firstName: input.firstName } : {}),
    ...(input.lastName !== undefined ? { lastName: input.lastName } : {}),
    ...(input.status !== undefined ? { status: input.status } : {}),
    ...(input.evaluatingRating !== undefined ? { evaluatingRating: input.evaluatingRating } : {}),
    ...(input.potentialRating !== undefined ? { potentialRating: input.potentialRating } : {}),
    ...(input.skaterRating !== undefined ? { skaterRating: input.skaterRating } : {}),
    ...(input.goalieRating !== undefined ? { goalieRating: input.goalieRating } : {}),
    ...(input.persistentBias !== undefined ? { persistentBias: input.persistentBias } : {}),
    ...(input.specialties !== undefined ? { specialtiesJson: JSON.stringify(input.specialties) } : {}),
    ...(input.countryFamiliarity !== undefined
      ? { countryFamiliarityJson: JSON.stringify(input.countryFamiliarity) }
      : {}),
    ...(input.positionFamiliarity !== undefined
      ? { positionFamiliarityJson: JSON.stringify(input.positionFamiliarity) }
      : {}),
  };
}

export async function createScout(input: ScoutFields & { reason: string }, source: CommissionerAuditSource) {
  return prisma.$transaction(async (tx) => {
    const row = await tx.scout.create({
      data: { ...scoutData(input), sourceType: 'COMMISSIONER', createdBySource: source } as Prisma.ScoutCreateInput,
    });
    await audit(tx, 'SCOUT', row.id, 'SCOUT_CREATED', input.reason, null, row, Object.keys(scoutData(input)), source);
    return row;
  });
}

export async function updateScout(
  scoutId: string,
  input: Partial<ScoutFields> & { expectedUpdatedAt: string; reason: string },
  source: CommissionerAuditSource,
) {
  return prisma.$transaction(async (tx) => {
    const before = await tx.scout.findUnique({ where: { id: scoutId } });
    if (!before) throw new CommissionerHttpError(404, 'ScoutNotFound', 'Scout not found');
    assertExpectedUpdatedAt(before.updatedAt, input.expectedUpdatedAt);
    const data = scoutData(input);
    if (!Object.keys(data).length) throw new CommissionerHttpError(400, 'NoChanges', 'No scout fields changed');
    const after = await tx.scout.update({ where: { id: scoutId }, data });
    await audit(tx, 'SCOUT', scoutId, 'SCOUT_UPDATED', input.reason, before, after, Object.keys(data), source);
    return after;
  });
}

export async function deleteOrInactivateScout(
  scoutId: string,
  reason: string,
  source: CommissionerAuditSource,
) {
  return prisma.$transaction(async (tx) => {
    const before = await tx.scout.findUnique({
      where: { id: scoutId },
      include: {
        _count: { select: { observations: true, assignmentScouts: true, departmentAssignments: true } },
      },
    });
    if (!before) throw new CommissionerHttpError(404, 'ScoutNotFound', 'Scout not found');
    const hasHistory = before._count.observations > 0 || before._count.assignmentScouts > 0;
    if (hasHistory) {
      const after = await tx.scout.update({ where: { id: scoutId }, data: { status: 'INACTIVE' } });
      await audit(tx, 'SCOUT', scoutId, 'SCOUT_INACTIVATED', reason, before, after, ['status'], source);
      return { deleted: false, scout: after };
    }
    if (before._count.departmentAssignments > 0) {
      throw new CommissionerHttpError(
        409,
        'ScoutAssignedToDepartment',
        'Remove the scout from its department before deleting it',
      );
    }
    await tx.scout.delete({ where: { id: scoutId } });
    await audit(tx, 'SCOUT', scoutId, 'SCOUT_DELETED', reason, before, null, [], source);
    return { deleted: true, scout: null };
  });
}

export async function createDepartment(
  input: { teamId: string; name: string; scoutIds: string[]; reason: string },
  source: CommissionerAuditSource,
) {
  return prisma.$transaction(async (tx) => {
    const team = await tx.team.findUnique({ where: { id: input.teamId } });
    if (!team || team.teamType !== 'CLUB') {
      throw new CommissionerHttpError(422, 'ClubTeamRequired', 'Departments require a club team');
    }
    const activeScouts = await tx.scout.count({ where: { id: { in: input.scoutIds }, status: 'ACTIVE' } });
    if (activeScouts !== new Set(input.scoutIds).size) {
      throw new CommissionerHttpError(422, 'ActiveScoutsRequired', 'All department scouts must exist and be active');
    }
    const row = await tx.scoutingDepartment.create({
      data: {
        teamId: input.teamId,
        name: input.name,
        scouts: {
          create: [...new Set(input.scoutIds)].map((scoutId, index) => ({
            scoutId,
            role: index === 0 ? 'PRIMARY' : 'ASSISTANT',
          })),
        },
      },
      include: { scouts: true },
    });
    await audit(
      tx,
      'SCOUTING_DEPARTMENT',
      row.id,
      'SCOUTING_DEPARTMENT_CREATED',
      input.reason,
      null,
      row,
      ['teamId', 'name', 'scouts'],
      source,
    );
    return row;
  });
}

export async function updateDepartment(
  departmentId: string,
  input: { expectedUpdatedAt: string; reason: string; name?: string; scoutIds?: string[] },
  source: CommissionerAuditSource,
) {
  return prisma.$transaction(async (tx) => {
    const before = await tx.scoutingDepartment.findUnique({
      where: { id: departmentId },
      include: { scouts: true },
    });
    if (!before) throw new CommissionerHttpError(404, 'ScoutingDepartmentNotFound', 'Scouting department not found');
    assertExpectedUpdatedAt(before.updatedAt, input.expectedUpdatedAt);
    if (input.name === undefined && input.scoutIds === undefined) {
      throw new CommissionerHttpError(400, 'NoChanges', 'No department fields changed');
    }
    if (input.scoutIds) {
      const uniqueIds = [...new Set(input.scoutIds)];
      const activeScouts = await tx.scout.count({ where: { id: { in: uniqueIds }, status: 'ACTIVE' } });
      if (activeScouts !== uniqueIds.length) {
        throw new CommissionerHttpError(422, 'ActiveScoutsRequired', 'All department scouts must exist and be active');
      }
    }
    const after = await tx.scoutingDepartment.update({
      where: { id: departmentId },
      data: {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.scoutIds !== undefined
          ? {
              scouts: {
                deleteMany: {},
                create: [...new Set(input.scoutIds)].map((scoutId, index) => ({
                  scoutId,
                  role: index === 0 ? 'PRIMARY' : 'ASSISTANT',
                })),
              },
            }
          : {}),
      },
      include: { scouts: true },
    });
    const changed = [input.name !== undefined ? 'name' : null, input.scoutIds !== undefined ? 'scouts' : null].filter(
      (value): value is string => value !== null,
    );
    await audit(tx, 'SCOUTING_DEPARTMENT', departmentId, 'SCOUTING_DEPARTMENT_UPDATED', input.reason, before, after, changed, source);
    return after;
  });
}

export async function deleteDepartment(
  departmentId: string,
  reason: string,
  source: CommissionerAuditSource,
) {
  return prisma.$transaction(async (tx) => {
    const before = await tx.scoutingDepartment.findUnique({
      where: { id: departmentId },
      include: { scouts: true },
    });
    if (!before) throw new CommissionerHttpError(404, 'ScoutingDepartmentNotFound', 'Scouting department not found');
    if (await tx.scoutingAssignment.count({ where: { teamId: before.teamId } })) {
      throw new CommissionerHttpError(
        409,
        'ScoutingDepartmentHasAssignmentHistory',
        'Departments with scouting assignment history cannot be deleted',
      );
    }
    await tx.scoutingDepartment.delete({ where: { id: departmentId } });
    await audit(tx, 'SCOUTING_DEPARTMENT', departmentId, 'SCOUTING_DEPARTMENT_DELETED', reason, before, null, [], source);
  });
}

async function activateVersion(
  tx: Prisma.TransactionClient,
  versionId: string,
  reason: string,
  source: CommissionerAuditSource,
) {
  const before = await tx.activeScoutingConfiguration.findUnique({ where: { id: 'default' } });
  const after = await tx.activeScoutingConfiguration.upsert({
    where: { id: 'default' },
    create: { id: 'default', activePresetVersionId: versionId },
    update: { activePresetVersionId: versionId },
  });
  await audit(
    tx,
    'SCOUTING_CONFIG_VERSION',
    versionId,
    'SCOUTING_CONFIG_ACTIVATED',
    reason,
    before,
    after,
    ['activePresetVersionId'],
    source,
  );
}

export async function createScoutingPreset(
  input: { name: string; description?: string | null; config: unknown; activate?: boolean; reason: string },
  source: CommissionerAuditSource,
) {
  const config = validateScoutingConfig(input.config);
  return prisma.$transaction(async (tx) => {
    const preset = await tx.scoutingPreset.create({
      data: {
        name: input.name,
        description: input.description,
        versions: {
          create: {
            versionNumber: 1,
            schemaVersion: config.schemaVersion,
            configJson: canonicalScoutingConfig(config),
            configHash: hashScoutingConfig(config),
            changeReason: input.reason,
            createdBySource: source,
          },
        },
      },
      include: { versions: true },
    });
    await audit(tx, 'SCOUTING_CONFIG', preset.id, 'SCOUTING_CONFIG_CREATED', input.reason, null, preset, ['name', 'description', 'versions'], source);
    if (input.activate) await activateVersion(tx, preset.versions[0]!.id, input.reason, source);
    return preset;
  });
}

export async function createScoutingPresetVersion(
  presetId: string,
  input: { config: unknown; activate?: boolean; reason: string },
  source: CommissionerAuditSource,
) {
  const config = validateScoutingConfig(input.config);
  return prisma.$transaction(async (tx) => {
    const latest = await tx.scoutingPresetVersion.findFirst({
      where: { presetId },
      orderBy: { versionNumber: 'desc' },
    });
    if (!latest) throw new CommissionerHttpError(404, 'ScoutingPresetNotFound', 'Scouting preset not found');
    const version = await tx.scoutingPresetVersion.create({
      data: {
        presetId,
        versionNumber: latest.versionNumber + 1,
        schemaVersion: config.schemaVersion,
        configJson: canonicalScoutingConfig(config),
        configHash: hashScoutingConfig(config),
        changeReason: input.reason,
        createdBySource: source,
      },
    });
    await audit(tx, 'SCOUTING_CONFIG_VERSION', version.id, 'SCOUTING_CONFIG_VERSION_CREATED', input.reason, latest, version, ['versionNumber', 'configJson', 'configHash'], source);
    if (input.activate) await activateVersion(tx, version.id, input.reason, source);
    return version;
  });
}

export async function activateScoutingPresetVersion(
  versionId: string,
  reason: string,
  source: CommissionerAuditSource,
) {
  return prisma.$transaction(async (tx) => {
    const version = await tx.scoutingPresetVersion.findUnique({ where: { id: versionId } });
    if (!version) {
      throw new CommissionerHttpError(404, 'ScoutingConfigVersionNotFound', 'Scouting config version not found');
    }
    await activateVersion(tx, versionId, reason, source);
    return version;
  });
}
