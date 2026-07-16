import { describe, expect, it } from 'vitest';
import {
  assertRightsConversion, assertSigningEligibility, classifyExpiration, compareOffers,
  contractAgeOnDate, defaultContractConfig, isDerivedFreeAgent, recommendContract,
  recommendExtension, reconcileContracts, stableContractHash, validateContractConfig,
  validateOfferTerms,
} from './index.js';

const config=defaultContractConfig();
const player={playerId:'p1',dateOfBirth:'2003-06-15',effectiveDate:'2028-09-15',currentAbility:72,roleRating:70,recentPerformance:65,developmentTrend:2,rosterStatus:'ACTIVE',currentTeamId:'t1',activeContractTeamId:'t1',currentAnnualSalary:5_000_000};

describe('contracts engine',()=>{
  it('validates strict default config and salary bands',()=>{expect(validateContractConfig(config)).toEqual(config);expect(()=>validateContractConfig({...config,extra:true})).toThrow(/Unknown/);});
  it('rejects gaps in ability bands',()=>expect(()=>validateContractConfig({...config,salary:{...config.salary,abilityBands:config.salary.abilityBands.slice(1)}})).toThrow());
  it('calculates age on explicit date',()=>expect(contractAgeOnDate('2000-09-16','2028-09-15')).toBe(27));
  it('recommends deterministically without mutating input',()=>{const before=structuredClone(player);const a=recommendContract(player,config);const b=recommendContract(player,config);expect(a).toEqual(b);expect(a.recommendedAnnualSalary%50_000).toBe(0);expect(player).toEqual(before);});
  it('produces transparent extension recommendation',()=>{const r=recommendExtension(player,config);expect(r.recommendationType).toBe('RECOMMEND_EXTEND');expect(r.factors.length).toBeGreaterThan(2);});
  it('rejects retired and already contracted free-agent signings',()=>{expect(()=>assertSigningEligibility({...player,rosterStatus:'RETIRED'},'EXTENSION','t1')).toThrowError(expect.objectContaining({name:'PlayerRetired'}));expect(()=>assertSigningEligibility(player,'FREE_AGENT','t2')).toThrow();});
  it('derives unrestricted free agency',()=>expect(isDerivedFreeAgent({rosterStatus:'ACTIVE',currentTeamId:null,activeContractTeamId:null,hasFutureContract:false,activeDraftRightTeamId:null})).toBe(true));
  it('enforces draft rights',()=>{expect(()=>assertSigningEligibility({...player,currentTeamId:null,activeContractTeamId:null,activeDraftRightTeamId:'t1'},'DRAFT_RIGHTS','t2')).toThrow();expect(assertRightsConversion({rightStatus:'ACTIVE',rightTeamId:'t1',signingTeamId:'t1',playerCurrentTeamId:null})).toBe(true);});
  it('validates terms, rounding, limits, and overlap',()=>{const terms={offerType:'FREE_AGENT' as const,offeringTeamId:'t1',startSeason:{id:'s1',order:2028},endSeason:{id:'s2',order:2029},annualSalary:2_500_000};expect(validateOfferTerms(terms,config)).toBe(2);expect(()=>validateOfferTerms(terms,config,[{startOrder:2027,endOrder:2028,status:'ACTIVE'}])).toThrowError(expect.objectContaining({name:'ContractOverlap'}));});
  it('compares offers deterministically by total then salary',()=>expect(compareOffers([{offerId:'a',annualSalary:2_000_000,years:2},{offerId:'b',annualSalary:3_000_000,years:1}])[0]!.offerId).toBe('a'));
  it('classifies expiration and future activation',()=>{const active={id:'a',playerId:'p',teamId:'t',startOrder:2027,endOrder:2027,status:'ACTIVE' as const};expect(classifyExpiration(active,undefined,2028).action).toBe('EXPIRE_TO_FREE_AGENT');expect(classifyExpiration(active,{id:'f',playerId:'p',teamId:'t',startOrder:2028,endOrder:2029,status:'FUTURE'},2028).action).toBe('EXPIRE_AND_ACTIVATE_FUTURE');});
  it('detects active duplicates, overlap, and ownership mismatch',()=>expect(reconcileContracts([{playerId:'p',currentTeamId:'x',activeTeamId:'t',contracts:[{startOrder:1,endOrder:2,status:'ACTIVE'},{startOrder:2,endOrder:3,status:'FUTURE'}]}]).map(i=>i.code)).toEqual(['OWNERSHIP_MISMATCH','OVERLAP']));
  it('hashes canonically',()=>expect(stableContractHash({b:2,a:1})).toBe(stableContractHash({a:1,b:2})));
});
