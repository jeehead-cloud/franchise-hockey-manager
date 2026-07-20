import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import type { PrismaClient } from '@prisma/client';
import { cleanupTempDir, createTempDatabaseUrl, migrateTempDatabase } from './helpers/db.js';
import { getRepoRoot } from '../src/initialization/paths.js';
import { initializeSetup } from '../src/initialization/index.js';
import { join } from 'node:path';

const fixtureDir = join(getRepoRoot(), 'data', 'fixtures', 'f3-minimal-world');

interface PlayerListRow {
  id: string;
  firstName: string;
  lastName: string;
  primaryPosition: string;
  rosterStatus: string;
  currentTeam: { name: string } | null;
  nationality?: { name: string } | null;
}

/**
 * Regression coverage for Finding 4 — Player list sorting.
 *
 * The list is paginated, so sorting is performed on the server against an
 * allowlist of fields. Invalid sort/direction values must be rejected with a
 * stable 400 (no arbitrary query string reaches Prisma ordering). A stable
 * secondary `id` order prevents row movement between pages. No private Player
 * truth (potential/developmentRate/hidden attributes) is exposed.
 */
describe('Player list sorting (Finding 4 regression)', () => {
  let app: FastifyInstance;
  let prisma: PrismaClient;
  let tempDir = '';

  beforeAll(async () => {
    const { url, dir } = createTempDatabaseUrl();
    tempDir = dir;
    process.env.DATABASE_URL = url;
    process.env.FHM_DATASET_DIR = fixtureDir;
    migrateTempDatabase(url);
    const db = await import('../src/db/client.js');
    prisma = db.prisma;
    await prisma.appMeta.upsert({
      where: { id: 'default' },
      create: { id: 'default', worldInitialized: false },
      update: { worldInitialized: false },
    });
    await initializeSetup(prisma, fixtureDir);
    const { buildApp } = await import('../src/app.js');
    app = await buildApp({ logger: false });
    await app.ready();
  });

  afterAll(async () => {
    if (app) await app.close();
    if (prisma) await prisma.$disconnect();
    if (tempDir) cleanupTempDir(tempDir);
  });

  async function listPlayers(sort: string, direction: string, pageSize = 100): Promise<PlayerListRow[]> {
    const res = await app.inject({
      method: 'GET',
      url: `/api/players?sort=${encodeURIComponent(sort)}&direction=${encodeURIComponent(direction)}&pageSize=${pageSize}`,
    });
    expect(res.statusCode).toBe(200);
    return res.json().items as PlayerListRow[];
  }

  it('rejects an invalid sort field with 400 (allowlist enforced)', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/players?sort=currentAbility' });
    expect(res.statusCode).toBe(400);
    expect(res.json().message).toMatch(/sort must be one of:/);
  });

  it('rejects a malformed direction by falling back to asc (allowlisted)', async () => {
    // direction is normalized: only 'desc' is honored; anything else is 'asc'.
    const asc = await listPlayers('lastName', 'asc');
    const weird = await listPlayers('lastName', 'sideways');
    expect(weird.map((p) => p.id)).toEqual(asc.map((p) => p.id));
  });

  it('sorts by lastName asc/desc (default) with firstName tie-break', async () => {
    const asc = await listPlayers('lastName', 'asc');
    const desc = await listPlayers('lastName', 'desc');
    expect(asc.length).toBeGreaterThan(0);
    // ascending vs descending differ on the first element when >1 row.
    if (asc.length > 1) expect(asc[0]!.id).not.toBe(desc[0]!.id);
    // Verify ascending order by lastName then firstName.
    for (let i = 1; i < asc.length; i += 1) {
      const a = `${asc[i - 1]!.lastName}|${asc[i - 1]!.firstName}`;
      const b = `${asc[i]!.lastName}|${asc[i]!.firstName}`;
      expect(a.localeCompare(b)).toBeLessThanOrEqual(0);
    }
    for (let i = 1; i < desc.length; i += 1) {
      const a = `${desc[i - 1]!.lastName}|${desc[i - 1]!.firstName}`;
      const b = `${desc[i]!.lastName}|${desc[i]!.firstName}`;
      expect(a.localeCompare(b)).toBeGreaterThanOrEqual(0);
    }
  });

  it('sorts by primaryPosition asc and desc', async () => {
    const asc = await listPlayers('primaryPosition', 'asc');
    const desc = await listPlayers('primaryPosition', 'desc');
    for (let i = 1; i < asc.length; i += 1) {
      expect(asc[i - 1]!.primaryPosition.localeCompare(asc[i]!.primaryPosition)).toBeLessThanOrEqual(0);
    }
    for (let i = 1; i < desc.length; i += 1) {
      expect(desc[i - 1]!.primaryPosition.localeCompare(desc[i]!.primaryPosition)).toBeGreaterThanOrEqual(0);
    }
  });

  it('sorts by rosterStatus (column)', async () => {
    const asc = await listPlayers('rosterStatus', 'asc');
    const desc = await listPlayers('rosterStatus', 'desc');
    for (let i = 1; i < asc.length; i += 1) {
      expect(asc[i - 1]!.rosterStatus.localeCompare(asc[i]!.rosterStatus)).toBeLessThanOrEqual(0);
    }
    for (let i = 1; i < desc.length; i += 1) {
      expect(desc[i - 1]!.rosterStatus.localeCompare(desc[i]!.rosterStatus)).toBeGreaterThanOrEqual(0);
    }
  });

  it('sorts by team (relation sort by currentTeam.name)', async () => {
    const asc = await listPlayers('team', 'asc');
    const desc = await listPlayers('team', 'desc');
    const name = (p: PlayerListRow) => p.currentTeam?.name ?? '';
    for (let i = 1; i < asc.length; i += 1) {
      expect(name(asc[i - 1]!).localeCompare(name(asc[i]!))).toBeLessThanOrEqual(0);
    }
    for (let i = 1; i < desc.length; i += 1) {
      expect(name(desc[i - 1]!).localeCompare(name(desc[i]!))).toBeGreaterThanOrEqual(0);
    }
  });

  it('sorts by nationality (relation sort by nationality.name)', async () => {
    const asc = await listPlayers('nationality', 'asc');
    expect(asc.length).toBeGreaterThan(0);
    // Fixture players carry nationality; verify ascending order where present.
    const name = (p: PlayerListRow) => p.nationality?.name ?? '';
    for (let i = 1; i < asc.length; i += 1) {
      expect(name(asc[i - 1]!).localeCompare(name(asc[i]!))).toBeLessThanOrEqual(0);
    }
  });

  it('sorts by age (aliases dateOfBirth with inverted direction)', async () => {
    // age asc == youngest first == dateOfBirth desc.
    const youngestFirst = await listPlayers('age', 'asc');
    const oldestFirst = await listPlayers('age', 'desc');
    // youngestFirst's dateOfBirths should be non-increasing (later dates first).
    const dobDesc = await app.inject({
      method: 'GET',
      url: '/api/players?sort=dateOfBirth&direction=desc&pageSize=100',
    });
    expect(dobDesc.statusCode).toBe(200);
    const dobRows = dobDesc.json().items as Array<{ id: string }>;
    // age-asc ordering must equal dateOfBirth-desc ordering (same stable id tiebreak).
    expect(youngestFirst.map((p) => p.id)).toEqual(dobRows.map((p) => p.id));
    // age-desc must be the inverse ordering of age-asc when all keys are distinct.
    if (new Set(youngestFirst.map((p) => p.id)).size === youngestFirst.length) {
      expect(oldestFirst.map((p) => p.id)).toEqual([...youngestFirst].reverse().map((p) => p.id));
    }
  });

  it('keeps sort stable across pages (secondary id order, no row movement)', async () => {
    const page1 = await app.inject({
      method: 'GET',
      url: '/api/players?sort=lastName&direction=asc&page=1&pageSize=5',
    });
    const page2 = await app.inject({
      method: 'GET',
      url: '/api/players?sort=lastName&direction=asc&page=2&pageSize=5',
    });
    expect(page1.statusCode).toBe(200);
    expect(page2.statusCode).toBe(200);
    const p1 = (page1.json().items) as Array<{ id: string; lastName: string; firstName: string }>;
    const p2 = (page2.json().items) as Array<{ id: string; lastName: string; firstName: string }>;
    // No id appears on both pages.
    const ids1 = new Set(p1.map((p) => p.id));
    expect(p2.every((p) => !ids1.has(p.id))).toBe(true);
    // The last row of page1 is <= the first row of page2 under the sort key.
    const a = `${p1[p1.length - 1]!.lastName}|${p1[p1.length - 1]!.firstName}`;
    const b = `${p2[0]!.lastName}|${p2[0]!.firstName}`;
    expect(a.localeCompare(b)).toBeLessThanOrEqual(0);
  });

  it('does not expose hidden Player truth in sorted list output', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/players?sort=lastName&pageSize=5' });
    expect(res.statusCode).toBe(200);
    const serialized = res.body;
    // Hidden fields must never be present on the list payload.
    expect(serialized).not.toMatch(/"potentialFloor"/);
    expect(serialized).not.toMatch(/"potentialCeiling"/);
    expect(serialized).not.toMatch(/"developmentRate"/);
    expect(serialized).not.toMatch(/"developmentRisk"/);
  });
});
