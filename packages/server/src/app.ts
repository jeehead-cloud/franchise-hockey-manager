import Fastify from 'fastify';
import cors from '@fastify/cors';
import { prisma } from './db/client.js';
import { registerHealthRoute } from './routes/health.js';
import { registerDomainRoutes } from './routes/domain.js';
import { registerSetupRoutes } from './routes/setup.js';
import { registerCommissionerRoutes } from './routes/commissioner.js';
import { registerBalanceRoutes } from './routes/balance.js';
import { registerSimulationDebugRoutes } from './routes/simulation-debug.js';
import { registerSimulationLabRoutes } from './routes/simulation-lab.js';
import { registerMatchRoutes } from './routes/matches.js';
import { registerCommissionerMatchRoutes } from './routes/commissioner-matches.js';
import { registerCommissionerCompetitionRoutes } from './routes/commissioner-competitions.js';
import { registerRegularSeasonRoutes } from './routes/regular-season.js';
import { registerPlayoffRoutes } from './routes/playoffs.js';
import { registerHistoryRoutes } from './routes/history.js';
import { registerAggregatedLeagueRoutes } from './routes/aggregated-league.js';
import { registerNationalTeamRoutes } from './routes/national-teams.js';
import { registerInternationalTournamentRoutes } from './routes/international-tournaments.js';
import { registerPlayerDevelopmentRoutes } from './routes/player-development.js';
import { registerCommissionerPlayerDevelopmentRoutes } from './routes/commissioner-player-development.js';
import { registerYouthGenerationRoutes } from './routes/youth-generation.js';
import { registerCommissionerYouthGenerationRoutes } from './routes/commissioner-youth-generation.js';

export async function buildApp(options?: { logger?: boolean }) {
  const app = Fastify({ logger: options?.logger ?? true });

  await app.register(cors, {
    origin: true,
  });

  app.setErrorHandler((error, _request, reply) => {
    app.log.error(error);
    const err = error as { statusCode?: number; name?: string; message?: string };
    const statusCode = err.statusCode ?? 500;
    reply.status(statusCode).send({
      error: err.name || 'Error',
      message: statusCode >= 500 ? 'Internal server error' : (err.message ?? 'Request failed'),
    });
  });

  await registerHealthRoute(app);
  await registerDomainRoutes(app);
  await registerSetupRoutes(app);
  await registerBalanceRoutes(app);
  await registerSimulationDebugRoutes(app);
  await registerSimulationLabRoutes(app);
  await registerMatchRoutes(app);
  await registerCommissionerMatchRoutes(app);
  await registerCommissionerCompetitionRoutes(app);
  await registerRegularSeasonRoutes(app);
  await registerPlayoffRoutes(app);
  await registerHistoryRoutes(app);
  await registerAggregatedLeagueRoutes(app);
  await registerNationalTeamRoutes(app);
  await registerInternationalTournamentRoutes(app);
  await registerPlayerDevelopmentRoutes(app);
  await registerCommissionerPlayerDevelopmentRoutes(app);
  await registerYouthGenerationRoutes(app);
  await registerCommissionerYouthGenerationRoutes(app);
  await registerCommissionerRoutes(app);

  return app;
}

export async function ensureAppMeta() {
  await prisma.appMeta.upsert({
    where: { id: 'default' },
    create: { id: 'default', worldInitialized: false },
    update: {},
  });
  const { bootstrapBalanceConfiguration } = await import('./services/balance-config.js');
  await bootstrapBalanceConfiguration(prisma);
  const { bootstrapPlayerDevelopmentConfiguration } = await import(
    './services/player-development-config.js'
  );
  await bootstrapPlayerDevelopmentConfiguration(prisma);
  const { bootstrapYouthGenerationConfiguration } = await import(
    './services/youth-generation-config.js'
  );
  await bootstrapYouthGenerationConfiguration(prisma);
}
