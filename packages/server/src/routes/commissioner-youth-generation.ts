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
  activateYouthProfileSetVersion,
  createCountryNamePool,
  createCountryNamePoolVersion,
  createYouthProfileSet,
  createYouthProfileSetVersion,
} from '../services/youth-generation-config.js';
import {
  YouthGenerationHttpError,
  discardPreparedYouthGenerationRun,
  executeYouthGenerationRun,
  getYouthGenerationRunDiagnostics,
  prepareYouthGenerationRun,
  previewYouthGeneration,
} from '../services/youth-generation.js';

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
  if (err instanceof YouthGenerationHttpError) {
    return reply.status(err.statusCode).send({
      error: err.code,
      message: err.message,
      details: err.details,
    });
  }
  if (err instanceof CommissionerHttpError) {
    return reply.status(err.statusCode).send(commissionerErrorBody(err));
  }
  if (err instanceof z.ZodError) {
    return reply.status(400).send({
      error: 'InvalidYouthGenerationRequest',
      message: 'Invalid youth generation request',
      details: err.issues,
    });
  }
  throw err;
}

const previewSchema = z.object({
  worldSeasonId: z.string().min(1),
  referenceDate: z.string().min(1),
  baseSeed: z.string().min(1),
  profileSetVersionId: z.string().optional(),
  filters: z
    .object({
      countryIds: z.array(z.string()).optional(),
      age: z.number().int().nullable().optional(),
      position: z.string().nullable().optional(),
      qualityTier: z.string().nullable().optional(),
    })
    .optional(),
  page: z.number().int().positive().optional(),
  pageSize: z.number().int().positive().max(200).optional(),
});

const prepareSchema = z.object({
  worldSeasonId: z.string().min(1),
  expectedWorldSeasonUpdatedAt: z.string().min(1),
  referenceDate: z.string().min(1),
  baseSeed: z.string().min(1),
  profileSetVersionId: z.string().optional(),
  reason: z.string().min(1),
});

const executeSchema = z.object({
  confirmation: z.literal(true),
  reason: z.string().min(1),
});

const discardSchema = z.object({
  reason: z.string().min(1),
});

const createProfileSetSchema = z.object({
  name: z.string().min(1),
  description: z.string().nullable().optional(),
  reason: z.string().min(1),
});

const createVersionSchema = z.object({
  expectedLatestVersionId: z.string().min(1),
  profiles: z.array(
    z.object({
      countryId: z.string().min(1),
      profile: z.unknown(),
      namePoolVersionId: z.string().min(1),
    }),
  ),
  reason: z.string().min(1),
  activate: z.boolean().optional(),
});

const activateSchema = z.object({
  reason: z.string().min(1),
  expectedActiveVersionId: z.string().optional(),
});

const createNamePoolSchema = z.object({
  name: z.string().min(1),
  firstNames: z.array(z.string()),
  lastNames: z.array(z.string()),
  reason: z.string().min(1),
});

const createNamePoolVersionSchema = z.object({
  firstNames: z.array(z.string()),
  lastNames: z.array(z.string()),
  reason: z.string().min(1),
  expectedLatestVersionId: z.string().optional(),
});

