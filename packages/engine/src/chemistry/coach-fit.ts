import {
  getChemistryWeights,
  getCoachStyleScore,
  type ChemistryRuntimeConfig,
} from './config.js';
import type {
  ChemistryContext,
  ChemistryFactor,
  ChemistryPlayerInput,
  ChemistryUnitType,
} from './types.js';

function coachRatingMultiplier(
  context: ChemistryContext,
  unitType: ChemistryUnitType,
  chemistryConfig?: ChemistryRuntimeConfig,
): number {
  const coach = context.coach;
  if (!coach) return 1;
  const cfg = getChemistryWeights(chemistryConfig).coachRatingScale;
  const overall = Math.min(cfg.maxOverall, Math.max(cfg.minOverall, coach.overallCoaching));
  const t = (overall - cfg.minOverall) / (cfg.maxOverall - cfg.minOverall);
  let mult = cfg.minMultiplier + t * (cfg.maxMultiplier - cfg.minMultiplier);
  if (unitType === 'FORWARD_LINE') {
    const off = Math.min(20, Math.max(1, coach.offense));
    mult *= 0.9 + (off / 20) * 0.2;
  } else if (unitType === 'DEFENSE_PAIR' || unitType === 'GOALIE') {
    const def = Math.min(20, Math.max(1, coach.defense));
    mult *= 0.9 + (def / 20) * 0.2;
  }
  return mult;
}

/** Aggregate coach-style fit in [-1, 1]. */
export function coachFitScore(
  players: ChemistryPlayerInput[],
  context: ChemistryContext,
  unitType: ChemistryUnitType,
  chemistryConfig?: ChemistryRuntimeConfig,
): { score: number; factors: ChemistryFactor[] } {
  const factors: ChemistryFactor[] = [];
  const weights = getChemistryWeights(chemistryConfig);
  if (!context.coach) {
    factors.push({
      code: 'MISSING_COACH',
      label: 'No head coach assigned',
      impact: weights.missingCoachFit,
      direction: 'NEGATIVE',
      details: 'Coach fit uses the configured missing-coach penalty.',
    });
    return { score: weights.missingCoachFit, factors };
  }

  const scores = players.map((p) =>
    getCoachStyleScore(p.preferredCoachingStyle, context.coach!.coachingStyle, chemistryConfig),
  );
  const avg = scores.reduce((s, n) => s + n, 0) / Math.max(1, scores.length);
  const scaled = Math.max(
    -1,
    Math.min(1, avg * coachRatingMultiplier(context, unitType, chemistryConfig)),
  );

  factors.push({
    code: avg >= 0 ? 'COACH_STYLE_MATCH' : 'COACH_STYLE_MISMATCH',
    label: avg >= 0 ? 'Coaching-style alignment' : 'Coaching-style mismatch',
    impact: scaled,
    direction: scaled > 0.1 ? 'POSITIVE' : scaled < -0.1 ? 'NEGATIVE' : 'NEUTRAL',
    details: `Average player preference vs ${context.coach.coachingStyle}: ${avg.toFixed(2)} (scaled ${scaled.toFixed(2)}).`,
  });
  return { score: scaled, factors };
}
