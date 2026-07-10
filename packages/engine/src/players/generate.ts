import devVariance from '../config/dev-variance.json' with { type: 'json' };
import { getAgeAdjustment } from './aging.js';
import { pickOne, randBetween, randFloat, randInt } from './rng.js';
import { deriveRole } from './roles.js';
import type {
  AttrCode,
  CoachingStyle,
  GeneratePlayerOptions,
  GeneratedPlayer,
  GoalieAttributes,
  Personality,
  SkaterAttributes,
  Tactics,
} from './types.js';

const ATTR_CODES: AttrCode[] = [
  'STH',
  'SHO',
  'PAS',
  'STR',
  'SPD',
  'BAL',
  'AGG',
  'OF.AW',
  'DEF.AW',
];

interface DevVarianceConfig {
  coachingStyles: CoachingStyle[];
  tactics: Tactics[];
  personalities: Personality[];
  startTotal: { min: number; max: number };
  devRate: { min: number; max: number };
  risk: { min: number; max: number };
  bonusPotential: { min: number; max: number };
  stabPlus: { min: number; max: number };
  offensePct: { min: number; max: number };
  attributeBase: { min: number; max: number };
  heroRating: { min: number; max: number };
  nationalTeam: { min: number; max: number };
  generationAge: number;
}

const cfg = devVariance as DevVarianceConfig;

/**
 * Generate a fully-frozen player object.
 * All RAND()/RANDBETWEEN() equivalents are rolled once here and returned as
 * concrete numbers — never re-derived on read (PRODUCT_RULES.md §4).
 */
export function generatePlayer(options: GeneratePlayerOptions): GeneratedPlayer {
  const rng = options.rng ?? Math.random;
  const { position, age, nationality, namePool } = options;

  const firstName = pickOne(namePool.firstNames, rng);
  const surname = pickOne(namePool.surnames, rng);

  const startTotal = randInt(cfg.startTotal.min, cfg.startTotal.max, rng);
  const devRate = randInt(cfg.devRate.min, cfg.devRate.max, rng);
  const risk = randFloat(cfg.risk.min, cfg.risk.max, rng);
  const bonusPotential = randFloat(cfg.bonusPotential.min, cfg.bonusPotential.max, rng);
  // Current dev state: single draw between Bonus Pot. and Risk
  const currentDevState = randBetween(bonusPotential, risk, rng);

  const stabPlus = randFloat(cfg.stabPlus.min, cfg.stabPlus.max, rng);
  const stabMinus = -stabPlus;
  const currentStabState = randBetween(stabMinus, stabPlus, rng);

  const ageAdj = getAgeAdjustment(age);
  const yearsPastGen = age - cfg.generationAge;

  // Curr.Total = (Start.Total + (Age - 15) * (Dev.rate + Current_dev_state))
  //              * (1 + Current_stab_state) + Age_adj
  const currTotal =
    (startTotal + yearsPastGen * (devRate + currentDevState)) * (1 + currentStabState) +
    ageAdj;

  const preferredCoachingStyle = pickOne(cfg.coachingStyles, rng);
  const preferredTactics = pickOne(cfg.tactics, rng);
  const personality = pickOne(cfg.personalities, rng);
  const heroRating = randInt(cfg.heroRating.min, cfg.heroRating.max, rng);
  const nationalTeam = randInt(cfg.nationalTeam.min, cfg.nationalTeam.max, rng);

  if (position === 'G') {
    return generateGoaliePlaceholder({
      firstName,
      surname,
      nationality,
      age,
      startTotal,
      devRate,
      risk,
      bonusPotential,
      currentDevState,
      stabPlus,
      stabMinus,
      currentStabState,
      ageAdj,
      currTotal,
      preferredCoachingStyle,
      preferredTactics,
      personality,
      heroRating,
      nationalTeam,
      rng,
    });
  }

  const offensePct = randFloat(cfg.offensePct.min, cfg.offensePct.max, rng);
  const defencePct = 1 - offensePct;
  const offence = currTotal * offensePct;
  const defence = currTotal * defencePct;

  // TODO(PLAYER_MODEL.md §7 item 2): prototype attrs are independent RANDBETWEEN(7,11)
  // regardless of Curr.Total. For MVP seed ages 18–38 we grow base rolls with the same
  // growth term so veterans aren't stuck at prospect-scale numbers. Revisit scaling.
  const attributes = {} as SkaterAttributes;
  for (const code of ATTR_CODES) {
    const base = randInt(cfg.attributeBase.min, cfg.attributeBase.max, rng);
    const grown =
      (base + yearsPastGen * (devRate + currentDevState)) * (1 + currentStabState);
    attributes[code] = Math.round(grown * 100) / 100;
  }

  const attrSum = ATTR_CODES.reduce((s, c) => s + attributes[c], 0);
  const curOverTot = currTotal * attrSum;
  // Over.Pot. estimate at peak age 27 using Start.Total growth without stab/age-adj noise
  const overPot = (startTotal + (27 - cfg.generationAge) * devRate) * attrSum;

  const derived = deriveRole(position, attributes);

  return {
    firstName,
    surname,
    nationality,
    position,
    age,
    startTotal,
    devRate,
    risk: round4(risk),
    bonusPotential: round4(bonusPotential),
    currentDevState: round4(currentDevState),
    stabPlus: round4(stabPlus),
    stabMinus: round4(stabMinus),
    currentStabState: round4(currentStabState),
    ageAdj,
    currTotal: round2(currTotal),
    offensePct: round4(offensePct),
    defencePct: round4(defencePct),
    offence: round2(offence),
    defence: round2(defence),
    attributes,
    goalieAttributes: null,
    preferredCoachingStyle,
    preferredTactics,
    personality,
    heroRating,
    nationalTeam,
    role: derived?.role ?? null,
    roleRating: derived?.roleRating ?? null,
    curOverTot: round2(curOverTot),
    overPot: round2(overPot),
  };
}

