import type { CommissionerAuditSource } from '@prisma/client';
import { validateTradeConfig } from '@fhm/engine';
import { prisma } from '../db/client.js';
import { canonicalTradeConfig, hashTradeConfigDb } from './trade-config.js';
import { TradeHttpError } from './trade-errors.js';

async function audit(entityType: any, entityId: string, action: any, reason: string, before: unknown, after: unknown, source: CommissionerAuditSource) {
  await prisma.commissionerAuditLog.create({
    data: { entityType, entityId, action, reason, beforeJson: JSON.stringify(before), afterJson: JSON.stringify(after), changedFieldsJson: JSON.stringify(['tradeSystem']), source },
  });
}

export async function auditTradeAction(entityType: any, entityId: string, action: any, reason: string, after: unknown, source: CommissionerAuditSource) {
  return audit(entityType, entityId, action, reason, null, after, source);
}

export async function createTradePreset(input: { name: string; description?: string | null; config: unknown; activate?: boolean; reason: string }, source: CommissionerAuditSource) {
  const config = validateTradeConfig(input.config);
  if (await prisma.tradePreset.findUnique({ where: { name: input.name } })) throw new TradeHttpError(409, 'InvalidTradeConfiguration', 'Configuration name already exists');
  const preset = await prisma.tradePreset.create({
    data: {
      name: input.name, description: input.description, isSystem: false,
      versions: { create: { versionNumber: 1, schemaVersion: 1, configJson: canonicalTradeConfig(config), configHash: hashTradeConfigDb(config), changeReason: input.reason, createdBySource: source } },
    },
    include: { versions: true },
  });
  await audit('TRADE_CONFIG', preset.id, 'TRADE_CONFIG_CREATED', input.reason, null, { name: preset.name }, source);
  if (input.activate) await activateTradeVersion(preset.versions[0]!.id, input.reason, source);
  return preset;
}

export async function createTradeVersion(presetId: string, input: { config: unknown; activate?: boolean; reason: string }, source: CommissionerAuditSource) {
  const config = validateTradeConfig(input.config);
  const preset = await prisma.tradePreset.findUnique({ where: { id: presetId }, include: { versions: { orderBy: { versionNumber: 'desc' }, take: 1 } } });
  if (!preset) throw new TradeHttpError(404, 'InvalidTradeConfiguration', 'Configuration not found');
  const version = await prisma.tradePresetVersion.create({
    data: { presetId, versionNumber: (preset.versions[0]?.versionNumber ?? 0) + 1, schemaVersion: 1, configJson: canonicalTradeConfig(config), configHash: hashTradeConfigDb(config), changeReason: input.reason, createdBySource: source },
  });
  await audit('TRADE_CONFIG', version.id, 'TRADE_CONFIG_VERSION_CREATED', input.reason, null, { presetId, versionNumber: version.versionNumber }, source);
  if (input.activate) await activateTradeVersion(version.id, input.reason, source);
  return version;
}

export async function activateTradeVersion(versionId: string, reason: string, source: CommissionerAuditSource) {
  const version = await prisma.tradePresetVersion.findUnique({ where: { id: versionId } });
  if (!version) throw new TradeHttpError(404, 'InvalidTradeConfiguration', 'Configuration version not found');
  const before = await prisma.activeTradeConfiguration.findUnique({ where: { id: 'default' } });
  const active = await prisma.activeTradeConfiguration.upsert({ where: { id: 'default' }, create: { id: 'default', activePresetVersionId: versionId }, update: { activePresetVersionId: versionId } });
  await audit('TRADE_CONFIG', versionId, 'TRADE_CONFIG_ACTIVATED', reason, before, active, source);
  return active;
}
