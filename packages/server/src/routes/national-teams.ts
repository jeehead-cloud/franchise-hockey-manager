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
import { detailResponse, paginatedResponse } from '../http.js';
import {
  NationalTeamHttpError,
  autoLineup,
  confirmRoster,
  createNationalTeam,
  generateCandidates,
  getCandidates,
  getLineup,
  getNationalTeam,
  getNationalTeamEdition,
  getNationalTeamEditionAudit,
  getReadiness,
  getRoster,
  getStaff,
  getTactics,
  listNationalTeamEditions,
  listNationalTeams,
  lockNationalTeamEdition,
  prepareNationalTeamEdition,
  reopenRoster,
  suggestRoster,
  updateLineup,
  updateNationalTeam,
  updateNationalTeamEditionRules,
  updateRoster,
  updateStaff,
  updateTactics,
} from '../services/national-teams.js';

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
  if (err instanceof NationalTeamHttpError) {
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
      error: 'InvalidNationalTeamRequest',
      message: 'Invalid national-team request',
      details: err.issues,
    });
  }
  throw err;
}

const reason = z.string().min(3);
const expectedUpdatedAt = z.string().datetime();

const rosterPlayerSchema = z.object({
  playerId: z.string().min(1),
  rosterRole: z.enum(['FORWARD', 'DEFENSE', 'GOALIE', 'RESERVE']),
  rosterOrder: z.number().int().positive(),
  jerseyNumber: z.number().int().min(1).max(99).nullable().optional(),
  captainRole: z.enum(['NONE', 'CAPTAIN', 'ALTERNATE']).optional(),
  selectionSource: z.enum(['SUGGESTED', 'MANUAL', 'IMPORTED']).optional(),
  positionSnapshot: z.string().optional(),
});

const lineupSlotSchema = z.object({
  unitType: z.enum(['FORWARD_LINE', 'DEFENSE_PAIR', 'GOALIE', 'PP', 'PK', 'OT']),
  unitNumber: z.number().int().positive(),
  slotType: z.enum([
    'LW',
    'C',
    'RW',
    'LD',
    'RD',
    'STARTER',
    'BACKUP',
    'THIRD',
    'F1',
    'F2',
    'F3',
    'D1',
    'D2',
  ]),
  playerId: z.string().min(1),
  slotOrder: z.number().int().positive(),
});

