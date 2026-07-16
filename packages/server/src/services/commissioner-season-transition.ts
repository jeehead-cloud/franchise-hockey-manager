import type { CommissionerAuditSource } from '@prisma/client';
import { validateSeasonTransitionConfig } from '@fhm/engine';
import { prisma } from '../db/client.js';
import {
  canonicalSeasonTransitionConfig,
  hashSeasonTransitionConfigDb,
} from './season-transition-config.js';
import { SeasonTransitionHttpError } from './season-transition-errors.js';

async function audit(entityType: string, entityId: string, action: string, reason: string, before: unknown, after: unknown, source: CommissionerAuditSource) {
  await prisma.commissionerAuditLog.create({
    data: {
      entityType: entityType as never,
      entityId,
      action: action as never,
      reason,
      beforeJson: JSON.stringify(before),
      afterJson: JSON.stringify(after),
      changedFieldsJson: JSON.stringify(['seasonTransitionSystem']),
      source,
    },
  });
}

export async function createSeasonTransitionPreset(input: { name: string; description?: string | null; config: unknown; activate?: boolean; reason: string }, source: CommissionerAuditSource) {
  const config = validateSeasonTransitionConfig(input.config);
  if (await prisma.seasonTransitionPreset.findUnique({ where: { name: input.name } })) {
    throw new SeasonTransitionHttpError(409, 'InvalidSeasonTransitionConfiguration', 'Configuration name already exists');
  }
  const preset = await prisma.seasonTransitionPreset.create({
    data: {
      name: input.name,
      description: input.description,
      isSystem: false,
      versions: {
        create: {
          versionNumber: 1,
          schemaVersion: 1,
          configJson: canonicalSeasonTransitionConfig(config),
          configHash: hashSeasonTransitionConfigDb(config),
          changeReason: input.reason,
          createdBySource: source,
        },
      },
    },
    include: { versions: true },
  });
  await audit('SEASON_TRANSITION_CONFIG', preset.id, 'SEASON_TRANSITION_CONFIG_CREATED', input.reason, null, { name: preset.name }, source);
  if (input.activate) await activateSeasonTransitionVersion(preset.versions[0]!.id, input.reason, source);
  return preset;
}

export async function createSeasonTransitionVersion(presetId: string, input: { config: unknown; activate?: boolean; reason: string }, source: CommissionerAuditSource) {
  const config = validateSeasonTransitionConfig(input.config);
  const preset = await prisma.seasonTransitionPreset.findUnique({
    where: { id: presetId },
    include: { versions: { orderBy: { versionNumber: 'desc' }, take: 1 } },
  });
  if (!preset) throw new SeasonTransitionHttpError(404, 'SeasonTransitionConfigurationNotFound', 'Configuration not found');
  const version = await prisma.seasonTransitionPresetVersion.create({
    data: {
      presetId,
      versionNumber: (preset.versions[0]?.versionNumber ?? 0) + 1,
      schemaVersion: 1,
      configJson: canonicalSeasonTransitionConfig(config),
      configHash: hashSeasonTransitionConfigDb(config),
      changeReason: input.reason,
      createdBySource: source,
    },
  });
  await audit('SEASON_TRANSITION_CONFIG', version.id, 'SEASON_TRANSITION_CONFIG_VERSION_CREATED', input.reason, null, { presetId, versionNumber: version.versionNumber }, source);
  if (input.activate) await activateSeasonTransitionVersion(version.id, input.reason, source);
  return version;
}

export async function activateSeasonTransitionVersion(versionId: string, reason: string, source: CommissionerAuditSource) {
  const version = await prisma.seasonTransitionPresetVersion.findUnique({ where: { id: versionId }, include: { preset: true } });
  if (!version) throw new SeasonTransitionHttpError(404, 'SeasonTransitionConfigurationNotFound', 'Configuration version not found');
  await prisma.activeSeasonTransitionConfiguration.upsert({
    where: { id: 'default' },
    create: { id: 'default', activePresetVersionId: versionId },
    update: { activePresetVersionId: versionId },
  });
  await audit('SEASON_TRANSITION_CONFIG', versionId, 'SEASON_TRANSITION_CONFIG_ACTIVATED', reason, null, { presetId: version.presetId, versionNumber: version.versionNumber }, source);
  return version;
}

/** Audit a run-level action (prepare/execute/cancel) at the orchestration layer. */
export async function auditSeasonTransitionRun(entityType: 'SEASON_TRANSITION_RUN' | 'WORLD_SEASON', entityId: string, action: string, reason: string, after: unknown, source: CommissionerAuditSource) {
  return audit(entityType, entityId, action, reason, null, after, source);
}
