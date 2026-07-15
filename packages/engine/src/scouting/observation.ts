import { GOALIE_ATTRIBUTE_KEYS, SKATER_ATTRIBUTE_KEYS } from '../players/types.js';
import { validateGoalieAttributes, validateSkaterAttributes } from '../players/validation.js';
import type { AttributeEstimate, PlayerTruth, ScoutInput, ScoutingAssignment, ScoutingConfig, ScoutingObservation } from './types.js';
import { SCOUTING_SCHEMA_VERSION } from './types.js';
import { hashObservation, hashPlayerState, stableScoutingHash } from './hashing.js';
import { observationConfidence } from './confidence.js';
import { scoutSkill } from './scout-skill.js';

const clamp = (value: number, low: number, high: number) => Math.max(low, Math.min(high, value));
function unit(seed: string): number {
  return parseInt(stableScoutingHash(seed).slice(0, 8), 16) / 0xffffffff;
}

function estimate(truth: number, confidence: number, noise: number, seed: string, minimum: number, maximum: number, bias = 0): AttributeEstimate {
  if (confidence < 0.2) return { estimate: null, low: null, high: null, confidence };
  const spread = noise * (1.1 - confidence);
  const value = clamp(Math.round(truth + (unit(seed) * 2 - 1) * spread + bias), minimum, maximum);
  const width = Math.max(1, Math.ceil(spread * 1.5));
  return { estimate: value, low: clamp(value - width, minimum, maximum), high: clamp(value + width, minimum, maximum), confidence };
}

/** Create a deterministic, immutable observation; neither scout nor player is modified. */
export function createScoutingObservation(
  config: ScoutingConfig,
  scout: ScoutInput,
  player: PlayerTruth,
  assignment: ScoutingAssignment,
): ScoutingObservation {
  if (assignment.durationDays < config.observation.minDurationDays || assignment.durationDays > config.observation.maxDurationDays) {
    throw new Error('Assignment duration outside scouting config');
  }
  const issues = player.kind === 'goalie' ? validateGoalieAttributes(player.attributes) : validateSkaterAttributes(player.attributes);
  if (issues.length || !Number.isInteger(player.currentAbility) || player.currentAbility < 0 || player.currentAbility > 100 || player.potential.floor < 0 || player.potential.ceiling > 100 || player.potential.floor > player.potential.ceiling) {
    throw new Error(`Invalid player truth for scouting: ${issues.join('; ')}`);
  }
  const stateHash = hashPlayerState(player);
  const attributeConfidence = observationConfidence(scoutSkill(scout, player, 'attribute'), assignment.durationDays, config);
  const potentialConfidence = observationConfidence(scoutSkill(scout, player, 'potential'), assignment.durationDays, config);
  const seed = `${assignment.seed}|${scout.scoutId}|${player.playerId}|${assignment.assignmentId}|${assignment.observedOn}|${assignment.durationDays}`;
  const attributes: Record<string, AttributeEstimate> = {};
  const keys = player.kind === 'goalie' ? GOALIE_ATTRIBUTE_KEYS : SKATER_ATTRIBUTE_KEYS;
  const playerAttributes: Record<string, number> = player.attributes;
  for (const key of keys) attributes[key] = estimate(playerAttributes[key]!, attributeConfidence, config.observation.baseNoise, `${seed}|${key}`, 1, 20, scout.persistentBias);
  const currentAbility = estimate(player.currentAbility, attributeConfidence, config.observation.baseNoise * 4, `${seed}|ca`, 0, 100, scout.persistentBias * 3);
  const potentialMidpoint = (player.potential.floor + player.potential.ceiling) / 2;
  const potential = estimate(
    potentialMidpoint,
    potentialConfidence,
    config.observation.baseNoise * 4 * config.observation.potentialUncertaintyMultiplier,
    `${seed}|potential`,
    0,
    100, scout.persistentBias * 3,
  );
  const base = {
    schemaVersion: SCOUTING_SCHEMA_VERSION,
    playerId: player.playerId, scoutId: scout.scoutId, teamId: assignment.teamId, assignmentId: assignment.assignmentId,
    observedOn: assignment.observedOn, durationDays: assignment.durationDays, playerKind: player.kind, attributes,
    currentAbility, potential, confidence: Math.min(attributeConfidence, potentialConfidence), sourcePlayerStateHash: stateHash,
  } as const;
  return { ...base, observationId: hashObservation(base) };
}