export async function registerCommissionerYouthGenerationRoutes(app: FastifyInstance) {
  app.post('/api/commissioner/youth-generation/preview', async (request, reply) => {
    try {
      assertCommissionerAccess(request);
      const parsed = previewSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({
          error: 'InvalidYouthGenerationRequest',
          message: 'Invalid preview payload',
          details: parsed.error.issues,
        });
      }
      const item = await previewYouthGeneration({
        ...parsed.data,
        includePotential: true,
        includeQualityTier: true,
      });
      return detailResponse(item);
    } catch (err) {
      return sendError(reply, err);
    }
  });

  app.post('/api/commissioner/youth-generation/prepare', async (request, reply) => {
    try {
      assertCommissionerAccess(request);
      const parsed = prepareSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({
          error: 'InvalidYouthGenerationRequest',
          message: 'Invalid prepare payload',
          details: parsed.error.issues,
        });
      }
      const item = await prepareYouthGenerationRun(parsed.data, sourceFor(request));
      return detailResponse(item);
    } catch (err) {
      return sendError(reply, err);
    }
  });

  app.post(
    '/api/commissioner/youth-generation/runs/:runId/execute',
    async (request, reply) => {
      try {
        assertCommissionerAccess(request);
        const parsed = executeSchema.safeParse(request.body);
        if (!parsed.success) {
          return reply.status(400).send({
            error: 'InvalidYouthGenerationRequest',
            message: 'confirmation: true and reason are required',
            details: parsed.error.issues,
          });
        }
        const { runId } = request.params as { runId: string };
        const item = await executeYouthGenerationRun(runId, parsed.data, sourceFor(request));
        return detailResponse(item);
      } catch (err) {
        return sendError(reply, err);
      }
    },
  );

  app.delete('/api/commissioner/youth-generation/runs/:runId', async (request, reply) => {
    try {
      assertCommissionerAccess(request);
      const parsed = discardSchema.safeParse(request.body ?? {});
      if (!parsed.success) {
        return reply.status(400).send({
          error: 'InvalidYouthGenerationRequest',
          message: 'reason is required',
          details: parsed.error.issues,
        });
      }
      const { runId } = request.params as { runId: string };
      const item = await discardPreparedYouthGenerationRun(
        runId,
        parsed.data,
        sourceFor(request),
      );
      return detailResponse(item);
    } catch (err) {
      return sendError(reply, err);
    }
  });

  app.get(
    '/api/commissioner/youth-generation/runs/:runId/diagnostics',
    async (request, reply) => {
      try {
        assertCommissionerAccess(request);
        const { runId } = request.params as { runId: string };
        const item = await getYouthGenerationRunDiagnostics(runId);
        if (!item) {
          return reply.status(404).send({
            error: 'YouthGenerationRunNotFound',
            message: 'Youth generation run not found',
          });
        }
        return detailResponse(item);
      } catch (err) {
        return sendError(reply, err);
      }
    },
  );

  app.post('/api/commissioner/youth-generation/profile-sets', async (request, reply) => {
    try {
      assertCommissionerAccess(request);
      const parsed = createProfileSetSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({
          error: 'InvalidYouthGenerationRequest',
          message: 'Invalid profile set create payload',
          details: parsed.error.issues,
        });
      }
      const item = await createYouthProfileSet({
        ...parsed.data,
        source: sourceFor(request),
      });
      return detailResponse(item);
    } catch (err) {
      return sendError(reply, err);
    }
  });

  app.post(
    '/api/commissioner/youth-generation/profile-sets/:id/versions',
    async (request, reply) => {
      try {
        assertCommissionerAccess(request);
        const parsed = createVersionSchema.safeParse(request.body);
        if (!parsed.success) {
          return reply.status(400).send({
            error: 'InvalidYouthGenerationRequest',
            message: 'Invalid version create payload',
            details: parsed.error.issues,
          });
        }
        const { id } = request.params as { id: string };
        const item = await createYouthProfileSetVersion({
          profileSetId: id,
          ...parsed.data,
          source: sourceFor(request),
        });
        return detailResponse(item);
      } catch (err) {
        return sendError(reply, err);
      }
    },
  );

  app.post(
    '/api/commissioner/youth-generation/profile-set-versions/:versionId/activate',
    async (request, reply) => {
      try {
        assertCommissionerAccess(request);
        const parsed = activateSchema.safeParse(request.body);
        if (!parsed.success) {
          return reply.status(400).send({
            error: 'InvalidYouthGenerationRequest',
            message: 'Invalid activate payload',
            details: parsed.error.issues,
          });
        }
        const { versionId } = request.params as { versionId: string };
        const item = await activateYouthProfileSetVersion({
          versionId,
          ...parsed.data,
          source: sourceFor(request),
        });
        return detailResponse(item);
      } catch (err) {
        return sendError(reply, err);
      }
    },
  );

  app.post(
    '/api/commissioner/countries/:countryId/name-pools',
    async (request, reply) => {
      try {
        assertCommissionerAccess(request);
        const parsed = createNamePoolSchema.safeParse(request.body);
        if (!parsed.success) {
          return reply.status(400).send({
            error: 'InvalidYouthGenerationRequest',
            message: 'Invalid name pool create payload',
            details: parsed.error.issues,
          });
        }
        const { countryId } = request.params as { countryId: string };
        const item = await createCountryNamePool({
          countryId,
          ...parsed.data,
          source: sourceFor(request),
        });
        return detailResponse(item);
      } catch (err) {
        return sendError(reply, err);
      }
    },
  );

  app.post(
    '/api/commissioner/country-name-pools/:id/versions',
    async (request, reply) => {
      try {
        assertCommissionerAccess(request);
        const parsed = createNamePoolVersionSchema.safeParse(request.body);
        if (!parsed.success) {
          return reply.status(400).send({
            error: 'InvalidYouthGenerationRequest',
            message: 'Invalid name pool version payload',
            details: parsed.error.issues,
          });
        }
        const { id } = request.params as { id: string };
        const item = await createCountryNamePoolVersion({
          namePoolId: id,
          ...parsed.data,
          source: sourceFor(request),
        });
        return detailResponse(item);
      } catch (err) {
        return sendError(reply, err);
      }
    },
  );
}
