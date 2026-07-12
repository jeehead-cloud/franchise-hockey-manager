import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
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
const headers = { [COMMISSIONER_HEADER]: COMMISSIONER_HEADER_VALUE };

async function autoFillLineup(app: FastifyInstance, teamId: string) {
  const lineup = await app.inject({
    method: 'GET',
    url: `/api/commissioner/teams/${teamId}/lineup`,
    headers,
  });
  const res = await app.inject({
    method: 'POST',
    url: `/api/commissioner/teams/${teamId}/lineup/auto-fill`,
    headers,
    payload: {
      expectedUpdatedAt: lineup.json().item.updatedAt,
      mode: 'REPLACE',
      reason: 'F11 simulation test setup',
    },
  });
  expect(res.statusCode).toBe(200);
  expect(res.json().validation.status).toBe('VALID');
}

describe('F11 simulation debug API', () => {
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
    process.env.FHM_SIMULATION_DEBUG_ENABLED = 'true';
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
    await autoFillLineup(app, frostId);

    vi.spyOn(await import('../src/services/simulation-input.js'), 'buildSimulationInput').mockImplementation(
      async (opts) => {
        const input = buildTestSimulationInput(opts.seed);
        input.matchId = `debug-${opts.homeTeamId}-${opts.awayTeamId}`;
        input.inputFingerprint = `mock-${opts.homeTeamId}-${opts.awayTeamId}-${opts.seed}`;
        return input;
      },
    );
  });

  beforeEach(() => {
    process.env.FHM_SIMULATION_DEBUG_ENABLED = 'true';
  });

  afterAll(async () => {
    if (app) await app.close();
    if (prisma) await prisma.$disconnect();
    if (tempDir) cleanupTempDir(tempDir);
  });

  it('runs regulation debug simulation with summary events', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/simulation/debug/regulation',
      payload: { homeTeamId: frostId, awayTeamId: owlsId, seed: 'f11-api-001', eventDetail: 'SUMMARY' },
    });
    expect(res.statusCode).toBe(200);
    const item = res.json().item;
    expect(item.metadata.engineVersion).toBe('f11.1');
    expect(item.metadata.balanceHash).toBeTruthy();
    expect(item.finalState.score).toEqual({ home: 0, away: 0 });
    expect(item.finalState.simulationStatus).toBe('REGULATION_COMPLETE');
    expect(item.diagnostics.traceHash).toMatch(/^[a-f0-9]+$/);
    expect(item.notice).toContain('0-0');
  });

  it('is deterministic for same seed', async () => {
    const payload = { homeTeamId: frostId, awayTeamId: owlsId, seed: 'f11-api-det', eventDetail: 'NONE' };
    const a = await app.inject({ method: 'POST', url: '/api/simulation/debug/regulation', payload });
    const b = await app.inject({ method: 'POST', url: '/api/simulation/debug/regulation', payload });
    expect(a.json().item.diagnostics.traceHash).toBe(b.json().item.diagnostics.traceHash);
  });

  it('steps next event and resumes regulation', async () => {
    const step = await app.inject({
      method: 'POST',
      url: '/api/simulation/debug/step',
      payload: {
        homeTeamId: frostId,
        awayTeamId: owlsId,
        seed: 'f11-step-001',
        stepMode: 'NEXT_EVENT',
      },
    });
    expect(step.statusCode).toBe(200);
    expect(step.json().item.events.length).toBeGreaterThan(0);
    const resume = await app.inject({
      method: 'POST',
      url: '/api/simulation/debug/resume',
      payload: {
        homeTeamId: frostId,
        awayTeamId: owlsId,
        seed: 'f11-step-001',
        snapshot: step.json().item.snapshot,
      },
    });
    expect(resume.statusCode).toBe(200);
    expect(resume.json().item.completed).toBe(true);
  });

  it('rejects same team and incomplete team', async () => {
    vi.restoreAllMocks();
    const inputMod = await import('../src/services/simulation-input.js');
    vi.spyOn(inputMod, 'buildSimulationInput').mockRestore();

    const same = await app.inject({
      method: 'POST',
      url: '/api/simulation/debug/regulation',
      payload: { homeTeamId: frostId, awayTeamId: frostId, seed: 'x' },
    });
    expect(same.statusCode).toBe(400);
    const cedarId = (await prisma.team.findFirstOrThrow({ where: { externalId: 'team-cedar' } })).id;
    const incomplete = await app.inject({
      method: 'POST',
      url: '/api/simulation/debug/regulation',
      payload: { homeTeamId: frostId, awayTeamId: cedarId, seed: 'x' },
    });
    expect(incomplete.statusCode).toBe(409);
    expect(incomplete.json().error).toBe('TeamNotSimulationReady');

    vi.spyOn(inputMod, 'buildSimulationInput').mockImplementation(async (opts) => {
      const input = buildTestSimulationInput(opts.seed);
      input.matchId = `debug-${opts.homeTeamId}-${opts.awayTeamId}`;
      input.inputFingerprint = `mock-${opts.homeTeamId}-${opts.awayTeamId}-${opts.seed}`;
      return input;
    });
  });

  it('is read-only against database records', async () => {
    const beforeAudits = await prisma.commissionerAuditLog.count();
    const beforeLineupUpdates = await prisma.lineupAssignment.count();
    await app.inject({
      method: 'POST',
      url: '/api/simulation/debug/regulation',
      payload: { homeTeamId: frostId, awayTeamId: owlsId, seed: 'readonly-001', eventDetail: 'NONE' },
    });
    const afterAudits = await prisma.commissionerAuditLog.count();
    const afterLineupUpdates = await prisma.lineupAssignment.count();
    expect(afterAudits).toBe(beforeAudits);
    expect(afterLineupUpdates).toBe(beforeLineupUpdates);
  });

  it('returns 503 when debug gate disabled', async () => {
    process.env.FHM_SIMULATION_DEBUG_ENABLED = 'false';
    process.env.NODE_ENV = 'production';
    const res = await app.inject({
      method: 'POST',
      url: '/api/simulation/debug/regulation',
      payload: { homeTeamId: frostId, awayTeamId: owlsId, seed: 'gate' },
    });
    expect(res.statusCode).toBe(503);
    process.env.NODE_ENV = 'test';
  });
});
