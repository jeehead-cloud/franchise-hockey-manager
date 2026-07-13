import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import type { PrismaClient } from '@prisma/client';
import { buildTestSimulationInput, getTestInternationalTemplate } from '@fhm/engine';
import { join } from 'node:path';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import {
  cleanupTempDir,
  createTempDatabaseUrl,
  migrateTempDatabase,
} from './helpers/db.js';
import { getRepoRoot } from '../src/initialization/paths.js';
import { COMMISSIONER_HEADER, COMMISSIONER_HEADER_VALUE } from '../src/commissioner/gate.js';

const fixtureDir = join(getRepoRoot(), 'data', 'fixtures', 'f3-minimal-world');
const commissionerHeaders = {
  [COMMISSIONER_HEADER]: COMMISSIONER_HEADER_VALUE,
  'x-fhm-commissioner-source': 'api',
};

async function padCountryRoster(
  prisma: PrismaClient,
  countryId: string,
  teamId: string,
  tag: string,
  counts: { forwards: number; defense: number; goalies: number },
) {
  const existing = await prisma.player.findMany({
    where: { nationalityCountryId: countryId, rosterStatus: 'ACTIVE' },
  });
  const forwards = existing.filter((p) => !['LD', 'RD', 'D', 'G'].includes(p.primaryPosition));
  const defense = existing.filter((p) => ['LD', 'RD', 'D'].includes(p.primaryPosition));
  const goalies = existing.filter((p) => p.primaryPosition === 'G');

  for (let i = forwards.length; i < counts.forwards; i += 1) {
    const player = await prisma.player.create({
      data: {
        firstName: `Nt${tag}`,
        lastName: `F${i}`,
        dateOfBirth: new Date('1998-01-01'),
        nationalityCountryId: countryId,
        currentTeamId: teamId,
        primaryPosition: i % 3 === 0 ? 'C' : i % 3 === 1 ? 'LW' : 'RW',
        sourceType: 'MANUAL',
        rosterStatus: 'ACTIVE',
        preferredCoachingStyle: 'DEVELOPMENTAL',
        preferredTactics: 'FORECHECKING',
        personality: 'PROFESSIONAL',
        heroRating: 10,
        stability: 10,
        developmentRate: 10,
        developmentRisk: 10,
        potentialFloor: 40,
        potentialCeiling: 70,
        publicPotentialEstimate: 'STANDARD',
      },
    });
    await prisma.skaterAttributes.create({
      data: {
        playerId: player.id,
        stickhandling: 12,
        shooting: 11,
        passing: 12,
        strength: 10,
        speed: 11,
        balance: 10,
        aggression: 9,
        offensiveAwareness: 12,
        defensiveAwareness: 10,
      },
    });
  }

  for (let i = defense.length; i < counts.defense; i += 1) {
    const player = await prisma.player.create({
      data: {
        firstName: `Nt${tag}`,
        lastName: `D${i}`,
        dateOfBirth: new Date('1997-06-01'),
        nationalityCountryId: countryId,
        currentTeamId: teamId,
        primaryPosition: i % 2 === 0 ? 'LD' : 'RD',
        sourceType: 'MANUAL',
        rosterStatus: 'ACTIVE',
        preferredCoachingStyle: 'DEVELOPMENTAL',
        preferredTactics: 'FORECHECKING',
        personality: 'PROFESSIONAL',
        heroRating: 10,
        stability: 10,
        developmentRate: 10,
        developmentRisk: 10,
        potentialFloor: 40,
        potentialCeiling: 70,
        publicPotentialEstimate: 'STANDARD',
      },
    });
    await prisma.skaterAttributes.create({
      data: {
        playerId: player.id,
        stickhandling: 10,
        shooting: 9,
        passing: 11,
        strength: 12,
        speed: 10,
        balance: 11,
        aggression: 10,
        offensiveAwareness: 9,
        defensiveAwareness: 13,
      },
    });
  }

  for (let i = goalies.length; i < counts.goalies; i += 1) {
    const player = await prisma.player.create({
      data: {
        firstName: `Nt${tag}`,
        lastName: `G${i}`,
        dateOfBirth: new Date('1996-03-01'),
        nationalityCountryId: countryId,
        currentTeamId: teamId,
        primaryPosition: 'G',
        sourceType: 'MANUAL',
        rosterStatus: 'ACTIVE',
        preferredCoachingStyle: 'DEVELOPMENTAL',
        preferredTactics: 'FORECHECKING',
        personality: 'PROFESSIONAL',
        heroRating: 10,
        stability: 10,
        developmentRate: 10,
        developmentRisk: 10,
        potentialFloor: 40,
        potentialCeiling: 70,
        publicPotentialEstimate: 'STANDARD',
      },
    });
    await prisma.goalieAttributes.create({
      data: {
        playerId: player.id,
        reflexes: 12,
        positioning: 11,
        reboundControl: 10,
        glove: 11,
        blocker: 10,
        movement: 11,
        puckHandling: 9,
        consistency: 11,
        stamina: 12,
      },
    });
  }
}

