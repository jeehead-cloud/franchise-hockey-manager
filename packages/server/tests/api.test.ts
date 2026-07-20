import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import type { PrismaClient } from '@prisma/client';
import {
  cleanupTempDir,
  createTempDatabaseUrl,
  migrateTempDatabase,
} from './helpers/db.js';

const endpoints = [
  'world-seasons',
  'countries',
  'leagues',
  'teams',
  'players',
  'coaches',
  'competitions',
  'competition-editions',
] as const;

describe('F2 read APIs', () => {
  let app: FastifyInstance;
  let prisma: PrismaClient;
  let tempDir: string;
  const ids: Record<string, string> = {};

  beforeAll(async () => {
    const { url, dir } = createTempDatabaseUrl();
    tempDir = dir;
    process.env.DATABASE_URL = url;
    migrateTempDatabase(url);

    const db = await import('../src/db/client.js');
    prisma = db.prisma;

    const { buildApp } = await import('../src/app.js');
    app = await buildApp({ logger: false });
    await app.ready();

    const country = await prisma.country.create({
      data: { name: 'United States', code: 'USA' },
    });
    ids.country = country.id;

    const season = await prisma.worldSeason.create({
      data: {
        label: '2026/27',
        startYear: 2026,
        endYear: 2027,
        phase: 'SEASON_PREPARATION',
        status: 'ACTIVE',
      },
    });
    ids.worldSeason = season.id;

    const league = await prisma.league.create({
      data: {
        name: 'NHL',
        shortName: 'NHL',
        countryId: country.id,
        simulationLevel: 'DETAILED',
      },
    });
    ids.league = league.id;

    const team = await prisma.team.create({
      data: {
        name: 'API Club',
        city: 'Metro',
        shortName: 'APC',
        teamType: 'CLUB',
        countryId: country.id,
        leagueId: league.id,
      },
    });
    ids.team = team.id;

    const player = await prisma.player.create({
      data: {
        firstName: 'Pat',
        lastName: 'Center',
        dateOfBirth: new Date('1999-03-03'),
        nationalityCountryId: country.id,
        currentTeamId: team.id,
        primaryPosition: 'C',
        sourceType: 'REAL_INITIAL_DATA',
        rosterStatus: 'ACTIVE',
      },
    });
    ids.player = player.id;

    const coach = await prisma.coach.create({
      data: {
        firstName: 'Chris',
        lastName: 'Coach',
        nationalityCountryId: country.id,
        currentTeamId: team.id,
        coachingStyle: 'DEVELOPMENTAL',
        tacticalStyle: 'COMBINATIONAL',
      },
    });
    ids.coach = coach.id;

    const competition = await prisma.competition.create({
      data: {
        name: 'Stanley Cup Playoffs',
        shortName: 'SCP',
        type: 'PLAYOFF',
        simulationLevel: 'DETAILED',
      },
    });
    ids.competition = competition.id;

    const edition = await prisma.competitionEdition.create({
      data: {
        competitionId: competition.id,
        worldSeasonId: season.id,
        displayName: 'Stanley Cup 2027',
        status: 'PLANNED',
        rulesSnapshotText: JSON.stringify({
          schemaVersion: 1,
          format: 'KNOCKOUT_ONLY',
          matchRules: {
            overtimeEnabled: true,
            overtimeDurationSeconds: 300,
            overtimeSkaterCount: 3,
            shootoutEnabled: true,
            shootoutRounds: 3,
            tiesAllowed: false,
          },
          series: { winsRequired: 4, homePattern: '2-2-1-1-1', reseeding: false },
        }),
        rulesHash: 'test-hash',
      },
    });
    ids.edition = edition.id;
  });

  afterAll(async () => {
    if (app) await app.close();
    if (prisma) await prisma.$disconnect();
    if (tempDir) cleanupTempDir(tempDir);
  });

  it.each(endpoints)('GET /api/%s returns items', async (segment) => {
    const res = await app.inject({ method: 'GET', url: `/api/${segment}` });
    expect(res.statusCode).toBe(200);
    const body = res.json() as {
      items: unknown[];
      page?: number;
      pageSize?: number;
      total?: number;
      totalPages?: number;
    };
    expect(Array.isArray(body.items)).toBe(true);
    expect(body.items.length).toBeGreaterThan(0);
    if (segment === 'teams' || segment === 'players' || segment === 'competitions') {
      expect(body.page).toBe(1);
      expect(body.pageSize).toBe(25);
      expect(body.total).toBeGreaterThan(0);
      expect(body.totalPages).toBeGreaterThan(0);
    }
  });

  it('returns detail envelopes for representative records', async () => {
    const cases: Array<{ path: string; id: string; key: string }> = [
      { path: 'world-seasons', id: ids.worldSeason!, key: 'label' },
      { path: 'countries', id: ids.country!, key: 'code' },
      { path: 'leagues', id: ids.league!, key: 'name' },
      { path: 'teams', id: ids.team!, key: 'name' },
      { path: 'players', id: ids.player!, key: 'lastName' },
      { path: 'coaches', id: ids.coach!, key: 'lastName' },
      { path: 'competitions', id: ids.competition!, key: 'name' },
      { path: 'competition-editions', id: ids.edition!, key: 'displayName' },
    ];

    for (const c of cases) {
      const res = await app.inject({ method: 'GET', url: `/api/${c.path}/${c.id}` });
      expect(res.statusCode).toBe(200);
      const body = res.json() as { item: Record<string, unknown> };
      expect(body.item).toBeTruthy();
      expect(body.item.id).toBe(c.id);
      expect(body.item[c.key]).toBeTruthy();
    }
  });

  it('returns 404 for missing details', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/teams/does-not-exist',
    });
    expect(res.statusCode).toBe(404);
    const body = res.json() as { error: string; message: string };
    expect(body.error).toBe('NotFound');
    expect(body.message).toMatch(/Team/i);
  });

  it('keeps health endpoint working', async () => {
    const res = await app.inject({ method: 'GET', url: '/health' });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { status: string; database: string };
    expect(body.status).toBe('ok');
    expect(body.database).toBe('ok');
  });

  // Regression (Defect 4): strict pagination validation. The New Match page
  // previously sent pageSize=200, which exceeded the 1–100 cap. The fix is
  // client-side (paginate with pageSize≤100); the server MUST keep rejecting
  // invalid pageSizes so a buggy/legacy client cannot bypass validation.
  it.each([
    ['pageSize=200', 'pageSize=200'],
    ['pageSize=0', 'pageSize=0'],
    ['pageSize=-5', 'pageSize=-5'],
    ['pageSize=abc', 'pageSize=abc'],
    ['pageSize=101', 'pageSize=101'],
  ])('rejects invalid %s on /api/teams with 400 (strict pagination preserved)', async (_label, param) => {
    const res = await app.inject({ method: 'GET', url: `/api/teams?${param}` });
    expect(res.statusCode).toBe(400);
    const body = res.json() as { error: string; message: string };
    expect(body.message).toMatch(/pageSize must be an integer between 1 and 100/);
  });

  it.each([
    ['pageSize=1', 'pageSize=1'],
    ['pageSize=100', 'pageSize=100'],
    ['pageSize=50', 'pageSize=50'],
  ])('accepts valid %s on /api/teams (boundary preserved)', async (_label, param) => {
    const res = await app.inject({ method: 'GET', url: `/api/teams?${param}&sort=name` });
    expect(res.statusCode).toBe(200);
  });
});
