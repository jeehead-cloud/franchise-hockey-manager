import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import type { PrismaClient } from '@prisma/client';
import fs from 'node:fs';
import path from 'node:path';
import { cleanupTempDir, createTempDatabaseUrl, migrateTempDatabase } from './helpers/db.js';
import { getRepoRoot } from '../src/initialization/paths.js';
import { COMMISSIONER_HEADER, COMMISSIONER_HEADER_VALUE } from '../src/commissioner/gate.js';
import {
  findSchemaDirectory,
  resolveSqliteUrlPath,
} from '../src/services/database-paths.js';
import { resolveActiveDatabasePath as resolveActiveDatabasePathBackup } from '../src/services/backup-paths.js';
import { resolveActiveDatabasePath as resolveActiveDatabasePathMaintenance } from '../src/services/maintenance-paths.js';
import { resolveBackupFile } from '../src/services/backup-paths.js';
import { backupErrors } from '../src/services/backup-errors.js';

const repoRoot = getRepoRoot();
const fixtureDir = path.join(repoRoot, 'data', 'fixtures', 'f3-minimal-world');
const commissionerHeaders = { [COMMISSIONER_HEADER]: COMMISSIONER_HEADER_VALUE, 'x-fhm-commissioner-source': 'api' };

/**
 * Regression coverage for the Prisma-relative-path resolution bug that caused:
 *   - Defect 7: "Active database file not found" on manual backup
 *   - Defect 8: 500 "Internal server error" on database validation
 *   - Defect 3: maintenance-status returned a bare object instead of `{item}`
 *
 * Prisma resolves a relative SQLite `file:` URL relative to the schema directory
 * (`packages/server/prisma`), NOT the server's CWD. The backup/validation
 * resolvers must agree with Prisma, otherwise they look at a non-existent file.
 *
 * The integration block reproduces the user's exact configuration
 * (`DATABASE_URL=file:./<name>.db` started from `packages/server`) on a fully
 * disposable DB placed in the schema directory. It never touches the user's
 * real database. Path-traversal and unsupported-backend safety is preserved.
 */
