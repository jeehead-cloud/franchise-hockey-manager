import { createHash } from 'node:crypto';
import type { Prisma, PrismaClient } from '@prisma/client';
import {
  canonicalBackupConfig,
  defaultBackupConfig,
  hashBackupConfig,
  validateBackupConfig,
  type BackupConfig,
} from '@fhm/engine';
import { backupErrors } from './backup-errors.js';

export type BackupDbClient = PrismaClient | Prisma.TransactionClient;

export const BACKUP_DEFAULT_PRESET_NAME = 'Backup Default';

/**
 * The persisted config hash uses node:crypto SHA-256 (proves bytes on disk),
 * distinct from the engine's browser-safe digest. Both are deterministic.
 */
export const canonicalBackupConfigJson = (config: BackupConfig) => canonicalBackupConfig(config);
export const hashBackupConfigDb = (config: BackupConfig) =>
  createHash('sha256').update(canonicalBackupConfig(config)).digest('hex');
export const hashBackupConfigEngine = hashBackupConfig;

/**
 * Idempotent bootstrap of the default backup configuration. Creates one
 * preset/version only when no owner configuration exists; preserves any
 * existing owner configuration untouched. Creates no DatabaseBackup and
 * performs no file or database operations.
 */
export async function bootstrapBackupConfiguration(client: BackupDbClient) {
  let preset = await client.backupPreset.findFirst({
    where: { name: BACKUP_DEFAULT_PRESET_NAME, isSystem: true },
    include: { versions: { orderBy: { versionNumber: 'desc' } } },
  });
  if (!preset) {
    const config = defaultBackupConfig();
    preset = await client.backupPreset.create({
      data: {
        name: BACKUP_DEFAULT_PRESET_NAME,
        description: 'Default fictional backup/recovery configuration; SQLite-only local safety copies',
        isSystem: true,
        versions: {
          create: {
            versionNumber: 1,
            schemaVersion: config.schemaVersion,
            configJson: canonicalBackupConfigJson(config),
            configHash: hashBackupConfigDb(config),
            changeReason: 'Bootstrap F32 default backup configuration',
          },
        },
      },
      include: { versions: { orderBy: { versionNumber: 'desc' } } },
    });
  }
  await client.activeBackupConfiguration.upsert({
    where: { id: 'default' },
    create: { id: 'default', activePresetVersionId: preset.versions[0]!.id },
    update: {},
  });
  return { presetId: preset.id, versionId: preset.versions[0]!.id };
}

export interface ActiveBackupSnapshot {
  preset: { id: string; name: string };
  version: { id: string; versionNumber: number; configHash: string };
  config: BackupConfig;
}

export async function getActiveBackupSnapshot(client: BackupDbClient): Promise<ActiveBackupSnapshot> {
  let active = await client.activeBackupConfiguration.findUnique({
    where: { id: 'default' },
    include: { activeVersion: { include: { preset: true } } },
  });
  if (!active) {
    await bootstrapBackupConfiguration(client);
    active = await client.activeBackupConfiguration.findUniqueOrThrow({
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
    config: validateBackupConfig(JSON.parse(active.activeVersion.configJson)),
  };
}

export async function listBackupConfigurations(client: BackupDbClient) {
  const active = await client.activeBackupConfiguration.findUnique({ where: { id: 'default' } });
  const items = await client.backupPreset.findMany({
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

export async function loadBackupConfigVersion(client: BackupDbClient, versionId: string) {
  const version = await client.backupPresetVersion.findUnique({
    where: { id: versionId },
    include: { preset: true },
  });
  if (!version) {
    throw backupErrors.configNotFound(versionId);
  }
  return {
    version: { id: version.id, versionNumber: version.versionNumber, configHash: version.configHash, presetName: version.preset.name },
    config: validateBackupConfig(JSON.parse(version.configJson)),
  };
}
