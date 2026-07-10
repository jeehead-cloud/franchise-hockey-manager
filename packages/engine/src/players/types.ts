/** Core attribute codes used by skaters (PLAYER_MODEL.md §3). */
export type AttrCode =
  | 'STH'
  | 'SHO'
  | 'PAS'
  | 'STR'
  | 'SPD'
  | 'BAL'
  | 'AGG'
  | 'OF.AW'
  | 'DEF.AW';

export type Position = 'LW' | 'RW' | 'C' | 'LD' | 'RD' | 'G';

export type Nationality =
  | 'Canada'
  | 'USA'
  | 'Russia'
  | 'Sweden'
  | 'Finland'
  | 'Czechia';

export type CoachingStyle =
  | 'Authoritarian'
  | 'Authoritative'
  | 'Democratic'
  | 'Developmental'
  | 'Hands-Off';

export type Tactics =
  | 'Combinational'
  | 'Physical'
  | 'Speed'
  | 'System'
  | 'Forechecking';

export type Personality =
  | 'Leader'
  | 'Competitor'
  | 'Professional'
  | 'Creative'
  | 'Glue';

export interface SkaterAttributes {
  STH: number;
  SHO: number;
  PAS: number;
  STR: number;
  SPD: number;
  BAL: number;
  AGG: number;
  'OF.AW': number;
  'DEF.AW': number;
}

/**
 * Placeholder goalie attribute set — not a finished model.
 * TODO(PLAYER_MODEL.md §7 item 5): design a real goalie attribute/archetype system.
 */
export interface GoalieAttributes {
  reflexes: number;
  positioning: number;
  reboundControl: number;
  puckHandling: number;
  consistency: number;
}

export interface GeneratedPlayer {
  firstName: string;
  surname: string;
  nationality: Nationality;
  position: Position;
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

  offensePct: number;
  defencePct: number;
  offence: number;
  defence: number;

  /** Skater attrs; null for goalies. */
  attributes: SkaterAttributes | null;
  /** Goalie placeholder attrs; null for skaters. */
  goalieAttributes: GoalieAttributes | null;

  preferredCoachingStyle: CoachingStyle;
  preferredTactics: Tactics;
  personality: Personality;
  heroRating: number;
  nationalTeam: number;

  /** Derived archetype; null for goalies. */
  role: string | null;
  roleRating: number | null;

  curOverTot: number | null;
  overPot: number | null;
}

export interface NamePool {
  firstNames: string[];
  surnames: string[];
}

export interface GeneratePlayerOptions {
  position: Position;
  age: number;
  nationality: Nationality;
  namePool: NamePool;
  /** Optional seeded RNG for tests; defaults to Math.random. */
  rng?: () => number;
}
