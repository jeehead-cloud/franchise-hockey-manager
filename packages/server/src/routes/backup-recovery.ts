import type { FastifyInstance } from 'fastify';
import { detailResponse } from '../http.js';
import { getBoundedBackupStatus } from '../services/backup-history.js';

/**
 * Public-safe (normal-mode) backup/recovery status. Exposes only bounded
 * metadata — no filenames, paths, hashes, fingerprints, or operation details.
 */
export async function registerBackupRecoveryRoutes(app: FastifyInstance) {
  app.get('/api/system/backup-status', async (_q, r) => {
    const status = await getBoundedBackupStatus();
    return detailResponse({
      configured: status.configured,
      verifiedBackupCount: status.verifiedBackupCount,
      lastVerifiedBackupAt: status.lastVerifiedBackupAt,
      lastVerifiedBackupAgeDays: status.lastVerifiedBackupAgeDays,
      corruptOrMissingCount: status.corruptOrMissingCount,
      maintenanceMode: status.maintenanceMode,
      pendingRestore: status.pendingRestore,
    });
  });
}
