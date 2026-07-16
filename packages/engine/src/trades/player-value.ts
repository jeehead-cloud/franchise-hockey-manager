import type { TradeAssetValuation, TradeConfig, TradeEstimate, TradePlayerAssetDto } from './types.js';
import { stableTradeHash } from './hashing.js';

const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n));

/** Age in whole years measured against an explicit effective date (never wall clock). */
export function tradeAgeOnDate(birthDate: string, effectiveDate: string): number {
  const parse = (v: string) => {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v);
    if (!m) return null;
    const d = new Date(Date.UTC(+m[1]!, +m[2]! - 1, +m[3]!));
    return Number.isNaN(d.getTime()) ? null : d;
  };
  const dob = parse(birthDate);
  const eff = parse(effectiveDate);
  if (!dob || !eff || eff < dob) return 0;
  let age = eff.getUTCFullYear() - dob.getUTCFullYear();
  if (eff.getUTCMonth() < dob.getUTCMonth() || (eff.getUTCMonth() === dob.getUTCMonth() && eff.getUTCDate() < dob.getUTCDate())) age--;
  return age;
}

/** Normalized salary contribution 0..100 against F28's $500k–$15M range. */
function salaryScore(annualSalary: number): number {
  const min = 500_000;
  const max = 15_000_000;
  if (annualSalary <= min) return 12;
  if (annualSalary >= max) return 100;
  return clamp(12 + ((annualSalary - min) / (max - min)) * 88, 12, 100);
}

/**
 * Deterministic player value on a normalized 0..100 scale (advisory only).
 *
 * For established signed roster players this uses true/visible current ability.
 * For PROSPECTs under contract (rare but possible after rights conversion) it
 * falls back to that Team's scouting estimates, or a conservative Unknown value
 * when unscouted — never true hidden potential.
 */
export function valuePlayerAsset(asset: TradePlayerAssetDto, config: TradeConfig): TradeAssetValuation {
  const age = tradeAgeOnDate(asset.dateOfBirth, asset.effectiveDate);
  const isProspect = asset.rosterStatus === 'PROSPECT';
  const unknownAbility = 38;
  const ability = isProspect
    ? (asset.currentAbility ?? (asset.potentialEstimate?.estimate ?? unknownAbility))
    : (asset.currentAbility ?? unknownAbility);

  const w = config.playerValue;
  const abilityScore = clamp(ability, 0, 100);
  const contractScore = salaryScore(asset.activeAnnualSalary);
  // Younger players score higher; peak around 22, decline into retirement risk.
  const ageScore = age <= 22 ? 100 : clamp(100 - (age - 22) * 5, 15, 100);
  const roleScore = clamp(asset.roleRating ?? 50, 0, 100);
  const performanceScore = clamp(asset.recentPerformance ?? 50, 0, 100);
  const trendScore = clamp((asset.developmentTrend ?? 0) + 50, 0, 100);
  const retirementRisk = clamp(asset.retirementRisk ?? (age >= 32 ? (age - 32) * 12 : 0), 0, 100);
  const retirementScore = 100 - retirementRisk;

  const value = clamp(
    abilityScore * w.currentAbilityWeight +
      contractScore * w.contractValueWeight +
      ageScore * w.ageWeight +
      roleScore * w.roleWeight +
      performanceScore * w.recentPerformanceWeight +
      trendScore * w.developmentTrendWeight +
      retirementScore * w.retirementRiskWeight,
    0,
    100,
  );

  const factors = [
    `${isProspect ? 'Prospect' : 'Roster'} player ability ${Math.round(abilityScore)} (${isProspect ? 'team scouting estimate' : 'visible current ability'})`,
    `Age ${age} → age score ${Math.round(ageScore)}; retirement risk ${Math.round(retirementRisk)}`,
    `Active salary $${asset.activeAnnualSalary.toLocaleString()} → contract score ${Math.round(contractScore)}`,
    `Role ${Math.round(roleScore)}, performance ${Math.round(performanceScore)}, development trend ${Math.round(trendScore - 50)}.`,
  ];
  if (asset.hasFutureContract) factors.push('Player carries a FUTURE contract that transfers with the active contract.');

  const result: Omit<TradeAssetValuation, 'valuationHash'> = {
    assetType: 'PLAYER_CONTRACT',
    value: Math.round(value * 100) / 100,
    factors,
  };
  return { ...result, valuationHash: stableTradeHash({ type: 'PLAYER_CONTRACT', asset, result }) };
}

/** Conservative Unknown-fallback prospect value when a Team has no scouting report. */
export function valueUnknownProspect(config: TradeConfig): number {
  // Estimated potential carries most of the weight; with no estimate, use a low anchor.
  const w = config.prospectValue;
  const unknownPotential = 42;
  const unknownCurrent = 32;
  const unknownConfidence = 0.15;
  const unknownRole = 35;
  const unknownRisk = 90; // highest risk when unscouted
  return clamp(
    unknownPotential * w.estimatedPotentialWeight +
      unknownCurrent * w.estimatedCurrentAbilityWeight +
      (unknownConfidence * 100) * w.confidenceWeight +
      unknownRole * w.projectedRoleWeight -
      unknownRisk * w.riskPenaltyWeight,
    0,
    100,
  );
}

/** Value a draft-right or unscouted prospect from a Team's F26 estimates only. */
export function valueProspectFromEstimates(
  input: { potentialEstimate: TradeEstimate | null; currentAbilityEstimate: TradeEstimate | null; projectedRole: string | null },
  config: TradeConfig,
): { value: number; factors: string[] } {
  const w = config.prospectValue;
  const roleMap: Record<string, number> = { ELITE: 95, TOP: 80, MIDDLE: 60, BOTTOM: 45, FRINGE: 30, DEPTH: 25 };
  const roleScore = (r: string | null) => (r && r in roleMap ? roleMap[r]! : 50);
  const potential = input.potentialEstimate?.estimate ?? null;
  const current = input.currentAbilityEstimate?.estimate ?? null;
  const confidence = clamp((input.potentialEstimate?.confidence ?? input.currentAbilityEstimate?.confidence ?? 0) * 100, 0, 100);
  if (potential === null && current === null) {
    const v = valueUnknownProspect(config);
    return { value: v, factors: ['No scouting report available — using conservative Unknown fallback (never true potential).'] };
  }
  const potentialScore = potential !== null ? clamp(potential, 0, 100) : 42;
  const currentScore = current !== null ? clamp(current, 0, 100) : 32;
  const risk = clamp(100 - confidence, 0, 100);
  const value = clamp(
    potentialScore * w.estimatedPotentialWeight +
      currentScore * w.estimatedCurrentAbilityWeight +
      confidence * w.confidenceWeight +
      roleScore(input.projectedRole) * w.projectedRoleWeight -
      risk * w.riskPenaltyWeight,
    0,
    100,
  );
  return {
    value,
    factors: [
      `Estimated potential ${potentialScore === 42 ? 'Unknown (anchor 42)' : Math.round(potentialScore)} (team scouting estimate only).`,
      `Estimated current ability ${currentScore === 32 ? 'Unknown (anchor 32)' : Math.round(currentScore)}.`,
      `Confidence ${Math.round(confidence)}; projected role ${input.projectedRole ?? 'Unknown'}.`,
    ],
  };
}
