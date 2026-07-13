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
import { DEVELOPMENT_DEFAULT_PRESET_NAME } from '../src/services/player-development-config.js';

const fixtureDir = join(getRepoRoot(), 'data', 'fixtures', 'f3-minimal-world');
const commissionerHeaders = {
  [COMMISSIONER_HEADER]: COMMISSIONER_HEADER_VALUE,
  'x-fhm-commissioner-source': 'api',
};

describe('F24 Player Development', () => {
  let app: FastifyInstance;
  let prisma: PrismaClient;
  let tempDir: string;
  let backupDir: string;
  let worldSeasonId = '';
  let worldSeasonUpdatedAt = '';
  let samplePlayerId = '';
  let sampleTeamId: string | null = null;
  let eligibleCount = 0;

  beforeAll(async () => {
    const { url, dir } = createTempDatabaseUrl();
    tempDir = dir;
    backupDir = mkdtempSync(join(tmpdir(), 'fhm-f24-bak-'));
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

    const { buildApp, ensureAppMeta } = await import('../src/app.js');
    await ensureAppMeta();
    app = await buildApp({ logger: false });
    await app.ready();

    const players = await prisma.player.findMany({
      where: { rosterStatus: { not: 'RETIRED' } },
      include: { skaterAttributes: true, goalieAttributes: true },
    });
    const complete = players.filter(
      (p) =>
        p.potentialCeiling != null &&
        ((p.primaryPosition === 'G' && p.goalieAttributes) ||
          (p.primaryPosition !== 'G' && p.skaterAttributes)),
    );
    eligibleCount = complete.length;
    const sample = complete[0];
    expect(sample).toBeTruthy();
    samplePlayerId = sample!.id;
    sampleTeamId = sample!.currentTeamId;
  });

  afterAll(async () => {
    if (app) await app.close();
    if (prisma) await prisma.$disconnect();
    if (tempDir) cleanupTempDir(tempDir);
    if (backupDir) cleanupTempDir(backupDir);
  });

  it('F24 migration folder exists', () => {
    const migrationPath = join(
      getRepoRoot(),
      'packages',
      'server',
      'prisma',
      'migrations',
      '20260714000000_f24_player_development',
      'migration.sql',
    );
    expect(existsSync(migrationPath)).toBe(true);
  });

  it('bootstrap creates Development Default v1 and is idempotent', async () => {
    const { bootstrapPlayerDevelopmentConfiguration } = await import(
      '../src/services/player-development-config.js'
    );
    const first = await bootstrapPlayerDevelopmentConfiguration(prisma);
    expect(first.presetId).toBeTruthy();
    expect(first.versionId).toBeTruthy();

    const preset = await prisma.playerDevelopmentPreset.findUniqueOrThrow({
      where: { id: first.presetId },
      include: { versions: true },
    });
    expect(preset.name).toBe(DEVELOPMENT_DEFAULT_PRESET_NAME);
    expect(preset.isSystem).toBe(true);
    expect(preset.versions.length).toBeGreaterThanOrEqual(1);

    const active = await prisma.activePlayerDevelopmentConfiguration.findUniqueOrThrow({
      where: { id: 'default' },
    });
    expect(active.activePresetVersionId).toBe(first.versionId);

    const versionCount = await prisma.playerDevelopmentPresetVersion.count();
    const second = await bootstrapPlayerDevelopmentConfiguration(prisma);
    expect(second.created).toBe(false);
    expect(await prisma.playerDevelopmentPresetVersion.count()).toBe(versionCount);
  });

  it('preview makes no database writes', async () => {
    const runCountBefore = await prisma.playerDevelopmentRun.count();
    const snapCountBefore = await prisma.playerSeasonSnapshot.count();
    const playerBefore = await prisma.player.findUniqueOrThrow({
      where: { id: samplePlayerId },
      include: { skaterAttributes: true, goalieAttributes: true },
    });

    const res = await app.inject({
      method: 'POST',
      url: '/api/commissioner/player-development/preview',
      headers: commissionerHeaders,
      payload: {
        worldSeasonId,
        effectiveDate: '2027-07-01',
        baseSeed: 'f24-preview-seed',
      },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json().item;
    expect(body.preview).toBe(true);
    expect(body.summary.totalPlayers).toBe(eligibleCount);
    expect(body.summary.inputHash).toMatch(/^[a-f0-9]{64}$/);
    expect(body.summary.resultHash).toMatch(/^[a-f0-9]{64}$/);

    expect(await prisma.playerDevelopmentRun.count()).toBe(runCountBefore);
    expect(await prisma.playerSeasonSnapshot.count()).toBe(snapCountBefore);

    const playerAfter = await prisma.player.findUniqueOrThrow({
      where: { id: samplePlayerId },
      include: { skaterAttributes: true, goalieAttributes: true },
    });
    expect(playerAfter.updatedAt.toISOString()).toBe(playerBefore.updatedAt.toISOString());
    expect(playerAfter.form).toBe(playerBefore.form);
  });

  it('prepare freezes PRE snapshots and PREPARED run', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/commissioner/player-development/prepare',
      headers: commissionerHeaders,
      payload: {
        worldSeasonId,
        expectedWorldSeasonUpdatedAt: worldSeasonUpdatedAt,
        effectiveDate: '2027-07-01',
        baseSeed: 'f24-prepare-seed',
        reason: 'F24 test prepare',
      },
    });
    expect(res.statusCode).toBe(200);
    const run = res.json().item.run;
    expect(run.status).toBe('PREPARED');
    expect(run.inputHash).toMatch(/^[a-f0-9]{64}$/);

    const snaps = await prisma.playerSeasonSnapshot.count({
      where: { runId: run.id, snapshotType: 'PRE_DEVELOPMENT' },
    });
    expect(snaps).toBe(eligibleCount);

    const playerSnap = await prisma.playerSeasonSnapshot.findFirstOrThrow({
      where: { runId: run.id, playerId: samplePlayerId, snapshotType: 'PRE_DEVELOPMENT' },
    });
    expect(playerSnap.inputHash).toMatch(/^[a-f0-9]{64}$/);
    expect(playerSnap.attributesText).toBeTruthy();
  });

  it('rejects execute when player state changed after prepare (stale input)', async () => {
    const prepared = await prisma.playerDevelopmentRun.findFirstOrThrow({
      where: { worldSeasonId, status: 'PREPARED' },
    });

    await prisma.player.update({
      where: { id: samplePlayerId },
      data: { form: 3 },
    });

    const res = await app.inject({
      method: 'POST',
      url: `/api/commissioner/player-development/runs/${prepared.id}/execute`,
      headers: commissionerHeaders,
      payload: { confirmation: true, reason: 'Should fail stale' },
    });
    expect(res.statusCode).toBe(409);
    expect(res.json().error).toBe('DevelopmentInputStale');

    const failed = await prisma.playerDevelopmentRun.findUniqueOrThrow({
      where: { id: prepared.id },
    });
    expect(['PREPARED', 'FAILED']).toContain(failed.status);

    await prisma.player.update({
      where: { id: samplePlayerId },
      data: { form: 0 },
    });

    await app.inject({
      method: 'DELETE',
      url: `/api/commissioner/player-development/runs/${prepared.id}`,
      headers: commissionerHeaders,
      payload: { reason: 'Discard stale prepared run' },
    });
  });

  it('execute publishes atomically with deterministic result hash', async () => {
    const prepare1 = await app.inject({
      method: 'POST',
      url: '/api/commissioner/player-development/prepare',
      headers: commissionerHeaders,
      payload: {
        worldSeasonId,
        expectedWorldSeasonUpdatedAt: worldSeasonUpdatedAt,
        effectiveDate: '2027-07-01',
        baseSeed: 'f24-execute-seed',
        reason: 'F24 test execute',
      },
    });
    expect(prepare1.statusCode).toBe(200);
    const runId = prepare1.json().item.run.id;
    const inputHash = prepare1.json().item.inputHash;

    const preview = await app.inject({
      method: 'POST',
      url: '/api/commissioner/player-development/preview',
      headers: commissionerHeaders,
      payload: {
        worldSeasonId,
        effectiveDate: '2027-07-01',
        baseSeed: 'f24-execute-seed',
      },
    });
    const expectedResultHash = preview.json().item.summary.resultHash;

    const exec = await app.inject({
      method: 'POST',
      url: `/api/commissioner/player-development/runs/${runId}/execute`,
      headers: commissionerHeaders,
      payload: { confirmation: true, reason: 'F24 test execute publish' },
    });
    expect(exec.statusCode).toBe(200);
    const published = exec.json().item;
    expect(published.run.status).toBe('COMPLETED');
    expect(published.run.isCurrent).toBe(true);
    expect(published.run.resultHash).toBe(expectedResultHash);
    expect(published.run.inputHash).toBe(inputHash);
    expect(published.backupPath).toBeTruthy();

    const resultCount = await prisma.playerDevelopmentResult.count({ where: { runId } });
    const postSnaps = await prisma.playerSeasonSnapshot.count({
      where: { runId, snapshotType: 'POST_DEVELOPMENT' },
    });
    expect(resultCount).toBe(eligibleCount);
    expect(postSnaps).toBe(eligibleCount);

    const sampleResult = await prisma.playerDevelopmentResult.findFirstOrThrow({
      where: { runId, playerId: samplePlayerId },
    });
    expect(sampleResult.currentAbilityBefore).not.toBe(sampleResult.currentAbilityAfter);
  });

  it('locks further official development for the WorldSeason', async () => {
    const prepareAgain = await app.inject({
      method: 'POST',
      url: '/api/commissioner/player-development/prepare',
      headers: commissionerHeaders,
      payload: {
        worldSeasonId,
        expectedWorldSeasonUpdatedAt: worldSeasonUpdatedAt,
        effectiveDate: '2028-07-01',
        baseSeed: 'f24-blocked',
        reason: 'Should be blocked',
      },
    });
    expect(prepareAgain.statusCode).toBe(409);
    expect(prepareAgain.json().error).toBe('DevelopmentAlreadyApplied');
  });

  it('retirement does not delete player and preserves team ownership', async () => {
    const country = await prisma.country.findFirstOrThrow();
    const oldPlayer = await prisma.player.create({
      data: {
        firstName: 'Old',
        lastName: 'Retiree',
        dateOfBirth: new Date('1975-03-01'),
        nationalityCountryId: country.id,
        currentTeamId: sampleTeamId,
        primaryPosition: 'C',
        sourceType: 'MANUAL',
        rosterStatus: 'ACTIVE',
        preferredCoachingStyle: 'AUTHORITARIAN',
        preferredTactics: 'SYSTEM',
        personality: 'LEADER',
        heroRating: 8,
        stability: 8,
        developmentRate: 1,
        developmentRisk: 0.2,
        potentialFloor: 6,
        potentialCeiling: 10,
        publicPotentialEstimate: 'LOW',
        form: 0,
        skaterAttributes: {
          create: {
            stickhandling: 7,
            shooting: 7,
            passing: 7,
            strength: 7,
            speed: 7,
            balance: 7,
            aggression: 7,
            offensiveAwareness: 7,
            defensiveAwareness: 7,
          },
        },
      },
    });

    const secondSeason = await prisma.worldSeason.create({
      data: {
        label: '2027-28',
        startYear: 2027,
        endYear: 2028,
        phase: 'OFFSEASON',
        status: 'ACTIVE',
      },
    });

    const prep = await app.inject({
      method: 'POST',
      url: '/api/commissioner/player-development/prepare',
      headers: commissionerHeaders,
      payload: {
        worldSeasonId: secondSeason.id,
        expectedWorldSeasonUpdatedAt: secondSeason.updatedAt.toISOString(),
        effectiveDate: '2028-07-01',
        baseSeed: 'f24-retire-seed',
        reason: 'Retirement test',
      },
    });
    expect(prep.statusCode).toBe(200);
    const runId = prep.json().item.run.id;

    const exec = await app.inject({
      method: 'POST',
      url: `/api/commissioner/player-development/runs/${runId}/execute`,
      headers: commissionerHeaders,
      payload: { confirmation: true, reason: 'Retirement execute' },
    });
    expect(exec.statusCode).toBe(200);

    const updated = await prisma.player.findUniqueOrThrow({ where: { id: oldPlayer.id } });
    expect(updated.rosterStatus).toBe('RETIRED');
    expect(updated.currentTeamId).toBe(sampleTeamId);

    const result = await prisma.playerDevelopmentResult.findFirstOrThrow({
      where: { runId, playerId: oldPlayer.id },
    });
    expect(result.retired).toBe(true);
    expect(result.outcome).toBe('RETIRED');
  });

  it('GET status and configurations are public', async () => {
    const status = await app.inject({
      method: 'GET',
      url: `/api/player-development/status?worldSeasonId=${worldSeasonId}`,
    });
    expect(status.statusCode).toBe(200);
    expect(status.json().item.developmentApplied).toBe(true);

    const configs = await app.inject({ method: 'GET', url: '/api/player-development/configurations' });
    expect(configs.statusCode).toBe(200);
    expect(configs.json().items.some((p: { name: string }) => p.name === DEVELOPMENT_DEFAULT_PRESET_NAME)).toBe(
      true,
    );
  });
});
