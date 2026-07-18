import type { FastifyInstance } from 'fastify';
import { prisma } from '../db/client.js';

/**
 * Public maintenance status — bounded metadata only. Mirrors the F32 public
 * backup-status shape: configured, export count, last-export age, pending
 * restore/maintenance. Never exposes filenames, paths, hashes, or operation
 * details.
 */
export async function registerMaintenanceRoutes(app: FastifyInstance) {
  app.get('/api/system/maintenance-status', async () => {
    let configured = false;
    try {
      const active = await prisma.activeMaintenanceConfiguration.findUnique({ where: { id: 'default' } });
      configured = Boolean(active);
    } catch {
      configured = false;
    }
    const completedExports = await prisma.maintenanceExportRun.count({ where: { status: 'COMPLETED' } });
    const pendingImports = await prisma.maintenanceImportRun.count({
      where: { status: { in: ['UPLOADED', 'VALIDATING', 'PREVIEW_READY', 'APPLYING'] } },
    });
    const latestExport = await prisma.maintenanceExportRun.findFirst({
      where: { status: 'COMPLETED', exportType: 'FULL_DATABASE_PACKAGE' },
      orderBy: { completedAt: 'desc' },
    });
    const latestValidation = await prisma.maintenanceValidationRun.findFirst({
      where: { status: 'COMPLETED' },
      orderBy: { completedAt: 'desc' },
    });
    return {
      configured,
      completedExports,
      pendingImports,
      hasFullDatabasePackage: Boolean(latestExport),
      lastFullDatabasePackageAgeDays: latestExport?.completedAt
        ? Math.floor((Date.now() - latestExport.completedAt.getTime()) / (24 * 60 * 60 * 1000))
        : null,
      lastValidationStatus: latestValidation
        ? (latestValidation.blockerCount > 0 ? 'FAIL' : latestValidation.warningCount > 0 ? 'WARNING' : 'PASS')
        : null,
      lastValidationAgeDays: latestValidation?.completedAt
        ? Math.floor((Date.now() - latestValidation.completedAt.getTime()) / (24 * 60 * 60 * 1000))
        : null,
    };
  });
}
