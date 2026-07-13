import { createHash } from 'node:crypto';
import type {
  CommissionerAuditAction,
  CommissionerAuditEntityType,
  CommissionerAuditSource,
  Prisma,
  PrismaClient,
} from '@prisma/client';
import {
  canonicalizeBalanceConfig,
  collectChangedPaths,
  defaultRuntimeSimulationSettings,
  getStandardBalanceConfig,
  isF13CompatibleBalanceConfig,
  isF14CompatibleBalanceConfig,
  normalizeBalanceConfig,
  parseBalanceConfig,
  validateBalanceConfig,
  type BalanceConfig,
  type RuntimeSimulationSettings,
} from '@fhm/engine';
import { CommissionerHttpError } from '../commissioner/errors.js';
import { isErrorResult, parsePagination } from './query.js';

export const STANDARD_PRESET_NAME = 'Standard';
export const MAX_BALANCE_CONFIG_JSON_CHARS = 1_500_000;
export const BALANCE_EXPORT_FORMAT = 'fhm-balance-export' as const;
export const BALANCE_EXPORT_FORMAT_VERSION = 1 as const;

export type DbClient = PrismaClient | Prisma.TransactionClient;

async function getPrisma(): Promise<PrismaClient> {
  const { prisma } = await import('../db/client.js');
  return prisma;
}

export interface ActiveBalanceSnapshot {
  preset: {
    id: string;
    name: string;
    description: string | null;
    isSystem: boolean;
  };
  version: {
    id: string;
    versionNumber: number;
    schemaVersion: number;
    configHash: string;
    createdAt: string;
    changeReason: string;
  };
  config: BalanceConfig;
  runtimeDefaults: RuntimeSimulationSettings;
}

export interface BalanceExportPayload {
  format: typeof BALANCE_EXPORT_FORMAT;
  formatVersion: typeof BALANCE_EXPORT_FORMAT_VERSION;
  exportedAt: string;
  preset: {
    id: string;
    name: string;
    description: string | null;
    isSystem: boolean;
  };
  version: {
    id: string;
    versionNumber: number;
    schemaVersion: number;
    configHash: string;
    changeReason: string;
    createdAt: string;
  };
  config: BalanceConfig;
}

let cacheGeneration = 0;
let cachedSnapshot: { generation: number; snapshot: ActiveBalanceSnapshot } | null = null;

export function invalidateBalanceCache(): void {
  cacheGeneration += 1;
  cachedSnapshot = null;
}

export function hashBalanceConfig(config: BalanceConfig): string {
  return createHash('sha256').update(canonicalizeBalanceConfig(config), 'utf8').digest('hex');
}

function assertConfigJsonSize(configJson: string): void {
  if (configJson.length > MAX_BALANCE_CONFIG_JSON_CHARS) {
    throw new CommissionerHttpError(
      422,
      'BalanceConfigTooLarge',
      `Balance config JSON exceeds ${MAX_BALANCE_CONFIG_JSON_CHARS} characters`,
      { size: configJson.length, max: MAX_BALANCE_CONFIG_JSON_CHARS },
    );
  }
}

function requireValidConfig(input: unknown): BalanceConfig {
  const result = validateBalanceConfig(input);
  if (!result.ok) {
    throw new CommissionerHttpError(422, 'InvalidBalanceConfig', 'Balance configuration is invalid', {
      errors: result.errors,
    });
  }
  return normalizeBalanceConfig(result.config);
}

function unwrapImportConfig(input: unknown): unknown {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return input;
  const obj = input as Record<string, unknown>;
  if (obj.format === BALANCE_EXPORT_FORMAT && 'config' in obj) return obj.config;
  if ('config' in obj && obj.config && typeof obj.config === 'object') {
    const nested = obj.config as Record<string, unknown>;
    if (nested.format === BALANCE_EXPORT_FORMAT && 'config' in nested) return nested.config;
    if ('schemaVersion' in nested && 'chemistry' in nested) return nested;
  }
  return input;
}

