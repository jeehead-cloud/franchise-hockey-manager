import { z } from 'zod';

const nonEmpty = z.string().trim().min(1);

export const manifestSchema = z.object({
  datasetId: nonEmpty,
  datasetName: nonEmpty,
  schemaVersion: z.literal(1),
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
});

export const playerRowSchema = z.object({
  externalId: nonEmpty,
  firstName: nonEmpty,
  lastName: nonEmpty,
  dateOfBirth: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'dateOfBirth must be YYYY-MM-DD'),
  nationalityExternalId: nonEmpty,
  currentTeamExternalId: nonEmpty.nullable().optional(),
  primaryPosition: z.enum(['LW', 'RW', 'C', 'LD', 'RD', 'G']),
  sourceType: z.enum(['REAL_INITIAL_DATA', 'GENERATED_YOUTH', 'MANUAL', 'IMPORTED']),
  rosterStatus: z.enum(['ACTIVE', 'RESERVE', 'PROSPECT', 'UNAVAILABLE']),
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
});

export const competitionRowSchema = z.object({
  externalId: nonEmpty,
  name: nonEmpty,
  shortName: z.string().nullable().optional(),
  type: z.enum(['LEAGUE', 'PLAYOFF', 'INTERNATIONAL_TOURNAMENT', 'OTHER']),
  simulationLevel: z.enum(['DETAILED', 'AGGREGATED']).nullable().optional(),
});

export const competitionEditionRowSchema = z.object({
  competitionExternalId: nonEmpty,
  displayName: nonEmpty,
  status: z.enum(['PLANNED', 'PREPARING', 'ACTIVE', 'COMPLETED', 'ARCHIVED']),
});

export type Manifest = z.infer<typeof manifestSchema>;
export type CountryRow = z.infer<typeof countryRowSchema>;
export type LeagueRow = z.infer<typeof leagueRowSchema>;
export type TeamRow = z.infer<typeof teamRowSchema>;
export type PlayerRow = z.infer<typeof playerRowSchema>;
export type CoachRow = z.infer<typeof coachRowSchema>;
export type CompetitionRow = z.infer<typeof competitionRowSchema>;
export type CompetitionEditionRow = z.infer<typeof competitionEditionRowSchema>;
