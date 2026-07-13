import { PlayerDevelopmentError } from './types.js';

/**
 * Age in completed years on an explicit effective date (UTC calendar).
 * Does not use wall clock.
 */
export function ageOnEffectiveDate(birthDate: string, effectiveDate: string): number {
  const dob = parseIsoDate(birthDate, 'birthDate');
  const eff = parseIsoDate(effectiveDate, 'effectiveDate');
  if (eff.getTime() < dob.getTime()) {
    throw new PlayerDevelopmentError(
      'InvalidPlayerDevelopmentInput',
      'effectiveDate cannot precede birthDate',
    );
  }
  let age = eff.getUTCFullYear() - dob.getUTCFullYear();
  const m = eff.getUTCMonth() - dob.getUTCMonth();
  if (m < 0 || (m === 0 && eff.getUTCDate() < dob.getUTCDate())) {
    age -= 1;
  }
  return age;
}

function parseIsoDate(value: string, label: string): Date {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!m) {
    throw new PlayerDevelopmentError(
      'InvalidPlayerDevelopmentInput',
      `Invalid ${label}: expected YYYY-MM-DD`,
    );
  }
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  const dt = new Date(Date.UTC(y, mo - 1, d));
  if (
    dt.getUTCFullYear() !== y ||
    dt.getUTCMonth() !== mo - 1 ||
    dt.getUTCDate() !== d
  ) {
    throw new PlayerDevelopmentError(
      'InvalidPlayerDevelopmentInput',
      `Invalid ${label}: not a real calendar date`,
    );
  }
  return dt;
}

export type AgeBand = 'YOUNG' | 'PRIME' | 'DECLINE' | 'STEEP_DECLINE';

export function classifyAgeBand(
  age: number,
  curve: {
    rapidDevelopmentEnd: number;
    primeStart: number;
    primeEnd: number;
    declineStart: number;
    steepDeclineStart: number;
  },
): AgeBand {
  if (age <= curve.rapidDevelopmentEnd) return 'YOUNG';
  if (age < curve.declineStart) return 'PRIME';
  if (age < curve.steepDeclineStart) return 'DECLINE';
  return 'STEEP_DECLINE';
}
