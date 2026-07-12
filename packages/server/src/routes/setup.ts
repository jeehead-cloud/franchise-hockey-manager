import type { FastifyInstance } from 'fastify';
import { prisma } from '../db/client.js';
import { isSetupError, SetupError } from '../initialization/errors.js';
import {
  getSetupStatus,
  initializeSetup,
  previewSetup,
} from '../initialization/index.js';

function sendSetupError(reply: { status: (code: number) => { send: (body: unknown) => unknown } }, err: SetupError) {
  return reply.status(err.statusCode).send({
    error: err.code,
    message: err.message,
    details: err.details ?? undefined,
  });
}

export async function registerSetupRoutes(app: FastifyInstance) {
  app.get('/api/setup/status', async (_request, reply) => {
    try {
      const status = await getSetupStatus(prisma);
      return status;
    } catch (err) {
      if (isSetupError(err)) return sendSetupError(reply, err);
      throw err;
    }
  });

  app.get('/api/setup/preview', async (_request, reply) => {
    try {
      const preview = await previewSetup(prisma);
      return preview;
    } catch (err) {
      if (isSetupError(err)) return sendSetupError(reply, err);
      throw err;
    }
  });

  app.post('/api/setup/initialize', async (request, reply) => {
    try {
      const result = await initializeSetup(prisma, undefined, {
        log: (msg, meta) => request.log.info({ ...meta }, msg),
      });
      return result;
    } catch (err) {
      if (isSetupError(err)) return sendSetupError(reply, err);
      throw err;
    }
  });
}