async function writeAudit(
  tx: Prisma.TransactionClient,
  entityType: CommissionerAuditEntityType,
  entityId: string,
  action: CommissionerAuditAction,
  reason: string,
  before: unknown,
  after: unknown,
  changedFields: string[],
  source: CommissionerAuditSource,
) {
  await tx.commissionerAuditLog.create({
    data: {
      entityType,
      entityId,
      action,
      reason,
      beforeJson: JSON.stringify(before),
      afterJson: JSON.stringify(after),
      changedFieldsJson: JSON.stringify(changedFields),
      source,
      schemaVersion: 1,
    },
  });
}

function mapPresetSummary(
  preset: {
    id: string;
    name: string;
    description: string | null;
    isSystem: boolean;
    createdAt: Date;
    updatedAt: Date;
    versions: Array<{
      id: string;
      versionNumber: number;
      schemaVersion: number;
      configHash: string;
      changeReason: string;
      createdAt: Date;
      activeFor: { id: string } | null;
    }>;
  },
  activeVersionId: string | null,
) {
  const latest = preset.versions[0] ?? null;
  return {
    id: preset.id,
    name: preset.name,
    description: preset.description,
    isSystem: preset.isSystem,
    createdAt: preset.createdAt.toISOString(),
    updatedAt: preset.updatedAt.toISOString(),
    latestVersion: latest
      ? {
          id: latest.id,
          versionNumber: latest.versionNumber,
          schemaVersion: latest.schemaVersion,
          configHash: latest.configHash,
          changeReason: latest.changeReason,
          createdAt: latest.createdAt.toISOString(),
          isActive: latest.id === activeVersionId,
        }
      : null,
    isActive: latest ? latest.id === activeVersionId : false,
  };
}

function mapVersionRow(version: {
  id: string;
  presetId: string;
  versionNumber: number;
  schemaVersion: number;
  configHash: string;
  changeReason: string;
  createdAt: Date;
  createdBySource: CommissionerAuditSource | null;
  activeFor: { id: string } | null;
  preset?: {
    id: string;
    name: string;
    description: string | null;
    isSystem: boolean;
  };
}) {
  return {
    id: version.id,
    presetId: version.presetId,
    versionNumber: version.versionNumber,
    schemaVersion: version.schemaVersion,
    configHash: version.configHash,
    changeReason: version.changeReason,
    createdAt: version.createdAt.toISOString(),
    createdBySource: version.createdBySource,
    isActive: Boolean(version.activeFor),
    ...(version.preset
      ? {
          preset: {
            id: version.preset.id,
            name: version.preset.name,
            description: version.preset.description,
            isSystem: version.preset.isSystem,
          },
        }
      : {}),
  };
}

async function getActiveVersionId(db: DbClient): Promise<string | null> {
  const active = await db.activeBalanceConfiguration.findUnique({
    where: { id: 'default' },
    select: { activePresetVersionId: true },
  });
  return active?.activePresetVersionId ?? null;
}

async function loadActiveSnapshotFromDb(db: DbClient): Promise<ActiveBalanceSnapshot | null> {
  const active = await db.activeBalanceConfiguration.findUnique({
    where: { id: 'default' },
    include: {
      activeVersion: {
        include: { preset: true },
      },
    },
  });
  if (!active) return null;

  const version = active.activeVersion;
  const config = parseBalanceConfig(JSON.parse(version.configJson));
  const validated = validateBalanceConfig(config);
  if (!validated.ok) {
    throw new CommissionerHttpError(
      500,
      'CorruptActiveBalanceConfig',
      'Active balance configuration failed validation',
      { errors: validated.errors },
    );
  }

  return {
    preset: {
      id: version.preset.id,
      name: version.preset.name,
      description: version.preset.description,
      isSystem: version.preset.isSystem,
    },
    version: {
      id: version.id,
      versionNumber: version.versionNumber,
      schemaVersion: version.schemaVersion,
      configHash: version.configHash,
      createdAt: version.createdAt.toISOString(),
      changeReason: version.changeReason,
    },
    config: validated.config,
    runtimeDefaults: defaultRuntimeSimulationSettings(validated.config),
  };
}

/**
 * Idempotent bootstrap of repository Standard defaults + active pointer.
 * Never overrides an existing active custom/system version on rerun.
 */
