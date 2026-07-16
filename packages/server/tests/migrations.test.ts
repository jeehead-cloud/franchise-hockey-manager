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
      expect(names).toContain('CompetitionStageStanding');
      expect(names).toContain('CompetitionStageTeamStat');
      expect(names).toContain('CompetitionStagePlayerStat');
      expect(names).toContain('PlayoffSeries');
      expect(names).toContain('CompetitionArchive');
      expect(names).toContain('ArchiveParticipant');
      expect(names).toContain('ArchiveAward');
      expect(names).toContain('AggregatedSeasonRun');
      expect(names).toContain('AggregatedMatchSummary');
      expect(names).toContain('NationalTeamProfile');
      expect(names).toContain('NationalTeamEdition');
      expect(names).toContain('TournamentMedalResult');
      expect(names).toContain('PlayerDevelopmentPreset');
      expect(names).toContain('PlayerDevelopmentPresetVersion');
      expect(names).toContain('ActivePlayerDevelopmentConfiguration');
      expect(names).toContain('PlayerDevelopmentRun');
      expect(names).toContain('PlayerDevelopmentResult');
      expect(names).toContain('PlayerSeasonSnapshot');
      expect(names).toContain('YouthGenerationProfileSet');
      expect(names).toContain('YouthGenerationProfileSetVersion');
      expect(names).toContain('ActiveYouthGenerationConfiguration');
      expect(names).toContain('CountryNamePool');
      expect(names).toContain('CountryNamePoolVersion');
      expect(names).toContain('CountryYouthProfileVersion');
      expect(names).toContain('YouthGenerationRun');
      expect(names).toContain('YouthCohort');
      expect(names).toContain('YouthGeneratedPlayer');
      expect(names).toContain('ScoutingPreset');
      expect(names).toContain('ScoutingPresetVersion');
      expect(names).toContain('ActiveScoutingConfiguration');
      expect(names).toContain('Scout');
      expect(names).toContain('ScoutingDepartment');
      expect(names).toContain('TeamProspectKnowledge');
      expect(names).toContain('ScoutingAssignment');
      expect(names).toContain('ScoutingObservation');
      expect(names).toContain('TeamScoutingReport');
      expect(names).toContain('TeamProspectWatchlistEntry');
      expect(names).toContain('PlayerContract');
      expect(names).toContain('ContractOffer');
      expect(names).toContain('ContractTransaction');
      const cols = await prisma.$queryRaw<Array<{ name: string }>>`
        PRAGMA table_info('AppMeta')
      `;
      expect(cols.map((c) => c.name)).toContain('worldInitialized');
      const playerCols = await prisma.$queryRaw<Array<{ name: string }>>`
        PRAGMA table_info('Player')
      `;
      expect(playerCols.map((c) => c.name)).toContain('potentialFloor');
      expect(playerCols.map((c) => c.name)).toContain('publicPotentialEstimate');
      expect(playerCols.map((c) => c.name)).toContain('form');
      const matchCols = await prisma.$queryRaw<Array<{ name: string }>>`
        PRAGMA table_info('Match')
      `;
      expect(matchCols.map((c) => c.name)).toContain('tournamentGroupKey');
      const editionCols = await prisma.$queryRaw<Array<{ name: string }>>`
        PRAGMA table_info('CompetitionEdition')
      `;
      expect(editionCols.map((c) => c.name)).toContain('tournamentTemplateKey');
      expect(editionCols.map((c) => c.name)).toContain('tournamentResultHash');
      await prisma.$disconnect();
    } finally {
      cleanupTempDir(dir);
    }
  });

  it('records F1–F28 migrations in history', async () => {
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
      expect(names.some((n) => n.includes('f18_regular_season'))).toBe(true);
      expect(names.some((n) => n.includes('f19_playoffs'))).toBe(true);
      expect(names.some((n) => n.includes('f20_competition_archive'))).toBe(true);
      expect(names.some((n) => n.includes('f21_aggregated_league'))).toBe(true);
      expect(names.some((n) => n.includes('f22_national_teams'))).toBe(true);
      expect(names.some((n) => n.includes('f23_international_tournaments'))).toBe(true);
      expect(names.some((n) => n.includes('f24_player_development'))).toBe(true);
      expect(names.some((n) => n.includes('f25_youth_generation'))).toBe(true);
      expect(names.some((n) => n.includes('f26_scouting'))).toBe(true);
      expect(names.some((n) => n.includes('f26_scouting_audit'))).toBe(true);
      expect(names.some((n) => n.includes('f27_draft'))).toBe(true);
      expect(names.some((n) => n.includes('f28_contracts'))).toBe(true);
      expect(names.some((n) => n.includes('f29_trades'))).toBe(true);
      expect(names).toHaveLength(24);
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
