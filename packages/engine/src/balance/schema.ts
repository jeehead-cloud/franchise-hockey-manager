import { z } from 'zod';
import {
  BALANCE_SCHEMA_VERSION,
  type BalanceConfig,
  type BalanceValidationIssue,
  type BalanceValidationResult,
  type MatchBalanceSection,
  type RuntimeSimulationSettings,
} from './types.js';

const finite = z.number().finite();
const unit01 = finite.min(0).max(1);
const styleNeg1To1 = finite.min(-1).max(1);

const inactiveSectionSchema = z
  .object({
    active: z.literal(false),
    status: z.literal('INACTIVE_UNTIL_MILESTONE'),
    milestone: z.string().min(1),
    notes: z.string().min(1),
  })
  .strict();

const pairScoreSchema = z
  .object({
    defaultPairScore: styleNeg1To1,
    pairs: z.record(z.string(), styleNeg1To1),
  })
  .strict();

const styleMatrixSchema = z
  .object({
    defaultScore: styleNeg1To1,
    matrix: z.record(z.string(), z.record(z.string(), styleNeg1To1)),
  })
  .strict();

const chemistryWeightsSchema = z
  .object({
    version: z.string().min(1),
    weights: z
      .object({
        roleCompatibility: unit01,
        personalityCompatibility: unit01,
      })
      .strict(),
    roleRatingBaseContribution: unit01,
    caps: z
      .object({
        chemistry: finite.min(0).max(1),
        coachFit: finite.min(0).max(1),
        tacticalFit: finite.min(0).max(1),
        totalMin: finite.min(-1).max(0),
        totalMax: finite.min(0).max(1),
      })
      .strict(),
    labels: z
      .array(
        z
          .object({
            maxExclusive: finite,
            label: z.enum(['POOR', 'WEAK', 'NEUTRAL', 'GOOD', 'EXCELLENT']),
          })
          .strict(),
      )
      .min(1),
    missingCoachFit: styleNeg1To1,
    missingTacticsFit: styleNeg1To1,
    coachRatingScale: z
      .object({
        minOverall: finite,
        maxOverall: finite,
        minMultiplier: finite.positive(),
        maxMultiplier: finite.positive(),
      })
      .strict(),
    coachAlignmentWeight: unit01,
    playerTacticsWeight: unit01,
  })
  .strict();

const activeMatchSectionSchema = z
  .object({
    active: z.literal(true),
    regulationPeriods: z.number().int().min(1).max(5),
    periodDurationSeconds: z.number().int().min(60).max(3600),
    minimumShiftSeconds: z.number().int().min(5).max(120),
    maximumShiftSeconds: z.number().int().min(5).max(180),
    averageShiftSeconds: z.number().int().min(5).max(180),
    minimumPossessionSeconds: z.number().int().min(1).max(60),
    maximumPossessionSeconds: z.number().int().min(1).max(120),
    stoppageSeconds: z.number().int().min(1).max(30),
    homeIcePossessionBonus: unit01,
    faceoffHomeAdvantage: unit01,
    turnoverBaseProbability: unit01,
    eventSafetyLimit: z.number().int().min(100).max(100000),
    forwardLineUsageWeights: z.record(z.string(), finite.positive()),
    defensePairUsageWeights: z.record(z.string(), finite.positive()),
    zoneTransitionWeights: z
      .object({
        neutralZoneEntry: unit01,
        defensiveZoneExit: unit01,
        offensiveHold: unit01,
        offensiveTurnover: unit01,
        offensiveStoppage: unit01,
      })
      .strict(),
  })
  .strict();