export async function registerNationalTeamRoutes(app: FastifyInstance) {
  app.get('/api/national-teams', async (request, reply) => {
    try {
      const q = request.query as Record<string, string | undefined>;
      const result = await listNationalTeams({
        page: q.page ? Number(q.page) : undefined,
        pageSize: q.pageSize ? Number(q.pageSize) : undefined,
        countryId: q.countryId,
        category: q.category as 'SENIOR_MEN' | 'JUNIOR_U20' | undefined,
        status: q.status as 'ACTIVE' | 'INACTIVE' | undefined,
        search: q.search,
      });
      return reply.send(
        paginatedResponse({
          items: result.items,
          total: result.total,
          page: result.page,
          pageSize: result.pageSize,
        }),
      );
    } catch (err) {
      return sendError(reply, err);
    }
  });

  app.get('/api/national-teams/:id', async (request, reply) => {
    try {
      const item = await getNationalTeam((request.params as { id: string }).id);
      if (!item) {
        return reply.status(404).send({
          error: 'NationalTeamNotFound',
          message: 'National team not found',
        });
      }
      return reply.send(detailResponse(item));
    } catch (err) {
      return sendError(reply, err);
    }
  });

  app.get('/api/national-team-editions', async (request, reply) => {
    try {
      const q = request.query as Record<string, string | undefined>;
      const result = await listNationalTeamEditions({
        page: q.page ? Number(q.page) : undefined,
        pageSize: q.pageSize ? Number(q.pageSize) : undefined,
        nationalTeamProfileId: q.nationalTeamProfileId ?? q.nationalTeamId,
        competitionEditionId: q.competitionEditionId,
        status: q.status as
          | 'PLANNED'
          | 'PREPARING'
          | 'READY'
          | 'LOCKED'
          | 'CANCELLED'
          | undefined,
      });
      return reply.send(
        paginatedResponse({
          items: result.items,
          total: result.total,
          page: result.page,
          pageSize: result.pageSize,
        }),
      );
    } catch (err) {
      return sendError(reply, err);
    }
  });

  app.get('/api/national-team-editions/:id', async (request, reply) => {
    try {
      const item = await getNationalTeamEdition((request.params as { id: string }).id);
      if (!item) {
        return reply.status(404).send({
          error: 'NationalTeamEditionNotFound',
          message: 'National-team edition not found',
        });
      }
      return reply.send(detailResponse(item));
    } catch (err) {
      return sendError(reply, err);
    }
  });

  app.get('/api/national-team-editions/:id/candidates', async (request, reply) => {
    try {
      const item = await getCandidates((request.params as { id: string }).id);
      if (!item) {
        return reply.status(404).send({
          error: 'NationalTeamEditionNotFound',
          message: 'National-team edition not found',
        });
      }
      return reply.send(detailResponse(item));
    } catch (err) {
      return sendError(reply, err);
    }
  });

  app.get('/api/national-team-editions/:id/roster', async (request, reply) => {
    try {
      const item = await getRoster((request.params as { id: string }).id);
      if (!item) {
        return reply.status(404).send({
          error: 'NationalTeamEditionNotFound',
          message: 'National-team edition not found',
        });
      }
      return reply.send(detailResponse(item));
    } catch (err) {
      return sendError(reply, err);
    }
  });

  app.get('/api/national-team-editions/:id/staff', async (request, reply) => {
    try {
      const item = await getStaff((request.params as { id: string }).id);
      if (!item) {
        return reply.status(404).send({
          error: 'NationalTeamEditionNotFound',
          message: 'National-team edition not found',
        });
      }
      return reply.send(detailResponse(item));
    } catch (err) {
      return sendError(reply, err);
    }
  });

  app.get('/api/national-team-editions/:id/tactics', async (request, reply) => {
    try {
      const item = await getTactics((request.params as { id: string }).id);
      if (!item) {
        return reply.status(404).send({
          error: 'NationalTeamEditionNotFound',
          message: 'National-team edition not found',
        });
      }
      return reply.send(detailResponse(item));
    } catch (err) {
      return sendError(reply, err);
    }
  });

  app.get('/api/national-team-editions/:id/lineup', async (request, reply) => {
    try {
      const item = await getLineup((request.params as { id: string }).id);
      if (!item) {
        return reply.status(404).send({
          error: 'NationalTeamEditionNotFound',
          message: 'National-team edition not found',
        });
      }
      return reply.send(detailResponse(item));
    } catch (err) {
      return sendError(reply, err);
    }
  });

  app.get('/api/national-team-editions/:id/readiness', async (request, reply) => {
    try {
      const item = await getReadiness((request.params as { id: string }).id);
      if (!item) {
        return reply.status(404).send({
          error: 'NationalTeamEditionNotFound',
          message: 'National-team edition not found',
        });
      }
      return reply.send(detailResponse(item));
    } catch (err) {
      return sendError(reply, err);
    }
  });

  app.post('/api/commissioner/national-teams', async (request, reply) => {
    try {
      assertCommissionerAccess(request);
      const body = z
        .object({
          countryId: z.string().min(1),
          category: z.enum(['SENIOR_MEN', 'JUNIOR_U20']),
          displayName: z.string().min(1),
          shortName: z.string().nullable().optional(),
          reason,
          defaultRosterRules: z.unknown().optional(),
        })
        .parse(request.body);
      const item = await createNationalTeam(body, sourceFor(request));
      return reply.status(201).send(detailResponse(item));
    } catch (err) {
      return sendError(reply, err);
    }
  });

  app.patch('/api/commissioner/national-teams/:id', async (request, reply) => {
    try {
      assertCommissionerAccess(request);
      const body = z
        .object({
          expectedUpdatedAt,
          reason,
          displayName: z.string().min(1).optional(),
          shortName: z.string().nullable().optional(),
          status: z.enum(['ACTIVE', 'INACTIVE']).optional(),
          defaultRosterRules: z.unknown().optional(),
          defaultTacticsText: z.string().nullable().optional(),
        })
        .parse(request.body);
      const item = await updateNationalTeam(
        (request.params as { id: string }).id,
        body,
        sourceFor(request),
      );
      return reply.send(detailResponse(item));
    } catch (err) {
      return sendError(reply, err);
    }
  });

  app.post(
    '/api/commissioner/competition-editions/:editionId/national-teams/:nationalTeamId/prepare',
    async (request, reply) => {
      try {
        assertCommissionerAccess(request);
        const params = request.params as { editionId: string; nationalTeamId: string };
        const body = z
          .object({
            expectedUpdatedAt,
            reason,
            rules: z.unknown().optional(),
          })
          .parse(request.body);
        const item = await prepareNationalTeamEdition(
          params.editionId,
          params.nationalTeamId,
          body,
          sourceFor(request),
        );
        return reply.status(201).send(detailResponse(item));
      } catch (err) {
        return sendError(reply, err);
      }
    },
  );

  app.patch('/api/commissioner/national-team-editions/:id/rules', async (request, reply) => {
    try {
      assertCommissionerAccess(request);
      const body = z
        .object({
          expectedUpdatedAt,
          reason,
          rules: z.unknown(),
        })
        .parse(request.body);
      const item = await updateNationalTeamEditionRules(
        (request.params as { id: string }).id,
        body,
        sourceFor(request),
      );
      return reply.send(detailResponse(item));
    } catch (err) {
      return sendError(reply, err);
    }
  });

  app.post(
    '/api/commissioner/national-team-editions/:id/generate-candidates',
    async (request, reply) => {
      try {
        assertCommissionerAccess(request);
        const body = z.object({ expectedUpdatedAt, reason }).parse(request.body);
        const item = await generateCandidates(
          (request.params as { id: string }).id,
          body,
          sourceFor(request),
        );
        return reply.send(detailResponse(item));
      } catch (err) {
        return sendError(reply, err);
      }
    },
  );

  app.post(
    '/api/commissioner/national-team-editions/:id/suggest-roster',
    async (request, reply) => {
      try {
        assertCommissionerAccess(request);
        const body = z
          .object({
            expectedUpdatedAt,
            reason,
            targetRosterSize: z.number().int().positive().optional(),
          })
          .parse(request.body);
        const item = await suggestRoster(
          (request.params as { id: string }).id,
          body,
          sourceFor(request),
        );
        return reply.send(detailResponse(item));
      } catch (err) {
        return sendError(reply, err);
      }
    },
  );

  app.patch('/api/commissioner/national-team-editions/:id/roster', async (request, reply) => {
    try {
      assertCommissionerAccess(request);
      const body = z
        .object({
          expectedUpdatedAt,
          reason,
          roster: z.array(rosterPlayerSchema).min(1),
        })
        .parse(request.body);
      const item = await updateRoster(
        (request.params as { id: string }).id,
        body,
        sourceFor(request),
      );
      return reply.send(detailResponse(item));
    } catch (err) {
      return sendError(reply, err);
    }
  });

  app.post(
    '/api/commissioner/national-team-editions/:id/confirm-roster',
    async (request, reply) => {
      try {
        assertCommissionerAccess(request);
        const body = z.object({ expectedUpdatedAt, reason }).parse(request.body);
        const item = await confirmRoster(
          (request.params as { id: string }).id,
          body,
          sourceFor(request),
        );
        return reply.send(detailResponse(item));
      } catch (err) {
        return sendError(reply, err);
      }
    },
  );

  app.post(
    '/api/commissioner/national-team-editions/:id/reopen-roster',
    async (request, reply) => {
      try {
        assertCommissionerAccess(request);
        const body = z.object({ expectedUpdatedAt, reason }).parse(request.body);
        const item = await reopenRoster(
          (request.params as { id: string }).id,
          body,
          sourceFor(request),
        );
        return reply.send(detailResponse(item));
      } catch (err) {
        return sendError(reply, err);
      }
    },
  );

  app.patch('/api/commissioner/national-team-editions/:id/staff', async (request, reply) => {
    try {
      assertCommissionerAccess(request);
      const body = z
        .object({
          expectedUpdatedAt,
          reason,
          staff: z
            .array(
              z.object({
                sourceCoachId: z.string().min(1),
                role: z.enum(['HEAD_COACH', 'ASSISTANT_COACH', 'GOALIE_COACH']),
                assignmentOrder: z.number().int().positive().optional(),
              }),
            )
            .min(1),
        })
        .parse(request.body);
      const item = await updateStaff(
        (request.params as { id: string }).id,
        body,
        sourceFor(request),
      );
      return reply.send(detailResponse(item));
    } catch (err) {
      return sendError(reply, err);
    }
  });

  app.patch('/api/commissioner/national-team-editions/:id/tactics', async (request, reply) => {
    try {
      assertCommissionerAccess(request);
      const body = z
        .object({
          expectedUpdatedAt,
          reason,
          tacticalStyle: z.enum([
            'COMBINATIONAL',
            'PHYSICAL',
            'SPEED',
            'SYSTEM',
            'FORECHECKING',
          ]),
          tactics: z.unknown().optional(),
        })
        .parse(request.body);
      const item = await updateTactics(
        (request.params as { id: string }).id,
        body,
        sourceFor(request),
      );
      return reply.send(detailResponse(item));
    } catch (err) {
      return sendError(reply, err);
    }
  });

  app.post(
    '/api/commissioner/national-team-editions/:id/auto-lineup',
    async (request, reply) => {
      try {
        assertCommissionerAccess(request);
        const body = z.object({ expectedUpdatedAt, reason }).parse(request.body);
        const item = await autoLineup(
          (request.params as { id: string }).id,
          body,
          sourceFor(request),
        );
        return reply.send(detailResponse(item));
      } catch (err) {
        return sendError(reply, err);
      }
    },
  );

  app.patch('/api/commissioner/national-team-editions/:id/lineup', async (request, reply) => {
    try {
      assertCommissionerAccess(request);
      const body = z
        .object({
          expectedUpdatedAt,
          reason,
          slots: z.array(lineupSlotSchema).min(1),
        })
        .parse(request.body);
      const item = await updateLineup(
        (request.params as { id: string }).id,
        body,
        sourceFor(request),
      );
      return reply.send(detailResponse(item));
    } catch (err) {
      return sendError(reply, err);
    }
  });

  app.post('/api/commissioner/national-team-editions/:id/lock', async (request, reply) => {
    try {
      assertCommissionerAccess(request);
      const body = z
        .object({
          expectedUpdatedAt,
          reason,
          confirmation: z.literal(true).optional(),
        })
        .parse(request.body);
      const item = await lockNationalTeamEdition(
        (request.params as { id: string }).id,
        body,
        sourceFor(request),
      );
      return reply.send(detailResponse(item));
    } catch (err) {
      return sendError(reply, err);
    }
  });

  app.get('/api/commissioner/national-team-editions/:id/audit', async (request, reply) => {
    try {
      assertCommissionerAccess(request);
      const q = request.query as Record<string, string | undefined>;
      const result = await getNationalTeamEditionAudit((request.params as { id: string }).id, {
        page: q.page ? Number(q.page) : undefined,
        pageSize: q.pageSize ? Number(q.pageSize) : undefined,
      });
      if (!result) {
        return reply.status(404).send({
          error: 'NationalTeamEditionNotFound',
          message: 'National-team edition not found',
        });
      }
      return reply.send(
        paginatedResponse({
          items: result.items,
          total: result.total,
          page: result.page,
          pageSize: result.pageSize,
        }),
      );
    } catch (err) {
      return sendError(reply, err);
    }
  });
}
