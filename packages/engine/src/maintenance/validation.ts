import {
  MAINTENANCE_PRESET_ENVELOPE_SCHEMA_VERSION,
  MaintenanceError,
  type ConfigurationPresetEnvelope,
  type ConfigurationPresetType,
  type DuplicateClassification,
  type DuplicatePolicy,
  type ImportIssue,
  type NamePoolExistingEntry,
  type NamePoolImportRow,
} from './types.js';
import { computePresetPayloadHash } from './hashing.js';

const SUPPORTED_PRESET_TYPES: readonly ConfigurationPresetType[] = [
  'SIMULATION_BALANCE',
  'DEVELOPMENT',
  'YOUTH_GENERATION',
  'SCOUTING',
  'DRAFT',
  'CONTRACTS',
  'TRADES',
  'OFFSEASON',
  'SEASON_TRANSITION',
  'BACKUP',
  'MAINTENANCE',
];

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

const NAME_TOKEN_LIMIT = 200;

/**
 * Normalize a name token. Mirrors the F25 youth-generation rules: NFC
 * normalization, trim, collapse internal whitespace. Returns null when the
 * normalized result is empty.
 */
export function normalizeMaintenanceNameToken(raw: string): string | null {
  const n = raw.normalize('NFC').trim().replace(/\s+/g, ' ');
  return n.length === 0 ? null : n;
}

/**
 * Validate a single name-pool import row. Returns issues (with stable row
 * numbers) and a normalized row when valid. Reuses the F25 normalization
 * rules so imported names match what youth generation expects.
 */
export function validateNamePoolRow(
  rowNumber: number,
  countryCode: unknown,
  firstName: unknown,
  lastName: unknown,
): { issues: ImportIssue[]; normalized: Omit<NamePoolImportRow, 'rowNumber'> | null } {
  const issues: ImportIssue[] = [];

  if (typeof countryCode !== 'string' || countryCode.trim().length === 0) {
    issues.push({
      rowNumber,
      fieldName: 'countryCode',
      severity: 'BLOCKER',
      code: 'namePool.countryCode.empty',
      message: 'countryCode must be a non-empty string',
      normalizedValue: null,
    });
  }
  if (typeof firstName !== 'string') {
    issues.push({
      rowNumber,
      fieldName: 'firstName',
      severity: 'BLOCKER',
      code: 'namePool.firstName.invalid',
      message: 'firstName must be a string',
      normalizedValue: null,
    });
  }
  if (typeof lastName !== 'string') {
    issues.push({
      rowNumber,
      fieldName: 'lastName',
      severity: 'BLOCKER',
      code: 'namePool.lastName.invalid',
      message: 'lastName must be a string',
      normalizedValue: null,
    });
  }
  if (issues.length > 0) return { issues, normalized: null };

  const cc = (countryCode as string).trim().toUpperCase();
  const firstNorm = normalizeMaintenanceNameToken(firstName as string);
  const lastNorm = normalizeMaintenanceNameToken(lastName as string);
  if (firstNorm === null) {
    issues.push({
      rowNumber,
      fieldName: 'firstName',
      severity: 'BLOCKER',
      code: 'namePool.firstName.empty',
      message: 'firstName is empty after normalization',
      normalizedValue: null,
    });
  } else if (firstNorm.length > NAME_TOKEN_LIMIT) {
    issues.push({
      rowNumber,
      fieldName: 'firstName',
      severity: 'BLOCKER',
      code: 'namePool.firstName.tooLong',
      message: `firstName exceeds ${NAME_TOKEN_LIMIT} characters`,
      normalizedValue: firstNorm,
    });
  }
  if (lastNorm === null) {
    issues.push({
      rowNumber,
      fieldName: 'lastName',
      severity: 'BLOCKER',
      code: 'namePool.lastName.empty',
      message: 'lastName is empty after normalization',
      normalizedValue: null,
    });
  } else if (lastNorm.length > NAME_TOKEN_LIMIT) {
    issues.push({
      rowNumber,
      fieldName: 'lastName',
      severity: 'BLOCKER',
      code: 'namePool.lastName.tooLong',
      message: `lastName exceeds ${NAME_TOKEN_LIMIT} characters`,
      normalizedValue: lastNorm,
    });
  }
  if (issues.length > 0) return { issues, normalized: null };

  return {
    issues,
    normalized: { countryCode: cc, firstName: firstNorm!, lastName: lastNorm! },
  };
}

/**
 * Classify a normalized import row against an existing entry. Case-insensitive
 * comparison — imports must not create visually-identical names that differ
 * only in case.
 */
