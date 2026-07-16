import { createHash } from 'node:crypto';
import type { Prisma, PrismaClient } from '@prisma/client';
import { defaultOffseasonConfig, validateOffseasonConfig, type OffseasonConfig } from '@fhm/engine';

export type OffseasonDbClient = PrismaClient | Prisma.TransactionClient;

export const OFFSEASON_DEFAULT_PRESET_NAME = 'Offseason Default';
export const canonicalOffseasonConfig = (config: OffseasonConfig) => JSON.stringify(config);
export const hashOffseasonConfigDb = (config: OffseasonConfig) =>
  createHash('sha256').update(canonicalOffseasonConfig(config)).digest('hex');

/**
 * Idempotent bootstrap of the default offseason configuration. Creates one
 * preset/version only when no owner configuration exists; preserves any existing
 * owner configuration untouched. Creates no OffseasonRun and performs no domain
 * operations.
 */
export async function bootstrapOffseasonConfiguration(client: OffseasonDbClient) {
  let preset = await client.offseasonPreset.findFirst({
    where: { name: OFFSEASON_DEFAULT_PRESET_NAME, isSystem: true },
    include: { versions: { orderBy: { versionNumber: 'desc' } } },
  });
  if (!preset) {
    const config = defaultOffseasonConfig();
    preset = await client.offseasonPreset.create({
      data: {
        name: OFFSEASON_DEFAULT_PRESET_NAME,
        description: 'Default fictional offseason workflow; required phases cannot be skipped',
        isSystem: true,
        versions: {
          create: {
            versionNumber: 1,
            schemaVersion: 1,
            configJson: canonicalOffseasonConfig(config),
            configHash: hashOffseasonConfigDb(config),
            changeReason: 'Bootstrap F30 default offseason configuration',
          },
        },
      },
      include: { versions: { orderBy: { versionNumber: 'desc' } } },
    });
  }
  await client.activeOffseasonConfiguration.upsert({
    where: { id: 'default' },
    create: { id: 'default', activePresetVersionId: preset.versions[0]!.id },
    update: {},
  });
  return { presetId: preset.id, versionId: preset.versions[0]!.id };
}

export async function getActiveOffseasonSnapshot(client: OffseasonDbClient) {
  let active = await client.activeOffseasonConfiguration.findUnique({
    where: { id: 'default' },
    include: { activeVersion: { include: { preset: true } } },
  });
  if (!active) {
    await bootstrapOffseasonConfiguration(client);
    active = await client.activeOffseasonConfiguration.findUniqueOrThrow({
      where: { id: 'default' },
      include: { activeVersion: { include: { preset: true } } },
    });
  }
  return {
    preset: { id: active.activeVersion.preset.id, name: active.activeVersion.preset.name },
    version: { id: active.activeVersion.id, versionNumber: active.activeVersion.versionNumber, configHash: active.activeVersion.configHash },
    config: validateOffseasonConfig(JSON.parse(active.activeVersion.configJson)),
  };
}

export async function listOffseasonConfigurations(client: OffseasonDbClient) {
  const active = await client.activeOffseasonConfiguration.findUnique({ where: { id: 'default' } });
  const items = await client.offseasonPreset.findMany({
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
