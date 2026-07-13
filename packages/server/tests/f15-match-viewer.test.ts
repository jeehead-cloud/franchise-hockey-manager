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

describe('F15 match viewer APIs', () => {
  let app: FastifyInstance;
  let prisma: PrismaClient;
  let tempDir: string;
  let frostId = '';
  let owlsId = '';
  let matchId = '';
  let resultId = '';
  let supersededResultId = '';

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
      input.homeTeam.teamName = 'Snapshot Home FC';
      input.awayTeam.teamName = 'Snapshot Away FC';
      input.inputFingerprint = `mock-${opts.homeTeamId}-${opts.awayTeamId}-${opts.seed}`;
      return input;
    });

    const created = await app.inject({
      method: 'POST',
      url: '/api/matches',
      payload: { homeTeamId: frostId, awayTeamId: owlsId },
    });
    matchId = created.json().item.id;
    const simulated = await app.inject({
      method: 'POST',
      url: `/api/matches/${matchId}/simulate`,
      payload: { seed: 'f15-match-001' },
    });
    resultId = simulated.json().item.resultId;
  });

  afterAll(async () => {
    vi.restoreAllMocks();
    if (app) await app.close();
    if (prisma) await prisma.$disconnect();
    if (tempDir) cleanupTempDir(tempDir);
  });

  it('returns overview with period scores and snapshot team names', async () => {
    await prisma.team.update({ where: { id: frostId }, data: { name: 'Renamed Frost After Match' } });

    const res = await app.inject({ method: 'GET', url: `/api/matches/${matchId}/overview` });
    expect(res.statusCode).toBe(200);
    const item = res.json().item;
    expect(item.prepared).toBe(false);
    expect(item.isCurrent).toBe(true);
    expect(item.homeTeam.name).toBe('Snapshot Home FC');
    expect(item.homeTeam.currentName).toBe('Renamed Frost After Match');
    expect(item.result.resultId).toBe(resultId);
    expect(Array.isArray(item.result.periodScores)).toBe(true);
    expect(Array.isArray(item.result.scoringSummary)).toBe(true);
    expect(item.result.skaters.length).toBeGreaterThan(0);
    expect(item.result.goalies.length).toBeGreaterThan(0);
    expect(item.result.lineUsage).toBeTruthy();
    expect(item.result.metadata.traceHash).toBeTruthy();
  });

  it('paginates public event feed with category filter and summaries', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/api/matches/${matchId}/events?format=view&category=goals&pageSize=20`,
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.resultId).toBe(resultId);
    for (const item of body.items) {
      expect(item.eventType).toBe('GOAL');
      expect(item.summary).toContain('Goal');
      expect(item.visibility).toBe('PUBLIC');
      expect(item.technical).toBeUndefined();
    }
  });

  it('requires commissioner header for diagnostics and excludes hidden potential', async () => {
    const denied = await app.inject({ method: 'GET', url: `/api/commissioner/matches/${matchId}/diagnostics` });
    expect(denied.statusCode).toBe(403);

    const res = await app.inject({
      method: 'GET',
      url: `/api/commissioner/matches/${matchId}/diagnostics`,
      headers: commissionerHeaders,
    });
    expect(res.statusCode).toBe(200);
    const item = res.json().item;
    expect(item.identity.traceHash).toBeTruthy();
    expect(item.reconciliation.overallOk).toBe(true);
    expect(item.eventCounts.total).toBeGreaterThan(0);
    expect(item.inputSummary).toBeTruthy();
    const json = JSON.stringify(item.inputSummary);
    expect(json).not.toMatch(/potentialFloor|potentialCeiling|hiddenPotential|truePotential/i);
  });

  it('loads superseded attempt distinctly after resimulation', async () => {
    const resim = await app.inject({
      method: 'POST',
      url: `/api/commissioner/matches/${matchId}/resimulate`,
      headers: commissionerHeaders,
      payload: {
        expectedCurrentResultId: resultId,
        seed: 'f15-resim-001',
        reason: 'F15 attempt history test',
        inputMode: 'ORIGINAL',
      },
    });
    expect(resim.statusCode).toBe(200);
    supersededResultId = resultId;
    resultId = resim.json().item.resultId;

    const attempts = await app.inject({
      method: 'GET',
      url: `/api/commissioner/matches/${matchId}/attempts`,
      headers: commissionerHeaders,
    });
    expect(attempts.statusCode).toBe(200);
    expect(attempts.json().total).toBeGreaterThanOrEqual(2);

    const oldOverview = await app.inject({
      method: 'GET',
      url: `/api/commissioner/matches/${matchId}/results/${supersededResultId}`,
      headers: commissionerHeaders,
    });
    expect(oldOverview.statusCode).toBe(200);
    expect(oldOverview.json().item.isCurrent).toBe(false);
    expect(oldOverview.json().item.result.status).toBe('SUPERSEDED');

    const current = await app.inject({ method: 'GET', url: `/api/matches/${matchId}/overview` });
    expect(current.json().item.isCurrent).toBe(true);
    expect(current.json().item.result.resultId).toBe(resultId);
  });

  it('exports public result and player stats without hidden potential', async () => {
    const jsonExport = await app.inject({ method: 'GET', url: `/api/matches/${matchId}/result/export` });
    expect(jsonExport.statusCode).toBe(200);
    expect(jsonExport.json().format).toBe('fhm-match-result-export');
    expect(JSON.stringify(jsonExport.json())).not.toMatch(/hiddenPotential|potentialFloor/i);

    const playersCsv = await app.inject({ method: 'GET', url: `/api/matches/${matchId}/player-stats/export` });
    expect(playersCsv.statusCode).toBe(200);
    expect(playersCsv.headers['content-type']).toContain('text/csv');
    expect(playersCsv.body.split('\n')[0]).toContain('playerId');
  });

  it('returns prepared overview for unsimulated match', async () => {
    const created = await app.inject({
      method: 'POST',
      url: '/api/matches',
      payload: { homeTeamId: frostId, awayTeamId: owlsId },
    });
    const preparedId = created.json().item.id;
    const overview = await app.inject({ method: 'GET', url: `/api/matches/${preparedId}/overview` });
    expect(overview.statusCode).toBe(200);
    expect(overview.json().item.prepared).toBe(true);
    expect(overview.json().item.result).toBeNull();
  });
});
