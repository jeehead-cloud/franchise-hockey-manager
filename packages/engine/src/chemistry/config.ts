import chemistryWeights from '../config/chemistry-weights.json' with { type: 'json' };
import roleCompatibility from '../config/role-compatibility.json' with { type: 'json' };
import personalityCompatibility from '../config/personality-compatibility.json' with { type: 'json' };
import coachFit from '../config/coach-fit.json' with { type: 'json' };
import tacticalFit from '../config/tactical-fit.json' with { type: 'json' };
import skaterRoles from '../config/skater-roles.json' with { type: 'json' };
import goalieRoles from '../config/goalie-roles.json' with { type: 'json' };
import type { ChemistryBalanceSection } from '../balance/types.js';
import type {
  ChemistryCoachingStyle,
  ChemistryLabel,
  ChemistryPersonality,
  ChemistryTacticalStyle,
} from './types.js';

export interface ChemistryRuntimeConfig {
  version: string;
  weights: {
    roleCompatibility: number;
    personalityCompatibility: number;
  };
  roleRatingBaseContribution: number;
  caps: {
    chemistry: number;
    coachFit: number;
    tacticalFit: number;
    totalMin: number;
    totalMax: number;
  };
  labels: Array<{ maxExclusive: number; label: string }>;
  missingCoachFit: number;
  missingTacticsFit: number;
  coachRatingScale: {
    minOverall: number;
    maxOverall: number;
    minMultiplier: number;
    maxMultiplier: number;
  };
  coachAlignmentWeight: number;
  playerTacticsWeight: number;
  roleCompatibility: {
    defaultPairScore: number;
    pairs: Record<string, number>;
  };
  personalityCompatibility: {
    defaultPairScore: number;
    pairs: Record<string, number>;
  };
  coachFit: {
    defaultScore: number;
    matrix: Record<string, Record<string, number>>;
  };
  tacticalFit: {
    defaultScore: number;
    matrix: Record<string, Record<string, number>>;
  };
}

export const CHEMISTRY_CONFIG_VERSION = chemistryWeights.version as string;

const COACHING_STYLES: ChemistryCoachingStyle[] = [
  'AUTHORITARIAN',
  'AUTHORITATIVE',
  'DEMOCRATIC',
  'DEVELOPMENTAL',
  'HANDS_OFF',
];
const TACTICAL_STYLES: ChemistryTacticalStyle[] = [
  'COMBINATIONAL',
  'PHYSICAL',
  'SPEED',
  'SYSTEM',
  'FORECHECKING',
];
const PERSONALITIES: ChemistryPersonality[] = [
  'LEADER',
  'COMPETITOR',
  'PROFESSIONAL',
  'CREATIVE',
  'GLUE',
];

export function defaultChemistryRuntimeConfig(): ChemistryRuntimeConfig {
  return {
    version: chemistryWeights.version,
    weights: chemistryWeights.weights,
    roleRatingBaseContribution: chemistryWeights.roleRatingBaseContribution,
    caps: chemistryWeights.caps,
    labels: chemistryWeights.labels,
    missingCoachFit: chemistryWeights.missingCoachFit,
    missingTacticsFit: chemistryWeights.missingTacticsFit,
    coachRatingScale: chemistryWeights.coachRatingScale,
    coachAlignmentWeight: chemistryWeights.coachAlignmentWeight,
    playerTacticsWeight: chemistryWeights.playerTacticsWeight,
    roleCompatibility: {
      defaultPairScore: roleCompatibility.defaultPairScore,
      pairs: roleCompatibility.pairs as Record<string, number>,
    },
    personalityCompatibility: {
      defaultPairScore: personalityCompatibility.defaultPairScore,
      pairs: personalityCompatibility.pairs as Record<string, number>,
    },
    coachFit: {
      defaultScore: coachFit.defaultScore,
      matrix: coachFit.matrix as Record<string, Record<string, number>>,
    },
    tacticalFit: {
      defaultScore: tacticalFit.defaultScore,
      matrix: tacticalFit.matrix as Record<string, Record<string, number>>,
    },
  };
}

