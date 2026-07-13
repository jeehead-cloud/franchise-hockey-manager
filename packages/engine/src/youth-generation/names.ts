import { sortJsonValue } from '../balance/canonicalize.js';
import { stableDigest } from '../simulation/batch/hash.js';
import { seededUnit } from './distributions.js';
import { YouthGenerationError } from './types.js';

export interface NormalizedNamePool {
  firstNames: string[];
  lastNames: string[];
}

export function normalizeNameToken(raw: string): string {
  return raw.normalize('NFC').trim().replace(/\s+/g, ' ');
}

export function validateAndNormalizeNamePool(input: {
  firstNames: unknown;
  lastNames: unknown;
}): NormalizedNamePool {
  if (!Array.isArray(input.firstNames) || !Array.isArray(input.lastNames)) {
    throw new YouthGenerationError('InvalidNamePool', 'firstNames and lastNames must be arrays');
  }
  const firstNames = normalizeList(input.firstNames, 'firstNames');
  const lastNames = normalizeList(input.lastNames, 'lastNames');
  if (firstNames.length === 0 || lastNames.length === 0) {
    throw new YouthGenerationError('InvalidNamePool', 'Name pools must be non-empty');
  }
  return { firstNames, lastNames };
}

function normalizeList(raw: unknown[], label: string): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const item of raw) {
    if (typeof item !== 'string') {
      throw new YouthGenerationError('InvalidNamePool', `${label} entries must be strings`);
    }
    const n = normalizeNameToken(item);
    if (!n) {
      throw new YouthGenerationError('InvalidNamePool', `${label} contains empty name`);
    }
    const key = n.toLocaleLowerCase('en');
    if (seen.has(key)) {
      throw new YouthGenerationError('InvalidNamePool', `Duplicate ${label} entry: ${n}`);
    }
    seen.add(key);
    out.push(n);
  }
  return out;
}

export function hashNamePool(pool: NormalizedNamePool): string {
  return stableDigest(JSON.stringify(sortJsonValue(pool)));
}

export function pickNamePair(input: {
  pool: NormalizedNamePool;
  baseSeed: string;
  countryKey: string;
  generationIndex: number;
  usedDisplayNames: Set<string>;
  maxAttempts?: number;
}): {
  firstName: string;
  lastName: string;
  displayName: string;
  duplicateAllowed: boolean;
  attempts: number;
} {
  const maxAttempts = input.maxAttempts ?? 12;
  let attempts = 0;
  let firstName = '';
  let lastName = '';
  let displayName = '';
  for (; attempts < maxAttempts; attempts += 1) {
    const fi = Math.floor(
      seededUnit(
        `${input.baseSeed}:country:${input.countryKey}:player:${input.generationIndex}:name:first:${attempts}`,
      ) * input.pool.firstNames.length,
    );
    const li = Math.floor(
      seededUnit(
        `${input.baseSeed}:country:${input.countryKey}:player:${input.generationIndex}:name:last:${attempts}`,
      ) * input.pool.lastNames.length,
    );
    firstName = input.pool.firstNames[fi]!;
    lastName = input.pool.lastNames[li]!;
    displayName = `${firstName} ${lastName}`;
    const key = displayName.toLocaleLowerCase('en');
    if (!input.usedDisplayNames.has(key)) {
      input.usedDisplayNames.add(key);
      return { firstName, lastName, displayName, duplicateAllowed: false, attempts: attempts + 1 };
    }
  }
  input.usedDisplayNames.add(displayName.toLocaleLowerCase('en'));
  return { firstName, lastName, displayName, duplicateAllowed: true, attempts };
}
