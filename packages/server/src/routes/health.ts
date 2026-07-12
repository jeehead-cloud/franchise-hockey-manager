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

    return reply.send({
      status: database === 'ok' ? 'ok' : 'degraded',
      service: SERVICE_NAME,
      version: '0.1.0',
      timestamp: new Date().toISOString(),
      database,
      engine,
    });
  });
}
