import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {
  BACKUP_MANIFEST_SCHEMA_VERSION,
  computeManifestDigest,
  type BackupType,
  type ReasonCode,
  type DatabaseFingerprintInput,
} from '@fhm/engine';
import { backupErrors } from './backup-errors.js';

/** Manifest shape (canonical-JSON sidecar). */
export interface BackupManifest {
  manifestSchemaVersion: number;
  backupId: string;
  createdAt: string;
  backupType: BackupType;
  reasonCode: ReasonCode;
  sourceDatabase: { fileName: string; sizeBytes: number };
  backupFile: { fileName: string; sizeBytes: number; sha256: string };
  database: {
    fingerprint: string;
    migrationCount: number;
    latestMigrationName: string | null;
    tableCounts: Array<{ table: string; count: number }>;
    currentWorldSeason: {
      id: string;
      label: string;
      startYear: number;
      endYear: number;
    } | null;
  };
  configuration: { versionId: string; hash: string };
  sourceOperation: { type: string | null; id: string | null };
}

export interface BuildManifestArgs {
  backupId: string;
  createdAt: string;
  backupType: BackupType;
  reasonCode: ReasonCode;
  sourceDatabaseFileName: string;
  sourceDatabaseSizeBytes: number;
  backupFileName: string;
  backupSizeBytes: number;
  backupSha256: string;
  databaseFingerprint: string;
  fingerprintInput: DatabaseFingerprintInput;
  migrationCount: number;
  latestMigrationName: string | null;
  configVersionId: string;
  configHash: string;
  sourceOperationType: string | null;
  sourceOperationId: string | null;
  currentWorldSeason: {
    id: string;
    label: string;
    startYear: number;
    endYear: number;
  } | null;
}

/** Build the canonical manifest object. */
export function buildManifest(args: BuildManifestArgs): BackupManifest {
  return {
    manifestSchemaVersion: BACKUP_MANIFEST_SCHEMA_VERSION,
    backupId: args.backupId,
    createdAt: args.createdAt,
    backupType: args.backupType,
    reasonCode: args.reasonCode,
    sourceDatabase: {
      fileName: args.sourceDatabaseFileName,
      sizeBytes: args.sourceDatabaseSizeBytes,
    },
    backupFile: {
      fileName: args.backupFileName,
      sizeBytes: args.backupSizeBytes,
      sha256: args.backupSha256,
    },
    database: {
      fingerprint: args.databaseFingerprint,
      migrationCount: args.migrationCount,
      latestMigrationName: args.latestMigrationName,
      tableCounts: args.fingerprintInput.tableCounts,
      currentWorldSeason: args.currentWorldSeason,
    },
    configuration: { versionId: args.configVersionId, hash: args.configHash },
    sourceOperation: { type: args.sourceOperationType, id: args.sourceOperationId },
  };
}

/**
 * Canonical (stable key order) JSON serialization of a manifest. Used both for
 * the on-disk file and for the manifest SHA-256, so the written bytes hash to
 * the stored digest.
 */
export function canonicalManifestJson(manifest: BackupManifest): string {
  return JSON.stringify(stableSort(manifest));
}

function stableSort(value: unknown): unknown {
  if (value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map(stableSort);
  const obj = value as Record<string, unknown>;
  return Object.keys(obj)
    .sort()
    .reduce<Record<string, unknown>>((acc, k) => {
      acc[k] = stableSort(obj[k]);
      return acc;
    }, {});
}

/** Compute the SHA-256 of the canonical manifest JSON (proves manifest bytes). */
export function computeManifestSha256(manifest: BackupManifest): string {
  return createHash('sha256').update(canonicalManifestJson(manifest)).digest('hex');
}

/**
 * The engine's deterministic manifest digest — foldable from the manifest via
 * `computeManifestDigest`. Used as a cross-check / stable identity. The digest
 * internally normalizes the input.
 */
export function computeManifestEngineDigest(args: {
  manifest: BackupManifest;
  fingerprintInput: DatabaseFingerprintInput;
}): string {
  const { manifest } = args;
  return computeManifestDigest({
    manifestSchemaVersion: manifest.manifestSchemaVersion,
    backupType: manifest.backupType,
    reasonCode: manifest.reasonCode,
    sourceDatabaseFileName: manifest.sourceDatabase.fileName,
    sourceDatabaseSizeBytes: manifest.sourceDatabase.sizeBytes,
    backupFileName: manifest.backupFile.fileName,
    backupSizeBytes: manifest.backupFile.sizeBytes,
    backupSha256: manifest.backupFile.sha256,
    database: args.fingerprintInput,
    configuration: manifest.configuration,
    sourceOperation: manifest.sourceOperation,
  });
}

/** Write a manifest file (canonical JSON) and return its SHA-256. */
export function writeManifestFile(manifestPath: string, manifest: BackupManifest): string {
  fs.writeFileSync(manifestPath, canonicalManifestJson(manifest), 'utf8');
  return computeManifestSha256(manifest);
}

/** Read and parse a manifest file, validating its schema version. */
export function readManifestFile(manifestPath: string): BackupManifest {
  let raw: string;
  try {
    raw = fs.readFileSync(manifestPath, 'utf8');
  } catch {
    throw backupErrors.manifestInvalid('Manifest file could not be read');
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw backupErrors.manifestInvalid('Manifest file is not valid JSON');
  }
  const m = parsed as Partial<BackupManifest>;
  if (
    typeof m?.manifestSchemaVersion !== 'number' ||
    m.manifestSchemaVersion !== BACKUP_MANIFEST_SCHEMA_VERSION
  ) {
    throw backupErrors.manifestInvalid(
      `Unsupported manifest schema version: ${m?.manifestSchemaVersion ?? 'missing'}`,
    );
  }
  if (
    typeof m?.backupFile?.sha256 !== 'string' ||
    typeof m?.database?.fingerprint !== 'string' ||
    typeof m?.configuration?.versionId !== 'string'
  ) {
    throw backupErrors.manifestInvalid('Manifest is missing required fields');
  }
  return m as BackupManifest;
}

/** Compute the SHA-256 of an arbitrary file by streaming. */
export function computeFileSha256(filePath: string): string {
  const hash = createHash('sha256');
  const fd = fs.openSync(filePath, 'r');
  try {
    const buf = Buffer.alloc(1024 * 1024);
    let bytesRead = 0;
    while ((bytesRead = fs.readSync(fd, buf, 0, buf.length, null)) > 0) {
      hash.update(buf.subarray(0, bytesRead));
    }
  } finally {
    fs.closeSync(fd);
  }
  return hash.digest('hex');
}

/** Manifest file path derived from the backup file path. */
export function manifestPathFor(backupFilePath: string): string {
  const ext = path.extname(backupFilePath);
  return backupFilePath.slice(0, -ext.length) + '.manifest.json';
}

/** Relative manifest path derived from the relative backup file path. */
export function manifestRelativePathFor(relativeBackupPath: string): string {
  const ext = path.extname(relativeBackupPath);
  return relativeBackupPath.slice(0, -ext.length) + '.manifest.json';
}
