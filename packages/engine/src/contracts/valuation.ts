import type { ContractConfig, ContractPlayerInput, ContractValuation } from './types.js';
import { contractAgeOnDate } from './eligibility.js';
import { stableContractHash } from './hashing.js';

export const roundSalary = (value:number, increment:number) => Math.round(value/increment)*increment;
const clamp=(n:number,min:number,max:number)=>Math.min(max,Math.max(min,n));
export function recommendContract(player: ContractPlayerInput, config: ContractConfig): ContractValuation {
  const age=contractAgeOnDate(player.dateOfBirth,player.effectiveDate), ability=clamp(Math.round(player.currentAbility),0,100);
  const band=config.salary.abilityBands.find(b=>ability>=b.minimumAbility&&ability<=b.maximumAbility)!;
  const role=clamp(player.roleRating ?? 50,0,100), performance=clamp(player.recentPerformance ?? 50,0,100), trend=clamp((player.developmentTrend ?? 0)+50,0,100);
  const ageScore=age<=26?100:clamp(100-(age-26)*9,15,100), retirementRisk=clamp((age-32)*12,0,100);
  const r=config.recommendation;
  const score=ageScore*r.ageWeight+ability*r.abilityWeight+role*r.roleWeight+performance*r.recentPerformanceWeight+trend*r.developmentTrendWeight+(100-retirementRisk)*r.retirementRiskWeight;
  const salary=clamp(roundSalary(band.baseSalary*(.75+score/200),config.salary.roundingIncrement),config.salary.minimum,config.salary.maximum);
  const ageCap=age<=23?config.term.youngPlayerMaximumYears:age>=32?config.term.veteranMaximumYears:config.term.maximumYears;
  const term=clamp(score>=78?5:score>=62?3:score>=45?2:1,config.term.minimumYears,ageCap);
  const factors=[`Current ability ${ability} maps to the ${band.minimumAbility}-${band.maximumAbility} salary band.`,`Age ${age} produces an age score of ${Math.round(ageScore)}.`,`Role fit ${Math.round(role)}, recent performance ${Math.round(performance)}, development trend ${Math.round(trend-50)}.`,`Retirement risk ${Math.round(retirementRisk)}; recommended term ${term} season(s).`];
  const result={recommendedAnnualSalary:salary,recommendedTermYears:term,minimumReasonableSalary:clamp(roundSalary(salary*.8,config.salary.roundingIncrement),config.salary.minimum,config.salary.maximum),maximumReasonableSalary:clamp(roundSalary(salary*1.2,config.salary.roundingIncrement),config.salary.minimum,config.salary.maximum),recommendationConfidence:player.recentPerformance==null?.65:.85,factors};
  return {...result,recommendationHash:stableContractHash({player:{...player,potentialFloor:undefined,potentialCeiling:undefined},result})};
}
