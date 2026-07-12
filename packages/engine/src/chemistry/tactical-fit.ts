import {
  getChemistryWeights,
  getTacticalStyleScore,
  type ChemistryRuntimeConfig,
} from './config.js';
import type { ChemistryContext, ChemistryFactor, ChemistryPlayerInput } from './types.js';

/** Aggregate tactical fit in [-1, 1]. */
export function tacticalFitScore(
  players: ChemistryPlayerInput[],
  context: ChemistryContext,
  chemistryConfig?: ChemistryRuntimeConfig,
): { score: number; factors: ChemistryFactor[] } {
  const factors: ChemistryFactor[] = [];
  const weights = getChemistryWeights(chemistryConfig);

  if (!context.teamTacticalStyle) {
    factors.push({
      code: 'MISSING_TACTICS',
      label: 'Team tactics not configured',
      impact: weights.missingTacticsFit,
      direction: 'NEGATIVE',
      details: 'Tactical fit uses the configured missing-tactics penalty.',
    });
    return { score: weights.missingTacticsFit, factors };
  }

  const playerScores = players.map((p) =>
    getTacticalStyleScore(p.preferredTactics, context.teamTacticalStyle!, chemistryConfig),
  );
  const playerAvg =
    playerScores.reduce((s, n) => s + n, 0) / Math.max(1, playerScores.length);

  let coachAlign = 0;
  if (context.coach) {
    coachAlign = getTacticalStyleScore(
      context.coach.tacticalStyle,
      context.teamTacticalStyle,
      chemistryConfig,
    );
    factors.push({
      code: 'COACH_TEAM_TACTICAL_ALIGNMENT',
      label: 'Coach/team tactical alignment',
      impact: coachAlign,
      direction: coachAlign > 0.1 ? 'POSITIVE' : coachAlign < -0.1 ? 'NEGATIVE' : 'NEUTRAL',
      details: `Coach ${context.coach.tacticalStyle} vs team ${context.teamTacticalStyle}: ${coachAlign.toFixed(2)}.`,
    });
  } else {
    factors.push({
      code: 'COACH_TEAM_TACTICAL_UNAVAILABLE',
      label: 'Coach/team tactical alignment unavailable',
      impact: 0,
      direction: 'NEUTRAL',
      details: 'No coach assigned; only player vs team tactics apply.',
    });
  }

  const combined =
    playerAvg * weights.playerTacticsWeight + coachAlign * weights.coachAlignmentWeight;
  const score = Math.max(-1, Math.min(1, combined));

  factors.unshift({
    code: playerAvg >= 0 ? 'TACTICAL_MATCH' : 'TACTICAL_MISMATCH',
    label: playerAvg >= 0 ? 'Player/team tactical alignment' : 'Player/team tactical mismatch',
    impact: playerAvg,
    direction: playerAvg > 0.1 ? 'POSITIVE' : playerAvg < -0.1 ? 'NEGATIVE' : 'NEUTRAL',
    details: `Average player preference vs team ${context.teamTacticalStyle}: ${playerAvg.toFixed(2)}.`,
  });

  return { score, factors };
}
