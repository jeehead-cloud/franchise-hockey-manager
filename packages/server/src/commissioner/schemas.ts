import { z } from 'zod';

const nonEmpty = z.string().trim().min(1);
const attr = z.number().int().min(1).max(20);

export const skaterAttributesEditSchema = z
  .object({
    stickhandling: attr,
    shooting: attr,
    passing: attr,
    strength: attr,
    speed: attr,
    balance: attr,
    aggression: attr,
    offensiveAwareness: attr,
    defensiveAwareness: attr,
  })
  .strict();

export const goalieAttributesEditSchema = z
  .object({
    reflexes: attr,
    positioning: attr,
    reboundControl: attr,
    glove: attr,
    blocker: attr,
    movement: attr,
    puckHandling: attr,
    consistency: attr,
    stamina: attr,
  })
  .strict();

/**
 * Full editable snapshot for F6 player editor.
 * Omitted/null attribute models are position-validated; client must send the
 * complete coherent model for the target position (not a partial field patch).
 */
export const commissionerPlayerEditSchema = z
  .object({
    expectedUpdatedAt: z.string().datetime(),
    reason: nonEmpty.max(500),
    identity: z
      .object({
        firstName: nonEmpty.max(80),
        lastName: nonEmpty.max(80),
        dateOfBirth: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'dateOfBirth must be YYYY-MM-DD'),
        nationalityCountryId: nonEmpty,
        currentTeamId: z.string().trim().min(1).nullable(),
        primaryPosition: z.enum(['LW', 'RW', 'C', 'LD', 'RD', 'G']),
        rosterStatus: z.enum(['ACTIVE', 'RESERVE', 'PROSPECT', 'UNAVAILABLE']),
      })
      .strict(),
    profile: z
      .object({
        preferredCoachingStyle: z.enum([
          'AUTHORITARIAN',
          'AUTHORITATIVE',
          'DEMOCRATIC',
          'DEVELOPMENTAL',
          'HANDS_OFF',
        ]),
        preferredTactics: z.enum([
          'COMBINATIONAL',
          'PHYSICAL',
          'SPEED',
          'SYSTEM',
          'FORECHECKING',
        ]),
        personality: z.enum(['LEADER', 'COMPETITOR', 'PROFESSIONAL', 'CREATIVE', 'GLUE']),
        heroRating: attr,
        stability: attr,
        developmentRate: z.number().min(0.1).max(3),
        developmentRisk: z.number().min(0).max(1),
        potentialFloor: z.number().int().min(0).max(100),
        potentialCeiling: z.number().int().min(0).max(100),
        publicPotentialEstimate: z.enum(['LOW', 'STANDARD', 'HIGH', 'ELITE', 'UNKNOWN']),
      })
      .strict(),
    skaterAttributes: skaterAttributesEditSchema.nullable(),
    goalieAttributes: goalieAttributesEditSchema.nullable(),
  })
  .strict()
  .superRefine((row, ctx) => {
    if (row.profile.potentialFloor > row.profile.potentialCeiling) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'potentialFloor must be <= potentialCeiling',
        path: ['profile', 'potentialFloor'],
      });
    }
    const isGoalie = row.identity.primaryPosition === 'G';
    if (isGoalie) {
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

export type CommissionerPlayerEditInput = z.infer<typeof commissionerPlayerEditSchema>;

const coachingStyle = z.enum([
  'AUTHORITARIAN',
  'AUTHORITATIVE',
  'DEMOCRATIC',
  'DEVELOPMENTAL',
  'HANDS_OFF',
]);
const tacticalStyle = z.enum(['COMBINATIONAL', 'PHYSICAL', 'SPEED', 'SYSTEM', 'FORECHECKING']);
const coachIdentity = z
  .object({
    firstName: nonEmpty.max(80),
    lastName: nonEmpty.max(80),
    nationalityCountryId: z.string().trim().min(1).nullable(),
  })
  .strict();
const coachStyles = z.object({ coachingStyle, tacticalStyle }).strict();
const coachRatings = z
  .object({
    overallCoaching: attr,
    playerDevelopment: attr,
    offense: attr,
    defense: attr,
  })
  .strict();

export const commissionerCoachEditSchema = z
  .object({
    expectedUpdatedAt: z.string().datetime(),
    reason: nonEmpty.max(500),
    identity: coachIdentity,
    styles: coachStyles,
    ratings: coachRatings,
    currentTeamId: z.string().trim().min(1).nullable(),
    replaceExisting: z.boolean().optional(),
    moveFromOtherTeam: z.boolean().optional(),
  })
  .strict();

export const commissionerCoachCreateSchema = z
  .object({
    reason: nonEmpty.max(500),
    identity: coachIdentity,
    styles: coachStyles,
    ratings: coachRatings,
    currentTeamId: z.string().trim().min(1).nullable(),
    replaceExisting: z.boolean().optional(),
    moveFromOtherTeam: z.boolean().optional(),
  })
  .strict();

export const commissionerTeamSetupSchema = z
  .object({
    expectedUpdatedAt: z.string().datetime(),
    reason: nonEmpty.max(500),
    headCoachId: z.string().trim().min(1).nullable(),
    tacticalStyle: tacticalStyle.nullable(),
    replaceExisting: z.boolean().optional(),
    moveFromOtherTeam: z.boolean().optional(),
  })
  .strict();

export const commissionerRosterStatusSchema = z
  .object({
    playerId: z.string().trim().min(1),
    rosterStatus: z.enum(['ACTIVE', 'RESERVE', 'PROSPECT', 'UNAVAILABLE']),
    expectedUpdatedAt: z.string().datetime(),
    reason: nonEmpty.max(500),
  })
  .strict();

export type CommissionerCoachEditInput = z.infer<typeof commissionerCoachEditSchema>;
export type CommissionerCoachCreateInput = z.infer<typeof commissionerCoachCreateSchema>;
export type CommissionerTeamSetupInput = z.infer<typeof commissionerTeamSetupSchema>;
export type CommissionerRosterStatusInput = z.infer<typeof commissionerRosterStatusSchema>;
