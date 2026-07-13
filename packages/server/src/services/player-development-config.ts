import { createHash } from 'node:crypto';
import type {
  CommissionerAuditAction,
  CommissionerAuditEntityType,
  CommissionerAuditSource,
  Prisma,
  PrismaClient,
} from '@prisma/client';
import {
  canonicalizePlayerDevelopmentConfig,
  getDefaultPlayerDevelopmentConfig,
  validatePlayerDevelopmentConfig,
  type PlayerDevelopmentConfig,
  PlayerDevelopmentError,
} from '@fhm/engine';
import { CommissionerHttpError } from '../commissioner/errors.js';

export const DEVELOPMENT_DEFAULT_PRESET_NAME = 'Development Default v1';
export const MAX_DEVELOPMENT_CONFIG_JSON_CHARS = 500_000;

export type DbClient = PrismaClient | Prisma.TransactionClient;

async function getPrisma(): Promise<PrismaClient> {
  const { prisma } = await import('../db/client.js');
  return prisma;
}

export interface ActiveDevelopmentSnapshot {
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
  config: PlayerDevelopmentConfig;
}

let cacheGeneration = 0;
let cachedSnapshot: { generation: number; snapshot: ActiveDevelopmentSnapshot } | null = null;

export function invalidateDevelopmentConfigCache(): void {
  cacheGeneration += 1;
  cachedSnapshot = null;
}

export function hashDevelopmentConfig(config: PlayerDevelopmentConfig): string {
  return createHash('sha256')
    .update(canonicalizePlayerDevelopmentConfig(config), 'utf8')
    .digest('hex');
}

function assertConfigJsonSize(configJson: string): void {
  if (configJson.length > MAX_DEVELOPMENT_CONFIG_JSON_CHARS) {
    throw new CommissionerHttpError(
      422,
      'InvalidDevelopmentConfiguration',
      `Development config JSON exceeds ${MAX_DEVELOPMENT_CONFIG_JSON_CHARS} characters`,
      { size: configJson.length, max: MAX_DEVELOPMENT_CONFIG_JSON_CHARS },
    );
  }
}

function requireValidConfig(input: unknown): PlayerDevelopmentConfig {
  try {
    return validatePlayerDevelopmentConfig(input);
  } catch (err) {
    if (err instanceof PlayerDevelopmentError) {
      throw new CommissionerHttpError(
        422,
        'InvalidDevelopmentConfiguration',
        err.message,
        err.details,
      );
    }
    throw err;
  }
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
  const active = await db.activePlayerDevelopmentConfiguration.findUnique({
    where: { id: 'default' },
    select: { activePresetVersionId: true },
  });
  return active?.activePresetVersionId ?? null;
}

async function loadActiveSnapshotFromDb(db: DbClient): Promise<ActiveDevelopmentSnapshot | null> {
  const active = await db.activePlayerDevelopmentConfiguration.findUnique({
    where: { id: 'default' },
    include: {
      activeVersion: {
        include: { preset: true },
      },
    },
  });
  if (!active) return null;

  const version = active.activeVersion;
  const config = requireValidConfig(JSON.parse(version.configJson));

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
    config,
  };
}

/**
 * Idempotent bootstrap of Development Default v1 + active pointer.
 * Never overrides an existing active custom/system version on rerun.
 */
