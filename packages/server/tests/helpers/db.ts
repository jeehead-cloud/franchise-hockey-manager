import { execFileSync } from 'node:child_process';
import { closeSync, mkdtempSync, openSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PrismaClient } from '@prisma/client';

const serverRoot = join(dirname(fileURLToPath(import.meta.url)), '../..');
const repoRoot = join(serverRoot, '../..');
const prismaCli = join(repoRoot, 'node_modules', 'prisma', 'build', 'index.js');

function runPrisma(args: string[], databaseUrl?: string) {
  execFileSync(process.execPath, [prismaCli, ...args], {
    cwd: serverRoot,
    env: {
      ...process.env,
      ...(databaseUrl ? { DATABASE_URL: databaseUrl } : {}),
    },
    stdio: 'pipe',
  });
}

export function createTempDatabaseUrl(): { url: string; dir: string; dbPath: string } {
  const dir = mkdtempSync(join(process.env.FHM_TEST_TMP_DIR ?? tmpdir(), 'fhm-f2-'));
  const dbPath = join(dir, 'test.db');
  // Prisma's Windows schema engine cannot always create a new file inside a freshly-created temp directory.
  closeSync(openSync(dbPath, 'a'));
  const normalized = dbPath.replace(/\\/g, '/');
  const url = `file:${normalized}`;
  return { url, dir, dbPath };
}

export function migrateTempDatabase(databaseUrl: string) {
  runPrisma(['migrate', 'deploy'], databaseUrl);
}

export function validatePrismaSchema() {
  runPrisma(['validate']);
}

export function createTestPrisma(databaseUrl: string) {
  return new PrismaClient({
    datasources: { db: { url: databaseUrl } },
  });
}

export function cleanupTempDir(dir: string) {
  try {
    rmSync(dir, { recursive: true, force: true });
  } catch {
    // ignore cleanup races on Windows
  }
}
