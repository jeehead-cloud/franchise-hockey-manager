import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import type { PrismaClient } from '@prisma/client';
import { join } from 'node:path';
import {
  cleanupTempDir,
  createTempDatabaseUrl,
  createTestPrisma,
  migrateTempDatabase,
} from './helpers/db.js';
import { getRepoRoot } from '../src/initialization/paths.js';
import { YOUTH_DEFAULT_PROFILE_SET_NAME } from '../src/services/youth-generation-config.js';

const fixtureDir = join(getRepoRoot(), 'data', 'fixtures', 'f3-minimal-world');

/**
 * Regression coverage for the empty-database startup lifecycle.
 *
 * The server used to crash during `ensureAppMeta()` on a fresh migrated but
 * uninitialized database because the youth-generation bootstrap required
 * NAV/SGL fixture countries that only exist after Setup World. These tests pin
 * the fixed lifecycle: the app boots on an empty migrated DB, setup remains
 * explicit, the deferred world-dependent bootstrap completes after setup, and
 * an initialized-but-corrupt world is still reported explicitly.
 */
describe('empty-database startup lifecycle', () => {
  let app: FastifyInstance;
  let prisma: PrismaClient;
  let tempDir: string;

  beforeAll(async () => {
    const { url, dir } = createTempDatabaseUrl();
    tempDir = dir;
    process.env.DATABASE_URL = url;
    process.env.FHM_DATASET_DIR = fixtureDir;
    process.env.FHM_COMMISSIONER_WRITES_ENABLED = 'true';
    migrateTempDatabase(url);

    // Bind the singleton prisma client to the temp DB before importing app,
    // mirroring how setup.test.ts boots the real server.
    const db = await import('../src/db/client.js');
    prisma = db.prisma;
  });

  afterAll(async () => {
    if (app) await app.close();
    if (prisma) await prisma.$disconnect();
    if (tempDir) cleanupTempDir(tempDir);
  });

  describe('1. fresh empty migrated DB boots', () => {
    it('ensureAppMeta does not throw and no world data is invented', async () => {
      // Build the full app + run every startup bootstrap exactly as index.ts
      // would. This must not throw on an empty migrated DB.
      const { buildApp, ensureAppMeta } = await import('../src/app.js');
      await expect(ensureAppMeta()).resolves.not.toThrow();
      app = await buildApp({ logger: false });
      await app.ready();
    });

    it('GET /health returns 200 with a reachable database', async () => {
      const res = await app.inject({ method: 'GET', url: '/health' });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.database).toBe('ok');
      // status is 'ok' unless a maintenance mode is active (none on fresh DB).
      expect(['ok', 'degraded']).toContain(body.status);
    });

    it('GET /api/setup/status returns 200 and an uninitialized world', async () => {
      const res = await app.inject({ method: 'GET', url: '/api/setup/status' });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.initialized).toBe(false);
      expect(body.blockReason).toBeNull();
    });

    it('does not invent NAV/SGL fixture countries or youth config', async () => {
      const countryCount = await prisma.country.count();
      expect(countryCount).toBe(0);
      const navOrSgl = await prisma.country.findMany({
        where: { code: { in: ['NAV', 'SGL'] } },
      });
      expect(navOrSgl).toHaveLength(0);
      const profileSets = await prisma.youthGenerationProfileSet.count();
      expect(profileSets).toBe(0);
      const active = await prisma.activeYouthGenerationConfiguration.count();
      expect(active).toBe(0);
      const meta = await prisma.appMeta.findUniqueOrThrow({ where: { id: 'default' } });
      expect(meta.worldInitialized).toBe(false);
    });

    it('youth bootstrap returns a documented deferred result on the empty DB', async () => {
      const { bootstrapYouthGenerationConfiguration } = await import(
        '../src/services/youth-generation-config.js'
      );
      const result = await bootstrapYouthGenerationConfiguration(prisma);
      expect(result.deferred).toBe(true);
      expect(result.reason).toBe('deferred-uninitialized');
      expect(result.created).toBe(false);
      expect(result.activated).toBe(false);
      // Still nothing invented after an explicit bootstrap call.
      expect(await prisma.youthGenerationProfileSet.count()).toBe(0);
      expect(await prisma.country.count()).toBe(0);
    });
  });

  describe('2. successful setup completes the deferred bootstrap', () => {
    it('imports fixture countries and creates the youth default configuration', async () => {
      const { initializeSetup } = await import('../src/initialization/index.js');
      const result = await initializeSetup(prisma, fixtureDir);
      expect(result.initialized).toBe(true);

      const countryCount = await prisma.country.count();
      expect(countryCount).toBeGreaterThanOrEqual(2);
      const nav = await prisma.country.findFirst({ where: { code: 'NAV' } });
      expect(nav).not.toBeNull();

      const profileSet = await prisma.youthGenerationProfileSet.findUnique({
        where: { name: YOUTH_DEFAULT_PROFILE_SET_NAME },
        include: { versions: true },
      });
      expect(profileSet).not.toBeNull();
      expect(profileSet?.isSystem).toBe(true);
      expect(profileSet?.versions.length).toBeGreaterThanOrEqual(1);

      const active = await prisma.activeYouthGenerationConfiguration.findUniqueOrThrow({
        where: { id: 'default' },
      });
      expect(active.activeProfileSetVersionId).toBeTruthy();

      const meta = await prisma.appMeta.findUniqueOrThrow({ where: { id: 'default' } });
      expect(meta.worldInitialized).toBe(true);
    });

    it('getActiveYouthSnapshot resolves after setup', async () => {
      const { getActiveYouthSnapshot } = await import(
        '../src/services/youth-generation-config.js'
      );
      const snapshot = await getActiveYouthSnapshot();
      expect(snapshot.countryProfiles.length).toBeGreaterThanOrEqual(2);
      expect(snapshot.profileSet.name).toBe(YOUTH_DEFAULT_PROFILE_SET_NAME);
    });
  });

  describe('3. restart after setup is idempotent', () => {
    it('ensureAppMeta rerun creates no duplicate preset/version/config', async () => {
      const profileSetCountBefore = await prisma.youthGenerationProfileSet.count();
      const versionCountBefore = await prisma.youthGenerationProfileSetVersion.count();
      const activeBefore = await prisma.activeYouthGenerationConfiguration.findUniqueOrThrow({
        where: { id: 'default' },
      });

      const { ensureAppMeta } = await import('../src/app.js');
      await expect(ensureAppMeta()).resolves.not.toThrow();

      const profileSetCountAfter = await prisma.youthGenerationProfileSet.count();
      const versionCountAfter = await prisma.youthGenerationProfileSetVersion.count();
      const activeAfter = await prisma.activeYouthGenerationConfiguration.findUniqueOrThrow({
        where: { id: 'default' },
      });

      expect(profileSetCountAfter).toBe(profileSetCountBefore);
      expect(versionCountAfter).toBe(versionCountBefore);
      expect(activeAfter.activeProfileSetVersionId).toBe(activeBefore.activeProfileSetVersionId);
    });
  });

  describe('4. initialized-but-corrupt world is reported explicitly', () => {
    // Uses its own disposable DB so it does not fight the imported world's FK
    // mesh (11 relations reference Country). It simulates corruption directly.
    let corruptPrisma: PrismaClient;
    let corruptDir: string;

    beforeAll(() => {
      const temp = createTempDatabaseUrl();
      corruptDir = temp.dir;
      migrateTempDatabase(temp.url);
      corruptPrisma = createTestPrisma(temp.url);
    });

    afterAll(async () => {
      if (corruptPrisma) await corruptPrisma.$disconnect();
      if (corruptDir) cleanupTempDir(corruptDir);
    });

    it('throws (does not defer) when world is initialized but fixture countries are gone', async () => {
      // Simulate corruption: mark the world initialized, but do NOT create the
      // required fixture countries (NAV/SGL). This is NOT an ordinary empty
      // world — the bootstrap must surface it explicitly rather than deferring.
      await corruptPrisma.appMeta.create({
        data: { id: 'default', worldInitialized: true },
      });

      const { bootstrapYouthGenerationConfiguration } = await import(
        '../src/services/youth-generation-config.js'
      );
      await expect(bootstrapYouthGenerationConfiguration(corruptPrisma)).rejects.toThrow(
        /required fixture countries \(NAV\/SGL\) are missing.*world is marked initialized/,
      );
    });
  });

  describe('5. existing owner configuration is never replaced', () => {
    // Uses its own disposable DB. The owner profile set must short-circuit the
    // bootstrap before any default is created, even when fixture countries
    // are present.
    let ownerPrisma: PrismaClient;
    let ownerDir: string;

    beforeAll(() => {
      const temp = createTempDatabaseUrl();
      ownerDir = temp.dir;
      migrateTempDatabase(temp.url);
      ownerPrisma = createTestPrisma(temp.url);
    });

    afterAll(async () => {
      if (ownerPrisma) await ownerPrisma.$disconnect();
      if (ownerDir) cleanupTempDir(ownerDir);
    });

    it('bootstrap with an existing non-default active config is a no-op', async () => {
      await ownerPrisma.appMeta.create({
        data: { id: 'default', worldInitialized: false },
      });

      // Provide fixture countries so a default *could* be created; the
      // presence of an existing profile set must short-circuit before that.
      await ownerPrisma.country.create({
        data: { name: 'North Avalon', code: 'NAV', externalId: 'NAV' },
      });
      await ownerPrisma.country.create({
        data: { name: 'South Glacier', code: 'SGL', externalId: 'SGL' },
      });

      const ownerSet = await ownerPrisma.youthGenerationProfileSet.create({
        data: {
          name: 'Owner Custom Youth Profiles',
          description: 'owner-owned',
          isSystem: false,
          versions: {
            create: {
              versionNumber: 1,
              schemaVersion: 1,
              configHash: 'owner-custom-hash',
              changeReason: 'owner',
              createdBySource: 'COMMISSIONER_API',
            },
          },
        },
        include: { versions: true },
      });
      const ownerVersionId = ownerSet.versions[0]!.id;
      await ownerPrisma.activeYouthGenerationConfiguration.create({
        data: { id: 'default', activeProfileSetVersionId: ownerVersionId },
      });

      const { bootstrapYouthGenerationConfiguration } = await import(
        '../src/services/youth-generation-config.js'
      );
      const result = await bootstrapYouthGenerationConfiguration(ownerPrisma);
      expect(result.created).toBe(false);
      expect(result.activated).toBe(false);
      expect(result.deferred).toBe(false);
      expect(result.profileSetId).toBe(ownerSet.id);

      // The default system profile set must NOT have been created.
      const defaultSet = await ownerPrisma.youthGenerationProfileSet.findUnique({
        where: { name: YOUTH_DEFAULT_PROFILE_SET_NAME },
      });
      expect(defaultSet).toBeNull();

      // Active pointer must still point at the owner version.
      const active = await ownerPrisma.activeYouthGenerationConfiguration.findUniqueOrThrow({
        where: { id: 'default' },
      });
      expect(active.activeProfileSetVersionId).toBe(ownerVersionId);
    });
  });
});
