import type { FastifyInstance } from 'fastify';
import {
  cancelLabRun,
  createLabRun,
  exportLabRun,
  getLabOptions,
  getLabRun,
} from '../services/simulation-lab.js';
import { assertSimulationLabEnabled } from '../services/simulation-lab-config.js';
import { SimulationHttpError } from '../services/simulation-input.js';

function labErrorReply(err: unknown) {
  if (err instanceof SimulationHttpError) {
    return {
      statusCode: err.statusCode,
      body: {
        error: err.code,
        message: err.message,
        ...(err.details !== undefined ? { details: err.details } : {}),
      },
    };
  }
  const named = err as { statusCode?: number; code?: string; name?: string; message?: string };
  if (named.code === 'SimulationLabDisabled' || named.name === 'SimulationLabDisabled') {
    return {
      statusCode: named.statusCode ?? 503,
      body: {
        error: 'SimulationLabDisabled',
        message: named.message ?? 'Simulation Lab endpoints are disabled in this environment',
      },
    };
  }
  return {
    statusCode: 500,
    body: { error: 'SimulationFailed', message: 'Simulation Lab request failed' },
  };
}

export async function registerSimulationLabRoutes(app: FastifyInstance) {
  app.get('/api/simulation-lab/options', async (_request, reply) => {
    try {
      assertSimulationLabEnabled();
      const item = await getLabOptions();
      return reply.send({ item });
    } catch (err) {
      const mapped = labErrorReply(err);
      return reply.status(mapped.statusCode).send(mapped.body);
    }
  });

  app.post('/api/simulation-lab/runs', async (request, reply) => {
    try {
      const item = await createLabRun(request.body);
      return reply.status(201).send({ item });
    } catch (err) {
      const mapped = labErrorReply(err);
      return reply.status(mapped.statusCode).send(mapped.body);
    }
  });

  app.get('/api/simulation-lab/runs/:runId', async (request, reply) => {
    try {
      const { runId } = request.params as { runId: string };
      const item = getLabRun(runId);
      return reply.send({ item });
    } catch (err) {
      const mapped = labErrorReply(err);
      return reply.status(mapped.statusCode).send(mapped.body);
    }
  });

  app.delete('/api/simulation-lab/runs/:runId', async (request, reply) => {
    try {
      const { runId } = request.params as { runId: string };
      const item = cancelLabRun(runId);
      return reply.send({ item });
    } catch (err) {
      const mapped = labErrorReply(err);
      return reply.status(mapped.statusCode).send(mapped.body);
    }
  });

  app.get('/api/simulation-lab/runs/:runId/export', async (request, reply) => {
    try {
      const { runId } = request.params as { runId: string };
      const query = request.query as { format?: string };
      const format = query.format ?? 'json';
      const exported = exportLabRun(runId, format);
      return reply
        .header('content-type', exported.contentType)
        .header('content-disposition', `attachment; filename="${exported.filename}"`)
        .send(exported.body);
    } catch (err) {
      const mapped = labErrorReply(err);
      return reply.status(mapped.statusCode).send(mapped.body);
    }
  });
}
