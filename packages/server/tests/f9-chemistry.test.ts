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

const fixtureDir = join(getRepoRoot(), 'data', 'fixtures', 'f3-minimal-world');
const headers = { [COMMISSIONER_HEADER]: COMMISSIONER_HEADER_VALUE };

describe('F9 chemistry APIs', () => {
  let app: FastifyInstance;
  let prisma: PrismaClient;
  let tempDir: string;
  let frostId = '';

  beforeAll(async () => {
    const { url, dir } = createTempDatabaseUrl();
    tempDir = dir;
    process.env.DATABASE_URL = url;
    process.env.FHM_DATASET_DIR = fixtureDir;
    process.env.FHM_COMMISSIONER_WRITES_ENABLED = 'true';
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

  it('returns chemistry for a team without lineup (all units unavailable)', async () => {
    const res = await app.inject({ method: 'GET', url: `/api/teams/${frostId}/chemistry` });
    expect(res.statusCode).toBe(200);
    const item = res.json().item;
    expect(item.chemistry.chemistryConfigVersion).toBe('f9-v1');
    expect(item.chemistry.balance).toEqual(item.balance);
    expect(item.balance).toMatchObject({
      presetName: 'Standard',
      versionNumber: expect.any(Number),
      configHash: expect.stringMatching(/^[a-f0-9]{64}$/),
      schemaVersion: 3,
    });
    expect(item.chemistry.forwardLines).toHaveLength(4);
    expect(item.chemistry.overall.unavailableUnits).toBeGreaterThan(0);
    expect(item.lineup.exists).toBe(false);
  });

  it('returns chemistry after auto-lineup and is deterministic', async () => {
    const auto = await app.inject({
      method: 'POST',
      url: `/api/commissioner/teams/${frostId}/lineup/auto-fill`,
      headers,
      payload: { expectedUpdatedAt: null, mode: 'REPLACE', reason: 'Chem test lineup' },
    });
    expect(auto.statusCode).toBe(200);
    const a = await app.inject({ method: 'GET', url: `/api/teams/${frostId}/chemistry` });
    const b = await app.inject({ method: 'GET', url: `/api/teams/${frostId}/chemistry` });
    expect(a.statusCode).toBe(200);
    expect(a.json().item.chemistry).toEqual(b.json().item.chemistry);
    expect(a.json().item.chemistry.overall.availableUnits).toBeGreaterThan(0);
    expect(a.json().item.chemistry.forwardLines[0].status).toBe('AVAILABLE');
    expect(a.json().item.chemistry.forwardLines[0].effectivePerformance).toBeTypeOf('number');
    expect(a.json().item.chemistry.forwardLines[0].factors.length).toBeGreaterThan(0);
    expect(JSON.stringify(a.json())).not.toMatch(/potentialFloor|developmentRisk/);
  });

  it('does not mutate database on chemistry reads', async () => {
    const before = await prisma.teamLineup.findUnique({ where: { teamId: frostId } });
    await app.inject({ method: 'GET', url: `/api/teams/${frostId}/chemistry` });
    const after = await prisma.teamLineup.findUnique({ where: { teamId: frostId } });
    expect(after?.updatedAt.toISOString()).toBe(before?.updatedAt.toISOString());
  });

  it('reflects team tactics change on next chemistry read', async () => {
    const setup = await app.inject({
      method: 'GET',
      url: `/api/commissioner/teams/${frostId}/setup`,
      headers,
    });
    const before = await app.inject({ method: 'GET', url: `/api/teams/${frostId}/chemistry` });
    const beforeFit = before.json().item.chemistry.forwardLines[0].tacticalFit;
    await app.inject({
      method: 'PATCH',
      url: `/api/commissioner/teams/${frostId}/setup`,
      headers,
      payload: {
        expectedUpdatedAt: setup.json().item.updatedAt,
        reason: 'Change tactics for chemistry',
        headCoachId: setup.json().item.coach?.id ?? null,
        tacticalStyle: 'PHYSICAL',
        replaceExisting: true,
      },
    });
    const after = await app.inject({ method: 'GET', url: `/api/teams/${frostId}/chemistry` });
    expect(after.json().item.team.tacticalStyle).toBe('PHYSICAL');
    expect(after.json().item.chemistry.forwardLines[0].tacticalFit).not.toBe(beforeFit);
  });

  it('returns 404 for missing team', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/teams/missing/chemistry' });
    expect(res.statusCode).toBe(404);
  });
});
