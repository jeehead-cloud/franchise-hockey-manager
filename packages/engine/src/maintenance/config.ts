import {
  MAINTENANCE_CONFIG_SCHEMA_VERSION,
  MaintenanceError,
  type MaintenanceConfig,
  type MaintenanceCsvConfig,
  type MaintenanceJsonConfig,
  type MaintenanceLimitsConfig,
  type MaintenancePlayerExportMode,
  type MaintenancePrivacyConfig,
  type MaintenanceRetentionConfig,
  type MaintenanceStorageConfig,
} from './types.js';

/**
 * Default maintenance configuration. Mirrors the F33 spec's recommended schema:
 * relative `.fhm-exports` storage, deterministic CSV (UTF-8, comma, LF, no BOM),
 * pretty-printed JSON with canonical manifests, generous row/byte limits,
 * PUBLIC_SAFE default privacy with Commissioner truth allowed, and a
 * 30-day / 100-file retention ceiling. Local/hobby defaults — not an
 * enterprise ETL SLA.
 */
export function defaultMaintenanceConfig(): MaintenanceConfig {
  return {
    schemaVersion: MAINTENANCE_CONFIG_SCHEMA_VERSION,
    storage: {
      directory: '.fhm-exports',
      allowAbsoluteDirectory: true,
      createDirectoryIfMissing: true,
    },
    csv: {
      delimiter: ',',
      encoding: 'utf-8',
      includeBom: false,
      lineEnding: 'LF',
      nullValue: '',
    },
    json: {
      prettyPrint: true,
      canonicalManifest: true,
    },
    limits: {
      maximumExportRows: 1_000_000,
      maximumImportBytes: 104_857_600, // 100 MiB
      maximumErrorRowsReturned: 1000,
    },
    privacy: {
      defaultPlayerExportMode: 'PUBLIC_SAFE',
      allowCommissionerTruthExport: true,
      includePrivateScoutingByDefault: false,
    },
    retention: {
      maximumGeneratedExports: 100,
      maximumAgeDays: 30,
    },
  };
}

// ---------------------------------------------------------------------------
// Strict validation (hand-rolled, same style as F32 backup config)
// ---------------------------------------------------------------------------

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

function exactKeys(o: Record<string, unknown>, keys: string[], label: string) {
  for (const k of Object.keys(o)) {
    if (!keys.includes(k)) {
      throw new MaintenanceError('InvalidMaintenanceConfiguration', `Unknown ${label} field: ${k}`);
    }
  }
}

function requireBoolean(o: Record<string, unknown>, key: string, label: string): boolean {
  const v = o[key];
  if (typeof v !== 'boolean') {
    throw new MaintenanceError('InvalidMaintenanceConfiguration', `${label}.${key} must be a boolean`);
  }
  return v;
}

function requireInt(o: Record<string, unknown>, key: string, label: string, min: number, max: number): number {
  const v = o[key];
  if (typeof v !== 'number' || !Number.isInteger(v) || v < min || v > max) {
    throw new MaintenanceError('InvalidMaintenanceConfiguration', `${label}.${key} must be an integer in [${min}, ${max}]`);
  }
  return v;
}

function requireString(o: Record<string, unknown>, key: string, label: string): string {
  const v = o[key];
  if (typeof v !== 'string' || v.length === 0) {
    throw new MaintenanceError('InvalidMaintenanceConfiguration', `${label}.${key} must be a non-empty string`);
  }
  return v;
}

const PLAYER_EXPORT_MODES: readonly MaintenancePlayerExportMode[] = ['PUBLIC_SAFE', 'COMMISSIONER_TRUTH'];
const SUPPORTED_DELIMITERS = new Set([',', ';', '\t', '|']);

/**
 * Reject path-traversal and empty directory values. The server additionally
 * canonicalizes and confirms the resolved path stays inside the root on every
 * read; this engine-level check rejects obviously-invalid config early.
 */
