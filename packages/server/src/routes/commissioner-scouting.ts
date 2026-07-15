import type { FastifyInstance } from 'fastify';
import { Prisma } from '@prisma/client';
import { ScoutingConfigError } from '@fhm/engine';
import { z } from 'zod';
import { areCommissionerWritesEnabled, hasCommissionerHeader } from '../commissioner/gate.js';
import { CommissionerHttpError, commissionerErrorBody } from '../commissioner/errors.js';
import { detailResponse, listResponse } from '../http.js';
import { prisma } from '../db/client.js';
import { getActiveScoutingSnapshot, listScoutingPresets } from '../services/scouting-config.js';
import { ScoutingHttpError, getScoutingProspectDiagnostics } from '../services/scouting.js';
import {
  activateScoutingPresetVersion,
  createDepartment,
  createScout,
  createScoutingPreset,
  createScoutingPresetVersion,
  deleteDepartment,
  deleteOrInactivateScout,
  updateDepartment,
  updateScout,
} from '../services/commissioner-scouting.js';

function assertAccess(request: any) {
  if (!hasCommissionerHeader(request.headers)) throw new CommissionerHttpError(403, 'CommissionerModeRequired', 'Commissioner Mode header X-FHM-Commissioner-Mode: enabled is required');
  if (!areCommissionerWritesEnabled()) throw new CommissionerHttpError(403, 'CommissionerWritesDisabled', 'Commissioner writes are disabled on this server');
}
function error(reply: any, value: unknown) {
  if (value instanceof CommissionerHttpError) return reply.status(value.statusCode).send(commissionerErrorBody(value));
  if (value instanceof ScoutingHttpError) return reply.status(value.statusCode).send({ error: value.code, message: value.message, details: value.details });
  if (value instanceof z.ZodError) return reply.status(400).send({ error: 'InvalidScoutingRequest', message: 'Invalid scouting request', details: value.issues });
  if (value instanceof ScoutingConfigError) return reply.status(400).send({ error: 'InvalidScoutingConfig', message: value.message });
  if (value instanceof Prisma.PrismaClientKnownRequestError) {
    if (value.code === 'P2002') return reply.status(409).send({ error: 'ScoutingConflict', message: 'A scouting record with those unique fields already exists' });
    if (value.code === 'P2003' || value.code === 'P2014') return reply.status(409).send({ error: 'ScoutingReferenceConflict', message: 'The scouting write conflicts with related records' });
    if (value.code === 'P2025') return reply.status(404).send({ error: 'ScoutingResourceNotFound', message: 'The requested scouting record was not found' });
  }
  throw value;
}
const reason = z.string().trim().min(1).max(500);
const expectedUpdatedAt = z.string().datetime();
const scoutSchema = z.object({ firstName: z.string().trim().min(1), lastName: z.string().trim().min(1), evaluatingRating: z.number().int().min(1).max(20), potentialRating: z.number().int().min(1).max(20), skaterRating: z.number().int().min(1).max(20), goalieRating: z.number().int().min(1).max(20), specialties: z.array(z.enum(['GENERAL', 'SKATER', 'GOALIE', 'POTENTIAL'])).default([]), countryFamiliarity: z.record(z.string(), z.number().min(0).max(1)).default({}), positionFamiliarity: z.record(z.string(), z.number().min(0).max(1)).default({}), persistentBias: z.number().min(-5).max(5).default(0), status: z.enum(['ACTIVE', 'INACTIVE', 'RETIRED']).optional() });
const sourceFor = (request: { headers: Record<string, string | string[] | undefined> }) =>
  (Array.isArray(request.headers['x-fhm-commissioner-source']) ? request.headers['x-fhm-commissioner-source'][0] : request.headers['x-fhm-commissioner-source']) === 'ui'
    ? ('COMMISSIONER_UI' as const)
    : ('COMMISSIONER_API' as const);