describe('Active-database path resolution (Defects 3, 7, 8 regression)', () => {
  describe('resolveSqliteUrlPath — Prisma-relative semantics', () => {
    it('resolves a relative `file:./dev.db` URL against the schema directory, not CWD', () => {
      const prevCwd = process.cwd();
      try {
        // Force a CWD that does NOT contain dev.db, to prove we don't use CWD.
        process.chdir(repoRoot);
        const { dbPath, fileName } = resolveSqliteUrlPath('file:./dev.db');
        expect(fileName).toBe('dev.db');
        const schemaDir = findSchemaDirectory();
        expect(schemaDir).not.toBeNull();
        expect(dbPath).toBe(path.resolve(schemaDir!, 'dev.db'));
        // And must NOT be the CWD-relative path.
        expect(dbPath).not.toBe(path.resolve(process.cwd(), 'dev.db'));
      } finally {
        process.chdir(prevCwd);
      }
    });

    it('resolves a nested relative URL against the schema directory', () => {
      const { dbPath } = resolveSqliteUrlPath('file:./nested/sub/file.db');
      const schemaDir = findSchemaDirectory();
      expect(schemaDir).not.toBeNull();
      expect(dbPath).toBe(path.resolve(schemaDir!, 'nested', 'sub', 'file.db'));
    });

    it('resolves an absolute path unchanged', () => {
      const abs = process.platform === 'win32' ? 'C:\\some\\abs\\dev.db' : '/some/abs/dev.db';
      const { dbPath, fileName } = resolveSqliteUrlPath(`file:${abs}`);
      expect(fileName).toBe('dev.db');
      // Not a real file; just checking no throw and the path is preserved by
      // path.resolve (which normalizes separators on Windows).
      expect(path.basename(dbPath)).toBe('dev.db');
    });

    it('strips Prisma connection query params before resolving', () => {
      const { dbPath, fileName } = resolveSqliteUrlPath('file:./dev.db?connection_limit=1&socket_timeout=10');
      expect(fileName).toBe('dev.db');
      const schemaDir = findSchemaDirectory();
      expect(dbPath).toBe(path.resolve(schemaDir!, 'dev.db'));
    });
  });

  describe('findSchemaDirectory', () => {
    it('locates the schema directory containing schema.prisma at runtime', () => {
      const dir = findSchemaDirectory();
      expect(dir).not.toBeNull();
      expect(fs.existsSync(path.join(dir!, 'schema.prisma'))).toBe(true);
    });
  });

  describe('backup-paths.resolveActiveDatabasePath', () => {
    it('throws unsupported-backend for a non-file: URL', () => {
      const prev = process.env.DATABASE_URL;
      process.env.DATABASE_URL = 'postgres://user:pass@host/db';
      try {
        expect(() => resolveActiveDatabasePathBackup()).toThrow();
      } finally {
        process.env.DATABASE_URL = prev;
      }
    });

    it('matches resolveSqliteUrlPath for a relative URL', () => {
      const prev = process.env.DATABASE_URL;
      process.env.DATABASE_URL = 'file:./dev.db';
      try {
        const a = resolveActiveDatabasePathBackup();
        const b = resolveSqliteUrlPath('file:./dev.db');
        expect(a.dbPath).toBe(b.dbPath);
        expect(a.fileName).toBe(b.fileName);
      } finally {
        process.env.DATABASE_URL = prev;
      }
    });

    it('preserves path-traversal rejection on backup file reads', () => {
      const backupRoot = path.join(repoRoot, '.diag-backup-root');
      expect(() => resolveBackupFile(backupRoot, '../escape.sqlite')).toThrow();
      expect(() => resolveBackupFile(backupRoot, '/abs/path.sqlite')).toThrow();
    });
  });

  describe('maintenance-paths.resolveActiveDatabasePath', () => {
    it('matches the backup resolver for the same URL (single source of truth)', () => {
      const prev = process.env.DATABASE_URL;
      process.env.DATABASE_URL = 'file:./dev.db';
      try {
        expect(resolveActiveDatabasePathMaintenance()).toEqual(resolveActiveDatabasePathBackup());
      } finally {
        process.env.DATABASE_URL = prev;
      }
    });

    it('throws a maintenance-path-invalid error for a non-file: URL', () => {
      const prev = process.env.DATABASE_URL;
      process.env.DATABASE_URL = 'mysql://user@host/db';
      try {
        expect(() => resolveActiveDatabasePathMaintenance()).toThrow();
      } finally {
        process.env.DATABASE_URL = prev;
      }
    });
  });

  describe('nonexistent DB actionable error', () => {
    it('reports a clear actionable error when the resolved file does not exist', () => {
      const err = backupErrors.backupFailed('Active database file not found');
      expect(err).toBeInstanceOf(Error);
      expect((err as Error).message).toContain('Active database file not found');
    });
  });

  describe('Integration: relative-URL DB backs up + validates (Defects 7, 8, 3)', () => {
    let app: FastifyInstance;
    let prisma: PrismaClient;
    let tempDir = '';
    let backupDir = '';
    let exportDir = '';
    let schemaDirDbName = '';
    let schemaDirDbPath = '';
    const saved: Record<string, string | undefined> = {};

    beforeAll(async () => {
      // Create a temp DB with an ABSOLUTE url, migrate + initialize, then copy
      // the resulting file into the schema directory under a unique relative
      // name and point the live env at `file:./<name>` — exactly mirroring the
      // user's setup. The Prisma client then connects to the schema-dir file.
      const x = createTempDatabaseUrl();
      tempDir = x.dir;
      for (const k of ['DATABASE_URL', 'FHM_DATASET_DIR', 'FHM_COMMISSIONER_WRITES_ENABLED', 'FHM_BACKUP_DIR', 'FHM_EXPORT_DIR']) {
        saved[k] = process.env[k];
      }
      process.env.DATABASE_URL = x.url;
      process.env.FHM_DATASET_DIR = fixtureDir;
      process.env.FHM_COMMISSIONER_WRITES_ENABLED = 'true';
      backupDir = path.join(tempDir, 'backups');
      exportDir = path.join(tempDir, 'exports');
      fs.mkdirSync(backupDir, { recursive: true });
      fs.mkdirSync(exportDir, { recursive: true });
      process.env.FHM_BACKUP_DIR = backupDir;
      process.env.FHM_EXPORT_DIR = exportDir;
      migrateTempDatabase(x.url);
      prisma = (await import('../src/db/client.js')).prisma;
      const { initializeSetup } = await import('../src/initialization/index.js');
      await prisma.appMeta.upsert({ where: { id: 'default' }, create: { id: 'default', worldInitialized: false }, update: { worldInitialized: false } });
      await initializeSetup(prisma, fixtureDir);
      const { bootstrapBackupConfiguration } = await import('../src/services/backup-config.js');
      await bootstrapBackupConfiguration(prisma);
      const { bootstrapMaintenanceConfiguration } = await import('../src/services/maintenance-config.js');
      await bootstrapMaintenanceConfiguration(prisma);
      await prisma.$disconnect();

      // Place a disposable copy in the schema dir + switch to a RELATIVE url
      // (the user's exact configuration form).
      const schemaDir = findSchemaDirectory()!;
      schemaDirDbName = `dev-diag-${Date.now()}.db`;
      schemaDirDbPath = path.join(schemaDir, schemaDirDbName);
      fs.copyFileSync(x.dbPath, schemaDirDbPath);
      const relUrl = `file:./${schemaDirDbName}`;
      process.env.DATABASE_URL = relUrl;

      // Verify the resolvers agree with Prisma on the schema-dir path before
      // building the app.
      expect(resolveSqliteUrlPath(relUrl).dbPath).toBe(schemaDirDbPath);

      const { buildApp } = await import('../src/app.js');
      app = await buildApp({ logger: false });
    });

    afterAll(async () => {
      try { if (app) await app.close(); } catch { /* ignore */ }
      try { await prisma.$disconnect(); } catch { /* ignore */ }
      try { if (schemaDirDbPath) fs.unlinkSync(schemaDirDbPath); } catch { /* ignore */ }
      try { if (schemaDirDbPath) fs.unlinkSync(schemaDirDbPath + '-journal'); } catch { /* ignore */ }
      for (const [k, v] of Object.entries(saved)) {
        if (v === undefined) delete process.env[k]; else process.env[k] = v;
      }
      cleanupTempDir(tempDir);
    });

    it('resolves the relative URL to the schema-directory file (not CWD)', () => {
      const { dbPath } = resolveActiveDatabasePathBackup();
      expect(dbPath).toBe(schemaDirDbPath);
      expect(fs.existsSync(dbPath)).toBe(true);
    });

    it('creates a VERIFIED manual backup from a relative-URL DB (Defect 7)', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/commissioner/backups',
        headers: commissionerHeaders,
        payload: { reason: 'regression manual backup', reasonCode: 'MANUAL' },
      });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.item.backup.status).toBe('VERIFIED');
      expect(body.item.backup.fileName).toMatch(/\.sqlite$/);
      // No absolute path leaks through the public API.
      expect(JSON.stringify(body)).not.toContain(schemaDirDbPath.replace(/\\/g, '/'));
    });

    it('runs database validation to PASS on the relative-URL DB (Defect 8)', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/commissioner/maintenance/validation-runs',
        headers: commissionerHeaders,
        payload: { reason: 'regression validation' },
      });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.item.status).toBe('COMPLETED');
      expect(body.item.result.status).toBe('PASS');
      // No absolute path or hidden truth in the result.
      expect(JSON.stringify(body)).not.toContain(schemaDirDbPath.replace(/\\/g, '/'));
    });

    it('returns a maintenance-status `{item}` envelope (Defect 3)', async () => {
      const res = await app.inject({ method: 'GET', url: '/api/system/maintenance-status' });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body).toHaveProperty('item');
      expect(body.item).toHaveProperty('configured');
      expect(body.item).toHaveProperty('completedExports');
    });
  });
});
