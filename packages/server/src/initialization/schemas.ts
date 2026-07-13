import { z } from 'zod';

const nonEmpty = z.string().trim().min(1);
const attr = z.number().int().min(1).max(20);

export const CURRENT_DATASET_SCHEMA_VERSION = 5 as const;

export const manifestSchema = z.object({
  datasetId: nonEmpty,
  datasetName: nonEmpty,
  schemaVersion: z.literal(CURRENT_DATASET_SCHEMA_VERSION),
  sourceName: nonEmpty,
  sourceUpdatedAt: z.string().datetime(),
  worldSeasonLabel: nonEmpty,
  worldSeasonStartYear: z.number().int(),
  worldSeasonEndYear: z.number().int(),
  fictional: z.boolean().optional(),
  notes: z.string().optional(),
  files: z.object({
    countries: nonEmpty,
    leagues: nonEmpty,
    teams: nonEmpty,
    players: nonEmpty,
    coaches: nonEmpty,
    competitions: nonEmpty,
    competitionEditions: nonEmpty,
  }),
});

export const countryRowSchema = z.object({
  externalId: nonEmpty,
  name: nonEmpty,
  code: nonEmpty,
});

export const leagueRowSchema = z.object({
  externalId: nonEmpty,
  name: nonEmpty,
  shortName: z.string().nullable().optional(),
  countryExternalId: nonEmpty.nullable().optional(),
  simulationLevel: z.enum(['DETAILED', 'AGGREGATED']),
});

export const teamRowSchema = z.object({
  externalId: nonEmpty,
  name: nonEmpty,
  shortName: z.string().nullable().optional(),
  city: z.string().nullable().optional(),
  teamType: z.enum(['CLUB', 'NATIONAL']),
  countryExternalId: nonEmpty,
  leagueExternalId: nonEmpty.nullable().optional(),
  tacticalStyle: z.enum(['COMBINATIONAL', 'PHYSICAL', 'SPEED', 'SYSTEM', 'FORECHECKING']),
});

const skaterAttributesSchema = z.object({
  stickhandling: attr,
  shooting: attr,
  passing: attr,
  strength: attr,
  speed: attr,
  balance: attr,
  aggression: attr,
  offensiveAwareness: attr,
  defensiveAwareness: attr,
});

const goalieAttributesSchema = z.object({
  reflexes: attr,
  positioning: attr,
  reboundControl: attr,
  glove: attr,
  blocker: attr,
  movement: attr,
  puckHandling: attr,
  consistency: attr,
  stamina: attr,
});

const playerModelCommon = {
  preferredCoachingStyle: z.enum([
    'AUTHORITARIAN',
    'AUTHORITATIVE',
    'DEMOCRATIC',
    'DEVELOPMENTAL',
    'HANDS_OFF',
  ]),
  preferredTactics: z.enum(['COMBINATIONAL', 'PHYSICAL', 'SPEED', 'SYSTEM', 'FORECHECKING']),
  personality: z.enum(['LEADER', 'COMPETITOR', 'PROFESSIONAL', 'CREATIVE', 'GLUE']),
  heroRating: attr,
  stability: attr,
  developmentRate: z.number().min(0.1).max(3),
  developmentRisk: z.number().min(0).max(1),
  potentialFloor: z.number().int().min(0).max(100),
  potentialCeiling: z.number().int().min(0).max(100),
  publicPotentialEstimate: z.enum(['LOW', 'STANDARD', 'HIGH', 'ELITE', 'UNKNOWN']),
};

