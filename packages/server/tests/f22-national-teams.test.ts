import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import type { PrismaClient } from '@prisma/client';
import { join } from 'node:path';
import { getCompetitionRulesTemplate, hashCompetitionRules } from '@fhm/engine';
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

describe('F22 National Teams', () => {
  let app: FastifyInstance;
  let prisma: PrismaClient;
  let tempDir: string;
  let worldSeasonId = '';
  let navCountryId = '';
  let sglCountryId = '';
  let clubTeamId = '';
  let clubCoachId = '';
  let clubCoachTeamId: string | null = null;
  let clubLineupId = '';
  let clubLineupUpdatedAt = '';
  let clubTacticalStyle: string | null = null;
  let internationalEditionId = '';
  let leagueEditionId = '';
  let nationalTeamId = '';
  let nationalTeamEditionId = '';
  let sglNationalTeamId = '';

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

    worldSeasonId = (await prisma.worldSeason.findFirstOrThrow()).id;
    const nav = await prisma.country.findFirstOrThrow({ where: { code: 'NAV' } });
    const sgl = await prisma.country.findFirstOrThrow({ where: { code: 'SGL' } });
    navCountryId = nav.id;
    sglCountryId = sgl.id;

    const club = await prisma.team.findFirstOrThrow({ where: { teamType: 'CLUB' } });
    clubTeamId = club.id;
    clubTacticalStyle = club.tacticalStyle;
    await padCountryRoster(prisma, navCountryId, clubTeamId, 'NAV', {
      forwards: 13,
      defense: 7,
      goalies: 3,
    });
    const sglClub =
      (await prisma.team.findFirst({
        where: { teamType: 'CLUB', countryId: sglCountryId },
      })) ?? club;
    await padCountryRoster(prisma, sglCountryId, sglClub.id, 'SGL', {
      forwards: 13,
      defense: 7,
      goalies: 3,
    });

    const coach = await prisma.coach.findFirstOrThrow({
      where: { currentTeamId: { not: null } },
    });
    clubCoachId = coach.id;
    clubCoachTeamId = coach.currentTeamId;

    const lineup = await prisma.teamLineup.upsert({
      where: { teamId: clubTeamId },
      create: { teamId: clubTeamId, version: 1 },
      update: {},
    });
    clubLineupId = lineup.id;
    clubLineupUpdatedAt = lineup.updatedAt.toISOString();

    const intlRules = getCompetitionRulesTemplate('SIMPLE_ROUND_ROBIN');
    const intlComp = await prisma.competition.create({
      data: {
        name: 'F22 Worlds',
        type: 'INTERNATIONAL_TOURNAMENT',
        simulationLevel: 'DETAILED',
        shortName: 'WC',
        defaultRulesJson: JSON.stringify(intlRules),
      },
    });
    const intlEdition = await prisma.competitionEdition.create({
      data: {
        competitionId: intlComp.id,
        worldSeasonId,
        displayName: 'F22 Worlds Edition',
        status: 'PLANNED',
        rulesSnapshotText: JSON.stringify(intlRules),
        rulesHash: hashCompetitionRules(intlRules),
      },
    });
    internationalEditionId = intlEdition.id;

    const leagueComp = await prisma.competition.create({
      data: {
        name: 'F22 Domestic League',
        type: 'LEAGUE',
        simulationLevel: 'DETAILED',
        shortName: 'LDL',
      },
    });
    const leagueEdition = await prisma.competitionEdition.create({
      data: {
        competitionId: leagueComp.id,
        worldSeasonId,
        displayName: 'F22 League Edition',
        status: 'PLANNED',
        rulesSnapshotText: JSON.stringify(intlRules),
        rulesHash: hashCompetitionRules(intlRules),
      },
    });
    leagueEditionId = leagueEdition.id;

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

  it('creates a national team', async () => {
    const created = await app.inject({
      method: 'POST',
      url: '/api/commissioner/national-teams',
      headers: commissionerHeaders,
      payload: {
        countryId: navCountryId,
        category: 'SENIOR_MEN',
        displayName: 'North Avalon',
        shortName: 'NAV',
        reason: 'Create NAV senior national team',
      },
    });
    expect(created.statusCode).toBe(201);
    const item = created.json().item;
    nationalTeamId = item.id;
    expect(item.category).toBe('SENIOR_MEN');
    expect(item.countryId).toBe(navCountryId);
    const team = await prisma.team.findUniqueOrThrow({ where: { id: item.teamId } });
    expect(team.teamType).toBe('NATIONAL');
    expect(team.leagueId).toBeNull();
  });

  it('prepares edition on INTERNATIONAL_TOURNAMENT and rejects LEAGUE', async () => {
    const edition = await prisma.competitionEdition.findUniqueOrThrow({
      where: { id: internationalEditionId },
    });
    const prepared = await app.inject({
      method: 'POST',
      url: `/api/commissioner/competition-editions/${internationalEditionId}/national-teams/${nationalTeamId}/prepare`,
      headers: commissionerHeaders,
      payload: {
        expectedUpdatedAt: edition.updatedAt.toISOString(),
        reason: 'Prepare NAV for worlds',
      },
    });
    expect(prepared.statusCode).toBe(201);
    nationalTeamEditionId = prepared.json().item.id;
    expect(prepared.json().item.status).toBe('PLANNED');
    expect(prepared.json().item.competitionEditionId).toBe(internationalEditionId);

    const participant = await prisma.competitionParticipant.findFirst({
      where: { competitionEditionId: internationalEditionId },
    });
    expect(participant).toBeTruthy();

    const leagueEd = await prisma.competitionEdition.findUniqueOrThrow({
      where: { id: leagueEditionId },
    });
    const rejected = await app.inject({
      method: 'POST',
      url: `/api/commissioner/competition-editions/${leagueEditionId}/national-teams/${nationalTeamId}/prepare`,
      headers: commissionerHeaders,
      payload: {
        expectedUpdatedAt: leagueEd.updatedAt.toISOString(),
        reason: 'Should fail for league competition',
      },
    });
    expect(rejected.statusCode).toBe(409);
    expect(rejected.json().error).toBe('CompetitionNotInternational');
  });

  it('generates candidates, suggests and confirms roster', async () => {
    let ntEdition = await prisma.nationalTeamEdition.findUniqueOrThrow({
      where: { id: nationalTeamEditionId },
    });
    const candidates = await app.inject({
      method: 'POST',
      url: `/api/commissioner/national-team-editions/${nationalTeamEditionId}/generate-candidates`,
      headers: commissionerHeaders,
      payload: {
        expectedUpdatedAt: ntEdition.updatedAt.toISOString(),
        reason: 'Generate NAV candidate pool',
      },
    });
    expect(candidates.statusCode).toBe(200);
    expect(candidates.json().item.eligibleCount).toBeGreaterThanOrEqual(20);
    expect(candidates.json().item.edition.status).toBe('PREPARING');

    ntEdition = await prisma.nationalTeamEdition.findUniqueOrThrow({
      where: { id: nationalTeamEditionId },
    });
    const suggested = await app.inject({
      method: 'POST',
      url: `/api/commissioner/national-team-editions/${nationalTeamEditionId}/suggest-roster`,
      headers: commissionerHeaders,
      payload: {
        expectedUpdatedAt: ntEdition.updatedAt.toISOString(),
        reason: 'Suggest NAV roster',
      },
    });
    expect(suggested.statusCode).toBe(200);
    expect(suggested.json().item.suggestion.selectedCount).toBeGreaterThanOrEqual(20);

    ntEdition = await prisma.nationalTeamEdition.findUniqueOrThrow({
      where: { id: nationalTeamEditionId },
    });
    const confirmed = await app.inject({
      method: 'POST',
      url: `/api/commissioner/national-team-editions/${nationalTeamEditionId}/confirm-roster`,
      headers: commissionerHeaders,
      payload: {
        expectedUpdatedAt: ntEdition.updatedAt.toISOString(),
        reason: 'Confirm NAV roster',
      },
    });
    expect(confirmed.statusCode).toBe(200);
    expect(confirmed.json().item.status).toBe('READY');
    expect(confirmed.json().item.rosterHash).toBeTruthy();
  });

  it('assigns staff and tactics, auto-lineup, then locks', async () => {
    let ntEdition = await prisma.nationalTeamEdition.findUniqueOrThrow({
      where: { id: nationalTeamEditionId },
    });
    const staff = await app.inject({
      method: 'PATCH',
      url: `/api/commissioner/national-team-editions/${nationalTeamEditionId}/staff`,
      headers: commissionerHeaders,
      payload: {
        expectedUpdatedAt: ntEdition.updatedAt.toISOString(),
        reason: 'Assign tournament head coach',
        staff: [{ sourceCoachId: clubCoachId, role: 'HEAD_COACH' }],
      },
    });
    expect(staff.statusCode).toBe(200);

    const coachAfter = await prisma.coach.findUniqueOrThrow({ where: { id: clubCoachId } });
    expect(coachAfter.currentTeamId).toBe(clubCoachTeamId);

    ntEdition = await prisma.nationalTeamEdition.findUniqueOrThrow({
      where: { id: nationalTeamEditionId },
    });
    const tactics = await app.inject({
      method: 'PATCH',
      url: `/api/commissioner/national-team-editions/${nationalTeamEditionId}/tactics`,
      headers: commissionerHeaders,
      payload: {
        expectedUpdatedAt: ntEdition.updatedAt.toISOString(),
        reason: 'Set tournament tactics',
        tacticalStyle: 'FORECHECKING',
        tactics: { press: true },
      },
    });
    expect(tactics.statusCode).toBe(200);

    const clubTeam = await prisma.team.findUniqueOrThrow({ where: { id: clubTeamId } });
    expect(clubTeam.tacticalStyle).toBe(clubTacticalStyle);

    ntEdition = await prisma.nationalTeamEdition.findUniqueOrThrow({
      where: { id: nationalTeamEditionId },
    });
    const lineup = await app.inject({
      method: 'POST',
      url: `/api/commissioner/national-team-editions/${nationalTeamEditionId}/auto-lineup`,
      headers: commissionerHeaders,
      payload: {
        expectedUpdatedAt: ntEdition.updatedAt.toISOString(),
        reason: 'Auto national-team lineup',
      },
    });
    expect(lineup.statusCode).toBe(200);
    expect(lineup.json().item.lineup.slots.length).toBeGreaterThan(0);

    const clubLineup = await prisma.teamLineup.findUniqueOrThrow({ where: { id: clubLineupId } });
    expect(clubLineup.updatedAt.toISOString()).toBe(clubLineupUpdatedAt);

    ntEdition = await prisma.nationalTeamEdition.findUniqueOrThrow({
      where: { id: nationalTeamEditionId },
    });
    const locked = await app.inject({
      method: 'POST',
      url: `/api/commissioner/national-team-editions/${nationalTeamEditionId}/lock`,
      headers: commissionerHeaders,
      payload: {
        expectedUpdatedAt: ntEdition.updatedAt.toISOString(),
        reason: 'Lock NAV for tournament',
        confirmation: true,
      },
    });
    expect(locked.statusCode).toBe(200);
    expect(locked.json().item.status).toBe('LOCKED');
  });

  it('keeps club Player.currentTeamId unchanged after national-team selection', async () => {
    const roster = await prisma.nationalTeamRosterPlayer.findMany({
      where: { nationalTeamEditionId },
    });
    expect(roster.length).toBeGreaterThan(0);
    for (const row of roster) {
      const player = await prisma.player.findUniqueOrThrow({ where: { id: row.sourcePlayerId } });
      expect(player.currentTeamId).not.toBeNull();
      const team = await prisma.team.findUniqueOrThrow({ where: { id: player.currentTeamId! } });
      expect(team.teamType).toBe('CLUB');
    }
  });

  it('rejects cross-team duplicate player on confirm', async () => {
    const sglCreated = await app.inject({
      method: 'POST',
      url: '/api/commissioner/national-teams',
      headers: commissionerHeaders,
      payload: {
        countryId: sglCountryId,
        category: 'SENIOR_MEN',
        displayName: 'South Glacier',
        shortName: 'SGL',
        reason: 'Create SGL senior national team',
      },
    });
    expect(sglCreated.statusCode).toBe(201);
    sglNationalTeamId = sglCreated.json().item.id;

    const edition = await prisma.competitionEdition.findUniqueOrThrow({
      where: { id: internationalEditionId },
    });
    const prepared = await app.inject({
      method: 'POST',
      url: `/api/commissioner/competition-editions/${internationalEditionId}/national-teams/${sglNationalTeamId}/prepare`,
      headers: commissionerHeaders,
      payload: {
        expectedUpdatedAt: edition.updatedAt.toISOString(),
        reason: 'Prepare SGL for worlds',
      },
    });
    expect(prepared.statusCode).toBe(201);
    const sglEditionId = prepared.json().item.id;

    let sglEdition = await prisma.nationalTeamEdition.findUniqueOrThrow({
      where: { id: sglEditionId },
    });
    const candidates = await app.inject({
      method: 'POST',
      url: `/api/commissioner/national-team-editions/${sglEditionId}/generate-candidates`,
      headers: commissionerHeaders,
      payload: {
        expectedUpdatedAt: sglEdition.updatedAt.toISOString(),
        reason: 'Generate SGL candidates',
      },
    });
    expect(candidates.statusCode).toBe(200);

    sglEdition = await prisma.nationalTeamEdition.findUniqueOrThrow({
      where: { id: sglEditionId },
    });
    const suggested = await app.inject({
      method: 'POST',
      url: `/api/commissioner/national-team-editions/${sglEditionId}/suggest-roster`,
      headers: commissionerHeaders,
      payload: {
        expectedUpdatedAt: sglEdition.updatedAt.toISOString(),
        reason: 'Suggest SGL roster',
      },
    });
    expect(suggested.statusCode).toBe(200);

    const navPlayer = await prisma.nationalTeamRosterPlayer.findFirstOrThrow({
      where: { nationalTeamEditionId },
    });
    await prisma.player.update({
      where: { id: navPlayer.sourcePlayerId },
      data: { nationalityCountryId: sglCountryId },
    });

    const sglRoster = await prisma.nationalTeamRosterPlayer.findMany({
      where: { nationalTeamEditionId: sglEditionId },
      orderBy: [{ rosterRole: 'asc' }, { rosterOrder: 'asc' }],
    });
    const patchedRoster = sglRoster.map((r, idx) =>
      idx === 0
        ? {
            playerId: navPlayer.sourcePlayerId,
            rosterRole: r.rosterRole,
            rosterOrder: r.rosterOrder,
            captainRole: r.captainRole,
            selectionSource: 'MANUAL' as const,
            jerseyNumber: r.jerseyNumber,
            positionSnapshot: navPlayer.positionSnapshot,
          }
        : {
            playerId: r.sourcePlayerId,
            rosterRole: r.rosterRole,
            rosterOrder: r.rosterOrder,
            captainRole: r.captainRole,
            selectionSource: r.selectionSource,
            jerseyNumber: r.jerseyNumber,
            positionSnapshot: r.positionSnapshot,
          },
    );

    sglEdition = await prisma.nationalTeamEdition.findUniqueOrThrow({
      where: { id: sglEditionId },
    });
    const updated = await app.inject({
      method: 'PATCH',
      url: `/api/commissioner/national-team-editions/${sglEditionId}/roster`,
      headers: commissionerHeaders,
      payload: {
        expectedUpdatedAt: sglEdition.updatedAt.toISOString(),
        reason: 'Inject cross-team duplicate player',
        roster: patchedRoster,
      },
    });
    // updateRoster also validates cross-team; accept either update or confirm failure
    if (updated.statusCode === 200) {
      sglEdition = await prisma.nationalTeamEdition.findUniqueOrThrow({
        where: { id: sglEditionId },
      });
      const confirmed = await app.inject({
        method: 'POST',
        url: `/api/commissioner/national-team-editions/${sglEditionId}/confirm-roster`,
        headers: commissionerHeaders,
        payload: {
          expectedUpdatedAt: sglEdition.updatedAt.toISOString(),
          reason: 'Confirm should fail on duplicate',
        },
      });
      expect(confirmed.statusCode).toBe(422);
      expect(confirmed.json().error).toBe('RosterValidationFailed');
      expect(JSON.stringify(confirmed.json().details)).toContain('CROSS_TEAM');
    } else {
      expect(updated.statusCode).toBe(422);
      expect(updated.json().error).toBe('RosterValidationFailed');
      expect(JSON.stringify(updated.json().details)).toContain('CROSS_TEAM');
    }
  });
});
