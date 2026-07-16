import { sortJsonValue } from '../balance/canonicalize.js';
import { stableDigest } from '../simulation/batch/hash.js';

/**
 * Deterministic, order-independent digest used by the season-transition engine.
 * Same family as offseason / trades / contracts — no node:crypto in engine
 * exports.
 */
export const stableSeasonTransitionHash = (value: unknown) =>
  stableDigest(JSON.stringify(sortJsonValue(value)));