export async function bootstrapBalanceConfiguration(db?: DbClient): Promise<{
  created: boolean;
  activated: boolean;
  presetId: string;
  versionId: string;
}> {
  const client = db ?? (await getPrisma());
  let created = false;
  let activated = false;

  let standard = await client.balancePreset.findFirst({
    where: { name: STANDARD_PRESET_NAME, isSystem: true },
    include: { versions: { orderBy: { versionNumber: 'desc' } } },
  });

  if (!standard) {
    const config = getStandardBalanceConfig();
    const normalized = normalizeBalanceConfig(config);
    const configJson = canonicalizeBalanceConfig(normalized);
    assertConfigJsonSize(configJson);
    const configHash = hashBalanceConfig(normalized);

    standard = await client.balancePreset.create({
      data: {
        name: STANDARD_PRESET_NAME,
        description: normalized.description,
        isSystem: true,
        versions: {
          create: {
            versionNumber: 1,
            schemaVersion: normalized.schemaVersion,
            configJson,
            configHash,
            changeReason: 'Bootstrap repository Standard defaults',
            createdBySource: null,
          },
        },
      },
      include: { versions: { orderBy: { versionNumber: 'desc' } } },
    });
    created = true;
  } else if (standard.versions.length === 0) {
    const config = getStandardBalanceConfig();
    const normalized = normalizeBalanceConfig(config);
    const configJson = canonicalizeBalanceConfig(normalized);
    assertConfigJsonSize(configJson);
    const configHash = hashBalanceConfig(normalized);
    await client.balancePresetVersion.create({
      data: {
        presetId: standard.id,
        versionNumber: 1,
        schemaVersion: normalized.schemaVersion,
        configJson,
        configHash,
        changeReason: 'Bootstrap repository Standard defaults',
        createdBySource: null,
      },
    });
    standard = await client.balancePreset.findFirstOrThrow({
      where: { id: standard.id },
      include: { versions: { orderBy: { versionNumber: 'desc' } } },
    });
    created = true;
  }

  const repoStandard = normalizeBalanceConfig(getStandardBalanceConfig());
  const compatibleRepoVersion = repoStandard.schemaVersion;
  const hasCompatibleVersion = standard.versions.some((v) => v.schemaVersion >= compatibleRepoVersion);
  if (!hasCompatibleVersion) {
    const nextVersionNumber = (standard.versions[0]?.versionNumber ?? 0) + 1;
    const configJson = canonicalizeBalanceConfig(repoStandard);
    assertConfigJsonSize(configJson);
    const configHash = hashBalanceConfig(repoStandard);
    await client.balancePresetVersion.create({
      data: {
        presetId: standard.id,
        versionNumber: nextVersionNumber,
        schemaVersion: repoStandard.schemaVersion,
        configJson,
        configHash,
        changeReason: `Bootstrap repository Standard schemaVersion ${repoStandard.schemaVersion}`,
        createdBySource: null,
      },
    });
    standard = await client.balancePreset.findFirstOrThrow({
      where: { id: standard.id },
      include: { versions: { orderBy: { versionNumber: 'desc' } } },
    });
    created = true;
  }

  const latestCompatible = standard.versions.find((v) => v.schemaVersion >= compatibleRepoVersion) ?? standard.versions[0];
  if (!latestCompatible) {
    throw new Error('Standard balance preset has no versions after bootstrap');
  }

  const existingActive = await client.activeBalanceConfiguration.findUnique({
    where: { id: 'default' },
  });

  if (!existingActive) {
    await client.activeBalanceConfiguration.create({
      data: {
        id: 'default',
        activePresetVersionId: latestCompatible.id,
      },
    });
    activated = true;
  } else {
    const activeVersion = await client.balancePresetVersion.findUnique({
      where: { id: existingActive.activePresetVersionId },
    });
    if (activeVersion) {
      const activeConfig = requireValidConfig(JSON.parse(activeVersion.configJson));
      const activeCompatible = isF14CompatibleBalanceConfig(activeConfig);
      const activeIsStandard = activeVersion.presetId === standard.id;
      if (activeIsStandard && !activeCompatible && latestCompatible.id !== activeVersion.id) {
        await client.activeBalanceConfiguration.update({
          where: { id: 'default' },
          data: { activePresetVersionId: latestCompatible.id },
        });
        activated = true;
      }
    }
  }

  if (created || activated) {
    invalidateBalanceCache();
  }

  const active = await client.activeBalanceConfiguration.findUniqueOrThrow({
    where: { id: 'default' },
  });

  return {
    created,
    activated,
    presetId: standard.id,
    versionId: active.activePresetVersionId,
  };
}

