import { createHash } from 'node:crypto';
import type { Prisma, PrismaClient } from '@prisma/client';
import { defaultDraftConfig, validateDraftConfig, type DraftConfig } from '@fhm/engine';

export type DbClient = PrismaClient | Prisma.TransactionClient;
export const DRAFT_DEFAULT_PRESET_NAME = 'Amateur Draft Default';

async function db(): Promise<PrismaClient> {
  const { prisma } = await import('../db/client.js');
  return prisma;
}

export function canonicalDraftConfig(config: DraftConfig): string {
  return JSON.stringify(config);
}

export function hashDraftConfigSha(config: DraftConfig): string {
  return createHash('sha256').update(canonicalDraftConfig(config)).digest('hex');
}

/** Idempotently bootstrap a fictional default draft preset (only when none exists). */
export async function bootstrapDraftConfiguration(client?: DbClient) {
  const prisma = client ?? (await db());
  let preset = await prisma.draftPreset.findFirst({
    where: { name: DRAFT_DEFAULT_PRESET_NAME, isSystem: true },
    include: { versions: { orderBy: { versionNumber: 'desc' } } },
  });
  if (!preset) {
    const config = defaultDraftConfig();
    preset = await prisma.draftPreset.create({
      data: {
        name: DRAFT_DEFAULT_PRESET_NAME,
        description: 'Default deterministic amateur draft configuration (fictional)',
        isSystem: true,
        versions: {
          create: {
            versionNumber: 1,
            schemaVersion: config.schemaVersion,
            configJson: canonicalDraftConfig(config),
            configHash: hashDraftConfigSha(config),
            changeReason: 'Bootstrap Amateur Draft Default',
          },
        },
      },
      include: { versions: { orderBy: { versionNumber: 'desc' } } },
    });
  }
  const version = preset.versions[0]!;
  await prisma.activeDraftConfiguration.upsert({
    where: { id: 'default' },
    create: { id: 'default', activePresetVersionId: version.id },
    update: {},
  });
  return { presetId: preset.id, versionId: version.id };
}

export async function getActiveDraftSnapshot() {
  const prisma = await db();
  let active = await prisma.activeDraftConfiguration.findUnique({
    where: { id: 'default' },
    include: { activeVersion: { include: { preset: true } } },
  });
  if (!active) {
    await bootstrapDraftConfiguration(prisma);
    active = await prisma.activeDraftConfiguration.findUniqueOrThrow({
      where: { id: 'default' },
      include: { activeVersion: { include: { preset: true } } },
    });
  }
  return {
    preset: { id: active.activeVersion.preset.id, name: active.activeVersion.preset.name },
    version: {
      id: active.activeVersion.id,
      versionNumber: active.activeVersion.versionNumber,
      schemaVersion: active.activeVersion.schemaVersion,
      configHash: active.activeVersion.configHash,
    },
    config: validateDraftConfig(JSON.parse(active.activeVersion.configJson)),
  };
}

export async function listDraftPresets() {
  const prisma = await db();
  const active = await prisma.activeDraftConfiguration.findUnique({ where: { id: 'default' } });
  const items = await prisma.draftPreset.findMany({
    include: { versions: { orderBy: { versionNumber: 'desc' }, take: 1 } },
    orderBy: [{ isSystem: 'desc' }, { name: 'asc' }],
  });
  return items.map((preset) => ({
    id: preset.id,
    name: preset.name,
    description: preset.description,
    isSystem: preset.isSystem,
    latestVersion: preset.versions[0]
      ? {
          id: preset.versions[0].id,
          versionNumber: preset.versions[0].versionNumber,
          configHash: preset.versions[0].configHash,
          isActive: preset.versions[0].id === active?.activePresetVersionId,
        }
      : null,
  }));
}
