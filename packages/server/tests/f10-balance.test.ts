import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import type { PrismaClient } from '@prisma/client';
import { join } from 'node:path';
import {
  cleanupTempDir,
  createTempDatabaseUrl,
  migrateTempDatabase,
} from './helpers/db.js';
import { getRepoRoot } from '../src/initialization/paths.js';
import { COMMISSIONER_HEADER, COMMISSIONER_HEADER_VALUE } from '../src/commissioner/gate.js';
import { getStandardBalanceConfig, normalizeBalanceConfig, canonicalizeBalanceConfig } from '@fhm/engine';
import { createHash } from 'node:crypto';

const fixtureDir = join(getRepoRoot(), 'data', 'fixtures', 'f3-minimal-world');
const headers = { [COMMISSIONER_HEADER]: COMMISSIONER_HEADER_VALUE };

function hashConfig(config: Parameters<typeof normalizeBalanceConfig>[0]) {
  return createHash('sha256').update(canonicalizeBalanceConfig(config), 'utf8').digest('hex');
}

describe('F10 balance configuration', () => {
  let app: FastifyInstance;
  let prisma: PrismaClient;
  let tempDir: string;
  let frostId = '';
  let bootstrapBalanceConfiguration: typeof import('../src/services/balance-config.js').bootstrapBalanceConfiguration;
  let invalidateBalanceCache: typeof import('../src/services/balance-config.js').invalidateBalanceCache;

  beforeAll(async () => {
    const { url, dir } = createTempDatabaseUrl();
    tempDir = dir;
    process.env.DATABASE_URL = url;
    process.env.FHM_DATASET_DIR = fixtureDir;
    process.env.FHM_COMMISSIONER_WRITES_ENABLED = 'true';
    migrateTempDatabase(url);
    const db = await import('../src/db/client.js');
    prisma = db.prisma;
    const balance = await import('../src/services/balance-config.js');
    bootstrapBalanceConfiguration = balance.bootstrapBalanceConfiguration;
    invalidateBalanceCache = balance.invalidateBalanceCache;
    const { initializeSetup } = await import('../src/initialization/index.js');
    await prisma.appMeta.upsert({
      where: { id: 'default' },
      create: { id: 'default', worldInitialized: false },
      update: { worldInitialized: false },
    });
    await initializeSetup(prisma, fixtureDir);
    frostId = (await prisma.team.findFirstOrThrow({ where: { externalId: 'team-frostbite' } })).id;
    const { buildApp } = await import('../src/app.js');
    app = await buildApp({ logger: false });
    await app.ready();
  });

  beforeEach(() => {
    process.env.FHM_COMMISSIONER_WRITES_ENABLED = 'true';
  });

  afterAll(async () => {
    if (app) await app.close();
    if (prisma) await prisma.$disconnect();
    if (tempDir) cleanupTempDir(tempDir);
  });

  it('bootstrap creates Standard v1 active and is idempotent on rerun', async () => {
    const first = await bootstrapBalanceConfiguration(prisma);
    expect(first.presetId).toBeTruthy();
    expect(first.versionId).toBeTruthy();

    const preset = await prisma.balancePreset.findUniqueOrThrow({
      where: { id: first.presetId },
      include: { versions: true },
    });
    expect(preset.name).toBe('Standard');
    expect(preset.isSystem).toBe(true);
    expect(preset.versions).toHaveLength(1);
    expect(preset.versions[0]!.versionNumber).toBe(1);

    const active = await prisma.activeBalanceConfiguration.findUniqueOrThrow({
      where: { id: 'default' },
    });
    expect(active.activePresetVersionId).toBe(preset.versions[0]!.id);

    const versionCount = await prisma.balancePresetVersion.count();
    const second = await bootstrapBalanceConfiguration(prisma);
    expect(second.created).toBe(false);
    expect(second.activated).toBe(false);
    expect(second.presetId).toBe(first.presetId);
    expect(second.versionId).toBe(active.activePresetVersionId);
    expect(await prisma.balancePresetVersion.count()).toBe(versionCount);
  });

  it('GET /api/balance/active returns Standard snapshot', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/balance/active' });
    expect(res.statusCode).toBe(200);
    const item = res.json().item;
    expect(item.preset.name).toBe('Standard');
    expect(item.preset.isSystem).toBe(true);
    expect(item.version.versionNumber).toBeGreaterThanOrEqual(1);
    expect(item.version.configHash).toMatch(/^[a-f0-9]{64}$/);
    expect(item.config.chemistry.active).toBe(true);
    expect(item.runtimeDefaults.loggingLevel).toBe('STANDARD');
  });

  it('rejects commissioner balance writes without header', async () => {
    const presets = await app.inject({ method: 'GET', url: '/api/balance/presets' });
    const standardId = presets.json().items.find((p: { name: string }) => p.name === 'Standard').id;
    const res = await app.inject({
      method: 'POST',
      url: `/api/commissioner/balance/presets/${standardId}/duplicate`,
      payload: { name: 'Sandbox Copy', reason: 'no header' },
    });
    expect(res.statusCode).toBe(403);
  });

  it('duplicate, version create, activate updates chemistry balance metadata', async () => {
    const presets = await app.inject({ method: 'GET', url: '/api/balance/presets' });
    const standard = presets.json().items.find((p: { name: string }) => p.name === 'Standard');
    expect(standard).toBeTruthy();

    const dup = await app.inject({
      method: 'POST',
      url: `/api/commissioner/balance/presets/${standard.id}/duplicate`,
      headers,
      payload: { name: 'Lab Tuning', reason: 'Duplicate for F10 test' },
    });
    expect(dup.statusCode).toBe(200);
    const dupPreset = dup.json().item;
    expect(dupPreset.isSystem).toBe(false);
    expect(dupPreset.latestVersion.versionNumber).toBe(1);

    const activeBefore = await app.inject({ method: 'GET', url: '/api/balance/active' });
    const hashBefore = activeBefore.json().item.version.configHash;

    const baseConfig = structuredClone(activeBefore.json().item.config);
    baseConfig.chemistry.weights.version = 'f10-test-v2';
    baseConfig.chemistry.weights.weights.roleCompatibility = 0.25;
    baseConfig.chemistry.weights.weights.personalityCompatibility = 0.75;

    const created = await app.inject({
      method: 'POST',
      url: `/api/commissioner/balance/presets/${dupPreset.id}/versions`,
      headers,
      payload: {
        expectedLatestVersionId: dupPreset.latestVersion.id,
        reason: 'Tune chemistry weights',
        config: baseConfig,
        activate: true,
      },
    });
    expect(created.statusCode).toBe(200);
    const version = created.json().item;
    expect(version.versionNumber).toBe(2);
    expect(version.configHash).not.toBe(hashBefore);
    expect(version.isActive).toBe(true);

    const chem = await app.inject({ method: 'GET', url: `/api/teams/${frostId}/chemistry` });
    expect(chem.statusCode).toBe(200);
    const item = chem.json().item;
    expect(item.balance.configHash).toBe(version.configHash);
    expect(item.chemistry.balance.configHash).toBe(version.configHash);
    expect(item.chemistry.chemistryConfigVersion).toBe('f10-test-v2');
  });

  it('returns 422 for invalid balance config on version create', async () => {
    const presets = await app.inject({ method: 'GET', url: '/api/balance/presets' });
    const lab = presets.json().items.find((p: { name: string }) => p.name === 'Lab Tuning');
    expect(lab).toBeTruthy();

    const res = await app.inject({
      method: 'POST',
      url: `/api/commissioner/balance/presets/${lab.id}/versions`,
      headers,
      payload: {
        expectedLatestVersionId: lab.latestVersion.id,
        reason: 'Invalid config',
        config: { schemaVersion: 1, name: 'broken' },
      },
    });
    expect(res.statusCode).toBe(422);
    expect(res.json().error).toBe('InvalidBalanceConfig');
  });

  it('export/import round-trip preserves config hash', async () => {
    const active = await app.inject({ method: 'GET', url: '/api/balance/active' });
    const versionId = active.json().item.version.id;
    const exported = await app.inject({
      method: 'GET',
      url: `/api/balance/versions/${versionId}/export`,
    });
    expect(exported.statusCode).toBe(200);
    const payload = exported.json();
    expect(payload.format).toBe('fhm-balance-export');
    expect(payload.configHash ?? payload.version.configHash).toBeTruthy();

    const imported = await app.inject({
      method: 'POST',
      url: '/api/commissioner/balance/import',
      headers,
      payload: {
        name: 'Imported Lab',
        reason: 'Round-trip import',
        config: payload,
      },
    });
    expect(imported.statusCode).toBe(200);
    const item = imported.json().item;
    expect(item.latestVersion.configHash).toBe(payload.version.configHash);
    expect(item.isActive).toBe(false);

    const expected = hashConfig(normalizeBalanceConfig(payload.config));
    expect(item.latestVersion.configHash).toBe(expected);
  });

  it('activation changes chemistry balance fields without restart', async () => {
    invalidateBalanceCache();
    const presets = await app.inject({ method: 'GET', url: '/api/balance/presets' });
    const standard = presets.json().items.find((p: { name: string }) => p.name === 'Standard');
    const standardVersions = await app.inject({
      method: 'GET',
      url: `/api/balance/presets/${standard.id}/versions`,
    });
    const v1 = standardVersions.json().items.find((v: { versionNumber: number }) => v.versionNumber === 1);
    expect(v1).toBeTruthy();

    const before = await app.inject({ method: 'GET', url: `/api/teams/${frostId}/chemistry` });
    const beforeHash = before.json().item.balance.configHash;

    const activate = await app.inject({
      method: 'POST',
      url: `/api/commissioner/balance/versions/${v1.id}/activate`,
      headers,
      payload: { reason: 'Reactivate Standard v1' },
    });
    expect(activate.statusCode).toBe(200);
    expect(activate.json().item.version.id).toBe(v1.id);

    const after = await app.inject({ method: 'GET', url: `/api/teams/${frostId}/chemistry` });
    expect(after.json().item.balance.configHash).toBe(v1.configHash);
    expect(after.json().item.chemistry.balance.configHash).toBe(v1.configHash);
    expect(after.json().item.balance.configHash).not.toBe(beforeHash);
  });

  it('returns 409 on stale expectedLatestVersionId', async () => {
    const presets = await app.inject({ method: 'GET', url: '/api/balance/presets' });
    const lab = presets.json().items.find((p: { name: string }) => p.name === 'Lab Tuning');
    const standardConfig = getStandardBalanceConfig();

    const res = await app.inject({
      method: 'POST',
      url: `/api/commissioner/balance/presets/${lab.id}/versions`,
      headers,
      payload: {
        expectedLatestVersionId: 'stale-version-id',
        reason: 'Stale concurrency check',
        config: standardConfig,
      },
    });
    expect(res.statusCode).toBe(409);
    expect(res.json().error).toBe('EditConflict');
  });
});
