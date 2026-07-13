import { createHash } from 'node:crypto';
import type {
  CommissionerAuditAction,
  CommissionerAuditEntityType,
  CommissionerAuditSource,
  Prisma,
  PrismaClient,
} from '@prisma/client';
import {
  buildDefaultCountryYouthProfile,
  canonicalizeCountryYouthProfile,
  hashCountryYouthProfile,
  hashYouthNamePool,
  validateAndNormalizeNamePool,
  validateCountryYouthProfile,
  YOUTH_GENERATION_SCHEMA_VERSION,
  YouthGenerationError,
  type CountryYouthProfile,
} from '@fhm/engine';
import { CommissionerHttpError } from '../commissioner/errors.js';

export const YOUTH_DEFAULT_PROFILE_SET_NAME = 'Youth Profiles Default v1';
const FIXTURE_COUNTRY_CODES = ['NAV', 'SGL'] as const;

export type DbClient = PrismaClient | Prisma.TransactionClient;

async function getPrisma(): Promise<PrismaClient> {
  const { prisma } = await import('../db/client.js');
  return prisma;
}

export interface ActiveYouthSnapshot {
  profileSet: {
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
  countryProfiles: Array<{
    countryId: string;
    countryCode: string;
    countryName: string;
    profile: CountryYouthProfile;
    profileHash: string;
    namePoolVersionId: string;
    namePoolHash: string;
  }>;
}

let cacheGeneration = 0;
let cachedSnapshot: { generation: number; snapshot: ActiveYouthSnapshot } | null = null;

export function invalidateYouthConfigCache(): void {
  cacheGeneration += 1;
  cachedSnapshot = null;
}

export function hashProfileSetVersion(countryProfileHashes: string[]): string {
  return createHash('sha256')
    .update([...countryProfileHashes].sort().join('|'), 'utf8')
    .digest('hex');
}

function buildFictionalNameLists(countryCode: string) {
  const firstNames = Array.from({ length: 24 }, (_, i) => `Fictional${countryCode}First${i}`);
  const lastNames = Array.from({ length: 32 }, (_, i) => `Fictional${countryCode}Last${i}`);
  return { firstNames, lastNames };
}

function requireValidProfile(input: unknown): CountryYouthProfile {
  try {
    return validateCountryYouthProfile(input);
  } catch (err) {
    if (err instanceof YouthGenerationError) {
      throw new CommissionerHttpError(422, 'InvalidYouthProfile', err.message, err.details);
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
  source: CommissionerAuditSource | null,
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
      source: source ?? 'COMMISSIONER_API',
      schemaVersion: 1,
    },
  });
}

