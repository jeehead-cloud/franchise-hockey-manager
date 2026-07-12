import type { FastifyInstance } from 'fastify';
import { detailResponse, listResponse, notFound } from '../http.js';
import {
  exportBalancePresetVersion,
  getActiveBalanceSnapshot,
  getBalancePreset,
  getBalancePresetVersion,
  listBalancePresets,
  listBalancePresetVersions,
} from '../services/balance-config.js';

export async function registerBalanceRoutes(app: FastifyInstance) {
  app.get('/api/balance/active', async () => {
    const snapshot = await getActiveBalanceSnapshot();
    return detailResponse(snapshot);
  });

  app.get('/api/balance/presets', async () => {
    const result = await listBalancePresets();
    return listResponse(result.items);
  });

  app.get('/api/balance/presets/:presetId', async (request, reply) => {
    const { presetId } = request.params as { presetId: string };
    const item = await getBalancePreset(presetId);
    if (!item) return reply.status(404).send(notFound('BalancePreset'));
    return detailResponse(item);
  });

  app.get('/api/balance/presets/:presetId/versions', async (request, reply) => {
    const { presetId } = request.params as { presetId: string };
    const result = await listBalancePresetVersions(presetId);
    if (!result) return reply.status(404).send(notFound('BalancePreset'));
    return listResponse(result.items);
  });

  app.get('/api/balance/versions/:versionId', async (request, reply) => {
    const { versionId } = request.params as { versionId: string };
    const item = await getBalancePresetVersion(versionId);
    if (!item) return reply.status(404).send(notFound('BalancePresetVersion'));
    return detailResponse(item);
  });

  app.get('/api/balance/versions/:versionId/export', async (request, reply) => {
    const { versionId } = request.params as { versionId: string };
    const item = await exportBalancePresetVersion(versionId);
    if (!item) return reply.status(404).send(notFound('BalancePresetVersion'));
    return item;
  });
}
