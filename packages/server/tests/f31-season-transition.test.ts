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
 * F31 season-transition server suite. Exercises the full preview/prepare/
 * execute lifecycle, readiness gating on a completed F30 OffseasonRun, atomic
 * publication of the next WorldSeason + CompetitionEditions, current-season
 * uniqueness, idempotent re-execute, second-transition rejection, stale-input
 * rejection, Player/scouting/contract/archive invariance, and the F32/F33
 * boundary (no schedules, no Matches, no development/youth/draft replay).
 * Uses a disposable initialized DB; never touches production data.
 */
describe('F31 season transition', () => {
  let app: FastifyInstance;
  let prisma: PrismaClient;
  let tempDir = '';
  let sourceSeasonId = '';
  let competitionId = '';
  let runId = '';
  let playerCountBefore = 0;
  let activeContractCountBefore = 0;
  let archiveCountBefore = 0;
  let offseasonConfigVersionId = '';
  let transitionConfigVersionId = '';

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
    sourceSeasonId = season.id;

    // Bootstrap the F30 + F31 default configurations.
    const { bootstrapOffseasonConfiguration } = await import('../src/services/offseason-config.js');
    const off = await bootstrapOffseasonConfiguration(prisma);
    offseasonConfigVersionId = off.versionId;
    const { bootstrapSeasonTransitionConfiguration } = await import('../src/services/season-transition-config.js');
    const trans = await bootstrapSeasonTransitionConfiguration(prisma);
    transitionConfigVersionId = trans.versionId;

    // Pick the first competition with a source edition so carry-forward has
    // something to plan against.
    const edition = await prisma.competitionEdition.findFirst({ where: { worldSeasonId: sourceSeasonId }, include: { competition: true } });
    if (edition) competitionId = edition.competitionId;

    playerCountBefore = await prisma.player.count();
    activeContractCountBefore = await prisma.playerContract.count({ where: { status: 'ACTIVE' } });
    archiveCountBefore = await prisma.competitionArchive.count();

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

  it('has the F31 migration and idempotent default configuration', async () => {
    expect(existsSync(join(getRepoRoot(), 'packages/server/prisma/migrations/20260718000000_f31_season_transition/migration.sql'))).toBe(true);
    const { bootstrapSeasonTransitionConfiguration } = await import('../src/services/season-transition-config.js');
    const a = await bootstrapSeasonTransitionConfiguration(prisma);
    const b = await bootstrapSeasonTransitionConfiguration(prisma);
    expect(a.versionId).toBe(b.versionId);
    expect(await prisma.seasonTransitionPreset.count()).toBe(1);
    const configs = await app.inject({ method: 'GET', url: '/api/season-transitions/configurations' });
    expect(configs.statusCode).toBe(200);
    expect(configs.json().items[0].name).toBe('Season Transition Default');
  });

  it('exposes world-seasons/current and per-season readiness', async () => {
    const cur = await app.inject({ method: 'GET', url: '/api/world-seasons/current' });
    expect(cur.statusCode).toBe(200);
    expect(cur.json().item.id).toBe(sourceSeasonId);
    const readiness = await app.inject({ method: 'GET', url: `/api/world-seasons/${sourceSeasonId}/readiness` });
    expect(readiness.statusCode).toBe(200);
    // Without a completed OffseasonRun, transition is not eligible.
    expect(readiness.json().item.transitionEligible).toBe(false);
  });

  it('rejects prepare without a completed OffseasonRun (NOT_READY)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/commissioner/season-transitions/prepare',
      headers: commissionerHeaders,
      payload: { sourceWorldSeasonId: sourceSeasonId, reason: 'no offseason', createdBy: 'tester' },
    });
    expect(res.statusCode).toBe(422);
    // The engine wraps the readiness blocker list under SeasonTransitionNotReady;
    // details include the OffseasonRunNotCompleted blocker code.
    expect(res.json().error).toBe('SeasonTransitionNotReady');
    expect(JSON.stringify(res.json().details)).toContain('OffseasonRunNotCompleted');
  });

  it('rejects prepare without Commissioner Mode', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/commissioner/season-transitions/prepare',
      payload: { sourceWorldSeasonId: sourceSeasonId, reason: 'no header', createdBy: 'tester' },
    });
    expect(res.statusCode).toBe(403);
  });

  it('preview is write-free and deterministic before the offseason completes', async () => {
    const a = await app.inject({ method: 'GET', url: `/api/season-transitions/preview?sourceWorldSeasonId=${sourceSeasonId}` });
    const b = await app.inject({ method: 'GET', url: `/api/season-transitions/preview?sourceWorldSeasonId=${sourceSeasonId}` });
    expect(a.statusCode).toBe(200);
    expect(a.json().item.previewOnly).toBe(true);
    expect(a.json().item.inputHash).toBe(b.json().item.inputHash);
    // No WorldSeason row was created.
    expect(await prisma.worldSeason.count()).toBe(1);
  });

  // Create a COMPLETED OffseasonRun to satisfy the F31 prerequisite. This is
  // the F31 boundary: F31 does not run the offseason; it only requires that
  // one already completed for the source season.
  it('creates a COMPLETED OffseasonRun to satisfy the F31 prerequisite', async () => {
    await prisma.offseasonRun.create({
      data: {
        worldSeasonId: sourceSeasonId,
        status: 'COMPLETED',
        configVersionId: offseasonConfigVersionId,
        configHash: 'test-hash',
        runVersion: 1,
        startedAt: new Date(),
        completedAt: new Date(),
        reason: 'F31 fixture: simulate completed offseason',
        createdBy: 'tester',
        resultHash: 'fixture-result-hash',
      },
    });
    const readiness = await app.inject({ method: 'GET', url: `/api/world-seasons/${sourceSeasonId}/readiness` });
    expect(readiness.json().item.transitionEligible).toBe(true);
  });

  it('preview now produces READY/WARNING with a deterministic target order', async () => {
    const a = await app.inject({ method: 'GET', url: `/api/season-transitions/preview?sourceWorldSeasonId=${sourceSeasonId}` });
    expect(a.statusCode).toBe(200);
    const readiness = a.json().item.readiness;
    expect(['READY', 'WARNING']).toContain(readiness.status);
    expect(readiness.proposedTargetSeason.order).toBeGreaterThan(0);
    expect(a.json().item.inputHash).toBeTruthy();
  });

  it('prepares a transition run (no target season created)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/commissioner/season-transitions/prepare',
      headers: commissionerHeaders,
      payload: { sourceWorldSeasonId: sourceSeasonId, reason: 'F31 fixture prepare', createdBy: 'tester' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().item.status).toBe('PREPARED');
    runId = res.json().item.id;
    // No target WorldSeason created during prepare.
    expect(await prisma.worldSeason.count()).toBe(1);
  });

  it('idempotent prepare with identical input returns the same run', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/commissioner/season-transitions/prepare',
      headers: commissionerHeaders,
      payload: { sourceWorldSeasonId: sourceSeasonId, reason: 'F31 fixture prepare again', createdBy: 'tester' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().item.id).toBe(runId);
  });

  it('rejects a second prepare with conflicting input (different override)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/commissioner/season-transitions/prepare',
      headers: commissionerHeaders,
      payload: { sourceWorldSeasonId: sourceSeasonId, targetDisplayNameOverride: 'Conflicting Name', reason: 'conflict', createdBy: 'tester' },
    });
    expect(res.statusCode).toBe(409);
    expect(res.json().error).toBe('SeasonTransitionAlreadyExists');
  });

  it('rejects stale-input execute after the source season changes', async () => {
    // Touch the source season to change its updatedAt.
    await prisma.worldSeason.update({ where: { id: sourceSeasonId }, data: { phase: 'OFFSEASON' } });
    const res = await app.inject({
      method: 'POST',
      url: `/api/commissioner/season-transitions/${runId}/execute`,
      headers: commissionerHeaders,
      payload: { reason: 'stale execute' },
    });
    expect(res.statusCode).toBe(409);
    expect(res.json().error).toBe('SeasonTransitionInputStale');
    // Restore the phase so subsequent previews are stable.
    await prisma.worldSeason.update({ where: { id: sourceSeasonId }, data: { phase: 'COMPLETE' } });
  });

  it('re-prepares after the stale-input rejection', async () => {
    // The stale PREPARED run must be discarded before re-preparing (one active
    // transition per source season).
    await app.inject({
      method: 'DELETE',
      url: `/api/commissioner/season-transitions/${runId}`,
      headers: commissionerHeaders,
      payload: { reason: 'discard stale prepared run' },
    });
    const res = await app.inject({
      method: 'POST',
      url: '/api/commissioner/season-transitions/prepare',
      headers: commissionerHeaders,
      payload: { sourceWorldSeasonId: sourceSeasonId, reason: 're-prepare after stale', createdBy: 'tester' },
    });
    expect(res.statusCode).toBe(200);
    runId = res.json().item.id;
    expect(res.json().item.status).toBe('PREPARED');
  });

  it('executes atomically and creates exactly one target season + current', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/api/commissioner/season-transitions/${runId}/execute`,
      headers: commissionerHeaders,
      payload: { reason: 'F31 fixture execute' },
    });
    expect(res.statusCode).toBe(200);
    const item = res.json().item;
    expect(item.status).toBe('COMPLETED');
    expect(item.targetWorldSeasonId).toBeTruthy();
    // Exactly one current (ACTIVE) season.
    expect(await prisma.worldSeason.count({ where: { status: 'ACTIVE' } })).toBe(1);
    // Source season demoted to COMPLETED.
    const source = await prisma.worldSeason.findUniqueOrThrow({ where: { id: sourceSeasonId } });
    expect(source.status).toBe('COMPLETED');
    // Target season has the deterministic order.
    const target = await prisma.worldSeason.findUniqueOrThrow({ where: { id: item.targetWorldSeasonId } });
    expect(target.status).toBe('ACTIVE');
    expect(target.startYear).toBe(item.targetSeasonOrder);
  });

  it('created target CompetitionEditions as new PLANNED records', async () => {
    const targetSeason = await prisma.worldSeason.findFirstOrThrow({ where: { status: 'ACTIVE' } });
    const editions = await prisma.competitionEdition.findMany({ where: { worldSeasonId: targetSeason.id } });
    expect(editions.length).toBeGreaterThan(0);
    for (const e of editions) {
      expect(e.status).toBe('PLANNED');
    }
  });

  it('created no Matches, schedules, standings, or playoff series', async () => {
    const targetSeason = await prisma.worldSeason.findFirstOrThrow({ where: { status: 'ACTIVE' } });
    const matches = await prisma.match.count({ where: { competitionStage: { edition: { worldSeasonId: targetSeason.id } } } });
    expect(matches).toBe(0);
    const scheduledStages = await prisma.competitionStage.count({ where: { edition: { worldSeasonId: targetSeason.id }, scheduleStatus: { not: 'NONE' } } });
    expect(scheduledStages).toBe(0);
    const series = await prisma.playoffSeries.count({ where: { stage: { edition: { worldSeasonId: targetSeason.id } } } });
    expect(series).toBe(0);
  });

  it('preserves Player count, contracts, and archives (no duplication)', async () => {
    expect(await prisma.player.count()).toBe(playerCountBefore);
    expect(await prisma.playerContract.count({ where: { status: 'ACTIVE' } })).toBe(activeContractCountBefore);
    expect(await prisma.competitionArchive.count()).toBe(archiveCountBefore);
  });

  it('did not reuse locked national-team rosters', async () => {
    const targetSeason = await prisma.worldSeason.findFirstOrThrow({ where: { status: 'ACTIVE' } });
    // No NationalTeamEdition rows should exist for the target season by F31.
    const ntEditions = await prisma.nationalTeamEdition.count({ where: { edition: { worldSeasonId: targetSeason.id } } });
    expect(ntEditions).toBe(0);
  });

  it('idempotent re-execute returns the existing completed run', async () => {
    const before = await app.inject({ method: 'GET', url: `/api/season-transitions/${runId}` });
    const res = await app.inject({
      method: 'POST',
      url: `/api/commissioner/season-transitions/${runId}/execute`,
      headers: commissionerHeaders,
      payload: { reason: 're-execute' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().item.id).toBe(before.json().item.id);
    // Still exactly one ACTIVE season.
    expect(await prisma.worldSeason.count({ where: { status: 'ACTIVE' } })).toBe(1);
  });

  it('rejects a second transition from the same source season', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/commissioner/season-transitions/prepare',
      headers: commissionerHeaders,
      payload: { sourceWorldSeasonId: sourceSeasonId, reason: 'second transition', createdBy: 'tester' },
    });
    expect(res.statusCode).toBe(409);
  });

  it('completed transition is immutable (cancel rejected)', async () => {
    const res = await app.inject({
      method: 'DELETE',
      url: `/api/commissioner/season-transitions/${runId}`,
      headers: commissionerHeaders,
      payload: { reason: 'try to cancel completed' },
    });
    expect(res.statusCode).toBe(409);
    expect(res.json().error).toBe('SeasonTransitionCompleted');
  });

  it('records audit log entries for prepare/execute/complete', async () => {
    const audit = await prisma.commissionerAuditLog.findMany({
      where: { entityType: 'SEASON_TRANSITION_RUN', entityId: runId },
      orderBy: { createdAt: 'asc' },
    });
    const actions = audit.map((a) => a.action);
    expect(actions).toContain('SEASON_TRANSITION_PREPARED');
    expect(actions).toContain('SEASON_TRANSITION_COMPLETED');
    // World-season creation audit.
    const worldSeasonAudit = await prisma.commissionerAuditLog.count({
      where: { entityType: 'WORLD_SEASON', action: 'WORLD_SEASON_CREATED' },
    });
    expect(worldSeasonAudit).toBeGreaterThan(0);
  });

  it('public status endpoint reflects the new current season', async () => {
    const status = await app.inject({ method: 'GET', url: '/api/season-transitions/status' });
    expect(status.statusCode).toBe(200);
    const item = status.json().item;
    expect(item.initialized).toBe(true);
    // The current season is now the new target season, not the source.
    expect(item.currentSeason.id).not.toBe(sourceSeasonId);
    // The latestTransition against the *current* season is null because the
    // completed transition produced this season (it is the target, not a new
    // source). The completed run is reachable through the list endpoint.
    const list = await app.inject({ method: 'GET', url: `/api/season-transitions?targetWorldSeasonId=${item.currentSeason.id}` });
    expect(list.statusCode).toBe(200);
    expect(list.json().items.some((i: any) => i.id === runId && i.status === 'COMPLETED')).toBe(true);
  });

  it('list endpoint returns the completed transition', async () => {
    const list = await app.inject({ method: 'GET', url: `/api/season-transitions?sourceWorldSeasonId=${sourceSeasonId}` });
    expect(list.statusCode).toBe(200);
    const items = list.json().items;
    expect(items.some((i: any) => i.id === runId && i.status === 'COMPLETED')).toBe(true);
  });

  it('configuration CRUD + activate works in Commissioner Mode', async () => {
    const create = await app.inject({
      method: 'POST',
      url: '/api/commissioner/season-transition-configurations',
      headers: commissionerHeaders,
      payload: {
        name: 'Test Custom Transition',
        config: (await import('@fhm/engine')).defaultSeasonTransitionConfig(),
        activate: false,
        reason: 'test custom config',
      },
    });
    expect(create.statusCode).toBe(200);
    expect(create.json().item.id).toBeTruthy();
    const presetId = create.json().item.id;
    const versionId = create.json().item.versions[0].id;
    const activate = await app.inject({
      method: 'POST',
      url: `/api/commissioner/season-transition-configuration-versions/${versionId}/activate`,
      headers: commissionerHeaders,
      payload: { reason: 'activate custom' },
    });
    expect(activate.statusCode).toBe(200);
    // Restore the default active configuration so other tests stay stable.
    await app.inject({
      method: 'POST',
      url: `/api/commissioner/season-transition-configuration-versions/${transitionConfigVersionId}/activate`,
      headers: commissionerHeaders,
      payload: { reason: 'restore default' },
    });
    // Suppress unused-var lint for presetId.
    expect(presetId).toBeTruthy();
  });

  it('did not duplicate F24–F30 operations (no new dev/youth/draft/contract rows)', async () => {
    // The transition must not have created development/youth/draft/contract rows.
    const devRuns = await prisma.playerDevelopmentRun.count();
    const youthRuns = await prisma.youthGenerationRun.count();
    const draftEvents = await prisma.draftEvent.count();
    expect(devRuns).toBe(0);
    expect(youthRuns).toBe(0);
    expect(draftEvents).toBe(0);
  });
});