export const balanceConfigSchema = z
  .object({
    schemaVersion: z.union([z.literal(1), z.literal(2), z.literal(BALANCE_SCHEMA_VERSION)]),
    presetKey: z.string().min(1).max(64),
    name: z.string().min(1).max(120),
    description: z.string().max(2000).nullable(),
    engineCompatibility: z
      .object({
        minimumEngineVersion: z.string().min(1),
      })
      .strict(),
    randomness: z
      .object({
        simulationRandomness: unit01,
        eventVariance: unit01,
        finishingVariance: unit01,
        goalieVariance: unit01,
        penaltyVariance: unit01,
        upsetStrength: unit01,
      })
      .strict(),
    playerModel: z
      .object({
        active: z.literal(true),
        attributeMin: finite,
        attributeMax: finite,
        ratingMin: finite,
        ratingMax: finite,
        heroRatingMin: finite,
        heroRatingMax: finite,
        stabilityMin: finite,
        stabilityMax: finite,
        developmentRateMin: finite,
        developmentRateMax: finite,
        developmentRiskMin: finite,
        developmentRiskMax: finite,
        ratingWeights: z.record(z.string(), z.unknown()),
        skaterRoles: z.record(z.string(), z.unknown()),
        goalieRoles: z.record(z.string(), z.unknown()),
        notes: z.string().optional(),
      })
      .strict(),
    chemistry: z
      .object({
        active: z.literal(true),
        weights: chemistryWeightsSchema,
        roleCompatibility: pairScoreSchema,
        personalityCompatibility: pairScoreSchema,
        coachFit: styleMatrixSchema,
        tacticalFit: styleMatrixSchema,
      })
      .strict(),
    tactics: z
      .object({
        active: z.literal(true),
        notes: z.string().min(1),
      })
      .strict(),
    match: z.union([inactiveSectionSchema, activeMatchSectionSchema]),
    shots: inactiveSectionSchema,
    goalies: inactiveSectionSchema,
    penalties: inactiveSectionSchema,
    development: inactiveSectionSchema,
    scouting: inactiveSectionSchema,
    draft: inactiveSectionSchema,
    contracts: inactiveSectionSchema,
    aggregatedLeagues: inactiveSectionSchema,
  })
  .strict();

export const runtimeSimulationSettingsSchema = z
  .object({
    simulationRandomness: unit01,
    randomSeed: z.number().int().finite().nullable(),
    loggingLevel: z.enum(['MINIMAL', 'STANDARD', 'DETAILED', 'DEBUG']),
  })
  .strict();

function zodIssues(err: z.ZodError): BalanceValidationIssue[] {
  return err.issues.map((issue) => ({
    path: issue.path.length ? issue.path.join('.') : '(root)',
    message: issue.message,
  }));
}

function chemistrySemanticErrors(config: BalanceConfig): BalanceValidationIssue[] {
  const errors: BalanceValidationIssue[] = [];
  const chem = config.chemistry;
  const w = chem.weights.weights;
  if (Math.abs(w.roleCompatibility + w.personalityCompatibility - 1) > 1e-9) {
    errors.push({
      path: 'chemistry.weights.weights',
      message: 'roleCompatibility + personalityCompatibility must equal 1',
    });
  }
  const caps = chem.weights.caps;
  if (!(caps.totalMin < caps.totalMax)) {
    errors.push({ path: 'chemistry.weights.caps', message: 'totalMin must be < totalMax' });
  }
  let prev = -Infinity;
  for (let i = 0; i < chem.weights.labels.length; i += 1) {
    const band = chem.weights.labels[i]!;
    if (!(band.maxExclusive > prev)) {
      errors.push({
        path: `chemistry.weights.labels.${i}.maxExclusive`,
        message: 'Label thresholds must be strictly increasing',
      });
    }
    prev = band.maxExclusive;
  }
  if (
    Math.abs(chem.weights.playerTacticsWeight + chem.weights.coachAlignmentWeight - 1) > 1e-9
  ) {
    errors.push({
      path: 'chemistry.weights.playerTacticsWeight',
      message: 'playerTacticsWeight + coachAlignmentWeight must equal 1',
    });
  }

  for (const [key, score] of Object.entries(chem.roleCompatibility.pairs)) {
    const [a, b] = key.split('|');
    if (!a || !b) {
      errors.push({ path: `chemistry.roleCompatibility.pairs.${key}`, message: 'Invalid pair key' });
      continue;
    }
    const canonical = a <= b ? `${a}|${b}` : `${b}|${a}`;
    if (key !== canonical) {
      errors.push({
        path: `chemistry.roleCompatibility.pairs.${key}`,
        message: `Pair key must be canonical (${canonical})`,
      });
    }
    if (!Number.isFinite(score)) {
      errors.push({
        path: `chemistry.roleCompatibility.pairs.${key}`,
        message: 'Score must be finite',
      });
    }
  }

  const coaching = [
    'AUTHORITARIAN',
    'AUTHORITATIVE',
    'DEMOCRATIC',
    'DEVELOPMENTAL',
    'HANDS_OFF',
  ] as const;
  for (const from of coaching) {
    const row = chem.coachFit.matrix[from];
    if (!row) {
      errors.push({ path: `chemistry.coachFit.matrix.${from}`, message: 'Missing row' });
      continue;
    }
    for (const to of coaching) {
      if (typeof row[to] !== 'number') {
        errors.push({
          path: `chemistry.coachFit.matrix.${from}.${to}`,
          message: 'Missing cell',
        });
      } else if (Math.abs(row[to]! - (chem.coachFit.matrix[to]?.[from] ?? NaN)) > 1e-9) {
        errors.push({
          path: `chemistry.coachFit.matrix.${from}.${to}`,
          message: 'Matrix must be symmetric',
        });
      }
    }
  }

  const tactical = ['COMBINATIONAL', 'PHYSICAL', 'SPEED', 'SYSTEM', 'FORECHECKING'] as const;
  for (const from of tactical) {
    const row = chem.tacticalFit.matrix[from];
    if (!row) {
      errors.push({ path: `chemistry.tacticalFit.matrix.${from}`, message: 'Missing row' });
      continue;
    }
    for (const to of tactical) {
      if (typeof row[to] !== 'number') {
        errors.push({
          path: `chemistry.tacticalFit.matrix.${from}.${to}`,
          message: 'Missing cell',
        });
      } else if (Math.abs(row[to]! - (chem.tacticalFit.matrix[to]?.[from] ?? NaN)) > 1e-9) {
        errors.push({
          path: `chemistry.tacticalFit.matrix.${from}.${to}`,
          message: 'Matrix must be symmetric',
        });
      }
    }
  }

  const pm = config.playerModel;
  if (!(pm.attributeMin < pm.attributeMax)) {
    errors.push({ path: 'playerModel.attributeMin', message: 'attributeMin must be < attributeMax' });
  }
  if (!(pm.ratingMin < pm.ratingMax)) {
    errors.push({ path: 'playerModel.ratingMin', message: 'ratingMin must be < ratingMax' });
  }

  return errors;
}

