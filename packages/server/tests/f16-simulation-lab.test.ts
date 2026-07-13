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

const fixtureDir = join(getRepoRoot(), 'data', 'fixtures', 'f3-minimal-world');

async function resetLabRuns() {
  const { resetLabRunsForTests } = await import('../src/services/simulation-lab-runs.js');
  resetLabRunsForTests();
}

async function pollLabRun(
  app: FastifyInstance,
  runId: string,
  opts?: { timeoutMs?: number; terminal?: string[] },
) {
  const timeoutMs = opts?.timeoutMs ?? 60_000;
  const terminal = new Set(opts?.terminal ?? ['COMPLETED', 'FAILED', 'CANCELLED']);
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const res = await app.inject({ method: 'GET', url: `/api/simulation-lab/runs/${runId}` });
    expect(res.statusCode).toBe(200);
    const item = res.json().item;
    if (terminal.has(item.status)) return item;
    await new Promise((r) => setTimeout(r, 25));
  }
  throw new Error(`Timed out waiting for lab run ${runId}`);
}

describe('F16 Simulation Lab APIs', () => {
  let app: FastifyInstance;
  let prisma: PrismaClient;
  let tempDir: string;
  let frostId = '';
  let owlsId = '';

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
      input.matchId = opts.matchId ?? `lab-${opts.homeTeamId}-${opts.awayTeamId}`;
      input.homeTeam.teamId = opts.homeTeamId;
      input.awayTeam.teamId = opts.awayTeamId;
      input.inputFingerprint = `mock-${opts.homeTeamId}-${opts.awayTeamId}-${opts.seed}`;
      if (opts.balanceConfig) {
        input.balance.snapshot = opts.balanceConfig;
      }
      if (opts.balanceVersionId) {
        input.balance.versionId = opts.balanceVersionId;
      }
      return input;
    });
  });

  afterAll(async () => {
    vi.restoreAllMocks();
    await resetLabRuns();
    if (app) await app.close();
    if (prisma) await prisma.$disconnect();
    if (tempDir) cleanupTempDir(tempDir);
  });

  it('returns lab options with supported counts and limits', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/simulation-lab/options' });
    expect(res.statusCode).toBe(200);
    const item = res.json().item;
    expect(item.enabled).toBe(true);
    expect(item.supportedCounts).toEqual([1, 10, 100, 1000]);
    expect(item.sideModes).toEqual(['FIXED', 'ALTERNATE']);
    expect(item.limits.maxCount).toBe(1000);
    expect(item.limits.maxConcurrent).toBe(2);
    expect(item.limits.chunkSize).toBe(25);
    expect(item.activeBalance.versionId).toBeTruthy();
    expect(Array.isArray(item.balanceVersions)).toBe(true);
    expect(item.balanceVersions.length).toBeGreaterThan(0);
    expect(Array.isArray(item.teams)).toBe(true);
  });

  it('creates a 10-game run, completes, and returns batchHash', async () => {
    await resetLabRuns();
    const created = await app.inject({
      method: 'POST',
      url: '/api/simulation-lab/runs',
      payload: {
        teamAId: frostId,
        teamBId: owlsId,
        simulationCount: 10,
        baseSeed: 'f16-lab-10',
        sideMode: 'ALTERNATE',
        includeGameSummaries: true,
      },
    });
    expect(created.statusCode).toBe(201);
    expect(created.json().item.status).toBe('QUEUED');
    const runId = created.json().item.runId as string;

    const item = await pollLabRun(app, runId);
    expect(item.status).toBe('COMPLETED');
    expect(item.result.batchHash).toMatch(/^[a-f0-9]{64}$/);
    expect(item.result.aggregate.outcomes.games).toBe(10);
    expect(item.result.metadata.simulationCount).toBe(10);
    expect(item.result.gameSummaries).toHaveLength(10);
  });

  it('is deterministic for identical runs', async () => {
    await resetLabRuns();
    const payload = {
      teamAId: frostId,
      teamBId: owlsId,
      simulationCount: 10,
      baseSeed: 'f16-lab-det',
      sideMode: 'FIXED',
      includeGameSummaries: true,
    };
    const a = await app.inject({ method: 'POST', url: '/api/simulation-lab/runs', payload });
    const b = await app.inject({ method: 'POST', url: '/api/simulation-lab/runs', payload });
    expect(a.statusCode).toBe(201);
    expect(b.statusCode).toBe(201);
    const runA = await pollLabRun(app, a.json().item.runId);
    const runB = await pollLabRun(app, b.json().item.runId);
    expect(runA.status).toBe('COMPLETED');
    expect(runB.status).toBe('COMPLETED');
    expect(runA.result.batchHash).toBe(runB.result.batchHash);
  });

  it('does not persist match entities or commissioner audit rows', async () => {
    await resetLabRuns();
    const before = {
      match: await prisma.match.count(),
      matchResult: await prisma.matchResult.count(),
      matchEvent: await prisma.matchEvent.count(),
      playerGameStat: await prisma.playerGameStat.count(),
      teamGameStat: await prisma.teamGameStat.count(),
      audit: await prisma.commissionerAuditLog.count(),
      balanceVersion: await prisma.balancePresetVersion.count(),
    };

    const created = await app.inject({
      method: 'POST',
      url: '/api/simulation-lab/runs',
      payload: {
        teamAId: frostId,
        teamBId: owlsId,
        simulationCount: 10,
        baseSeed: 'f16-lab-nopersist',
        sideMode: 'ALTERNATE',
      },
    });
    expect(created.statusCode).toBe(201);
    const item = await pollLabRun(app, created.json().item.runId);
    expect(item.status).toBe('COMPLETED');

    expect(await prisma.match.count()).toBe(before.match);
    expect(await prisma.matchResult.count()).toBe(before.matchResult);
    expect(await prisma.matchEvent.count()).toBe(before.matchEvent);
    expect(await prisma.playerGameStat.count()).toBe(before.playerGameStat);
    expect(await prisma.teamGameStat.count()).toBe(before.teamGameStat);
    expect(await prisma.commissionerAuditLog.count()).toBe(before.audit);
    expect(await prisma.balancePresetVersion.count()).toBe(before.balanceVersion);
  });

  it('rejects same-team lab runs', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/simulation-lab/runs',
      payload: {
        teamAId: frostId,
        teamBId: frostId,
        simulationCount: 10,
        baseSeed: 'f16-same',
        sideMode: 'FIXED',
      },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toBe('InvalidSimulationLabRequest');
  });

  it('can cancel a mid-run batch', async () => {
    await resetLabRuns();
    const created = await app.inject({
      method: 'POST',
      url: '/api/simulation-lab/runs',
      payload: {
        teamAId: frostId,
        teamBId: owlsId,
        simulationCount: 100,
        baseSeed: 'f16-lab-cancel',
        sideMode: 'ALTERNATE',
        includeGameSummaries: false,
      },
    });
    expect(created.statusCode).toBe(201);
    const runId = created.json().item.runId as string;

    let sawRunning = false;
    const started = Date.now();
    while (Date.now() - started < 15_000) {
      const statusRes = await app.inject({ method: 'GET', url: `/api/simulation-lab/runs/${runId}` });
      const item = statusRes.json().item;
      if (item.status === 'RUNNING' && item.progress.completed > 0) {
        sawRunning = true;
        break;
      }
      if (item.status === 'COMPLETED' || item.status === 'FAILED' || item.status === 'CANCELLED') {
        break;
      }
      await new Promise((r) => setTimeout(r, 10));
    }

    const cancel = await app.inject({ method: 'DELETE', url: `/api/simulation-lab/runs/${runId}` });
    expect(cancel.statusCode).toBe(200);

    const final = await pollLabRun(app, runId, { terminal: ['CANCELLED', 'COMPLETED', 'FAILED'] });
    if (sawRunning && final.status === 'CANCELLED') {
      expect(final.isPartial).toBe(true);
    } else {
      expect(['CANCELLED', 'COMPLETED']).toContain(final.status);
    }
  });

  it('exports completed run as json', async () => {
    await resetLabRuns();
    const created = await app.inject({
      method: 'POST',
      url: '/api/simulation-lab/runs',
      payload: {
        teamAId: frostId,
        teamBId: owlsId,
        simulationCount: 1,
        baseSeed: 'f16-lab-export',
        sideMode: 'FIXED',
        includeGameSummaries: true,
      },
    });
    const runId = created.json().item.runId as string;
    const item = await pollLabRun(app, runId);
    expect(item.status).toBe('COMPLETED');

    const exported = await app.inject({
      method: 'GET',
      url: `/api/simulation-lab/runs/${runId}/export?format=json`,
    });
    expect(exported.statusCode).toBe(200);
    const body = JSON.parse(exported.body);
    expect(body.result.batchHash).toBe(item.result.batchHash);
  });
});
