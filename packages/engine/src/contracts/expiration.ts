import type { ExpirationContractInput, ExpirationDecision } from './types.js';
export function classifyExpiration(active: ExpirationContractInput, future: ExpirationContractInput | undefined, effectiveOrder:number): ExpirationDecision {
  if(active.status!=='ACTIVE'||active.endOrder>=effectiveOrder)return{contractId:active.id,playerId:active.playerId,action:'NONE'};
  if(future?.status==='FUTURE'&&future.startOrder===effectiveOrder)return{contractId:active.id,playerId:active.playerId,action:'EXPIRE_AND_ACTIVATE_FUTURE',futureContractId:future.id};
  return{contractId:active.id,playerId:active.playerId,action:'EXPIRE_TO_FREE_AGENT'};
}
