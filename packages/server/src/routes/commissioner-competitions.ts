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
import { detailResponse, notFound, paginatedResponse } from '../http.js';
import * as commissionerCompetitions from '../services/commissioner-competitions.js';

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

function sendCommissionerError(
  reply: { status: (code: number) => { send: (body: unknown) => unknown } },
  err: unknown,
) {
  if (err instanceof CommissionerHttpError) {
    return reply.status(err.statusCode).send(commissionerErrorBody(err));
  }
  throw err;
}

const sourceFor = (request: { headers: Record<string, string | string[] | undefined> }) =>
  (Array.isArray(request.headers['x-fhm-commissioner-source'])
    ? request.headers['x-fhm-commissioner-source'][0]
    : request.headers['x-fhm-commissioner-source']) === 'ui'
    ? ('COMMISSIONER_UI' as const)
    : ('COMMISSIONER_API' as const);

const reason = z.string().min(3);
const expectedUpdatedAt = z.string().datetime();

const createEditionSchema = z.object({
  worldSeasonId: z.string().min(1),
  displayName: z.string().min(1),
  templateKey: z
    .enum(['SIMPLE_LEAGUE', 'SIMPLE_ROUND_ROBIN', 'GROUPS_AND_KNOCKOUT', 'BEST_OF_SERIES_PLAYOFF'])
    .optional(),
  editionNumber: z.number().int().positive().nullable().optional(),
  reason,
});

const transitionSchema = z.object({
  expectedUpdatedAt,
  targetStatus: z.enum([
    'PLANNED',
    'PREPARING',
    'READY',
    'ACTIVE',
    'COMPLETED',
    'ARCHIVED',
    'CANCELLED',
  ]),
  reason,
});

