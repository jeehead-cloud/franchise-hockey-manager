import { createHash } from 'node:crypto';
import type { Prisma, PrismaClient } from '@prisma/client';
import { defaultScoutingConfig, validateScoutingConfig, type ScoutingConfig } from '@fhm/engine';

export type DbClient = PrismaClient | Prisma.TransactionClient;
export const SCOUTING_DEFAULT_PRESET_NAME = 'Scouting Default v1';

async function db(): Promise<PrismaClient> {
  const { prisma } = await import('../db/client.js');
  return prisma;
}

export function canonicalScoutingConfig(config: ScoutingConfig): string {
  return JSON.stringify(config);
}

export function hashScoutingConfig(config: ScoutingConfig): string {
  return createHash('sha256').update(canonicalScoutingConfig(config)).digest('hex');
}

export async function bootstrapScoutingConfiguration(client?: DbClient) {
  const prisma = client ?? (await db());
  let preset = await prisma.scoutingPreset.findFirst({
    where: { name: SCOUTING_DEFAULT_PRESET_NAME, isSystem: true },
    include: { versions: { orderBy: { versionNumber: 'desc' } } },
  });
  if (!preset) {
    const config = defaultScoutingConfig();
    preset = await prisma.scoutingPreset.create({
      data: {
        name: SCOUTING_DEFAULT_PRESET_NAME,
        description: 'Default deterministic scouting calibration',
        isSystem: true,
        versions: { create: { versionNumber: 1, schemaVersion: config.schemaVersion, configJson: canonicalScoutingConfig(config), configHash: hashScoutingConfig(config), changeReason: 'Bootstrap Scouting Default v1' } },
      },
      include: { versions: { orderBy: { versionNumber: 'desc' } } },
    });
  }
  const version = preset.versions[0]!;
  await prisma.activeScoutingConfiguration.upsert({
    where: { id: 'default' },
    create: { id: 'default', activePresetVersionId: version.id },
    update: {},
  });
  return { presetId: preset.id, versionId: version.id };
}

export async function getActiveScoutingSnapshot() {
  const prisma = await db();
  let active = await prisma.activeScoutingConfiguration.findUnique({ where: { id: 'default' }, include: { activeVersion: { include: { preset: true } } } });
  if (!active) {
    await bootstrapScoutingConfiguration(prisma);
    active = await prisma.activeScoutingConfiguration.findUniqueOrThrow({ where: { id: 'default' }, include: { activeVersion: { include: { preset: true } } } });
  }
  return {
    preset: { id: active.activeVersion.preset.id, name: active.activeVersion.preset.name },
    version: { id: active.activeVersion.id, versionNumber: active.activeVersion.versionNumber, schemaVersion: active.activeVersion.schemaVersion, configHash: active.activeVersion.configHash },
    config: validateScoutingConfig(JSON.parse(active.activeVersion.configJson)),
  };
}

export async function listScoutingPresets() {
  const prisma = await db();
  const active = await prisma.activeScoutingConfiguration.findUnique({ where: { id: 'default' } });
  const items = await prisma.scoutingPreset.findMany({ include: { versions: { orderBy: { versionNumber: 'desc' }, take: 1 } }, orderBy: [{ isSystem: 'desc' }, { name: 'asc' }] });
  return items.map((preset) => ({ id: preset.id, name: preset.name, description: preset.description, isSystem: preset.isSystem, latestVersion: preset.versions[0] ? { id: preset.versions[0].id, versionNumber: preset.versions[0].versionNumber, configHash: preset.versions[0].configHash, isActive: preset.versions[0].id === active?.activePresetVersionId } : null }));
}

