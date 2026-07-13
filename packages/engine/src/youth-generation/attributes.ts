import {
  GOALIE_ATTRIBUTE_KEYS,
  SKATER_ATTRIBUTE_KEYS,
  type GoalieAttributeKey,
  type SkaterAttributeKey,
} from '../players/types.js';
import { PLAYER_MODEL_CONFIG } from '../players/validation.js';
import { deriveGoalieRatings, deriveSkaterRatings } from '../players/ratings.js';
import { deriveSkaterRole } from '../players/roles.js';
import { deriveGoalieRole } from '../goalies/roles.js';
import { seededBoundedInt, seededUnit } from './distributions.js';
import type { CountryYouthProfile, YouthPosition } from './types.js';

const SKATER_BASE_WEIGHTS: Record<YouthPosition, Partial<Record<SkaterAttributeKey, number>>> = {
  C: { passing: 1.3, stickhandling: 1.2, offensiveAwareness: 1.1, defensiveAwareness: 1.1 },
  LW: { shooting: 1.3, speed: 1.25, offensiveAwareness: 1.15 },
  RW: { shooting: 1.3, speed: 1.25, offensiveAwareness: 1.15 },
  LD: { defensiveAwareness: 1.35, strength: 1.2, passing: 1.1, balance: 1.1 },
  RD: { defensiveAwareness: 1.35, strength: 1.2, passing: 1.1, balance: 1.1 },
  G: {},
};

const GOALIE_TECH: GoalieAttributeKey[] = ['positioning', 'reboundControl', 'glove', 'blocker'];
const GOALIE_ATH: GoalieAttributeKey[] = ['reflexes', 'movement', 'stamina'];

function clampAttr(v: number): number {
  return Math.max(
    PLAYER_MODEL_CONFIG.attributeMin,
    Math.min(PLAYER_MODEL_CONFIG.attributeMax, Math.round(v)),
  );
}

export function generateSkaterAttributes(input: {
  profile: CountryYouthProfile;
  position: Exclude<YouthPosition, 'G'>;
  abilityTarget: number;
  baseSeed: string;
  countryKey: string;
  generationIndex: number;
}): Record<string, number> {
  const t = input.profile.attributeTendencies;
  const weights = SKATER_BASE_WEIGHTS[input.position];
  const attrs: Record<string, number> = {};
  for (const key of SKATER_ATTRIBUTE_KEYS) {
    let bias = 0;
    if (key === 'speed' || key === 'balance') bias += t.skating;
    if (key === 'shooting') bias += t.shooting;
    if (key === 'passing' || key === 'stickhandling') bias += t.passing;
    if (key === 'defensiveAwareness') bias += t.defense;
    if (key === 'strength' || key === 'aggression') bias += t.physical;
    const w = weights[key] ?? 1;
    const jitter =
      (seededUnit(
        `${input.baseSeed}:country:${input.countryKey}:player:${input.generationIndex}:attr:${key}`,
      ) -
        0.5) *
      2.2;
    attrs[key] = clampAttr(input.abilityTarget * w + bias * 2 + jitter);
  }
  return attrs;
}

export function generateGoalieAttributes(input: {
  profile: CountryYouthProfile;
  abilityTarget: number;
  baseSeed: string;
  countryKey: string;
  generationIndex: number;
}): Record<string, number> {
  const t = input.profile.attributeTendencies;
  const styleRoll = seededUnit(
    `${input.baseSeed}:country:${input.countryKey}:player:${input.generationIndex}:gstyle`,
  );
  const techBias = styleRoll < 0.33 ? 1.2 : styleRoll < 0.66 ? 1 : 0.85;
  const athBias = styleRoll > 0.66 ? 1.2 : styleRoll > 0.33 ? 1 : 0.85;
  const attrs: Record<string, number> = {};
  for (const key of GOALIE_ATTRIBUTE_KEYS) {
    let mult = 1;
    if (GOALIE_TECH.includes(key)) mult = techBias + t.goalieTechnique;
    if (GOALIE_ATH.includes(key)) mult = athBias + t.goalieAthleticism;
    if (key === 'consistency' || key === 'puckHandling') mult = 1;
    const jitter =
      (seededUnit(
        `${input.baseSeed}:country:${input.countryKey}:player:${input.generationIndex}:gattr:${key}`,
      ) -
        0.5) *
      2;
    attrs[key] = clampAttr(input.abilityTarget * mult + jitter);
  }
  return attrs;
}

