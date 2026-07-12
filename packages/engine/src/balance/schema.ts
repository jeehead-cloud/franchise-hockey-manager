import { z } from 'zod';
import {
  BALANCE_SCHEMA_VERSION,
  PENALTY_INFRACTIONS,
  SHOT_TYPES,
  type BalanceConfig,
  type BalanceValidationIssue,
  type BalanceValidationResult,
  type GoaliesBalanceSection,
  type MatchBalanceSection,
  type PenaltiesBalanceSection,
  type RuntimeSimulationSettings,
  type ShotsBalanceSection,
} from './types.js';

const finite = z.number().finite();
const unit01 = finite.min(0).max(1);
const styleNeg1To1 = finite.min(-1).max(1);
const positiveFinite = finite.positive();
const modifierNeg05To05 = finite.min(-0.5).max(0.5);
const penaltyInfractionEnum = z.enum(PENALTY_INFRACTIONS);

const SKATER_ROLE_KEYS = [
  'ROCKET',
  'POSSESSION_MASTER',
  'POWER_FORWARD',
  'DUMP_IN_FORWARD',
  'SCREENER',
  'DEEP_FORECHECKER',
  'PUCK_MOVER',
  'GARBAGE_COLLECTOR',
  'POINT_SHOOTER',
  'PLAYMAKER',
  'DEFLECTOR',
  'INTERCEPTOR',
  'GRINDER',
  'ENFORCER',
  'CHAOS_MAKER',
  'CA_FORWARD',
  'BACKCHECKER',
  'NZ_FORECHECKER',
  'TWO_WAY_FORWARD',
  'SHADOW',
  'QUARTERBACK',
  'SUPPORT_D',
  'DEFENSIVE_D',
  'ATTACKING_D',
] as const;

const GOALIE_ATTRIBUTE_KEYS = [
  'reflexes',
  'positioning',
  'reboundControl',
  'glove',
  'blocker',
  'movement',
  'puckHandling',
  'consistency',
  'stamina',
] as const;

const shotTypeEnum = z.enum(SHOT_TYPES);

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
    offensiveZoneShotOpportunityProbability: unit01.optional(),
    offensiveZoneContinuedPossessionProbability: unit01.optional(),
  })
  .strict();

const activeShotsSectionSchema = z
  .object({
    active: z.literal(true),
    shotTypeWeights: z.record(shotTypeEnum, positiveFinite),
    roleShotTendencyMultipliers: z
      .object({
        high: positiveFinite,
        medium: positiveFinite,
        low: positiveFinite,
      })
      .strict(),
    roleShotTendencies: z.record(z.string(), z.enum(['high', 'medium', 'low'])),
    shooterAttributeWeights: z
      .object({
        shooting: positiveFinite,
        offensiveAwareness: positiveFinite,
        currentAbility: positiveFinite,
      })
      .strict(),
    shotQualityWeights: z
      .object({
        shooting: finite,
        offensiveAwareness: finite,
        stickhandling: finite,
        attackingUnitEffectivePerformance: finite,
        defensivePressure: finite,
      })
      .strict(),
    passQualityContribution: unit01,
    screenContribution: unit01,
    deflectionContribution: unit01,
    defensivePressureWeights: z
      .object({
        defensiveAwareness: positiveFinite,
        strength: positiveFinite,
        balance: positiveFinite,
        defendingUnitEffectivePerformance: positiveFinite,
      })
      .strict(),
    blockProbability: unit01,
    missProbability: unit01,
    onTargetFloor: unit01,
    onTargetCeiling: unit01,
    goalProbabilityFloor: unit01,
    goalProbabilityCeiling: unit01,
    shotQualityVariance: unit01,
  })
  .strict();

const goalieAttributeWeightSchema = z
  .object({
    reflexes: positiveFinite.optional(),
    positioning: positiveFinite.optional(),
    reboundControl: positiveFinite.optional(),
    glove: positiveFinite.optional(),
    blocker: positiveFinite.optional(),
    movement: positiveFinite.optional(),
    puckHandling: positiveFinite.optional(),
    consistency: positiveFinite.optional(),
    stamina: positiveFinite.optional(),
  })
  .strict();

