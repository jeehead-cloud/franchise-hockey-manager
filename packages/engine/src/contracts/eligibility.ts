import type { ContractOfferType, ContractPlayerInput } from './types.js';
import { ContractEngineError } from './types.js';

export function contractAgeOnDate(birthDate: string, effectiveDate: string): number {
  const parse=(v:string)=>{const m=/^(\d{4})-(\d{2})-(\d{2})$/.exec(v);if(!m)throw new ContractEngineError('InvalidContractInput','Dates must use YYYY-MM-DD');const d=new Date(Date.UTC(+m[1]!,+m[2]!-1,+m[3]!));if(d.getUTCFullYear()!==+m[1]!||d.getUTCMonth()!==+m[2]!-1||d.getUTCDate()!==+m[3]!)throw new ContractEngineError('InvalidContractInput','Invalid calendar date');return d};
  const dob=parse(birthDate), eff=parse(effectiveDate); if(eff<dob)throw new ContractEngineError('InvalidContractInput','Effective date precedes birth date');
  let age=eff.getUTCFullYear()-dob.getUTCFullYear(); if(eff.getUTCMonth()<dob.getUTCMonth()||(eff.getUTCMonth()===dob.getUTCMonth()&&eff.getUTCDate()<dob.getUTCDate()))age--; return age;
}

export function assertSigningEligibility(player: ContractPlayerInput, offerType: ContractOfferType, offeringTeamId: string): void {
  if (player.rosterStatus === 'RETIRED') throw new ContractEngineError('PlayerRetired','Retired players cannot sign');
  if (offerType === 'EXTENSION') {
    if (!player.activeContractTeamId || player.activeContractTeamId !== offeringTeamId) throw new ContractEngineError('ActiveContractNotFound','Extension requires the team current active contract');
    if (player.hasFutureContract) throw new ContractEngineError('FutureContractExists','Player already has a future contract');
    return;
  }
  if (player.activeContractTeamId || player.hasFutureContract) throw new ContractEngineError('PlayerAlreadyUnderContract','Player already has a contract');
  if (offerType === 'DRAFT_RIGHTS') {
    if (!player.activeDraftRightTeamId) throw new ContractEngineError('DraftRightRequired','Active draft right required');
    if (player.activeDraftRightTeamId !== offeringTeamId) throw new ContractEngineError('DraftRightOwnedByAnotherTeam','Draft right is owned by another team');
  } else if (player.activeDraftRightTeamId) throw new ContractEngineError('DraftRightOwnedByAnotherTeam','Rights-held player is not an unrestricted free agent');
  if (player.currentTeamId) throw new ContractEngineError('PlayerNotFreeAgent','Player is currently assigned to a team');
}

export const isDerivedFreeAgent = (p: Pick<ContractPlayerInput,'rosterStatus'|'currentTeamId'|'activeContractTeamId'|'hasFutureContract'|'activeDraftRightTeamId'>) => p.rosterStatus !== 'RETIRED' && !p.currentTeamId && !p.activeContractTeamId && !p.hasFutureContract && !p.activeDraftRightTeamId;
