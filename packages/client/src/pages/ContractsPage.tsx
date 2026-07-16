import { useCallback, useEffect, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { PageHeader } from '../components/layout/PageHeader';
import { Panel } from '../components/ui/Panel';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { EmptyState } from '../components/ui/EmptyState';
import { useCommissioner } from '../lib/commissioner';
import {
  commissionerExecuteExpiration, commissionerExecuteInitialContracts,
  commissionerExpirationPreview, commissionerInitialContractPreview,
  commissionerPrepareExpiration, commissionerPrepareInitialContracts,
  getContractById, getContractConfigurations, getContractExpirationRuns,
  getContracts, getContractsStatus, getTeamContracts, getWorldSeasons,
  type ContractItem, type ContractStatusDto,
} from '../lib/api';

const money=(n:number)=>new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',maximumFractionDigits:0}).format(n);
const tabs=['overview','active','expiring','transactions','expiration','configuration','diagnostics'];

function ContractTable({items}:{items:ContractItem[]}){
  if(!items.length)return <EmptyState title="No contracts" description="No contracts match this view."/>;
  return <div style={{overflowX:'auto'}}><table style={{width:'100%',borderCollapse:'collapse'}}><thead><tr>{['Player','Team','Status','Start','End','Annual salary','Source'].map(h=><th key={h} style={{textAlign:'left',padding:8,borderBottom:'1px solid var(--border-default)'}}>{h}</th>)}</tr></thead><tbody>{items.map(c=><tr key={c.id}><td style={{padding:8}}><Link to={`/contracts/${c.id}`}>{c.player?.name??c.playerNameSnapshot}</Link></td><td style={{padding:8}}>{c.team?.name??c.teamNameSnapshot}</td><td style={{padding:8}}><Badge tone={c.status==='ACTIVE'?'success':c.status==='FUTURE'?'info':'neutral'}>{c.status}</Badge></td><td style={{padding:8}}>{c.startSeason.label??c.startSeason.order}</td><td style={{padding:8}}>{c.endSeason.label??c.endSeason.order}</td><td style={{padding:8}}>{money(c.annualSalary)}</td><td style={{padding:8}}>{c.source}</td></tr>)}</tbody></table></div>;
}

export function ContractsPage(){
  const [params,setParams]=useSearchParams();const tab=params.get('tab')??'overview';
  const {enabled:commissioner}=useCommissioner();
  const [status,setStatus]=useState<ContractStatusDto|null>(null),[items,setItems]=useState<ContractItem[]>([]),[runs,setRuns]=useState<any[]>([]),[configs,setConfigs]=useState<any[]>([]),[seasons,setSeasons]=useState<any[]>([]),[message,setMessage]=useState(''),[busy,setBusy]=useState(false);
  const load=useCallback(async()=>{const [s,c,r,g,w]=await Promise.all([getContractsStatus(),getContracts('?pageSize=100'),getContractExpirationRuns(),getContractConfigurations(),getWorldSeasons()]);setStatus(s.item);setItems(c.items);setRuns(r.items);setConfigs(g.items);setSeasons(w.items);},[]);
  useEffect(()=>{load().catch(e=>setMessage(e instanceof Error?e.message:'Failed to load contracts'));},[load]);
  const seasonId=seasons.find(s=>s.status==='ACTIVE')?.id??seasons[0]?.id;
  async function initialize(){if(!seasonId)return;setBusy(true);try{const preview=await commissionerInitialContractPreview(seasonId);if(!window.confirm(`Create ${preview.item.totalContracts} initial contracts? A SQLite backup will be created.`))return;const p=await commissionerPrepareInitialContracts(seasonId,'Initialize F28 contracts');await commissionerExecuteInitialContracts(p.item.id,'Publish initial contracts');setMessage('Initial contracts created.');await load();}catch(e){setMessage(e instanceof Error?e.message:'Initialization failed');}finally{setBusy(false)}}
  async function expire(){if(!seasonId)return;setBusy(true);try{const preview=await commissionerExpirationPreview(seasonId);if(!window.confirm(`Expire ${preview.item.expiredCount} contracts and activate ${preview.item.activatedFutureCount} future contracts?`))return;const p=await commissionerPrepareExpiration(seasonId,'Manual F28 expiration');await commissionerExecuteExpiration(p.item.id);setMessage('Expiration completed. Lineups were not changed.');await load();}catch(e){setMessage(e instanceof Error?e.message:'Expiration failed');}finally{setBusy(false)}}
  const playerFilter=params.get('playerId');
  const scoped=playerFilter?items.filter(c=>c.playerId===playerFilter):items;
  const displayed=tab==='active'?scoped.filter(c=>c.status==='ACTIVE'):tab==='expiring'?scoped.filter(c=>c.status==='ACTIVE'&&c.endSeason.order===seasons.find(s=>s.id===seasonId)?.startYear):scoped;
  return <div><PageHeader title="Contracts & Free Agency" subtitle="Persistent simplified contracts. Payroll is informational; no salary cap is enforced." badge="F28"/>
    <div style={{display:'flex',gap:6,flexWrap:'wrap',marginBottom:16}}>{tabs.map(t=><Button key={t} variant={tab===t?'primary':'secondary'} onClick={()=>setParams({tab:t})}>{t[0]!.toUpperCase()+t.slice(1)}</Button>)}<Link to="/free-agency"><Button variant="secondary">Free Agency</Button></Link></div>
    {message&&<p style={{color:'var(--text-secondary)'}}>{message}</p>}
    {tab==='overview'&&<div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(180px,1fr))',gap:12,marginBottom:16}}>{[['Active',status?.activeContracts],['Expiring / offers',status?.openOffers],['Free agents',status?.freeAgents],['Unsigned rights',status?.rightsHeldUnsignedProspects]].map(([k,v])=><Panel key={String(k)} title={String(k)}><strong style={{fontSize:28}}>{v??'—'}</strong></Panel>)}</div>}
    {(tab==='overview'||tab==='active'||tab==='expiring'||tab==='transactions')&&<Panel title={tab==='overview'?'All Contracts':tab}><ContractTable items={displayed}/></Panel>}
    {tab==='expiration'&&<Panel title="Manual contract boundary"><p>F28 processes an explicit existing WorldSeason. F30 will orchestrate this later. A backup is required; lineups are never auto-rebuilt.</p>{commissioner?<Button disabled={busy||!status?.initialized} onClick={expire}>Preview & execute expiration</Button>:<p>Enable Commissioner Mode to prepare and execute expiration.</p>}<ul>{runs.map(r=><li key={r.id}>{r.worldSeason.label}: {r.status} — expired {r.expiredCount}, activated {r.activatedFutureCount}, free agents {r.freeAgentCount}</li>)}</ul></Panel>}
    {tab==='configuration'&&<Panel title="Versioned configuration"><p>Salary unit: integer dollars, constant annual value, $50,000 default rounding. No cap, bonuses, clauses, or two-way mechanics.</p>{configs.map(c=><div key={c.id}><strong>{c.name}</strong> — {c.description}<ul>{c.versions.map((v:any)=><li key={v.id}>v{v.versionNumber} {v.isActive?'(active)':''} · {v.configHash.slice(0,12)}</li>)}</ul></div>)}</Panel>}
    {tab==='diagnostics'&&<Panel title="Compatibility & correction boundaries"><p>Status: <Badge tone={status?.initialized?'success':'warning'}>{status?.initialized?'INITIALIZED':'COMPATIBILITY MODE'}</Badge></p>{!status?.initialized&&commissioner&&<Button disabled={busy} onClick={initialize}>Preview & create initial contracts</Button>}<p>Accepted terms and completed transactions are immutable. Corrections use release/termination or backup recovery; no in-place salary edits.</p></Panel>}
  </div>;
}

export function ContractDetailPage(){const{id=''}=useParams();const[item,setItem]=useState<any>(null),[error,setError]=useState('');useEffect(()=>{getContractById(id).then(r=>setItem(r.item)).catch(e=>setError(e.message));},[id]);if(error)return <EmptyState title="Contract unavailable" description={error}/>;if(!item)return <p>Loading…</p>;return <div><PageHeader title={`${item.playerNameSnapshot} contract`} subtitle={`${item.teamNameSnapshot} · ${item.status}`}/><Panel title="Terms"><p>{item.startSeason.label??item.startSeason.order} — {item.endSeason.label??item.endSeason.order}</p><p><strong>{money(item.annualSalary)}</strong> per season · {item.contractType} · {item.source}</p><p>Terms hash: <code>{item.termsHash}</code></p></Panel><Panel title="Transactions"><pre style={{whiteSpace:'pre-wrap'}}>{JSON.stringify(item.transactions,null,2)}</pre></Panel></div>}

export function TeamContractsPage(){const{teamId=''}=useParams();const[data,setData]=useState<any>(null),[error,setError]=useState('');useEffect(()=>{getTeamContracts(teamId).then(setData).catch(e=>setError(e.message));},[teamId]);if(error)return <EmptyState title="Team contracts unavailable" description={error}/>;return <div><PageHeader title="Team Contracts" subtitle="Payroll is informational only; no cap enforcement."/><Panel title={`Payroll ${data?money(data.payroll):'—'}`}><ContractTable items={data?.items??[]}/></Panel></div>}