export async function registerCommissionerCompetitionRoutes(app: FastifyInstance) {
  app.patch('/api/commissioner/competitions/:id', async (request, reply) => {
    try {
      assertCommissionerAccess(request);
      const body = z
        .object({
          expectedUpdatedAt,
          reason,
          name: z.string().min(1).optional(),
          shortName: z.string().nullable().optional(),
          simulationLevel: z.enum(['DETAILED', 'AGGREGATED']).nullable().optional(),
          countryId: z.string().nullable().optional(),
          leagueId: z.string().nullable().optional(),
          defaultRules: z.unknown().optional(),
        })
        .parse(request.body);
      const item = await commissionerCompetitions.updateCompetition(
        (request.params as { id: string }).id,
        body,
        sourceFor(request),
      );
      return detailResponse(item);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return reply.status(400).send({ error: 'InvalidRequest', message: err.message });
      }
      return sendCommissionerError(reply, err);
    }
  });

  app.post('/api/commissioner/competitions/:id/editions', async (request, reply) => {
    try {
      assertCommissionerAccess(request);
      const body = createEditionSchema.parse(request.body);
      const item = await commissionerCompetitions.createEdition(
        (request.params as { id: string }).id,
        body,
        sourceFor(request),
      );
      return reply.status(201).send(detailResponse(item));
    } catch (err) {
      if (err instanceof z.ZodError) {
        return reply.status(400).send({ error: 'InvalidRequest', message: err.message });
      }
      return sendCommissionerError(reply, err);
    }
  });

  app.get('/api/commissioner/competition-editions/:id', async (request, reply) => {
    try {
      assertCommissionerAccess(request);
      const item = await commissionerCompetitions.getCommissionerEdition(
        (request.params as { id: string }).id,
      );
      if (!item) return reply.status(404).send(notFound('CompetitionEdition'));
      return detailResponse(item);
    } catch (err) {
      return sendCommissionerError(reply, err);
    }
  });

  app.patch('/api/commissioner/competition-editions/:id', async (request, reply) => {
    try {
      assertCommissionerAccess(request);
      const body = z
        .object({
          expectedUpdatedAt,
          reason,
          displayName: z.string().min(1).optional(),
          editionNumber: z.number().int().positive().nullable().optional(),
          rules: z.unknown().optional(),
        })
        .parse(request.body);
      const id = (request.params as { id: string }).id;
      if (body.rules !== undefined) {
        const item = await commissionerCompetitions.updateEditionRules(
          id,
          {
            expectedUpdatedAt: body.expectedUpdatedAt,
            reason: body.reason,
            rules: body.rules,
          },
          sourceFor(request),
        );
        return detailResponse(item);
      }
      const item = await commissionerCompetitions.updateEdition(id, body, sourceFor(request));
      return detailResponse(item);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return reply.status(400).send({ error: 'InvalidRequest', message: err.message });
      }
      return sendCommissionerError(reply, err);
    }
  });

  app.post('/api/commissioner/competition-editions/:id/transition', async (request, reply) => {
    try {
      assertCommissionerAccess(request);
      const body = transitionSchema.parse(request.body);
      const item = await commissionerCompetitions.transitionEdition(
        (request.params as { id: string }).id,
        body,
        sourceFor(request),
      );
      return detailResponse(item);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return reply.status(400).send({ error: 'InvalidRequest', message: err.message });
      }
      return sendCommissionerError(reply, err);
    }
  });

  app.post('/api/commissioner/competition-editions/:id/validate', async (request, reply) => {
    try {
      assertCommissionerAccess(request);
      const item = await commissionerCompetitions.getCommissionerEdition(
        (request.params as { id: string }).id,
      );
      if (!item) return reply.status(404).send(notFound('CompetitionEdition'));
      return detailResponse({ readiness: item.readiness, rulesHash: item.rulesHash });
    } catch (err) {
      return sendCommissionerError(reply, err);
    }
  });

  app.post('/api/commissioner/competition-editions/:id/participants', async (request, reply) => {
    try {
      assertCommissionerAccess(request);
      const body = z
        .object({
          expectedUpdatedAt,
          reason,
          teamId: z.string().min(1),
          status: z.enum(['INVITED', 'CONFIRMED']).optional(),
          seed: z.number().int().nullable().optional(),
          groupKey: z.string().nullable().optional(),
          source: z
            .enum(['MANUAL', 'LEAGUE_MEMBERSHIP', 'HOST', 'DEFENDING_CHAMPION', 'IMPORTED'])
            .optional(),
        })
        .parse(request.body);
      const item = await commissionerCompetitions.addParticipant(
        (request.params as { id: string }).id,
        body,
        sourceFor(request),
      );
      return reply.status(201).send(detailResponse(item));
    } catch (err) {
      if (err instanceof z.ZodError) {
        return reply.status(400).send({ error: 'InvalidRequest', message: err.message });
      }
      return sendCommissionerError(reply, err);
    }
  });

  app.patch(
    '/api/commissioner/competition-editions/:id/participants/:participantId',
    async (request, reply) => {
      try {
        assertCommissionerAccess(request);
        const params = request.params as { id: string; participantId: string };
        const body = z
          .object({
            expectedUpdatedAt,
            reason,
            status: z.enum(['INVITED', 'CONFIRMED', 'WITHDRAWN']).optional(),
            seed: z.number().int().nullable().optional(),
            groupKey: z.string().nullable().optional(),
            participantOrder: z.number().int().positive().optional(),
          })
          .parse(request.body);
        const item = await commissionerCompetitions.updateParticipant(
          params.id,
          params.participantId,
          body,
          sourceFor(request),
        );
        return detailResponse(item);
      } catch (err) {
        if (err instanceof z.ZodError) {
          return reply.status(400).send({ error: 'InvalidRequest', message: err.message });
        }
        return sendCommissionerError(reply, err);
      }
    },
  );

  app.delete(
    '/api/commissioner/competition-editions/:id/participants/:participantId',
    async (request, reply) => {
      try {
        assertCommissionerAccess(request);
        const params = request.params as { id: string; participantId: string };
        const body = z.object({ expectedUpdatedAt, reason }).parse(request.body ?? {});
        const item = await commissionerCompetitions.removeParticipant(
          params.id,
          params.participantId,
          body,
          sourceFor(request),
        );
        return detailResponse(item);
      } catch (err) {
        if (err instanceof z.ZodError) {
          return reply.status(400).send({ error: 'InvalidRequest', message: err.message });
        }
        return sendCommissionerError(reply, err);
      }
    },
  );

  app.post(
    '/api/commissioner/competition-editions/:id/participants/from-league',
    async (request, reply) => {
      try {
        assertCommissionerAccess(request);
        const body = z
          .object({
            expectedUpdatedAt,
            reason,
            leagueId: z.string().min(1),
            status: z.enum(['INVITED', 'CONFIRMED']).optional(),
          })
          .parse(request.body);
        const item = await commissionerCompetitions.addParticipantsFromLeague(
          (request.params as { id: string }).id,
          body,
          sourceFor(request),
        );
        return detailResponse(item);
      } catch (err) {
        if (err instanceof z.ZodError) {
          return reply.status(400).send({ error: 'InvalidRequest', message: err.message });
        }
        return sendCommissionerError(reply, err);
      }
    },
  );

  app.post('/api/commissioner/competition-editions/:id/stages', async (request, reply) => {
    try {
      assertCommissionerAccess(request);
      const body = z
        .object({
          expectedUpdatedAt,
          reason,
          name: z.string().min(1),
          stageType: z.enum([
            'REGULAR_SEASON',
            'ROUND_ROBIN',
            'GROUP_STAGE',
            'KNOCKOUT',
            'BEST_OF_SERIES',
            'FINAL_RANKING',
          ]),
          stageOrder: z.number().int().positive(),
          participantSource: z.enum([
            'EDITION_PARTICIPANTS',
            'PREVIOUS_STAGE_QUALIFIERS',
            'MANUAL',
            'FIXED_CONFIG',
          ]),
          sourceStageId: z.string().nullable().optional(),
          expectedQualifierCount: z.number().int().positive().nullable().optional(),
          config: z.record(z.string(), z.unknown()),
        })
        .parse(request.body);
      const item = await commissionerCompetitions.createStage(
        (request.params as { id: string }).id,
        body,
        sourceFor(request),
      );
      return reply.status(201).send(detailResponse(item));
    } catch (err) {
      if (err instanceof z.ZodError) {
        return reply.status(400).send({ error: 'InvalidRequest', message: err.message });
      }
      return sendCommissionerError(reply, err);
    }
  });

  app.patch('/api/commissioner/competition-stages/:id', async (request, reply) => {
    try {
      assertCommissionerAccess(request);
      const body = z
        .object({
          expectedUpdatedAt,
          reason,
          name: z.string().min(1).optional(),
          stageOrder: z.number().int().positive().optional(),
          participantSource: z
            .enum([
              'EDITION_PARTICIPANTS',
              'PREVIOUS_STAGE_QUALIFIERS',
              'MANUAL',
              'FIXED_CONFIG',
            ])
            .optional(),
          sourceStageId: z.string().nullable().optional(),
          expectedQualifierCount: z.number().int().positive().nullable().optional(),
          config: z.record(z.string(), z.unknown()).optional(),
          status: z.enum(['PLANNED', 'READY', 'CANCELLED']).optional(),
        })
        .parse(request.body);
      const item = await commissionerCompetitions.updateStage(
        (request.params as { id: string }).id,
        body,
        sourceFor(request),
      );
      return detailResponse(item);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return reply.status(400).send({ error: 'InvalidRequest', message: err.message });
      }
      return sendCommissionerError(reply, err);
    }
  });

  app.delete('/api/commissioner/competition-stages/:id', async (request, reply) => {
    try {
      assertCommissionerAccess(request);
      const body = z.object({ expectedUpdatedAt, reason }).parse(request.body ?? {});
      const item = await commissionerCompetitions.removeStage(
        (request.params as { id: string }).id,
        body,
        sourceFor(request),
      );
      return detailResponse(item);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return reply.status(400).send({ error: 'InvalidRequest', message: err.message });
      }
      return sendCommissionerError(reply, err);
    }
  });

  app.post('/api/commissioner/competition-editions/:id/stages/reorder', async (request, reply) => {
    try {
      assertCommissionerAccess(request);
      const body = z
        .object({
          expectedUpdatedAt,
          reason,
          orderedStageIds: z.array(z.string().min(1)).min(1),
        })
        .parse(request.body);
      const item = await commissionerCompetitions.reorderStages(
        (request.params as { id: string }).id,
        body,
        sourceFor(request),
      );
      return detailResponse(item);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return reply.status(400).send({ error: 'InvalidRequest', message: err.message });
      }
      return sendCommissionerError(reply, err);
    }
  });

  app.post('/api/commissioner/competition-stages/:id/participants', async (request, reply) => {
    try {
      assertCommissionerAccess(request);
      const body = z
        .object({
          expectedUpdatedAt,
          reason,
          participantIds: z.array(z.string().min(1)),
        })
        .parse(request.body);
      const item = await commissionerCompetitions.setStageParticipants(
        (request.params as { id: string }).id,
        body,
        sourceFor(request),
      );
      return detailResponse(item);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return reply.status(400).send({ error: 'InvalidRequest', message: err.message });
      }
      return sendCommissionerError(reply, err);
    }
  });

  app.get('/api/commissioner/competition-editions/:id/audit', async (request, reply) => {
    try {
      assertCommissionerAccess(request);
      const result = await commissionerCompetitions.listEditionAudit(
        (request.params as { id: string }).id,
        request.query as Record<string, unknown>,
      );
      return paginatedResponse(result);
    } catch (err) {
      return sendCommissionerError(reply, err);
    }
  });

  app.post('/api/commissioner/competition-editions/:id/archive', async (request, reply) => {
    try {
      assertCommissionerAccess(request);
      const body = z
        .object({
          expectedUpdatedAt,
          reason,
        })
        .parse(request.body);
      const { archiveCompetitionEdition } = await import(
        '../services/competition-archive-persistence.js'
      );
      const result = await archiveCompetitionEdition(
        (request.params as { id: string }).id,
        body,
        sourceFor(request),
      );
      return reply.status(result.alreadyArchived ? 200 : 201).send({ item: result });
    } catch (err) {
      if (err instanceof z.ZodError) {
        return reply.status(400).send({
          error: 'InvalidArchiveRequest',
          message: err.message,
        });
      }
      return sendCommissionerError(reply, err);
    }
  });

  app.get('/api/commissioner/competition-archives/:id/versions', async (request, reply) => {
    try {
      assertCommissionerAccess(request);
      const { listArchiveVersions } = await import(
        '../services/competition-archive-persistence.js'
      );
      const items = await listArchiveVersions((request.params as { id: string }).id);
      if (!items) {
        return reply.status(404).send({
          error: 'CompetitionArchiveNotFound',
          message: 'Archive not found',
        });
      }
      return detailResponse(items);
    } catch (err) {
      return sendCommissionerError(reply, err);
    }
  });

  app.get('/api/commissioner/competition-archives/:id/audit', async (request, reply) => {
    try {
      assertCommissionerAccess(request);
      const archiveId = (request.params as { id: string }).id;
      const { prisma } = await import('../db/client.js');
      const archive = await prisma.competitionArchive.findUnique({ where: { id: archiveId } });
      if (!archive) {
        return reply.status(404).send({
          error: 'CompetitionArchiveNotFound',
          message: 'Archive not found',
        });
      }
      const result = await commissionerCompetitions.listEditionAudit(
        archive.competitionEditionId,
        request.query as Record<string, unknown>,
      );
      return paginatedResponse(result);
    } catch (err) {
      return sendCommissionerError(reply, err);
    }
  });
}
