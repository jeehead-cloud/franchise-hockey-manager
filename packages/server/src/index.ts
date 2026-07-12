import Fastify from 'fastify';
import cors from '@fastify/cors';
import { loadConfig } from './config.js';
import { prisma } from './db/client.js';
import { registerHealthRoute } from './routes/health.js';

async function main() {
  const config = loadConfig();
  const app = Fastify({ logger: true });

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

  // Ensure AppMeta row exists so DB wiring is exercised on boot
  await prisma.appMeta.upsert({
    where: { id: 'default' },
    create: { id: 'default' },
    update: {},
  });

  const shutdown = async (signal: string) => {
    app.log.info(`Received ${signal}, shutting down…`);
    try {
      await app.close();
      await prisma.$disconnect();
    } finally {
      process.exit(0);
    }
  };

  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));

  await app.listen({ port: config.port, host: config.host });
  app.log.info(`FHM server listening on http://localhost:${config.port}`);
}

main().catch(async (err) => {
  console.error(err);
  await prisma.$disconnect();
  process.exit(1);
});
