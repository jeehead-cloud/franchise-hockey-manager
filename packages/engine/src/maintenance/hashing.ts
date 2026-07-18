import { stableDigest } from '../simulation/batch/hash.js';
import { sortJsonValue } from '../balance/canonicalize.js';
import type {
  ConfigurationPresetEnvelope,
  ExportManifestInput,
  ImportPlan,
  MaintenanceConfig,
  ResetPreviewInput,
} from './types.js';

/**
 * Deterministic, order-independent digest used by the maintenance engine. Same
 * family as backup / season-transition / offseason / trades / contracts — no
 * node:crypto in engine exports.
 */
const stableMaintenanceHash = (value: unknown) => stableDigest(JSON.stringify(sortJsonValue(value)));

/**
 * Canonical config JSON (stable key order) — used for persistence and hashing.
 */
export function canonicalMaintenanceConfig(config: MaintenanceConfig): string {
  return JSON.stringify(sortJsonValue(config));
}

/**
 * Deterministic config hash. The server computes the persisted SHA-256 of the
 * config JSON via node:crypto (proves bytes on disk); this engine digest is a
 * stable identifier for equality/comparison.
 */
export function hashMaintenanceConfig(config: MaintenanceConfig): string {
  return stableMaintenanceHash(config);
}

/**
 * Normalize the export-manifest hash input into a stable shape. Excludes
 * wall-clock timestamps — the manifest identity is the (type, format, privacy,
 * scope, filter, schema, row count, file bytes/hash, config version, input
 * hash) tuple. The server computes the persisted manifest file SHA-256 from
 * canonical JSON bytes; this normalized shape defines canonical field order.
 */
export function normalizeExportManifestHashInput(input: ExportManifestInput): unknown {
  return sortJsonValue({
    manifestSchemaVersion: input.manifestSchemaVersion,
    exportType: input.exportType,
    format: input.format,
    privacyLevel: input.privacyLevel,
    scope: input.scopeText,
    filter: input.filterText,
    schemaVersion: input.schemaVersion,
    rowCount: input.rowCount,
    fileSizeBytes: input.fileSizeBytes,
    fileSha256: input.fileSha256,
    configuration: {
      versionId: input.configuration.versionId,
      hash: input.configuration.hash,
    },
    inputHash: input.inputHash,
  });
}

export function computeExportManifestDigest(input: ExportManifestInput): string {
  return stableMaintenanceHash(normalizeExportManifestHashInput(input));
}

/**
 * Compute a preset payload hash. Excludes envelope metadata (presetName,
 * versionName, exportedAt) — only the payload and its schemaVersion
 * contribute. Two exports of the same payload produce the same hash regardless
 * of when they were exported or what the owner named the version.
 */
export function computePresetPayloadHash(payload: unknown): string {
  return stableMaintenanceHash(payload);
}

/**
 * Compute the canonical envelope hash (whole envelope minus exportedAt). Used
 * to recognize identical exports and link duplicate imports.
 */
export function computePresetEnvelopeHash(envelope: Omit<ConfigurationPresetEnvelope, 'exportedAt'>): string {
  return stableMaintenanceHash(envelope);
}

/**
 * Deterministic preview hash for an import plan. The server stores this when
 * presenting a preview; the caller must echo it back at apply time so the
 * server can reject stale previews.
 */
export function computeImportPreviewHash(plan: Omit<ImportPlan, 'previewHash'>): string {
  return stableMaintenanceHash({
    importType: plan.importType,
    totalRows: plan.totalRows,
    validRows: plan.validRows,
    warningRows: plan.warningRows,
    invalidRows: plan.invalidRows,
    intendedCreates: plan.intendedCreates,
    intendedSkips: plan.intendedSkips,
    duplicatePolicy: plan.duplicatePolicy,
    duplicates: plan.duplicates,
    // Issues are part of the preview identity — changing which rows are flagged
    // invalidates the preview.
    issues: plan.issues,
  });
}

/**
 * Compute the deterministic input hash for an export. The server passes the
 * normalized (sorted, deduplicated) scope+filter+configVersion tuple; the
 * engine folds it into a stable digest. Same scope+filter+version always
 * produces the same input hash — independent of when the export runs.
 */
export function computeExportInputHash(args: {
  exportType: string;
  filters: Record<string, string>;
  configVersionId: string;
  configHash: string;
}): string {
  return stableMaintenanceHash({
    exportType: args.exportType,
    filters: args.filters,
    configVersionId: args.configVersionId,
    configHash: args.configHash,
  });
}

/**
 * Compute the deterministic reset-preview hash. Includes the mode, affected
 * counts, fingerprint, and worldShortId — so any drift between preview and
 * execution is detected (stale preview → 409).
 */
export function computeResetPreviewHash(input: ResetPreviewInput): string {
  return stableMaintenanceHash({
    mode: input.mode,
    affectedCounts: [...input.affectedCounts].sort((a, b) => a.table.localeCompare(b.table)),
    currentDatabaseFingerprint: input.currentDatabaseFingerprint,
    worldShortId: input.worldShortId,
  });
}