/**
 * Minimal distinct goalie placeholder — NOT a copy of the spreadsheet's fixed
 * 50/50 + all-attrs=10 skater stub.
 *
 * TODO(PLAYER_MODEL.md §7 item 5): replace with a real goalie attribute set and
 * archetype system before treating goalies as first-class.
 */
function generateGoaliePlaceholder(args: {
  firstName: string;
  surname: string;
  nationality: GeneratePlayerOptions['nationality'];
  age: number;
  startTotal: number;
  devRate: number;
  risk: number;
  bonusPotential: number;
  currentDevState: number;
  stabPlus: number;
  stabMinus: number;
  currentStabState: number;
  ageAdj: number;
  currTotal: number;
  preferredCoachingStyle: CoachingStyle;
  preferredTactics: Tactics;
  personality: Personality;
  heroRating: number;
  nationalTeam: number;
  rng: () => number;
}): GeneratedPlayer {
  const { rng, age, startTotal, devRate, currentDevState, currentStabState, currTotal } =
    args;
  const yearsPastGen = age - cfg.generationAge;

  const rollGoalieAttr = (): number => {
    const base = randInt(8, 14, rng);
    const grown =
      (base + yearsPastGen * (devRate + currentDevState) * 0.8) * (1 + currentStabState);
    return Math.round(grown * 100) / 100;
  };

  const goalieAttributes: GoalieAttributes = {
    reflexes: rollGoalieAttr(),
    positioning: rollGoalieAttr(),
    reboundControl: rollGoalieAttr(),
    puckHandling: rollGoalieAttr(),
    consistency: rollGoalieAttr(),
  };

  // Goalies don't use skater offense/defense split — store neutral placeholders
  // so the growth engine fields remain comparable across positions.
  return {
    firstName: args.firstName,
    surname: args.surname,
    nationality: args.nationality,
    position: 'G',
    age,
    startTotal,
    devRate,
    risk: round4(args.risk),
    bonusPotential: round4(args.bonusPotential),
    currentDevState: round4(currentDevState),
    stabPlus: round4(args.stabPlus),
    stabMinus: round4(args.stabMinus),
    currentStabState: round4(currentStabState),
    ageAdj: args.ageAdj,
    currTotal: round2(currTotal),
    offensePct: 0.5,
    defencePct: 0.5,
    offence: round2(currTotal * 0.5),
    defence: round2(currTotal * 0.5),
    attributes: null,
    goalieAttributes,
    preferredCoachingStyle: args.preferredCoachingStyle,
    preferredTactics: args.preferredTactics,
    personality: args.personality,
    heroRating: args.heroRating,
    nationalTeam: args.nationalTeam,
    role: null,
    roleRating: null,
    curOverTot: null,
    overPot: null,
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function round4(n: number): number {
  return Math.round(n * 10000) / 10000;
}
