import type { ContractConfig } from './types.js';
import { CONTRACT_SCHEMA_VERSION, ContractEngineError } from './types.js';

export function defaultContractConfig(): ContractConfig {
  return {
    schemaVersion: CONTRACT_SCHEMA_VERSION,
    salary: {
      minimum: 500_000, maximum: 15_000_000, roundingIncrement: 50_000,
      abilityBands: [
        { minimumAbility: 0, maximumAbility: 39, baseSalary: 650_000 },
        { minimumAbility: 40, maximumAbility: 54, baseSalary: 1_000_000 },
        { minimumAbility: 55, maximumAbility: 69, baseSalary: 2_500_000 },
        { minimumAbility: 70, maximumAbility: 84, baseSalary: 5_500_000 },
        { minimumAbility: 85, maximumAbility: 100, baseSalary: 9_500_000 },
      ],
    },
    term: { minimumYears: 1, maximumYears: 8, youngPlayerMaximumYears: 3, veteranMaximumYears: 4 },
    recommendation: { ageWeight: .2, abilityWeight: .35, roleWeight: .15, recentPerformanceWeight: .15, developmentTrendWeight: .1, retirementRiskWeight: .05 },
    offers: { minimumOfferDurationYears: 1, maximumOpenOffersPerPlayer: 10, offerExpirationSeasonOffset: 1 },
    rights: { requireActiveDraftRightForDraftedProspect: true },
  };
}

const object = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
function exact(o: Record<string, unknown>, keys: string[], label: string) {
  for (const k of Object.keys(o)) if (!keys.includes(k)) throw new ContractEngineError('InvalidContractConfig', `Unknown ${label} field: ${k}`);
}
function integer(v: unknown, label: string, min = 0): number {
  if (!Number.isInteger(v) || (v as number) < min) throw new ContractEngineError('InvalidContractConfig', `${label} must be an integer >= ${min}`);
  return v as number;
}
function finite(v: unknown, label: string): number {
  if (typeof v !== 'number' || !Number.isFinite(v) || v < 0) throw new ContractEngineError('InvalidContractConfig', `${label} must be a non-negative finite number`);
  return v;
}

export function validateContractConfig(raw: unknown): ContractConfig {
  if (!object(raw)) throw new ContractEngineError('InvalidContractConfig', 'Config must be an object');
  exact(raw, ['schemaVersion','salary','term','recommendation','offers','rights'], 'config');
  if (raw.schemaVersion !== 1) throw new ContractEngineError('InvalidContractConfig', 'Unsupported schemaVersion');
  for (const key of ['salary','term','recommendation','offers','rights']) if (!object(raw[key])) throw new ContractEngineError('InvalidContractConfig', `${key} section required`);
  const salary = raw.salary as Record<string, unknown>; exact(salary, ['minimum','maximum','roundingIncrement','abilityBands'], 'salary');
  const minimum = integer(salary.minimum, 'salary.minimum', 1), maximum = integer(salary.maximum, 'salary.maximum', minimum), roundingIncrement = integer(salary.roundingIncrement, 'salary.roundingIncrement', 1);
  if (!Array.isArray(salary.abilityBands) || !salary.abilityBands.length) throw new ContractEngineError('InvalidContractConfig', 'salary.abilityBands required');
  const abilityBands = salary.abilityBands.map((b, i) => {
    if (!object(b)) throw new ContractEngineError('InvalidContractConfig', `abilityBands[${i}] invalid`);
    exact(b, ['minimumAbility','maximumAbility','baseSalary'], `abilityBands[${i}]`);
    return { minimumAbility: integer(b.minimumAbility, 'minimumAbility'), maximumAbility: integer(b.maximumAbility, 'maximumAbility'), baseSalary: integer(b.baseSalary, 'baseSalary', minimum) };
  }).sort((a,b) => a.minimumAbility-b.minimumAbility);
  if (abilityBands[0]!.minimumAbility !== 0 || abilityBands.at(-1)!.maximumAbility !== 100) throw new ContractEngineError('InvalidContractConfig', 'Ability bands must cover 0..100');
  abilityBands.forEach((b,i) => { if (b.maximumAbility < b.minimumAbility || (i && b.minimumAbility !== abilityBands[i-1]!.maximumAbility + 1)) throw new ContractEngineError('InvalidContractConfig', 'Ability bands must have no gaps or overlap'); });
  const term = raw.term as Record<string, unknown>; exact(term, ['minimumYears','maximumYears','youngPlayerMaximumYears','veteranMaximumYears'], 'term');
  const normalizedTerm = { minimumYears: integer(term.minimumYears,'term.minimumYears',1), maximumYears: integer(term.maximumYears,'term.maximumYears',1), youngPlayerMaximumYears: integer(term.youngPlayerMaximumYears,'term.youngPlayerMaximumYears',1), veteranMaximumYears: integer(term.veteranMaximumYears,'term.veteranMaximumYears',1) };
  if (normalizedTerm.maximumYears < normalizedTerm.minimumYears || normalizedTerm.youngPlayerMaximumYears > normalizedTerm.maximumYears || normalizedTerm.veteranMaximumYears > normalizedTerm.maximumYears) throw new ContractEngineError('InvalidContractConfig', 'Invalid term limits');
  const rec = raw.recommendation as Record<string, unknown>; const recKeys=['ageWeight','abilityWeight','roleWeight','recentPerformanceWeight','developmentTrendWeight','retirementRiskWeight']; exact(rec, recKeys, 'recommendation');
  const recommendation = Object.fromEntries(recKeys.map(k => [k, finite(rec[k], `recommendation.${k}`)])) as unknown as ContractConfig['recommendation'];
  const weightSum = Object.values(recommendation).reduce((a,b)=>a+b,0); if (Math.abs(weightSum-1)>1e-9) throw new ContractEngineError('InvalidContractConfig','Recommendation weights must sum to 1');
  const offers=raw.offers as Record<string,unknown>; exact(offers,['minimumOfferDurationYears','maximumOpenOffersPerPlayer','offerExpirationSeasonOffset'],'offers');
  const normalizedOffers={minimumOfferDurationYears:integer(offers.minimumOfferDurationYears,'offers.minimumOfferDurationYears',1),maximumOpenOffersPerPlayer:integer(offers.maximumOpenOffersPerPlayer,'offers.maximumOpenOffersPerPlayer',1),offerExpirationSeasonOffset:integer(offers.offerExpirationSeasonOffset,'offers.offerExpirationSeasonOffset',0)};
  const rights=raw.rights as Record<string,unknown>; exact(rights,['requireActiveDraftRightForDraftedProspect'],'rights'); if(typeof rights.requireActiveDraftRightForDraftedProspect!=='boolean') throw new ContractEngineError('InvalidContractConfig','rights flag must be boolean');
  return {schemaVersion:1,salary:{minimum,maximum,roundingIncrement,abilityBands},term:normalizedTerm,recommendation,offers:normalizedOffers,rights:{requireActiveDraftRightForDraftedProspect:rights.requireActiveDraftRightForDraftedProspect}};
}
