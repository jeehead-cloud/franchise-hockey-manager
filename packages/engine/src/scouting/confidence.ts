import type { ScoutingConfig, ScoutingObservation } from './types.js';
import { clamp01 } from './scout-skill.js';

export function observationConfidence(skill: number, durationDays: number, config: ScoutingConfig): number {
  return clamp01(skill * Math.sqrt(Math.min(durationDays, config.confidence.durationCapDays) / config.confidence.durationCapDays));
}

export function consolidatedConfidence(observations: readonly ScoutingObservation[], config: ScoutingConfig): number {
  const byScout = new Map<string, number>();
  for (const observation of observations) {
    byScout.set(observation.scoutId, (byScout.get(observation.scoutId) ?? 0) + 1);
  }
  let combinedMiss = 1;
  for (const observation of observations) {
    const repeat = Math.pow(config.confidence.repeatDiminishing, (byScout.get(observation.scoutId) ?? 1) - 1);
    combinedMiss *= 1 - observation.confidence * repeat;
  }
  return clamp01(1 - combinedMiss + Math.max(0, byScout.size - 1) * config.confidence.diversityBonus);
}
