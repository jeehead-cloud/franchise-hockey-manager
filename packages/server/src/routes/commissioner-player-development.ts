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
  activateDevelopmentVersion,
  createDevelopmentPreset,
  createDevelopmentPresetVersion,
} from '../services/player-development-config.js';
import {
  DevelopmentHttpError,
  discardPreparedDevelopmentRun,
  executeDevelopmentRun,
  getDevelopmentRunDiagnostics,
  prepareDevelopmentRun,
  previewDevelopment,
} from '../services/player-development.js';

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
  if (err instanceof DevelopmentHttpError) {
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
      error: 'InvalidPlayerDevelopmentRequest',
      message: 'Invalid player development request',
      details: err.issues,
    });
  }
  throw err;
}

const previewSchema = z.object({
  worldSeasonId: z.string().min(1),
  effectiveDate: z.string().min(1),
  baseSeed: z.string().min(1),
  configVersionId: z.string().optional(),
  includeRetiredPlayers: z.boolean().optional(),
  page: z.number().int().positive().optional(),
  pageSize: z.number().int().positive().max(200).optional(),
});

const prepareSchema = z.object({
  worldSeasonId: z.string().min(1),
  expectedWorldSeasonUpdatedAt: z.string().min(1),
  effectiveDate: z.string().min(1),
  baseSeed: z.string().min(1),
  configVersionId: z.string().optional(),
  reason: z.string().min(1),
  includeRetiredPlayers: z.boolean().optional(),
});

const executeSchema = z.object({
  confirmation: z.literal(true),
  reason: z.string().min(1),
});

const discardSchema = z.object({
  reason: z.string().min(1),
});

const createPresetSchema = z.object({
  name: z.string().min(1),
  description: z.string().nullable().optional(),
  reason: z.string().min(1),
});

const createVersionSchema = z.object({
  expectedLatestVersionId: z.string().min(1),
  config: z.unknown(),
  reason: z.string().min(1),
  activate: z.boolean().optional(),
});

const activateSchema = z.object({
  reason: z.string().min(1),
  expectedActiveVersionId: z.string().optional(),
});

export async function registerCommissionerPlayerDevelopmentRoutes(app: FastifyInstance) {
  app.post('/api/commissioner/player-development/preview', async (request, reply) => {
    try {
      assertCommissionerAccess(request);
      const parsed = previewSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({
          error: 'InvalidPlayerDevelopmentRequest',
          message: 'Invalid preview payload',
          details: parsed.error.issues,
        });
      }
      const item = await previewDevelopment({
        ...parsed.data,
        includePotential: true,
      });
      return detailResponse(item);
    } catch (err) {
      return sendError(reply, err);
    }
  });

  app.post('/api/commissioner/player-development/prepare', async (request, reply) => {
    try {
      assertCommissionerAccess(request);
      const parsed = prepareSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({
          error: 'InvalidPlayerDevelopmentRequest',
          message: 'Invalid prepare payload',
          details: parsed.error.issues,
        });
      }
      const item = await prepareDevelopmentRun(parsed.data, sourceFor(request));
      return detailResponse(item);
    } catch (err) {
      return sendError(reply, err);
    }
  });

  app.post(
    '/api/commissioner/player-development/runs/:runId/execute',
    async (request, reply) => {
      try {
        assertCommissionerAccess(request);
        const parsed = executeSchema.safeParse(request.body);
        if (!parsed.success) {
          return reply.status(400).send({
            error: 'InvalidPlayerDevelopmentRequest',
            message: 'confirmation: true and reason are required',
            details: parsed.error.issues,
          });
        }
        const { runId } = request.params as { runId: string };
        const item = await executeDevelopmentRun(runId, parsed.data, sourceFor(request));
        return detailResponse(item);
      } catch (err) {
        return sendError(reply, err);
      }
    },
  );

  app.delete(
    '/api/commissioner/player-development/runs/:runId',
    async (request, reply) => {
      try {
        assertCommissionerAccess(request);
        const parsed = discardSchema.safeParse(request.body ?? {});
        if (!parsed.success) {
          return reply.status(400).send({
            error: 'InvalidPlayerDevelopmentRequest',
            message: 'reason is required',
            details: parsed.error.issues,
          });
        }
        const { runId } = request.params as { runId: string };
        const item = await discardPreparedDevelopmentRun(
          runId,
          parsed.data,
          sourceFor(request),
        );
        return detailResponse(item);
      } catch (err) {
        return sendError(reply, err);
      }
    },
  );

  app.get(
    '/api/commissioner/player-development/runs/:runId/diagnostics',
    async (request, reply) => {
      try {
        assertCommissionerAccess(request);
        const { runId } = request.params as { runId: string };
        const item = await getDevelopmentRunDiagnostics(runId);
        if (!item) {
          return reply.status(404).send({
            error: 'PlayerDevelopmentRunNotFound',
            message: 'Development run not found',
          });
        }
        return detailResponse(item);
      } catch (err) {
        return sendError(reply, err);
      }
    },
  );

  app.post('/api/commissioner/player-development/configurations', async (request, reply) => {
    try {
      assertCommissionerAccess(request);
      const parsed = createPresetSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({
          error: 'InvalidPlayerDevelopmentRequest',
          message: 'Invalid configuration create payload',
          details: parsed.error.issues,
        });
      }
      const item = await createDevelopmentPreset({
        ...parsed.data,
        source: sourceFor(request),
      });
      return detailResponse(item);
    } catch (err) {
      return sendError(reply, err);
    }
  });

  app.post(
    '/api/commissioner/player-development/configurations/:presetId/versions',
    async (request, reply) => {
      try {
        assertCommissionerAccess(request);
        const parsed = createVersionSchema.safeParse(request.body);
        if (!parsed.success) {
          return reply.status(400).send({
            error: 'InvalidPlayerDevelopmentRequest',
            message: 'Invalid version create payload',
            details: parsed.error.issues,
          });
        }
        const { presetId } = request.params as { presetId: string };
        const item = await createDevelopmentPresetVersion({
          presetId,
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
    '/api/commissioner/player-development/configuration-versions/:versionId/activate',
    async (request, reply) => {
      try {
        assertCommissionerAccess(request);
        const parsed = activateSchema.safeParse(request.body);
        if (!parsed.success) {
          return reply.status(400).send({
            error: 'InvalidPlayerDevelopmentRequest',
            message: 'Invalid activate payload',
            details: parsed.error.issues,
          });
        }
        const { versionId } = request.params as { versionId: string };
        const item = await activateDevelopmentVersion({
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
}
