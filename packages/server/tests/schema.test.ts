import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  cleanupTempDir,
  createTempDatabaseUrl,
  createTestPrisma,
  migrateTempDatabase,
} from './helpers/db.js';
import type { PrismaClient } from '@prisma/client';

describe('F2 Prisma schema', () => {
  let prisma: PrismaClient;
  let tempDir: string;

  beforeAll(() => {
    const { url, dir } = createTempDatabaseUrl();
    tempDir = dir;
    migrateTempDatabase(url);
    prisma = createTestPrisma(url);
  });

  afterAll(async () => {
    if (prisma) await prisma.$disconnect();
    if (tempDir) cleanupTempDir(tempDir);
  });

  it('migrates and inserts the foundational graph', async () => {
    const season = await prisma.worldSeason.create({
      data: {
        label: '2026/27',
        startYear: 2026,
        endYear: 2027,
        phase: 'NHL_REGULAR_SEASON',
        status: 'ACTIVE',
      },
    });
    expect(season.startYear).toBeLessThan(season.endYear);

    const country = await prisma.country.create({
      data: { name: 'Canada', code: 'CAN' },
    });

    const league = await prisma.league.create({
      data: {
        name: 'NHL',
        shortName: 'NHL',
        countryId: country.id,
        simulationLevel: 'DETAILED',
      },
    });

    const team = await prisma.team.create({
      data: {
        name: 'Test Club',
        city: 'Test City',
        teamType: 'CLUB',
        countryId: country.id,
        leagueId: league.id,
      },
    });

    const national = await prisma.team.create({
      data: {
        name: 'Canada',
        teamType: 'NATIONAL',
        countryId: country.id,
        leagueId: null,
      },
    });

    const playerOnTeam = await prisma.player.create({
      data: {
        firstName: 'Alex',
        lastName: 'Skater',
        dateOfBirth: new Date('1998-05-12'),
        nationalityCountryId: country.id,
        currentTeamId: team.id,
        primaryPosition: 'C',
        sourceType: 'MANUAL',
        rosterStatus: 'ACTIVE',
      },
    });

    const freeAgent = await prisma.player.create({
      data: {
        firstName: 'Free',
        lastName: 'Agent',
        dateOfBirth: new Date('2000-01-01'),
        nationalityCountryId: country.id,
        currentTeamId: null,
        primaryPosition: 'G',
        sourceType: 'IMPORTED',
        rosterStatus: 'PROSPECT',
      },
    });

    const coach = await prisma.coach.create({
      data: {
        firstName: 'Dana',
        lastName: 'Bench',
        nationalityCountryId: country.id,
        currentTeamId: team.id,
        coachingStyle: 'AUTHORITATIVE',
        tacticalStyle: 'SYSTEM',
      },
    });

    const competition = await prisma.competition.create({
      data: {
        name: 'NHL Regular Season',
        type: 'LEAGUE',
        simulationLevel: 'DETAILED',
      },
    });

    const edition = await prisma.competitionEdition.create({
      data: {
        competitionId: competition.id,
        worldSeasonId: season.id,
        displayName: 'NHL 2026/27',
        status: 'ACTIVE',
      },
    });

    expect(playerOnTeam.currentTeamId).toBe(team.id);
    expect(freeAgent.currentTeamId).toBeNull();
    expect(coach.currentTeamId).toBe(team.id);
    expect(national.leagueId).toBeNull();
    expect(edition.competitionId).toBe(competition.id);

    const withRelations = await prisma.team.findUnique({
      where: { id: team.id },
      include: { players: true, coach: true, country: true, league: true },
    });
    expect(withRelations?.players).toHaveLength(1);
    expect(withRelations?.coach?.id).toBe(coach.id);
    expect(withRelations?.country.code).toBe('CAN');
    expect(withRelations?.league?.name).toBe('NHL');
  });

  it('enforces unique country code and world season label', async () => {
    await expect(
      prisma.country.create({ data: { name: 'Kanada', code: 'CAN' } }),
    ).rejects.toThrow();

    await expect(
      prisma.worldSeason.create({
        data: {
          label: '2026/27',
          startYear: 2026,
          endYear: 2027,
          phase: 'OFFSEASON',
          status: 'PLANNED',
        },
      }),
    ).rejects.toThrow();
  });

  it('allows only one current head coach per team', async () => {
    const country = await prisma.country.create({
      data: { name: 'Sweden', code: 'SWE' },
    });
    const team = await prisma.team.create({
      data: {
        name: 'Unique Coach Club',
        teamType: 'CLUB',
        countryId: country.id,
      },
    });
    await prisma.coach.create({
      data: {
        firstName: 'One',
        lastName: 'Coach',
        currentTeamId: team.id,
        coachingStyle: 'DEMOCRATIC',
        tacticalStyle: 'SPEED',
      },
    });

    await expect(
      prisma.coach.create({
        data: {
          firstName: 'Two',
          lastName: 'Coach',
          currentTeamId: team.id,
          coachingStyle: 'HANDS_OFF',
          tacticalStyle: 'PHYSICAL',
        },
      }),
    ).rejects.toThrow();
  });

  it('enforces competition+season uniqueness for editions', async () => {
    const season = await prisma.worldSeason.findFirstOrThrow();
    const competition = await prisma.competition.findFirstOrThrow();

    await expect(
      prisma.competitionEdition.create({
        data: {
          competitionId: competition.id,
          worldSeasonId: season.id,
          displayName: 'Duplicate',
          status: 'PLANNED',
        },
      }),
    ).rejects.toThrow();
  });

  it('SetNull: deleting a team clears player and coach assignment', async () => {
    const country = await prisma.country.create({
      data: { name: 'Finland', code: 'FIN' },
    });
    const team = await prisma.team.create({
      data: {
        name: 'Doomed Club',
        teamType: 'CLUB',
        countryId: country.id,
      },
    });
    const player = await prisma.player.create({
      data: {
        firstName: 'Left',
        lastName: 'Behind',
        dateOfBirth: new Date('1995-06-01'),
        nationalityCountryId: country.id,
        currentTeamId: team.id,
        primaryPosition: 'LW',
        sourceType: 'MANUAL',
        rosterStatus: 'ACTIVE',
      },
    });
    const coach = await prisma.coach.create({
      data: {
        firstName: 'Gone',
        lastName: 'Bench',
        currentTeamId: team.id,
        coachingStyle: 'AUTHORITARIAN',
        tacticalStyle: 'FORECHECKING',
      },
    });

    await prisma.team.delete({ where: { id: team.id } });

    const refreshedPlayer = await prisma.player.findUniqueOrThrow({ where: { id: player.id } });
    const refreshedCoach = await prisma.coach.findUniqueOrThrow({ where: { id: coach.id } });
    expect(refreshedPlayer.currentTeamId).toBeNull();
    expect(refreshedCoach.currentTeamId).toBeNull();
  });

  it('Restrict: deleting a country with teams fails', async () => {
    const country = await prisma.country.create({
      data: { name: 'Czechia', code: 'CZE' },
    });
    await prisma.team.create({
      data: {
        name: 'Protected Club',
        teamType: 'CLUB',
        countryId: country.id,
      },
    });

    await expect(prisma.country.delete({ where: { id: country.id } })).rejects.toThrow();
  });

  it('Restrict: deleting a competition with editions fails', async () => {
    const competition = await prisma.competition.create({
      data: { name: 'Protected Cup', type: 'OTHER' },
    });
    const season = await prisma.worldSeason.create({
      data: {
        label: '2099/00',
        startYear: 2099,
        endYear: 2100,
        phase: 'COMPLETE',
        status: 'ARCHIVED',
      },
    });
    await prisma.competitionEdition.create({
      data: {
        competitionId: competition.id,
        worldSeasonId: season.id,
        displayName: 'Protected Cup 2099',
        status: 'COMPLETED',
      },
    });

    await expect(prisma.competition.delete({ where: { id: competition.id } })).rejects.toThrow();
  });
});
