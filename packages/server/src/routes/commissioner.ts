import type { FastifyInstance } from 'fastify';
import {
  areCommissionerWritesEnabled,
  hasCommissionerHeader,
} from '../commissioner/gate.js';
import {
  CommissionerHttpError,
  commissionerErrorBody,
} from '../commissioner/errors.js';
import { commissionerPlayerEditSchema } from '../commissioner/schemas.js';
import {
  getCommissionerPlayer,
  listPlayerAudit,
  updateCommissionerPlayer,
} from '../services/commissioner-players.js';
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
}
