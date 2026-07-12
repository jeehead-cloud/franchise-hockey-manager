import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  assertSimulationDebugEnabled,
  runTechnicalRegulation,
  runTechnicalStep,
} from '../services/simulation-debug.js';
import { SimulationHttpError } from '../services/simulation-input.js';

const regulationBodySchema = z.object({
  homeTeamId: z.string().min(1),
  awayTeamId: z.string().min(1),
  seed: z.union([z.string(), z.number()]),
  eventDetail: z.enum(['NONE', 'SUMMARY', 'FULL']).optional(),
});

const stepBodySchema = regulationBodySchema.extend({
  stepMode: z.enum(['NEXT_EVENT', 'NEXT_SHIFT', 'END_PERIOD', 'END_REGULATION']),
  snapshot: z.unknown().optional().nullable(),
});

function simulationErrorReply(err: unknown) {
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
  return {
    statusCode: 500,
    body: { error: 'SimulationFailed', message: 'Simulation failed' },
  };
}

export async function registerSimulationDebugRoutes(app: FastifyInstance) {
  app.post('/api/simulation/debug/regulation', async (request, reply) => {
    try {
      assertSimulationDebugEnabled();
      const parsed = regulationBodySchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({
          error: 'InvalidSimulationRequest',
          message: 'Invalid regulation simulation request',
          details: parsed.error.flatten(),
        });
      }
      const result = await runTechnicalRegulation(parsed.data);
      return reply.send({ item: result });
    } catch (err) {
      const mapped = simulationErrorReply(err);
      return reply.status(mapped.statusCode).send(mapped.body);
    }
  });

  app.post('/api/simulation/debug/step', async (request, reply) => {
    try {
      assertSimulationDebugEnabled();
      const parsed = stepBodySchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({
          error: 'InvalidSimulationRequest',
          message: 'Invalid step simulation request',
          details: parsed.error.flatten(),
        });
      }
      const result = await runTechnicalStep({
        ...parsed.data,
        snapshot: (parsed.data.snapshot as never) ?? null,
      });
      return reply.send({ item: result });
    } catch (err) {
      const mapped = simulationErrorReply(err);
      return reply.status(mapped.statusCode).send(mapped.body);
    }
  });

  app.post('/api/simulation/debug/resume', async (request, reply) => {
    try {
      assertSimulationDebugEnabled();
      const parsed = stepBodySchema.safeParse({ ...(request.body as object), stepMode: 'END_REGULATION' });
      if (!parsed.success) {
        return reply.status(400).send({
          error: 'InvalidSimulationRequest',
          message: 'Invalid resume simulation request',
          details: parsed.error.flatten(),
        });
      }
      const result = await runTechnicalStep({
        ...parsed.data,
        stepMode: 'END_REGULATION',
        snapshot: (parsed.data.snapshot as never) ?? null,
      });
      return reply.send({ item: result });
    } catch (err) {
      const mapped = simulationErrorReply(err);
      return reply.status(mapped.statusCode).send(mapped.body);
    }
  });
}
