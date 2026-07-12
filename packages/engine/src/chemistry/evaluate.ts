import { CHEMISTRY_CONFIG_VERSION } from './config.js';
import { computeBaseCompatibility } from './chemistry.js';
import { coachFitScore } from './coach-fit.js';
import { computeBaseAbility, computeEffectivePerformance } from './effective-performance.js';
import { tacticalFitScore } from './tactical-fit.js';
import type {
  ChemistryContext,
  ChemistryPlayerInput,
  ChemistryUnitResult,
  ChemistryUnitType,
  EvaluateUnitInput,
  LineupChemistrySummary,
} from './types.js';

function unavailable(
  unitType: ChemistryUnitType,
  unitKey: string,
  playerIds: string[],
  reasons: string[],
): ChemistryUnitResult {
  return {
    unitType,
    unitKey,
    status: 'UNAVAILABLE',
    playerIds,
    baseAbility: null,
    roleCompatibility: null,
    personalityCompatibility: null,
    baseCompatibility: null,
    familiarity: 0,
    familiarityStatus: 'NOT_TRACKED_YET',
    currentChemistry: null,
    label: null,
    coachFit: null,
    tacticalFit: null,
    totalModifier: null,
    effectivePerformance: null,
    factors: [],
    warnings: reasons,
    unavailableReasons: reasons,
  };
}

export function evaluateChemistryUnit(input: EvaluateUnitInput): ChemistryUnitResult {
  const expected =
    input.unitType === 'FORWARD_LINE' ? 3 : input.unitType === 'DEFENSE_PAIR' ? 2 : 1;
  const players = [...input.players].sort((a, b) => a.id.localeCompare(b.id));
  const ids = players.map((p) => p.id);

  if (players.length !== expected) {
    return unavailable(input.unitType, input.unitKey, ids, [
      `Expected ${expected} player(s); received ${players.length}.`,
    ]);
  }

  if (input.unitType === 'GOALIE') {
    if (players[0]!.position !== 'G') {
      return unavailable(input.unitType, input.unitKey, ids, ['Goalie unit requires position G.']);
    }
  } else if (players.some((p) => p.position === 'G')) {
    return unavailable(input.unitType, input.unitKey, ids, [
      'Skater unit cannot include a goalie.',
    ]);
  }

  const baseAbility = computeBaseAbility(players);
  const coach = coachFitScore(players, input.context, input.unitType);
  const tactics = tacticalFitScore(players, input.context);

  if (input.unitType === 'GOALIE') {
    const perf = computeEffectivePerformance({
      baseAbility,
      chemistry0to100: null,
      coachFitNeg1To1: coach.score,
      tacticalFitNeg1To1: tactics.score,
    });
    return {
      unitType: 'GOALIE',
      unitKey: input.unitKey,
      status: 'AVAILABLE',
      playerIds: ids,
      baseAbility,
      roleCompatibility: null,
      personalityCompatibility: null,
      baseCompatibility: null,
      familiarity: 0,
      familiarityStatus: 'NOT_TRACKED_YET',
      currentChemistry: null,
      label: null,
      coachFit: Math.round(coach.score * 100) / 100,
      tacticalFit: Math.round(tactics.score * 100) / 100,
      totalModifier: Math.round(perf.totalModifier * 1000) / 1000,
      effectivePerformance: perf.effectivePerformance,
      factors: [...coach.factors, ...tactics.factors],
      warnings: input.context.coach ? [] : ['No head coach assigned.'],
      unavailableReasons: [],
    };
  }

  const chem = computeBaseCompatibility(players);
  const perf = computeEffectivePerformance({
    baseAbility,
    chemistry0to100: chem.currentChemistry,
    coachFitNeg1To1: coach.score,
    tacticalFitNeg1To1: tactics.score,
  });

  const warnings: string[] = [];
  if (!input.context.coach) warnings.push('No head coach assigned.');
  if (!input.context.teamTacticalStyle) warnings.push('Team tactical style not configured.');

  return {
    unitType: input.unitType,
    unitKey: input.unitKey,
    status: 'AVAILABLE',
    playerIds: ids,
    baseAbility,
    roleCompatibility: chem.roleCompatibility,
    personalityCompatibility: chem.personalityCompatibility,
    baseCompatibility: chem.baseCompatibility,
    familiarity: 0,
    familiarityStatus: 'NOT_TRACKED_YET',
    currentChemistry: chem.currentChemistry,
    label: chem.label,
    coachFit: Math.round(coach.score * 100) / 100,
    tacticalFit: Math.round(tactics.score * 100) / 100,
    totalModifier: Math.round(perf.totalModifier * 1000) / 1000,
    effectivePerformance: perf.effectivePerformance,
    factors: [...chem.factors, ...coach.factors, ...tactics.factors],
    warnings,
    unavailableReasons: [],
  };
}

