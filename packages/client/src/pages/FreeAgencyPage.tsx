import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { PageHeader } from '../components/layout/PageHeader';
import { Panel } from '../components/ui/Panel';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { EmptyState } from '../components/ui/EmptyState';
import {
  acceptContractOffer, createFreeAgentOffer, getFreeAgents, getTeamContractOffers,
  getTeams, getWorldSeasons, submitContractOffer, withdrawContractOffer,
  type FreeAgentItem,
} from '../lib/api';

const money=(n:number)=>new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',maximumFractionDigits:0}).format(n);

export function FreeAgencyPage(){
  const[items,setItems]=useState<FreeAgentItem[]>([]),[teams,setTeams]=useState<Array<{id:string;name:string}>>([]),[teamId,setTeamId]=useState(''),[seasons,setSeasons]=useState<any[]>([]),[offers,setOffers]=useState<any[]>([]),[busy,setBusy]=useState(''),[message,setMessage]=useState('');
  const load=useCallback(async()=>{const[f,s,t,o]=await Promise.all([getFreeAgents(teamId||undefined),getWorldSeasons(),getTeams({page:1,pageSize:100,teamType:'CLUB'}),teamId?getTeamContractOffers(teamId):Promise.resolve({items:[]})]);setItems(f.items);setSeasons(s.items);setTeams(t.items);setOffers(o.items)},[teamId]);
  useEffect(()=>{load().catch(e=>setMessage(e instanceof Error?e.message:'Unable to load free agency'));},[load]);
  const season=seasons.find(s=>s.status==='ACTIVE')??seasons[0];
  async function offer(p:FreeAgentItem){if(!teamId||!season)return;setBusy(p.player.id);try{const draft=await createFreeAgentOffer(teamId,{playerId:p.player.id,startWorldSeasonId:season.id,endWorldSeasonId:season.id,annualSalary:p.recommendation.annualSalary,reason:'Free-agent offer'});await submitContractOffer(teamId,draft.item.id,draft.item.updatedAt);setMessage(`Submitted offer to ${p.player.name}. Ownership does not change before explicit acceptance.`);await load()}catch(e){setMessage(e instanceof Error?e.message:'Offer failed')}finally{setBusy('')}}
  async function decide(o:any,action:'accept'|'withdraw'){setBusy(o.id);try{if(action==='accept'){if(!window.confirm('Accept this offer? Ownership changes atomically, competing offers close, and lineups are not rebuilt.'))return;await acceptContractOffer(o.id,'Accepted from free-agency workspace',o.updatedAt)}else await withdrawContractOffer(teamId,o.id,'Withdrawn by offering team',o.updatedAt);await load()}catch(e){setMessage(e instanceof Error?e.message:'Offer action failed')}finally{setBusy('')}}
  return <div><PageHeader title="Free Agency" subtitle="Submit persistent offers, compare them, and accept one explicitly. There is no autonomous player agent."/>
    <Panel title="Team context"><label>Offering team <select value={teamId} onChange={e=>setTeamId(e.target.value)} style={{marginLeft:8,padding:8}}><option value="">Select a club</option>{teams.map(t=><option key={t.id} value={t.id}>{t.name}</option>)}</select></label><p style={{color:'var(--text-tertiary)'}}>Prospect recommendations use this team’s scouting report or a conservative unknown fallback. Hidden true potential is never shown.</p></Panel>
    {message&&<p>{message}</p>}
    {teamId&&<Panel title="Team offers"><p>Offers create no ownership until acceptance. Rejected and withdrawn offers remain historical.</p>{!offers.length?<EmptyState title="No offers" description="This team has not created a contract offer."/>:<div style={{overflowX:'auto'}}><table style={{width:'100%'}}><thead><tr>{['Player','Type','Terms','Salary','Status','Actions'].map(h=><th key={h} style={{textAlign:'left',padding:8}}>{h}</th>)}</tr></thead><tbody>{offers.map(o=><tr key={o.id}><td style={{padding:8}}>{o.player.firstName} {o.player.lastName}</td><td>{o.offerType}</td><td>{o.startWorldSeason.label} — {o.endWorldSeason.label}</td><td>{money(o.annualSalary)}</td><td><Badge tone={o.status==='ACCEPTED'?'success':o.status==='SUBMITTED'?'info':'neutral'}>{o.status}</Badge></td><td>{o.status==='SUBMITTED'&&<><Button disabled={busy===o.id} onClick={()=>decide(o,'accept')}>Accept</Button> <Button variant="secondary" disabled={busy===o.id} onClick={()=>decide(o,'withdraw')}>Withdraw</Button></>}</td></tr>)}</tbody></table></div>}</Panel>}
    <Panel title={`Unrestricted Free Agents (${items.length})`}>{!items.length?<EmptyState title="No free agents" description="No eligible unrestricted free agents match this view."/>:<div style={{overflowX:'auto'}}><table style={{width:'100%',borderCollapse:'collapse'}}><thead><tr>{['Player','Pos','Country','Ability','Previous team','Recommended','Term','Open offers','Action'].map(h=><th key={h} style={{textAlign:'left',padding:8,borderBottom:'1px solid var(--border-default)'}}>{h}</th>)}</tr></thead><tbody>{items.map(p=><tr key={p.player.id}><td style={{padding:8}}><Link to={`/players/${p.player.id}`}>{p.player.name}</Link></td><td style={{padding:8}}>{p.player.position}</td><td style={{padding:8}}>{p.player.country}</td><td style={{padding:8}}>{p.player.model.currentAbility??'Unknown'}</td><td style={{padding:8}}>{p.previousContract?.teamNameSnapshot??'—'}</td><td style={{padding:8}}>{money(p.recommendation.annualSalary)}</td><td style={{padding:8}}>{p.recommendation.termYears}</td><td style={{padding:8}}>{p.openOffers}</td><td style={{padding:8}}><Button disabled={!teamId||busy===p.player.id} onClick={()=>offer(p)}>Create & submit offer</Button></td></tr>)}</tbody></table></div>}</Panel>
  </div>
}
