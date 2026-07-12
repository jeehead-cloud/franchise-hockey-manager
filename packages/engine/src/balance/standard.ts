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
import type { BalanceConfig, RuntimeSimulationSettings } from './types.js';
import { BALANCE_SCHEMA_VERSION } from './types.js';

/** Keep in sync with packages/engine/src/index.ts ENGINE_VERSION. */
const ENGINE_COMPAT_VERSION = '0.1.0';

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
    match: inactive('F11', 'Match event engine probabilities are deferred until F11.'),
    shots: inactive('F12', 'Shot resolution coefficients are deferred until F12.'),
    goalies: inactive('F12', 'Goalie save resolution beyond F5 model is deferred until F12.'),
    penalties: inactive('F13', 'Penalty and special-teams coefficients are deferred until F13.'),
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
