import fs from 'node:fs';
import path from 'node:path';
import type { CommissionerAuditSource, PrismaClient } from '@prisma/client';
import {
  canonicalBackupConfig,
  defaultBackupConfig,
  validateBackupConfig,
  type BackupConfig,
} from '@fhm/engine';
import { prisma } from '../db/client.js';
import { backupErrors } from './backup-errors.js';
import {
  BACKUP_DEFAULT_PRESET_NAME,
  canonicalBackupConfigJson,
  hashBackupConfigDb,
  bootstrapBackupConfiguration,
} from './backup-config.js';
import { verifyBackup } from './backup-verification.js';
import { ensureBackupRoot, resolveBackupFile } from './backup-paths.js';
import { getActiveBackupSnapshot } from './backup-config.js';

async function audit(
  entityType: string,
  entityId: string,
  action: string,
  reason: string,
  before: unknown,
  after: unknown,
  source: CommissionerAuditSource,
) {
  await prisma.commissionerAuditLog.create({
    data: {
      entityType: entityType as never,
      entityId,
      action: action as never,
      reason,
      beforeJson: JSON.stringify(before),
      afterJson: JSON.stringify(after),
      changedFieldsJson: JSON.stringify(['backupSystem']),
      source,
    },
  });
}

// ---------------------------------------------------------------------------
// Config CRUD (Commissioner)
// ---------------------------------------------------------------------------

export async function createBackupPreset(input: {
  name: string;
  description?: string | null;
  config: unknown;
  activate?: boolean;
  reason: string;
}, source: CommissionerAuditSource) {
  const config = validateBackupConfig(input.config);
  const existing = await prisma.backupPreset.findUnique({ where: { name: input.name } });
  if (existing) throw backupErrors.configNotFound(input.name);
  const created = await prisma.backupPreset.create({
    data: {
      name: input.name,
      description: input.description ?? null,
      isSystem: false,
      versions: {
        create: {
          versionNumber: 1,
          schemaVersion: config.schemaVersion,
          configJson: canonicalBackupConfigJson(config),
          configHash: hashBackupConfigDb(config),
          changeReason: input.reason,
          createdBySource: source,
        },
      },
    },
    include: { versions: { orderBy: { versionNumber: 'desc' } } },
  });
  if (input.activate) {
    await activateBackupVersion(created.versions[0]!.id, input.reason, source);
  }
  await audit('BACKUP_CONFIG', created.id, 'BACKUP_CONFIG_CREATED', input.reason, null, { name: created.name }, source);
  return created;
}

export async function createBackupVersion(presetId: string, input: {
  config: unknown;
  activate?: boolean;
  reason: string;
}, source: CommissionerAuditSource) {
  const preset = await prisma.backupPreset.findUnique({ where: { id: presetId }, include: { versions: true } });
  if (!preset) throw backupErrors.configNotFound(presetId);
  const config = validateBackupConfig(input.config);
  const nextVersion = preset.versions.length + 1;
  const version = await prisma.backupPresetVersion.create({
    data: {
      presetId,
      versionNumber: nextVersion,
      schemaVersion: config.schemaVersion,
      configJson: canonicalBackupConfigJson(config),
      configHash: hashBackupConfigDb(config),
      changeReason: input.reason,
      createdBySource: source,
    },
  });
  if (input.activate) {
    await activateBackupVersion(version.id, input.reason, source);
  }
  await audit('BACKUP_CONFIG', version.id, 'BACKUP_CONFIG_VERSION_CREATED', input.reason, null, { presetId, versionNumber: nextVersion }, source);
  return version;
}

export async function activateBackupVersion(versionId: string, reason: string, source: CommissionerAuditSource) {
  const version = await prisma.backupPresetVersion.findUnique({ where: { id: versionId } });
  if (!version) throw backupErrors.configNotFound(versionId);
  const before = await prisma.activeBackupConfiguration.findUnique({ where: { id: 'default' } });
  await prisma.activeBackupConfiguration.upsert({
    where: { id: 'default' },
    create: { id: 'default', activePresetVersionId: versionId },
    update: { activePresetVersionId: versionId },
  });
  await audit('BACKUP_CONFIG', versionId, 'BACKUP_CONFIG_ACTIVATED', reason, before, { versionId }, source);
  return version;
}

// ---------------------------------------------------------------------------
// Verify command (Commissioner)
// ---------------------------------------------------------------------------

export async function verifyBackupCommand(backupId: string, source: CommissionerAuditSource) {
  const backup = await prisma.databaseBackup.findUnique({ where: { id: backupId } });
  if (!backup) throw backupErrors.backupNotFound(backupId);
  const snapshot = await getActiveBackupSnapshot(prisma);
  const root = ensureBackupRoot(snapshot.config);
  const result = await verifyBackup(prisma, backup, root);
  // Update status to reflect reality (MISSING/CORRUPT detection).
  if (result.outcome === 'MISSING' && backup.status !== 'MISSING') {
    await prisma.databaseBackup.update({ where: { id: backupId }, data: { status: 'MISSING' } });
  } else if (result.outcome === 'CORRUPT' && backup.status !== 'CORRUPT') {
    await prisma.databaseBackup.update({ where: { id: backupId }, data: { status: 'CORRUPT' } });
  } else if (result.outcome === 'VERIFIED' && backup.status !== 'VERIFIED') {
    await prisma.databaseBackup.update({
      where: { id: backupId },
      data: { status: 'VERIFIED', verifiedAt: new Date() },
    });
  }
  await audit('DATABASE_BACKUP', backupId, 'BACKUP_VERIFIED', 'Manual re-verification', null, { outcome: result.outcome }, source);
  return result;
}

// ---------------------------------------------------------------------------
// Backup file download (Commissioner-only, VERIFIED only, safe filename)
// ---------------------------------------------------------------------------

export async function getBackupDownloadStream(backupId: string): Promise<{
  stream: fs.ReadStream;
  fileName: string;
  size: number;
}> {
  const backup = await prisma.databaseBackup.findUnique({ where: { id: backupId } });
  if (!backup) throw backupErrors.backupNotFound(backupId);
  if (backup.status !== 'VERIFIED') throw backupErrors.backupNotVerified(backupId);
  const snapshot = await getActiveBackupSnapshot(prisma);
  const root = ensureBackupRoot(snapshot.config);
  const filePath = resolveBackupFile(root, backup.relativeFilePath);
  if (!fs.existsSync(filePath)) throw backupErrors.backupNotFound(backupId);
  const stat = fs.statSync(filePath);
  return {
    stream: fs.createReadStream(filePath),
    fileName: backup.fileName,
    size: stat.size,
  };
}

export { bootstrapBackupConfiguration };