export async function getActiveBalanceSnapshot(): Promise<ActiveBalanceSnapshot> {
  const prisma = await getPrisma();
  if (cachedSnapshot && cachedSnapshot.generation === cacheGeneration) {
    return cachedSnapshot.snapshot;
  }

  let snapshot = await loadActiveSnapshotFromDb(prisma);
  if (!snapshot) {
    await bootstrapBalanceConfiguration(prisma);
    snapshot = await loadActiveSnapshotFromDb(prisma);
  }
  if (!snapshot) {
    throw new CommissionerHttpError(
      500,
      'ActiveBalanceMissing',
      'No active balance configuration is available',
    );
  }

  cachedSnapshot = { generation: cacheGeneration, snapshot };
  return snapshot;
}

export async function listBalancePresets() {
  const prisma = await getPrisma();
  const activeVersionId = await getActiveVersionId(prisma);
  const presets = await prisma.balancePreset.findMany({
    orderBy: [{ isSystem: 'desc' }, { name: 'asc' }],
    include: {
      versions: {
        orderBy: { versionNumber: 'desc' },
        take: 1,
        include: { activeFor: true },
      },
    },
  });
  return { items: presets.map((p) => mapPresetSummary(p, activeVersionId)) };
}

export async function getBalancePreset(presetId: string) {
  const prisma = await getPrisma();
  const preset = await prisma.balancePreset.findUnique({
    where: { id: presetId },
    include: {
      versions: {
        orderBy: { versionNumber: 'desc' },
        include: { activeFor: true },
      },
    },
  });
  if (!preset) return null;
  const activeVersionId = await getActiveVersionId(prisma);
  return {
    ...mapPresetSummary(preset, activeVersionId),
    versions: preset.versions.map((v) => mapVersionRow(v)),
  };
}

export async function listBalancePresetVersions(presetId: string) {
  const prisma = await getPrisma();
  const preset = await prisma.balancePreset.findUnique({
    where: { id: presetId },
    select: { id: true },
  });
  if (!preset) return null;
  const versions = await prisma.balancePresetVersion.findMany({
    where: { presetId },
    orderBy: { versionNumber: 'desc' },
    include: { activeFor: true },
  });
  return { items: versions.map((v) => mapVersionRow(v)) };
}

export async function getBalancePresetVersion(versionId: string) {
  const prisma = await getPrisma();
  const version = await prisma.balancePresetVersion.findUnique({
    where: { id: versionId },
    include: { preset: true, activeFor: true },
  });
  if (!version) return null;
  const config = requireValidConfig(JSON.parse(version.configJson));
  return {
    ...mapVersionRow(version),
    config,
    runtimeDefaults: defaultRuntimeSimulationSettings(config),
  };
}

export async function exportBalancePresetVersion(versionId: string): Promise<BalanceExportPayload | null> {
  const prisma = await getPrisma();
  const version = await prisma.balancePresetVersion.findUnique({
    where: { id: versionId },
    include: { preset: true },
  });
  if (!version) return null;
  const config = requireValidConfig(JSON.parse(version.configJson));
  return {
    format: BALANCE_EXPORT_FORMAT,
    formatVersion: BALANCE_EXPORT_FORMAT_VERSION,
    exportedAt: new Date().toISOString(),
    preset: {
      id: version.preset.id,
      name: version.preset.name,
      description: version.preset.description,
      isSystem: version.preset.isSystem,
    },
    version: {
      id: version.id,
      versionNumber: version.versionNumber,
      schemaVersion: version.schemaVersion,
      configHash: version.configHash,
      changeReason: version.changeReason,
      createdAt: version.createdAt.toISOString(),
    },
    config,
  };
}