export async function registerCommissionerScoutingRoutes(app: FastifyInstance) {
  app.get('/api/commissioner/scouting/scouts', async (request, reply) => {
    try { assertAccess(request); return listResponse(await prisma.scout.findMany({ orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }] })); } catch (e) { return error(reply, e); }
  });
  app.post('/api/commissioner/scouting/scouts', async (request, reply) => {
    try {
      assertAccess(request);
      const x = scoutSchema.extend({ reason }).parse(request.body);
      return detailResponse(await createScout(x, sourceFor(request)));
    } catch (e) {
      return error(reply, e);
    }
  });
  app.patch('/api/commissioner/scouting/scouts/:scoutId', async (request, reply) => {
    try { assertAccess(request); const x = scoutSchema.partial().extend({ expectedUpdatedAt, reason }).parse(request.body); return detailResponse(await updateScout((request.params as any).scoutId, x, sourceFor(request))); } catch (e) { return error(reply, e); }
  });
  app.delete('/api/commissioner/scouting/scouts/:scoutId', async (request, reply) => {
    try { assertAccess(request); const x = z.object({ reason }).parse(request.body ?? {}); const result = await deleteOrInactivateScout((request.params as any).scoutId, x.reason, sourceFor(request)); return result.deleted ? reply.status(204).send() : detailResponse(result.scout); } catch (e) { return error(reply, e); }
  });
  app.get('/api/commissioner/scouting/departments', async (request, reply) => {
    try { assertAccess(request); return listResponse(await prisma.scoutingDepartment.findMany({ include: { team: true, scouts: { include: { scout: true } } } })); } catch (e) { return error(reply, e); }
  });
  app.post('/api/commissioner/scouting/departments', async (request, reply) => {
    try { assertAccess(request); const x = z.object({ teamId: z.string().min(1), name: z.string().min(1), scoutIds: z.array(z.string()).default([]), reason }).parse(request.body); return detailResponse(await createDepartment(x, sourceFor(request))); } catch (e) { return error(reply, e); }
  });
  app.patch('/api/commissioner/scouting/departments/:departmentId', async (request, reply) => {
    try { assertAccess(request); const x = z.object({ name: z.string().min(1).optional(), scoutIds: z.array(z.string()).optional(), expectedUpdatedAt, reason }).parse(request.body); return detailResponse(await updateDepartment((request.params as any).departmentId, x, sourceFor(request))); } catch (e) { return error(reply, e); }
  });
  app.delete('/api/commissioner/scouting/departments/:departmentId', async (request, reply) => {
    try { assertAccess(request); const x = z.object({ reason }).parse(request.body ?? {}); await deleteDepartment((request.params as any).departmentId, x.reason, sourceFor(request)); return reply.status(204).send(); } catch (e) { return error(reply, e); }
  });
  app.get('/api/commissioner/scouting/configurations', async (request, reply) => {
    try { assertAccess(request); return listResponse(await listScoutingPresets()); } catch (e) { return error(reply, e); }
  });
  app.get('/api/commissioner/scouting/diagnostics', async (request, reply) => {
    try { assertAccess(request); const active = await getActiveScoutingSnapshot(); return detailResponse({ active, assignments: await prisma.scoutingAssignment.count(), observations: await prisma.scoutingObservation.count(), reports: await prisma.teamScoutingReport.count() }); } catch (e) { return error(reply, e); }
  });
  app.get('/api/commissioner/teams/:teamId/scouting/prospects/:playerId/diagnostics', async (request, reply) => {
    try {
      assertAccess(request);
      const { teamId, playerId } = request.params as { teamId: string; playerId: string };
      return detailResponse(await getScoutingProspectDiagnostics(teamId, playerId));
    } catch (e) { return error(reply, e); }
  });
  app.post('/api/commissioner/scouting/configurations', async (request, reply) => {
    try { assertAccess(request); const x = z.object({ name: z.string().min(1), description: z.string().nullable().optional(), config: z.unknown(), activate: z.boolean().optional(), reason }).parse(request.body); return detailResponse(await createScoutingPreset(x, sourceFor(request))); } catch (e) { return error(reply, e); }
  });
  app.post('/api/commissioner/scouting/configurations/:presetId/versions', async (request, reply) => {
    try { assertAccess(request); const x = z.object({ config: z.unknown(), activate: z.boolean().optional(), reason }).parse(request.body); return detailResponse(await createScoutingPresetVersion((request.params as any).presetId, x, sourceFor(request))); } catch (e) { return error(reply, e); }
  });
  app.post('/api/commissioner/scouting/configuration-versions/:versionId/activate', async (request, reply) => {
    try { assertAccess(request); const x = z.object({ reason }).parse(request.body ?? {}); await activateScoutingPresetVersion((request.params as any).versionId, x.reason, sourceFor(request)); return detailResponse(await getActiveScoutingSnapshot()); } catch (e) { return error(reply, e); }
  });
}
