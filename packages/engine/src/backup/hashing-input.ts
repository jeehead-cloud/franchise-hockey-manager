import { stableDigest } from '../simulation/batch/hash.js';
import { sortJsonValue } from '../balance/canonicalize.js';
import type {
  BackupConfig,
  DatabaseFingerprintInput,
  ManifestHashInput,
} from './types.js';

/**
 * Deterministic, order-independent digest used by the backup engine. Same
 * family as season-transition / offseason / trades / contracts — no
 * node:crypto in engine exports.
 */
const stableBackupHash = (value: unknown) => stableDigest(JSON.stringify(sortJsonValue(value)));

/**
 * Canonical config JSON (stable key order) — used for persistence and hashing.
 */
export function canonicalBackupConfig(config: BackupConfig): string {
  return JSON.stringify(sortJsonValue(config));
}

/**
 * Deterministic config hash. The server computes the persisted SHA-256 of the
 * config JSON via node:crypto (proves bytes on disk); this engine digest is a
 * stable identifier for equality/comparison and is reused as the `configHash`
 * the engine surfaces.
 */
export function hashBackupConfig(config: BackupConfig): string {
  return stableBackupHash(config);
}

/**
 * Normalize the manifest-hash input into a stable shape. The server writes the
 * manifest file as canonical JSON and computes its SHA-256 from those bytes;
 * this normalized shape is what the engine treats as the canonical manifest
 * identity (field order independent, deterministic). Manifest legitimately
 * records createdAt/backupId in the written file, but those are NOT part of
 * the database fingerprint.
 */
export function normalizeManifestHashInput(input: ManifestHashInput): unknown {
  return sortJsonValue({
    manifestSchemaVersion: input.manifestSchemaVersion,
    backupType: input.backupType,
    reasonCode: input.reasonCode,
    sourceDatabase: {
      fileName: input.sourceDatabaseFileName,
      sizeBytes: input.sourceDatabaseSizeBytes,
    },
    backupFile: {
      fileName: input.backupFileName,
      sizeBytes: input.backupSizeBytes,
      sha256: input.backupSha256,
    },
    database: normalizeDatabaseFingerprintInput(input.database),
    configuration: {
      versionId: input.configuration.versionId,
      hash: input.configuration.hash,
    },
    sourceOperation: {
      type: input.sourceOperation.type,
      id: input.sourceOperation.id,
    },
  });
}

/**
 * Normalize a database-fingerprint input into a stable shape. Excludes
 * absolute path, backup creation timestamp, and backup ID — those are not
 * part of the database's semantic identity. Migration names are kept in their
 * canonical applied order (NOT sorted — order is itself semantic).
 */
export function normalizeDatabaseFingerprintInput(input: DatabaseFingerprintInput): unknown {
  return sortJsonValue({
    migrations: input.migrationNames, // order preserved as an array value
    userVersion: input.userVersion,
    appMeta: {
      worldInitialized: input.appMeta.worldInitialized,
      worldDatasetId: input.appMeta.worldDatasetId,
      worldSchemaVersion: input.appMeta.worldSchemaVersion,
    },
    currentWorldSeason: input.currentWorldSeason
      ? {
          id: input.currentWorldSeason.id,
          label: input.currentWorldSeason.label,
          startYear: input.currentWorldSeason.startYear,
          endYear: input.currentWorldSeason.endYear,
        }
      : null,
    tableCounts: [...input.tableCounts]
      .sort((a, b) => a.table.localeCompare(b.table))
      .map((t) => ({ table: t.table, count: t.count })),
  });
}

/**
 * Compute the deterministic database fingerprint digest from normalized input.
 * The server passes the raw facts it gathered from the (read-only) source DB;
 * the engine folds them into a stable digest. Proves semantic state — distinct
 * from the file SHA-256 which proves bytes.
 */
export function computeDatabaseFingerprint(input: DatabaseFingerprintInput): string {
  return stableBackupHash(normalizeDatabaseFingerprintInput(input));
}

/**
 * Compute the canonical manifest digest from normalized input.
 */
export function computeManifestDigest(input: ManifestHashInput): string {
  return stableBackupHash(normalizeManifestHashInput(input));
}
