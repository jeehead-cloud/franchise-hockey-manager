import type { CommissionerAuditSource } from '@prisma/client';
import {
  defaultMaintenanceConfig,
  validateMaintenanceConfig,
  type MaintenanceConfig,
} from '@fhm/engine';
import { prisma } from '../db/client.js';
import { maintenanceErrors } from './maintenance-errors.js';
import {
  canonicalMaintenanceConfigJson,
  hashMaintenanceConfigDb,
  bootstrapMaintenanceConfiguration,
  listMaintenanceConfigurations,
  loadMaintenanceConfigVersion,
  getActiveMaintenanceSnapshot,
} from './maintenance-config.js';
import { auditMaintenance } from './maintenance-history.js';

// Re-exports for the routes layer.
export { bootstrapMaintenanceConfiguration, listMaintenanceConfigurations, loadMaintenanceConfigVersion, getActiveMaintenanceSnapshot };

export async function createMaintenancePreset(input: {
  name: string;
  description?: string | null;
  config: unknown;
  activate?: boolean;
  reason: string;
}, source: CommissionerAuditSource) {
  const config = validateMaintenanceConfig(input.config);
  const existing = await prisma.maintenancePreset.findUnique({ where: { name: input.name } });
  if (existing) throw maintenanceErrors.invalidRequest(`Preset name already exists: ${input.name}`);
  const created = await prisma.maintenancePreset.create({
    data: {
      name: input.name,
      description: input.description ?? null,
      isSystem: false,
      versions: {
        create: {
          versionNumber: 1,
          schemaVersion: config.schemaVersion,
          configJson: canonicalMaintenanceConfigJson(config),
          configHash: hashMaintenanceConfigDb(config),
          changeReason: input.reason,
          createdBySource: source,
        },
      },
    },
    include: { versions: { orderBy: { versionNumber: 'desc' } } },
  });
  if (input.activate) {
    await prisma.activeMaintenanceConfiguration.upsert({
      where: { id: 'default' },
      create: { id: 'default', activePresetVersionId: created.versions[0]!.id },
      update: { activePresetVersionId: created.versions[0]!.id },
    });
  }
  await auditMaintenance('MAINTENANCE_CONFIG', created.id, 'MAINTENANCE_CONFIG_CREATED', input.reason, null, { name: input.name }, source);
  return { presetId: created.id, versionId: created.versions[0]!.id };
}

export async function createMaintenanceVersion(input: {
  presetId: string;
  config: unknown;
  changeReason: string;
  activate?: boolean;
  reason: string;
}, source: CommissionerAuditSource) {
  const config = validateMaintenanceConfig(input.config);
  const preset = await prisma.maintenancePreset.findUnique({
    where: { id: input.presetId },
    include: { versions: { orderBy: { versionNumber: 'desc' }, take: 1 } },
  });
  if (!preset) throw maintenanceErrors.configNotFound(input.presetId);
  const versionNumber = (preset.versions[0]?.versionNumber ?? 0) + 1;
  const version = await prisma.maintenancePresetVersion.create({
    data: {
      presetId: preset.id,
      versionNumber,
      schemaVersion: config.schemaVersion,
      configJson: canonicalMaintenanceConfigJson(config),
      configHash: hashMaintenanceConfigDb(config),
      changeReason: input.changeReason || input.reason,
      createdBySource: source,
    },
  });
  if (input.activate) {
    await prisma.activeMaintenanceConfiguration.upsert({
      where: { id: 'default' },
      create: { id: 'default', activePresetVersionId: version.id },
      update: { activePresetVersionId: version.id },
    });
    await auditMaintenance('MAINTENANCE_CONFIG', version.id, 'MAINTENANCE_CONFIG_ACTIVATED', input.reason, null, { versionNumber }, source);
  }
  await auditMaintenance('MAINTENANCE_CONFIG', version.id, 'MAINTENANCE_CONFIG_VERSION_CREATED', input.reason, null, { presetId: preset.id, versionNumber }, source);
  return { versionId: version.id };
}

export async function activateMaintenanceVersion(versionId: string, reason: string, source: CommissionerAuditSource) {
  const version = await prisma.maintenancePresetVersion.findUnique({ where: { id: versionId } });
  if (!version) throw maintenanceErrors.configNotFound(versionId);
  await prisma.activeMaintenanceConfiguration.upsert({
    where: { id: 'default' },
    create: { id: 'default', activePresetVersionId: versionId },
    update: { activePresetVersionId: versionId },
  });
  await auditMaintenance('MAINTENANCE_CONFIG', versionId, 'MAINTENANCE_CONFIG_ACTIVATED', reason, null, { versionId }, source);
  return { versionId };
}

export function defaultConfigForUI(): MaintenanceConfig {
  return defaultMaintenanceConfig();
}
