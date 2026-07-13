import type { FastifyInstance } from 'fastify';
import { detailResponse, notFound, paginatedResponse } from '../http.js';
import { registerListDetailRoutes } from './register-list-detail.js';
import * as worldSeasons from '../services/world-seasons.js';
import * as countries from '../services/countries.js';
import * as leagues from '../services/leagues.js';
import * as teams from '../services/teams.js';
import * as players from '../services/players.js';
import * as coaches from '../services/coaches.js';
import * as competitions from '../services/competitions.js';
import * as competitionEditions from '../services/competition-editions.js';
import * as world from '../services/world.js';
import { getTeamLineup } from '../services/lineups.js';
import { getTeamChemistry } from '../services/chemistry.js';

function asQuery(raw: unknown): Record<string, unknown> {
  return (raw ?? {}) as Record<string, unknown>;
}

export async function registerDomainRoutes(app: FastifyInstance) {
  app.get('/api/world', async (_request, reply) => {
    const summary = await world.getWorldSummary();
    return reply.send(summary);
  });

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

  app.get('/api/teams', async (request, reply) => {
    const result = await teams.listTeams(asQuery(request.query));
    if ('error' in result) {
      return reply.status(400).send({ error: 'BadRequest', message: result.error });
    }
    return reply.send(paginatedResponse(result));
  });

  app.get('/api/teams/:id', async (request, reply) => {
    const item = await teams.getTeamById((request.params as { id: string }).id);
    if (!item) return reply.status(404).send(notFound('Team'));
    return reply.send(detailResponse(item));
  });

  app.get('/api/teams/:id/lineup', async (request, reply) => {
    const item = await getTeamLineup((request.params as { id: string }).id);
    if (!item) return reply.status(404).send(notFound('Team'));
    return reply.send(detailResponse(item));
  });

  app.get('/api/teams/:id/chemistry', async (request, reply) => {
    const item = await getTeamChemistry((request.params as { id: string }).id);
    if (!item) return reply.status(404).send(notFound('Team'));
    return reply.send(detailResponse(item));
  });

  app.get('/api/players', async (request, reply) => {
    const result = await players.listPlayers(asQuery(request.query));
    if ('error' in result) {
      return reply.status(400).send({ error: 'BadRequest', message: result.error });
    }
    return reply.send(paginatedResponse(result));
  });

  app.get<{ Params: { id: string } }>('/api/players/:id', async (request, reply) => {
    const item = await players.getPlayerById(request.params.id);
    if (!item) return reply.status(404).send(notFound('Player'));
    return reply.send(detailResponse(item));
  });

  app.get('/api/coaches', async (request, reply) => {
    const result = await coaches.listCoaches(asQuery(request.query));
    if ('error' in result) return reply.status(400).send({ error: 'BadRequest', message: result.error });
    return reply.send(paginatedResponse(result));
  });
  app.get<{ Params: { id: string } }>('/api/coaches/:id', async (request, reply) => {
    const item = await coaches.getCoachById(request.params.id);
    if (!item) return reply.status(404).send(notFound('Coach'));
    return reply.send(detailResponse(item));
  });

  app.get('/api/competitions', async (request, reply) => {
    const result = await competitions.listCompetitions(asQuery(request.query));
    if ('error' in result) {
      return reply.status(400).send({ error: 'BadRequest', message: result.error });
    }
    return reply.send(paginatedResponse(result));
  });

  app.get<{ Params: { id: string } }>('/api/competitions/:id', async (request, reply) => {
    const item = await competitions.getCompetitionById(request.params.id);
    if (!item) return reply.status(404).send(notFound('Competition'));
    return reply.send(detailResponse(item));
  });

  app.get('/api/competition-editions', async (request, reply) => {
    const result = await competitionEditions.listCompetitionEditions(asQuery(request.query));
    if ('error' in result) {
      return reply.status(400).send({ error: 'BadRequest', message: result.error });
    }
    return reply.send(paginatedResponse(result));
  });

  app.get<{ Params: { id: string } }>('/api/competition-editions/:id', async (request, reply) => {
    const item = await competitionEditions.getCompetitionEditionById(request.params.id);
    if (!item) return reply.status(404).send(notFound('CompetitionEdition'));
    return reply.send(detailResponse(item));
  });

  app.get<{ Params: { id: string } }>(
    '/api/competition-editions/:id/participants',
    async (request, reply) => {
      const result = await competitionEditions.listEditionParticipants(
        request.params.id,
        asQuery(request.query),
      );
      if (result === null) return reply.status(404).send(notFound('CompetitionEdition'));
      if ('error' in result) {
        return reply.status(400).send({ error: 'BadRequest', message: result.error });
      }
      return reply.send(paginatedResponse(result));
    },
  );

  app.get<{ Params: { id: string } }>(
    '/api/competition-editions/:id/stages',
    async (request, reply) => {
      const result = await competitionEditions.listEditionStages(request.params.id);
      if (!result) return reply.status(404).send(notFound('CompetitionEdition'));
      return reply.send(result);
    },
  );

  app.get<{ Params: { id: string } }>(
    '/api/competition-editions/:id/readiness',
    async (request, reply) => {
      const item = await competitionEditions.getEditionReadiness(request.params.id);
      if (!item) return reply.status(404).send(notFound('CompetitionEdition'));
      return reply.send(detailResponse(item));
    },
  );

  app.get<{ Params: { id: string } }>('/api/competition-stages/:id', async (request, reply) => {
    const item = await competitionEditions.getCompetitionStageById(request.params.id);
    if (!item) return reply.status(404).send(notFound('CompetitionStage'));
    return reply.send(detailResponse(item));
  });

  app.get<{ Params: { id: string } }>(
    '/api/competition-stages/:id/participants',
    async (request, reply) => {
      const item = await competitionEditions.getCompetitionStageById(request.params.id);
      if (!item) return reply.status(404).send(notFound('CompetitionStage'));
      return reply.send({ items: item.participants });
    },
  );
}
