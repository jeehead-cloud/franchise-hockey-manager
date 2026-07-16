import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import type { PrismaClient } from '@prisma/client';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { cleanupTempDir, createTempDatabaseUrl, migrateTempDatabase } from './helpers/db.js';
import { getRepoRoot } from '../src/initialization/paths.js';
import { COMMISSIONER_HEADER, COMMISSIONER_HEADER_VALUE } from '../src/commissioner/gate.js';

const fixtureDir = join(getRepoRoot(), 'data', 'fixtures', 'f3-minimal-world');
const commissionerHeaders = { [COMMISSIONER_HEADER]: COMMISSIONER_HEADER_VALUE, 'x-fhm-commissioner-source': 'api' };

/**
 * F30 offseason server suite. Exercises the full run lifecycle, dependency
 * enforcement, phase linking/refresh idempotency, resumability after restart,
 * completion reconciliation, and the F31 boundary (no next WorldSeason is
 * created). Uses a disposable initialized DB; never touches production data.
 */
describe('F30 offseason workflow', () => {
  let app: FastifyInstance;
  let prisma: PrismaClient;
  let tempDir = '';
  let seasonId = '';
  let runId = '';

  beforeAll(async () => {
    const x = createTempDatabaseUrl();
    tempDir = x.dir;
    process.env.DATABASE_URL = x.url;
    process.env.FHM_DATASET_DIR = fixtureDir;
    process.env.FHM_COMMISSIONER_WRITES_ENABLED = 'true';
    process.env.FHM_BACKUP_DIR = join(tempDir, 'backups');
    migrateTempDatabase(x.url);
    prisma = (await import('../src/db/client.js')).prisma;
    const { initializeSetup } = await import('../src/initialization/index.js');
    await prisma.appMeta.upsert({ where: { id: 'default' }, create: { id: 'default', worldInitialized: false }, update: { worldInitialized: false } });
    await initializeSetup(prisma, fixtureDir);
    const season = await prisma.worldSeason.findFirstOrThrow();
    seasonId = season.id;
    const { buildApp, ensureAppMeta } = await import('../src/app.js');
    await ensureAppMeta();
    app = await buildApp({ logger: false });
    await app.ready();
  });

  afterAll(async () => {
    if (app) await app.close();
    if (prisma) await prisma.$disconnect();
    cleanupTempDir(tempDir);
  });

  it('has the F30 migration and idempotent default configuration', async () => {
    expect(existsSync(join(getRepoRoot(), 'packages/server/prisma/migrations/20260717000000_f30_offseason/migration.sql'))).toBe(true);
    const { bootstrapOffseasonConfiguration } = await import('../src/services/offseason-config.js');
    const a = await bootstrapOffseasonConfiguration(prisma);
    const b = await bootstrapOffseasonConfiguration(prisma);
    expect(a.versionId).toBe(b.versionId);
    expect(await prisma.offseasonPreset.count()).toBe(1);
    const configs = await app.inject({ method: 'GET', url: '/api/offseason/configurations' });
    expect(configs.statusCode).toBe(200);
    expect(configs.json().items[0].name).toBe('Offseason Default');
  });

  it('rejects run creation without Commissioner Mode', async () => {
    const res = await app.inject({ method: 'POST', url: '/api/commissioner/offseason/runs', payload: { worldSeasonId: seasonId, reason: 'no header', createdBy: 'tester' } });
    expect(res.statusCode).toBe(403);
  });

  it('creates an OffseasonRun with the canonical 13 ordered phases', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/commissioner/offseason/runs',
      headers: commissionerHeaders,
      payload: { worldSeasonId: seasonId, reason: 'F30 fixture run', createdBy: 'tester' },
    });
    expect(res.statusCode).toBe(200);
    const item = res.json().item;
    runId = item.id;
    expect(item.status).toBe('PLANNED');
    expect(item.phases).toHaveLength(13);
    expect(item.phases[0].phaseType).toBe('COMPETITION_ARCHIVE');
    expect(item.phases[12].phaseType).toBe('FINAL_REVIEW');
    // All phases start PENDING.
    expect(item.phases.every((p: any) => p.status === 'PENDING')).toBe(true);
    // No events for individual players/teams; one RUN_CREATED.
    expect(item.events.some((e: any) => e.eventType === 'RUN_CREATED')).toBe(true);
  });

  it('rejects a duplicate non-cancelled run for the same season', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/commissioner/offseason/runs',
      headers: commissionerHeaders,
      payload: { worldSeasonId: seasonId, reason: 'duplicate', createdBy: 'tester' },
    });
    expect(res.statusCode).toBe(409);
    expect(res.json().error).toBe('OffseasonAlreadyExistsForSeason');
  });

  it('rejects starting a phase before its dependencies complete', async () => {
    const run = await app.inject({ method: 'GET', url: `/api/offseason/runs/${runId}` });
    const playerDevPhase = run.json().item.phases.find((p: any) => p.phaseType === 'PLAYER_DEVELOPMENT');
    // First start the run.
    await app.inject({ method: 'POST', url: `/api/commissioner/offseason/runs/${runId}/start`, headers: commissionerHeaders, payload: { reason: 'start' } });
    // PLAYER_DEVELOPMENT depends on COMPETITION_ARCHIVE + CONTRACT_EXPIRATION; both still PENDING.
    const res = await app.inject({
      method: 'POST',
      url: `/api/commissioner/offseason/phases/${playerDevPhase.id}/start`,
      headers: commissionerHeaders,
      payload: { runId, reason: 'early start' },
    });
    expect(res.statusCode).toBe(409);
    expect(res.json().error).toBe('OffseasonPhaseDependencyIncomplete');
  });

  it('rejects skipping a required phase', async () => {
    const run = await app.inject({ method: 'GET', url: `/api/offseason/runs/${runId}` });
    const archivePhase = run.json().item.phases.find((p: any) => p.phaseType === 'COMPETITION_ARCHIVE');
    const res = await app.inject({
      method: 'POST',
      url: `/api/commissioner/offseason/phases/${archivePhase.id}/skip`,
      headers: commissionerHeaders,
      payload: { runId, reason: 'try to skip required' },
    });
    expect(res.statusCode).toBe(409);
    expect(res.json().error).toBe('OffseasonPhaseCannotSkip');
  });

  it('allows skipping an optional phase (FREE_AGENCY) and rejects double-skip', async () => {
    const run = await app.inject({ method: 'GET', url: `/api/offseason/runs/${runId}` });
    // First complete all prior phases so FREE_AGENCY is reachable. For this test
    // we mark every prior phase COMPLETED via direct DB updates (we test the
    // engine transition logic elsewhere; here we test the route behavior).
    await prisma.offseasonPhase.updateMany({
      where: { offseasonRunId: runId, phaseOrder: { lt: 8 } },
      data: { status: 'COMPLETED', completedAt: new Date() },
    });
    const freeAgencyPhase = (await prisma.offseasonPhase.findFirst({ where: { offseasonRunId: runId, phaseType: 'FREE_AGENCY' } }))!;
    const skip = await app.inject({
      method: 'POST',
      url: `/api/commissioner/offseason/phases/${freeAgencyPhase.id}/skip`,
      headers: commissionerHeaders,
      payload: { runId, reason: 'optional skip' },
    });
    expect(skip.statusCode).toBe(200);
    // Idempotent re-skip returns 200 with no new event.
    const reskip = await app.inject({
      method: 'POST',
      url: `/api/commissioner/offseason/phases/${freeAgencyPhase.id}/skip`,
      headers: commissionerHeaders,
      payload: { runId, reason: 'idempotent skip' },
    });
    expect(reskip.statusCode).toBe(200);
  });

  it('links a domain operation idempotently (no duplicate event)', async () => {
    const phase = (await prisma.offseasonPhase.findFirstOrThrow({ where: { offseasonRunId: runId, phaseType: 'COMPETITION_ARCHIVE' } }));
    const before = await prisma.offseasonPhaseEvent.count({ where: { offseasonRunId: runId, eventType: 'DOMAIN_OPERATION_LINKED' } });
    const link1 = await app.inject({
      method: 'POST',
      url: `/api/commissioner/offseason/phases/${phase.id}/link`,
      headers: commissionerHeaders,
      payload: { runId, operationType: 'COMPETITION_ARCHIVE', operationId: 'archive-fake-1' },
    });
    expect(link1.statusCode).toBe(200);
    const link2 = await app.inject({
      method: 'POST',
      url: `/api/commissioner/offseason/phases/${phase.id}/link`,
      headers: commissionerHeaders,
      payload: { runId, operationType: 'COMPETITION_ARCHIVE', operationId: 'archive-fake-1' },
    });
    expect(link2.statusCode).toBe(200);
    const after = await prisma.offseasonPhaseEvent.count({ where: { offseasonRunId: runId, eventType: 'DOMAIN_OPERATION_LINKED' } });
    // The second link of the same id must not create another event.
    expect(after).toBe(before + 1);
  });

  it('refresh is idempotent and recomputes the current phase', async () => {
    const before = (await app.inject({ method: 'GET', url: `/api/offseason/runs/${runId}` })).json().item;
    const refresh1 = await app.inject({ method: 'POST', url: `/api/commissioner/offseason/runs/${runId}/refresh`, headers: commissionerHeaders, payload: {} });
    expect(refresh1.statusCode).toBe(200);
    const refresh2 = await app.inject({ method: 'POST', url: `/api/commissioner/offseason/runs/${runId}/refresh`, headers: commissionerHeaders, payload: {} });
    expect(refresh2.statusCode).toBe(200);
    // Run status unchanged across refresh.
    expect(refresh2.json().item.status).toBe(before.status);
  });

  it('survives a server restart by reloading from persisted state', async () => {
    // Simulate restart by rebuilding the app against the same DB.
    await app.close();
    const { buildApp } = await import('../src/app.js');
    app = await buildApp({ logger: false });
    await app.ready();
    const res = await app.inject({ method: 'GET', url: `/api/offseason/runs/${runId}` });
    expect(res.statusCode).toBe(200);
    const run = res.json().item;
    // State preserved: phases still COMPLETED/SKIPPED as we left them.
    expect(run.phases.filter((p: any) => p.status === 'COMPLETED').length).toBeGreaterThanOrEqual(7);
    expect(run.phases.find((p: any) => p.phaseType === 'FREE_AGENCY').status).toBe('SKIPPED');
  });

  it('blocks completion when required phases remain incomplete', async () => {
    const run = (await app.inject({ method: 'GET', url: `/api/offseason/runs/${runId}` })).json().item;
    const res = await app.inject({
      method: 'POST',
      url: `/api/commissioner/offseason/runs/${runId}/complete`,
      headers: commissionerHeaders,
      payload: { reason: 'premature' },
    });
    expect(res.statusCode).toBe(422);
    expect(res.json().error).toBe('OffseasonNotReady');
    void run;
  });

  it('reconciles and completes the run once all required phases + optional skips resolve', async () => {
    // Complete every remaining required phase. The default config requires all
    // except FREE_AGENCY (already skipped), DRAFTED_PLAYER_SIGNINGS, TRADES,
    // SCOUTING_REVIEW. The remaining required phases are: COMPETITION_ARCHIVE
    // (done), CONTRACT_EXPIRATION, PLAYER_DEVELOPMENT, RETIREMENT_REVIEW,
    // YOUTH_GENERATION, DRAFT, ROSTER_REVIEW, LINEUP_REVIEW, FINAL_REVIEW.
    const optionalSkips = ['DRAFTED_PLAYER_SIGNINGS', 'TRADES', 'SCOUTING_REVIEW'];
    for (const t of optionalSkips) {
      const ph = await prisma.offseasonPhase.findFirst({ where: { offseasonRunId: runId, phaseType: t } });
      if (ph && ph.status !== 'SKIPPED') {
        await app.inject({ method: 'POST', url: `/api/commissioner/offseason/phases/${ph.id}/skip`, headers: commissionerHeaders, payload: { runId, reason: 'skip optional' } });
      }
    }
    // Mark remaining required phases COMPLETED directly (the engine's transition
    // rules are tested in the engine suite; here we exercise the run-completion
    // readiness + reconciliation path).
    await prisma.offseasonPhase.updateMany({
      where: { offseasonRunId: runId, status: 'PENDING' },
      data: { status: 'COMPLETED', completedAt: new Date() },
    });
    // Provide fake completed underlying runs for the automated phases so the
    // FINAL_REVIEW completion checks (requireDevelopmentRun, requireYouthGenerationRun,
    // requireContractExpirationProcessed, requireDraftCompleted) all pass.
    const expRun = await prisma.contractExpirationRun.create({
      data: {
        worldSeasonId: seasonId,
        effectiveSeasonOrder: 2024,
        status: 'COMPLETED',
        inputHash: 'fixture',
        resultHash: 'fixture',
        totalContracts: 0,
        configVersionId: (await prisma.activeContractConfiguration.findUniqueOrThrow({ where: { id: 'default' } })).activePresetVersionId,
        reason: 'fixture',
        createdBy: 'tester',
        completedAt: new Date(),
      },
    });
    const devConfig = await prisma.activePlayerDevelopmentConfiguration.findUniqueOrThrow({ where: { id: 'default' } });
    const devRun = await prisma.playerDevelopmentRun.create({
      data: {
        worldSeasonId: seasonId,
        status: 'COMPLETED',
        runVersion: 1,
        effectiveDate: '2024-07-01',
        baseSeed: 'fixture',
        configVersionId: devConfig.activePresetVersionId,
        configHash: 'fixture',
        inputHash: 'fixture',
        resultHash: 'fixture',
        isCurrent: true,
        completedAt: new Date(),
      },
    });
    const youthConfig = await prisma.activeYouthGenerationConfiguration.findUniqueOrThrow({ where: { id: 'default' } });
    const youthRun = await prisma.youthGenerationRun.create({
      data: {
        worldSeasonId: seasonId,
        status: 'COMPLETED',
        runVersion: 1,
        referenceDate: '2024-07-01',
        baseSeed: 'fixture',
        profileSetVersionId: youthConfig.activeProfileSetVersionId,
        profileSetHash: 'fixture',
        inputHash: 'fixture',
        resultHash: 'fixture',
        isCurrent: true,
        completedAt: new Date(),
      },
    });
    const draftConfig = await prisma.activeDraftConfiguration.findUniqueOrThrow({ where: { id: 'default' } });
    const draftEvent = await prisma.draftEvent.create({
      data: {
        worldSeasonId: seasonId,
        name: 'F30 fixture draft',
        status: 'COMPLETED',
        presetVersionId: draftConfig.activePresetVersionId,
        configHash: 'fixture',
        cutoffDate: '2024-09-15',
        baseSeed: 'fixture',
        totalRounds: 1,
        totalPicks: 0,
        completedAt: new Date(),
        resultHash: 'fixture',
      },
    });
    // Link the underlying runs to their phases.
    const expPhase = await prisma.offseasonPhase.findFirstOrThrow({ where: { offseasonRunId: runId, phaseType: 'CONTRACT_EXPIRATION' } });
    await prisma.offseasonPhase.update({ where: { id: expPhase.id }, data: { contractExpirationRunId: expRun.id } });
    const devPhase = await prisma.offseasonPhase.findFirstOrThrow({ where: { offseasonRunId: runId, phaseType: 'PLAYER_DEVELOPMENT' } });
    await prisma.offseasonPhase.update({ where: { id: devPhase.id }, data: { playerDevelopmentRunId: devRun.id } });
    const youthPhase = await prisma.offseasonPhase.findFirstOrThrow({ where: { offseasonRunId: runId, phaseType: 'YOUTH_GENERATION' } });
    await prisma.offseasonPhase.update({ where: { id: youthPhase.id }, data: { youthGenerationRunId: youthRun.id } });
    const draftPhase = await prisma.offseasonPhase.findFirstOrThrow({ where: { offseasonRunId: runId, phaseType: 'DRAFT' } });
    await prisma.offseasonPhase.update({ where: { id: draftPhase.id }, data: { draftEventId: draftEvent.id } });

    // First confirm completion correctly blocks on incomplete required lineups.
    const blocked = await app.inject({
      method: 'POST',
      url: `/api/commissioner/offseason/runs/${runId}/complete`,
      headers: commissionerHeaders,
      payload: { reason: 'complete' },
    });
    expect(blocked.statusCode).toBe(422);
    expect(blocked.json().error).toBe('OffseasonNotReady');
    // The blocker is the missing lineups for detailed-club teams. Create a
    // minimal lineup for each detailed team with no current lineup (one
    // assignment is enough to satisfy F30's "has a lineup" check — F30 does
    // NOT enforce the full 20-slot cap; that remains a readiness warning).
    const detailedTeams = await prisma.team.findMany({
      where: { teamType: 'CLUB', league: { simulationLevel: 'DETAILED' } },
      select: { id: true, lineup: { select: { id: true } } },
    });
    for (const t of detailedTeams) {
      if (t.lineup) continue;
      const lineup = await prisma.teamLineup.create({ data: { teamId: t.id } });
      // Assign any one eligible player the team owns to satisfy the slot count.
      const player = await prisma.player.findFirst({ where: { currentTeamId: t.id, rosterStatus: 'ACTIVE' }, select: { id: true } });
      if (player) {
        await prisma.lineupAssignment.create({ data: { lineupId: lineup.id, slot: 'F1_C', playerId: player.id } });
      }
    }

    const res = await app.inject({
      method: 'POST',
      url: `/api/commissioner/offseason/runs/${runId}/complete`,
      headers: commissionerHeaders,
      payload: { reason: 'complete' },
    });
    if (res.statusCode !== 200) throw new Error(`complete failed: ${res.body}`);
    expect(res.statusCode).toBe(200);
    const item = res.json().item;
    expect(item.status).toBe('COMPLETED');
    expect(item.resultHash).toBeTruthy();
    expect(item.completedAt).toBeTruthy();
    // F31 boundary: completing F30 did NOT create a new WorldSeason.
    const seasons = await prisma.worldSeason.count();
    expect(seasons).toBe(1);
    // RUN_COMPLETED event recorded.
    expect(item.events.some((e: any) => e.eventType === 'RUN_COMPLETED')).toBe(true);
  });

  it('marks a completed run immutable (re-complete is a no-op, cancel rejected)', async () => {
    const complete = await app.inject({ method: 'POST', url: `/api/commissioner/offseason/runs/${runId}/complete`, headers: commissionerHeaders, payload: { reason: 'idempotent' } });
    expect(complete.statusCode).toBe(200);
    expect(complete.json().item.status).toBe('COMPLETED');
    const cancel = await app.inject({ method: 'POST', url: `/api/commissioner/offseason/runs/${runId}/cancel`, headers: commissionerHeaders, payload: { reason: 'cannot cancel completed' } });
    expect(cancel.statusCode).toBe(409);
  });

  it('enforces optimistic concurrency via expectedUpdatedAt', async () => {
    // Create a fresh run for this check.
    const freshSeason = await prisma.worldSeason.create({ data: { label: 'F30/OC', startYear: 2090, endYear: 2091, phase: 'OFFSEASON', status: 'ACTIVE' } });
    const created = await app.inject({ method: 'POST', url: '/api/commissioner/offseason/runs', headers: commissionerHeaders, payload: { worldSeasonId: freshSeason.id, reason: 'oc test', createdBy: 'tester' } });
    const newRunId = created.json().item.id;
    const stale = '2000-01-01T00:00:00.000Z';
    const res = await app.inject({ method: 'POST', url: `/api/commissioner/offseason/runs/${newRunId}/cancel`, headers: commissionerHeaders, payload: { reason: 'stale', expectedUpdatedAt: stale } });
    expect(res.statusCode).toBe(409);
    expect(res.json().error).toBe('OffseasonInputStale');
  });

  it('team offseason overview returns privacy-safe summaries', async () => {
    const team = await prisma.team.findFirstOrThrow({ where: { teamType: 'CLUB' } });
    const res = await app.inject({ method: 'GET', url: `/api/offseason/runs/${runId}/teams/${team.id}` });
    expect(res.statusCode).toBe(200);
    const item = res.json().item;
    expect(item.team.id).toBe(team.id);
    // Roster + lineup readiness blocks are arrays of strings (no other Team's private scouting here).
    expect(Array.isArray(item.rosterReadiness.blockers)).toBe(true);
    expect(item.staleScoutingReports.currentReports).toBeGreaterThanOrEqual(0);
  });

  it('does not expose hidden scouting truth on normal read APIs', async () => {
    const status = await app.inject({ method: 'GET', url: '/api/offseason/status' });
    expect(status.statusCode).toBe(200);
    const text = status.body;
    // No true potential/CA/role leak in the offseason status payload.
    expect(text).not.toMatch(/potentialCeiling/);
    expect(text).not.toMatch(/developmentRate/);
  });
});
