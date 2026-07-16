import { createHash } from 'node:crypto';
import type { Prisma, PrismaClient } from '@prisma/client';
import {
  defaultSeasonTransitionConfig,
  validateSeasonTransitionConfig,
  type SeasonTransitionConfig,
} from '@fhm/engine';

export type SeasonTransitionDbClient = PrismaClient | Prisma.TransactionClient;

export const SEASON_TRANSITION_DEFAULT_PRESET_NAME = 'Season Transition Default';
export const canonicalSeasonTransitionConfig = (config: SeasonTransitionConfig) => JSON.stringify(config);
export const hashSeasonTransitionConfigDb = (config: SeasonTransitionConfig) =>
  createHash('sha256').update(canonicalSeasonTransitionConfig(config)).digest('hex');

/**
 * Idempotent bootstrap of the default season-transition configuration. Creates
 * one preset/version only when no owner configuration exists; preserves any
 * existing owner configuration untouched. Creates no SeasonTransitionRun and
 * performs no domain operations or next-WorldSeason creation.
 */
export async function bootstrapSeasonTransitionConfiguration(client: SeasonTransitionDbClient) {
  let preset = await client.seasonTransitionPreset.findFirst({
    where: { name: SEASON_TRANSITION_DEFAULT_PRESET_NAME, isSystem: true },
    include: { versions: { orderBy: { versionNumber: 'desc' } } },
  });
  if (!preset) {
    const config = defaultSeasonTransitionConfig();
    preset = await client.seasonTransitionPreset.create({
      data: {
        name: SEASON_TRANSITION_DEFAULT_PRESET_NAME,
        description: 'Default fictional season-transition workflow; creates one next WorldSeason',
        isSystem: true,
        versions: {
          create: {
            versionNumber: 1,
            schemaVersion: 1,
            configJson: canonicalSeasonTransitionConfig(config),
            configHash: hashSeasonTransitionConfigDb(config),
            changeReason: 'Bootstrap F31 default season-transition configuration',
          },
        },
      },
      include: { versions: { orderBy: { versionNumber: 'desc' } } },
    });
  }
  await client.activeSeasonTransitionConfiguration.upsert({
    where: { id: 'default' },
    create: { id: 'default', activePresetVersionId: preset.versions[0]!.id },
    update: {},
  });
  return { presetId: preset.id, versionId: preset.versions[0]!.id };
}

export async function getActiveSeasonTransitionSnapshot(client: SeasonTransitionDbClient) {
  let active = await client.activeSeasonTransitionConfiguration.findUnique({
    where: { id: 'default' },
    include: { activeVersion: { include: { preset: true } } },
  });
  if (!active) {
    await bootstrapSeasonTransitionConfiguration(client);
    active = await client.activeSeasonTransitionConfiguration.findUniqueOrThrow({
      where: { id: 'default' },
      include: { activeVersion: { include: { preset: true } } },
    });
  }
  return {
    preset: { id: active.activeVersion.preset.id, name: active.activeVersion.preset.name },
    version: { id: active.activeVersion.id, versionNumber: active.activeVersion.versionNumber, configHash: active.activeVersion.configHash },
    config: validateSeasonTransitionConfig(JSON.parse(active.activeVersion.configJson)),
  };
}

export async function listSeasonTransitionConfigurations(client: SeasonTransitionDbClient) {
  const active = await client.activeSeasonTransitionConfiguration.findUnique({ where: { id: 'default' } });
  const items = await client.seasonTransitionPreset.findMany({
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

/** Load a specific config version (used by prepare to pin a version). */
export async function loadSeasonTransitionConfigVersion(client: SeasonTransitionDbClient, versionId: string) {
  const version = await client.seasonTransitionPresetVersion.findUnique({
    where: { id: versionId },
    include: { preset: true },
  });
  if (!version) {
    return null;
  }
  return {
    version: { id: version.id, versionNumber: version.versionNumber, configHash: version.configHash, presetName: version.preset.name },
    config: validateSeasonTransitionConfig(JSON.parse(version.configJson)),
  };
}
