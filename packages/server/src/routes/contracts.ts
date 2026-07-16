import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { detailResponse, listResponse } from '../http.js';
import { listContractConfigurations } from '../services/contract-config.js';
import { ContractHttpError } from '../services/contract-errors.js';
import { prisma } from '../db/client.js';
import { acceptOffer, createOffer, createRecommendation, getContract, getContractReadiness, getContractsStatus, getExpirationRun, getFreeAgent, getPlayerContracts, getPlayerContractStatus, getPlayerOffers, getPlayerRecommendations, getPlayerTransactions, getTeamContracts, getTeamExpiring, getTeamOffers, listContracts, listExpirationRuns, listFreeAgents, rejectOffer, releaseContract, submitOffer, withdrawOffer } from '../services/contracts.js';

function error(reply:any,e:unknown){if(e instanceof ContractHttpError)return reply.status(e.statusCode).send({error:e.code,message:e.message,details:e.details});if(e instanceof z.ZodError)return reply.status(400).send({error:'InvalidContractRequest',message:'Invalid contract request',details:e.issues});throw e;}
const reason=z.string().trim().min(1).max(500),expectedUpdatedAt=z.string().datetime().optional();
const offerBody=z.object({playerId:z.string().min(1),offerType:z.enum(['EXTENSION','FREE_AGENT','DRAFT_RIGHTS']),startWorldSeasonId:z.string().min(1),endWorldSeasonId:z.string().min(1),annualSalary:z.number().int().positive(),reason:z.string().max(500).optional(),draftRightId:z.string().optional(),currentContractId:z.string().optional()}).strict();
export async function registerContractRoutes(app:FastifyInstance){
  app.get('/api/contracts/status',async(_q,r)=>{try{return detailResponse(await getContractsStatus())}catch(e){return error(r,e)}});
  app.get('/api/contracts/readiness',async(_q,r)=>{try{return detailResponse(await getContractReadiness())}catch(e){return error(r,e)}});
  app.get('/api/contracts/configurations',async(_q,r)=>{try{return listResponse(await listContractConfigurations(prisma))}catch(e){return error(r,e)}});
  app.get('/api/contracts',async(q,r)=>{try{return await listContracts(q.query)}catch(e){return error(r,e)}});
  app.get('/api/contracts/:contractId',async(q,r)=>{try{return detailResponse(await getContract((q.params as any).contractId))}catch(e){return error(r,e)}});
  app.get('/api/players/:playerId/contracts',async(q,r)=>{try{return await getPlayerContracts((q.params as any).playerId)}catch(e){return error(r,e)}});
  app.get('/api/players/:playerId/contract-status',async(q,r)=>{try{return detailResponse(await getPlayerContractStatus((q.params as any).playerId))}catch(e){return error(r,e)}});
  app.get('/api/players/:playerId/contract-recommendations',async(q,r)=>{try{return await getPlayerRecommendations((q.params as any).playerId)}catch(e){return error(r,e)}});
  app.get('/api/players/:playerId/contract-offers',async(q,r)=>{try{return await getPlayerOffers((q.params as any).playerId)}catch(e){return error(r,e)}});
  app.get('/api/players/:playerId/contract-transactions',async(q,r)=>{try{return await getPlayerTransactions((q.params as any).playerId)}catch(e){return error(r,e)}});
  app.get('/api/teams/:teamId/contracts',async(q,r)=>{try{return await getTeamContracts((q.params as any).teamId)}catch(e){return error(r,e)}});
  app.get('/api/teams/:teamId/contracts/expiring',async(q,r)=>{try{return await getTeamExpiring((q.params as any).teamId,Number((q.query as any)?.seasonOrder)||undefined)}catch(e){return error(r,e)}});
  app.get('/api/teams/:teamId/free-agent-offers',async(q,r)=>{try{return await getTeamOffers((q.params as any).teamId)}catch(e){return error(r,e)}});
  app.get('/api/free-agents',async(q,r)=>{try{return await listFreeAgents(q.query)}catch(e){return error(r,e)}});
  app.get('/api/free-agents/:playerId',async(q,r)=>{try{return detailResponse(await getFreeAgent((q.params as any).playerId,(q.query as any)?.teamId))}catch(e){return error(r,e)}});
  app.get('/api/contract-expiration-runs',async(_q,r)=>{try{return await listExpirationRuns()}catch(e){return error(r,e)}});
  app.get('/api/contract-expiration-runs/:runId',async(q,r)=>{try{return detailResponse(await getExpirationRun((q.params as any).runId))}catch(e){return error(r,e)}});
  app.post('/api/teams/:teamId/players/:playerId/contract-recommendation',async(q,r)=>{try{return detailResponse(await createRecommendation((q.params as any).teamId,(q.params as any).playerId))}catch(e){return error(r,e)}});
  app.post('/api/teams/:teamId/players/:playerId/extension-offers',async(q,r)=>{try{const b=offerBody.omit({playerId:true,offerType:true}).parse(q.body);return detailResponse(await createOffer((q.params as any).teamId,{...b,playerId:(q.params as any).playerId,offerType:'EXTENSION'}))}catch(e){return error(r,e)}});
  app.post('/api/teams/:teamId/free-agent-offers',async(q,r)=>{try{const b=offerBody.omit({offerType:true}).parse(q.body);return detailResponse(await createOffer((q.params as any).teamId,{...b,offerType:'FREE_AGENT'}))}catch(e){return error(r,e)}});
  app.post('/api/teams/:teamId/draft-rights/:rightId/contract-offers',async(q,r)=>{try{const b=offerBody.omit({offerType:true,draftRightId:true}).parse(q.body);return detailResponse(await createOffer((q.params as any).teamId,{...b,offerType:'DRAFT_RIGHTS',draftRightId:(q.params as any).rightId}))}catch(e){return error(r,e)}});
  app.post('/api/teams/:teamId/contract-offers/:offerId/submit',async(q,r)=>{try{const b=z.object({expectedUpdatedAt}).parse(q.body??{});return detailResponse(await submitOffer((q.params as any).offerId,(q.params as any).teamId,b.expectedUpdatedAt))}catch(e){return error(r,e)}});
  app.post('/api/teams/:teamId/contract-offers/:offerId/withdraw',async(q,r)=>{try{const b=z.object({reason,expectedUpdatedAt}).parse(q.body);return detailResponse(await withdrawOffer((q.params as any).offerId,(q.params as any).teamId,b.reason,b.expectedUpdatedAt))}catch(e){return error(r,e)}});
  app.post('/api/contract-offers/:offerId/accept',async(q,r)=>{try{const b=z.object({reason,expectedUpdatedAt}).parse(q.body);return detailResponse(await acceptOffer((q.params as any).offerId,b.reason,b.expectedUpdatedAt))}catch(e){return error(r,e)}});
  app.post('/api/contract-offers/:offerId/reject',async(q,r)=>{try{const b=z.object({reason,expectedUpdatedAt}).parse(q.body);return detailResponse(await rejectOffer((q.params as any).offerId,b.reason,b.expectedUpdatedAt))}catch(e){return error(r,e)}});
  app.post('/api/teams/:teamId/contracts/:contractId/release',async(q,r)=>{try{const b=z.object({reason,expectedUpdatedAt}).parse(q.body);return detailResponse(await releaseContract((q.params as any).contractId,(q.params as any).teamId,b))}catch(e){return error(r,e)}});
}
