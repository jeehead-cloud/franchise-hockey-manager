import { describe, expect, it } from 'vitest';
import {
  cleanupTempDir,
  createTempDatabaseUrl,
  createTestPrisma,
  migrateTempDatabase,
  validatePrismaSchema,
} from './helpers/db.js';

describe('Migrations', () => {
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
      expect(names).toContain('SkaterAttributes');
      expect(names).toContain('GoalieAttributes');
      expect(names).toContain('CommissionerAuditLog');
      expect(names).toContain('TeamLineup');
      expect(names).toContain('LineupAssignment');
      expect(names).toContain('PlayerSecondaryPosition');
      expect(names).toContain('BalancePreset');
      expect(names).toContain('BalancePresetVersion');
      expect(names).toContain('ActiveBalanceConfiguration');
      expect(names).toContain('Match');
      expect(names).toContain('MatchResult');
      expect(names).toContain('MatchEvent');
      expect(names).toContain('PlayerGameStat');
      expect(names).toContain('TeamGameStat');
      expect(names).toContain('CompetitionParticipant');
      expect(names).toContain('CompetitionStage');
      expect(names).toContain('StageParticipant');
      const cols = await prisma.$queryRaw<Array<{ name: string }>>`
        PRAGMA table_info('AppMeta')
      `;
      expect(cols.map((c) => c.name)).toContain('worldInitialized');
      const playerCols = await prisma.$queryRaw<Array<{ name: string }>>`
        PRAGMA table_info('Player')
      `;
      expect(playerCols.map((c) => c.name)).toContain('potentialFloor');
      expect(playerCols.map((c) => c.name)).toContain('publicPotentialEstimate');
      await prisma.$disconnect();
    } finally {
      cleanupTempDir(dir);
    }
  });

  it('records F1–F17 migrations in history', async () => {
    const { url, dir } = createTempDatabaseUrl();
    try {
      migrateTempDatabase(url);
      const prisma = createTestPrisma(url);
      const rows = await prisma.$queryRaw<Array<{ migration_name: string }>>`
        SELECT migration_name FROM _prisma_migrations ORDER BY finished_at ASC
      `;
      const names = rows.map((r) => r.migration_name);
      expect(names.some((n) => n.includes('f8_lineups'))).toBe(true);
      expect(names.some((n) => n.includes('f10_balance_presets'))).toBe(true);
      expect(names.some((n) => n.includes('f14_playable_match'))).toBe(true);
      expect(names.some((n) => n.includes('f17_competition_framework'))).toBe(true);
      expect(names).toHaveLength(11);
      expect(names.some((n) => n.includes('f1_bootstrap'))).toBe(true);
      expect(names.some((n) => n.includes('f2_core_domain'))).toBe(true);
      expect(names.some((n) => n.includes('f3_source_metadata_and_init'))).toBe(true);
      expect(names.some((n) => n.includes('f5_player_model'))).toBe(true);
      expect(names.some((n) => n.includes('f6_commissioner_audit'))).toBe(true);
      expect(names.some((n) => n.includes('f7_coaches_tactics_team_setup'))).toBe(true);
      await prisma.$disconnect();
    } finally {
      cleanupTempDir(dir);
    }
  });

  it('preserves structural F4-style players after F5 schema (nullable model)', async () => {
    const { url, dir } = createTempDatabaseUrl();
    try {
      migrateTempDatabase(url);
      const prisma = createTestPrisma(url);
      const country = await prisma.country.create({
        data: { name: 'Testland', code: 'TL' },
      });
      const player = await prisma.player.create({
        data: {
          firstName: 'Pre',
          lastName: 'F5',
          dateOfBirth: new Date('2001-06-15'),
          nationalityCountryId: country.id,
          primaryPosition: 'C',
          sourceType: 'MANUAL',
          rosterStatus: 'ACTIVE',
        },
      });
      const after = await prisma.player.findUnique({
        where: { id: player.id },
        include: { skaterAttributes: true, goalieAttributes: true },
      });
      expect(after?.id).toBe(player.id);
      expect(after?.firstName).toBe('Pre');
      expect(after?.skaterAttributes).toBeNull();
      expect(after?.goalieAttributes).toBeNull();
      expect(after?.potentialFloor).toBeNull();
      expect(after?.preferredCoachingStyle).toBeNull();
      await prisma.$disconnect();
    } finally {
      cleanupTempDir(dir);
    }
  });

  it('prisma validate succeeds', () => {
    validatePrismaSchema();
  });
});
