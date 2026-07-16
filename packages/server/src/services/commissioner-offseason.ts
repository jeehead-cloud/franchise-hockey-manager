import type { CommissionerAuditSource } from '@prisma/client';
import { validateOffseasonConfig } from '@fhm/engine';
import { prisma } from '../db/client.js';
import {
  canonicalOffseasonConfig,
  hashOffseasonConfigDb,
} from './offseason-config.js';
import { OffseasonHttpError } from './offseason-errors.js';

async function audit(entityType: string, entityId: string, action: string, reason: string, before: unknown, after: unknown, source: CommissionerAuditSource) {
  await prisma.commissionerAuditLog.create({
    data: {
      entityType: entityType as never,
      entityId,
      action: action as never,
      reason,
      beforeJson: JSON.stringify(before),
      afterJson: JSON.stringify(after),
      changedFieldsJson: JSON.stringify(['offseasonSystem']),
      source,
    },
  });
}

export async function createOffseasonPreset(input: { name: string; description?: string | null; config: unknown; activate?: boolean; reason: string }, source: CommissionerAuditSource) {
  const config = validateOffseasonConfig(input.config);
  if (await prisma.offseasonPreset.findUnique({ where: { name: input.name } })) {
    throw new OffseasonHttpError(409, 'InvalidOffseasonConfiguration', 'Configuration name already exists');
  }
  const preset = await prisma.offseasonPreset.create({
    data: {
      name: input.name,
      description: input.description,
      isSystem: false,
      versions: {
        create: {
          versionNumber: 1,
          schemaVersion: 1,
          configJson: canonicalOffseasonConfig(config),
          configHash: hashOffseasonConfigDb(config),
          changeReason: input.reason,
          createdBySource: source,
        },
      },
    },
    include: { versions: true },
  });
  await audit('OFFSEASON_CONFIG', preset.id, 'OFFSEASON_CONFIG_CREATED', input.reason, null, { name: preset.name }, source);
  if (input.activate) await activateOffseasonVersion(preset.versions[0]!.id, input.reason, source);
  return preset;
}

export async function createOffseasonVersion(presetId: string, input: { config: unknown; activate?: boolean; reason: string }, source: CommissionerAuditSource) {
  const config = validateOffseasonConfig(input.config);
  const preset = await prisma.offseasonPreset.findUnique({
    where: { id: presetId },
    include: { versions: { orderBy: { versionNumber: 'desc' }, take: 1 } },
  });
  if (!preset) throw new OffseasonHttpError(404, 'InvalidOffseasonConfiguration', 'Configuration not found');
  const version = await prisma.offseasonPresetVersion.create({
    data: {
      presetId,
      versionNumber: (preset.versions[0]?.versionNumber ?? 0) + 1,
      schemaVersion: 1,
      configJson: canonicalOffseasonConfig(config),
      configHash: hashOffseasonConfigDb(config),
      changeReason: input.reason,
      createdBySource: source,
    },
  });
  await audit('OFFSEASON_CONFIG', version.id, 'OFFSEASON_CONFIG_VERSION_CREATED', input.reason, null, { presetId, versionNumber: version.versionNumber }, source);
  if (input.activate) await activateOffseasonVersion(version.id, input.reason, source);
  return version;
}

export async function activateOffseasonVersion(versionId: string, reason: string, source: CommissionerAuditSource) {
  const version = await prisma.offseasonPresetVersion.findUnique({ where: { id: versionId }, include: { preset: true } });
  if (!version) throw new OffseasonHttpError(404, 'InvalidOffseasonConfiguration', 'Configuration version not found');
  await prisma.activeOffseasonConfiguration.upsert({
    where: { id: 'default' },
    create: { id: 'default', activePresetVersionId: versionId },
    update: { activePresetVersionId: versionId },
  });
  await audit('OFFSEASON_CONFIG', versionId, 'OFFSEASON_CONFIG_ACTIVATED', reason, null, { presetId: version.presetId, versionNumber: version.versionNumber }, source);
  return version;
}

/** Audit a run-level action (start/complete/cancel) at the orchestration layer. */
export async function auditOffseasonRun(entityType: 'OFFSEASON_RUN' | 'OFFSEASON_PHASE', entityId: string, action: string, reason: string, after: unknown, source: CommissionerAuditSource) {
  return audit(entityType, entityId, action, reason, null, after, source);
}
