import { buildApp, ensureAppMeta } from './app.js';
import { loadConfig } from './config.js';
import { prisma } from './db/client.js';

async function main() {
  const config = loadConfig();
  const app = await buildApp({ logger: true });

  await ensureAppMeta();

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
  app.log.info(`FHM server listening on http://${config.host}:${config.port}`);
}

main().catch(async (err) => {
  console.error(err);
  await prisma.$disconnect();
  process.exit(1);
});