const activeGoaliesSectionSchema = z
  .object({
    active: z.literal(true),
    attributeWeightsByShotType: z.record(shotTypeEnum, goalieAttributeWeightSchema),
    saveProbabilityCurve: z
      .object({
        intercept: finite,
        shotQualitySlope: finite,
      })
      .strict(),
    consistencyVarianceEffect: unit01,
    reboundOutcomeWeights: z
      .object({
        controlled: positiveFinite,
        rebound: positiveFinite,
        frozen: positiveFinite,
      })
      .strict(),
    screenPenalty: unit01,
    lateralMovementEffect: unit01,
  })
  .strict();

const activePenaltiesSectionSchema = z
  .object({
    active: z.literal(true),
    enabled: z.literal(true),
    baseOpportunityProbability: unit01,
    minimumSecondsBetweenPenalties: z.number().int().positive(),
    durationSeconds: positiveFinite,
    infractionWeights: z.record(penaltyInfractionEnum, positiveFinite),
    aggressionWeight: positiveFinite,
    defensiveAwarenessWeight: positiveFinite,
    pressureWeight: positiveFinite,
    rolePenaltyTendencies: z.record(z.string(), z.enum(['high', 'medium', 'low'])),
    rolePenaltyTendencyMultipliers: z
      .object({
        high: positiveFinite,
        medium: positiveFinite,
        low: positiveFinite,
      })
      .strict(),
    penaltyVariance: unit01,
    powerPlayPossessionModifier: modifierNeg05To05,
    penaltyKillPossessionModifier: modifierNeg05To05,
    powerPlayShotOpportunityModifier: modifierNeg05To05,
    powerPlayShotQualityModifier: modifierNeg05To05,
    shortHandedShotOpportunityModifier: modifierNeg05To05,
    powerPlayAttackWeights: z
      .object({
        offensiveRating: positiveFinite,
        passing: positiveFinite,
        shooting: positiveFinite,
        offensiveAwareness: positiveFinite,
        coachOffense: positiveFinite,
      })
      .strict(),
    penaltyKillDefenseWeights: z
      .object({
        defensiveRating: positiveFinite,
        defensiveAwareness: positiveFinite,
        speed: positiveFinite,
        strength: positiveFinite,
        coachDefense: positiveFinite,
      })
      .strict(),
    maximumActivePenalties: z.literal(1),
    allowCoincidental: z.literal(false),
    allowFiveOnThree: z.literal(false),
    allowFourOnFour: z.literal(false),
  })
  .strict();

