import { buildApp, ensureAppMeta } from './app.js';
import { loadConfig } from './config.js';
import { prisma } from './db/client.js';
import { defaultBackupConfig } from '@fhm/engine';

async function main() {
  const config = loadConfig();
  const app = await buildApp({ logger: true });

  // F32: perform a pending restart-required restore BEFORE the world is
  // touched and BEFORE any Prisma query opens the active database. We use the
  // engine's default backup config to resolve the backup root (no DB read);
  // the marker + journal in that directory drive the restore. If a marker is
  // present, the active DB file is atomically replaced and migrated first.
  try {
    const { performStartupRestoreIfPending } = await import('./services/backup-startup.js');
    const result = performStartupRestoreIfPending({ config: defaultBackupConfig() });
    if (result.performed) {
      if (result.outcome === 'COMPLETED') {
        app.log.info(`[F32] ${result.message}`);
      } else if (result.outcome === 'FAILED') {
        app.log.error(`[F32] ${result.message}`);
        app.log.error('[F32] Restore marker preserved. Resolve the recovery journal manually before restarting.');
        await prisma.$disconnect();
        process.exit(1);
      }
    }
  } catch (e) {
    app.log.error(`[F32] Startup restore check failed: ${e instanceof Error ? e.message : String(e)}`);
  }

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
