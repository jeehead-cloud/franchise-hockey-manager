import chemistryWeights from '../config/chemistry-weights.json' with { type: 'json' };
import roleCompatibility from '../config/role-compatibility.json' with { type: 'json' };
import personalityCompatibility from '../config/personality-compatibility.json' with { type: 'json' };
import coachFit from '../config/coach-fit.json' with { type: 'json' };
import tacticalFit from '../config/tactical-fit.json' with { type: 'json' };
import playerModel from '../config/player-model.json' with { type: 'json' };
import ratingWeights from '../config/rating-weights.json' with { type: 'json' };
import skaterRoles from '../config/skater-roles.json' with { type: 'json' };
import goalieRoles from '../config/goalie-roles.json' with { type: 'json' };
import { parseBalanceConfig } from './schema.js';
import type {
  BalanceConfig,
  GoaliesBalanceSection,
  PenaltiesBalanceSection,
  RolePenaltyTendencyTier,
  RoleShotTendencyTier,
  RuntimeSimulationSettings,
  ShotsBalanceSection,
} from './types.js';
import { BALANCE_SCHEMA_VERSION, PENALTY_INFRACTIONS } from './types.js';

/** Keep in sync with simulation FHM_ENGINE_VERSION. */
const ENGINE_COMPAT_VERSION = 'f13.1';

const HIGH_SHOT_TENDENCY_ROLES = new Set([
  'POINT_SHOOTER',
  'POWER_FORWARD',
  'ROCKET',
  'ATTACKING_D',
  'DEFLECTOR',
  'SCREENER',
  'GARBAGE_COLLECTOR',
  'CHAOS_MAKER',
]);

const LOW_SHOT_TENDENCY_ROLES = new Set([
  'DEFENSIVE_D',
  'GRINDER',
  'ENFORCER',
  'SHADOW',
  'BACKCHECKER',
  'NZ_FORECHECKER',
  'CA_FORWARD',
  'DEEP_FORECHECKER',
  'INTERCEPTOR',
]);

const HIGH_PENALTY_TENDENCY_ROLES = new Set([
  'GRINDER',
  'ENFORCER',
  'CHAOS_MAKER',
  'DEEP_FORECHECKER',
  'NZ_FORECHECKER',
  'DUMP_IN_FORWARD',
]);

const LOW_PENALTY_TENDENCY_ROLES = new Set([
  'PLAYMAKER',
  'POSSESSION_MASTER',
  'QUARTERBACK',
  'PUCK_MOVER',
  'POINT_SHOOTER',
  'ROCKET',
]);

function roleShotTendency(role: string): RoleShotTendencyTier {
  if (HIGH_SHOT_TENDENCY_ROLES.has(role)) return 'high';
  if (LOW_SHOT_TENDENCY_ROLES.has(role)) return 'low';
  return 'medium';
}

function rolePenaltyTendency(role: string): RolePenaltyTendencyTier {
  if (HIGH_PENALTY_TENDENCY_ROLES.has(role)) return 'high';
  if (LOW_PENALTY_TENDENCY_ROLES.has(role)) return 'low';
  return 'medium';
}

function defaultRoleShotTendencies(): Record<string, RoleShotTendencyTier> {
  const labels = skaterRoles.labels as Record<string, string>;
  const out: Record<string, RoleShotTendencyTier> = {};
  for (const role of Object.keys(labels).sort()) {
    out[role] = roleShotTendency(role);
  }
  return out;
}

function defaultRolePenaltyTendencies(): Record<string, RolePenaltyTendencyTier> {
  const labels = skaterRoles.labels as Record<string, string>;
  const out: Record<string, RolePenaltyTendencyTier> = {};
  for (const role of Object.keys(labels).sort()) {
    out[role] = rolePenaltyTendency(role);
  }
  return out;
}