export async function bootstrapPlayerDevelopmentConfiguration(db?: DbClient): Promise<{
  created: boolean;
  activated: boolean;
  presetId: string;
  versionId: string;
}> {
  const client = db ?? (await getPrisma());
  let created = false;
  let activated = false;

  let preset = await client.playerDevelopmentPreset.findFirst({
    where: { name: DEVELOPMENT_DEFAULT_PRESET_NAME, isSystem: true },
    include: { versions: { orderBy: { versionNumber: 'desc' } } },
  });

  if (!preset) {
    const config = getDefaultPlayerDevelopmentConfig();
    const configJson = canonicalizePlayerDevelopmentConfig(config);
    assertConfigJsonSize(configJson);
    const configHash = hashDevelopmentConfig(config);

    preset = await client.playerDevelopmentPreset.create({
      data: {
        name: DEVELOPMENT_DEFAULT_PRESET_NAME,
        description: 'Simplified annual development curves (not NHL-calibrated)',
        isSystem: true,
        versions: {
          create: {
            versionNumber: 1,
            schemaVersion: config.schemaVersion,
            configJson,
            configHash,
            changeReason: 'Bootstrap Development Default v1',
            createdBySource: null,
          },
        },
      },
      include: { versions: { orderBy: { versionNumber: 'desc' } } },
    });
    created = true;
  } else if (preset.versions.length === 0) {
    const config = getDefaultPlayerDevelopmentConfig();
    const configJson = canonicalizePlayerDevelopmentConfig(config);
    assertConfigJsonSize(configJson);
    const configHash = hashDevelopmentConfig(config);
    await client.playerDevelopmentPresetVersion.create({
      data: {
        presetId: preset.id,
        versionNumber: 1,
        schemaVersion: config.schemaVersion,
        configJson,
        configHash,
        changeReason: 'Bootstrap Development Default v1',
        createdBySource: null,
      },
    });
    preset = await client.playerDevelopmentPreset.findFirstOrThrow({
      where: { id: preset.id },
      include: { versions: { orderBy: { versionNumber: 'desc' } } },
    });
    created = true;
  }

  const latest = preset.versions[0];
  if (!latest) {
    throw new Error('Development preset has no versions after bootstrap');
  }

  const existingActive = await client.activePlayerDevelopmentConfiguration.findUnique({
    where: { id: 'default' },
  });

  if (!existingActive) {
    await client.activePlayerDevelopmentConfiguration.create({
      data: {
        id: 'default',
        activePresetVersionId: latest.id,
      },
    });
    activated = true;
  }

  if (created || activated) {
    invalidateDevelopmentConfigCache();
  }

  const active = await client.activePlayerDevelopmentConfiguration.findUniqueOrThrow({
    where: { id: 'default' },
  });

  return {
    created,
    activated,
    presetId: preset.id,
    versionId: active.activePresetVersionId,
  };
}

export async function getActiveDevelopmentSnapshot(): Promise<ActiveDevelopmentSnapshot> {
  const prisma = await getPrisma();
  if (cachedSnapshot && cachedSnapshot.generation === cacheGeneration) {
    return cachedSnapshot.snapshot;
  }

  let snapshot = await loadActiveSnapshotFromDb(prisma);
  if (!snapshot) {
    await bootstrapPlayerDevelopmentConfiguration(prisma);
    snapshot = await loadActiveSnapshotFromDb(prisma);
  }
  if (!snapshot) {
    throw new CommissionerHttpError(
      500,
      'PlayerDevelopmentFailed',
      'No active development configuration is available',
    );
  }

  cachedSnapshot = { generation: cacheGeneration, snapshot };
  return snapshot;
}

