import { createHash } from 'node:crypto';
import type { Prisma, PrismaClient } from '@prisma/client';
import { defaultContractConfig, validateContractConfig, type ContractConfig } from '@fhm/engine';

export type ContractDbClient = PrismaClient | Prisma.TransactionClient;
export const CONTRACT_DEFAULT_PRESET_NAME='Contracts Simplified Default';
export const canonicalContractConfig=(config:ContractConfig)=>JSON.stringify(config);
export const hashContractConfig=(config:ContractConfig)=>createHash('sha256').update(canonicalContractConfig(config)).digest('hex');

export async function bootstrapContractConfiguration(client:ContractDbClient){
  let preset=await client.contractPreset.findFirst({where:{name:CONTRACT_DEFAULT_PRESET_NAME,isSystem:true},include:{versions:{orderBy:{versionNumber:'desc'}}}});
  if(!preset){const config=defaultContractConfig();preset=await client.contractPreset.create({data:{name:CONTRACT_DEFAULT_PRESET_NAME,description:'Simplified fictional salary and term rules; no salary cap',isSystem:true,versions:{create:{versionNumber:1,schemaVersion:1,configJson:canonicalContractConfig(config),configHash:hashContractConfig(config),changeReason:'Bootstrap F28 simplified contracts default'}}},include:{versions:{orderBy:{versionNumber:'desc'}}}});}
  await client.activeContractConfiguration.upsert({where:{id:'default'},create:{id:'default',activePresetVersionId:preset.versions[0]!.id},update:{}});
  return{presetId:preset.id,versionId:preset.versions[0]!.id};
}

export async function getActiveContractSnapshot(client:ContractDbClient){
  let active=await client.activeContractConfiguration.findUnique({where:{id:'default'},include:{activeVersion:{include:{preset:true}}}});
  if(!active){await bootstrapContractConfiguration(client);active=await client.activeContractConfiguration.findUniqueOrThrow({where:{id:'default'},include:{activeVersion:{include:{preset:true}}}});}
  return{preset:{id:active.activeVersion.preset.id,name:active.activeVersion.preset.name},version:{id:active.activeVersion.id,versionNumber:active.activeVersion.versionNumber,configHash:active.activeVersion.configHash},config:validateContractConfig(JSON.parse(active.activeVersion.configJson))};
}

export async function listContractConfigurations(client:ContractDbClient){const active=await client.activeContractConfiguration.findUnique({where:{id:'default'}});const items=await client.contractPreset.findMany({include:{versions:{orderBy:{versionNumber:'desc'}}},orderBy:[{isSystem:'desc'},{name:'asc'}]});return items.map(p=>({id:p.id,name:p.name,description:p.description,isSystem:p.isSystem,versions:p.versions.map(v=>({id:v.id,versionNumber:v.versionNumber,schemaVersion:v.schemaVersion,configHash:v.configHash,config:JSON.parse(v.configJson),isActive:v.id===active?.activePresetVersionId,createdAt:v.createdAt}))}));}