function matchSemanticErrors(config: BalanceConfig): BalanceValidationIssue[] {
  const errors: BalanceValidationIssue[] = [];
  if (config.match.active !== true) return errors;
  const m = config.match as MatchBalanceSection;
  if (m.regulationPeriods !== 3) {
    errors.push({ path: 'match.regulationPeriods', message: 'F11 requires regulationPeriods = 3' });
  }
  if (!(m.minimumShiftSeconds <= m.averageShiftSeconds && m.averageShiftSeconds <= m.maximumShiftSeconds)) {
    errors.push({ path: 'match.averageShiftSeconds', message: 'Shift seconds must satisfy min <= avg <= max' });
  }
  if (!(m.minimumPossessionSeconds <= m.maximumPossessionSeconds)) {
    errors.push({ path: 'match.minimumPossessionSeconds', message: 'Possession min must be <= max' });
  }
  const fwdTotal = Object.values(m.forwardLineUsageWeights).reduce((s, n) => s + n, 0);
  const defTotal = Object.values(m.defensePairUsageWeights).reduce((s, n) => s + n, 0);
  if (!(fwdTotal > 0)) errors.push({ path: 'match.forwardLineUsageWeights', message: 'Must sum > 0' });
  if (!(defTotal > 0)) errors.push({ path: 'match.defensePairUsageWeights', message: 'Must sum > 0' });
  return errors;
}

export function isF11CompatibleBalanceConfig(
  config: BalanceConfig,
): config is BalanceConfig & { match: MatchBalanceSection } {
  return config.match.active === true && config.schemaVersion >= 2;
}

export function validateBalanceConfig(input: unknown): BalanceValidationResult {
  const parsed = balanceConfigSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, errors: zodIssues(parsed.error) };
  }
  const semantic = [...chemistrySemanticErrors(parsed.data as BalanceConfig), ...matchSemanticErrors(parsed.data as BalanceConfig)];
  if (semantic.length) return { ok: false, errors: semantic };
  return { ok: true, config: parsed.data as BalanceConfig };
}

export function parseBalanceConfig(input: unknown): BalanceConfig {
  const result = validateBalanceConfig(input);
  if (!result.ok) {
    const detail = result.errors.map((e) => `${e.path}: ${e.message}`).join('; ');
    throw new Error(`Invalid balance config: ${detail}`);
  }
  return result.config;
}

export function validateRuntimeSimulationSettings(
  input: unknown,
): { ok: true; settings: RuntimeSimulationSettings } | { ok: false; errors: BalanceValidationIssue[] } {
  const parsed = runtimeSimulationSettingsSchema.safeParse(input);
  if (!parsed.success) return { ok: false, errors: zodIssues(parsed.error) };
  return { ok: true, settings: parsed.data };
}
