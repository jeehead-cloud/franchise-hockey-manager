import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { PageHeader } from '../components/layout/PageHeader';
import { Panel } from '../components/ui/Panel';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { EmptyState } from '../components/ui/EmptyState';
import { Tabs } from '../components/ui/Tabs';
import {
  acceptTradeProposal, createTradeProposal, getCompletedTradeById, getCompletedTrades, getTeamContracts, getTeamTradeCenter, getTeams,
  getTradeProposalById, getTradeProposals, getTradeReadiness, previewTradeProposal, rejectTradeProposal, submitTradeProposal,
  withdrawTradeProposal, type CompletedTradeItem, type TradeAssetDescriptor, type TradeProposalItem,
} from '../lib/api';

const money = (n: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n);
const assetLabel = (a: TradeProposalItem['assets'][number]) => a.playerContract?.player.name ?? a.draftPick ? `Round ${a.draftPick!.roundNumber} pick (#${a.draftPick!.overallPick})` : a.playerDraftRight?.player.name ?? 'Asset';

/** Trade Center landing + completed-trade list + proposal browser. */
export function TradesPage() {
  const [tab, setTab] = useState('overview');
  const [readiness, setReadiness] = useState<{ status: string; blockers: string[]; warnings: string[]; noSalaryCap: boolean } | null>(null);
  const [teams, setTeams] = useState<Array<{ id: string; name: string }>>([]);
  const [teamId, setTeamId] = useState('');
  const [overview, setOverview] = useState<{ openProposals: number; incomingProposals: number; outgoingProposals: number; recentCompletedTrades: number; rightsHeldUnsignedProspects: number; availablePicks: number; lineupRequiresReview: boolean; lineupReviewReason: string | null } | null>(null);
  const [proposals, setProposals] = useState<TradeProposalItem[]>([]);
  const [completed, setCompleted] = useState<CompletedTradeItem[]>([]);
  const [message, setMessage] = useState('');

  useEffect(() => { getTradeReadiness().then(r => setReadiness(r.item)).catch(() => setReadiness(null)); getTeams({ page: 1, pageSize: 100, teamType: 'CLUB' }).then(t => setTeams(t.items)).catch(() => { }); }, []);
  const loadOverview = useCallback(async () => { if (!teamId) return setOverview(null); setOverview((await getTeamTradeCenter(teamId)).item); }, [teamId]);
  useEffect(() => { loadOverview().catch(() => { }); }, [loadOverview]);
  const loadLists = useCallback(async () => {
    const [p, c] = await Promise.all([getTradeProposals(teamId ? `?teamId=${teamId}` : ''), getCompletedTrades(teamId ? `?teamId=${teamId}` : '')]);
    setProposals(p.items); setCompleted(c.items);
  }, [teamId]);
  useEffect(() => { loadLists().catch(e => setMessage(e instanceof Error ? e.message : 'Unable to load trades')); }, [loadLists]);

  return (
    <div>
      <PageHeader title="Trade Center" subtitle="Two-club proposals with atomic acceptance. Trade value is advisory only — there is no autonomous AI, no salary cap, and no roster-limit enforcement." />
      <Panel title="Team context">
        <label>Club team <select value={teamId} onChange={e => setTeamId(e.target.value)} style={{ marginLeft: 8, padding: 8 }}>
          <option value="">All teams</option>
          {teams.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select></label>
        {readiness && <p style={{ color: 'var(--text-tertiary)', marginTop: 8 }}>
          Status: <Badge tone={readiness.status === 'READY' ? 'success' : readiness.status === 'WARNING' ? 'warning' : 'danger'}>{readiness.status}</Badge>
          {' '}· No salary cap · No retained salary · No conditional picks · No multi-team trades
          {readiness.blockers.length ? ` · Blockers: ${readiness.blockers.join(', ')}` : ''}
        </p>}
      </Panel>
      {message && <p>{message}</p>}
      <Tabs items={[{ value: 'overview', label: 'Overview' }, { value: 'proposals', label: `Proposals (${proposals.length})` }, { value: 'completed', label: `Completed Trades (${completed.length})` }]} value={tab} onChange={setTab} />

      {tab === 'overview' && (
        <Panel title={teamId ? 'Team overview' : 'Select a team'}>
          {!teamId || !overview ? <EmptyState title="No team selected" description="Choose a club team to see its trade-center overview, rights held, and available picks." /> : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))', gap: 12 }}>
              <Stat label="Open proposals" value={overview.openProposals} />
              <Stat label="Incoming (submitted)" value={overview.incomingProposals} />
              <Stat label="Outgoing (submitted)" value={overview.outgoingProposals} />
              <Stat label="Recent completed trades" value={overview.recentCompletedTrades} />
              <Stat label="Rights held (unsigned)" value={overview.rightsHeldUnsignedProspects} />
              <Stat label="Available picks" value={overview.availablePicks} />
              <div style={{ gridColumn: '1/-1' }}>{overview.lineupRequiresReview && <Badge tone="warning">Lineup requires review: {overview.lineupReviewReason}</Badge>}</div>
            </div>
          )}
        </Panel>
      )}

      {tab === 'proposals' && <Panel title="Trade proposals">
        {!proposals.length ? <EmptyState title="No proposals" description="Create a proposal from a team's Trade Center. Drafts are editable; submitted proposals are immutable until accepted, rejected, or withdrawn." /> : (
          <div style={{ overflowX: 'auto' }}><table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead><tr>{['Proposing', 'Receiving', 'Assets', 'Status', 'Updated', 'Detail'].map(h => <th key={h} style={{ textAlign: 'left', padding: 8, borderBottom: '1px solid var(--border-default)' }}>{h}</th>)}</tr></thead>
            <tbody>{proposals.map(p => <tr key={p.id}>
              <td style={{ padding: 8 }}>{p.proposingTeam.name}</td>
              <td style={{ padding: 8 }}>{p.receivingTeam.name}</td>
              <td style={{ padding: 8 }}>{p.assets.length}</td>
              <td style={{ padding: 8 }}><Badge tone={p.status === 'ACCEPTED' ? 'success' : p.status === 'SUBMITTED' ? 'info' : p.status === 'REJECTED' || p.status === 'WITHDRAWN' ? 'neutral' : 'warning'}>{p.status}</Badge></td>
              <td style={{ padding: 8 }}>{new Date(p.updatedAt).toLocaleString()}</td>
              <td style={{ padding: 8 }}><Link to={`/trade-proposals/${p.id}`}>Review</Link></td>
            </tr>)}</tbody>
          </table></div>
        )}
      </Panel>}

      {tab === 'completed' && <Panel title="Completed trades (immutable)">
        {!completed.length ? <EmptyState title="No completed trades" description="Accepted trades publish atomically and record immutable history. Correction uses F32 recovery or a new opposite trade — never edits to history." /> : (
          <div style={{ overflowX: 'auto' }}><table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead><tr>{['Proposing', 'Receiving', 'Assets', 'Transactions', 'Completed', 'Detail'].map(h => <th key={h} style={{ textAlign: 'left', padding: 8, borderBottom: '1px solid var(--border-default)' }}>{h}</th>)}</tr></thead>
            <tbody>{completed.map(t => <tr key={t.id}>
              <td style={{ padding: 8 }}>{t.proposingTeam.name}</td>
              <td style={{ padding: 8 }}>{t.receivingTeam.name}</td>
              <td style={{ padding: 8 }}>{t.assets.length}</td>
              <td style={{ padding: 8 }}>{t.transactions.length}</td>
              <td style={{ padding: 8 }}>{new Date(t.completedAt).toLocaleString()}</td>
              <td style={{ padding: 8 }}><Link to={`/trades/${t.id}`}>View</Link></td>
            </tr>)}</tbody>
          </table></div>
        )}
      </Panel>}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return <div style={{ padding: 12, border: '1px solid var(--border-default)', borderRadius: 8 }}><div style={{ color: 'var(--text-tertiary)', font: 'var(--text-label)' }}>{label}</div><div style={{ fontSize: 22, fontWeight: 600 }}>{value}</div></div>;
}