export async function duplicatePreset(input: {
  presetId: string;
  versionId?: string;
  name: string;
  reason: string;
  source: CommissionerAuditSource;
}) {
  const prisma = await getPrisma();
  const sourcePreset = await prisma.balancePreset.findUnique({
    where: { id: input.presetId },
    include: { versions: { orderBy: { versionNumber: 'desc' } } },
  });
  if (!sourcePreset) {
    throw new CommissionerHttpError(404, 'BalancePresetNotFound', 'Balance preset not found');
  }

  const sourceVersion = input.versionId
    ? sourcePreset.versions.find((v) => v.id === input.versionId)
    : sourcePreset.versions[0];
  if (!sourceVersion) {
    throw new CommissionerHttpError(
      404,
      'BalancePresetVersionNotFound',
      input.versionId
        ? 'Balance preset version not found on this preset'
        : 'Balance preset has no versions to duplicate',
    );
  }

  const name = input.name.trim();
  if (!name) {
    throw new CommissionerHttpError(400, 'InvalidRequest', 'name is required');
  }
  if (name === STANDARD_PRESET_NAME) {
    throw new CommissionerHttpError(
      400,
      'InvalidRequest',
      `Cannot create a preset named "${STANDARD_PRESET_NAME}"`,
    );
  }

  const existing = await prisma.balancePreset.findUnique({ where: { name } });
  if (existing) {
    throw new CommissionerHttpError(409, 'BalancePresetNameTaken', 'A preset with this name already exists');
  }

  const config = requireValidConfig(JSON.parse(sourceVersion.configJson));
  const configJson = canonicalizeBalanceConfig(config);
  assertConfigJsonSize(configJson);
  const configHash = hashBalanceConfig(config);

  const created = await prisma.$transaction(async (tx) => {
    const preset = await tx.balancePreset.create({
      data: {
        name,
        description: sourcePreset.description,
        isSystem: false,
        versions: {
          create: {
            versionNumber: 1,
            schemaVersion: config.schemaVersion,
            configJson,
            configHash,
            changeReason: input.reason,
            createdBySource: input.source,
          },
        },
      },
      include: { versions: true },
    });

    await writeAudit(
      tx,
      'BALANCE_PRESET',
      preset.id,
      'PRESET_DUPLICATED',
      input.reason,
      {
        sourcePresetId: sourcePreset.id,
        sourceVersionId: sourceVersion.id,
        sourceName: sourcePreset.name,
      },
      {
        presetId: preset.id,
        name: preset.name,
        versionId: preset.versions[0]!.id,
        configHash,
      },
      ['name', 'config'],
      input.source,
    );

    return preset;
  });

  invalidateBalanceCache();
  return getBalancePreset(created.id);
}

export async function renamePreset(input: {
  presetId: string;
  name?: string;
  description?: string | null;
  expectedUpdatedAt: string;
  reason: string;
  source: CommissionerAuditSource;
}) {
  const prisma = await getPrisma();
  const existing = await prisma.balancePreset.findUnique({ where: { id: input.presetId } });
  if (!existing) {
    throw new CommissionerHttpError(404, 'BalancePresetNotFound', 'Balance preset not found');
  }
  if (existing.updatedAt.toISOString() !== input.expectedUpdatedAt) {
    throw new CommissionerHttpError(
      409,
      'EditConflict',
      'Balance preset was modified elsewhere; reload and retry',
      { currentUpdatedAt: existing.updatedAt.toISOString() },
    );
  }

  const nextName = input.name !== undefined ? input.name.trim() : existing.name;
  if (!nextName) {
    throw new CommissionerHttpError(400, 'InvalidRequest', 'name cannot be empty');
  }

  if (existing.isSystem && nextName !== existing.name) {
    throw new CommissionerHttpError(
      400,
      'SystemPresetImmutableName',
      'System balance preset name cannot be changed',
    );
  }

  if (nextName !== existing.name) {
    const clash = await prisma.balancePreset.findUnique({ where: { name: nextName } });
    if (clash) {
      throw new CommissionerHttpError(
        409,
        'BalancePresetNameTaken',
        'A preset with this name already exists',
      );
    }
  }

  const nextDescription =
    input.description !== undefined ? input.description : existing.description;

  const updated = await prisma.$transaction(async (tx) => {
    const row = await tx.balancePreset.update({
      where: { id: existing.id },
      data: {
        name: nextName,
        description: nextDescription,
      },
    });

    await writeAudit(
      tx,
      'BALANCE_PRESET',
      row.id,
      'PRESET_RENAMED',
      input.reason,
      { name: existing.name, description: existing.description },
      { name: row.name, description: row.description },
      [
        ...(existing.name !== row.name ? ['name'] : []),
        ...(existing.description !== row.description ? ['description'] : []),
      ],
      input.source,
    );

    return row;
  });

  invalidateBalanceCache();
  return getBalancePreset(updated.id);
}

