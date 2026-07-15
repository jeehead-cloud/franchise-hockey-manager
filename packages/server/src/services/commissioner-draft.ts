import type { CommissionerAuditSource } from '@prisma/client';
import { validateDraftConfig } from '@fhm/engine';
import { prisma } from '../db/client.js';
import { canonicalDraftConfig, hashDraftConfigSha } from './draft-config.js';
import { DraftHttpError } from './draft.js';

async function writeAudit(
  entityType: 'DRAFT_CONFIG' | 'DRAFT_CONFIG_VERSION',
  entityId: string,
  action: 'DRAFT_CONFIG_CREATED' | 'DRAFT_CONFIG_VERSION_CREATED' | 'DRAFT_CONFIG_ACTIVATED',
  reason: string,
  before: unknown,
  after: unknown,
  changedFields: string[],
  source: CommissionerAuditSource,
) {
  await prisma.commissionerAuditLog.create({
    data: {
      entityType,
      entityId,
      action,
      reason,
      beforeJson: JSON.stringify(before),
      afterJson: JSON.stringify(after),
      changedFieldsJson: JSON.stringify(changedFields),
      source,
    },
  });
}

export async function createDraftPreset(
  input: { name: string; description?: string | null; config: unknown; activate?: boolean; reason: string },
  source: CommissionerAuditSource,
) {
  const config = validateDraftConfig(input.config);
  const existing = await prisma.draftPreset.findUnique({ where: { name: input.name } });
  if (existing) throw new DraftHttpError(409, 'DraftConflict', 'A draft preset with that name already exists');
  const preset = await prisma.draftPreset.create({
    data: {
      name: input.name,
      description: input.description ?? null,
      isSystem: false,
      versions: {
        create: {
          versionNumber: 1,
          schemaVersion: config.schemaVersion,
          configJson: canonicalDraftConfig(config),
          configHash: hashDraftConfigSha(config),
          changeReason: input.reason,
          createdBySource: source,
        },
      },
    },
    include: { versions: { orderBy: { versionNumber: 'desc' }, take: 1 } },
  });
  await writeAudit('DRAFT_CONFIG', preset.id, 'DRAFT_CONFIG_CREATED', input.reason, null, { name: preset.name }, ['preset'], source);
  if (input.activate) {
    await prisma.activeDraftConfiguration.upsert({
      where: { id: 'default' },
      create: { id: 'default', activePresetVersionId: preset.versions[0]!.id },
      update: { activePresetVersionId: preset.versions[0]!.id },
    });
    await writeAudit('DRAFT_CONFIG_VERSION', preset.versions[0]!.id, 'DRAFT_CONFIG_ACTIVATED', input.reason, null, { versionId: preset.versions[0]!.id }, ['activeVersion'], source);
  }
  return { item: { id: preset.id, name: preset.name, versionId: preset.versions[0]!.id, activated: Boolean(input.activate) } };
}

export async function createDraftPresetVersion(
  presetId: string,
  input: { config: unknown; activate?: boolean; reason: string },
  source: CommissionerAuditSource,
) {
  const config = validateDraftConfig(input.config);
  const preset = await prisma.draftPreset.findUnique({ where: { id: presetId }, include: { versions: { orderBy: { versionNumber: 'desc' }, take: 1 } } });
  if (!preset) throw new DraftHttpError(404, 'DraftConfigNotFound', 'Draft preset not found');
  const versionNumber = (preset.versions[0]?.versionNumber ?? 0) + 1;
  const version = await prisma.draftPresetVersion.create({
    data: {
      presetId,
      versionNumber,
      schemaVersion: config.schemaVersion,
      configJson: canonicalDraftConfig(config),
      configHash: hashDraftConfigSha(config),
      changeReason: input.reason,
      createdBySource: source,
    },
  });
  await writeAudit('DRAFT_CONFIG_VERSION', version.id, 'DRAFT_CONFIG_VERSION_CREATED', input.reason, null, { presetId, versionNumber }, ['version'], source);
  if (input.activate) {
    await prisma.activeDraftConfiguration.upsert({
      where: { id: 'default' },
      create: { id: 'default', activePresetVersionId: version.id },
      update: { activePresetVersionId: version.id },
    });
    await writeAudit('DRAFT_CONFIG_VERSION', version.id, 'DRAFT_CONFIG_ACTIVATED', input.reason, null, { versionId: version.id }, ['activeVersion'], source);
  }
  return { item: { id: version.id, presetId, versionNumber, configHash: version.configHash, activated: Boolean(input.activate) } };
}

export async function activateDraftPresetVersion(versionId: string, reason: string, source: CommissionerAuditSource) {
  const version = await prisma.draftPresetVersion.findUnique({ where: { id: versionId } });
  if (!version) throw new DraftHttpError(404, 'DraftConfigVersionNotFound', 'Draft configuration version not found');
  await prisma.activeDraftConfiguration.upsert({
    where: { id: 'default' },
    create: { id: 'default', activePresetVersionId: versionId },
    update: { activePresetVersionId: versionId },
  });
  await writeAudit('DRAFT_CONFIG_VERSION', versionId, 'DRAFT_CONFIG_ACTIVATED', reason, null, { versionId }, ['activeVersion'], source);
  return { item: { activatedVersionId: versionId } };
}