export const playerRowSchema = z
  .object({
    externalId: nonEmpty,
    firstName: nonEmpty,
    lastName: nonEmpty,
    dateOfBirth: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'dateOfBirth must be YYYY-MM-DD'),
    nationalityExternalId: nonEmpty,
    currentTeamExternalId: nonEmpty.nullable().optional(),
    primaryPosition: z.enum(['LW', 'RW', 'C', 'LD', 'RD', 'G']),
    secondaryPositions: z.array(z.enum(['LW', 'RW', 'C', 'LD', 'RD'])).default([]),
    sourceType: z.enum(['REAL_INITIAL_DATA', 'GENERATED_YOUTH', 'MANUAL', 'IMPORTED']),
    rosterStatus: z.enum(['ACTIVE', 'RESERVE', 'PROSPECT', 'UNAVAILABLE']),
    ...playerModelCommon,
    skaterAttributes: skaterAttributesSchema.optional(),
    goalieAttributes: goalieAttributesSchema.optional(),
  })
  .superRefine((row, ctx) => {
    if (row.potentialFloor > row.potentialCeiling) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'potentialFloor must be <= potentialCeiling',
        path: ['potentialFloor'],
      });
    }
    const seen = new Set<string>();
    for (const pos of row.secondaryPositions) {
      if (pos === row.primaryPosition) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'secondaryPositions must not include primaryPosition',
          path: ['secondaryPositions'],
        });
      }
      if (seen.has(pos)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Duplicate secondary position ${pos}`,
          path: ['secondaryPositions'],
        });
      }
      seen.add(pos);
    }
    const isGoalie = row.primaryPosition === 'G';
    if (isGoalie) {
      if (row.secondaryPositions.length > 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Goalie must have empty secondaryPositions',
          path: ['secondaryPositions'],
        });
      }
      if (!row.goalieAttributes) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Goalie requires goalieAttributes',
          path: ['goalieAttributes'],
        });
      }
      if (row.skaterAttributes) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Goalie must not include skaterAttributes',
          path: ['skaterAttributes'],
        });
      }
    } else {
      if (!row.skaterAttributes) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Skater requires skaterAttributes',
          path: ['skaterAttributes'],
        });
      }
      if (row.goalieAttributes) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Skater must not include goalieAttributes',
          path: ['goalieAttributes'],
        });
      }
    }
  });

export const coachRowSchema = z.object({
  externalId: nonEmpty,
  firstName: nonEmpty,
  lastName: nonEmpty,
  nationalityExternalId: nonEmpty.nullable().optional(),
  currentTeamExternalId: nonEmpty.nullable().optional(),
  coachingStyle: z.enum([
    'AUTHORITARIAN',
    'AUTHORITATIVE',
    'DEMOCRATIC',
    'DEVELOPMENTAL',
    'HANDS_OFF',
  ]),
  tacticalStyle: z.enum(['COMBINATIONAL', 'PHYSICAL', 'SPEED', 'SYSTEM', 'FORECHECKING']),
  overallCoaching: attr,
  playerDevelopment: attr,
  offense: attr,
  defense: attr,
});

export const competitionRowSchema = z.object({
  externalId: nonEmpty,
  name: nonEmpty,
  shortName: z.string().nullable().optional(),
  type: z.enum(['LEAGUE', 'PLAYOFF', 'INTERNATIONAL_TOURNAMENT', 'OTHER']),
  simulationLevel: z.enum(['DETAILED', 'AGGREGATED']).nullable().optional(),
  countryExternalId: z.string().nullable().optional(),
  leagueExternalId: z.string().nullable().optional(),
  /** Optional default rules object; validated at import time. */
  defaultRules: z.record(z.string(), z.unknown()).optional(),
});

export const competitionEditionRowSchema = z.object({
  competitionExternalId: nonEmpty,
  displayName: nonEmpty,
  status: z.enum([
    'PLANNED',
    'PREPARING',
    'READY',
    'ACTIVE',
    'COMPLETED',
    'ARCHIVED',
    'CANCELLED',
  ]),
  editionNumber: z.number().int().positive().nullable().optional(),
  /** Optional rules snapshot; defaults to competition defaultRules or SIMPLE_LEAGUE template. */
  rules: z.record(z.string(), z.unknown()).optional(),
});

export type Manifest = z.infer<typeof manifestSchema>;
export type CountryRow = z.infer<typeof countryRowSchema>;
export type LeagueRow = z.infer<typeof leagueRowSchema>;
export type TeamRow = z.infer<typeof teamRowSchema>;
export type PlayerRow = z.infer<typeof playerRowSchema>;
export type CoachRow = z.infer<typeof coachRowSchema>;
export type CompetitionRow = z.infer<typeof competitionRowSchema>;
export type CompetitionEditionRow = z.infer<typeof competitionEditionRowSchema>;