/** Bounded loop nudging attributes toward a soft CA target band. */
export function reconcileAttributesToAbilityBand(input: {
  playerType: 'SKATER' | 'GOALIE';
  position: YouthPosition;
  attributes: Record<string, number>;
  softMinAbility: number;
  softMaxAbility: number;
  potentialCeiling: number;
}): { attributes: Record<string, number>; currentAbility: number; role: string } {
  const attrs = { ...input.attributes };
  const keys =
    input.playerType === 'GOALIE' ? [...GOALIE_ATTRIBUTE_KEYS] : [...SKATER_ATTRIBUTE_KEYS];
  keys.sort();

  let ability = calcAbility(input.playerType, attrs);
  for (let step = 0; step < 24; step += 1) {
    if (ability >= input.softMinAbility && ability <= input.softMaxAbility) break;
    if (ability > input.potentialCeiling && ability > input.softMinAbility) {
      // nudge down
      const key = keys[step % keys.length]!;
      attrs[key] = clampAttr((attrs[key] ?? 10) - 1);
    } else if (ability < input.softMinAbility) {
      const key = keys[step % keys.length]!;
      attrs[key] = clampAttr((attrs[key] ?? 10) + 1);
    } else if (ability > input.softMaxAbility) {
      const key = keys[step % keys.length]!;
      attrs[key] = clampAttr((attrs[key] ?? 10) - 1);
    }
    ability = calcAbility(input.playerType, attrs);
  }

  // Ensure CA not wildly above potential for generated youth.
  for (let step = 0; step < 16 && ability > input.potentialCeiling; step += 1) {
    const key = keys[step % keys.length]!;
    attrs[key] = clampAttr((attrs[key] ?? 10) - 1);
    ability = calcAbility(input.playerType, attrs);
  }

  const role =
    input.playerType === 'GOALIE'
      ? deriveGoalieRole('G', attrs as never).role
      : deriveSkaterRole(input.position, attrs as never).role;

  return { attributes: attrs, currentAbility: ability, role };
}

function calcAbility(playerType: 'SKATER' | 'GOALIE', attrs: Record<string, number>): number {
  if (playerType === 'GOALIE') {
    return deriveGoalieRatings(attrs as never).currentAbility;
  }
  return deriveSkaterRatings(attrs as never).currentAbility;
}

export function generateProfileExtras(input: {
  baseSeed: string;
  countryKey: string;
  generationIndex: number;
  potentialCeiling: number;
}): {
  potentialFloor: number;
  developmentRisk: number;
  heroRating: number;
  stability: number;
  preferredCoachingStyle: string;
  preferredTactics: string;
  personality: string;
  publicPotentialEstimate: string;
  form: number;
} {
  const styles = ['AUTHORITARIAN', 'AUTHORITATIVE', 'DEMOCRATIC', 'DEVELOPMENTAL', 'HANDS_OFF'];
  const tactics = ['COMBINATIONAL', 'PHYSICAL', 'SPEED', 'SYSTEM', 'FORECHECKING'];
  const personalities = ['LEADER', 'COMPETITOR', 'PROFESSIONAL', 'CREATIVE', 'GLUE'];
  const publicEst = ['UNKNOWN', 'LOW', 'STANDARD', 'HIGH', 'ELITE'];

  const si = Math.floor(
    seededUnit(`${input.baseSeed}:${input.countryKey}:${input.generationIndex}:coach`) *
      styles.length,
  );
  const ti = Math.floor(
    seededUnit(`${input.baseSeed}:${input.countryKey}:${input.generationIndex}:tac`) *
      tactics.length,
  );
  const pi = Math.floor(
    seededUnit(`${input.baseSeed}:${input.countryKey}:${input.generationIndex}:pers`) *
      personalities.length,
  );
  const pei = Math.floor(
    seededUnit(`${input.baseSeed}:${input.countryKey}:${input.generationIndex}:pub`) *
      publicEst.length,
  );

  const floorGap = seededBoundedInt(
    `${input.baseSeed}:${input.countryKey}:${input.generationIndex}:pfloor`,
    12,
    4,
    5,
    25,
  );
  const potentialFloor = Math.max(
    PLAYER_MODEL_CONFIG.ratingMin,
    input.potentialCeiling - floorGap,
  );

  return {
    potentialFloor,
    developmentRisk: Math.round(
      seededUnit(`${input.baseSeed}:${input.countryKey}:${input.generationIndex}:risk`) * 100,
    ) / 100,
    heroRating: seededBoundedInt(
      `${input.baseSeed}:${input.countryKey}:${input.generationIndex}:hero`,
      10,
      2,
      1,
      20,
    ),
    stability: seededBoundedInt(
      `${input.baseSeed}:${input.countryKey}:${input.generationIndex}:stab`,
      10,
      2,
      1,
      20,
    ),
    preferredCoachingStyle: styles[si]!,
    preferredTactics: tactics[ti]!,
    personality: personalities[pi]!,
    publicPotentialEstimate: publicEst[pei]!,
    form: 0,
  };
}
