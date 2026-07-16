import { sortJsonValue } from '../balance/canonicalize.js';
import { stableDigest } from '../simulation/batch/hash.js';

export const stableTradeHash = (value: unknown) => stableDigest(JSON.stringify(sortJsonValue(value)));