export function chemistryRuntimeFromBalance(
  section: ChemistryBalanceSection,
): ChemistryRuntimeConfig {
  return {
    version: section.weights.version,
    weights: section.weights.weights,
    roleRatingBaseContribution: section.weights.roleRatingBaseContribution,
    caps: section.weights.caps,
    labels: section.weights.labels,
    missingCoachFit: section.weights.missingCoachFit,
    missingTacticsFit: section.weights.missingTacticsFit,
    coachRatingScale: section.weights.coachRatingScale,
    coachAlignmentWeight: section.weights.coachAlignmentWeight,
    playerTacticsWeight: section.weights.playerTacticsWeight,
    roleCompatibility: section.roleCompatibility,
    personalityCompatibility: section.personalityCompatibility,
    coachFit: section.coachFit,
    tacticalFit: section.tacticalFit,
  };
}

function cfg(override?: ChemistryRuntimeConfig): ChemistryRuntimeConfig {
  return override ?? defaultChemistryRuntimeConfig();
}

export function pairKey(a: string, b: string): string {
  return a <= b ? `${a}|${b}` : `${b}|${a}`;
}

export function knownSkaterRoles(): string[] {
  const roles = new Set<string>();
  for (const pair of skaterRoles.forwardPairs) roles.add(pair.role);
  for (const pair of skaterRoles.defensePairs) roles.add(pair.role);
  for (const key of Object.keys(skaterRoles.labels ?? {})) roles.add(key);
  return [...roles].sort();
}

export function knownGoalieRoles(): string[] {
  return Object.keys(goalieRoles.labels ?? {}).sort();
}

export function getRolePairScore(
  roleA: string,
  roleB: string,
  override?: ChemistryRuntimeConfig,
): number {
  const c = cfg(override);
  const key = pairKey(roleA, roleB);
  const score = c.roleCompatibility.pairs[key];
  return typeof score === 'number' ? score : c.roleCompatibility.defaultPairScore;
}

export function getPersonalityPairScore(
  a: ChemistryPersonality,
  b: ChemistryPersonality,
  override?: ChemistryRuntimeConfig,
): number {
  const c = cfg(override);
  const key = pairKey(a, b);
  const score = c.personalityCompatibility.pairs[key];
  return typeof score === 'number' ? score : c.personalityCompatibility.defaultPairScore;
}

export function getCoachStyleScore(
  preferred: ChemistryCoachingStyle,
  actual: ChemistryCoachingStyle,
  override?: ChemistryRuntimeConfig,
): number {
  const c = cfg(override);
  const row = c.coachFit.matrix[preferred];
  if (!row || typeof row[actual] !== 'number') return c.coachFit.defaultScore;
  return row[actual]!;
}

export function getTacticalStyleScore(
  preferred: ChemistryTacticalStyle,
  actual: ChemistryTacticalStyle,
  override?: ChemistryRuntimeConfig,
): number {
  const c = cfg(override);
  const row = c.tacticalFit.matrix[preferred];
  if (!row || typeof row[actual] !== 'number') return c.tacticalFit.defaultScore;
  return row[actual]!;
}

export function chemistryLabel(
  score0to100: number,
  override?: ChemistryRuntimeConfig,
): ChemistryLabel {
  const c = cfg(override);
  for (const band of c.labels) {
    if (score0to100 < band.maxExclusive) return band.label as ChemistryLabel;
  }
  return 'EXCELLENT';
}

export function getChemistryWeights(override?: ChemistryRuntimeConfig) {
  return cfg(override);
}

