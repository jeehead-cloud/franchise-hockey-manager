import type { FastifyInstance } from 'fastify';
import { registerListDetailRoutes } from './register-list-detail.js';
import * as worldSeasons from '../services/world-seasons.js';
import * as countries from '../services/countries.js';
import * as leagues from '../services/leagues.js';
import * as teams from '../services/teams.js';
import * as players from '../services/players.js';
import * as coaches from '../services/coaches.js';
import * as competitions from '../services/competitions.js';
import * as competitionEditions from '../services/competition-editions.js';

export async function registerDomainRoutes(app: FastifyInstance) {
  registerListDetailRoutes(app, {
    basePath: '/api/world-seasons',
    entityName: 'WorldSeason',
    list: worldSeasons.listWorldSeasons,
    getById: worldSeasons.getWorldSeasonById,
  });

  registerListDetailRoutes(app, {
    basePath: '/api/countries',
    entityName: 'Country',
    list: countries.listCountries,
    getById: countries.getCountryById,
  });

  registerListDetailRoutes(app, {
    basePath: '/api/leagues',
    entityName: 'League',
    list: leagues.listLeagues,
    getById: leagues.getLeagueById,
  });

  registerListDetailRoutes(app, {
    basePath: '/api/teams',
    entityName: 'Team',
    list: teams.listTeams,
    getById: teams.getTeamById,
  });

  registerListDetailRoutes(app, {
    basePath: '/api/players',
    entityName: 'Player',
    list: players.listPlayers,
    getById: players.getPlayerById,
  });

  registerListDetailRoutes(app, {
    basePath: '/api/coaches',
    entityName: 'Coach',
    list: coaches.listCoaches,
    getById: coaches.getCoachById,
  });

  registerListDetailRoutes(app, {
    basePath: '/api/competitions',
    entityName: 'Competition',
    list: competitions.listCompetitions,
    getById: competitions.getCompetitionById,
  });

  registerListDetailRoutes(app, {
    basePath: '/api/competition-editions',
    entityName: 'CompetitionEdition',
    list: competitionEditions.listCompetitionEditions,
    getById: competitionEditions.getCompetitionEditionById,
  });
}
