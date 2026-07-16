import { sortJsonValue } from '../balance/canonicalize.js';
import { stableDigest } from '../simulation/batch/hash.js';

/**
 * Deterministic, order-independent digest used by the offseason engine. Same
 * family as trades / contracts — no node:crypto in engine exports.
 */
export const stableOffseasonHash = (value: unknown) =>
  stableDigest(JSON.stringify(sortJsonValue(value)));