export function validateChemistryConfig(override?: ChemistryRuntimeConfig): string[] {
  const c = cfg(override);
  const errors: string[] = [];
  const roles = new Set([...knownSkaterRoles(), ...knownGoalieRoles()]);

  if (!c.version) errors.push('Missing chemistry config version');

  const w = c.weights;
  if (!(w.roleCompatibility >= 0 && w.personalityCompatibility >= 0)) {
    errors.push('Compatibility weights must be non-negative');
  }
  if (Math.abs(w.roleCompatibility + w.personalityCompatibility - 1) > 1e-9) {
    errors.push('Compatibility weights must sum to 1');
  }

  const caps = c.caps;
  for (const [k, v] of Object.entries(caps)) {
    if (!Number.isFinite(v)) errors.push(`Cap ${k} is not finite`);
  }
  if (caps.totalMin >= caps.totalMax) errors.push('totalMin must be < totalMax');
  if (caps.chemistry < 0 || caps.coachFit < 0 || caps.tacticalFit < 0) {
    errors.push('Component caps must be non-negative magnitudes');
  }

  let prev = -1;
  for (const band of c.labels) {
    if (!(band.maxExclusive > prev)) errors.push('Label thresholds must be strictly increasing');
    prev = band.maxExclusive;
  }

  for (const [key, score] of Object.entries(c.roleCompatibility.pairs)) {
    const [a, b] = key.split('|');
    if (!a || !b) errors.push(`Invalid role pair key ${key}`);
    if (a && !roles.has(a)) errors.push(`Unknown role in pair: ${a}`);
    if (b && !roles.has(b)) errors.push(`Unknown role in pair: ${b}`);
    if (a && b && key !== pairKey(a, b)) errors.push(`Role pair key not canonical: ${key}`);
    if (!Number.isFinite(score) || score < -1 || score > 1) {
      errors.push(`Role pair score out of range: ${key}`);
    }
  }

  for (const [key, score] of Object.entries(c.personalityCompatibility.pairs)) {
    const [a, b] = key.split('|') as [string, string];
    if (!PERSONALITIES.includes(a as ChemistryPersonality)) {
      errors.push(`Unknown personality in pair: ${a}`);
    }
    if (!PERSONALITIES.includes(b as ChemistryPersonality)) {
      errors.push(`Unknown personality in pair: ${b}`);
    }
    if (key !== pairKey(a, b)) errors.push(`Personality pair key not canonical: ${key}`);
    if (!Number.isFinite(score) || score < -1 || score > 1) {
      errors.push(`Personality pair score out of range: ${key}`);
    }
  }

  for (const from of COACHING_STYLES) {
    const row = c.coachFit.matrix[from];
    if (!row) {
      errors.push(`Missing coach-fit row for ${from}`);
      continue;
    }
    for (const to of COACHING_STYLES) {
      if (typeof row[to] !== 'number') errors.push(`Missing coach-fit ${from}→${to}`);
      else if (Math.abs(row[to]! - (c.coachFit.matrix[to]?.[from] ?? NaN)) > 1e-9) {
        errors.push(`Coach-fit matrix asymmetric at ${from}/${to}`);
      }
    }
  }

  for (const from of TACTICAL_STYLES) {
    const row = c.tacticalFit.matrix[from];
    if (!row) {
      errors.push(`Missing tactical-fit row for ${from}`);
      continue;
    }
    for (const to of TACTICAL_STYLES) {
      if (typeof row[to] !== 'number') errors.push(`Missing tactical-fit ${from}→${to}`);
      else if (Math.abs(row[to]! - (c.tacticalFit.matrix[to]?.[from] ?? NaN)) > 1e-9) {
        errors.push(`Tactical-fit matrix asymmetric at ${from}/${to}`);
      }
    }
  }

  return errors;
}

export {
  COACHING_STYLES,
  TACTICAL_STYLES,
  PERSONALITIES,
  chemistryWeights,
  roleCompatibility,
  personalityCompatibility,
  coachFit,
  tacticalFit,
};
