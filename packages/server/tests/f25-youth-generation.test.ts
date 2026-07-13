import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import type { PrismaClient } from '@prisma/client';
import { join } from 'node:path';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { existsSync } from 'node:fs';
import {
  cleanupTempDir,
  createTempDatabaseUrl,
  migrateTempDatabase,
} from './helpers/db.js';
import { getRepoRoot } from '../src/initialization/paths.js';
import { COMMISSIONER_HEADER, COMMISSIONER_HEADER_VALUE } from '../src/commissioner/gate.js';
import { YOUTH_DEFAULT_PROFILE_SET_NAME } from '../src/services/youth-generation-config.js';

const fixtureDir = join(getRepoRoot(), 'data', 'fixtures', 'f3-minimal-world');
const commissionerHeaders = {
  [COMMISSIONER_HEADER]: COMMISSIONER_HEADER_VALUE,
  'x-fhm-commissioner-source': 'api',
};

describe('F25 Youth Generation', () => {
  let app: FastifyInstance;
  let prisma: PrismaClient;
  let tempDir: string;
  let backupDir: string;
  let worldSeasonId = '';
  let worldSeasonUpdatedAt = '';
  let existingPlayerId = '';
  let existingPlayerUpdatedAt = '';
  let navCountryId = '';
  let enabledCountryCount = 0;

  beforeAll(async () => {
    const { url, dir } = createTempDatabaseUrl();
    tempDir = dir;
    backupDir = mkdtempSync(join(tmpdir(), 'fhm-f25-bak-'));
    process.env.DATABASE_URL = url;
    process.env.FHM_DATASET_DIR = fixtureDir;
    process.env.FHM_COMMISSIONER_WRITES_ENABLED = 'true';
    process.env.FHM_BACKUP_DIR = backupDir;
    migrateTempDatabase(url);
    const db = await import('../src/db/client.js');
    prisma = db.prisma;
    const { initializeSetup } = await import('../src/initialization/index.js');
    await prisma.appMeta.upsert({
      where: { id: 'default' },
      create: { id: 'default', worldInitialized: false },
      update: { worldInitialized: false },
    });
    await initializeSetup(prisma, fixtureDir);

    const season = await prisma.worldSeason.findFirstOrThrow();
    worldSeasonId = season.id;
    worldSeasonUpdatedAt = season.updatedAt.toISOString();

    const nav = await prisma.country.findFirstOrThrow({ where: { code: 'NAV' } });
    navCountryId = nav.id;

    const existing = await prisma.player.findFirstOrThrow({
      where: { rosterStatus: { not: 'RETIRED' } },
    });
    existingPlayerId = existing.id;
    existingPlayerUpdatedAt = existing.updatedAt.toISOString();

    const { buildApp, ensureAppMeta } = await import('../src/app.js');
    await ensureAppMeta();
    app = await buildApp({ logger: false });
    await app.ready();

    const countries = await prisma.countryYouthProfileVersion.findMany({
      where: {
        profileSetVersion: {
          activeFor: { isNot: null },
        },
      },
    });
    enabledCountryCount = countries.length;
    expect(enabledCountryCount).toBeGreaterThanOrEqual(2);
  });

  afterAll(async () => {
    if (app) await app.close();
    if (prisma) await prisma.$disconnect();
    if (tempDir) cleanupTempDir(tempDir);
    if (backupDir) cleanupTempDir(backupDir);
  });

  it('F25 migration folder exists', () => {
    const migrationPath = join(
      getRepoRoot(),
      'packages',
      'server',
      'prisma',
      'migrations',
      '20260715000000_f25_youth_generation',
      'migration.sql',
    );
    expect(existsSync(migrationPath)).toBe(true);
  });

  it('bootstrap creates Youth Profiles Default v1 and is idempotent', async () => {
    const { bootstrapYouthGenerationConfiguration } = await import(
      '../src/services/youth-generation-config.js'
    );
    const first = await bootstrapYouthGenerationConfiguration(prisma);
    expect(first.profileSetId).toBeTruthy();

    const profileSet = await prisma.youthGenerationProfileSet.findUniqueOrThrow({
      where: { id: first.profileSetId },
      include: { versions: true },
    });
    expect(profileSet.name).toBe(YOUTH_DEFAULT_PROFILE_SET_NAME);
    expect(profileSet.isSystem).toBe(true);

    const active = await prisma.activeYouthGenerationConfiguration.findUniqueOrThrow({
      where: { id: 'default' },
    });
    expect(active.activeProfileSetVersionId).toBeTruthy();

    const versionCount = await prisma.youthGenerationProfileSetVersion.count();
    const second = await bootstrapYouthGenerationConfiguration(prisma);
    expect(second.created).toBe(false);
    expect(await prisma.youthGenerationProfileSetVersion.count()).toBe(versionCount);
  });

  it('preview makes no database writes', async () => {
    const runCountBefore = await prisma.youthGenerationRun.count();
    const playerCountBefore = await prisma.player.count();
    const cohortCountBefore = await prisma.youthCohort.count();
    const provenanceCountBefore = await prisma.youthGeneratedPlayer.count();

    const res = await app.inject({
      method: 'POST',
      url: '/api/commissioner/youth-generation/preview',
      headers: commissionerHeaders,
      payload: {
        worldSeasonId,
        referenceDate: '2027-07-01',
        baseSeed: 'f25-preview-seed',
      },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json().item;
    expect(body.preview).toBe(true);
    expect(body.summary.enabledCountryCount).toBe(enabledCountryCount);
    expect(body.summary.totalGeneratedPlayers).toBeGreaterThan(0);
    expect(body.summary.inputHash).toMatch(/^[a-f0-9]{64}$/);
    expect(body.summary.resultHash).toMatch(/^[a-f0-9]{64}$/);
    expect(body.items[0].potentialCeiling).toBeTypeOf('number');
    expect(body.items[0].qualityTier).toBeTruthy();

    expect(await prisma.youthGenerationRun.count()).toBe(runCountBefore);
    expect(await prisma.player.count()).toBe(playerCountBefore);
    expect(await prisma.youthCohort.count()).toBe(cohortCountBefore);
    expect(await prisma.youthGeneratedPlayer.count()).toBe(provenanceCountBefore);
  });

  it('prepare freezes planned input and PREPARED run without Player rows', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/commissioner/youth-generation/prepare',
      headers: commissionerHeaders,
      payload: {
        worldSeasonId,
        expectedWorldSeasonUpdatedAt: worldSeasonUpdatedAt,
        referenceDate: '2027-07-01',
        baseSeed: 'f25-prepare-seed',
        reason: 'F25 test prepare',
      },
    });
    expect(res.statusCode).toBe(200);
    const run = res.json().item.run;
    expect(run.status).toBe('PREPARED');
    expect(run.inputHash).toMatch(/^[a-f0-9]{64}$/);

    const dbRun = await prisma.youthGenerationRun.findUniqueOrThrow({ where: { id: run.id } });
    expect(dbRun.plannedInputText).toBeTruthy();
    expect(JSON.parse(dbRun.plannedInputText!).countries.length).toBeGreaterThanOrEqual(2);
    expect(await prisma.player.count({ where: { sourceType: 'GENERATED_YOUTH' } })).toBe(0);
  });

  it('execute publishes atomically with deterministic result hash', async () => {
    const prepared = await prisma.youthGenerationRun.findFirstOrThrow({
      where: { worldSeasonId, status: 'PREPARED' },
    });

    const preview = await app.inject({
      method: 'POST',
      url: '/api/commissioner/youth-generation/preview',
      headers: commissionerHeaders,
      payload: {
        worldSeasonId,
        referenceDate: prepared.referenceDate,
        baseSeed: prepared.baseSeed,
      },
    });
    const expectedResultHash = preview.json().item.summary.resultHash;
    const expectedTotal = preview.json().item.summary.totalGeneratedPlayers;

    const playerCountBefore = await prisma.player.count();
    const existingBefore = await prisma.player.findUniqueOrThrow({
      where: { id: existingPlayerId },
    });

    const exec = await app.inject({
      method: 'POST',
      url: `/api/commissioner/youth-generation/runs/${prepared.id}/execute`,
      headers: commissionerHeaders,
      payload: { confirmation: true, reason: 'F25 test execute publish' },
    });
    expect(exec.statusCode).toBe(200);
    const published = exec.json().item;
    expect(published.run.status).toBe('COMPLETED');
    expect(published.run.isCurrent).toBe(true);
    expect(published.run.resultHash).toBe(expectedResultHash);
    expect(published.run.inputHash).toBe(prepared.inputHash);
    expect(published.backupPath).toBeTruthy();
    expect(published.summary.totalGeneratedPlayers).toBe(expectedTotal);

    const generatedCount = await prisma.player.count({ where: { sourceType: 'GENERATED_YOUTH' } });
    const cohortCount = await prisma.youthCohort.count({ where: { youthGenerationRunId: prepared.id } });
    const provenanceCount = await prisma.youthGeneratedPlayer.count({
      where: { youthGenerationRunId: prepared.id },
    });
    expect(generatedCount).toBe(expectedTotal);
    expect(cohortCount).toBe(enabledCountryCount);
    expect(provenanceCount).toBe(expectedTotal);

    const sample = await prisma.player.findFirstOrThrow({
      where: { sourceType: 'GENERATED_YOUTH' },
      include: { youthGeneratedPlayer: true, skaterAttributes: true, goalieAttributes: true },
    });
    expect(sample.rosterStatus).toBe('PROSPECT');
    expect(sample.currentTeamId).toBeNull();
    expect(sample.nationalityCountryId).toBeTruthy();
    expect(sample.youthGeneratedPlayer).toBeTruthy();
    expect(
      sample.primaryPosition === 'G' ? sample.goalieAttributes : sample.skaterAttributes,
    ).toBeTruthy();

    const existingAfter = await prisma.player.findUniqueOrThrow({
      where: { id: existingPlayerId },
    });
    expect(existingAfter.updatedAt.toISOString()).toBe(existingPlayerUpdatedAt);
    expect(await prisma.player.count()).toBe(playerCountBefore + expectedTotal);
  });

  it('locks further official youth generation for the WorldSeason', async () => {
    const prepareAgain = await app.inject({
      method: 'POST',
      url: '/api/commissioner/youth-generation/prepare',
      headers: commissionerHeaders,
      payload: {
        worldSeasonId,
        expectedWorldSeasonUpdatedAt: worldSeasonUpdatedAt,
        referenceDate: '2028-07-01',
        baseSeed: 'f25-blocked',
        reason: 'Should be blocked',
      },
    });
    expect(prepareAgain.statusCode).toBe(409);
    expect(prepareAgain.json().error).toBe('YouthGenerationAlreadyApplied');
  });

  it('post-edit provenance snapshot remains stable', async () => {
    const generated = await prisma.player.findFirstOrThrow({
      where: { sourceType: 'GENERATED_YOUTH' },
      include: { youthGeneratedPlayer: true },
    });
    const provenanceBefore = generated.youthGeneratedPlayer!;
    const nameBefore = provenanceBefore.playerNameSnapshot;
    const abilityBefore = provenanceBefore.currentAbilitySnapshot;

    await prisma.player.update({
      where: { id: generated.id },
      data: { firstName: 'Edited', lastName: 'Prospect', form: 2 },
    });

    const provenanceAfter = await prisma.youthGeneratedPlayer.findUniqueOrThrow({
      where: { playerId: generated.id },
    });
    expect(provenanceAfter.playerNameSnapshot).toBe(nameBefore);
    expect(provenanceAfter.currentAbilitySnapshot).toBe(abilityBefore);

    const live = await prisma.player.findUniqueOrThrow({ where: { id: generated.id } });
    expect(live.firstName).toBe('Edited');
    expect(live.form).toBe(2);
  });

  it('GET status and profile-sets are public', async () => {
    const status = await app.inject({
      method: 'GET',
      url: `/api/youth-generation/status?worldSeasonId=${worldSeasonId}`,
    });
    expect(status.statusCode).toBe(200);
    expect(status.json().item.youthGenerationApplied).toBe(true);
    expect(status.json().item.generatedProspectCount).toBeGreaterThan(0);

    const configs = await app.inject({ method: 'GET', url: '/api/youth-generation/profile-sets' });
    expect(configs.statusCode).toBe(200);
    expect(
      configs.json().items.some((p: { name: string }) => p.name === YOUTH_DEFAULT_PROFILE_SET_NAME),
    ).toBe(true);

    const countries = await app.inject({ method: 'GET', url: '/api/youth-generation/countries' });
    expect(countries.statusCode).toBe(200);
    expect(countries.json().item.items.length).toBeGreaterThanOrEqual(2);
  });
});
