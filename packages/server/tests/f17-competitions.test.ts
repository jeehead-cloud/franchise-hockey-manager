import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import type { PrismaClient } from '@prisma/client';
import { join } from 'node:path';
import {
  cleanupTempDir,
  createTempDatabaseUrl,
  migrateTempDatabase,
} from './helpers/db.js';
import { getRepoRoot } from '../src/initialization/paths.js';

const fixtureDir = join(getRepoRoot(), 'data', 'fixtures', 'f3-minimal-world');

const commissionerHeaders = {
  'x-fhm-commissioner-mode': 'enabled',
  'x-fhm-commissioner-source': 'api',
};

describe('F17 Competition Framework', () => {
  let app: FastifyInstance;
  let prisma: PrismaClient;
  let tempDir: string;
  let competitionId = '';
  let worldSeasonId = '';
  let leagueId = '';
  let teamA = '';
  let teamB = '';

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
    competitionId = (await prisma.competition.findFirstOrThrow()).id;
    worldSeasonId = (await prisma.worldSeason.findFirstOrThrow()).id;
    leagueId = (await prisma.league.findFirstOrThrow()).id;
    const teams = await prisma.team.findMany({ orderBy: { name: 'asc' }, take: 2 });
    teamA = teams[0]!.id;
    teamB = teams[1]!.id;
    // Remove fixture edition so we can create a fresh PREPARING edition
    await prisma.competitionEdition.deleteMany({ where: { competitionId } });
    const { buildApp, ensureAppMeta } = await import('../src/app.js');
    await ensureAppMeta();
    app = await buildApp({ logger: false });
    await app.ready();
  });

  afterAll(async () => {
    if (app) await app.close();
    if (prisma) await prisma.$disconnect();
    if (tempDir) cleanupTempDir(tempDir);
  });

  it('lists competitions and imports rules hash on fixture competition', async () => {
    const list = await app.inject({ method: 'GET', url: '/api/competitions' });
    expect(list.statusCode).toBe(200);
    expect(list.json().items.length).toBeGreaterThan(0);

    const detail = await app.inject({ method: 'GET', url: `/api/competitions/${competitionId}` });
    expect(detail.statusCode).toBe(200);
    expect(detail.json().item.defaultRules).toBeTruthy();
    expect(detail.json().item.hasDefaultRules).toBe(true);
  });

  it('creates edition, manages participants/stages, readiness, and activation', async () => {
    const created = await app.inject({
      method: 'POST',
      url: `/api/commissioner/competitions/${competitionId}/editions`,
      headers: commissionerHeaders,
      payload: {
        worldSeasonId,
        displayName: 'FHL Test Edition',
        templateKey: 'SIMPLE_LEAGUE',
        reason: 'Create F17 test edition',
      },
    });
    expect(created.statusCode).toBe(201);
    const editionId = created.json().item.id as string;
    expect(created.json().item.status).toBe('PREPARING');
    expect(created.json().item.rulesHash).toMatch(/^[a-f0-9]{64}$/);

    let edition = await app.inject({
      method: 'GET',
      url: `/api/competition-editions/${editionId}`,
    });
    expect(edition.statusCode).toBe(200);
    let updatedAt = edition.json().item.updatedAt as string;

    const bulk = await app.inject({
      method: 'POST',
      url: `/api/commissioner/competition-editions/${editionId}/participants/from-league`,
      headers: commissionerHeaders,
      payload: {
        expectedUpdatedAt: updatedAt,
        leagueId,
        status: 'CONFIRMED',
        reason: 'Add league clubs for F17',
      },
    });
    expect(bulk.statusCode).toBe(200);
    expect(bulk.json().item.addedCount).toBeGreaterThanOrEqual(2);

    edition = await app.inject({ method: 'GET', url: `/api/competition-editions/${editionId}` });
    updatedAt = edition.json().item.updatedAt;

    const stage = await app.inject({
      method: 'POST',
      url: `/api/commissioner/competition-editions/${editionId}/stages`,
      headers: commissionerHeaders,
      payload: {
        expectedUpdatedAt: updatedAt,
        name: 'Regular Season',
        stageType: 'REGULAR_SEASON',
        stageOrder: 1,
        participantSource: 'EDITION_PARTICIPANTS',
        config: { gamesPerTeam: 4, qualifiersCount: 2 },
        reason: 'Add opening stage',
      },
    });
    expect(stage.statusCode).toBe(201);

    const readiness = await app.inject({
      method: 'GET',
      url: `/api/competition-editions/${editionId}/readiness`,
    });
    expect(readiness.statusCode).toBe(200);
    expect(readiness.json().item.readiness.blockers).toEqual([]);

    edition = await app.inject({ method: 'GET', url: `/api/competition-editions/${editionId}` });
    updatedAt = edition.json().item.updatedAt;

    const ready = await app.inject({
      method: 'POST',
      url: `/api/commissioner/competition-editions/${editionId}/transition`,
      headers: commissionerHeaders,
      payload: {
        expectedUpdatedAt: updatedAt,
        targetStatus: 'READY',
        reason: 'Mark structure ready',
      },
    });
    expect(ready.statusCode).toBe(200);
    expect(ready.json().item.status).toBe('READY');

    edition = await app.inject({ method: 'GET', url: `/api/competition-editions/${editionId}` });
    updatedAt = edition.json().item.updatedAt;

    const blockedEdit = await app.inject({
      method: 'POST',
      url: `/api/commissioner/competition-editions/${editionId}/stages`,
      headers: commissionerHeaders,
      payload: {
        expectedUpdatedAt: updatedAt,
        name: 'Playoffs',
        stageType: 'BEST_OF_SERIES',
        stageOrder: 2,
        participantSource: 'PREVIOUS_STAGE_QUALIFIERS',
        sourceStageId: stage.json().item.id,
        expectedQualifierCount: 2,
        config: { winsRequired: 4, reseeding: false, homePattern: '2-2-1-1-1' },
        reason: 'Should fail while READY',
      },
    });
    expect(blockedEdit.statusCode).toBe(409);

    const activate = await app.inject({
      method: 'POST',
      url: `/api/commissioner/competition-editions/${editionId}/transition`,
      headers: commissionerHeaders,
      payload: {
        expectedUpdatedAt: updatedAt,
        targetStatus: 'ACTIVE',
        reason: 'Activate competition structure',
      },
    });
    expect(activate.statusCode).toBe(200);
    expect(activate.json().item.status).toBe('ACTIVE');
    expect(activate.json().item.activatedAt).toBeTruthy();

    const matchCountBefore = await prisma.match.count();
    expect(matchCountBefore).toBe(0);

    const audit = await app.inject({
      method: 'GET',
      url: `/api/commissioner/competition-editions/${editionId}/audit`,
      headers: commissionerHeaders,
    });
    expect(audit.statusCode).toBe(200);
    expect(audit.json().total).toBeGreaterThan(0);
  });

  it('rejects commissioner writes without header', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/api/commissioner/competitions/${competitionId}/editions`,
      payload: {
        worldSeasonId,
        displayName: 'No header',
        reason: 'Should fail',
      },
    });
    expect(res.statusCode).toBe(403);
  });

  it('preserves participant name snapshots when team is renamed', async () => {
    const edition = await prisma.competitionEdition.findFirstOrThrow({
      where: { status: 'ACTIVE' },
      include: { participants: { take: 1 } },
    });
    const participant = edition.participants[0]!;
    const snapshot = participant.teamNameSnapshot;
    await prisma.team.update({
      where: { id: participant.teamId },
      data: { name: 'Renamed Club FC' },
    });
    const detail = await app.inject({
      method: 'GET',
      url: `/api/competition-editions/${edition.id}`,
    });
    const found = detail
      .json()
      .item.participants.find((p: { id: string }) => p.id === participant.id);
    expect(found.teamNameSnapshot).toBe(snapshot);
    expect(found.currentTeam.name).toBe('Renamed Club FC');
  });

  it('rejects mismatched edition/stage on match create boundary', async () => {
    const edition = await prisma.competitionEdition.findFirstOrThrow({
      where: { status: 'ACTIVE' },
      include: { stages: true },
    });
    const otherSeason = await prisma.worldSeason.create({
      data: {
        label: 'Extra Season',
        startYear: 2027,
        endYear: 2028,
        phase: 'OFFSEASON',
        status: 'PLANNED',
      },
    });
    const otherEdition = await prisma.competitionEdition.create({
      data: {
        competitionId,
        worldSeasonId: otherSeason.id,
        displayName: 'Other',
        status: 'PREPARING',
        rulesSnapshotText: edition.rulesSnapshotText,
        rulesHash: edition.rulesHash,
      },
    });
    const { createPreparedMatch, MatchHttpError } = await import('../src/services/matches.js');
    // Bypass readiness by mocking would be heavy; stage/edition mismatch throws before readiness if teams not ready.
    // Call validation path directly via createPreparedMatch — expect StageEditionMismatch or TeamNotReady.
    try {
      await createPreparedMatch({
        homeTeamId: teamA,
        awayTeamId: teamB,
        competitionEditionId: otherEdition.id,
        competitionStageId: edition.stages[0]?.id,
      });
      expect.fail('expected mismatch error');
    } catch (err) {
      expect(err).toBeInstanceOf(MatchHttpError);
      expect((err as InstanceType<typeof MatchHttpError>).code).toBe('StageEditionMismatch');
    }
  });
});
