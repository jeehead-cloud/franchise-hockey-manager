import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { ZodError } from 'zod';
import { SetupError } from './errors.js';
import { datasetDirExists, resolveDatasetDir } from './paths.js';
import {
  coachRowSchema,
  competitionEditionRowSchema,
  competitionRowSchema,
  countryRowSchema,
  leagueRowSchema,
  manifestSchema,
  playerRowSchema,
  teamRowSchema,
  type Manifest,
} from './schemas.js';
import type { LoadedDataset } from './types.js';

function readJsonFile(dir: string, relative: string): unknown {
  const full = join(dir, relative);
  if (!existsSync(full)) {
    throw new SetupError('DatasetNotFound', `Missing dataset file: ${relative}`, 404, {
      file: relative,
    });
  }
  let text: string;
  try {
    text = readFileSync(full, 'utf8');
  } catch (err) {
    throw new SetupError(
      'DatasetParseError',
      `Unable to read dataset file: ${relative}`,
      500,
      { file: relative, cause: String(err) },
    );
  }
  try {
    return JSON.parse(text) as unknown;
  } catch (err) {
    throw new SetupError(
      'DatasetParseError',
      `Malformed JSON in ${relative}`,
      422,
      { file: relative, cause: String(err) },
    );
  }
}

function formatZod(err: ZodError, file: string): string {
  const first = err.issues[0];
  if (!first) return `Invalid ${file}`;
  const path = first.path.length ? first.path.join('.') : '(root)';
  return `${file}: ${path} — ${first.message}`;
}

function parseArray<T>(
  file: string,
  raw: unknown,
  schema: { safeParse: (v: unknown) => { success: true; data: T } | { success: false; error: ZodError } },
): T[] {
  if (!Array.isArray(raw)) {
    throw new SetupError('DatasetParseError', `${file} must be a JSON array`, 422, { file });
  }
  const items: T[] = [];
  for (let i = 0; i < raw.length; i += 1) {
    const result = schema.safeParse(raw[i]);
    if (!result.success) {
      throw new SetupError(
        'DatasetParseError',
        formatZod(result.error, `${file}[${i}]`),
        422,
        { file, index: i, issues: result.error.issues },
      );
    }
    items.push(result.data);
  }
  return items;
}

export function loadManifest(dir: string): Manifest {
  const raw = readJsonFile(dir, 'manifest.json');
  const parsed = manifestSchema.safeParse(raw);
  if (!parsed.success) {
    if (raw && typeof raw === 'object' && 'schemaVersion' in raw) {
      const version = (raw as { schemaVersion?: unknown }).schemaVersion;
      if (version === 1) {
        throw new SetupError(
          'DatasetParseError',
          'Unsupported schemaVersion: 1 — F17 requires schemaVersion 5 (competition rules). Migrate the dataset or use the current fixture.',
          422,
          { file: 'manifest.json', schemaVersion: version },
        );
      }
      if (version === 2) {
        throw new SetupError(
          'DatasetParseError',
          'Unsupported schemaVersion: 2 — F17 requires schemaVersion 5 (competition rules). Migrate the dataset or use the current fixture.',
          422,
          { file: 'manifest.json', schemaVersion: version },
        );
      }
      if (version === 3) {
        throw new SetupError(
          'DatasetParseError',
          'Unsupported schemaVersion: 3 — F17 requires schemaVersion 5 (competition rules). Migrate the dataset or use the current fixture.',
          422,
          { file: 'manifest.json', schemaVersion: version },
        );
      }
      if (version === 4) {
        throw new SetupError(
          'DatasetParseError',
          'Unsupported schemaVersion: 4 — F17 requires schemaVersion 5 (competition defaultRules / edition rules snapshots). Migrate the dataset or use the current fixture.',
          422,
          { file: 'manifest.json', schemaVersion: version },
        );
      }
      throw new SetupError(
        'DatasetParseError',
        `Unsupported schemaVersion: ${String(version)} (expected 5)`,
        422,
        { file: 'manifest.json', schemaVersion: version },
      );
    }
    throw new SetupError('DatasetParseError', formatZod(parsed.error, 'manifest.json'), 422, {
      file: 'manifest.json',
      issues: parsed.error.issues,
    });
  }
  return parsed.data;
}

export function loadDataset(datasetDir?: string): LoadedDataset {
  const dir = resolveDatasetDir(datasetDir);
  if (!datasetDirExists(dir)) {
    throw new SetupError(
      'DatasetNotFound',
      `Dataset not found or missing manifest.json at configured path`,
      404,
      { dirHint: 'FHM_DATASET_DIR' },
    );
  }

  const manifest = loadManifest(dir);
  const { files } = manifest;

  return {
    dir,
    manifest,
    countries: parseArray(files.countries, readJsonFile(dir, files.countries), countryRowSchema),
    leagues: parseArray(files.leagues, readJsonFile(dir, files.leagues), leagueRowSchema),
    teams: parseArray(files.teams, readJsonFile(dir, files.teams), teamRowSchema),
    players: parseArray(files.players, readJsonFile(dir, files.players), playerRowSchema),
    coaches: parseArray(files.coaches, readJsonFile(dir, files.coaches), coachRowSchema),
    competitions: parseArray(
      files.competitions,
      readJsonFile(dir, files.competitions),
      competitionRowSchema,
    ),
    competitionEditions: parseArray(
      files.competitionEditions,
      readJsonFile(dir, files.competitionEditions),
      competitionEditionRowSchema,
    ),
  };
}

export function tryLoadDatasetSummary(datasetDir?: string): {
  available: boolean;
  id?: string;
  name?: string;
  schemaVersion?: number;
  sourceName?: string;
  sourceUpdatedAt?: string;
  fictional?: boolean;
  error?: string;
} {
  try {
    const dir = resolveDatasetDir(datasetDir);
    if (!datasetDirExists(dir)) {
      return { available: false, error: 'Dataset directory or manifest.json not found' };
    }
    const manifest = loadManifest(dir);
    return {
      available: true,
      id: manifest.datasetId,
      name: manifest.datasetName,
      schemaVersion: manifest.schemaVersion,
      sourceName: manifest.sourceName,
      sourceUpdatedAt: manifest.sourceUpdatedAt,
      fictional: Boolean(manifest.fictional),
    };
  } catch (err) {
    return {
      available: false,
      error: err instanceof Error ? err.message : 'Dataset unavailable',
    };
  }
}
