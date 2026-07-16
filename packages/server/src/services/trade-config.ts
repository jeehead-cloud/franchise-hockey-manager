import { createHash } from 'node:crypto';
import type { Prisma, PrismaClient } from '@prisma/client';
import { defaultTradeConfig, validateTradeConfig, type TradeConfig } from '@fhm/engine';

export type TradeDbClient = PrismaClient | Prisma.TransactionClient;

export const TRADE_DEFAULT_PRESET_NAME = 'Trades Simplified Default';
export const canonicalTradeConfig = (config: TradeConfig) => JSON.stringify(config);
export const hashTradeConfigDb = (config: TradeConfig) =>
  createHash('sha256').update(canonicalTradeConfig(config)).digest('hex');

/**
 * Idempotent bootstrap of the simplified fictional trade default. Creates one
 * preset/version only when no owner configuration exists; preserves any existing
 * owner configuration untouched.
 */
export async function bootstrapTradeConfiguration(client: TradeDbClient) {
  let preset = await client.tradePreset.findFirst({
    where: { name: TRADE_DEFAULT_PRESET_NAME, isSystem: true },
    include: { versions: { orderBy: { versionNumber: 'desc' } } },
  });
  if (!preset) {
    const config = defaultTradeConfig();
    preset = await client.tradePreset.create({
      data: {
        name: TRADE_DEFAULT_PRESET_NAME,
        description: 'Simplified fictional trade-value defaults; advisory only; no salary cap',
        isSystem: true,
        versions: {
          create: {
            versionNumber: 1,
            schemaVersion: 1,
            configJson: canonicalTradeConfig(config),
            configHash: hashTradeConfigDb(config),
            changeReason: 'Bootstrap F29 simplified trades default',
          },
        },
      },
      include: { versions: { orderBy: { versionNumber: 'desc' } } },
    });
  }
  await client.activeTradeConfiguration.upsert({
    where: { id: 'default' },
    create: { id: 'default', activePresetVersionId: preset.versions[0]!.id },
    update: {},
  });
  return { presetId: preset.id, versionId: preset.versions[0]!.id };
}

export async function getActiveTradeSnapshot(client: TradeDbClient) {
  let active = await client.activeTradeConfiguration.findUnique({
    where: { id: 'default' },
    include: { activeVersion: { include: { preset: true } } },
  });
  if (!active) {
    await bootstrapTradeConfiguration(client);
    active = await client.activeTradeConfiguration.findUniqueOrThrow({
      where: { id: 'default' },
      include: { activeVersion: { include: { preset: true } } },
    });
  }
  return {
    preset: { id: active.activeVersion.preset.id, name: active.activeVersion.preset.name },
    version: { id: active.activeVersion.id, versionNumber: active.activeVersion.versionNumber, configHash: active.activeVersion.configHash },
    config: validateTradeConfig(JSON.parse(active.activeVersion.configJson)),
  };
}

export async function listTradeConfigurations(client: TradeDbClient) {
  const active = await client.activeTradeConfiguration.findUnique({ where: { id: 'default' } });
  const items = await client.tradePreset.findMany({
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
