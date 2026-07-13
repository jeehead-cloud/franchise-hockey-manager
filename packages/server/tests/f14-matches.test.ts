import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import type { PrismaClient } from '@prisma/client';
import { buildTestSimulationInput } from '@fhm/engine';
import { join } from 'node:path';
import {
  cleanupTempDir,
  createTempDatabaseUrl,
  migrateTempDatabase,
} from './helpers/db.js';
import { getRepoRoot } from '../src/initialization/paths.js';
import { COMMISSIONER_HEADER, COMMISSIONER_HEADER_VALUE } from '../src/commissioner/gate.js';

const fixtureDir = join(getRepoRoot(), 'data', 'fixtures', 'f3-minimal-world');
const commissionerHeaders = { [COMMISSIONER_HEADER]: COMMISSIONER_HEADER_VALUE };

describe('F14 playable match API', () => {
  let app: FastifyInstance;
  let prisma: PrismaClient;
  let tempDir: string;
  let frostId = '';
  let owlsId = '';
  let matchId = '';
  let resultId = '';

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
    owlsId = (await prisma.team.findFirstOrThrow({ where: { externalId: 'team-owls' } })).id;
    const { buildApp, ensureAppMeta } = await import('../src/app.js');
    await ensureAppMeta();
    app = await buildApp({ logger: false });
    await app.ready();

    const simulationInputMod = await import('../src/services/simulation-input.js');
    vi.spyOn(simulationInputMod, 'assertTeamSimulationReady').mockResolvedValue(undefined);
    vi.spyOn(simulationInputMod, 'buildSimulationInput').mockImplementation(async (opts) => {
      const input = buildTestSimulationInput(opts.seed, { mode: 'F14' });
      input.matchId = opts.matchId ?? `match-${opts.homeTeamId}-${opts.awayTeamId}`;
      input.homeTeam.teamId = opts.homeTeamId;
      input.awayTeam.teamId = opts.awayTeamId;
      input.inputFingerprint = `mock-${opts.homeTeamId}-${opts.awayTeamId}-${opts.seed}`;
      return input;
    });
  });

  afterAll(async () => {
    vi.restoreAllMocks();
    if (app) await app.close();
    if (prisma) await prisma.$disconnect();
    if (tempDir) cleanupTempDir(tempDir);
  });

  it('creates a prepared match', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/matches',
      payload: { homeTeamId: frostId, awayTeamId: owlsId },
    });
    expect(res.statusCode).toBe(201);
    const item = res.json().item;
    expect(item.status).toBe('PREPARED');
    expect(item.homeTeamId).toBe(frostId);
    expect(item.awayTeamId).toBe(owlsId);
    matchId = item.id;
  });

  it('simulates and persists match result with events and stats', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/api/matches/${matchId}/simulate`,
      payload: { seed: 'f14-match-001' },
    });
    expect(res.statusCode).toBe(200);
    const item = res.json().item;
    expect(item.matchId).toBe(matchId);
    expect(item.resultId).toBeTruthy();
    expect(item.reconciliationOk).toBe(true);
    resultId = item.resultId;

    const events = await prisma.matchEvent.count({ where: { matchResultId: resultId } });
    const playerStats = await prisma.playerGameStat.count({ where: { matchResultId: resultId } });
    const teamStats = await prisma.teamGameStat.count({ where: { matchResultId: resultId } });
    expect(events).toBeGreaterThan(0);
    expect(playerStats).toBeGreaterThan(0);
    expect(teamStats).toBe(2);
  });

  it('returns 409 on duplicate simulate', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/api/matches/${matchId}/simulate`,
      payload: { seed: 'f14-match-dup' },
    });
    expect(res.statusCode).toBe(409);
    expect(res.json().error).toBe('MatchAlreadyCompleted');
  });

  it('lists and returns match detail/result/events', async () => {
    const list = await app.inject({ method: 'GET', url: '/api/matches' });
    expect(list.statusCode).toBe(200);
    expect(list.json().items.some((m: { id: string }) => m.id === matchId)).toBe(true);

    const detail = await app.inject({ method: 'GET', url: `/api/matches/${matchId}` });
    expect(detail.statusCode).toBe(200);
    expect(detail.json().item.status).toBe('COMPLETED');
    expect(detail.json().item.currentResultId).toBe(resultId);

    const result = await app.inject({ method: 'GET', url: `/api/matches/${matchId}/result` });
    expect(result.statusCode).toBe(200);
    expect(result.json().item.resultId).toBe(resultId);
    expect(result.json().item.playerStats.length).toBeGreaterThan(0);
    expect(result.json().item.teamStats).toHaveLength(2);

    const events = await app.inject({ method: 'GET', url: `/api/matches/${matchId}/events?pageSize=50` });
    expect(events.statusCode).toBe(200);
    expect(events.json().items.length).toBeGreaterThan(0);
    expect(events.json().total).toBeGreaterThan(0);
  });

  it('resimulates with commissioner header and supersedes prior result', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/api/commissioner/matches/${matchId}/resimulate`,
      headers: commissionerHeaders,
      payload: {
        expectedCurrentResultId: resultId,
        seed: 'f14-resim-001',
        reason: 'F14 commissioner resimulation test',
        inputMode: 'ORIGINAL',
      },
    });
    expect(res.statusCode).toBe(200);
    const item = res.json().item;
    expect(item.previousResultId).toBe(resultId);
    expect(item.resultId).not.toBe(resultId);

    const attempts = await app.inject({
      method: 'GET',
      url: `/api/commissioner/matches/${matchId}/attempts`,
      headers: commissionerHeaders,
    });
    expect(attempts.statusCode).toBe(200);
    expect(attempts.json().items.length).toBeGreaterThanOrEqual(2);

    const superseded = await prisma.matchResult.findUnique({ where: { id: resultId } });
    expect(superseded?.status).toBe('SUPERSEDED');
    resultId = item.resultId;
  });

  it('does not mutate lineups during simulation', async () => {
    const create = await app.inject({
      method: 'POST',
      url: '/api/matches',
      payload: { homeTeamId: frostId, awayTeamId: owlsId },
    });
    expect(create.statusCode).toBe(201);
    const readonlyMatchId = create.json().item.id;
    const beforeAssignments = await prisma.lineupAssignment.count();
    const beforeAudits = await prisma.commissionerAuditLog.count();

    await app.inject({
      method: 'POST',
      url: `/api/matches/${readonlyMatchId}/simulate`,
      payload: { seed: 'f14-readonly-001' },
    });

    const afterAssignments = await prisma.lineupAssignment.count();
    const afterAudits = await prisma.commissionerAuditLog.count();
    expect(afterAssignments).toBe(beforeAssignments);
    expect(afterAudits).toBe(beforeAudits);
  });
});
