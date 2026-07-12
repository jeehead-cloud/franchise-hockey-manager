import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import type { PrismaClient } from '@prisma/client';
import {
  cleanupTempDir,
  createTempDatabaseUrl,
  migrateTempDatabase,
} from './helpers/db.js';
import { getRepoRoot } from '../src/initialization/paths.js';
import { initializeSetup } from '../src/initialization/index.js';
import { join } from 'node:path';

const fixtureDir = join(getRepoRoot(), 'data', 'fixtures', 'f3-minimal-world');

describe('F4 browser APIs', () => {
  let app: FastifyInstance;
  let prisma: PrismaClient;
  let tempDir: string;
  let teamId = '';
  let playerId = '';
  let competitionId = '';

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

    const team = await prisma.team.findFirst({ where: { externalId: 'team-frostbite' } });
    const player = await prisma.player.findFirst({ where: { externalId: 'player-kai-winters' } });
    const competition = await prisma.competition.findFirst();
    teamId = team!.id;
    playerId = player!.id;
    competitionId = competition!.id;

    const { buildApp } = await import('../src/app.js');
    app = await buildApp({ logger: false });
    await app.ready();
  });

  afterAll(async () => {
    if (app) await app.close();
    if (prisma) await prisma.$disconnect();
    if (tempDir) cleanupTempDir(tempDir);
  });

  it('GET /api/world returns summary for initialized fixture', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/world' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.initialized).toBe(true);
    expect(body.fictionalDataset).toBe(true);
    expect(body.season.label).toBe('2026/27');
    expect(body.counts.teams).toBe(3);
    expect(body.counts.players).toBe(6);
    expect(body.structure.clubTeams).toBe(3);
    expect(Array.isArray(body.warnings)).toBe(true);
    expect(body.recommendedNextAction.href).toBeTruthy();
    expect(body.ageReference.rule).toBe('july1_of_world_season_start_year');
  });

  it('paginates and filters teams', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/teams?search=Frost&page=1&pageSize=10&sort=name&direction=asc',
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.page).toBe(1);
    expect(body.pageSize).toBe(10);
    expect(body.total).toBe(1);
    expect(body.totalPages).toBe(1);
    expect(body.items[0].name).toContain('Frostbite');
    expect(body.items[0].rosterCount).toBeGreaterThan(0);
  });

  it('rejects invalid team pageSize', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/teams?pageSize=999' });
    expect(res.statusCode).toBe(400);
  });

  it('rejects invalid sort', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/players?sort=ovr' });
    expect(res.statusCode).toBe(400);
  });

  it('filters players by position and returns age', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/players?position=C' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.total).toBeGreaterThanOrEqual(1);
    expect(body.items.every((p: { primaryPosition: string }) => p.primaryPosition === 'C')).toBe(
      true,
    );
    expect(body.items[0].age).toBeTypeOf('number');
  });

  it('filters competitions by type', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/competitions?type=LEAGUE' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.total).toBe(1);
    expect(body.items[0].currentEdition).toBeTruthy();
  });

  it('returns team detail with roster', async () => {
    const res = await app.inject({ method: 'GET', url: `/api/teams/${teamId}` });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.item.roster.length).toBeGreaterThan(0);
    expect(body.item.rosterSummary.total).toBe(body.item.roster.length);
    expect(body.item.coach?.coachingStyle).toBeTruthy();
  });

  it('returns player detail with assignment', async () => {
    const res = await app.inject({ method: 'GET', url: `/api/players/${playerId}` });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.item.firstName).toBe('Kai');
    expect(body.item.currentTeam?.name).toBeTruthy();
    expect(body.item.age).toBeTypeOf('number');
  });

  it('returns competition detail with editions', async () => {
    const res = await app.inject({ method: 'GET', url: `/api/competitions/${competitionId}` });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.item.editions.length).toBe(1);
  });

  it('returns 404 for missing player', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/players/missing-id' });
    expect(res.statusCode).toBe(404);
  });
});
