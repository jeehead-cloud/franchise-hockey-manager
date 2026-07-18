import type { MaintenanceCsvConfig } from './types.js';

/**
 * Escape a single CSV value. Rules (RFC 4180-compatible):
 *  - null/undefined → nullValue (default empty string)
 *  - values containing the delimiter, `"`, `\r`, or `\n` are wrapped in quotes
 *    with any inner `"` doubled
 *
 * Mirrors the F15 match-export escape rule so every CSV F33 emits has the same
 * shape.
 */
export function csvEscape(value: unknown, nullValue: string = ''): string {
  if (value === null || value === undefined) return nullValue;
  const text = typeof value === 'string' ? value : String(value);
  if (/[",\n\r]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

/**
 * Serialize a complete CSV document from a header row + data rows. Uses LF
 * line endings (per F33 csv.lineEnding default), no BOM, and the configured
 * delimiter (default `,`). The server is responsible for prepending a UTF-8
 * BOM when csv.includeBom is true.
 */
export function toCsv(
  headers: readonly string[],
  rows: ReadonlyArray<ReadonlyArray<unknown>>,
  config?: Partial<Pick<MaintenanceCsvConfig, 'delimiter' | 'nullValue'>>,
): string {
  const delimiter = config?.delimiter ?? ',';
  const nullValue = config?.nullValue ?? '';
  const headerLine = headers.map((h) => csvEscape(h, nullValue)).join(delimiter);
  const dataLines = rows.map((row) => row.map((v) => csvEscape(v, nullValue)).join(delimiter));
  return [headerLine, ...dataLines].join('\n');
}

/**
 * Header-only CSV (used for preview / empty-result exports).
 */
export function csvHeaderOnly(headers: readonly string[], delimiter: string = ','): string {
  return headers.map((h) => csvEscape(h)).join(delimiter);
}
