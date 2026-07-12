import { describe, expect, it } from 'vitest';
import {
  cleanupTempDir,
  createTempDatabaseUrl,
  createTestPrisma,
  migrateTempDatabase,
  validatePrismaSchema,
} from './helpers/db.js';

describe('F2 migrations', () => {
  it('applies all migrations to a fully empty SQLite database', async () => {
    const { url, dir } = createTempDatabaseUrl();
    try {
      migrateTempDatabase(url);
      const prisma = createTestPrisma(url);
      const tables = await prisma.$queryRaw<Array<{ name: string }>>`
        SELECT name FROM sqlite_master WHERE type='table' ORDER BY name
      `;
      const names = tables.map((t) => t.name);
      expect(names).toContain('AppMeta');
      expect(names).toContain('WorldSeason');
      expect(names).toContain('Player');
      expect(names).toContain('CompetitionEdition');
      await prisma.$disconnect();
    } finally {
      cleanupTempDir(dir);
    }
  });

  it('records F1 then F2 migrations in history', async () => {
    const { url, dir } = createTempDatabaseUrl();
    try {
      migrateTempDatabase(url);
      const prisma = createTestPrisma(url);
      const rows = await prisma.$queryRaw<Array<{ migration_name: string }>>`
        SELECT migration_name FROM _prisma_migrations ORDER BY finished_at ASC
      `;
      const names = rows.map((r) => r.migration_name);
      expect(names.some((n) => n.includes('f1_bootstrap'))).toBe(true);
      expect(names.some((n) => n.includes('f2_core_domain'))).toBe(true);
      await prisma.$disconnect();
    } finally {
      cleanupTempDir(dir);
    }
  });

  it('prisma validate succeeds', () => {
    validatePrismaSchema();
  });
});
