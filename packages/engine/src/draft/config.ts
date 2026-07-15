import type { DraftConfig } from './types.js';
import { DRAFT_SCHEMA_VERSION, DraftError } from './types.js';

/**
 * Fictional development default (not NHL-accurate).
 * Mirrors the suggested preset shape from the F27 task brief.
 */
export function defaultDraftConfig(): DraftConfig {
  return {
    schemaVersion: DRAFT_SCHEMA_VERSION,
    name: 'Amateur Draft Default',
    rounds: 7,
    eligibility: {
      minimumAge: 18,
      maximumAge: 20,
      cutoffDate: '2028-09-15',
      allowedLifecycleStatuses: ['PROSPECT'],
      allowedSourceTypes: ['GENERATED_YOUTH', 'IMPORTED', 'MANUAL'],
      requireUnsigned: true,
      excludeAlreadyDrafted: true,
    },
    order: {
      source: 'REVERSE_STANDINGS',
      repeatSameOrderEachRound: true,
    },
    lottery: {
      enabled: true,
      eligibleTeamCount: 8,
      drawCount: 2,
      maximumMoveUp: 6,
      weights: [18, 16, 14, 12, 10, 8, 6, 4],
    },
    autoPick: {
      estimatedPotentialWeight: 0.45,
      estimatedCurrentAbilityWeight: 0.2,
      confidenceWeight: 0.15,
      projectedRoleWeight: 0.1,
      riskPenaltyWeight: 0.1,
      watchlistPriorityBonus: 0.05,
    },
  };
}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function reqNumber(obj: Record<string, unknown>, key: string, label: string): number {
  const v = obj[key];
  if (typeof v !== 'number' || !Number.isFinite(v)) {
    throw new DraftError('InvalidDraftConfig', `${label} must be a finite number`);
  }
  return v;
}

function reqNonNeg(obj: Record<string, unknown>, key: string, label: string): number {
  const v = reqNumber(obj, key, label);
  if (v < 0) throw new DraftError('InvalidDraftConfig', `${label} must be ≥ 0`);
  return v;
}

function reqInt(obj: Record<string, unknown>, key: string, label: string): number {
  const v = reqNumber(obj, key, label);
  if (!Number.isInteger(v)) throw new DraftError('InvalidDraftConfig', `${label} must be an integer`);
  return v;
}

function reqPositiveInt(obj: Record<string, unknown>, key: string, label: string): number {
  const v = reqInt(obj, key, label);
  if (v < 1) throw new DraftError('InvalidDraftConfig', `${label} must be a positive integer`);
  return v;
}

function reqString(obj: Record<string, unknown>, key: string, label: string): string {
  const v = obj[key];
  if (typeof v !== 'string' || !v.trim()) {
    throw new DraftError('InvalidDraftConfig', `${label} must be a non-empty string`);
  }
  return v.trim();
}

function reqBool(obj: Record<string, unknown>, key: string, label: string): boolean {
  const v = obj[key];
  if (typeof v !== 'boolean') throw new DraftError('InvalidDraftConfig', `${label} must be boolean`);
  return v;
}

function reqStringArray(obj: Record<string, unknown>, key: string, label: string): string[] {
  const v = obj[key];
  if (!Array.isArray(v) || v.some((x) => typeof x !== 'string' || !x.trim())) {
    throw new DraftError('InvalidDraftConfig', `${label} must be an array of non-empty strings`);
  }
  return v.slice();
}

function onlyKeys(value: Record<string, unknown>, keys: readonly string[], label: string): void {
  for (const key of Object.keys(value)) {
    if (!keys.includes(key)) {
      throw new DraftError('InvalidDraftConfig', `Unknown ${label} field: ${key}`);
    }
  }
}

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function parseIsoDate(value: string, label: string): string {
  if (!ISO_DATE_RE.test(value)) {
    throw new DraftError('InvalidDraftConfig', `${label} must be a YYYY-MM-DD date`);
  }
  const [y, m, d] = value.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (
    dt.getUTCFullYear() !== y ||
    dt.getUTCMonth() !== m - 1 ||
    dt.getUTCDate() !== d
  ) {
    throw new DraftError('InvalidDraftConfig', `${label} is not a valid calendar date`);
  }
  return value;
}

/**
 * Strictly parse + validate a versioned, fictional draft configuration.
 * Unknown fields are rejected so versioning stays explicit.
 */
