import { prisma } from '../db/client.js';
import { getSetupStatus } from '../initialization/index.js';
import { mapCompetitionEdition } from '../mappers.js';
import { buildTeamReadiness } from './team-readiness.js';

export interface WorldWarning {
  code: string;
  message: string;
  severity: 'info' | 'warning';
}

export async function getWorldSummary() {
  const setup = await getSetupStatus(prisma);

  const activeSeason = await prisma.worldSeason.findFirst({
    where: { status: 'ACTIVE' },
    orderBy: { startYear: 'desc' },
  });
  const anySeason =
    activeSeason ??
    (await prisma.worldSeason.findFirst({
      orderBy: { startYear: 'desc' },
    }));

  const [
    detailedLeagues,
    aggregatedLeagues,
    clubTeams,
    nationalTeams,
    assignedPlayers,
    unassignedPlayers,
    playersActive,
    playersReserve,
    playersProspect,
    playersUnavailable,
    teamsWithoutPlayers,
    teamsWithoutCoaches,
  ] = await Promise.all([
    prisma.league.count({ where: { simulationLevel: 'DETAILED' } }),
    prisma.league.count({ where: { simulationLevel: 'AGGREGATED' } }),
    prisma.team.count({ where: { teamType: 'CLUB' } }),
    prisma.team.count({ where: { teamType: 'NATIONAL' } }),
    prisma.player.count({ where: { currentTeamId: { not: null } } }),
    prisma.player.count({ where: { currentTeamId: null } }),
    prisma.player.count({ where: { rosterStatus: 'ACTIVE' } }),
    prisma.player.count({ where: { rosterStatus: 'RESERVE' } }),
    prisma.player.count({ where: { rosterStatus: 'PROSPECT' } }),
    prisma.player.count({ where: { rosterStatus: 'UNAVAILABLE' } }),
    prisma.team.count({ where: { players: { none: {} } } }),
    prisma.team.count({ where: { coach: null } }),
  ]);

  const editions = await prisma.competitionEdition.findMany({
    orderBy: { displayName: 'asc' },
    take: 20,
    include: {
      competition: { select: { id: true, name: true, type: true, simulationLevel: true } },
      worldSeason: { select: { id: true, label: true } },
    },
  });
  const readinessTeams = await prisma.team.findMany({
    select: {
      tacticalStyle: true,
      coach: { select: { id: true } },
      players: {
        select: {
          primaryPosition: true,
          rosterStatus: true,
          preferredCoachingStyle: true,
          preferredTactics: true,
          personality: true,
          heroRating: true,
          stability: true,
          developmentRate: true,
          developmentRisk: true,
          potentialFloor: true,
          potentialCeiling: true,
          publicPotentialEstimate: true,
          skaterAttributes: true,
          goalieAttributes: true,
        },
      },
    },
  });
  const readinessCounts = { readyTeams: 0, warningTeams: 0, notReadyTeams: 0 };
  for (const team of readinessTeams) {
    const status = buildTeamReadiness({
      hasHeadCoach: Boolean(team.coach),
      tacticalStyle: team.tacticalStyle,
      players: team.players,
    }).status;
    if (status === 'READY') readinessCounts.readyTeams += 1;
    else if (status === 'WARNING') readinessCounts.warningTeams += 1;
    else readinessCounts.notReadyTeams += 1;
  }
  const teamsWithoutTacticalStyle = readinessTeams.filter((team) => !team.tacticalStyle).length;

  const warnings: WorldWarning[] = [];
  if (!setup.initialized) {
    warnings.push({
      code: 'NOT_INITIALIZED',
      severity: 'warning',
      message: 'World is not initialized. Open Setup World to import a local dataset.',
    });
  }
  if (setup.initialized && !anySeason) {
    warnings.push({
      code: 'NO_WORLD_SEASON',
      severity: 'warning',
      message: 'No WorldSeason records found.',
    });
  }
  if (setup.counts.teams === 0) {
    warnings.push({
      code: 'NO_TEAMS',
      severity: 'warning',
      message: 'No teams in the database.',
    });
  }
  if (setup.counts.players === 0) {
    warnings.push({
      code: 'NO_PLAYERS',
      severity: 'warning',
      message: 'No players in the database.',
    });
  }
  if (setup.counts.competitions === 0) {
    warnings.push({
      code: 'NO_COMPETITIONS',
      severity: 'info',
      message: 'No competitions defined.',
    });
  }
  if (teamsWithoutPlayers > 0) {
    warnings.push({
      code: 'TEAMS_WITHOUT_PLAYERS',
      severity: 'info',
      message: `${teamsWithoutPlayers} team(s) have no players.`,
    });
  }
  if (teamsWithoutCoaches > 0) {
    warnings.push({
      code: 'TEAMS_WITHOUT_COACHES',
      severity: 'info',
      message: `${teamsWithoutCoaches} team(s) have no head coach.`,
    });
  }
  if (unassignedPlayers > 0) {
    warnings.push({
      code: 'UNASSIGNED_PLAYERS',
      severity: 'info',
      message: `${unassignedPlayers} player(s) have no current team.`,
    });
  }

  let recommendedNextAction: {
    code: string;
    label: string;
    href: string;
    detail: string;
  };

  if (!setup.initialized) {
    recommendedNextAction = {
      code: 'SETUP',
      label: 'Open Setup World',
      href: '/setup',
      detail: 'Initialize the database from the configured local dataset.',
    };
  } else if (setup.counts.teams === 0 || setup.counts.players === 0) {
    recommendedNextAction = {
      code: 'INSPECT_SPARSE',
      label: 'Inspect Teams or Players',
      href: setup.counts.teams === 0 ? '/teams' : '/players',
      detail: 'World is initialized but structural data looks sparse.',
    };
  } else {
    recommendedNextAction = {
      code: 'BROWSE',
      label: 'Browse Teams',
      href: '/teams',
      detail: 'Explore the initialized hockey world.',
    };
  }

  return {
    initialized: setup.initialized,
    fictionalDataset: Boolean(setup.dataset?.fictional),
    dataset: setup.initialized
      ? {
          id: setup.datasetId,
          name: setup.dataset?.name ?? null,
          sourceUpdatedAt: setup.dataset?.sourceUpdatedAt ?? null,
          schemaVersion: setup.schemaVersion,
          initializedAt: setup.initializedAt,
          fictional: Boolean(setup.dataset?.fictional),
        }
      : null,
    season: anySeason
      ? {
          id: anySeason.id,
          label: anySeason.label,
          startYear: anySeason.startYear,
          endYear: anySeason.endYear,
          phase: anySeason.phase,
          status: anySeason.status,
        }
      : null,
    counts: setup.counts,
    structure: {
      detailedLeagues,
      aggregatedLeagues,
      clubTeams,
      nationalTeams,
      assignedPlayers,
      unassignedPlayers,
      playersByRosterStatus: {
        ACTIVE: playersActive,
        RESERVE: playersReserve,
        PROSPECT: playersProspect,
        UNAVAILABLE: playersUnavailable,
      },
      teamsWithoutPlayers,
      teamsWithoutCoaches,
      teamsWithoutTacticalStyle,
      ...readinessCounts,
    },
    competitionEditions: editions.map(mapCompetitionEdition),
    warnings,
    recommendedNextAction,
    ageReference: anySeason
      ? {
          rule: 'july1_of_world_season_start_year',
          referenceDate: `${anySeason.startYear}-07-01`,
          seasonStartYear: anySeason.startYear,
        }
      : null,
  };
}
