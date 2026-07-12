import Fastify from 'fastify';
import cors from '@fastify/cors';
import { prisma } from './db/client.js';
import { registerHealthRoute } from './routes/health.js';
import { registerDomainRoutes } from './routes/domain.js';
import { registerSetupRoutes } from './routes/setup.js';
import { registerCommissionerRoutes } from './routes/commissioner.js';

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
  await registerCommissionerRoutes(app);

  return app;
}

export async function ensureAppMeta() {
  await prisma.appMeta.upsert({
    where: { id: 'default' },
    create: { id: 'default', worldInitialized: false },
    update: {},
  });
}