export function validateDraftConfig(raw: unknown): DraftConfig {
  if (!isObject(raw)) throw new DraftError('InvalidDraftConfig', 'Config must be an object');

  onlyKeys(raw, ['schemaVersion', 'name', 'rounds', 'eligibility', 'order', 'lottery', 'autoPick'], 'config');
  if (raw.schemaVersion !== DRAFT_SCHEMA_VERSION) {
    throw new DraftError('InvalidDraftConfig', `Unsupported schemaVersion (expected ${DRAFT_SCHEMA_VERSION})`);
  }

  const rounds = reqPositiveInt(raw, 'rounds', 'rounds');
  const name = reqString(raw, 'name', 'name');

  if (!isObject(raw.eligibility)) throw new DraftError('InvalidDraftConfig', 'eligibility section required');
  onlyKeys(raw.eligibility, [
    'minimumAge',
    'maximumAge',
    'cutoffDate',
    'allowedLifecycleStatuses',
    'allowedSourceTypes',
    'requireUnsigned',
    'excludeAlreadyDrafted',
  ], 'eligibility');
  const minimumAge = reqPositiveInt(raw.eligibility, 'minimumAge', 'eligibility.minimumAge');
  const maximumAge = reqPositiveInt(raw.eligibility, 'maximumAge', 'eligibility.maximumAge');
  if (maximumAge < minimumAge) {
    throw new DraftError('InvalidDraftConfig', 'eligibility.maximumAge must be ≥ minimumAge');
  }
  const cutoffDate = parseIsoDate(reqString(raw.eligibility, 'cutoffDate', 'eligibility.cutoffDate'), 'eligibility.cutoffDate');
  const allowedLifecycleStatuses = reqStringArray(raw.eligibility, 'allowedLifecycleStatuses', 'eligibility.allowedLifecycleStatuses');
  const allowedSourceTypes = reqStringArray(raw.eligibility, 'allowedSourceTypes', 'eligibility.allowedSourceTypes');
  const requireUnsigned = reqBool(raw.eligibility, 'requireUnsigned', 'eligibility.requireUnsigned');
  const excludeAlreadyDrafted = reqBool(raw.eligibility, 'excludeAlreadyDrafted', 'eligibility.excludeAlreadyDrafted');

  if (!isObject(raw.order)) throw new DraftError('InvalidDraftConfig', 'order section required');
  onlyKeys(raw.order, ['source', 'repeatSameOrderEachRound'], 'order');
  if (raw.order.source !== 'REVERSE_STANDINGS' && raw.order.source !== 'MANUAL') {
    throw new DraftError('InvalidDraftConfig', 'order.source must be REVERSE_STANDINGS or MANUAL');
  }
  const repeatSameOrderEachRound = reqBool(raw.order, 'repeatSameOrderEachRound', 'order.repeatSameOrderEachRound');

  if (!isObject(raw.lottery)) throw new DraftError('InvalidDraftConfig', 'lottery section required');
  onlyKeys(raw.lottery, ['enabled', 'eligibleTeamCount', 'drawCount', 'maximumMoveUp', 'weights'], 'lottery');
  const lotteryEnabled = reqBool(raw.lottery, 'enabled', 'lottery.enabled');
  const eligibleTeamCount = reqPositiveInt(raw.lottery, 'eligibleTeamCount', 'lottery.eligibleTeamCount');
  const drawCount = reqNonNeg(raw.lottery, 'drawCount', 'lottery.drawCount');
  const maximumMoveUp = reqPositiveInt(raw.lottery, 'maximumMoveUp', 'lottery.maximumMoveUp');
  const weightsRaw = raw.lottery.weights;
  if (!Array.isArray(weightsRaw) || weightsRaw.some((x) => typeof x !== 'number' || !Number.isFinite(x) || x < 0)) {
    throw new DraftError('InvalidDraftConfig', 'lottery.weights must be an array of non-negative finite numbers');
  }
  const weights = weightsRaw as number[];
  if (weights.length !== eligibleTeamCount) {
    throw new DraftError(
      'InvalidDraftConfig',
      `lottery.weights length (${weights.length}) must equal eligibleTeamCount (${eligibleTeamCount})`,
    );
  }
  if (weights.every((w) => w === 0)) {
    throw new DraftError('InvalidDraftConfig', 'lottery.weights must contain at least one positive weight');
  }
  if (lotteryEnabled) {
    if (drawCount < 1) {
      throw new DraftError('InvalidDraftConfig', 'lottery.drawCount must be ≥ 1 when lottery is enabled');
    }
    if (drawCount > eligibleTeamCount) {
      throw new DraftError('InvalidDraftConfig', 'lottery.drawCount cannot exceed eligibleTeamCount');
    }
    if (maximumMoveUp > eligibleTeamCount - 1) {
      throw new DraftError('InvalidDraftConfig', 'lottery.maximumMoveUp cannot exceed eligibleTeamCount - 1');
    }
  }

  if (!isObject(raw.autoPick)) throw new DraftError('InvalidDraftConfig', 'autoPick section required');
  onlyKeys(raw.autoPick, [
    'estimatedPotentialWeight',
    'estimatedCurrentAbilityWeight',
    'confidenceWeight',
    'projectedRoleWeight',
    'riskPenaltyWeight',
    'watchlistPriorityBonus',
  ], 'autoPick');
  const autoPick = {
    estimatedPotentialWeight: reqNonNeg(raw.autoPick, 'estimatedPotentialWeight', 'autoPick.estimatedPotentialWeight'),
    estimatedCurrentAbilityWeight: reqNonNeg(raw.autoPick, 'estimatedCurrentAbilityWeight', 'autoPick.estimatedCurrentAbilityWeight'),
    confidenceWeight: reqNonNeg(raw.autoPick, 'confidenceWeight', 'autoPick.confidenceWeight'),
    projectedRoleWeight: reqNonNeg(raw.autoPick, 'projectedRoleWeight', 'autoPick.projectedRoleWeight'),
    riskPenaltyWeight: reqNonNeg(raw.autoPick, 'riskPenaltyWeight', 'autoPick.riskPenaltyWeight'),
    watchlistPriorityBonus: reqNonNeg(raw.autoPick, 'watchlistPriorityBonus', 'autoPick.watchlistPriorityBonus'),
  };

  return {
    schemaVersion: DRAFT_SCHEMA_VERSION,
    name,
    rounds,
    eligibility: {
      minimumAge,
      maximumAge,
      cutoffDate,
      allowedLifecycleStatuses,
      allowedSourceTypes,
      requireUnsigned,
      excludeAlreadyDrafted,
    },
    order: { source: raw.order.source, repeatSameOrderEachRound },
    lottery: {
      enabled: lotteryEnabled,
      eligibleTeamCount,
      drawCount,
      maximumMoveUp,
      weights,
    },
    autoPick,
  };
}
