import type { PrismaClient } from '@prisma/client';
import { SetupError } from './errors.js';
import { persistWorld, type ImportFailAfter } from './importer.js';
import { loadDataset, tryLoadDatasetSummary } from './loader.js';
import { assessEmptyWorld } from './status.js';
import type { InitializeResult, ValidationReport, WorldStatus } from './types.js';
import { validateDataset } from './validator.js';

export async function getSetupStatus(
  prisma: PrismaClient,
  datasetDir?: string,
): Promise<WorldStatus> {
  const empty = await assessEmptyWorld(prisma);
  const summary = tryLoadDatasetSummary(datasetDir);

  return {
    initialized: empty.initialized,
    canInitialize: empty.canInitialize && summary.available,
    dataset: summary.available
      ? {
          id: summary.id!,
          name: summary.name!,
          schemaVersion: summary.schemaVersion!,
          sourceName: summary.sourceName!,
          sourceUpdatedAt: summary.sourceUpdatedAt!,
          fictional: Boolean(summary.fictional),
          available: true,
        }
      : null,
    datasetError: summary.available ? undefined : summary.error,
    counts: empty.counts,
    initializedAt: empty.meta.worldInitializedAt?.toISOString() ?? null,
    datasetId: empty.meta.worldDatasetId,
    schemaVersion: empty.meta.worldSchemaVersion,
    blockReason: empty.blockReason ?? (summary.available ? null : summary.error ?? 'Dataset unavailable'),
  };
}

export async function previewSetup(
  prisma: PrismaClient,
  datasetDir?: string,
): Promise<ValidationReport & { canInitialize: boolean; blockReason: string | null }> {
  const empty = await assessEmptyWorld(prisma);
  const dataset = loadDataset(datasetDir);
  const report = validateDataset(dataset);

  return {
    ...report,
    canInitialize: empty.canInitialize && report.valid,
    blockReason: empty.blockReason,
  };
}

export async function initializeSetup(
  prisma: PrismaClient,
  datasetDir?: string,
  options?: { failAfter?: ImportFailAfter; log?: (msg: string, meta?: Record<string, unknown>) => void },
): Promise<InitializeResult> {
  const log = options?.log ?? (() => undefined);
  const empty = await assessEmptyWorld(prisma);

  if (empty.initialized) {
    throw new SetupError('WorldAlreadyInitialized', 'World already initialized', 409, {
      datasetId: empty.meta.worldDatasetId,
      initializedAt: empty.meta.worldInitializedAt?.toISOString() ?? null,
    });
  }

  if (!empty.canInitialize) {
    throw new SetupError(
      'WorldNotEmpty',
      empty.blockReason ?? 'Database is not empty',
      409,
      { counts: empty.counts },
    );
  }

  const dataset = loadDataset(datasetDir);
  log('dataset selected', { datasetId: dataset.manifest.datasetId });

  const report = validateDataset(dataset);
  log('validation result', {
    valid: report.valid,
    errors: report.errors.length,
    warnings: report.warnings.length,
  });

  if (!report.valid) {
    throw new SetupError('DatasetValidationError', 'Dataset validation failed', 422, {
      errors: report.errors,
      warnings: report.warnings,
      counts: report.counts,
      dataset: report.dataset,
    });
  }

  log('initialization started', { datasetId: dataset.manifest.datasetId });
  try {
    const result = await persistWorld(prisma, dataset, { failAfter: options?.failAfter });
    const { bootstrapBalanceConfiguration } = await import('../services/balance-config.js');
    await bootstrapBalanceConfiguration(prisma);
    // Complete the deferred world-dependent bootstrap now that fixture
    // countries (NAV/SGL) exist. Idempotent: never overrides an existing
    // active configuration. Must not throw on success — if the just-imported
    // world is missing required fixture countries, that is a dataset bug and
    // should surface here rather than silently leaving no default config.
    const { bootstrapYouthGenerationConfiguration } = await import(
      '../services/youth-generation-config.js'
    );
    await bootstrapYouthGenerationConfiguration(prisma);
    log('initialization completed', {
      datasetId: result.datasetId,
      created: result.created,
    });
    return result;
  } catch (err) {
    if (err instanceof Error && err.message.startsWith('__FAIL_AFTER__')) {
      log('initialization failed (injected)', { reason: err.message });
      throw err;
    }
    log('initialization failed', {
      reason: err instanceof Error ? err.message : 'unknown',
    });
    throw err;
  }
}
