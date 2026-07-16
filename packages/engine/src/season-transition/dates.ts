import { SeasonTransitionError } from './types.js';

/**
 * Construct a UTC date (YYYY-MM-DD) from explicit month/day components.
 * Transition dates are derived from explicit config components — never wall
 * clock. They are stored as ISO date strings to avoid timezone ambiguity.
 */
export function composeIsoDate(year: number, month: number, day: number): string {
  if (!Number.isInteger(year)) {
    throw new SeasonTransitionError('InvalidSeasonTransitionConfiguration', `Invalid year: ${year}`);
  }
  if (!Number.isInteger(month) || month < 1 || month > 12) {
    throw new SeasonTransitionError('InvalidSeasonTransitionConfiguration', `Invalid month: ${month}`);
  }
  const maxDay = daysInMonth(year, month);
  if (!Number.isInteger(day) || day < 1 || day > maxDay) {
    throw new SeasonTransitionError('InvalidSeasonTransitionConfiguration', `Invalid day ${day} for ${year}-${month}`);
  }
  const mm = String(month).padStart(2, '0');
  const dd = String(day).padStart(2, '0');
  return `${year}-${mm}-${dd}`;
}

/** Extract the year component from an ISO date string (YYYY-MM-DD or full ISO). */
export function yearFromIso(iso: string): number {
  const match = /^(\d{4})/.exec(iso);
  if (!match) throw new SeasonTransitionError('InvalidSeasonTransitionConfiguration', `Unparseable date: ${iso}`);
  return Number(match[1]);
}

function daysInMonth(year: number, month: number): number {
  // Month is 1-based. February leap-year aware.
  if (month === 2) {
    const leap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
    return leap ? 29 : 28;
  }
  return [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1]!;
}

/**
 * Player age visibility helper — derive completed years on a reference date
 * from a birth date. F31 never mutates birth dates; age is always derived.
 * Both inputs are YYYY-MM-DD or full ISO strings.
 */
export function completedYearsOnDate(birthIso: string, referenceIso: string): number {
  const b = parseDateParts(birthIso);
  const r = parseDateParts(referenceIso);
  let age = r.year - b.year;
  if (r.month < b.month || (r.month === b.month && r.day < b.day)) age -= 1;
  return age;
}

function parseDateParts(iso: string): { year: number; month: number; day: number } {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!match) throw new SeasonTransitionError('InvalidSeasonTransitionConfiguration', `Unparseable date: ${iso}`);
  return { year: Number(match[1]), month: Number(match[2]), day: Number(match[3]) };
}
