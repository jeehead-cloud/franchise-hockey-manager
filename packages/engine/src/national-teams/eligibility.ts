import type {
  EligibilityEvaluation,
  NationalTeamEligibilityRules,
  NationalTeamPlayerInput,
} from './types.js';

/** Age in completed years on cutoffDate (YYYY-MM-DD). Null if birthDate missing/invalid. */
export function ageOnCutoffDate(birthDate: string | null, cutoffDate: string): number | null {
  if (!birthDate || !/^\d{4}-\d{2}-\d{2}$/.test(birthDate)) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(cutoffDate)) return null;
  const [by, bm, bd] = birthDate.split('-').map(Number);
  const [cy, cm, cd] = cutoffDate.split('-').map(Number);
  if (!by || !bm || !bd || !cy || !cm || !cd) return null;
  let age = cy - by;
  if (cm < bm || (cm === bm && cd < bd)) age -= 1;
  return age;
}

function nationalityMatches(
  player: NationalTeamPlayerInput,
  countryId: string,
  mode: NationalTeamEligibilityRules['nationalityRule']['mode'],
): boolean {
  if (mode === 'PRIMARY_NATIONALITY') {
    return player.primaryNationalityCountryId === countryId;
  }
  if (mode === 'ANY_CITIZENSHIP') {
    if (player.primaryNationalityCountryId === countryId) return true;
    return player.citizenshipCountryIds.includes(countryId);
  }
  // BIRTH_COUNTRY_OR_CITIZENSHIP — birthCountry not modeled yet; fall back to primary + citizenship
  if (player.birthCountryId === countryId) return true;
  if (player.primaryNationalityCountryId === countryId) return true;
  return player.citizenshipCountryIds.includes(countryId);
}

/**
 * Deterministic eligibility for one player against edition rules and national-team country.
 * Does not use hidden potential or wall-clock dates.
 */
export function evaluatePlayerEligibility(input: {
  player: NationalTeamPlayerInput;
  countryId: string;
  rules: NationalTeamEligibilityRules;
}): EligibilityEvaluation {
  const { player, countryId, rules } = input;
  const reasons: string[] = [];

  if (player.activeStatus === 'INACTIVE') {
    reasons.push('Player is inactive');
  }
  if (player.activeStatus === 'UNSIGNED' && !rules.selection.allowUnsigned) {
    reasons.push('Unsigned players are not allowed');
  }
  if (player.injuryStatus === 'INJURED' && !rules.selection.allowInjured) {
    reasons.push('Injured players are not allowed');
  }
  if (!nationalityMatches(player, countryId, rules.nationalityRule.mode)) {
    reasons.push('Nationality/citizenship does not match national team country');
  }

  let ageAtCutoff: number | null = null;
  if (rules.ageRule.mode === 'MAX_AGE_ON_DATE') {
    const cutoff = rules.ageRule.cutoffDate!;
    const maxAge = rules.ageRule.maxAge!;
    ageAtCutoff = ageOnCutoffDate(player.birthDate, cutoff);
    if (ageAtCutoff === null) {
      reasons.push('Missing or invalid birth date for age eligibility');
    } else if (ageAtCutoff > maxAge) {
      reasons.push(`Age ${ageAtCutoff} exceeds maxAge ${maxAge} on ${cutoff}`);
    }
  }

  const ability = Math.max(player.currentAbility, player.effectivePerformance);
  if (ability < rules.selection.minimumEligibleAbility) {
    reasons.push(
      `Ability ${ability.toFixed(1)} below minimum ${rules.selection.minimumEligibleAbility}`,
    );
  }

  return {
    playerId: player.playerId,
    status: reasons.length === 0 ? 'ELIGIBLE' : 'INELIGIBLE',
    reasons,
    ageAtCutoff,
  };
}

export function evaluateCandidatePool(input: {
  players: NationalTeamPlayerInput[];
  countryId: string;
  rules: NationalTeamEligibilityRules;
}): EligibilityEvaluation[] {
  return [...input.players]
    .sort((a, b) => a.playerId.localeCompare(b.playerId))
    .map((player) =>
      evaluatePlayerEligibility({ player, countryId: input.countryId, rules: input.rules }),
    );
}
