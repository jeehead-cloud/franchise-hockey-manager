import { sortJsonValue } from '../balance/canonicalize.js';
import { PLAYER_MODEL_CONFIG } from '../players/validation.js';
import type { PlayerDevelopmentConfig } from './types.js';
import {
  PLAYER_DEVELOPMENT_SCHEMA_VERSION,
  PlayerDevelopmentError,
} from './types.js';

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function reqNumber(obj: Record<string, unknown>, key: string): number {
  const v = obj[key];
  if (typeof v !== 'number' || !Number.isFinite(v)) {
    throw new PlayerDevelopmentError(
      'InvalidDevelopmentConfiguration',
      `Invalid ${key}: expected finite number`,
    );
  }
  return v;
}

function reqInt(obj: Record<string, unknown>, key: string): number {
  const v = reqNumber(obj, key);
  if (!Number.isInteger(v)) {
    throw new PlayerDevelopmentError(
      'InvalidDevelopmentConfiguration',
      `Invalid ${key}: expected integer`,
    );
  }
  return v;
}

function reqProb(obj: Record<string, unknown>, key: string): number {
  const v = reqNumber(obj, key);
  if (v < 0 || v > 1) {
    throw new PlayerDevelopmentError(
      'InvalidDevelopmentConfiguration',
      `Invalid ${key}: expected 0–1`,
    );
  }
  return v;
}

function parseAgeCurve(raw: unknown, label: string) {
  if (!isObject(raw)) {
    throw new PlayerDevelopmentError(
      'InvalidDevelopmentConfiguration',
      `${label} age curve required`,
    );
  }
  const curve = {
    earlyDevelopmentStart: reqInt(raw, 'earlyDevelopmentStart'),
    rapidDevelopmentEnd: reqInt(raw, 'rapidDevelopmentEnd'),
    primeStart: reqInt(raw, 'primeStart'),
    primeEnd: reqInt(raw, 'primeEnd'),
    declineStart: reqInt(raw, 'declineStart'),
    steepDeclineStart: reqInt(raw, 'steepDeclineStart'),
  };
  const ordered = [
    curve.earlyDevelopmentStart,
    curve.rapidDevelopmentEnd,
    curve.primeStart,
    curve.primeEnd,
    curve.declineStart,
    curve.steepDeclineStart,
  ];
  for (let i = 1; i < ordered.length; i += 1) {
    if (ordered[i]! < ordered[i - 1]!) {
      throw new PlayerDevelopmentError(
        'InvalidDevelopmentConfiguration',
        `${label} age curve boundaries must be non-decreasing`,
      );
    }
  }
  return curve;
}

/** Default simplified development curves — not NHL-calibrated. */
export function getDefaultPlayerDevelopmentConfig(): PlayerDevelopmentConfig {
  return {
    schemaVersion: PLAYER_DEVELOPMENT_SCHEMA_VERSION,
    ageCurves: {
      skater: {
        earlyDevelopmentStart: 16,
        rapidDevelopmentEnd: 21,
        primeStart: 24,
        primeEnd: 29,
        declineStart: 30,
        steepDeclineStart: 35,
      },
      goalie: {
        earlyDevelopmentStart: 17,
        rapidDevelopmentEnd: 23,
        primeStart: 26,
        primeEnd: 32,
        declineStart: 33,
        steepDeclineStart: 37,
      },
    },
    annualBudget: {
      minimum: -8,
      maximum: 8,
      youngBase: 4,
      primeBase: 0,
      declineBase: -2,
      steepDeclineBase: -4,
    },
    potential: {
      ceilingSoftness: 0.35,
      overPotentialTolerance: 0,
      lowPotentialGrowthPenalty: 0.7,
    },
    variance: {
      developmentRandomness: 0.22,
      declineRandomness: 0.18,
      attributeRandomness: 0.15,
    },
    form: {
      annualRegressionToMean: 0.65,
      minimum: -10,
      maximum: 10,
    },
    retirement: {
      minimumEvaluationAgeSkater: 34,
      minimumEvaluationAgeGoalie: 36,
      forcedRetirementAge: 45,
      baseProbabilityAtMinimumAge: 0.05,
      annualProbabilityGrowth: 0.09,
      lowAbilityModifier: 0.12,
      unsignedModifier: 0.08,
    },
    attributeLimits: {
      minimum: PLAYER_MODEL_CONFIG.attributeMin,
      maximum: PLAYER_MODEL_CONFIG.attributeMax,
    },
  };
}