async function createVersionOnPreset(
  tx: Prisma.TransactionClient,
  presetId: string,
  config: BalanceConfig,
  reason: string,
  source: CommissionerAuditSource,
  expectedLatestVersionId: string | null | undefined,
) {
  const latest = await tx.balancePresetVersion.findFirst({
    where: { presetId },
    orderBy: { versionNumber: 'desc' },
  });

  if (expectedLatestVersionId !== undefined) {
    const currentId = latest?.id ?? null;
    if (currentId !== expectedLatestVersionId) {
      throw new CommissionerHttpError(
        409,
        'EditConflict',
        'Balance preset latest version changed; reload and retry',
        { currentLatestVersionId: currentId },
      );
    }
  }

  const configJson = canonicalizeBalanceConfig(config);
  assertConfigJsonSize(configJson);
  const configHash = hashBalanceConfig(config);
  const versionNumber = (latest?.versionNumber ?? 0) + 1;

  const version = await tx.balancePresetVersion.create({
    data: {
      presetId,
      versionNumber,
      schemaVersion: config.schemaVersion,
      configJson,
      configHash,
      changeReason: reason,
      createdBySource: source,
    },
  });

  await tx.balancePreset.update({
    where: { id: presetId },
    data: { updatedAt: new Date() },
  });

  return { version, previous: latest, configHash, configJson };
}

export async function createPresetVersion(input: {
  presetId: string;
  expectedLatestVersionId: string;
  config: unknown;
  reason: string;
  activate?: boolean;
  source: CommissionerAuditSource;
}) {
  const prisma = await getPrisma();
  const preset = await prisma.balancePreset.findUnique({ where: { id: input.presetId } });
  if (!preset) {
    throw new CommissionerHttpError(404, 'BalancePresetNotFound', 'Balance preset not found');
  }

  const config = requireValidConfig(input.config);

  const result = await prisma.$transaction(async (tx) => {
    const created = await createVersionOnPreset(
      tx,
      preset.id,
      config,
      input.reason,
      input.source,
      input.expectedLatestVersionId,
    );

    await writeAudit(
      tx,
      'BALANCE_PRESET_VERSION',
      created.version.id,
      'VERSION_CREATED',
      input.reason,
      created.previous
        ? {
            versionId: created.previous.id,
            versionNumber: created.previous.versionNumber,
            configHash: created.previous.configHash,
          }
        : null,
      {
        versionId: created.version.id,
        versionNumber: created.version.versionNumber,
        configHash: created.configHash,
        presetId: preset.id,
      },
      ['config', 'versionNumber'],
      input.source,
    );

    if (input.activate) {
      const active = await tx.activeBalanceConfiguration.findUnique({ where: { id: 'default' } });
      await tx.activeBalanceConfiguration.upsert({
        where: { id: 'default' },
        create: { id: 'default', activePresetVersionId: created.version.id },
        update: { activePresetVersionId: created.version.id },
      });
      await writeAudit(
        tx,
        'ACTIVE_BALANCE_CONFIGURATION',
        'default',
        'VERSION_ACTIVATED',
        input.reason,
        active ? { activePresetVersionId: active.activePresetVersionId } : null,
        { activePresetVersionId: created.version.id },
        ['activePresetVersionId'],
        input.source,
      );
    }

    return created.version;
  });

  invalidateBalanceCache();
  return getBalancePresetVersion(result.id);
}