function defaultMatchSection() {
  return {
    active: true as const,
    regulationPeriods: 3,
    periodDurationSeconds: 1200,
    minimumShiftSeconds: 25,
    maximumShiftSeconds: 55,
    averageShiftSeconds: 40,
    minimumPossessionSeconds: 3,
    maximumPossessionSeconds: 18,
    stoppageSeconds: 4,
    homeIcePossessionBonus: 0.03,
    faceoffHomeAdvantage: 0.04,
    turnoverBaseProbability: 0.22,
    eventSafetyLimit: 15000,
    forwardLineUsageWeights: { F1: 0.3, F2: 0.27, F3: 0.24, F4: 0.19 },
    defensePairUsageWeights: { D1: 0.38, D2: 0.34, D3: 0.28 },
    zoneTransitionWeights: {
      neutralZoneEntry: 0.55,
      defensiveZoneExit: 0.5,
      offensiveHold: 0.35,
      offensiveTurnover: 0.4,
      offensiveStoppage: 0.25,
    },
    offensiveZoneShotOpportunityProbability: 0.28,
    offensiveZoneContinuedPossessionProbability: 0.15,
  };
}

export function defaultShotsSection(): ShotsBalanceSection {
  return {
    active: true,
    shotTypeWeights: {
      WRIST: 0.35,
      SNAP: 0.25,
      SLAP: 0.15,
      BACKHAND: 0.1,
      TIP: 0.08,
      DEFLECTION: 0.07,
    },
    roleShotTendencyMultipliers: {
      high: 1.15,
      medium: 1.0,
      low: 0.85,
    },
    roleShotTendencies: defaultRoleShotTendencies(),
    shooterAttributeWeights: {
      shooting: 0.55,
      offensiveAwareness: 0.3,
      currentAbility: 0.15,
    },
    shotQualityWeights: {
      shooting: 0.35,
      offensiveAwareness: 0.2,
      stickhandling: 0.15,
      attackingUnitEffectivePerformance: 0.15,
      defensivePressure: -0.15,
    },
    passQualityContribution: 0.08,
    screenContribution: 0.05,
    deflectionContribution: 0.1,
    defensivePressureWeights: {
      defensiveAwareness: 0.35,
      strength: 0.25,
      balance: 0.2,
      defendingUnitEffectivePerformance: 0.2,
    },
    blockProbability: 0.18,
    missProbability: 0.35,
    onTargetFloor: 0.25,
    onTargetCeiling: 0.92,
    goalProbabilityFloor: 0.03,
    goalProbabilityCeiling: 0.45,
    shotQualityVariance: 0.12,
  };
}

export function defaultGoaliesSection(): GoaliesBalanceSection {
  return {
    active: true,
    attributeWeightsByShotType: {
      WRIST: {
        reflexes: 0.2,
        positioning: 0.35,
        glove: 0.25,
        blocker: 0.1,
        consistency: 0.1,
      },
      SLAP: {
        positioning: 0.25,
        blocker: 0.35,
        reflexes: 0.2,
        movement: 0.1,
        consistency: 0.1,
      },
      SNAP: {
        reflexes: 0.25,
        positioning: 0.3,
        glove: 0.2,
        blocker: 0.15,
        consistency: 0.1,
      },
      BACKHAND: {
        positioning: 0.3,
        reflexes: 0.3,
        glove: 0.15,
        movement: 0.15,
        consistency: 0.1,
      },
      TIP: {
        reflexes: 0.4,
        positioning: 0.25,
        reboundControl: 0.2,
        consistency: 0.15,
      },
      DEFLECTION: {
        reflexes: 0.35,
        positioning: 0.25,
        reboundControl: 0.25,
        consistency: 0.15,
      },
    },
    saveProbabilityCurve: {
      intercept: 0.72,
      shotQualitySlope: -0.65,
    },
    consistencyVarianceEffect: 0.35,
    reboundOutcomeWeights: {
      controlled: 0.45,
      rebound: 0.3,
      frozen: 0.25,
    },
    screenPenalty: 0.08,
    lateralMovementEffect: 0.12,
  };
}

