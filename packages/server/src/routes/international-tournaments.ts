import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  areCommissionerWritesEnabled,
  hasCommissionerHeader,
} from '../commissioner/gate.js';
import {
  CommissionerHttpError,
  commissionerErrorBody,
} from '../commissioner/errors.js';
import { detailResponse } from '../http.js';
import {
  cancelInternationalSimulation,
  generateInternationalSchedule,
  getInternationalGroups,
  getInternationalMedals,
  getInternationalOverview,
  getInternationalProgress,
  getInternationalSimulationRun,
  getInternationalStatus,
  InternationalTournamentHttpError,
  internationalTournamentErrorBody,
  prepareInternationalTournament,
  previewInternationalTournament,
  serializeInternationalRun,
  startInternationalTournamentSimulation,
} from '../services/international-tournaments.js';

function assertCommissionerAccess(request: {
  headers: Record<string, string | string[] | undefined>;
}) {
  if (!hasCommissionerHeader(request.headers)) {
    throw new CommissionerHttpError(
      403,
      'CommissionerModeRequired',
      'Commissioner Mode header X-FHM-Commissioner-Mode: enabled is required',
    );
  }
  if (!areCommissionerWritesEnabled()) {
    throw new CommissionerHttpError(
      403,
      'CommissionerWritesDisabled',
      'Commissioner writes are disabled on this server (FHM_COMMISSIONER_WRITES_ENABLED)',
    );
  }
}

function sourceFor(request: { headers: Record<string, string | string[] | undefined> }) {
  return (
    Array.isArray(request.headers['x-fhm-commissioner-source'])
      ? request.headers['x-fhm-commissioner-source'][0]
      : request.headers['x-fhm-commissioner-source']
  ) === 'ui'
    ? ('COMMISSIONER_UI' as const)
    : ('COMMISSIONER_API' as const);
}

function sendError(
  reply: { status: (code: number) => { send: (body: unknown) => unknown } },
  err: unknown,
) {
  if (err instanceof InternationalTournamentHttpError) {
    return reply.status(err.statusCode).send(internationalTournamentErrorBody(err));
  }
  if (err instanceof CommissionerHttpError) {
    return reply.status(err.statusCode).send(commissionerErrorBody(err));
  }
  if (err instanceof z.ZodError) {
    return reply.status(400).send({
      error: 'InvalidInternationalTournamentRequest',
      message: 'Invalid international tournament request',
      details: err.issues,
    });
  }
  throw err;
}

const seedSchema = z.string().min(1).max(200);
const reasonSchema = z.string().min(3);
const expectedUpdatedAt = z.string().datetime();
const templateKeySchema = z.enum(['WORLD_JUNIORS', 'WORLD_CHAMPIONSHIP', 'OLYMPIC_GAMES']);

export async function registerInternationalTournamentRoutes(app: FastifyInstance) {
  app.get('/api/competition-editions/:id/international/status', async (request, reply) => {
    try {
      const item = await getInternationalStatus((request.params as { id: string }).id);
      return reply.send(detailResponse(item));
    } catch (err) {
      return sendError(reply, err);
    }
  });

  app.get('/api/competition-editions/:id/international/overview', async (request, reply) => {
    try {
      const item = await getInternationalOverview((request.params as { id: string }).id);
      return reply.send(detailResponse(item));
    } catch (err) {
      return sendError(reply, err);
    }
  });

  app.get('/api/competition-editions/:id/international/groups', async (request, reply) => {
    try {
      const item = await getInternationalGroups((request.params as { id: string }).id);
      return reply.send(detailResponse(item));
    } catch (err) {
      return sendError(reply, err);
    }
  });

  app.get('/api/competition-editions/:id/international/medals', async (request, reply) => {
    try {
      const item = await getInternationalMedals((request.params as { id: string }).id);
      return reply.send(detailResponse(item));
    } catch (err) {
      return sendError(reply, err);
    }
  });

  app.get('/api/competition-editions/:id/international/progress', async (request, reply) => {
    try {
      const item = await getInternationalProgress((request.params as { id: string }).id);
      return reply.send(detailResponse(item));
    } catch (err) {
      return sendError(reply, err);
    }
  });

  app.post('/api/competition-editions/:id/simulate-international-tournament', async (request, reply) => {
    try {
      const body = z
        .object({
          baseSeed: seedSchema,
          confirmBackup: z.boolean().optional(),
        })
        .parse(request.body ?? {});
      const run = await startInternationalTournamentSimulation(
        (request.params as { id: string }).id,
        body,
      );
      return reply.status(202).send(detailResponse(serializeInternationalRun(run)));
    } catch (err) {
      return sendError(reply, err);
    }
  });

  app.get('/api/competition-editions/:id/international/simulation-runs/:runId', async (request, reply) => {
    try {
      const item = getInternationalSimulationRun((request.params as { runId: string }).runId);
      return reply.send(detailResponse(item));
    } catch (err) {
      return sendError(reply, err);
    }
  });

  app.post(
    '/api/competition-editions/:id/international/simulation-runs/:runId/cancel',
    async (request, reply) => {
      try {
        const item = cancelInternationalSimulation((request.params as { runId: string }).runId);
        return reply.send(detailResponse(item));
      } catch (err) {
        return sendError(reply, err);
      }
    },
  );

  app.post(
    '/api/commissioner/competition-editions/:id/international/preview',
    async (request, reply) => {
      try {
        assertCommissionerAccess(request);
        const body = z
          .object({
            templateKey: templateKeySchema.optional(),
            useTestTemplate: z.boolean().optional(),
          })
          .parse(request.body ?? {});
        const item = await previewInternationalTournament((request.params as { id: string }).id, body);
        return reply.send(detailResponse(item));
      } catch (err) {
        return sendError(reply, err);
      }
    },
  );

  app.post(
    '/api/commissioner/competition-editions/:id/prepare-international-tournament',
    async (request, reply) => {
      try {
        assertCommissionerAccess(request);
        const body = z
          .object({
            expectedUpdatedAt,
            reason: reasonSchema,
            templateKey: templateKeySchema.optional(),
            useTestTemplate: z.boolean().optional(),
            baseSeed: seedSchema.optional(),
          })
          .parse(request.body ?? {});
        const item = await prepareInternationalTournament(
          (request.params as { id: string }).id,
          body,
          sourceFor(request),
        );
        return reply.status(201).send(detailResponse(item));
      } catch (err) {
        return sendError(reply, err);
      }
    },
  );

  app.post(
    '/api/commissioner/competition-editions/:id/generate-international-schedule',
    async (request, reply) => {
      try {
        assertCommissionerAccess(request);
        const body = z
          .object({
            expectedUpdatedAt,
            reason: reasonSchema,
            seed: seedSchema.optional(),
          })
          .parse(request.body ?? {});
        const item = await generateInternationalSchedule(
          (request.params as { id: string }).id,
          body,
          sourceFor(request),
        );
        return reply.status(201).send(detailResponse(item));
      } catch (err) {
        return sendError(reply, err);
      }
    },
  );
}