async function pollRun(
  app: FastifyInstance,
  editionId: string,
  runId: string,
  timeoutMs = 60_000,
): Promise<string> {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const res = await app.inject({
      method: 'GET',
      url: `/api/competition-editions/${editionId}/international/simulation-runs/${runId}`,
    });
    expect(res.statusCode).toBe(200);
    const status = res.json().item.status as string;
    if (status === 'COMPLETED' || status === 'FAILED' || status === 'CANCELLED') {
      return status;
    }
    await new Promise((r) => setTimeout(r, 50));
  }
  throw new Error('Timed out waiting for international simulation run');
}

async function lockNationalTeam(
  app: FastifyInstance,
  prisma: PrismaClient,
  opts: {
    countryId: string;
    category: 'SENIOR_MEN';
    displayName: string;
    shortName: string;
    editionId: string;
    clubTeamId: string;
    coachId: string;
    tag: string;
  },
) {
  await padCountryRoster(prisma, opts.countryId, opts.clubTeamId, opts.tag, {
    forwards: 13,
    defense: 7,
    goalies: 3,
  });

  const created = await app.inject({
    method: 'POST',
    url: '/api/commissioner/national-teams',
    headers: commissionerHeaders,
    payload: {
      countryId: opts.countryId,
      category: opts.category,
      displayName: opts.displayName,
      shortName: opts.shortName,
      reason: `Create ${opts.shortName} national team`,
    },
  });
  expect(created.statusCode).toBe(201);
  const nationalTeamId = created.json().item.id as string;

  let edition = await prisma.competitionEdition.findUniqueOrThrow({ where: { id: opts.editionId } });
  const prepared = await app.inject({
    method: 'POST',
    url: `/api/commissioner/competition-editions/${opts.editionId}/national-teams/${nationalTeamId}/prepare`,
    headers: commissionerHeaders,
    payload: {
      expectedUpdatedAt: edition.updatedAt.toISOString(),
      reason: `Prepare ${opts.shortName}`,
    },
  });
  expect(prepared.statusCode).toBe(201);
  const ntEditionId = prepared.json().item.id as string;

  let ntEdition = await prisma.nationalTeamEdition.findUniqueOrThrow({ where: { id: ntEditionId } });
  for (const [path, reason] of [
    ['generate-candidates', `Generate ${opts.shortName} candidates`],
    ['suggest-roster', `Suggest ${opts.shortName} roster`],
    ['confirm-roster', `Confirm ${opts.shortName} roster`],
  ] as const) {
    ntEdition = await prisma.nationalTeamEdition.findUniqueOrThrow({ where: { id: ntEditionId } });
    const res = await app.inject({
      method: 'POST',
      url: `/api/commissioner/national-team-editions/${ntEditionId}/${path}`,
      headers: commissionerHeaders,
      payload: {
        expectedUpdatedAt: ntEdition.updatedAt.toISOString(),
        reason,
      },
    });
    expect(res.statusCode).toBe(200);
  }

  ntEdition = await prisma.nationalTeamEdition.findUniqueOrThrow({ where: { id: ntEditionId } });
  const staff = await app.inject({
    method: 'PATCH',
    url: `/api/commissioner/national-team-editions/${ntEditionId}/staff`,
    headers: commissionerHeaders,
    payload: {
      expectedUpdatedAt: ntEdition.updatedAt.toISOString(),
      reason: `Staff ${opts.shortName}`,
      staff: [{ sourceCoachId: opts.coachId, role: 'HEAD_COACH' }],
    },
  });
  expect(staff.statusCode).toBe(200);

  ntEdition = await prisma.nationalTeamEdition.findUniqueOrThrow({ where: { id: ntEditionId } });
  const tactics = await app.inject({
    method: 'PATCH',
    url: `/api/commissioner/national-team-editions/${ntEditionId}/tactics`,
    headers: commissionerHeaders,
    payload: {
      expectedUpdatedAt: ntEdition.updatedAt.toISOString(),
      reason: `Tactics ${opts.shortName}`,
      tacticalStyle: 'FORECHECKING',
      tactics: { press: true },
    },
  });
  expect(tactics.statusCode).toBe(200);

  ntEdition = await prisma.nationalTeamEdition.findUniqueOrThrow({ where: { id: ntEditionId } });
  const lineup = await app.inject({
    method: 'POST',
    url: `/api/commissioner/national-team-editions/${ntEditionId}/auto-lineup`,
    headers: commissionerHeaders,
    payload: {
      expectedUpdatedAt: ntEdition.updatedAt.toISOString(),
      reason: `Lineup ${opts.shortName}`,
    },
  });
  expect(lineup.statusCode).toBe(200);

  ntEdition = await prisma.nationalTeamEdition.findUniqueOrThrow({ where: { id: ntEditionId } });
  const locked = await app.inject({
    method: 'POST',
    url: `/api/commissioner/national-team-editions/${ntEditionId}/lock`,
    headers: commissionerHeaders,
    payload: {
      expectedUpdatedAt: ntEdition.updatedAt.toISOString(),
      reason: `Lock ${opts.shortName}`,
      confirmation: true,
    },
  });
  expect(locked.statusCode).toBe(200);
  expect(locked.json().item.status).toBe('LOCKED');

  return { nationalTeamId, ntEditionId };
}

