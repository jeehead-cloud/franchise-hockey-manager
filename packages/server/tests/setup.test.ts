import { cpSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import {
  cleanupTempDir,
  createTempDatabaseUrl,
  createTestPrisma,
  migrateTempDatabase,
} from './helpers/db.js';
import { getRepoRoot } from '../src/initialization/paths.js';
import { loadDataset } from '../src/initialization/loader.js';
import { validateDataset } from '../src/initialization/validator.js';
import {
  getSetupStatus,
  initializeSetup,
  previewSetup,
} from '../src/initialization/index.js';
import { SetupError } from '../src/initialization/errors.js';
import { assessEmptyWorld, getDomainCounts } from '../src/initialization/status.js';

const fixtureDir = join(getRepoRoot(), 'data', 'fixtures', 'f3-minimal-world');

function copyFixtureToTemp(): string {
  const dir = mkdtempSync(join(tmpdir(), 'fhm-f3-data-'));
  cpSync(fixtureDir, dir, { recursive: true });
  return dir;
}

describe('F3 loader', () => {
  it('loads the development fixture manifest and files', () => {
    const dataset = loadDataset(fixtureDir);
    expect(dataset.manifest.datasetId).toBe('fhm-f3-minimal-fixture-v1');
    expect(dataset.manifest.schemaVersion).toBe(4);
    expect(dataset.countries.length).toBeGreaterThan(0);
    expect(dataset.players.length).toBeGreaterThan(0);
  });

  it('reports missing referenced files', () => {
    const dir = copyFixtureToTemp();
    try {
      rmSync(join(dir, 'players.json'));
      expect(() => loadDataset(dir)).toThrow(/Missing dataset file/);
    } finally {
      cleanupTempDir(dir);
    }
  });

  it('reports malformed JSON', () => {
    const dir = copyFixtureToTemp();
    try {
      writeFileSync(join(dir, 'countries.json'), '{not-json', 'utf8');
      expect(() => loadDataset(dir)).toThrow(/Malformed JSON/);
    } finally {
      cleanupTempDir(dir);
    }
  });

  it('reports unsupported schema version', () => {
    const dir = copyFixtureToTemp();
    try {
      const manifest = JSON.parse(readFileSync(join(dir, 'manifest.json'), 'utf8')) as Record<
        string,
        unknown
      >;
      manifest.schemaVersion = 99;
      writeFileSync(join(dir, 'manifest.json'), JSON.stringify(manifest), 'utf8');
      expect(() => loadDataset(dir)).toThrow(/Unsupported schemaVersion|schemaVersion/);
    } finally {
      cleanupTempDir(dir);
    }
  });

  it('rejects schemaVersion 3 with a clear migration message', () => {
    const dir = copyFixtureToTemp();
    try {
      const path = join(dir, 'manifest.json');
      const manifest = JSON.parse(readFileSync(path, 'utf8'));
      manifest.schemaVersion = 3;
      writeFileSync(path, JSON.stringify(manifest, null, 2));
      expect(() => loadDataset(dir)).toThrow(/schemaVersion 4|schemaVersion: 3/i);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('rejects schemaVersion 2 with a clear migration message', () => {
    const dir = copyFixtureToTemp();
    try {
      const path = join(dir, 'manifest.json');
      const manifest = JSON.parse(readFileSync(path, 'utf8'));
      manifest.schemaVersion = 2;
      writeFileSync(path, JSON.stringify(manifest, null, 2));
      expect(() => loadDataset(dir)).toThrow(/schemaVersion 4|schemaVersion: 2/i);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('rejects schemaVersion 1 with a clear migration message', () => {
    const dir = copyFixtureToTemp();
    try {
      const manifest = JSON.parse(readFileSync(join(dir, 'manifest.json'), 'utf8')) as Record<
        string,
        unknown
      >;
      manifest.schemaVersion = 1;
      writeFileSync(join(dir, 'manifest.json'), JSON.stringify(manifest), 'utf8');
      expect(() => loadDataset(dir)).toThrow(/schemaVersion 4|schemaVersion: 1/i);
    } finally {
      cleanupTempDir(dir);
    }
  });
});

describe('F3 validation', () => {
  it('accepts the valid fixture with fictional warning', () => {
    const report = validateDataset(loadDataset(fixtureDir));
    expect(report.valid).toBe(true);
    expect(report.warnings.some((w) => w.code === 'FICTIONAL_DATASET')).toBe(true);
    expect(report.counts.players).toBe(24);
  });

  it('rejects duplicate external IDs', () => {
    const dir = copyFixtureToTemp();
    try {
      const countries = JSON.parse(readFileSync(join(dir, 'countries.json'), 'utf8')) as unknown[];
      countries.push({ externalId: 'NAV', name: 'Dup', code: 'DUP' });
      writeFileSync(join(dir, 'countries.json'), JSON.stringify(countries), 'utf8');
      const report = validateDataset(loadDataset(dir));
      expect(report.valid).toBe(false);
      expect(report.errors.some((e) => e.code === 'DUPLICATE_EXTERNAL_ID')).toBe(true);
    } finally {
      cleanupTempDir(dir);
    }
  });

  it('rejects duplicate country codes', () => {
    const dir = copyFixtureToTemp();
    try {
      const countries = JSON.parse(readFileSync(join(dir, 'countries.json'), 'utf8')) as unknown[];
      countries.push({ externalId: 'XXX', name: 'Other', code: 'NAV' });
      writeFileSync(join(dir, 'countries.json'), JSON.stringify(countries), 'utf8');
      const report = validateDataset(loadDataset(dir));
      expect(report.valid).toBe(false);
      expect(report.errors.some((e) => e.code === 'DUPLICATE_COUNTRY_CODE')).toBe(true);
    } finally {
      cleanupTempDir(dir);
    }
  });

  it('rejects missing country references', () => {
    const dir = copyFixtureToTemp();
    try {
      const teams = JSON.parse(readFileSync(join(dir, 'teams.json'), 'utf8')) as Array<
        Record<string, unknown>
      >;
      teams[0]!.countryExternalId = 'NOPE';
      writeFileSync(join(dir, 'teams.json'), JSON.stringify(teams), 'utf8');
      const report = validateDataset(loadDataset(dir));
      expect(report.valid).toBe(false);
      expect(report.errors.some((e) => e.code === 'MISSING_COUNTRY_REF')).toBe(true);
    } finally {
      cleanupTempDir(dir);
    }
  });

  it('rejects missing league references', () => {
    const dir = copyFixtureToTemp();
    try {
      const teams = JSON.parse(readFileSync(join(dir, 'teams.json'), 'utf8')) as Array<
        Record<string, unknown>
      >;
      teams[0]!.leagueExternalId = 'missing-league';
      writeFileSync(join(dir, 'teams.json'), JSON.stringify(teams), 'utf8');
      const report = validateDataset(loadDataset(dir));
      expect(report.valid).toBe(false);
      expect(report.errors.some((e) => e.code === 'MISSING_LEAGUE_REF')).toBe(true);
    } finally {
      cleanupTempDir(dir);
    }
  });

  it('rejects missing team references on players', () => {
    const dir = copyFixtureToTemp();
    try {
      const players = JSON.parse(readFileSync(join(dir, 'players.json'), 'utf8')) as Array<
        Record<string, unknown>
      >;
      players[0]!.currentTeamExternalId = 'missing-team';
      writeFileSync(join(dir, 'players.json'), JSON.stringify(players), 'utf8');
      const report = validateDataset(loadDataset(dir));
      expect(report.valid).toBe(false);
      expect(report.errors.some((e) => e.code === 'MISSING_TEAM_REF')).toBe(true);
    } finally {
      cleanupTempDir(dir);
    }
  });

  it('rejects invalid enums via loader parse', () => {
    const dir = copyFixtureToTemp();
    try {
      const players = JSON.parse(readFileSync(join(dir, 'players.json'), 'utf8')) as Array<
        Record<string, unknown>
      >;
      players[0]!.primaryPosition = 'QB';
      writeFileSync(join(dir, 'players.json'), JSON.stringify(players), 'utf8');
      expect(() => loadDataset(dir)).toThrow();
    } finally {
      cleanupTempDir(dir);
    }
  });

  it('rejects malformed dates via loader parse', () => {
    const dir = copyFixtureToTemp();
    try {
      const players = JSON.parse(readFileSync(join(dir, 'players.json'), 'utf8')) as Array<
        Record<string, unknown>
      >;
      players[0]!.dateOfBirth = '03-12-1998';
      writeFileSync(join(dir, 'players.json'), JSON.stringify(players), 'utf8');
      expect(() => loadDataset(dir)).toThrow();
    } finally {
      cleanupTempDir(dir);
    }
  });

  it('rejects duplicate coach team assignments', () => {
    const dir = copyFixtureToTemp();
    try {
      const coaches = JSON.parse(readFileSync(join(dir, 'coaches.json'), 'utf8')) as unknown[];
      coaches.push({
        externalId: 'coach-extra',
        firstName: 'Extra',
        lastName: 'Bench',
        nationalityExternalId: 'NAV',
        currentTeamExternalId: 'team-frostbite',
        coachingStyle: 'DEMOCRATIC',
        tacticalStyle: 'SPEED',
        overallCoaching: 10,
        playerDevelopment: 10,
        offense: 10,
        defense: 10,
      });
      writeFileSync(join(dir, 'coaches.json'), JSON.stringify(coaches), 'utf8');
      const report = validateDataset(loadDataset(dir));
      expect(report.valid).toBe(false);
      expect(report.errors.some((e) => e.code === 'DUPLICATE_COACH_ASSIGNMENT')).toBe(true);
    } finally {
      cleanupTempDir(dir);
    }
  });

  it('rejects invalid competition edition references', () => {
    const dir = copyFixtureToTemp();
    try {
      const editions = JSON.parse(
        readFileSync(join(dir, 'competition-editions.json'), 'utf8'),
      ) as Array<Record<string, unknown>>;
      editions[0]!.competitionExternalId = 'missing-comp';
      writeFileSync(join(dir, 'competition-editions.json'), JSON.stringify(editions), 'utf8');
      const report = validateDataset(loadDataset(dir));
      expect(report.valid).toBe(false);
      expect(report.errors.some((e) => e.code === 'MISSING_COMPETITION_REF')).toBe(true);
    } finally {
      cleanupTempDir(dir);
    }
  });
});

describe('F3 preview / initialize / idempotency', () => {
  let prisma: PrismaClient;
  let tempDir: string;
  let databaseUrl: string;

  beforeAll(() => {
    const temp = createTempDatabaseUrl();
    tempDir = temp.dir;
    databaseUrl = temp.url;
    process.env.DATABASE_URL = databaseUrl;
    migrateTempDatabase(databaseUrl);
    prisma = createTestPrisma(databaseUrl);
  });

  afterAll(async () => {
    await prisma.$disconnect();
    cleanupTempDir(tempDir);
  });

  beforeEach(async () => {
    await prisma.competitionEdition.deleteMany();
    await prisma.competition.deleteMany();
    await prisma.coach.deleteMany();
    await prisma.player.deleteMany();
    await prisma.team.deleteMany();
    await prisma.league.deleteMany();
    await prisma.country.deleteMany();
    await prisma.worldSeason.deleteMany();
    await prisma.appMeta.deleteMany();
    await prisma.appMeta.create({ data: { id: 'default', worldInitialized: false } });
  });

  it('preview returns counts/warnings and writes nothing', async () => {
    const preview = await previewSetup(prisma, fixtureDir);
    expect(preview.valid).toBe(true);
    expect(preview.counts.teams).toBe(3);
    expect(preview.warnings.length).toBeGreaterThan(0);
    const counts = await getDomainCounts(prisma);
    expect(counts.countries).toBe(0);
    expect(counts.players).toBe(0);
  });

  it('initializes all entities with source metadata and REAL_INITIAL_DATA', async () => {
    const result = await initializeSetup(prisma, fixtureDir);
    expect(result.initialized).toBe(true);
    expect(result.created.worldSeasons).toBe(1);
    expect(result.created.countries).toBe(2);
    expect(result.created.leagues).toBe(1);
    expect(result.created.teams).toBe(3);
    expect(result.created.players).toBe(24);
    expect(result.created.coaches).toBe(2);
    expect(result.created.competitions).toBe(1);
    expect(result.created.competitionEditions).toBe(1);

    const season = await prisma.worldSeason.findFirst();
    expect(season?.phase).toBe('SEASON_PREPARATION');
    expect(season?.status).toBe('ACTIVE');
    expect(season?.sourceDataset).toBe('fhm-f3-minimal-fixture-v1');

    const players = await prisma.player.findMany({
      include: { skaterAttributes: true, goalieAttributes: true },
    });
    expect(players.every((p) => p.sourceType === 'REAL_INITIAL_DATA')).toBe(true);
    expect(players.every((p) => p.sourceDataset === 'fhm-f3-minimal-fixture-v1')).toBe(true);
    expect(players.every((p) => p.externalId)).toBeTruthy();
    expect(
      players.every((p) =>
        p.primaryPosition === 'G'
          ? Boolean(p.goalieAttributes) && !p.skaterAttributes
          : Boolean(p.skaterAttributes) && !p.goalieAttributes,
      ),
    ).toBe(true);
    expect(players.every((p) => p.potentialFloor != null && p.publicPotentialEstimate != null)).toBe(
      true,
    );

    const team = await prisma.team.findFirst({
      where: { externalId: 'team-frostbite' },
      include: { coach: true, players: true },
    });
    expect(team?.coach?.externalId).toBe('coach-rowan-pike');
    expect(team?.players.length).toBe(20);

    const meta = await prisma.appMeta.findUnique({ where: { id: 'default' } });
    expect(meta?.worldInitialized).toBe(true);
    expect(meta?.worldDatasetId).toBe('fhm-f3-minimal-fixture-v1');
    expect(meta?.worldSchemaVersion).toBe(4);
  });

  it('rolls back partial data after injected failure', async () => {
    await expect(
      initializeSetup(prisma, fixtureDir, { failAfter: 'players' }),
    ).rejects.toThrow(/__FAIL_AFTER__/);

    const counts = await getDomainCounts(prisma);
    expect(counts.countries).toBe(0);
    expect(counts.players).toBe(0);
    const meta = await prisma.appMeta.findUnique({ where: { id: 'default' } });
    expect(meta?.worldInitialized).toBe(false);
  });

  it('rejects second initialization without duplicates', async () => {
    await initializeSetup(prisma, fixtureDir);
    const before = await getDomainCounts(prisma);
    await expect(initializeSetup(prisma, fixtureDir)).rejects.toBeInstanceOf(SetupError);
    try {
      await initializeSetup(prisma, fixtureDir);
    } catch (err) {
      expect(err).toBeInstanceOf(SetupError);
      expect((err as SetupError).code).toBe('WorldAlreadyInitialized');
      expect((err as SetupError).statusCode).toBe(409);
    }
    const after = await getDomainCounts(prisma);
    expect(after).toEqual(before);
  });

  it('status reports initialized after success; preview remains safe', async () => {
    await initializeSetup(prisma, fixtureDir);
    const status = await getSetupStatus(prisma, fixtureDir);
    expect(status.initialized).toBe(true);
    expect(status.canInitialize).toBe(false);
    const preview = await previewSetup(prisma, fixtureDir);
    expect(preview.valid).toBe(true);
    expect(preview.canInitialize).toBe(false);
  });

  it('AppMeta-only does not block initialization', async () => {
    const empty = await assessEmptyWorld(prisma);
    expect(empty.canInitialize).toBe(true);
  });

  it('partial domain data blocks initialization', async () => {
    await prisma.country.create({ data: { name: 'Partial', code: 'PAR' } });
    await expect(initializeSetup(prisma, fixtureDir)).rejects.toMatchObject({
      code: 'WorldNotEmpty',
    });
  });
});

describe('F3 setup API', () => {
  let app: Awaited<ReturnType<typeof import('../src/app.js').buildApp>>;
  let prisma: PrismaClient;
  let tempDir: string;

  beforeAll(async () => {
    const temp = createTempDatabaseUrl();
    tempDir = temp.dir;
    process.env.DATABASE_URL = temp.url;
    process.env.FHM_DATASET_DIR = fixtureDir;
    migrateTempDatabase(temp.url);

    // Re-import prisma client bound to env — use createTestPrisma and inject via module.
    // buildApp uses singleton prisma from db/client; set DATABASE_URL before import.
    const db = await import('../src/db/client.js');
    prisma = db.prisma;
    await prisma.appMeta.upsert({
      where: { id: 'default' },
      create: { id: 'default', worldInitialized: false },
      update: { worldInitialized: false, worldDatasetId: null, worldInitializedAt: null },
    });

    const { buildApp } = await import('../src/app.js');
    app = await buildApp({ logger: false });
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
    cleanupTempDir(tempDir);
  });

  it('GET /api/setup/status', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/setup/status' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.canInitialize).toBe(true);
    expect(body.dataset.id).toBe('fhm-f3-minimal-fixture-v1');
  });

  it('GET /api/setup/preview', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/setup/preview' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.valid).toBe(true);
    expect(body.counts.players).toBe(24);
  });

  it('POST initialize success then 409', async () => {
    // Ensure empty
    await prisma.competitionEdition.deleteMany();
    await prisma.competition.deleteMany();
    await prisma.coach.deleteMany();
    await prisma.player.deleteMany();
    await prisma.team.deleteMany();
    await prisma.league.deleteMany();
    await prisma.country.deleteMany();
    await prisma.worldSeason.deleteMany();
    await prisma.appMeta.update({
      where: { id: 'default' },
      data: {
        worldInitialized: false,
        worldDatasetId: null,
        worldInitializedAt: null,
        worldSchemaVersion: null,
      },
    });

    const ok = await app.inject({ method: 'POST', url: '/api/setup/initialize' });
    expect(ok.statusCode).toBe(200);
    expect(ok.json().initialized).toBe(true);

    const countries = await app.inject({ method: 'GET', url: '/api/countries' });
    expect(countries.statusCode).toBe(200);
    expect(countries.json().items.length).toBe(2);

    const again = await app.inject({ method: 'POST', url: '/api/setup/initialize' });
    expect(again.statusCode).toBe(409);
    expect(again.json().error).toBe('WorldAlreadyInitialized');
  });

  it('returns 422 for invalid dataset', async () => {
    const badDir = copyFixtureToTemp();
    try {
      const countries = JSON.parse(readFileSync(join(badDir, 'countries.json'), 'utf8')) as unknown[];
      countries.push({ externalId: 'NAV', name: 'Dup', code: 'ZZZ' });
      writeFileSync(join(badDir, 'countries.json'), JSON.stringify(countries), 'utf8');

      // Fresh empty DB state for this assertion: wipe domain if previous test left data
      await prisma.competitionEdition.deleteMany();
      await prisma.competition.deleteMany();
      await prisma.coach.deleteMany();
      await prisma.player.deleteMany();
      await prisma.team.deleteMany();
      await prisma.league.deleteMany();
      await prisma.country.deleteMany();
      await prisma.worldSeason.deleteMany();
      await prisma.appMeta.update({
        where: { id: 'default' },
        data: {
          worldInitialized: false,
          worldDatasetId: null,
          worldInitializedAt: null,
          worldSchemaVersion: null,
        },
      });

      process.env.FHM_DATASET_DIR = badDir;
      const res = await app.inject({ method: 'POST', url: '/api/setup/initialize' });
      expect(res.statusCode).toBe(422);
      expect(res.json().error).toBe('DatasetValidationError');
    } finally {
      process.env.FHM_DATASET_DIR = fixtureDir;
      cleanupTempDir(badDir);
    }
  });

  it('dataset unavailable when directory missing', async () => {
    const missing = join(tmpdir(), 'fhm-missing-dataset-dir');
    mkdirSync(missing, { recursive: true });
    process.env.FHM_DATASET_DIR = join(missing, 'nope');
    try {
      const res = await app.inject({ method: 'GET', url: '/api/setup/status' });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.dataset).toBeNull();
      expect(body.canInitialize).toBe(false);
    } finally {
      process.env.FHM_DATASET_DIR = fixtureDir;
      cleanupTempDir(missing);
    }
  });
});
