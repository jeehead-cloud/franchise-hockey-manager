import type { ContractConfig, ContractPlayerInput, ExtensionRecommendation } from './types.js';
import { contractAgeOnDate } from './eligibility.js';
import { recommendContract } from './valuation.js';
export function recommendExtension(player: ContractPlayerInput, config: ContractConfig): ExtensionRecommendation {
  const valuation=recommendContract(player,config); const salaryRatio=(player.currentAnnualSalary??valuation.recommendedAnnualSalary)/valuation.recommendedAnnualSalary;
  const age=contractAgeOnDate(player.dateOfBirth,player.effectiveDate);
  const recommendationType = player.rosterStatus==='RETIRED'||(age>=36&&player.currentAbility<55)||player.currentAbility<35?'RECOMMEND_RELEASE':player.currentAbility>=55&&salaryRatio<=1.35?'RECOMMEND_EXTEND':'REVIEW';
  return {...valuation,recommendationType};
}