describe('F23 International Tournaments', () => {
  let app: FastifyInstance;
  let prisma: PrismaClient;
  let tempDir: string;
  let backupDir: string;
  let worldSeasonId = '';
  let editionId = '';
  let clubTeamId = '';
  let clubCoachId = '';
  let clubLineupUpdatedAt = '';
  let clubTacticalStyle: string | null = null;
  const countries: Array<{ id: string; code: string; name: string }> = [];

  beforeAll(async () => {
    const { url, dir } = createTempDatabaseUrl();
    tempDir = dir;
    backupDir = mkdtempSync(join(tmpdir(), 'fhm-f23-bak-'));
    process.env.DATABASE_URL = url;
    process.env.FHM_DATASET_DIR = fixtureDir;
    process.env.FHM_COMMISSIONER_WRITES_ENABLED = 'true';
    process.env.FHM_BACKUP_DIR = backupDir;
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

    worldSeasonId = (await prisma.worldSeason.findFirstOrThrow()).id;
    const nav = await prisma.country.findFirstOrThrow({ where: { code: 'NAV' } });
    const sgl = await prisma.country.findFirstOrThrow({ where: { code: 'SGL' } });
    countries.push({ id: nav.id, code: 'NAV', name: nav.name });
    countries.push({ id: sgl.id, code: 'SGL', name: sgl.name });

    for (const [code, name] of [
      ['AAA', 'Alpha Aces'],
      ['BBB', 'Beta Blades'],
    ] as const) {
      const c = await prisma.country.create({ data: { code, name } });
      countries.push({ id: c.id, code, name });
    }

    const club = await prisma.team.findFirstOrThrow({ where: { teamType: 'CLUB' } });
    clubTeamId = club.id;
    clubTacticalStyle = club.tacticalStyle;
    const lineup = await prisma.teamLineup.upsert({
      where: { teamId: clubTeamId },
      create: { teamId: clubTeamId, version: 1 },
      update: {},
    });
    clubLineupUpdatedAt = lineup.updatedAt.toISOString();

    const coach = await prisma.coach.findFirstOrThrow({
      where: { currentTeamId: { not: null } },
    });
    clubCoachId = coach.id;

    const comp = await prisma.competition.create({
      data: {
        name: 'F23 Test Worlds',
        type: 'INTERNATIONAL_TOURNAMENT',
        simulationLevel: 'DETAILED',
        shortName: 'F23W',
      },
    });
    const edition = await prisma.competitionEdition.create({
      data: {
        competitionId: comp.id,
        worldSeasonId,
        displayName: 'F23 Mini Worlds',
        status: 'PLANNED',
        rulesSnapshotText: '{}',
        rulesHash: '',
      },
    });
    editionId = edition.id;

    const intlInput = await import('../src/services/international-match-input.js');
    vi.spyOn(intlInput, 'buildInternationalMatchSimulationInput').mockImplementation(async (opts) => {
      const input = buildTestSimulationInput(opts.seed, { mode: 'F14' });
      input.matchId = opts.matchId ?? `intl-${opts.homeTeamId}-${opts.awayTeamId}`;
      input.homeTeam.teamId = opts.homeTeamId;
      input.awayTeam.teamId = opts.awayTeamId;
      if (opts.completionRules) {
        input.completionRules = opts.completionRules;
      }
      input.inputFingerprint = `mock-intl-${opts.homeTeamId}-${opts.awayTeamId}-${opts.seed}`;
      return input;
    });

    const { buildApp, ensureAppMeta } = await import('../src/app.js');
    await ensureAppMeta();
    app = await buildApp({ logger: false });
    await app.ready();

    for (const [i, c] of countries.entries()) {
      await lockNationalTeam(app, prisma, {
        countryId: c.id,
        category: 'SENIOR_MEN',
        displayName: c.name,
        shortName: c.code,
        editionId,
        clubTeamId,
        coachId: clubCoachId,
        tag: c.code,
      });
      // Assign seeds
      const participant = await prisma.competitionParticipant.findFirstOrThrow({
        where: {
          competitionEditionId: editionId,
          team: { nationalTeamProfile: { countryId: c.id } },
        },
      });
      await prisma.competitionParticipant.update({
        where: { id: participant.id },
        data: { seed: i + 1 },
      });
    }
  }, 180_000);

  afterAll(async () => {
    vi.restoreAllMocks();
    if (app) await app.close();
    if (prisma) await prisma.$disconnect();
    if (tempDir) cleanupTempDir(tempDir);
    if (backupDir) cleanupTempDir(backupDir);
  });

  it('preview does not write and requires locked national teams', async () => {
    const matchCountBefore = await prisma.match.count({ where: { competitionEditionId: editionId } });
    const editionBefore = await prisma.competitionEdition.findUniqueOrThrow({
      where: { id: editionId },
    });

    const preview = await app.inject({
      method: 'POST',
      url: `/api/commissioner/competition-editions/${editionId}/international/preview`,
      headers: commissionerHeaders,
      payload: { useTestTemplate: true },
    });
    expect(preview.statusCode).toBe(200);
    expect(preview.json().item.persisted).toBe(false);
    expect(preview.json().item.template.participantCount).toBe(4);
    expect(preview.json().item.schedule.matchCount).toBeGreaterThan(0);

    const matchCountAfter = await prisma.match.count({ where: { competitionEditionId: editionId } });
    expect(matchCountAfter).toBe(matchCountBefore);
    const editionAfter = await prisma.competitionEdition.findUniqueOrThrow({
      where: { id: editionId },
    });
    expect(editionAfter.tournamentTemplateHash).toBeNull();
    expect(editionAfter.updatedAt.toISOString()).toBe(editionBefore.updatedAt.toISOString());

    // Unlock one NT and ensure preview rejects
    const one = await prisma.nationalTeamEdition.findFirstOrThrow({
      where: { competitionEditionId: editionId, status: 'LOCKED' },
    });
    await prisma.nationalTeamEdition.update({
      where: { id: one.id },
      data: { status: 'READY' },
    });
    const rejected = await app.inject({
      method: 'POST',
      url: `/api/commissioner/competition-editions/${editionId}/international/preview`,
      headers: commissionerHeaders,
      payload: { useTestTemplate: true },
    });
    expect(rejected.statusCode).toBe(409);
    expect(rejected.json().error).toBe('NationalTeamsNotLocked');
    await prisma.nationalTeamEdition.update({
      where: { id: one.id },
      data: { status: 'LOCKED' },
    });
  });

  it('prepares tournament and generates group schedule', async () => {
    expect(getTestInternationalTemplate().participantCount).toBe(4);

    let edition = await prisma.competitionEdition.findUniqueOrThrow({ where: { id: editionId } });
    const prepared = await app.inject({
      method: 'POST',
      url: `/api/commissioner/competition-editions/${editionId}/prepare-international-tournament`,
      headers: commissionerHeaders,
      payload: {
        expectedUpdatedAt: edition.updatedAt.toISOString(),
        reason: 'Prepare F23 mini tournament',
        useTestTemplate: true,
        baseSeed: 'f23-test-seed',
      },
    });
    expect(prepared.statusCode).toBe(201);
    expect(prepared.json().item.status).toBe('READY');
    expect(prepared.json().item.groups).toHaveLength(1);

    edition = await prisma.competitionEdition.findUniqueOrThrow({ where: { id: editionId } });
    expect(edition.tournamentTemplateHash).toBeTruthy();

    const stages = await prisma.competitionStage.findMany({
      where: { competitionEditionId: editionId },
      orderBy: { stageOrder: 'asc' },
    });
    expect(stages).toHaveLength(2);
    expect(stages.map((s) => s.stageType)).toEqual(['GROUP_STAGE', 'BEST_OF_SERIES']);
    expect(await prisma.match.count({ where: { competitionEditionId: editionId } })).toBe(0);

    const ready = await app.inject({
      method: 'POST',
      url: `/api/commissioner/competition-editions/${editionId}/transition`,
      headers: commissionerHeaders,
      payload: {
        expectedUpdatedAt: edition.updatedAt.toISOString(),
        targetStatus: 'ACTIVE',
        reason: 'Activate F23 tournament',
      },
    });
    expect(ready.statusCode).toBe(200);

    edition = await prisma.competitionEdition.findUniqueOrThrow({ where: { id: editionId } });
    const schedule = await app.inject({
      method: 'POST',
      url: `/api/commissioner/competition-editions/${editionId}/generate-international-schedule`,
      headers: commissionerHeaders,
      payload: {
        expectedUpdatedAt: edition.updatedAt.toISOString(),
        reason: 'Generate F23 group schedule',
        seed: 'f23-sched-1',
      },
    });
    expect(schedule.statusCode).toBe(201);
    expect(schedule.json().item.matchCount).toBe(6); // C(4,2) single RR
    expect(schedule.json().item.scheduleHash).toBeTruthy();

    const matches = await prisma.match.findMany({
      where: { competitionEditionId: editionId, tournamentGroupKey: { not: null } },
    });
    expect(matches.length).toBe(6);
    expect(matches.every((m) => m.status === 'PREPARED')).toBe(true);
    expect(matches.every((m) => m.source === 'COMPETITION')).toBe(true);
  });

  it('simulates mini tournament, medals distinct, club ownership unchanged', async () => {
    const clubPlayersBefore = await prisma.player.findMany({
      where: { currentTeamId: clubTeamId },
      select: { id: true, currentTeamId: true },
    });
    const clubTeamBefore = await prisma.team.findUniqueOrThrow({ where: { id: clubTeamId } });
    const clubLineupBefore = await prisma.teamLineup.findUniqueOrThrow({
      where: { teamId: clubTeamId },
    });

    const sim = await app.inject({
      method: 'POST',
      url: `/api/competition-editions/${editionId}/simulate-international-tournament`,
      headers: commissionerHeaders,
      payload: { baseSeed: 'f23-sim-seed' },
    });
    expect(sim.statusCode).toBe(202);
    const runId = sim.json().item.id as string;
    const status = await pollRun(app, editionId, runId);
    expect(status).toBe('COMPLETED');

    const edition = await prisma.competitionEdition.findUniqueOrThrow({ where: { id: editionId } });
    expect(edition.status).toBe('COMPLETED');
    expect(edition.tournamentResultHash).toBeTruthy();

    const medals = await app.inject({
      method: 'GET',
      url: `/api/competition-editions/${editionId}/international/medals`,
    });
    expect(medals.statusCode).toBe(200);
    const medalRows = medals.json().item.medals as Array<{
      medalType: string;
      competitionParticipantId: string;
    }>;
    expect(medalRows.map((m) => m.medalType).sort()).toEqual(['BRONZE', 'GOLD', 'SILVER']);
    const participants = new Set(medalRows.map((m) => m.competitionParticipantId));
    expect(participants.size).toBe(3);

    for (const p of clubPlayersBefore) {
      const after = await prisma.player.findUniqueOrThrow({ where: { id: p.id } });
      expect(after.currentTeamId).toBe(p.currentTeamId);
    }
    const clubTeamAfter = await prisma.team.findUniqueOrThrow({ where: { id: clubTeamId } });
    expect(clubTeamAfter.tacticalStyle).toBe(clubTeamBefore.tacticalStyle);
    expect(clubTeamAfter.tacticalStyle).toBe(clubTacticalStyle);
    const clubLineupAfter = await prisma.teamLineup.findUniqueOrThrow({
      where: { teamId: clubTeamId },
    });
    expect(clubLineupAfter.updatedAt.toISOString()).toBe(clubLineupBefore.updatedAt.toISOString());
    expect(clubLineupAfter.updatedAt.toISOString()).toBe(clubLineupUpdatedAt);
  });

  it('blocks schedule regenerate after completed group results', async () => {
    const edition = await prisma.competitionEdition.findUniqueOrThrow({ where: { id: editionId } });
    // Force status ACTIVE temporarily would fail — edition COMPLETED. Create a fresh attempt on same schedule API should fail for locked schedule reason when we reset status... Instead mark edition ACTIVE and try regenerate.
    await prisma.competitionEdition.update({
      where: { id: editionId },
      data: { status: 'ACTIVE' },
    });
    const refreshed = await prisma.competitionEdition.findUniqueOrThrow({ where: { id: editionId } });
    const regen = await app.inject({
      method: 'POST',
      url: `/api/commissioner/competition-editions/${editionId}/generate-international-schedule`,
      headers: commissionerHeaders,
      payload: {
        expectedUpdatedAt: refreshed.updatedAt.toISOString(),
        reason: 'Should fail after results',
        seed: 'regen-blocked',
      },
    });
    expect(regen.statusCode).toBe(409);
    expect(regen.json().error).toBe('TournamentScheduleLocked');
  });
});