export function validatePlayerDevelopmentConfig(raw: unknown): PlayerDevelopmentConfig {
  if (!isObject(raw)) {
    throw new PlayerDevelopmentError(
      'InvalidDevelopmentConfiguration',
      'Config must be an object',
    );
  }
  const known = new Set([
    'schemaVersion',
    'ageCurves',
    'annualBudget',
    'potential',
    'variance',
    'form',
    'retirement',
    'attributeLimits',
  ]);
  for (const key of Object.keys(raw)) {
    if (!known.has(key)) {
      throw new PlayerDevelopmentError(
        'InvalidDevelopmentConfiguration',
        `Unknown field: ${key}`,
      );
    }
  }
  if (raw.schemaVersion !== PLAYER_DEVELOPMENT_SCHEMA_VERSION) {
    throw new PlayerDevelopmentError(
      'InvalidDevelopmentConfiguration',
      `Unsupported schemaVersion (expected ${PLAYER_DEVELOPMENT_SCHEMA_VERSION})`,
    );
  }
  if (!isObject(raw.ageCurves)) {
    throw new PlayerDevelopmentError(
      'InvalidDevelopmentConfiguration',
      'ageCurves required',
    );
  }
  const ageCurves = {
    skater: parseAgeCurve(raw.ageCurves.skater, 'skater'),
    goalie: parseAgeCurve(raw.ageCurves.goalie, 'goalie'),
  };

  if (!isObject(raw.annualBudget)) {
    throw new PlayerDevelopmentError(
      'InvalidDevelopmentConfiguration',
      'annualBudget required',
    );
  }
  const annualBudget = {
    minimum: reqInt(raw.annualBudget, 'minimum'),
    maximum: reqInt(raw.annualBudget, 'maximum'),
    youngBase: reqInt(raw.annualBudget, 'youngBase'),
    primeBase: reqInt(raw.annualBudget, 'primeBase'),
    declineBase: reqInt(raw.annualBudget, 'declineBase'),
    steepDeclineBase: reqInt(raw.annualBudget, 'steepDeclineBase'),
  };
  if (annualBudget.minimum > annualBudget.maximum) {
    throw new PlayerDevelopmentError(
      'InvalidDevelopmentConfiguration',
      'annualBudget.minimum must be ≤ maximum',
    );
  }

  if (!isObject(raw.potential)) {
    throw new PlayerDevelopmentError(
      'InvalidDevelopmentConfiguration',
      'potential required',
    );
  }
  const potential = {
    ceilingSoftness: reqProb(raw.potential, 'ceilingSoftness'),
    overPotentialTolerance: reqNumber(raw.potential, 'overPotentialTolerance'),
    lowPotentialGrowthPenalty: reqNumber(raw.potential, 'lowPotentialGrowthPenalty'),
  };

  if (!isObject(raw.variance)) {
    throw new PlayerDevelopmentError(
      'InvalidDevelopmentConfiguration',
      'variance required',
    );
  }
  const variance = {
    developmentRandomness: reqProb(raw.variance, 'developmentRandomness'),
    declineRandomness: reqProb(raw.variance, 'declineRandomness'),
    attributeRandomness: reqProb(raw.variance, 'attributeRandomness'),
  };

  if (!isObject(raw.form)) {
    throw new PlayerDevelopmentError('InvalidDevelopmentConfiguration', 'form required');
  }
  const form = {
    annualRegressionToMean: reqProb(raw.form, 'annualRegressionToMean'),
    minimum: reqInt(raw.form, 'minimum'),
    maximum: reqInt(raw.form, 'maximum'),
  };
  if (form.minimum > form.maximum) {
    throw new PlayerDevelopmentError(
      'InvalidDevelopmentConfiguration',
      'form.minimum must be ≤ maximum',
    );
  }

  if (!isObject(raw.retirement)) {
    throw new PlayerDevelopmentError(
      'InvalidDevelopmentConfiguration',
      'retirement required',
    );
  }
  const retirement = {
    minimumEvaluationAgeSkater: reqInt(raw.retirement, 'minimumEvaluationAgeSkater'),
    minimumEvaluationAgeGoalie: reqInt(raw.retirement, 'minimumEvaluationAgeGoalie'),
    forcedRetirementAge: reqInt(raw.retirement, 'forcedRetirementAge'),
    baseProbabilityAtMinimumAge: reqProb(raw.retirement, 'baseProbabilityAtMinimumAge'),
    annualProbabilityGrowth: reqProb(raw.retirement, 'annualProbabilityGrowth'),
    lowAbilityModifier: reqProb(raw.retirement, 'lowAbilityModifier'),
    unsignedModifier: reqProb(raw.retirement, 'unsignedModifier'),
  };

  if (!isObject(raw.attributeLimits)) {
    throw new PlayerDevelopmentError(
      'InvalidDevelopmentConfiguration',
      'attributeLimits required',
    );
  }
  const attributeLimits = {
    minimum: reqInt(raw.attributeLimits, 'minimum'),
    maximum: reqInt(raw.attributeLimits, 'maximum'),
  };
  if (attributeLimits.minimum > attributeLimits.maximum) {
    throw new PlayerDevelopmentError(
      'InvalidDevelopmentConfiguration',
      'attributeLimits.minimum must be ≤ maximum',
    );
  }

  return {
    schemaVersion: PLAYER_DEVELOPMENT_SCHEMA_VERSION,
    ageCurves,
    annualBudget,
    potential,
    variance,
    form,
    retirement,
    attributeLimits,
  };
}

export function canonicalizePlayerDevelopmentConfig(config: PlayerDevelopmentConfig): string {
  return JSON.stringify(sortJsonValue(config));
}