export function defaultPenaltiesSection(): PenaltiesBalanceSection {
  const equalInfractionWeight = 1 / PENALTY_INFRACTIONS.length;
  return {
    active: true,
    enabled: true,
    baseOpportunityProbability: 0.04,
    minimumSecondsBetweenPenalties: 45,
    durationSeconds: 120,
    infractionWeights: {
      TRIPPING: equalInfractionWeight,
      HOOKING: equalInfractionWeight,
      HOLDING: equalInfractionWeight,
      INTERFERENCE: equalInfractionWeight,
      SLASHING: equalInfractionWeight,
      ROUGHING: equalInfractionWeight,
    },
    aggressionWeight: 0.45,
    defensiveAwarenessWeight: 0.35,
    pressureWeight: 0.2,
    rolePenaltyTendencies: defaultRolePenaltyTendencies(),
    rolePenaltyTendencyMultipliers: {
      high: 1.25,
      medium: 1.0,
      low: 0.75,
    },
    penaltyVariance: 0.15,
    powerPlayPossessionModifier: 0.12,
    penaltyKillPossessionModifier: -0.08,
    powerPlayShotOpportunityModifier: 0.18,
    powerPlayShotQualityModifier: 0.08,
    shortHandedShotOpportunityModifier: -0.25,
    powerPlayAttackWeights: {
      offensiveRating: 0.3,
      passing: 0.2,
      shooting: 0.2,
      offensiveAwareness: 0.2,
      coachOffense: 0.1,
    },
    penaltyKillDefenseWeights: {
      defensiveRating: 0.3,
      defensiveAwareness: 0.25,
      speed: 0.2,
      strength: 0.15,
      coachDefense: 0.1,
    },
    maximumActivePenalties: 1,
    allowCoincidental: false,
    allowFiveOnThree: false,
    allowFourOnFour: false,
  };
}

function inactive(milestone: string, notes: string) {
  return {
    active: false as const,
    status: 'INACTIVE_UNTIL_MILESTONE' as const,
    milestone,
    notes,
  };
}

/** Compose the repository Standard balance preset from version-controlled JSON sources. */
export function getStandardBalanceConfig(): BalanceConfig {
  const raw = {
    schemaVersion: BALANCE_SCHEMA_VERSION,
    presetKey: 'standard',
    name: 'Standard',
    description: 'Default FHM balance configuration composed from repository engine JSON.',
    engineCompatibility: {
      minimumEngineVersion: ENGINE_COMPAT_VERSION,
    },
    randomness: {
      simulationRandomness: 0.5,
      eventVariance: 0.5,
      finishingVariance: 0.5,
      goalieVariance: 0.5,
      penaltyVariance: 0.5,
      upsetStrength: 0.5,
    },
    playerModel: {
      active: true as const,
      attributeMin: playerModel.attributeMin,
      attributeMax: playerModel.attributeMax,
      ratingMin: playerModel.ratingMin,
      ratingMax: playerModel.ratingMax,
      heroRatingMin: playerModel.heroRatingMin,
      heroRatingMax: playerModel.heroRatingMax,
      stabilityMin: playerModel.stabilityMin,
      stabilityMax: playerModel.stabilityMax,
      developmentRateMin: playerModel.developmentRateMin,
      developmentRateMax: playerModel.developmentRateMax,
      developmentRiskMin: playerModel.developmentRiskMin,
      developmentRiskMax: playerModel.developmentRiskMax,
      ratingWeights: ratingWeights as Record<string, unknown>,
      skaterRoles: skaterRoles as Record<string, unknown>,
      goalieRoles: goalieRoles as Record<string, unknown>,
      notes: playerModel.notes,
    },
    chemistry: {
      active: true as const,
      weights: chemistryWeights,
      roleCompatibility,
      personalityCompatibility,
      coachFit,
      tacticalFit,
    },
    tactics: {
      active: true as const,
      notes:
        'Coach-style and tactical preference matrices used by F9 live under chemistry.coachFit and chemistry.tacticalFit.',
    },
    match: defaultMatchSection(),
    shots: defaultShotsSection(),
    goalies: defaultGoaliesSection(),
    penalties: defaultPenaltiesSection(),
    development: inactive('F24', 'Annual development curves are deferred until F24.'),
    scouting: inactive('F26', 'Scouting confidence curves are deferred until F26.'),
    draft: inactive('F27', 'Draft lottery/order coefficients are deferred until F27.'),
    contracts: inactive('F28', 'Contract valuation coefficients are deferred until F28.'),
    aggregatedLeagues: inactive('F21', 'Aggregated league sim coefficients are deferred until F21.'),
  };

  return parseBalanceConfig(raw);
}

export function defaultRuntimeSimulationSettings(
  config: BalanceConfig = getStandardBalanceConfig(),
): RuntimeSimulationSettings {
  return {
    simulationRandomness: config.randomness.simulationRandomness,
    randomSeed: null,
    loggingLevel: 'STANDARD',
  };
}
