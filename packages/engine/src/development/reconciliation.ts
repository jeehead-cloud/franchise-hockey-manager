import { recalculateCurrentAbility, deriveRoleAfter } from './role.js';
import { hashPlayerDevelopmentResult } from './hashing.js';
import type {
  DevelopmentPlayerInput,
  DevelopmentPlayerResult,
  PlayerDevelopmentConfig,
} from './types.js';
import { PlayerDevelopmentError } from './types.js';

export interface ReconciliationIssue {
  code: string;
  playerId?: string;
  message: string;
}

/**
 * Validate a complete development result set before publication.
 */
export function reconcileDevelopmentResults(input: {
  eligiblePlayerIds: string[];
  results: DevelopmentPlayerResult[];
  inputsByPlayerId: Map<string, DevelopmentPlayerInput>;
  config: PlayerDevelopmentConfig;
}): { ok: true } | { ok: false; issues: ReconciliationIssue[] } {
  const issues: ReconciliationIssue[] = [];
  const eligible = new Set(input.eligiblePlayerIds);
  const seen = new Set<string>();

  if (input.results.length !== input.eligiblePlayerIds.length) {
    issues.push({
      code: 'RESULT_COUNT_MISMATCH',
      message: `Expected ${input.eligiblePlayerIds.length} results, got ${input.results.length}`,
    });
  }

  for (const result of input.results) {
    if (seen.has(result.playerId)) {
      issues.push({
        code: 'DUPLICATE_RESULT',
        playerId: result.playerId,
        message: 'Duplicate player result',
      });
    }
    seen.add(result.playerId);

    if (!eligible.has(result.playerId)) {
      issues.push({
        code: 'INELIGIBLE_PLAYER',
        playerId: result.playerId,
        message: 'Result for ineligible player',
      });
    }

    const src = input.inputsByPlayerId.get(result.playerId);
    if (!src) {
      issues.push({
        code: 'MISSING_INPUT',
        playerId: result.playerId,
        message: 'Missing frozen input',
      });
      continue;
    }

    if (result.potentialCeiling !== src.potentialCeiling) {
      issues.push({
        code: 'POTENTIAL_CHANGED',
        playerId: result.playerId,
        message: 'Potential must remain unchanged',
      });
    }

    for (const ch of result.attributeChanges) {
      if (ch.beforeValue + ch.delta !== ch.afterValue) {
        issues.push({
          code: 'ATTRIBUTE_DELTA_MISMATCH',
          playerId: result.playerId,
          message: `Attribute ${ch.attributeKey} delta mismatch`,
        });
      }
      if (
        ch.afterValue < input.config.attributeLimits.minimum ||
        ch.afterValue > input.config.attributeLimits.maximum
      ) {
        issues.push({
          code: 'ATTRIBUTE_OUT_OF_BOUNDS',
          playerId: result.playerId,
          message: `Attribute ${ch.attributeKey} out of bounds`,
        });
      }
      if (result.attributesAfter[ch.attributeKey] !== ch.afterValue) {
        issues.push({
          code: 'ATTRIBUTE_AFTER_MISMATCH',
          playerId: result.playerId,
          message: `Attribute ${ch.attributeKey} after map mismatch`,
        });
      }
    }

    let expectedAbility: number;
    let expectedRole: string;
    try {
      expectedAbility = recalculateCurrentAbility(
        result.playerType,
        result.attributesAfter,
      );
      expectedRole = deriveRoleAfter(
        result.playerType,
        result.position,
        result.attributesAfter,
      );
    } catch (err) {
      issues.push({
        code: 'RECALC_FAILED',
        playerId: result.playerId,
        message: err instanceof Error ? err.message : 'recalc failed',
      });
      continue;
    }

    if (expectedAbility !== result.currentAbilityAfter) {
      issues.push({
        code: 'ABILITY_MISMATCH',
        playerId: result.playerId,
        message: `Ability ${result.currentAbilityAfter} != derived ${expectedAbility}`,
      });
    }
    if (expectedRole !== result.roleAfter) {
      issues.push({
        code: 'ROLE_MISMATCH',
        playerId: result.playerId,
        message: `Role ${result.roleAfter} != derived ${expectedRole}`,
      });
    }

    if (
      result.form.formAfter < input.config.form.minimum ||
      result.form.formAfter > input.config.form.maximum
    ) {
      issues.push({
        code: 'FORM_OUT_OF_BOUNDS',
        playerId: result.playerId,
        message: 'Form out of bounds',
      });
    }

    if (result.retired && result.lifecycleAfter !== 'RETIRED') {
      issues.push({
        code: 'RETIREMENT_LIFECYCLE',
        playerId: result.playerId,
        message: 'Retired player must have RETIRED lifecycle',
      });
    }
    if (!result.retired && result.lifecycleAfter === 'RETIRED') {
      issues.push({
        code: 'RETIREMENT_LIFECYCLE',
        playerId: result.playerId,
        message: 'Non-retired result marked RETIRED',
      });
    }

    const expectedHash = hashPlayerDevelopmentResult({ ...result, resultHash: '' });
    if (expectedHash !== result.resultHash) {
      issues.push({
        code: 'RESULT_HASH_MISMATCH',
        playerId: result.playerId,
        message: 'Player result hash mismatch',
      });
    }
  }

  for (const id of eligible) {
    if (!seen.has(id)) {
      issues.push({
        code: 'MISSING_RESULT',
        playerId: id,
        message: 'Eligible player missing result',
      });
    }
  }

  if (issues.length > 0) return { ok: false, issues };
  return { ok: true };
}

export function assertReconciliation(
  input: Parameters<typeof reconcileDevelopmentResults>[0],
): void {
  const r = reconcileDevelopmentResults(input);
  if (!r.ok) {
    throw new PlayerDevelopmentError(
      'DevelopmentReconciliationFailed',
      `Reconciliation failed with ${r.issues.length} issue(s)`,
      r.issues,
    );
  }
}
