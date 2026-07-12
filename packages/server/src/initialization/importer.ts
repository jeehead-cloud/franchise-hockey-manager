import type { Prisma, PrismaClient } from '@prisma/client';
import { SetupError } from './errors.js';
import type { LoadedDataset, EntityCounts, InitializeResult } from './types.js';

export type ImportFailAfter =
  | 'worldSeason'
  | 'countries'
  | 'leagues'
  | 'teams'
  | 'players'
  | 'coaches'
  | 'competitions'
  | 'competitionEditions'
  | 'metadata';

function parseSourceUpdatedAt(iso: string): Date {
  return new Date(iso);
}

function parseDob(isoDate: string): Date {
  return new Date(`${isoDate}T00:00:00.000Z`);
}

export async function persistWorld(
  prisma: PrismaClient,
  dataset: LoadedDataset,
  options?: { failAfter?: ImportFailAfter },
): Promise<InitializeResult> {
  const { manifest } = dataset;
  const sourceUpdatedAt = parseSourceUpdatedAt(manifest.sourceUpdatedAt);
  const datasetId = manifest.datasetId;

  try {
    const created = await prisma.$transaction(async (tx) => {
      const counts: EntityCounts = {
        worldSeasons: 0,
        countries: 0,
        leagues: 0,
        teams: 0,
        players: 0,
        coaches: 0,
        competitions: 0,
        competitionEditions: 0,
      };

      const season = await tx.worldSeason.create({
        data: {
          label: manifest.worldSeasonLabel,
          startYear: manifest.worldSeasonStartYear,
          endYear: manifest.worldSeasonEndYear,
          phase: 'SEASON_PREPARATION',
          status: 'ACTIVE',
          sourceDataset: datasetId,
        },
      });
      counts.worldSeasons = 1;
      maybeFail(options?.failAfter, 'worldSeason');

      const countryMap = new Map<string, string>();
      for (const row of dataset.countries) {
        const createdCountry = await tx.country.create({
          data: {
            name: row.name,
            code: row.code,
            externalId: row.externalId,
            sourceDataset: datasetId,
            sourceUpdatedAt,
          },
        });
        countryMap.set(row.externalId, createdCountry.id);
        counts.countries += 1;
      }
      maybeFail(options?.failAfter, 'countries');

      const leagueMap = new Map<string, string>();
      for (const row of dataset.leagues) {
        const createdLeague = await tx.league.create({
          data: {
            name: row.name,
            shortName: row.shortName ?? null,
            countryId: row.countryExternalId
              ? countryMap.get(row.countryExternalId) ?? null
              : null,
            simulationLevel: row.simulationLevel,
            externalId: row.externalId,
            sourceDataset: datasetId,
            sourceUpdatedAt,
          },
        });
        leagueMap.set(row.externalId, createdLeague.id);
        counts.leagues += 1;
      }
      maybeFail(options?.failAfter, 'leagues');

      const teamMap = new Map<string, string>();
      for (const row of dataset.teams) {
        const countryId = countryMap.get(row.countryExternalId);
        if (!countryId) {
          throw new SetupError(
            'InitializationFailed',
            `Missing country mapping for team ${row.externalId}`,
            500,
          );
        }
        const createdTeam = await tx.team.create({
          data: {
            name: row.name,
            shortName: row.shortName ?? null,
            city: row.city ?? null,
            teamType: row.teamType,
            countryId,
            leagueId: row.leagueExternalId
              ? leagueMap.get(row.leagueExternalId) ?? null
              : null,
            tacticalStyle: row.tacticalStyle,
            externalId: row.externalId,
            sourceDataset: datasetId,
            sourceUpdatedAt,
          },
        });
        teamMap.set(row.externalId, createdTeam.id);
        counts.teams += 1;
      }
      maybeFail(options?.failAfter, 'teams');

      for (const row of dataset.players) {
        const nationalityCountryId = countryMap.get(row.nationalityExternalId);
        if (!nationalityCountryId) {
          throw new SetupError(
            'InitializationFailed',
            `Missing nationality mapping for player ${row.externalId}`,
            500,
          );
        }
        await tx.player.create({
          data: {
            firstName: row.firstName,
            lastName: row.lastName,
            dateOfBirth: parseDob(row.dateOfBirth),
            nationalityCountryId,
            currentTeamId: row.currentTeamExternalId
              ? teamMap.get(row.currentTeamExternalId) ?? null
              : null,
            primaryPosition: row.primaryPosition,
            sourceType: row.sourceType,
            rosterStatus: row.rosterStatus,
            externalId: row.externalId,
            sourceDataset: datasetId,
            sourceUpdatedAt,
            preferredCoachingStyle: row.preferredCoachingStyle,
            preferredTactics: row.preferredTactics,
            personality: row.personality,
            heroRating: row.heroRating,
            stability: row.stability,
            developmentRate: row.developmentRate,
            developmentRisk: row.developmentRisk,
            potentialFloor: row.potentialFloor,
            potentialCeiling: row.potentialCeiling,
            publicPotentialEstimate: row.publicPotentialEstimate,
            ...(row.primaryPosition === 'G' && row.goalieAttributes
              ? { goalieAttributes: { create: row.goalieAttributes } }
              : {}),
            ...(row.primaryPosition !== 'G' && row.skaterAttributes
              ? { skaterAttributes: { create: row.skaterAttributes } }
              : {}),
          },
        });
        counts.players += 1;
      }
      maybeFail(options?.failAfter, 'players');

      for (const row of dataset.coaches) {
        await tx.coach.create({
          data: {
            firstName: row.firstName,
            lastName: row.lastName,
            nationalityCountryId: row.nationalityExternalId
              ? countryMap.get(row.nationalityExternalId) ?? null
              : null,
            currentTeamId: row.currentTeamExternalId
              ? teamMap.get(row.currentTeamExternalId) ?? null
              : null,
            coachingStyle: row.coachingStyle,
            tacticalStyle: row.tacticalStyle,
            overallCoaching: row.overallCoaching,
            playerDevelopment: row.playerDevelopment,
            offense: row.offense,
            defense: row.defense,
            externalId: row.externalId,
            sourceDataset: datasetId,
            sourceUpdatedAt,
          },
        });
        counts.coaches += 1;
      }
      maybeFail(options?.failAfter, 'coaches');

      const competitionMap = new Map<string, string>();
      for (const row of dataset.competitions) {
        const createdCompetition = await tx.competition.create({
          data: {
            name: row.name,
            shortName: row.shortName ?? null,
            type: row.type,
            simulationLevel: row.simulationLevel ?? null,
            externalId: row.externalId,
            sourceDataset: datasetId,
            sourceUpdatedAt,
          },
        });
        competitionMap.set(row.externalId, createdCompetition.id);
        counts.competitions += 1;
      }
      maybeFail(options?.failAfter, 'competitions');

      for (const row of dataset.competitionEditions) {
        const competitionId = competitionMap.get(row.competitionExternalId);
        if (!competitionId) {
          throw new SetupError(
            'InitializationFailed',
            `Missing competition mapping for edition ${row.displayName}`,
            500,
          );
        }
        await tx.competitionEdition.create({
          data: {
            competitionId,
            worldSeasonId: season.id,
            displayName: row.displayName,
            status: row.status,
          },
        });
        counts.competitionEditions += 1;
      }
      maybeFail(options?.failAfter, 'competitionEditions');

      const initializedAt = new Date();
      await tx.appMeta.upsert({
        where: { id: 'default' },
        create: {
          id: 'default',
          worldInitialized: true,
          worldDatasetId: datasetId,
          worldInitializedAt: initializedAt,
          worldSchemaVersion: manifest.schemaVersion,
        },
        update: {
          worldInitialized: true,
          worldDatasetId: datasetId,
          worldInitializedAt: initializedAt,
          worldSchemaVersion: manifest.schemaVersion,
        },
      });
      maybeFail(options?.failAfter, 'metadata');

      return { counts, initializedAt };
    });

    return {
      initialized: true,
      datasetId,
      initializedAt: created.initializedAt.toISOString(),
      created: created.counts,
      fictional: Boolean(manifest.fictional),
    };
  } catch (err) {
    if (err instanceof SetupError) throw err;
    if (err instanceof Error && err.message.startsWith('__FAIL_AFTER__')) {
      throw err;
    }
    throw new SetupError(
      'InitializationFailed',
      err instanceof Error ? err.message : 'Initialization failed',
      500,
    );
  }
}

function maybeFail(failAfter: ImportFailAfter | undefined, step: ImportFailAfter) {
  if (failAfter === step) {
    throw new Error(`__FAIL_AFTER__:${step}`);
  }
}

/** Re-export for typing convenience in tests. */
export type TxClient = Prisma.TransactionClient;
