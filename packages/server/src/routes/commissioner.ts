import type { FastifyInstance } from 'fastify';
import {
  areCommissionerWritesEnabled,
  hasCommissionerHeader,
} from '../commissioner/gate.js';
import {
  CommissionerHttpError,
  commissionerErrorBody,
} from '../commissioner/errors.js';
import {
  commissionerCoachCreateSchema,
  commissionerCoachEditSchema,
  commissionerPlayerEditSchema,
  commissionerRosterStatusSchema,
  commissionerTeamSetupSchema,
  commissionerLineupSaveSchema,
  commissionerLineupAutoFillSchema,
} from '../commissioner/schemas.js';
import {
  getCommissionerPlayer,
  listPlayerAudit,
  updateCommissionerPlayer,
} from '../services/commissioner-players.js';
import {
  createCommissionerCoach,
  getCommissionerCoach,
  listCoachAudit,
  updateCommissionerCoach,
} from '../services/commissioner-coaches.js';
import {
  getCommissionerTeamSetup,
  listTeamAudit,
  updateCommissionerTeamSetup,
  updateTeamRosterStatus,
} from '../services/commissioner-teams.js';
import {
  autoFillCommissionerTeamLineup,
  getCommissionerTeamLineup,
  listLineupAudit,
  saveCommissionerTeamLineup,
} from '../services/commissioner-lineups.js';
import { detailResponse, notFound, paginatedResponse } from '../http.js';