export async function activateVersion(input: {
  versionId: string;
  reason: string;
  source: CommissionerAuditSource;
  expectedActiveVersionId?: string;
}) {
  const prisma = await getPrisma();
  const version = await prisma.balancePresetVersion.findUnique({
    where: { id: input.versionId },
    include: { preset: true },
  });
  if (!version) {
    throw new CommissionerHttpError(
      404,
      'BalancePresetVersionNotFound',
      'Balance preset version not found',
    );
  }

  // Validate stored config before activation
  requireValidConfig(JSON.parse(version.configJson));

  await prisma.$transaction(async (tx) => {
    const active = await tx.activeBalanceConfiguration.findUnique({ where: { id: 'default' } });
    if (
      input.expectedActiveVersionId !== undefined &&
      (active?.activePresetVersionId ?? null) !== input.expectedActiveVersionId
    ) {
      throw new CommissionerHttpError(
        409,
        'EditConflict',
        'Active balance version changed; reload and retry',
        { currentActiveVersionId: active?.activePresetVersionId ?? null },
      );
    }

    await tx.activeBalanceConfiguration.upsert({
      where: { id: 'default' },
      create: { id: 'default', activePresetVersionId: version.id },
      update: { activePresetVersionId: version.id },
    });

    await writeAudit(
      tx,
      'ACTIVE_BALANCE_CONFIGURATION',
      'default',
      'VERSION_ACTIVATED',
      input.reason,
      active ? { activePresetVersionId: active.activePresetVersionId } : null,
      {
        activePresetVersionId: version.id,
        presetId: version.presetId,
        versionNumber: version.versionNumber,
        configHash: version.configHash,
      },
      ['activePresetVersionId'],
      input.source,
    );
  });

  invalidateBalanceCache();
  return getActiveBalanceSnapshot();
}

export async function resetPreset(input: {
  presetId: string;
  reason: string;
  activate?: boolean;
  source: CommissionerAuditSource;
}) {
  const prisma = await getPrisma();
  const preset = await prisma.balancePreset.findUnique({
    where: { id: input.presetId },
    include: { versions: { orderBy: { versionNumber: 'desc' }, take: 1 } },
  });
  if (!preset) {
    throw new CommissionerHttpError(404, 'BalancePresetNotFound', 'Balance preset not found');
  }

  const config = normalizeBalanceConfig(getStandardBalanceConfig());
  const latestId = preset.versions[0]?.id ?? null;

  const result = await prisma.$transaction(async (tx) => {
    const created = await createVersionOnPreset(
      tx,
      preset.id,
      config,
      input.reason,
      input.source,
      latestId,
    );

    await writeAudit(
      tx,
      'BALANCE_PRESET_VERSION',
      created.version.id,
      'PRESET_RESET',
      input.reason,
      created.previous
        ? {
            versionId: created.previous.id,
            versionNumber: created.previous.versionNumber,
            configHash: created.previous.configHash,
          }
        : null,
      {
        versionId: created.version.id,
        versionNumber: created.version.versionNumber,
        configHash: created.configHash,
        presetId: preset.id,
        resetTo: 'repository-standard',
      },
      ['config', 'versionNumber'],
      input.source,
    );

    if (input.activate) {
      const active = await tx.activeBalanceConfiguration.findUnique({ where: { id: 'default' } });
      await tx.activeBalanceConfiguration.upsert({
        where: { id: 'default' },
        create: { id: 'default', activePresetVersionId: created.version.id },
        update: { activePresetVersionId: created.version.id },
      });
      await writeAudit(
        tx,
        'ACTIVE_BALANCE_CONFIGURATION',
        'default',
        'VERSION_ACTIVATED',
        input.reason,
        active ? { activePresetVersionId: active.activePresetVersionId } : null,
        { activePresetVersionId: created.version.id },
        ['activePresetVersionId'],
        input.source,
      );
    }

    return created.version;
  });

  invalidateBalanceCache();
  return getBalancePresetVersion(result.id);
}

export async function importPreset(input: {
  name: string;
  description?: string | null;
  config: unknown;
  reason: string;
  source: CommissionerAuditSource;
}) {
  const prisma = await getPrisma();
  const name = input.name.trim();
  if (!name) {
    throw new CommissionerHttpError(400, 'InvalidRequest', 'name is required');
  }
  if (name === STANDARD_PRESET_NAME) {
    throw new CommissionerHttpError(
      400,
      'InvalidRequest',
      `Cannot import a preset named "${STANDARD_PRESET_NAME}"`,
    );
  }

  const existing = await prisma.balancePreset.findUnique({ where: { name } });
  if (existing) {
    throw new CommissionerHttpError(409, 'BalancePresetNameTaken', 'A preset with this name already exists');
  }

  const rawConfig = unwrapImportConfig(input.config);
  const probeJson = JSON.stringify(rawConfig);
  assertConfigJsonSize(probeJson);

  const config = requireValidConfig(rawConfig);
  const configJson = canonicalizeBalanceConfig(config);
  assertConfigJsonSize(configJson);
  const configHash = hashBalanceConfig(config);

  const created = await prisma.$transaction(async (tx) => {
    const preset = await tx.balancePreset.create({
      data: {
        name,
        description: input.description ?? config.description,
        isSystem: false,
        versions: {
          create: {
            versionNumber: 1,
            schemaVersion: config.schemaVersion,
            configJson,
            configHash,
            changeReason: input.reason,
            createdBySource: input.source,
          },
        },
      },
      include: { versions: true },
    });

    await writeAudit(
      tx,
      'BALANCE_PRESET',
      preset.id,
      'PRESET_IMPORTED',
      input.reason,
      null,
      {
        presetId: preset.id,
        name: preset.name,
        versionId: preset.versions[0]!.id,
        configHash,
      },
      ['name', 'config'],
      input.source,
    );

    return preset;
  });

  invalidateBalanceCache();
  return getBalancePreset(created.id);
}

