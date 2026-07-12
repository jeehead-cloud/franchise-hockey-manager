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
        secondaryPositions: z.array(z.enum(['LW', 'RW', 'C', 'LD', 'RD'])).default([]),
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
    if (isGoalie && row.identity.secondaryPositions.length > 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Goalie must not have secondary positions',
        path: ['identity', 'secondaryPositions'],
      });
    }
    const seen = new Set<string>();
    for (const pos of row.identity.secondaryPositions) {
      if (pos === row.identity.primaryPosition) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Secondary position must not duplicate primary',
          path: ['identity', 'secondaryPositions'],
        });
      }
      if (seen.has(pos)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Duplicate secondary position ${pos}`,
          path: ['identity', 'secondaryPositions'],
        });
      }
      seen.add(pos);
    }
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

const lineupSlotEnum = z.enum([
  'F1_LW',
  'F1_C',
  'F1_RW',
  'F2_LW',
  'F2_C',
  'F2_RW',
  'F3_LW',
  'F3_C',
  'F3_RW',
  'F4_LW',
  'F4_C',
  'F4_RW',
  'D1_LD',
  'D1_RD',
  'D2_LD',
  'D2_RD',
  'D3_LD',
  'D3_RD',
  'G_STARTER',
  'G_BACKUP',
]);

export const commissionerLineupSaveSchema = z
  .object({
    expectedUpdatedAt: z.string().datetime().nullable(),
    reason: nonEmpty.max(500),
    assignments: z
      .array(
        z
          .object({
            slot: lineupSlotEnum,
            playerId: nonEmpty,
          })
          .strict(),
      )
      .max(20),
  })
  .strict();

export const commissionerLineupAutoFillSchema = z
  .object({
    expectedUpdatedAt: z.string().datetime().nullable(),
    reason: nonEmpty.max(500),
    mode: z.enum(['REPLACE', 'FILL_EMPTY']),
  })
  .strict();

export type CommissionerCoachEditInput = z.infer<typeof commissionerCoachEditSchema>;
export type CommissionerCoachCreateInput = z.infer<typeof commissionerCoachCreateSchema>;
export type CommissionerTeamSetupInput = z.infer<typeof commissionerTeamSetupSchema>;
export type CommissionerRosterStatusInput = z.infer<typeof commissionerRosterStatusSchema>;
export type CommissionerLineupSaveInput = z.infer<typeof commissionerLineupSaveSchema>;
export type CommissionerLineupAutoFillInput = z.infer<typeof commissionerLineupAutoFillSchema>;
