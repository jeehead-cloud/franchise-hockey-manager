import { ageOnEffectiveDate } from '../development/age.js';
import { pickWeightedKey, seededUnit } from './distributions.js';
import type { WeightedAges } from './types.js';
import { YouthGenerationError } from './types.js';

export type YouthAge = 15 | 16 | 17;

/**
 * Generate a birth date such that age on referenceDate is exactly the target age.
 * Prefer a deterministic day-of-year offset within the birth year window.
 */
export function generateBirthDate(input: {
  age: YouthAge;
  referenceDate: string;
  baseSeed: string;
  countryKey: string;
  generationIndex: number;
}): string {
  const ref = parseIso(input.referenceDate, 'referenceDate');
  const birthYear = ref.getUTCFullYear() - input.age;

  // Pick month/day deterministically; avoid Feb 29 unless leap and valid.
  const dayOfYear = Math.floor(
    seededUnit(
      `${input.baseSeed}:country:${input.countryKey}:player:${input.generationIndex}:dob`,
    ) * 365,
  );
  const candidate = dayOfYearToDate(birthYear, dayOfYear);
  let y = candidate.y;
  let m = candidate.m;
  let d = candidate.d;

  // Ensure age matches exactly; if birthday is after reference month/day, age is age-1.
  let iso = formatIso(y, m, d);
  let age = ageOnEffectiveDate(iso, input.referenceDate);
  if (age !== input.age) {
    // Shift birth date earlier within the year so birthday has already occurred.
    // Use Jan 1 of birthYear as safe fallback when needed.
    iso = formatIso(birthYear, 1, 1);
    age = ageOnEffectiveDate(iso, input.referenceDate);
    if (age !== input.age) {
      // Reference before birthday of (birthYear+1) case — use day after last birthday window.
      iso = formatIso(birthYear, 6, 15);
      age = ageOnEffectiveDate(iso, input.referenceDate);
    }
  }
  if (age !== input.age) {
    throw new YouthGenerationError(
      'InvalidGeneratedPlayer',
      `Failed to generate DOB for age ${input.age} on ${input.referenceDate}`,
    );
  }
  if (iso > input.referenceDate) {
    throw new YouthGenerationError(
      'InvalidGeneratedPlayer',
      'Birth date cannot be after referenceDate',
    );
  }
  return iso;
}

export function pickAge(input: {
  ages: WeightedAges;
  baseSeed: string;
  countryKey: string;
  generationIndex: number;
}): YouthAge {
  const key = pickWeightedKey(
    `${input.baseSeed}:country:${input.countryKey}:player:${input.generationIndex}:age`,
    input.ages,
  );
  return Number(key) as YouthAge;
}

function parseIso(value: string, label: string): Date {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!m) {
    throw new YouthGenerationError('InvalidYouthGenerationRequest', `Invalid ${label}`);
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
    throw new YouthGenerationError('InvalidYouthGenerationRequest', `Invalid ${label}`);
  }
  return dt;
}

function isLeap(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

function dayOfYearToDate(year: number, dayOfYear: number): { y: number; m: number; d: number } {
  const lengths = [31, isLeap(year) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  let rem = Math.min(Math.max(dayOfYear, 0), isLeap(year) ? 365 : 364);
  for (let m = 0; m < 12; m += 1) {
    const len = lengths[m]!;
    if (rem < len) return { y: year, m: m + 1, d: rem + 1 };
    rem -= len;
  }
  return { y: year, m: 12, d: 31 };
}

function formatIso(y: number, m: number, d: number): string {
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}