export async function validatePresetConfigPreview(input: {
  presetId?: string;
  baseVersionId?: string;
  config: unknown;
}) {
  const prisma = await getPrisma();
  const probeJson = JSON.stringify(input.config);
  if (probeJson.length > MAX_BALANCE_CONFIG_JSON_CHARS) {
    return {
      valid: false,
      errors: [
        {
          path: '(root)',
          message: `Balance config JSON exceeds ${MAX_BALANCE_CONFIG_JSON_CHARS} characters`,
        },
      ],
      normalized: null,
      hash: null,
      changedPaths: [],
    };
  }

  const result = validateBalanceConfig(input.config);
  if (!result.ok) {
    return {
      valid: false,
      errors: result.errors,
      normalized: null,
      hash: null,
      changedPaths: [],
    };
  }

  const normalized = normalizeBalanceConfig(result.config);
  const hash = hashBalanceConfig(normalized);

  let baseConfig: BalanceConfig | null = null;
  if (input.baseVersionId) {
    const base = await prisma.balancePresetVersion.findUnique({
      where: { id: input.baseVersionId },
    });
    if (!base) {
      throw new CommissionerHttpError(
        404,
        'BalancePresetVersionNotFound',
        'Base balance preset version not found',
      );
    }
    if (input.presetId && base.presetId !== input.presetId) {
      throw new CommissionerHttpError(
        400,
        'InvalidRequest',
        'baseVersionId does not belong to presetId',
      );
    }
    baseConfig = parseBalanceConfig(JSON.parse(base.configJson));
  } else if (input.presetId) {
    const latest = await prisma.balancePresetVersion.findFirst({
      where: { presetId: input.presetId },
      orderBy: { versionNumber: 'desc' },
    });
    if (latest) {
      baseConfig = parseBalanceConfig(JSON.parse(latest.configJson));
    }
  }

  const changedPaths = baseConfig
    ? collectChangedPaths(baseConfig, normalized).map((c: { path: string }) => c.path)
    : [];

  return {
    valid: true,
    errors: [],
    normalized,
    hash,
    changedPaths,
  };
}

const BALANCE_AUDIT_ENTITY_TYPES: CommissionerAuditEntityType[] = [
  'BALANCE_PRESET',
  'BALANCE_PRESET_VERSION',
  'ACTIVE_BALANCE_CONFIGURATION',
];

export async function listBalanceAudit(query: Record<string, unknown>) {
  const prisma = await getPrisma();
  const pagination = parsePagination(query);
  if (isErrorResult(pagination)) {
    throw new CommissionerHttpError(400, 'InvalidRequest', pagination.error);
  }

  const where = { entityType: { in: BALANCE_AUDIT_ENTITY_TYPES } };
  const [total, rows] = await Promise.all([
    prisma.commissionerAuditLog.count({ where }),
    prisma.commissionerAuditLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: pagination.skip,
      take: pagination.pageSize,
    }),
  ]);

  return {
    items: rows.map((r) => ({
      id: r.id,
      entityType: r.entityType,
      entityId: r.entityId,
      action: r.action,
      reason: r.reason,
      source: r.source,
      createdAt: r.createdAt.toISOString(),
      changedFields: JSON.parse(r.changedFieldsJson) as string[],
      before: JSON.parse(r.beforeJson),
      after: JSON.parse(r.afterJson),
    })),
    page: pagination.page,
    pageSize: pagination.pageSize,
    total,
  };
}
