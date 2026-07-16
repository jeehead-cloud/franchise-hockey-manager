import type { ContractConfig, ContractRange, OfferComparisonInput, OfferTerms } from './types.js';
import { ContractEngineError } from './types.js';
export function validateOfferTerms(terms: OfferTerms, config: ContractConfig, existing: ContractRange[] = []): number {
  const years=terms.endSeason.order-terms.startSeason.order+1;
  if(terms.endSeason.order<terms.startSeason.order||years<config.offers.minimumOfferDurationYears||years>config.term.maximumYears)throw new ContractEngineError('InvalidContractTerms','Invalid contract season range');
  if(!Number.isInteger(terms.annualSalary)||terms.annualSalary<config.salary.minimum||terms.annualSalary>config.salary.maximum||terms.annualSalary%config.salary.roundingIncrement!==0)throw new ContractEngineError('InvalidContractTerms','Salary is outside bounds or rounding increment');
  if(existing.some(c=>c.status!=='CANCELLED'&&terms.startSeason.order<=c.endOrder&&terms.endSeason.order>=c.startOrder))throw new ContractEngineError('ContractOverlap','Contract seasons overlap');
  return years;
}
export function compareOffers(offers: OfferComparisonInput[]): OfferComparisonInput[] { return [...offers].sort((a,b)=>(b.annualSalary*b.years)-(a.annualSalary*a.years)||b.annualSalary-a.annualSalary||b.years-a.years||(a.submittedAt??'').localeCompare(b.submittedAt??'')||a.offerId.localeCompare(b.offerId)); }
