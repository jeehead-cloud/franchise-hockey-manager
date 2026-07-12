import { dirname, isAbsolute, join, normalize, resolve } from 'node:path';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const serverRoot = join(dirname(fileURLToPath(import.meta.url)), '../..');
const repoRoot = join(serverRoot, '../..');

export function getRepoRoot(): string {
  return repoRoot;
}

export function getServerRoot(): string {
  return serverRoot;
}

/** Default: fictional F3 fixture until an owner-prepared data/world snapshot exists. */
export const DEFAULT_DATASET_RELATIVE = join('data', 'fixtures', 'f3-minimal-world');

export function resolveDatasetDir(override?: string): string {
  const raw = override ?? process.env.FHM_DATASET_DIR ?? DEFAULT_DATASET_RELATIVE;
  const resolved = isAbsolute(raw) ? normalize(raw) : resolve(repoRoot, raw);
  return resolved;
}

export function datasetDirExists(dir: string): boolean {
  return existsSync(join(dir, 'manifest.json'));
}
