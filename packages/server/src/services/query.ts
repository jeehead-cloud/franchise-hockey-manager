import { badRequest } from '../http.js';

export const DEFAULT_PAGE = 1;
export const DEFAULT_PAGE_SIZE = 25;
export const MAX_PAGE_SIZE = 100;

export type SortDirection = 'asc' | 'desc';

export interface ParsedPagination {
  page: number;
  pageSize: number;
  skip: number;
}

export function parsePagination(query: Record<string, unknown>): ParsedPagination | { error: string } {
  const pageRaw = query.page;
  const sizeRaw = query.pageSize;

  const page =
    pageRaw === undefined || pageRaw === ''
      ? DEFAULT_PAGE
      : Number(pageRaw);
  const pageSize =
    sizeRaw === undefined || sizeRaw === ''
      ? DEFAULT_PAGE_SIZE
      : Number(sizeRaw);

  if (!Number.isInteger(page) || page < 1) {
    return { error: 'page must be a positive integer' };
  }
  if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > MAX_PAGE_SIZE) {
    return { error: `pageSize must be an integer between 1 and ${MAX_PAGE_SIZE}` };
  }

  return {
    page,
    pageSize,
    skip: (page - 1) * pageSize,
  };
}

export function parseDirection(raw: unknown): SortDirection {
  return raw === 'desc' ? 'desc' : 'asc';
}

export function parseOptionalString(raw: unknown): string | undefined {
  if (raw === undefined || raw === null || raw === '') return undefined;
  return String(raw);
}

export function parseEnum<T extends string>(
  raw: unknown,
  allowed: readonly T[],
  field: string,
): T | undefined | { error: string } {
  if (raw === undefined || raw === null || raw === '') return undefined;
  const value = String(raw) as T;
  if (!allowed.includes(value)) {
    return { error: `${field} must be one of: ${allowed.join(', ')}` };
  }
  return value;
}

export function isErrorResult(value: unknown): value is { error: string } {
  return Boolean(value && typeof value === 'object' && 'error' in value);
}

export function replyBadRequest(message: string, details?: unknown) {
  return {
    statusCode: 400 as const,
    body: badRequest(message, details),
  };
}

/**
 * Age as of 1 July of the active WorldSeason.startYear (hockey season reference).
 * Returns null when DOB or season year is missing / invalid.
 */
export function deriveAgeYears(
  dateOfBirth: Date,
  seasonStartYear: number | null | undefined,
): number | null {
  if (!seasonStartYear || !Number.isFinite(seasonStartYear)) return null;
  const reference = new Date(Date.UTC(seasonStartYear, 6, 1)); // July 1
  if (Number.isNaN(dateOfBirth.getTime())) return null;
  let age = reference.getUTCFullYear() - dateOfBirth.getUTCFullYear();
  const month = reference.getUTCMonth() - dateOfBirth.getUTCMonth();
  if (month < 0 || (month === 0 && reference.getUTCDate() < dateOfBirth.getUTCDate())) {
    age -= 1;
  }
  return age >= 0 && age < 120 ? age : null;
}
