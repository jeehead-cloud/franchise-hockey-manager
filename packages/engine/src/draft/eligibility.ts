import { ageOnEffectiveDate } from '../development/age.js';
import { hashEligiblePlayer } from './hashing.js';
import type {
  DraftConfig,
  DraftEligiblePlayer,
  EligibilityPlayerInput,
  EligibilityResult,
} from './types.js';
import { DraftError } from './types.js';

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Completed years between an ISO date-of-birth and an explicit cutoff date.
 * Mirrors the F22/F24 "no wall clock" rule.
 */
export function draftAgeOnCutoffDate(dateOfBirth: string, cutoffDate: string): number {
  if (!ISO_DATE_RE.test(dateOfBirth)) {
    throw new DraftError('InvalidDraftInput', `dateOfBirth must be YYYY-MM-DD (got ${dateOfBirth})`);
  }
  return ageOnEffectiveDate(dateOfBirth, cutoffDate);
}

/**
 * Evaluate one player's draft eligibility from pure input.
 *
 * This function never receives or inspects true ability or true potential —
 * eligibility is structural (age against explicit cutoff, lifecycle, source
 * type, signed/owned state, prior draft rights).
 */
export function evaluateEligibility(
  config: DraftConfig,
  player: EligibilityPlayerInput,
): EligibilityResult {
  const reasons: string[] = [];
  const cutoff = config.eligibility.cutoffDate;
  let age = 0;
  try {
    age = draftAgeOnCutoffDate(player.dateOfBirth, cutoff);
  } catch (err) {
    return {
      playerId: player.playerId,
      eligible: false,
      ageOnCutoffDate: 0,
      reasons: [err instanceof Error ? err.message : 'Invalid dateOfBirth'],
    };
  }

  if (age < config.eligibility.minimumAge || age > config.eligibility.maximumAge) {
    reasons.push(
      `age ${age} outside [${config.eligibility.minimumAge}, ${config.eligibility.maximumAge}] on ${cutoff}`,
    );
  }
  if (!config.eligibility.allowedLifecycleStatuses.includes(player.lifecycleStatus)) {
    reasons.push(`lifecycle ${player.lifecycleStatus} not in allowed set`);
  }
  if (!config.eligibility.allowedSourceTypes.includes(player.sourceType)) {
    reasons.push(`source ${player.sourceType} not in allowed set`);
  }
  if (config.eligibility.requireUnsigned && player.currentTeamId !== null) {
    reasons.push('player is currently signed/owned by a club');
  }
  if (config.eligibility.excludeAlreadyDrafted && player.alreadyDrafted) {
    reasons.push('player already carries active draft rights');
  }

  return {
    playerId: player.playerId,
    eligible: reasons.length === 0,
    ageOnCutoffDate: age,
    reasons,
  };
}

/**
 * Build the frozen draft-eligibility class from the supplied prospect inputs.
 * Returns only eligible players, each carrying an immutable eligibility hash.
 *
 * No true potential/ability is stored on the snapshot.
 */
export function buildEligibilityClass(
  config: DraftConfig,
  players: EligibilityPlayerInput[],
  context?: {
    countrySnapshot?: (playerId: string) => string | null;
    positionSnapshot?: (playerId: string) => string | null;
  },
): { eligible: DraftEligiblePlayer[]; rejected: EligibilityResult[] } {
  const eligible: DraftEligiblePlayer[] = [];
  const rejected: EligibilityResult[] = [];
  for (const input of players) {
    const result = evaluateEligibility(config, input);
    if (!result.eligible) {
      rejected.push(result);
      continue;
    }
    const snapshot: DraftEligiblePlayer = {
      playerId: input.playerId,
      displayName: input.displayName,
      dateOfBirth: input.dateOfBirth,
      ageOnCutoffDate: result.ageOnCutoffDate,
      lifecycleStatus: input.lifecycleStatus,
      sourceType: input.sourceType,
      countrySnapshot: context?.countrySnapshot?.(input.playerId) ?? null,
      positionSnapshot: context?.positionSnapshot?.(input.playerId) ?? null,
      eligibilityHash: '',
    };
    snapshot.eligibilityHash = hashEligiblePlayer(snapshot);
    eligible.push(snapshot);
  }
  return { eligible, rejected };
}