export function classifyNamePoolDuplicate(
  row: Omit<NamePoolImportRow, 'rowNumber'>,
  existing: NamePoolExistingEntry,
): DuplicateClassification {
  const sameCountry = row.countryCode === existing.countryCode.toUpperCase();
  const sameFirst = row.firstName.toLocaleLowerCase('en') === existing.firstName.toLocaleLowerCase('en');
  const sameLast = row.lastName.toLocaleLowerCase('en') === existing.lastName.toLocaleLowerCase('en');
  if (sameCountry && sameFirst && sameLast) return 'IDENTICAL';
  return 'NEW';
}

/**
 * Decide whether a duplicate-classified row should be created, skipped, or
 * rejected, given the caller's duplicate policy.
 */
export function decideDuplicateAction(
  classification: DuplicateClassification,
  policy: DuplicatePolicy,
): 'CREATE' | 'SKIP' | 'REJECT' {
  if (classification === 'NEW') return 'CREATE';
  // IDENTICAL
  if (policy === 'SKIP_IDENTICAL') return 'SKIP';
  if (policy === 'ADD_NEW') return 'CREATE'; // caller's responsibility to avoid literal dup
  return 'REJECT'; // REJECT_CONFLICT
}

/**
 * Strictly validate a configuration preset envelope. Rejects unknown fields,
 * unsupported preset types, schema-version mismatches, and payload-hash
 * mismatches. The payloadHash is recomputed from the canonical payload —
 * exportedAt is excluded (it must not affect payloadHash).
 */
export function validatePresetEnvelope(input: unknown): ConfigurationPresetEnvelope {
  if (!isObject(input)) {
    throw new MaintenanceError('InvalidPresetEnvelope', 'preset envelope must be an object');
  }
  exactKeys(input, ['schemaVersion', 'presetType', 'presetName', 'versionName', 'payloadSchemaVersion', 'payload', 'payloadHash', 'exportedAt'], 'envelope');
  const schemaVersion = input['schemaVersion'];
  if (schemaVersion !== MAINTENANCE_PRESET_ENVELOPE_SCHEMA_VERSION) {
    throw new MaintenanceError('InvalidPresetEnvelope', `schemaVersion must be ${MAINTENANCE_PRESET_ENVELOPE_SCHEMA_VERSION}`);
  }
  const presetTypeRaw = input['presetType'];
  if (typeof presetTypeRaw !== 'string' || !SUPPORTED_PRESET_TYPES.includes(presetTypeRaw as ConfigurationPresetType)) {
    throw new MaintenanceError('InvalidPresetEnvelope', `presetType is not supported: ${String(presetTypeRaw)}`);
  }
  const presetType = presetTypeRaw as ConfigurationPresetType;
  const presetName = requireNonEmptyString(input['presetName'], 'presetName');
  const versionName = requireNonEmptyString(input['versionName'], 'versionName');
  const payloadSchemaVersionRaw = input['payloadSchemaVersion'];
  if (typeof payloadSchemaVersionRaw !== 'number' || !Number.isInteger(payloadSchemaVersionRaw) || payloadSchemaVersionRaw < 1) {
    throw new MaintenanceError('InvalidPresetEnvelope', 'payloadSchemaVersion must be a positive integer');
  }
  if (input['payload'] === undefined || input['payload'] === null) {
    throw new MaintenanceError('InvalidPresetEnvelope', 'payload is required');
  }
  const payloadHash = requireNonEmptyString(input['payloadHash'], 'payloadHash');
  if (typeof input['exportedAt'] !== 'string') {
    throw new MaintenanceError('InvalidPresetEnvelope', 'exportedAt must be a string');
  }
  // Recompute payload hash from the canonical payload (excludes exportedAt).
  const recomputed = computePresetPayloadHash(input['payload']);
  if (recomputed !== payloadHash) {
    throw new MaintenanceError(
      'ImportConflict',
      'payloadHash does not match the canonical payload hash',
      { expected: recomputed, provided: payloadHash },
    );
  }
  return {
    schemaVersion,
    presetType,
    presetName,
    versionName,
    payloadSchemaVersion: payloadSchemaVersionRaw,
    payload: input['payload'],
    payloadHash,
    exportedAt: input['exportedAt'] as string,
  };
}

function exactKeys(o: Record<string, unknown>, keys: string[], label: string) {
  for (const k of Object.keys(o)) {
    if (!keys.includes(k)) {
      throw new MaintenanceError('InvalidPresetEnvelope', `Unknown ${label} field: ${k}`);
    }
  }
}

function requireNonEmptyString(v: unknown, label: string): string {
  if (typeof v !== 'string' || v.length === 0) {
    throw new MaintenanceError('InvalidPresetEnvelope', `${label} must be a non-empty string`);
  }
  return v;
}