export interface LineupChemistryInput {
  forwardLines: ChemistryPlayerInput[][];
  defensePairs: ChemistryPlayerInput[][];
  starterGoalie: ChemistryPlayerInput | null;
  backupGoalie: ChemistryPlayerInput | null;
  context: ChemistryContext;
}

export function evaluateLineupChemistry(input: LineupChemistryInput): LineupChemistrySummary {
  const forwardLines = [0, 1, 2, 3].map((i) =>
    evaluateChemistryUnit({
      unitType: 'FORWARD_LINE',
      unitKey: `F${i + 1}`,
      players: input.forwardLines[i] ?? [],
      context: input.context,
    }),
  );
  const defensePairs = [0, 1, 2].map((i) =>
    evaluateChemistryUnit({
      unitType: 'DEFENSE_PAIR',
      unitKey: `D${i + 1}`,
      players: input.defensePairs[i] ?? [],
      context: input.context,
    }),
  );
  const starter = evaluateChemistryUnit({
    unitType: 'GOALIE',
    unitKey: 'G_STARTER',
    players: input.starterGoalie ? [input.starterGoalie] : [],
    context: input.context,
  });
  const backup = evaluateChemistryUnit({
    unitType: 'GOALIE',
    unitKey: 'G_BACKUP',
    players: input.backupGoalie ? [input.backupGoalie] : [],
    context: input.context,
  });

  const units = [...forwardLines, ...defensePairs, starter, backup];
  const available = units.filter((u) => u.status === 'AVAILABLE');
  const withChem = available.filter((u) => u.currentChemistry !== null);
  const fwd = forwardLines.filter((u) => u.effectivePerformance !== null);
  const def = defensePairs.filter((u) => u.effectivePerformance !== null);

  const avg = (vals: number[]) =>
    vals.length ? Math.round((vals.reduce((s, n) => s + n, 0) / vals.length) * 10) / 10 : null;

  const warnings = [
    ...new Set(units.flatMap((u) => [...u.warnings, ...u.unavailableReasons])),
  ];
  if (units.some((u) => u.status === 'UNAVAILABLE')) {
    warnings.push('One or more lineup units cannot be evaluated.');
  }
  if (withChem.some((u) => u.label === 'POOR' || u.label === 'WEAK')) {
    warnings.push('One or more units have weak chemistry.');
  }

  return {
    chemistryConfigVersion: CHEMISTRY_CONFIG_VERSION,
    forwardLines,
    defensePairs,
    goalies: { starter, backup },
    overall: {
      averageForwardEffective: avg(fwd.map((u) => u.effectivePerformance!)),
      averageDefenseEffective: avg(def.map((u) => u.effectivePerformance!)),
      starterGoalieEffective: starter.effectivePerformance,
      averageChemistry: avg(withChem.map((u) => u.currentChemistry!)),
      goodOrExcellentUnits: withChem.filter((u) => u.label === 'GOOD' || u.label === 'EXCELLENT')
        .length,
      weakOrPoorUnits: withChem.filter((u) => u.label === 'POOR' || u.label === 'WEAK').length,
      availableUnits: available.length,
      unavailableUnits: units.length - available.length,
    },
    warnings,
  };
}