export const balanceConfigSchema = z
  .object({
    schemaVersion: z.union([
      z.literal(1),
      z.literal(2),
      z.literal(3),
      z.literal(4),
      z.literal(BALANCE_SCHEMA_VERSION),
    ]),
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
    shots: z.union([inactiveSectionSchema, activeShotsSectionSchema]),
    goalies: z.union([inactiveSectionSchema, activeGoaliesSectionSchema]),
    penalties: z.union([inactiveSectionSchema, activePenaltiesSectionSchema]),
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

  if (config.schemaVersion >= 3) {
    if (typeof m.offensiveZoneShotOpportunityProbability !== 'number') {
      errors.push({
        path: 'match.offensiveZoneShotOpportunityProbability',
        message: 'F12 requires offensiveZoneShotOpportunityProbability',
      });
    }
    if (typeof m.offensiveZoneContinuedPossessionProbability !== 'number') {
      errors.push({
        path: 'match.offensiveZoneContinuedPossessionProbability',
        message: 'F12 requires offensiveZoneContinuedPossessionProbability',
      });
    }
  }

  return errors;
}

function shotsSemanticErrors(config: BalanceConfig): BalanceValidationIssue[] {
  const errors: BalanceValidationIssue[] = [];
  if (config.shots.active !== true) {
    if (config.schemaVersion >= 3) {
      errors.push({ path: 'shots.active', message: 'F12 requires active shots section' });
    }
    return errors;
  }

  const shots = config.shots as ShotsBalanceSection;
  for (const shotType of SHOT_TYPES) {
    const weight = shots.shotTypeWeights[shotType];
    if (!(typeof weight === 'number' && Number.isFinite(weight) && weight > 0)) {
      errors.push({
        path: `shots.shotTypeWeights.${shotType}`,
        message: 'Shot type weight must be a positive finite number',
      });
    }
  }

  for (const role of SKATER_ROLE_KEYS) {
    if (!(role in shots.roleShotTendencies)) {
      errors.push({
        path: `shots.roleShotTendencies.${role}`,
        message: 'Missing skater role shot tendency',
      });
    }
  }

  for (const [role, tier] of Object.entries(shots.roleShotTendencies)) {
    if (!(SKATER_ROLE_KEYS as readonly string[]).includes(role)) {
      errors.push({
        path: `shots.roleShotTendencies.${role}`,
        message: 'Unknown skater role key',
      });
    }
    if (!(tier in shots.roleShotTendencyMultipliers)) {
      errors.push({
        path: `shots.roleShotTendencies.${role}`,
        message: `Unknown tendency tier ${tier}`,
      });
    }
  }

  if (!(shots.onTargetFloor <= shots.onTargetCeiling)) {
    errors.push({
      path: 'shots.onTargetFloor',
      message: 'onTargetFloor must be <= onTargetCeiling',
    });
  }
  if (!(shots.goalProbabilityFloor <= shots.goalProbabilityCeiling)) {
    errors.push({
      path: 'shots.goalProbabilityFloor',
      message: 'goalProbabilityFloor must be <= goalProbabilityCeiling',
    });
  }

  const shooterTotal =
    shots.shooterAttributeWeights.shooting +
    shots.shooterAttributeWeights.offensiveAwareness +
    shots.shooterAttributeWeights.currentAbility;
  if (!(shooterTotal > 0)) {
    errors.push({
      path: 'shots.shooterAttributeWeights',
      message: 'Shooter attribute weights must sum > 0',
    });
  }

  const pressureTotal =
    shots.defensivePressureWeights.defensiveAwareness +
    shots.defensivePressureWeights.strength +
    shots.defensivePressureWeights.balance +
    shots.defensivePressureWeights.defendingUnitEffectivePerformance;
  if (!(pressureTotal > 0)) {
    errors.push({
      path: 'shots.defensivePressureWeights',
      message: 'Defensive pressure weights must sum > 0',
    });
  }

  return errors;
}

function goaliesSemanticErrors(config: BalanceConfig): BalanceValidationIssue[] {
  const errors: BalanceValidationIssue[] = [];
  if (config.goalies.active !== true) {
    if (config.schemaVersion >= 3) {
      errors.push({ path: 'goalies.active', message: 'F12 requires active goalies section' });
    }
    return errors;
  }

  const goalies = config.goalies as GoaliesBalanceSection;
  for (const shotType of SHOT_TYPES) {
    const weights = goalies.attributeWeightsByShotType[shotType];
    if (!weights) {
      errors.push({
        path: `goalies.attributeWeightsByShotType.${shotType}`,
        message: 'Missing goalie attribute weights for shot type',
      });
      continue;
    }
    let total = 0;
    for (const [key, value] of Object.entries(weights)) {
      if (!(GOALIE_ATTRIBUTE_KEYS as readonly string[]).includes(key)) {
        errors.push({
          path: `goalies.attributeWeightsByShotType.${shotType}.${key}`,
          message: 'Unknown goalie attribute key',
        });
      }
      if (!(typeof value === 'number' && Number.isFinite(value) && value > 0)) {
        errors.push({
          path: `goalies.attributeWeightsByShotType.${shotType}.${key}`,
          message: 'Goalie attribute weight must be positive and finite',
        });
      } else {
        total += value;
      }
    }
    if (!(total > 0)) {
      errors.push({
        path: `goalies.attributeWeightsByShotType.${shotType}`,
        message: 'Goalie attribute weights must sum > 0',
      });
    }
  }

  const reboundTotal =
    goalies.reboundOutcomeWeights.controlled +
    goalies.reboundOutcomeWeights.rebound +
    goalies.reboundOutcomeWeights.frozen;
  if (!(reboundTotal > 0)) {
    errors.push({
      path: 'goalies.reboundOutcomeWeights',
      message: 'Rebound outcome weights must sum > 0',
    });
  }

  return errors;
}

function penaltiesSemanticErrors(config: BalanceConfig): BalanceValidationIssue[] {
  const errors: BalanceValidationIssue[] = [];
  if (config.penalties.active !== true) {
    if (config.schemaVersion >= 4) {
      errors.push({ path: 'penalties.active', message: 'F13 requires active penalties section' });
    }
    return errors;
  }

  const penalties = config.penalties as PenaltiesBalanceSection;

  if (penalties.maximumActivePenalties !== 1) {
    errors.push({
      path: 'penalties.maximumActivePenalties',
      message: 'F13 requires maximumActivePenalties = 1',
    });
  }
  if (penalties.allowCoincidental !== false) {
    errors.push({
      path: 'penalties.allowCoincidental',
      message: 'F13 requires allowCoincidental = false',
    });
  }
  if (penalties.allowFiveOnThree !== false) {
    errors.push({
      path: 'penalties.allowFiveOnThree',
      message: 'F13 requires allowFiveOnThree = false',
    });
  }
  if (penalties.allowFourOnFour !== false) {
    errors.push({
      path: 'penalties.allowFourOnFour',
      message: 'F13 requires allowFourOnFour = false',
    });
  }
  if (!(penalties.durationSeconds > 0)) {
    errors.push({
      path: 'penalties.durationSeconds',
      message: 'durationSeconds must be positive (120 preferred)',
    });
  }

  for (const infraction of PENALTY_INFRACTIONS) {
    const weight = penalties.infractionWeights[infraction];
    if (!(typeof weight === 'number' && Number.isFinite(weight) && weight > 0)) {
      errors.push({
        path: `penalties.infractionWeights.${infraction}`,
        message: 'Infraction weight must be a positive finite number',
      });
    }
  }

  for (const [role, tier] of Object.entries(penalties.rolePenaltyTendencies)) {
    if (!(SKATER_ROLE_KEYS as readonly string[]).includes(role)) {
      errors.push({
        path: `penalties.rolePenaltyTendencies.${role}`,
        message: 'Unknown skater role key',
      });
    }
    if (!(tier in penalties.rolePenaltyTendencyMultipliers)) {
      errors.push({
        path: `penalties.rolePenaltyTendencies.${role}`,
        message: `Unknown tendency tier ${tier}`,
      });
    }
  }

  const ppAttackTotal =
    penalties.powerPlayAttackWeights.offensiveRating +
    penalties.powerPlayAttackWeights.passing +
    penalties.powerPlayAttackWeights.shooting +
    penalties.powerPlayAttackWeights.offensiveAwareness +
    penalties.powerPlayAttackWeights.coachOffense;
  if (!(ppAttackTotal > 0)) {
    errors.push({
      path: 'penalties.powerPlayAttackWeights',
      message: 'Power-play attack weights must sum > 0',
    });
  }

  const pkDefenseTotal =
    penalties.penaltyKillDefenseWeights.defensiveRating +
    penalties.penaltyKillDefenseWeights.defensiveAwareness +
    penalties.penaltyKillDefenseWeights.speed +
    penalties.penaltyKillDefenseWeights.strength +
    penalties.penaltyKillDefenseWeights.coachDefense;
  if (!(pkDefenseTotal > 0)) {
    errors.push({
      path: 'penalties.penaltyKillDefenseWeights',
      message: 'Penalty-kill defense weights must sum > 0',
    });
  }

  return errors;
}

export function isF11CompatibleBalanceConfig(
  config: BalanceConfig,
): config is BalanceConfig & { match: MatchBalanceSection } {
  return config.match.active === true && config.schemaVersion >= 2;
}

export function isF12CompatibleBalanceConfig(
  config: BalanceConfig,
): config is BalanceConfig & {
  match: MatchBalanceSection;
  shots: ShotsBalanceSection;
  goalies: GoaliesBalanceSection;
} {
  return (
    config.schemaVersion >= 3 &&
    config.match.active === true &&
    config.shots.active === true &&
    config.goalies.active === true
  );
}

export function isF13CompatibleBalanceConfig(
  config: BalanceConfig,
): config is BalanceConfig & {
  match: MatchBalanceSection;
  shots: ShotsBalanceSection;
  goalies: GoaliesBalanceSection;
  penalties: PenaltiesBalanceSection;
} {
  return (
    config.schemaVersion >= 4 &&
    config.match.active === true &&
    config.shots.active === true &&
    config.goalies.active === true &&
    config.penalties.active === true
  );
}

export function validateBalanceConfig(input: unknown): BalanceValidationResult {
  const parsed = balanceConfigSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, errors: zodIssues(parsed.error) };
  }
  const config = parsed.data as BalanceConfig;
  const semantic = [
    ...chemistrySemanticErrors(config),
    ...matchSemanticErrors(config),
    ...shotsSemanticErrors(config),
    ...goaliesSemanticErrors(config),
    ...penaltiesSemanticErrors(config),
  ];
  if (semantic.length) return { ok: false, errors: semantic };
  return { ok: true, config };
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
