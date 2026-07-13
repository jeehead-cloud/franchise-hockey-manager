import { stableDigest } from '../simulation/batch/hash.js';
import { canonicalizeCompetitionRules } from './rules.js';
import { canonicalizeStageConfig } from './validation.js';
import type { CompetitionRules, StageConfig } from './types.js';

/**
 * Deterministic 64-hex digest of canonical competition rules.
 * Browser-safe (no node:crypto) — same approach as Simulation Lab batch hashes.
 */
export function hashCompetitionRules(rules: CompetitionRules): string {
  return stableDigest(canonicalizeCompetitionRules(rules));
}

export function hashStageConfig(config: StageConfig): string {
  return stableDigest(canonicalizeStageConfig(config));
}
