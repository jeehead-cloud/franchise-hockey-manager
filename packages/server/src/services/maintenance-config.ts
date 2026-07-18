import { createHash } from 'node:crypto';
import type { Prisma, PrismaClient } from '@prisma/client';
import {
  canonicalMaintenanceConfig,
  defaultMaintenanceConfig,
  hashMaintenanceConfig,
  validateMaintenanceConfig,
  type MaintenanceConfig,
} from '@fhm/engine';
import { maintenanceErrors } from './maintenance-errors.js';

export type MaintenanceDbClient = PrismaClient | Prisma.TransactionClient;

export const MAINTENANCE_DEFAULT_PRESET_NAME = 'Maintenance Default';

/**
 * The persisted config hash uses node:crypto SHA-256 (proves bytes on disk),
 * distinct from the engine's browser-safe digest. Both are deterministic.
 */
export const canonicalMaintenanceConfigJson = (config: MaintenanceConfig) => canonicalMaintenanceConfig(config);
export const hashMaintenanceConfigDb = (config: MaintenanceConfig) =>
  createHash('sha256').update(canonicalMaintenanceConfig(config)).digest('hex');
export const hashMaintenanceConfigEngine = hashMaintenanceConfig;

/**
 * Idempotent bootstrap of the default maintenance configuration. Creates one
 * preset/version only when no owner configuration exists; preserves any
 * existing owner configuration untouched. Creates no export/import/reset run
 * and performs no file or database operations.
 */
export async function bootstrapMaintenanceConfiguration(client: MaintenanceDbClient) {
  let preset = await client.maintenancePreset.findFirst({
    where: { name: MAINTENANCE_DEFAULT_PRESET_NAME, isSystem: true },
    include: { versions: { orderBy: { versionNumber: 'desc' } } },
  });
  if (!preset) {
    const config = defaultMaintenanceConfig();
    preset = await client.maintenancePreset.create({
      data: {
        name: MAINTENANCE_DEFAULT_PRESET_NAME,
        description: 'Default fictional maintenance configuration; local SQLite export/import/validation/reset',
        isSystem: true,
        versions: {
          create: {
            versionNumber: 1,
            schemaVersion: config.schemaVersion,
            configJson: canonicalMaintenanceConfigJson(config),
            configHash: hashMaintenanceConfigDb(config),
            changeReason: 'Bootstrap F33 default maintenance configuration',
          },
        },
      },
      include: { versions: { orderBy: { versionNumber: 'desc' } } },
    });
  }
  await client.activeMaintenanceConfiguration.upsert({
    where: { id: 'default' },
    create: { id: 'default', activePresetVersionId: preset.versions[0]!.id },
    update: {},
  });
  return { presetId: preset.id, versionId: preset.versions[0]!.id };
}

export interface ActiveMaintenanceSnapshot {
  preset: { id: string; name: string };
  version: { id: string; versionNumber: number; configHash: string };
  config: MaintenanceConfig;
}

export async function getActiveMaintenanceSnapshot(client: MaintenanceDbClient): Promise<ActiveMaintenanceSnapshot> {
  let active = await client.activeMaintenanceConfiguration.findUnique({
    where: { id: 'default' },
    include: { activeVersion: { include: { preset: true } } },
  });
  if (!active) {
    await bootstrapMaintenanceConfiguration(client);
    active = await client.activeMaintenanceConfiguration.findUniqueOrThrow({
      where: { id: 'default' },
      include: { activeVersion: { include: { preset: true } } },
    });
  }
  return {
    preset: { id: active.activeVersion.preset.id, name: active.activeVersion.preset.name },
    version: {
      id: active.activeVersion.id,
      versionNumber: active.activeVersion.versionNumber,
      configHash: active.activeVersion.configHash,
    },
    config: validateMaintenanceConfig(JSON.parse(active.activeVersion.configJson)),
  };
}

export async function listMaintenanceConfigurations(client: MaintenanceDbClient) {
  const active = await client.activeMaintenanceConfiguration.findUnique({ where: { id: 'default' } });
  const items = await client.maintenancePreset.findMany({
    include: { versions: { orderBy: { versionNumber: 'desc' } } },
    orderBy: [{ isSystem: 'desc' }, { name: 'asc' }],
  });
  return items.map((p) => ({
    id: p.id,
    name: p.name,
    description: p.description,
    isSystem: p.isSystem,
    versions: p.versions.map((v) => ({
      id: v.id,
      versionNumber: v.versionNumber,
      schemaVersion: v.schemaVersion,
      configHash: v.configHash,
      config: JSON.parse(v.configJson),
      isActive: v.id === active?.activePresetVersionId,
      createdAt: v.createdAt,
    })),
  }));
}

export async function loadMaintenanceConfigVersion(client: MaintenanceDbClient, versionId: string) {
  const version = await client.maintenancePresetVersion.findUnique({
    where: { id: versionId },
    include: { preset: true },
  });
  if (!version) {
    throw maintenanceErrors.configNotFound(versionId);
  }
  return {
    version: { id: version.id, versionNumber: version.versionNumber, configHash: version.configHash, presetName: version.preset.name },
    config: validateMaintenanceConfig(JSON.parse(version.configJson)),
  };
}