/** Proposal detail + review/preview + accept/reject/withdraw/submit actions. */
export function TradeProposalDetailPage() {
  const { proposalId } = useParams();
  const [proposal, setProposal] = useState<TradeProposalItem | null>(null);
  const [preview, setPreview] = useState<{ valuations: { proposing: { totalValue: number }; receiving: { totalValue: number }; fairness: { imbalance: number; label: string; warning: boolean } } | null; previewError: { code: string; message: string } | null } | null>(null);
  const [actorTeamId, setActorTeamId] = useState('');
  const [teams, setTeams] = useState<Array<{ id: string; name: string }>>([]);
  const [busy, setBusy] = useState('');
  const [message, setMessage] = useState('');

  const load = useCallback(async () => {
    if (!proposalId) return;
    const p = (await getTradeProposalById(proposalId)).item;
    setProposal(p);
    try { setPreview((await previewTradeProposal(p.proposingTeam.id, proposalId)).item); } catch (e) { setPreview({ valuations: null, previewError: { code: 'PreviewFailed', message: e instanceof Error ? e.message : 'Preview failed' } }); }
  }, [proposalId]);
  useEffect(() => { load().catch(e => setMessage(e instanceof Error ? e.message : 'Unable to load proposal')); getTeams({ page: 1, pageSize: 100, teamType: 'CLUB' }).then(t => setTeams(t.items)).catch(() => { }); }, [load]);

  if (!proposal) return <div>{message || 'Loading…'}</div>;
  const isProposing = actorTeamId === proposal.proposingTeam.id;
  const isReceiving = actorTeamId === proposal.receivingTeam.id;
  const proposingAssets = proposal.assets.filter(a => a.side === 'PROPOSING');
  const receivingAssets = proposal.assets.filter(a => a.side === 'RECEIVING');

  async function act(kind: 'submit' | 'withdraw' | 'accept' | 'reject') {
    if (!proposal) return;
    const reason = `${kind} from Trade Center`;
    setBusy(kind);
    try {
      const t = actorTeamId || proposal.proposingTeam.id;
      if (kind === 'submit') await submitTradeProposal(proposal.proposingTeam.id, proposal.id, proposal.updatedAt);
      else if (kind === 'withdraw') await withdrawTradeProposal(proposal.proposingTeam.id, proposal.id, reason, proposal.updatedAt);
      else if (kind === 'accept') { if (!window.confirm('Accept this trade? All assets transfer atomically. Lineups are not rebuilt.')) return; await acceptTradeProposal(actorTeamId, proposal.id, reason, proposal.updatedAt); }
      else if (kind === 'reject') await rejectTradeProposal(actorTeamId, proposal.id, reason, proposal.updatedAt);
      setMessage(`${kind} succeeded.`);
      await load();
    } catch (e) { setMessage(e instanceof Error ? e.message : `${kind} failed`); }
    finally { setBusy(''); }
  }

  return (
    <div>
      <PageHeader title="Trade Proposal" subtitle={`${proposal.proposingTeam.name} → ${proposal.receivingTeam.name}`} actions={<Badge tone={proposal.status === 'ACCEPTED' ? 'success' : proposal.status === 'SUBMITTED' ? 'info' : 'warning'}>{proposal.status}</Badge>} />
      <Panel title="Actor context">
        <label>Acting as <select value={actorTeamId} onChange={e => setActorTeamId(e.target.value)} style={{ marginLeft: 8, padding: 8 }}>
          <option value="">Select a club</option>
          {teams.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select></label>
        <p style={{ color: 'var(--text-tertiary)' }}>Proposing team may submit/withdraw. Receiving team may accept/reject. Commissioner may act via the Commissioner routes.</p>
      </Panel>
      {message && <p>{message}</p>}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <Panel title={`Proposing: ${proposal.proposingTeam.name}`}>
          <AssetList assets={proposingAssets} />
        </Panel>
        <Panel title={`Receiving: ${proposal.receivingTeam.name}`}>
          <AssetList assets={receivingAssets} />
        </Panel>
      </div>

      {preview && <Panel title="Team-context valuation (advisory only)">
        {preview.previewError ? <Badge tone="danger">Preview blocked: {preview.previewError.message}</Badge> : preview.valuations ? (
          <div>
            <p>Proposing total: <strong>{preview.valuations.proposing.totalValue.toFixed(1)}</strong> · Receiving total: <strong>{preview.valuations.receiving.totalValue.toFixed(1)}</strong></p>
            <p>Fairness: <Badge tone={preview.valuations.fairness.label === 'BALANCED' ? 'success' : preview.valuations.fairness.warning ? 'danger' : 'warning'}>{preview.valuations.fairness.label}</Badge> (imbalance {preview.valuations.fairness.imbalance.toFixed(2)})</p>
            <p style={{ color: 'var(--text-tertiary)' }}>Each team sees its own scouting-based estimate. Hidden true potential and the other team's private reports are never exposed.</p>
          </div>
        ) : null}
      </Panel>}

      <Panel title="Actions">
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {isProposing && proposal.status === 'DRAFT' && <Button disabled={busy === 'submit'} onClick={() => act('submit')}>Submit</Button>}
          {isProposing && (proposal.status === 'DRAFT' || proposal.status === 'SUBMITTED') && <Button variant="secondary" disabled={busy === 'withdraw'} onClick={() => act('withdraw')}>Withdraw</Button>}
          {isReceiving && proposal.status === 'SUBMITTED' && <Button disabled={busy === 'accept'} onClick={() => act('accept')}>Accept</Button>}
          {isReceiving && proposal.status === 'SUBMITTED' && <Button variant="secondary" disabled={busy === 'reject'} onClick={() => act('reject')}>Reject</Button>}
          {!actorTeamId && <span style={{ color: 'var(--text-tertiary)' }}>Select an acting club to enable actions.</span>}
        </div>
      </Panel>
    </div>
  );
}

function AssetList({ assets }: { assets: TradeProposalItem['assets'] }) {
  if (!assets.length) return <EmptyState title="No assets" description="This side has no assets in the proposal." />;
  return <table style={{ width: '100%', borderCollapse: 'collapse' }}>
    <thead><tr>{['Asset', 'Type', 'Value', 'Snapshot'].map(h => <th key={h} style={{ textAlign: 'left', padding: 6, borderBottom: '1px solid var(--border-subtle)' }}>{h}</th>)}</tr></thead>
    <tbody>{assets.map(a => <tr key={a.id}>
      <td style={{ padding: 6 }}>{assetLabel(a)}</td>
      <td style={{ padding: 6 }}>{a.assetType}</td>
      <td style={{ padding: 6 }}>{a.valuation ? a.valuation.value.toFixed(1) : '—'}</td>
      <td style={{ padding: 6, color: 'var(--text-tertiary)' }}>{a.snapshot?.kind === 'PLAYER_CONTRACT' ? `Salary ${money((a.snapshot as any).activeAnnualSalary ?? 0)}` : a.snapshot?.kind === 'DRAFT_PICK' ? `Round ${(a.snapshot as any).roundNumber}` : a.snapshot?.kind === 'PLAYER_DRAFT_RIGHT' ? `Right` : '—'}</td>
    </tr>)}</tbody>
  </table>;
}

/** Completed-trade detail (immutable history). */
export function CompletedTradeDetailPage() {
  const { tradeId } = useParams();
  const [trade, setTrade] = useState<CompletedTradeItem | null>(null);
  const [message, setMessage] = useState('');
  useEffect(() => { if (tradeId) getCompletedTradeById(tradeId).then(r => setTrade(r.item)).catch(e => setMessage(e instanceof Error ? e.message : 'Unable to load trade')); }, [tradeId]);
  if (!trade) return <div>{message || 'Loading…'}</div>;
  return (
    <div>
      <PageHeader title="Completed Trade" subtitle={`${trade.proposingTeam.name} → ${trade.receivingTeam.name} · ${new Date(trade.completedAt).toLocaleString()}`} actions={<Badge tone="success">Immutable</Badge>} />
      <Panel title="Asset transfers"><div style={{ overflowX: 'auto' }}><table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead><tr>{['Side', 'Type', 'From', 'To', 'Snapshot'].map(h => <th key={h} style={{ textAlign: 'left', padding: 8, borderBottom: '1px solid var(--border-default)' }}>{h}</th>)}</tr></thead>
        <tbody>{trade.assets.map(a => <tr key={a.id}>
          <td style={{ padding: 8 }}>{a.side}</td><td style={{ padding: 8 }}>{a.assetType}</td>
          <td style={{ padding: 8 }}>{a.sourceTeamId === trade.proposingTeam.id ? trade.proposingTeam.name : trade.receivingTeam.name}</td>
          <td style={{ padding: 8 }}>{a.targetTeamId === trade.proposingTeam.id ? trade.proposingTeam.name : trade.receivingTeam.name}</td>
          <td style={{ padding: 8, color: 'var(--text-tertiary)' }}>{a.snapshot?.kind === 'DRAFT_PICK' ? `Original team unchanged · round ${(a.snapshot as any).roundNumber}` : String((a.snapshot as any)?.playerName ?? '—')}</td>
        </tr>)}</tbody>
      </table></div></Panel>
      <Panel title="Transaction history (append-only)"><div style={{ overflowX: 'auto' }}><table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead><tr>{['Type', 'From', 'To', 'Asset', 'Hash'].map(h => <th key={h} style={{ textAlign: 'left', padding: 8, borderBottom: '1px solid var(--border-default)' }}>{h}</th>)}</tr></thead>
        <tbody>{trade.transactions.map(t => <tr key={t.id}>
          <td style={{ padding: 8 }}>{t.transactionType}</td>
          <td style={{ padding: 8 }}>{t.fromTeamId === trade.proposingTeam.id ? trade.proposingTeam.name : trade.receivingTeam.name}</td>
          <td style={{ padding: 8 }}>{t.toTeamId === trade.proposingTeam.id ? trade.proposingTeam.name : trade.receivingTeam.name}</td>
          <td style={{ padding: 8 }}>{t.assetNameSnapshot}</td>
          <td style={{ padding: 8, color: 'var(--text-tertiary)', fontFamily: 'monospace', fontSize: 12 }}>{t.transactionHash.slice(0, 12)}…</td>
        </tr>)}</tbody>
      </table></div></Panel>
    </div>
  );
}

/** Team-scoped Trade Center with the New Proposal builder. */
export function TeamTradeCenterPage() {
  const { teamId } = useParams();
  const [overview, setOverview] = useState<{ openProposals: number; incomingProposals: number; outgoingProposals: number; recentCompletedTrades: number; rightsHeldUnsignedProspects: number; availablePicks: number; lineupRequiresReview: boolean; lineupReviewReason: string | null; team: { id: string; name: string; isClub: boolean } } | null>(null);
  const [teams, setTeams] = useState<Array<{ id: string; name: string }>>([]);
  const [contracts, setContracts] = useState<Array<{ id: string; player: { id: string; name: string }; playerNameSnapshot: string }>>([]);
  const [partnerId, setPartnerId] = useState('');
  const [selectedOutgoing, setSelectedOutgoing] = useState<string[]>([]);
  const [selectedIncoming, setSelectedIncoming] = useState<string[]>([]);
  const [partnerContracts, setPartnerContracts] = useState<Array<{ id: string; player: { id: string; name: string }; playerNameSnapshot: string }>>([]);
  const [busy, setBusy] = useState('');
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (!teamId) return;
    getTeamTradeCenter(teamId).then(r => setOverview(r.item)).catch(() => { });
    getTeams({ page: 1, pageSize: 100, teamType: 'CLUB' }).then(t => setTeams(t.items.filter(x => x.id !== teamId))).catch(() => { });
    getTeamContracts(teamId).then(c => setContracts(c.items as any)).catch(() => { });
  }, [teamId]);
  useEffect(() => { if (partnerId) getTeamContracts(partnerId).then(c => setPartnerContracts(c.items as any)).catch(() => { }); else setPartnerContracts([]); }, [partnerId]);

  const outgoingAssets = useMemo<TradeAssetDescriptor[]>(() => selectedOutgoing.map(id => ({ assetType: 'PLAYER_CONTRACT', playerContractId: id })), [selectedOutgoing]);
  const incomingAssets = useMemo<TradeAssetDescriptor[]>(() => selectedIncoming.map(id => ({ assetType: 'PLAYER_CONTRACT', playerContractId: id })), [selectedIncoming]);

  async function build() {
    if (!teamId || !partnerId) return;
    setBusy('create');
    try {
      const created = await createTradeProposal(teamId, { receivingTeamId: partnerId, proposedBy: 'gm', proposingAssets: outgoingAssets, receivingAssets: incomingAssets });
      setMessage(`Created draft proposal ${created.item.id}. Review and submit from the proposal page.`);
    } catch (e) { setMessage(e instanceof Error ? e.message : 'Create failed'); }
    finally { setBusy(''); }
  }

  if (!teamId) return <div>Missing team.</div>;
  return (
    <div>
      <PageHeader title="Team Trade Center" subtitle={overview ? `${overview.team.name} — ${overview.team.isClub ? 'club' : 'not a club'}` : 'Loading…'} />
      {overview && <Panel title="Overview"><div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
        <Stat label="Open proposals" value={overview.openProposals} /><Stat label="Incoming" value={overview.incomingProposals} /><Stat label="Outgoing" value={overview.outgoingProposals} />
        <Stat label="Recent trades" value={overview.recentCompletedTrades} /><Stat label="Rights held" value={overview.rightsHeldUnsignedProspects} /><Stat label="Available picks" value={overview.availablePicks} />
        {overview.lineupRequiresReview && <Badge tone="warning">Lineup requires review</Badge>}
      </div></Panel>}
      {message && <p>{message}</p>}
      <Panel title="New proposal (player-for-player)">
        <label>Partner team <select value={partnerId} onChange={e => setPartnerId(e.target.value)} style={{ marginLeft: 8, padding: 8 }}><option value="">Select partner</option>{teams.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}</select></label>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginTop: 12 }}>
          <div><h4>Outgoing (your ACTIVE contracts)</h4>{contracts.map(c => <label key={c.id} style={{ display: 'block', padding: 4 }}><input type="checkbox" checked={selectedOutgoing.includes(c.id)} onChange={e => setSelectedOutgoing(e.target.checked ? [...selectedOutgoing, c.id] : selectedOutgoing.filter(x => x !== c.id))} /> {c.player?.name ?? c.playerNameSnapshot}</label>)}</div>
          <div><h4>Incoming (partner ACTIVE contracts)</h4>{partnerContracts.map(c => <label key={c.id} style={{ display: 'block', padding: 4 }}><input type="checkbox" checked={selectedIncoming.includes(c.id)} onChange={e => setSelectedIncoming(e.target.checked ? [...selectedIncoming, c.id] : selectedIncoming.filter(x => x !== c.id))} /> {c.player?.name ?? c.playerNameSnapshot}</label>)}</div>
        </div>
        <div style={{ marginTop: 12 }}><Button disabled={!partnerId || busy === 'create'} onClick={build}>Save Draft proposal</Button></div>
        <p style={{ color: 'var(--text-tertiary)' }}>Only ACTIVE-contract players are listed here. Draft picks and draft rights can be added from the full proposal page. F29 supports players, picks, and rights only.</p>
      </Panel>
      <Panel title="Lineup note"><p style={{ color: 'var(--text-tertiary)' }}>Trades never rewrite lineups automatically. After a trade, run auto-lineup to rebuild from current ownership. Source-team lineups may reference players no longer owned.</p></Panel>
    </div>
  );
}