export async function listDevelopmentPresets() {
  const prisma = await getPrisma();
  const activeVersionId = await getActiveVersionId(prisma);
  const presets = await prisma.playerDevelopmentPreset.findMany({
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

export async function getDevelopmentPresetVersion(versionId: string) {
  const prisma = await getPrisma();
  const version = await prisma.playerDevelopmentPresetVersion.findUnique({
    where: { id: versionId },
    include: { preset: true, activeFor: true },
  });
  if (!version) return null;
  const config = requireValidConfig(JSON.parse(version.configJson));
  return {
    ...mapVersionRow(version),
    config,
  };
}

export async function createDevelopmentPreset(input: {
  name: string;
  description?: string | null;
  reason: string;
  source: CommissionerAuditSource;
}) {
  const prisma = await getPrisma();
  const name = input.name.trim();
  if (!name) {
    throw new CommissionerHttpError(400, 'InvalidPlayerDevelopmentRequest', 'name is required');
  }
  if (name === DEVELOPMENT_DEFAULT_PRESET_NAME) {
    throw new CommissionerHttpError(
      400,
      'InvalidPlayerDevelopmentRequest',
      `Cannot create a preset named "${DEVELOPMENT_DEFAULT_PRESET_NAME}"`,
    );
  }

  const existing = await prisma.playerDevelopmentPreset.findUnique({ where: { name } });
  if (existing) {
    throw new CommissionerHttpError(
      409,
      'InvalidPlayerDevelopmentRequest',
      'A preset with this name already exists',
    );
  }

  const config = getDefaultPlayerDevelopmentConfig();
  const configJson = canonicalizePlayerDevelopmentConfig(config);
  assertConfigJsonSize(configJson);
  const configHash = hashDevelopmentConfig(config);

  const created = await prisma.$transaction(async (tx) => {
    const preset = await tx.playerDevelopmentPreset.create({
      data: {
        name,
        description: input.description ?? null,
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
      'PLAYER_DEVELOPMENT_CONFIG',
      preset.id,
      'DEVELOPMENT_CONFIG_CREATED',
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

  invalidateDevelopmentConfigCache();
  const activeVersionId = await getActiveVersionId(prisma);
  return mapPresetSummary(
    {
      ...created,
      versions: created.versions.map((v) => ({ ...v, activeFor: null })),
    },
    activeVersionId,
  );
}

async function createVersionOnPreset(
  tx: Prisma.TransactionClient,
  presetId: string,
  config: PlayerDevelopmentConfig,
  reason: string,
  source: CommissionerAuditSource,
  expectedLatestVersionId: string | null | undefined,
) {
  const latest = await tx.playerDevelopmentPresetVersion.findFirst({
    where: { presetId },
    orderBy: { versionNumber: 'desc' },
  });

  if (expectedLatestVersionId !== undefined) {
    const currentId = latest?.id ?? null;
    if (currentId !== expectedLatestVersionId) {
      throw new CommissionerHttpError(
        409,
        'InvalidPlayerDevelopmentRequest',
        'Development preset latest version changed; reload and retry',
        { currentLatestVersionId: currentId },
      );
    }
  }

  const configJson = canonicalizePlayerDevelopmentConfig(config);
  assertConfigJsonSize(configJson);
  const configHash = hashDevelopmentConfig(config);
  const versionNumber = (latest?.versionNumber ?? 0) + 1;

  const version = await tx.playerDevelopmentPresetVersion.create({
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

  await tx.playerDevelopmentPreset.update({
    where: { id: presetId },
    data: { updatedAt: new Date() },
  });

  return { version, previous: latest, configHash, configJson };
}

export async function createDevelopmentPresetVersion(input: {
  presetId: string;
  expectedLatestVersionId: string;
  config: unknown;
  reason: string;
  activate?: boolean;
  source: CommissionerAuditSource;
}) {
  const prisma = await getPrisma();
  const preset = await prisma.playerDevelopmentPreset.findUnique({ where: { id: input.presetId } });
  if (!preset) {
    throw new CommissionerHttpError(
      404,
      'DevelopmentConfigVersionNotFound',
      'Development preset not found',
    );
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
      'PLAYER_DEVELOPMENT_CONFIG',
      created.version.id,
      'DEVELOPMENT_CONFIG_VERSION_CREATED',
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
      const active = await tx.activePlayerDevelopmentConfiguration.findUnique({
        where: { id: 'default' },
      });
      await tx.activePlayerDevelopmentConfiguration.upsert({
        where: { id: 'default' },
        create: { id: 'default', activePresetVersionId: created.version.id },
        update: { activePresetVersionId: created.version.id },
      });
      await writeAudit(
        tx,
        'PLAYER_DEVELOPMENT_CONFIG',
        'default',
        'DEVELOPMENT_CONFIG_ACTIVATED',
        input.reason,
        active ? { activePresetVersionId: active.activePresetVersionId } : null,
        { activePresetVersionId: created.version.id },
        ['activePresetVersionId'],
        input.source,
      );
    }

    return created.version;
  });

  invalidateDevelopmentConfigCache();
  return getDevelopmentPresetVersion(result.id);
}

export async function activateDevelopmentVersion(input: {
  versionId: string;
  reason: string;
  source: CommissionerAuditSource;
  expectedActiveVersionId?: string;
}) {
  const prisma = await getPrisma();
  const version = await prisma.playerDevelopmentPresetVersion.findUnique({
    where: { id: input.versionId },
    include: { preset: true },
  });
  if (!version) {
    throw new CommissionerHttpError(
      404,
      'DevelopmentConfigVersionNotFound',
      'Development preset version not found',
    );
  }

  requireValidConfig(JSON.parse(version.configJson));

  await prisma.$transaction(async (tx) => {
    const active = await tx.activePlayerDevelopmentConfiguration.findUnique({
      where: { id: 'default' },
    });
    if (
      input.expectedActiveVersionId !== undefined &&
      (active?.activePresetVersionId ?? null) !== input.expectedActiveVersionId
    ) {
      throw new CommissionerHttpError(
        409,
        'InvalidPlayerDevelopmentRequest',
        'Active development version changed; reload and retry',
        { currentActiveVersionId: active?.activePresetVersionId ?? null },
      );
    }

    await tx.activePlayerDevelopmentConfiguration.upsert({
      where: { id: 'default' },
      create: { id: 'default', activePresetVersionId: version.id },
      update: { activePresetVersionId: version.id },
    });

    await writeAudit(
      tx,
      'PLAYER_DEVELOPMENT_CONFIG',
      'default',
      'DEVELOPMENT_CONFIG_ACTIVATED',
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

  invalidateDevelopmentConfigCache();
  return getActiveDevelopmentSnapshot();
}
