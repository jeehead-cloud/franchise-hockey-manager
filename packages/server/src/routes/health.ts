import type { FastifyInstance } from 'fastify';
import { getEngineInfo } from '@fhm/engine';
import { prisma } from '../db/client.js';

const SERVICE_NAME = 'fhm-server';

export async function registerHealthRoute(app: FastifyInstance) {
  app.get('/health', async (_request, reply) => {
    let database: 'ok' | 'unavailable' = 'ok';
    try {
      await prisma.$queryRaw`SELECT 1`;
    } catch {
      database = 'unavailable';
    }

    const engine = getEngineInfo();

    // F32 bounded backup/recovery status — no filenames, paths, hashes, or
    // operation details are exposed through public health.
    let backup: {
      configured: boolean;
      verifiedBackupCount: number;
      lastVerifiedBackupAgeDays: number | null;
      maintenanceMode: boolean;
      pendingRestore: boolean;
    } | null = null;
    try {
      const { getBoundedBackupStatus } = await import('../services/backup-history.js');
      const status = await getBoundedBackupStatus();
      backup = {
        configured: status.configured,
        verifiedBackupCount: status.verifiedBackupCount,
        lastVerifiedBackupAgeDays: status.lastVerifiedBackupAgeDays,
        maintenanceMode: status.maintenanceMode,
        pendingRestore: status.pendingRestore,
      };
    } catch {
      backup = null;
    }

    const maintenanceMode = backup?.maintenanceMode === true;
    return reply.send({
      status: database === 'ok' && !maintenanceMode ? 'ok' : maintenanceMode ? 'maintenance' : 'degraded',
      service: SERVICE_NAME,
      version: '0.1.0',
      timestamp: new Date().toISOString(),
      database,
      engine,
      ...(backup ? { backup } : {}),
    });
  });
}