function assertCommissionerAccess(request: { headers: Record<string, string | string[] | undefined> }) {
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

function sendCommissionerError(reply: { status: (code: number) => { send: (body: unknown) => unknown } }, err: unknown) {
  if (err instanceof CommissionerHttpError) {
    return reply.status(err.statusCode).send(commissionerErrorBody(err));
  }
  throw err;
}

export async function registerCommissionerRoutes(app: FastifyInstance) {
  app.get('/api/commissioner/status', async () => ({
    writesEnabled: areCommissionerWritesEnabled(),
    header: 'X-FHM-Commissioner-Mode',
    requiredValue: 'enabled',
    note: 'Local sandbox safety boundary only — not authentication or authorization.',
  }));

  app.get('/api/commissioner/players/:id', async (request, reply) => {
    try {
      assertCommissionerAccess(request);
      const { id } = request.params as { id: string };
      const item = await getCommissionerPlayer(id);
      if (!item) return reply.status(404).send(notFound('Player'));
      return detailResponse(item);
    } catch (err) {
      return sendCommissionerError(reply, err);
    }
  });

  app.patch('/api/commissioner/players/:id', async (request, reply) => {
    try {
      assertCommissionerAccess(request);
      const { id } = request.params as { id: string };
      const parsed = commissionerPlayerEditSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({
          error: 'InvalidRequest',
          message: 'Invalid Commissioner player edit payload',
          details: parsed.error.issues.map((i) => ({
            path: i.path.join('.'),
            message: i.message,
          })),
        });
      }
      const sourceHeader = request.headers['x-fhm-commissioner-source'];
      const source =
        (Array.isArray(sourceHeader) ? sourceHeader[0] : sourceHeader) === 'ui'
          ? 'COMMISSIONER_UI'
          : 'COMMISSIONER_API';
      const result = await updateCommissionerPlayer(id, parsed.data, source);
      return result;
    } catch (err) {
      return sendCommissionerError(reply, err);
    }
  });

  app.get('/api/commissioner/players/:id/audit', async (request, reply) => {
    try {
      assertCommissionerAccess(request);
      const { id } = request.params as { id: string };
      const result = await listPlayerAudit(id, request.query as Record<string, unknown>);
      if (!result) return reply.status(404).send(notFound('Player'));
      return paginatedResponse(result);
    } catch (err) {
      return sendCommissionerError(reply, err);
    }
  });

  const sourceFor = (request: { headers: Record<string, string | string[] | undefined> }) =>
    (Array.isArray(request.headers['x-fhm-commissioner-source']) ? request.headers['x-fhm-commissioner-source'][0] : request.headers['x-fhm-commissioner-source']) === 'ui'
      ? 'COMMISSIONER_UI' as const : 'COMMISSIONER_API' as const;
  const invalid = (reply: { status: (code: number) => { send: (body: unknown) => unknown } }, message: string, issues: { path: PropertyKey[]; message: string }[]) =>
    reply.status(400).send({ error: 'InvalidRequest', message, details: issues.map((i) => ({ path: i.path.join('.'), message: i.message })) });

  app.get('/api/commissioner/coaches/:id', async (request, reply) => {
    try { assertCommissionerAccess(request); const item = await getCommissionerCoach((request.params as { id: string }).id); return item ? detailResponse(item) : reply.status(404).send(notFound('Coach')); } catch (err) { return sendCommissionerError(reply, err); }
  });
  app.post('/api/commissioner/coaches', async (request, reply) => {
    try { assertCommissionerAccess(request); const parsed = commissionerCoachCreateSchema.safeParse(request.body); if (!parsed.success) return invalid(reply, 'Invalid Commissioner coach create payload', parsed.error.issues); return createCommissionerCoach(parsed.data, sourceFor(request)); } catch (err) { return sendCommissionerError(reply, err); }
  });
  app.patch('/api/commissioner/coaches/:id', async (request, reply) => {
    try { assertCommissionerAccess(request); const parsed = commissionerCoachEditSchema.safeParse(request.body); if (!parsed.success) return invalid(reply, 'Invalid Commissioner coach edit payload', parsed.error.issues); return updateCommissionerCoach((request.params as { id: string }).id, parsed.data, sourceFor(request)); } catch (err) { return sendCommissionerError(reply, err); }
  });
  app.get('/api/commissioner/coaches/:id/audit', async (request, reply) => {
    try { assertCommissionerAccess(request); const result = await listCoachAudit((request.params as { id: string }).id, request.query as Record<string, unknown>); return result ? paginatedResponse(result) : reply.status(404).send(notFound('Coach')); } catch (err) { return sendCommissionerError(reply, err); }
  });
  app.get('/api/commissioner/teams/:id/setup', async (request, reply) => {
    try { assertCommissionerAccess(request); const item = await getCommissionerTeamSetup((request.params as { id: string }).id); return item ? detailResponse(item) : reply.status(404).send(notFound('Team')); } catch (err) { return sendCommissionerError(reply, err); }
  });
  app.patch('/api/commissioner/teams/:id/setup', async (request, reply) => {
    try { assertCommissionerAccess(request); const parsed = commissionerTeamSetupSchema.safeParse(request.body); if (!parsed.success) return invalid(reply, 'Invalid Commissioner team setup payload', parsed.error.issues); return updateCommissionerTeamSetup((request.params as { id: string }).id, parsed.data, sourceFor(request)); } catch (err) { return sendCommissionerError(reply, err); }
  });
  app.patch('/api/commissioner/teams/:id/roster-status', async (request, reply) => {
    try { assertCommissionerAccess(request); const parsed = commissionerRosterStatusSchema.safeParse(request.body); if (!parsed.success) return invalid(reply, 'Invalid roster status payload', parsed.error.issues); return updateTeamRosterStatus((request.params as { id: string }).id, parsed.data, sourceFor(request)); } catch (err) { return sendCommissionerError(reply, err); }
  });
  app.get('/api/commissioner/teams/:id/audit', async (request, reply) => {
    try { assertCommissionerAccess(request); const result = await listTeamAudit((request.params as { id: string }).id, request.query as Record<string, unknown>); return result ? paginatedResponse(result) : reply.status(404).send(notFound('Team')); } catch (err) { return sendCommissionerError(reply, err); }
  });

  app.get('/api/commissioner/teams/:id/lineup', async (request, reply) => {
    try {
      assertCommissionerAccess(request);
      const item = await getCommissionerTeamLineup((request.params as { id: string }).id);
      return item ? detailResponse(item) : reply.status(404).send(notFound('Team'));
    } catch (err) {
      return sendCommissionerError(reply, err);
    }
  });
  app.put('/api/commissioner/teams/:id/lineup', async (request, reply) => {
    try {
      assertCommissionerAccess(request);
      const parsed = commissionerLineupSaveSchema.safeParse(request.body);
      if (!parsed.success) return invalid(reply, 'Invalid lineup save payload', parsed.error.issues);
      const result = await saveCommissionerTeamLineup(
        (request.params as { id: string }).id,
        parsed.data,
        sourceFor(request),
      );
      return result ?? reply.status(404).send(notFound('Team'));
    } catch (err) {
      return sendCommissionerError(reply, err);
    }
  });
  app.post('/api/commissioner/teams/:id/lineup/auto-fill', async (request, reply) => {
    try {
      assertCommissionerAccess(request);
      const parsed = commissionerLineupAutoFillSchema.safeParse(request.body);
      if (!parsed.success) return invalid(reply, 'Invalid lineup auto-fill payload', parsed.error.issues);
      const result = await autoFillCommissionerTeamLineup(
        (request.params as { id: string }).id,
        parsed.data,
        sourceFor(request),
      );
      return result ?? reply.status(404).send(notFound('Team'));
    } catch (err) {
      return sendCommissionerError(reply, err);
    }
  });
  app.get('/api/commissioner/teams/:id/lineup/audit', async (request, reply) => {
    try {
      assertCommissionerAccess(request);
      const result = await listLineupAudit(
        (request.params as { id: string }).id,
        request.query as Record<string, unknown>,
      );
      return result ? paginatedResponse(result) : reply.status(404).send(notFound('Team'));
    } catch (err) {
      return sendCommissionerError(reply, err);
    }
  });
}