function validateDirectory(directory: string, allowAbsolute: boolean): string {
  if (directory.length === 0) {
    throw new MaintenanceError('InvalidMaintenanceConfiguration', 'storage.directory must be non-empty');
  }
  const segments = directory.replace(/\\/g, '/').split('/');
  if (segments.includes('..')) {
    throw new MaintenanceError('InvalidMaintenanceConfiguration', 'storage.directory must not contain parent traversal (..)');
  }
  const isAbsolute =
    /^([a-zA-Z]:[\\/]|[\\/])/i.test(directory) || // Windows drive / POSIX root
    directory.startsWith('/');
  if (isAbsolute && !allowAbsolute) {
    throw new MaintenanceError('InvalidMaintenanceConfiguration', 'storage.directory is absolute but storage.allowAbsoluteDirectory is false');
  }
  return directory;
}

function readStorage(raw: unknown): MaintenanceStorageConfig {
  if (!isObject(raw)) throw new MaintenanceError('InvalidMaintenanceConfiguration', 'storage must be an object');
  exactKeys(raw, ['directory', 'allowAbsoluteDirectory', 'createDirectoryIfMissing'], 'storage');
  const allowAbsoluteDirectory = requireBoolean(raw, 'allowAbsoluteDirectory', 'storage');
  const directory = validateDirectory(requireString(raw, 'directory', 'storage'), allowAbsoluteDirectory);
  const createDirectoryIfMissing = requireBoolean(raw, 'createDirectoryIfMissing', 'storage');
  return { directory, allowAbsoluteDirectory, createDirectoryIfMissing };
}

function readCsv(raw: unknown): MaintenanceCsvConfig {
  if (!isObject(raw)) throw new MaintenanceError('InvalidMaintenanceConfiguration', 'csv must be an object');
  exactKeys(raw, ['delimiter', 'encoding', 'includeBom', 'lineEnding', 'nullValue'], 'csv');
  const delimiter = requireString(raw, 'delimiter', 'csv');
  if (!SUPPORTED_DELIMITERS.has(delimiter)) {
    throw new MaintenanceError('InvalidMaintenanceConfiguration', 'csv.delimiter must be one of: , ; \\t |');
  }
  const encodingRaw = raw['encoding'];
  if (encodingRaw !== 'utf-8') {
    throw new MaintenanceError('InvalidMaintenanceConfiguration', 'csv.encoding must be utf-8');
  }
  const includeBom = requireBoolean(raw, 'includeBom', 'csv');
  const lineEndingRaw = raw['lineEnding'];
  if (lineEndingRaw !== 'LF') {
    throw new MaintenanceError('InvalidMaintenanceConfiguration', 'csv.lineEnding must be LF');
  }
  if (typeof raw['nullValue'] !== 'string') {
    throw new MaintenanceError('InvalidMaintenanceConfiguration', 'csv.nullValue must be a string');
  }
  return { delimiter, encoding: 'utf-8', includeBom, lineEnding: 'LF', nullValue: raw['nullValue'] };
}

function readJson(raw: unknown): MaintenanceJsonConfig {
  if (!isObject(raw)) throw new MaintenanceError('InvalidMaintenanceConfiguration', 'json must be an object');
  exactKeys(raw, ['prettyPrint', 'canonicalManifest'], 'json');
  return {
    prettyPrint: requireBoolean(raw, 'prettyPrint', 'json'),
    canonicalManifest: requireBoolean(raw, 'canonicalManifest', 'json'),
  };
}