function mapProfileSetSummary(
  profileSet: {
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
  const latest = profileSet.versions[0] ?? null;
  return {
    id: profileSet.id,
    name: profileSet.name,
    description: profileSet.description,
    isSystem: profileSet.isSystem,
    createdAt: profileSet.createdAt.toISOString(),
    updatedAt: profileSet.updatedAt.toISOString(),
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

async function getActiveVersionId(db: DbClient): Promise<string | null> {
  const active = await db.activeYouthGenerationConfiguration.findUnique({
    where: { id: 'default' },
    select: { activeProfileSetVersionId: true },
  });
  return active?.activeProfileSetVersionId ?? null;
}

async function loadCountryProfilesForVersion(
  db: DbClient,
  versionId: string,
): Promise<ActiveYouthSnapshot['countryProfiles']> {
  const rows = await db.countryYouthProfileVersion.findMany({
    where: { profileSetVersionId: versionId },
    include: {
      country: true,
      namePoolVersion: true,
    },
    orderBy: { country: { code: 'asc' } },
  });

  return rows.map((row) => {
    const profile = requireValidProfile(JSON.parse(row.profileText));
    return {
      countryId: row.countryId,
      countryCode: row.country.code,
      countryName: row.country.name,
      profile,
      profileHash: row.profileHash,
      namePoolVersionId: row.namePoolVersionId,
      namePoolHash: row.namePoolVersion.poolHash,
    };
  });
}

async function loadActiveSnapshotFromDb(db: DbClient): Promise<ActiveYouthSnapshot | null> {
  const active = await db.activeYouthGenerationConfiguration.findUnique({
    where: { id: 'default' },
    include: {
      activeVersion: {
        include: { profileSet: true },
      },
    },
  });
  if (!active) return null;

  const version = active.activeVersion;
  const countryProfiles = await loadCountryProfilesForVersion(db, version.id);

  return {
    profileSet: {
      id: version.profileSet.id,
      name: version.profileSet.name,
      description: version.profileSet.description,
      isSystem: version.profileSet.isSystem,
    },
    version: {
      id: version.id,
      versionNumber: version.versionNumber,
      schemaVersion: version.schemaVersion,
      configHash: version.configHash,
      createdAt: version.createdAt.toISOString(),
      changeReason: version.changeReason,
    },
    countryProfiles,
  };
}

async function resolveFixtureCountries(db: DbClient) {
  const countries = await db.country.findMany({
    where: {
      OR: [
        { code: { in: [...FIXTURE_COUNTRY_CODES] } },
        { name: { in: ['North Avalon', 'South Glacier'] } },
      ],
    },
    orderBy: { code: 'asc' },
  });
  return countries;
}

async function createNamePoolWithVersion(
  db: DbClient,
  countryId: string,
  countryCode: string,
  reason: string,
  source: CommissionerAuditSource | null,
) {
  const { firstNames, lastNames } = buildFictionalNameLists(countryCode);
  const normalized = validateAndNormalizeNamePool({ firstNames, lastNames });
  const poolHash = hashYouthNamePool(normalized);
  const poolName = `Default ${countryCode} Names`;

  const existing = await db.countryNamePool.findUnique({
    where: { countryId_name: { countryId, name: poolName } },
    include: { versions: { orderBy: { versionNumber: 'desc' }, take: 1 } },
  });

  if (existing?.versions[0]) {
    return { namePoolId: existing.id, versionId: existing.versions[0].id, poolHash };
  }

  const pool = await db.countryNamePool.create({
    data: {
      countryId,
      name: poolName,
      isSystem: true,
      versions: {
        create: {
          versionNumber: 1,
          maleFirstNamesText: JSON.stringify(normalized.firstNames),
          lastNamesText: JSON.stringify(normalized.lastNames),
          firstNameCount: normalized.firstNames.length,
          lastNameCount: normalized.lastNames.length,
          poolHash,
          changeReason: reason,
          createdBySource: source,
        },
      },
    },
    include: { versions: true },
  });

  return {
    namePoolId: pool.id,
    versionId: pool.versions[0]!.id,
    poolHash,
  };
}

/**
 * Idempotent bootstrap of Youth Profiles Default v1 + active pointer.
 * Only runs when no profile set exists; never overrides existing active config.
 */
export async function bootstrapYouthGenerationConfiguration(db?: DbClient): Promise<{
  created: boolean;
  activated: boolean;
  profileSetId: string;
  versionId: string;
}> {
  const client = db ?? (await getPrisma());
  const anyProfileSet = await client.youthGenerationProfileSet.findFirst();
  if (anyProfileSet) {
    const active = await client.activeYouthGenerationConfiguration.findUnique({
      where: { id: 'default' },
    });
    return {
      created: false,
      activated: false,
      profileSetId: anyProfileSet.id,
      versionId: active?.activeProfileSetVersionId ?? '',
    };
  }

  const countries = await resolveFixtureCountries(client);
  if (countries.length === 0) {
    throw new Error('Bootstrap requires NAV/SGL fixture countries');
  }

  let created = false;
  let activated = false;

  const profileRows: Array<{
    countryId: string;
    countryCode: string;
    profile: CountryYouthProfile;
    profileHash: string;
    namePoolVersionId: string;
  }> = [];

  for (const country of countries) {
    const countryKey = country.code;
    const pool = await createNamePoolWithVersion(
      client,
      country.id,
      countryKey,
      'Bootstrap Youth Profiles Default v1',
      null,
    );
    const profile = buildDefaultCountryYouthProfile(countryKey, {
      countryKey,
      namePoolKey: countryKey,
      enabled: true,
    });
    profileRows.push({
      countryId: country.id,
      countryCode: countryKey,
      profile,
      profileHash: hashCountryYouthProfile(profile),
      namePoolVersionId: pool.versionId,
    });
  }

  const configHash = hashProfileSetVersion(profileRows.map((p) => p.profileHash));

  const profileSet = await client.youthGenerationProfileSet.create({
    data: {
      name: YOUTH_DEFAULT_PROFILE_SET_NAME,
      description: 'Default fictional youth profiles for fixture countries (not NHL-calibrated)',
      isSystem: true,
      versions: {
        create: {
          versionNumber: 1,
          schemaVersion: YOUTH_GENERATION_SCHEMA_VERSION,
          configHash,
          changeReason: 'Bootstrap Youth Profiles Default v1',
          createdBySource: null,
          countryProfiles: {
            create: profileRows.map((row) => ({
              countryId: row.countryId,
              profileText: canonicalizeCountryYouthProfile(row.profile),
              profileHash: row.profileHash,
              namePoolVersionId: row.namePoolVersionId,
            })),
          },
        },
      },
    },
    include: { versions: true },
  });
  created = true;

  const version = profileSet.versions[0]!;
  const existingActive = await client.activeYouthGenerationConfiguration.findUnique({
    where: { id: 'default' },
  });

  if (!existingActive) {
    await client.activeYouthGenerationConfiguration.create({
      data: {
        id: 'default',
        activeProfileSetVersionId: version.id,
      },
    });
    activated = true;
  }

  if (created || activated) {
    invalidateYouthConfigCache();
  }

  const active = await client.activeYouthGenerationConfiguration.findUniqueOrThrow({
    where: { id: 'default' },
  });

  return {
    created,
    activated,
    profileSetId: profileSet.id,
    versionId: active.activeProfileSetVersionId,
  };
}

export async function getActiveYouthSnapshot(): Promise<ActiveYouthSnapshot> {
  const prisma = await getPrisma();
  if (cachedSnapshot && cachedSnapshot.generation === cacheGeneration) {
    return cachedSnapshot.snapshot;
  }

  let snapshot = await loadActiveSnapshotFromDb(prisma);
  if (!snapshot) {
    await bootstrapYouthGenerationConfiguration(prisma);
    snapshot = await loadActiveSnapshotFromDb(prisma);
  }
  if (!snapshot) {
    throw new CommissionerHttpError(
      500,
      'YouthGenerationFailed',
      'No active youth generation configuration is available',
    );
  }

  cachedSnapshot = { generation: cacheGeneration, snapshot };
  return snapshot;
}

export async function listYouthProfileSets() {
  const prisma = await getPrisma();
  const activeVersionId = await getActiveVersionId(prisma);
  const profileSets = await prisma.youthGenerationProfileSet.findMany({
    orderBy: [{ isSystem: 'desc' }, { name: 'asc' }],
    include: {
      versions: {
        orderBy: { versionNumber: 'desc' },
        take: 1,
        include: { activeFor: true },
      },
    },
  });
  return { items: profileSets.map((p) => mapProfileSetSummary(p, activeVersionId)) };
}

export async function listYouthProfileSetVersions(profileSetId: string) {
  const prisma = await getPrisma();
  const profileSet = await prisma.youthGenerationProfileSet.findUnique({
    where: { id: profileSetId },
  });
  if (!profileSet) return null;

  const activeVersionId = await getActiveVersionId(prisma);
  const versions = await prisma.youthGenerationProfileSetVersion.findMany({
    where: { profileSetId },
    orderBy: { versionNumber: 'desc' },
    include: { activeFor: true },
  });

  return {
    profileSet: {
      id: profileSet.id,
      name: profileSet.name,
      description: profileSet.description,
      isSystem: profileSet.isSystem,
    },
    items: versions.map((v) => ({
      id: v.id,
      profileSetId: v.profileSetId,
      versionNumber: v.versionNumber,
      schemaVersion: v.schemaVersion,
      configHash: v.configHash,
      changeReason: v.changeReason,
      createdAt: v.createdAt.toISOString(),
      createdBySource: v.createdBySource,
      isActive: v.id === activeVersionId,
    })),
  };
}

export async function getYouthProfileSetVersion(versionId: string) {
  const prisma = await getPrisma();
  const version = await prisma.youthGenerationProfileSetVersion.findUnique({
    where: { id: versionId },
    include: {
      profileSet: true,
      activeFor: true,
      countryProfiles: {
        include: { country: true, namePoolVersion: true },
        orderBy: { country: { code: 'asc' } },
      },
    },
  });
  if (!version) return null;

  const activeVersionId = await getActiveVersionId(prisma);
  return {
    id: version.id,
    profileSetId: version.profileSetId,
    versionNumber: version.versionNumber,
    schemaVersion: version.schemaVersion,
    configHash: version.configHash,
    changeReason: version.changeReason,
    createdAt: version.createdAt.toISOString(),
    createdBySource: version.createdBySource,
    isActive: version.id === activeVersionId,
    profileSet: {
      id: version.profileSet.id,
      name: version.profileSet.name,
      description: version.profileSet.description,
      isSystem: version.profileSet.isSystem,
    },
    profiles: version.countryProfiles.map((row) => ({
      countryId: row.countryId,
      countryCode: row.country.code,
      countryName: row.country.name,
      profile: requireValidProfile(JSON.parse(row.profileText)),
      profileHash: row.profileHash,
      namePoolVersionId: row.namePoolVersionId,
      namePoolHash: row.namePoolVersion.poolHash,
    })),
  };
}

export async function createYouthProfileSet(input: {
  name: string;
  description?: string | null;
  reason: string;
  source: CommissionerAuditSource;
}) {
  const prisma = await getPrisma();
  const name = input.name.trim();
  if (!name) {
    throw new CommissionerHttpError(400, 'InvalidYouthGenerationRequest', 'name is required');
  }
  if (name === YOUTH_DEFAULT_PROFILE_SET_NAME) {
    throw new CommissionerHttpError(
      400,
      'InvalidYouthGenerationRequest',
      `Cannot create a profile set named "${YOUTH_DEFAULT_PROFILE_SET_NAME}"`,
    );
  }

  const existing = await prisma.youthGenerationProfileSet.findUnique({ where: { name } });
  if (existing) {
    throw new CommissionerHttpError(
      409,
      'InvalidYouthGenerationRequest',
      'A profile set with this name already exists',
    );
  }

  const countries = await resolveFixtureCountries(prisma);
  const profileRows: Array<{
    countryId: string;
    profile: CountryYouthProfile;
    profileHash: string;
    namePoolVersionId: string;
  }> = [];

  for (const country of countries) {
    const pool = await prisma.countryNamePool.findFirst({
      where: { countryId: country.id, isSystem: true },
      include: { versions: { orderBy: { versionNumber: 'desc' }, take: 1 } },
    });
    if (!pool?.versions[0]) {
      throw new CommissionerHttpError(
        422,
        'YouthGenerationNotReady',
        `No name pool for country ${country.code}`,
      );
    }
    const profile = buildDefaultCountryYouthProfile(country.code, {
      countryKey: country.code,
      namePoolKey: country.code,
      enabled: false,
    });
    profileRows.push({
      countryId: country.id,
      profile,
      profileHash: hashCountryYouthProfile(profile),
      namePoolVersionId: pool.versions[0].id,
    });
  }

  const configHash = hashProfileSetVersion(profileRows.map((p) => p.profileHash));

  const created = await prisma.$transaction(async (tx) => {
    const profileSet = await tx.youthGenerationProfileSet.create({
      data: {
        name,
        description: input.description ?? null,
        isSystem: false,
        versions: {
          create: {
            versionNumber: 1,
            schemaVersion: YOUTH_GENERATION_SCHEMA_VERSION,
            configHash,
            changeReason: input.reason,
            createdBySource: input.source,
            countryProfiles: {
              create: profileRows.map((row) => ({
                countryId: row.countryId,
                profileText: canonicalizeCountryYouthProfile(row.profile),
                profileHash: row.profileHash,
                namePoolVersionId: row.namePoolVersionId,
              })),
            },
          },
        },
      },
      include: { versions: true },
    });

    await writeAudit(
      tx,
      'YOUTH_GENERATION_PROFILE',
      profileSet.id,
      'YOUTH_PROFILE_SET_CREATED',
      input.reason,
      null,
      {
        profileSetId: profileSet.id,
        name: profileSet.name,
        versionId: profileSet.versions[0]!.id,
        configHash,
      },
      ['name', 'profiles'],
      input.source,
    );

    return profileSet;
  });

  invalidateYouthConfigCache();
  const activeVersionId = await getActiveVersionId(prisma);
  return mapProfileSetSummary(
    {
      ...created,
      versions: created.versions.map((v) => ({ ...v, activeFor: null })),
    },
    activeVersionId,
  );
}

export async function createYouthProfileSetVersion(input: {
  profileSetId: string;
  expectedLatestVersionId: string;
  profiles: Array<{
    countryId: string;
    profile: unknown;
    namePoolVersionId: string;
  }>;
  reason: string;
  activate?: boolean;
  source: CommissionerAuditSource;
}) {
  const prisma = await getPrisma();
  const profileSet = await prisma.youthGenerationProfileSet.findUnique({
    where: { id: input.profileSetId },
  });
  if (!profileSet) {
    throw new CommissionerHttpError(
      404,
      'YouthProfileSetVersionNotFound',
      'Youth profile set not found',
    );
  }

  const latest = await prisma.youthGenerationProfileSetVersion.findFirst({
    where: { profileSetId: input.profileSetId },
    orderBy: { versionNumber: 'desc' },
  });
  if (latest?.id !== input.expectedLatestVersionId) {
    throw new CommissionerHttpError(
      409,
      'InvalidYouthGenerationRequest',
      'Profile set latest version changed; reload and retry',
      { currentLatestVersionId: latest?.id ?? null },
    );
  }

  const validatedRows: Array<{
    countryId: string;
    profile: CountryYouthProfile;
    profileHash: string;
    namePoolVersionId: string;
  }> = [];

  for (const row of input.profiles) {
    const country = await prisma.country.findUnique({ where: { id: row.countryId } });
    if (!country) {
      throw new CommissionerHttpError(404, 'CountryYouthProfileNotFound', 'Country not found');
    }
    const namePoolVersion = await prisma.countryNamePoolVersion.findUnique({
      where: { id: row.namePoolVersionId },
    });
    if (!namePoolVersion) {
      throw new CommissionerHttpError(
        404,
        'CountryNamePoolVersionNotFound',
        'Name pool version not found',
      );
    }
    const profile = requireValidProfile({
      ...(typeof row.profile === 'object' && row.profile ? row.profile : {}),
      countryKey: country.code,
      namePoolKey: country.code,
    });
    validatedRows.push({
      countryId: row.countryId,
      profile,
      profileHash: hashCountryYouthProfile(profile),
      namePoolVersionId: row.namePoolVersionId,
    });
  }

  const configHash = hashProfileSetVersion(validatedRows.map((p) => p.profileHash));
  const versionNumber = (latest?.versionNumber ?? 0) + 1;

  const result = await prisma.$transaction(async (tx) => {
    const version = await tx.youthGenerationProfileSetVersion.create({
      data: {
        profileSetId: profileSet.id,
        versionNumber,
        schemaVersion: YOUTH_GENERATION_SCHEMA_VERSION,
        configHash,
        changeReason: input.reason,
        createdBySource: input.source,
        countryProfiles: {
          create: validatedRows.map((row) => ({
            countryId: row.countryId,
            profileText: canonicalizeCountryYouthProfile(row.profile),
            profileHash: row.profileHash,
            namePoolVersionId: row.namePoolVersionId,
          })),
        },
      },
    });

    await tx.youthGenerationProfileSet.update({
      where: { id: profileSet.id },
      data: { updatedAt: new Date() },
    });

    await writeAudit(
      tx,
      'YOUTH_GENERATION_PROFILE',
      version.id,
      'YOUTH_PROFILE_SET_VERSION_CREATED',
      input.reason,
      latest
        ? {
            versionId: latest.id,
            versionNumber: latest.versionNumber,
            configHash: latest.configHash,
          }
        : null,
      {
        versionId: version.id,
        versionNumber: version.versionNumber,
        configHash,
        profileSetId: profileSet.id,
      },
      ['profiles', 'versionNumber'],
      input.source,
    );

    if (input.activate) {
      const active = await tx.activeYouthGenerationConfiguration.findUnique({
        where: { id: 'default' },
      });
      await tx.activeYouthGenerationConfiguration.upsert({
        where: { id: 'default' },
        create: { id: 'default', activeProfileSetVersionId: version.id },
        update: { activeProfileSetVersionId: version.id },
      });
      await writeAudit(
        tx,
        'YOUTH_GENERATION_PROFILE',
        'default',
        'YOUTH_PROFILE_SET_ACTIVATED',
        input.reason,
        active ? { activeProfileSetVersionId: active.activeProfileSetVersionId } : null,
        { activeProfileSetVersionId: version.id },
        ['activeProfileSetVersionId'],
        input.source,
      );
    }

    return version;
  });

  invalidateYouthConfigCache();
  return getYouthProfileSetVersion(result.id);
}

export async function activateYouthProfileSetVersion(input: {
  versionId: string;
  reason: string;
  source: CommissionerAuditSource;
  expectedActiveVersionId?: string;
}) {
  const prisma = await getPrisma();
  const version = await prisma.youthGenerationProfileSetVersion.findUnique({
    where: { id: input.versionId },
    include: { profileSet: true },
  });
  if (!version) {
    throw new CommissionerHttpError(
      404,
      'YouthProfileSetVersionNotFound',
      'Youth profile set version not found',
    );
  }

  await prisma.$transaction(async (tx) => {
    const active = await tx.activeYouthGenerationConfiguration.findUnique({
      where: { id: 'default' },
    });
    if (
      input.expectedActiveVersionId !== undefined &&
      (active?.activeProfileSetVersionId ?? null) !== input.expectedActiveVersionId
    ) {
      throw new CommissionerHttpError(
        409,
        'InvalidYouthGenerationRequest',
        'Active youth profile version changed; reload and retry',
        { currentActiveVersionId: active?.activeProfileSetVersionId ?? null },
      );
    }

    await tx.activeYouthGenerationConfiguration.upsert({
      where: { id: 'default' },
      create: { id: 'default', activeProfileSetVersionId: version.id },
      update: { activeProfileSetVersionId: version.id },
    });

    await writeAudit(
      tx,
      'YOUTH_GENERATION_PROFILE',
      'default',
      'YOUTH_PROFILE_SET_ACTIVATED',
      input.reason,
      active ? { activeProfileSetVersionId: active.activeProfileSetVersionId } : null,
      {
        activeProfileSetVersionId: version.id,
        profileSetId: version.profileSetId,
        versionNumber: version.versionNumber,
        configHash: version.configHash,
      },
      ['activeProfileSetVersionId'],
      input.source,
    );
  });

  invalidateYouthConfigCache();
  return getActiveYouthSnapshot();
}

export async function createCountryNamePool(input: {
  countryId: string;
  name: string;
  firstNames: string[];
  lastNames: string[];
  reason: string;
  source: CommissionerAuditSource;
}) {
  const prisma = await getPrisma();
  const country = await prisma.country.findUnique({ where: { id: input.countryId } });
  if (!country) {
    throw new CommissionerHttpError(404, 'CountryYouthProfileNotFound', 'Country not found');
  }

  const poolName = input.name.trim();
  if (!poolName) {
    throw new CommissionerHttpError(400, 'InvalidYouthGenerationRequest', 'name is required');
  }

  const existing = await prisma.countryNamePool.findUnique({
    where: { countryId_name: { countryId: input.countryId, name: poolName } },
  });
  if (existing) {
    throw new CommissionerHttpError(
      409,
      'InvalidYouthGenerationRequest',
      'A name pool with this name already exists for the country',
    );
  }

  let normalized;
  try {
    normalized = validateAndNormalizeNamePool({
      firstNames: input.firstNames,
      lastNames: input.lastNames,
    });
  } catch (err) {
    if (err instanceof YouthGenerationError) {
      throw new CommissionerHttpError(422, 'InvalidNamePool', err.message, err.details);
    }
    throw err;
  }
  const poolHash = hashYouthNamePool(normalized);

  const created = await prisma.$transaction(async (tx) => {
    const pool = await tx.countryNamePool.create({
      data: {
        countryId: input.countryId,
        name: poolName,
        isSystem: false,
        versions: {
          create: {
            versionNumber: 1,
            maleFirstNamesText: JSON.stringify(normalized.firstNames),
            lastNamesText: JSON.stringify(normalized.lastNames),
            firstNameCount: normalized.firstNames.length,
            lastNameCount: normalized.lastNames.length,
            poolHash,
            changeReason: input.reason,
            createdBySource: input.source,
          },
        },
      },
      include: { versions: true },
    });

    await writeAudit(
      tx,
      'COUNTRY_NAME_POOL',
      pool.id,
      'COUNTRY_NAME_POOL_CREATED',
      input.reason,
      null,
      {
        namePoolId: pool.id,
        countryId: input.countryId,
        versionId: pool.versions[0]!.id,
        poolHash,
      },
      ['name', 'firstNames', 'lastNames'],
      input.source,
    );

    return pool;
  });

  return {
    id: created.id,
    countryId: created.countryId,
    name: created.name,
    isSystem: created.isSystem,
    latestVersion: {
      id: created.versions[0]!.id,
      versionNumber: 1,
      poolHash,
      firstNameCount: normalized.firstNames.length,
      lastNameCount: normalized.lastNames.length,
    },
  };
}

export async function createCountryNamePoolVersion(input: {
  namePoolId: string;
  firstNames: string[];
  lastNames: string[];
  reason: string;
  source: CommissionerAuditSource;
  expectedLatestVersionId?: string;
}) {
  const prisma = await getPrisma();
  const pool = await prisma.countryNamePool.findUnique({
    where: { id: input.namePoolId },
    include: { versions: { orderBy: { versionNumber: 'desc' }, take: 1 } },
  });
  if (!pool) {
    throw new CommissionerHttpError(404, 'CountryNamePoolVersionNotFound', 'Name pool not found');
  }

  const latest = pool.versions[0] ?? null;
  if (
    input.expectedLatestVersionId !== undefined &&
    (latest?.id ?? null) !== input.expectedLatestVersionId
  ) {
    throw new CommissionerHttpError(
      409,
      'InvalidYouthGenerationRequest',
      'Name pool latest version changed; reload and retry',
      { currentLatestVersionId: latest?.id ?? null },
    );
  }

  let normalized;
  try {
    normalized = validateAndNormalizeNamePool({
      firstNames: input.firstNames,
      lastNames: input.lastNames,
    });
  } catch (err) {
    if (err instanceof YouthGenerationError) {
      throw new CommissionerHttpError(422, 'InvalidNamePool', err.message, err.details);
    }
    throw err;
  }
  const poolHash = hashYouthNamePool(normalized);
  const versionNumber = (latest?.versionNumber ?? 0) + 1;

  const version = await prisma.$transaction(async (tx) => {
    const created = await tx.countryNamePoolVersion.create({
      data: {
        namePoolId: pool.id,
        versionNumber,
        maleFirstNamesText: JSON.stringify(normalized.firstNames),
        lastNamesText: JSON.stringify(normalized.lastNames),
        firstNameCount: normalized.firstNames.length,
        lastNameCount: normalized.lastNames.length,
        poolHash,
        changeReason: input.reason,
        createdBySource: input.source,
      },
    });

    await tx.countryNamePool.update({
      where: { id: pool.id },
      data: { updatedAt: new Date() },
    });

    await writeAudit(
      tx,
      'COUNTRY_NAME_POOL',
      created.id,
      'COUNTRY_NAME_POOL_VERSION_CREATED',
      input.reason,
      latest
        ? { versionId: latest.id, versionNumber: latest.versionNumber, poolHash: latest.poolHash }
        : null,
      {
        versionId: created.id,
        versionNumber: created.versionNumber,
        poolHash,
        namePoolId: pool.id,
      },
      ['firstNames', 'lastNames', 'versionNumber'],
      input.source,
    );

    return created;
  });

  return {
    id: version.id,
    namePoolId: version.namePoolId,
    versionNumber: version.versionNumber,
    poolHash: version.poolHash,
    firstNameCount: version.firstNameCount,
    lastNameCount: version.lastNameCount,
    changeReason: version.changeReason,
    createdAt: version.createdAt.toISOString(),
  };
}

export async function loadCountryInputsFromVersion(versionId: string) {
  const prisma = await getPrisma();
  const version = await prisma.youthGenerationProfileSetVersion.findUnique({
    where: { id: versionId },
    include: {
      countryProfiles: {
        include: {
          country: true,
          namePoolVersion: true,
        },
        orderBy: { country: { code: 'asc' } },
      },
    },
  });
  if (!version) {
    throw new CommissionerHttpError(
      404,
      'YouthProfileSetVersionNotFound',
      'Youth profile set version not found',
    );
  }

  const countries = [];
  for (const row of version.countryProfiles) {
    const profile = requireValidProfile(JSON.parse(row.profileText));
    const firstNames = JSON.parse(row.namePoolVersion.maleFirstNamesText) as string[];
    const lastNames = JSON.parse(row.namePoolVersion.lastNamesText) as string[];
    countries.push({
      countryKey: row.country.code,
      countryId: row.countryId,
      countryName: row.country.name,
      profile,
      namePool: {
        poolKey: row.country.code,
        firstNames,
        lastNames,
      },
      namePoolVersionId: row.namePoolVersionId,
      namePoolHash: row.namePoolVersion.poolHash,
      profileHash: row.profileHash,
    });
  }
  return {
    versionId: version.id,
    profileSetHash: version.configHash,
    countries,
  };
}

export async function listYouthCountries() {
  const snapshot = await getActiveYouthSnapshot();
  return {
    items: snapshot.countryProfiles.map((p) => ({
      countryId: p.countryId,
      countryCode: p.countryCode,
      countryName: p.countryName,
      enabled: p.profile.enabled,
      cohortBaseSize: p.profile.cohort.baseSize,
      namePoolVersionId: p.namePoolVersionId,
      profileHash: p.profileHash,
    })),
    activeProfileSetVersionId: snapshot.version.id,
  };
}