function readLimits(raw: unknown): MaintenanceLimitsConfig {
  if (!isObject(raw)) throw new MaintenanceError('InvalidMaintenanceConfiguration', 'limits must be an object');
  exactKeys(raw, ['maximumExportRows', 'maximumImportBytes', 'maximumErrorRowsReturned'], 'limits');
  const maximumExportRows = requireInt(raw, 'maximumExportRows', 'limits', 1, Number.MAX_SAFE_INTEGER);
  const maximumImportBytes = requireInt(raw, 'maximumImportBytes', 'limits', 1024, Number.MAX_SAFE_INTEGER);
  const maximumErrorRowsReturned = requireInt(raw, 'maximumErrorRowsReturned', 'limits', 1, 100000);
  return { maximumExportRows, maximumImportBytes, maximumErrorRowsReturned };
}

function readPrivacy(raw: unknown): MaintenancePrivacyConfig {
  if (!isObject(raw)) throw new MaintenanceError('InvalidMaintenanceConfiguration', 'privacy must be an object');
  exactKeys(raw, ['defaultPlayerExportMode', 'allowCommissionerTruthExport', 'includePrivateScoutingByDefault'], 'privacy');
  const modeRaw = raw['defaultPlayerExportMode'];
  if (typeof modeRaw !== 'string' || (modeRaw !== 'PUBLIC_SAFE' && modeRaw !== 'COMMISSIONER_TRUTH')) {
    throw new MaintenanceError('InvalidMaintenanceConfiguration', 'privacy.defaultPlayerExportMode must be PUBLIC_SAFE or COMMISSIONER_TRUTH');
  }
  const defaultPlayerExportMode: MaintenancePlayerExportMode = modeRaw;
  const allowCommissionerTruthExport = requireBoolean(raw, 'allowCommissionerTruthExport', 'privacy');
  const includePrivateScoutingByDefault = requireBoolean(raw, 'includePrivateScoutingByDefault', 'privacy');
  if (defaultPlayerExportMode === 'COMMISSIONER_TRUTH' && !allowCommissionerTruthExport) {
    throw new MaintenanceError('InvalidMaintenanceConfiguration', 'privacy.defaultPlayerExportMode is COMMISSIONER_TRUTH but allowCommissionerTruthExport is false');
  }
  return {
    defaultPlayerExportMode,
    allowCommissionerTruthExport,
    includePrivateScoutingByDefault,
  };
}

function readRetention(raw: unknown): MaintenanceRetentionConfig {
  if (!isObject(raw)) throw new MaintenanceError('InvalidMaintenanceConfiguration', 'retention must be an object');
  exactKeys(raw, ['maximumGeneratedExports', 'maximumAgeDays'], 'retention');
  const maximumGeneratedExports = requireInt(raw, 'maximumGeneratedExports', 'retention', 1, 100000);
  const maximumAgeDays = requireInt(raw, 'maximumAgeDays', 'retention', 1, 36500);
  return { maximumGeneratedExports, maximumAgeDays };
}

/**
 * Strictly validate a maintenance configuration. Rejects unknown fields, path
 * traversal, unsupported CSV delimiters/encodings, non-positive or inconsistent
 * limits, invalid privacy modes, and schema-version mismatches. Returns a
 * normalized config.
 */
export function validateMaintenanceConfig(input: unknown): MaintenanceConfig {
  if (!isObject(input)) throw new MaintenanceError('InvalidMaintenanceConfiguration', 'config must be an object');
  exactKeys(input, ['schemaVersion', 'storage', 'csv', 'json', 'limits', 'privacy', 'retention'], 'config');
  const schemaVersion = input['schemaVersion'];
  if (schemaVersion !== MAINTENANCE_CONFIG_SCHEMA_VERSION) {
    throw new MaintenanceError(
      'InvalidMaintenanceConfiguration',
      `schemaVersion must be ${MAINTENANCE_CONFIG_SCHEMA_VERSION}`,
    );
  }
  return {
    schemaVersion,
    storage: readStorage(input['storage']),
    csv: readCsv(input['csv']),
    json: readJson(input['json']),
    limits: readLimits(input['limits']),
    privacy: readPrivacy(input['privacy']),
    retention: readRetention(input['retention']),
  };
}
