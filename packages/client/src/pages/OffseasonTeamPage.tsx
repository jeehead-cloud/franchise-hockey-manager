import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { PageHeader } from '../components/layout/PageHeader';
import { Panel } from '../components/ui/Panel';
import { Badge } from '../components/ui/Badge';
import { getOffseasonTeamOverview } from '../lib/api';

/** Per-team offseason summary — privacy-safe (no other Team's scouting exposed). */
export function OffseasonTeamPage() {
  const { runId = '', teamId = '' } = useParams();
  const [overview, setOverview] = useState<Awaited<ReturnType<typeof getOffseasonTeamOverview>>['item'] | null>(null);
  const [message, setMessage] = useState('');

  const load = useCallback(async () => {
    try {
      setOverview((await getOffseasonTeamOverview(runId, teamId)).item);
      setMessage('');
    } catch (e) { setMessage(e instanceof Error ? e.message : 'Unable to load team overview'); }
  }, [runId, teamId]);
  useEffect(() => { load().catch(() => { }); }, [load]);

  if (!overview) return <div><PageHeader title="Team Offseason" />{message && <p>{message}</p>}</div>;

  return (
    <div>
      <PageHeader title={`${overview.team.name} · Offseason`} subtitle="This team's offseason-relevant summaries. Privacy: only this team's own scouting/contract/proposal rows are read." />
      {message && <p style={{ color: 'var(--text-tertiary)' }}>{message}</p>}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(200px,1fr))', gap: 12, marginBottom: 12 }}>
        <Card title="Contracts">
          <Row label="Active" value={overview.contracts.active} />
          <Row label="Future" value={overview.contracts.future} />
        </Card>
        <Card title="Free Agency">
          <Row label="Offers submitted by team" value={overview.offers.submittedByThisTeam} />
          <Row label="Incoming offers" value={overview.offers.incomingAgainstThisTeam} />
        </Card>
        <Card title="Draft Rights">
          <Row label="Unsigned" value={overview.draftRights.unsigned} />
          <Row label="Signed" value={overview.draftRights.signed} />
        </Card>
        <Card title="Trades">
          <Row label="Incoming proposals" value={overview.trades.incomingProposals} />
          <Row label="Outgoing proposals" value={overview.trades.outgoingProposals} />
          <Row label="Completed (all-time)" value={overview.trades.completedCount} />
        </Card>
      </div>

      <Panel title="Roster review">
        {overview.rosterReadiness.blockers.length > 0 ? (
          <ul>{overview.rosterReadiness.blockers.map((b, i) => <li key={i} style={{ color: 'var(--text-tertiary)' }}>{b}</li>)}</ul>
        ) : <Badge tone="success">No roster blockers</Badge>}
      </Panel>

      <Panel title="Lineup review">
        {overview.lineupReadiness.blockers.length > 0 ? (
          <ul>{overview.lineupReadiness.blockers.map((b, i) => <li key={i} style={{ color: 'var(--text-tertiary)' }}>{b}</li>)}</ul>
        ) : (
          <Badge tone={overview.lineupReadiness.present ? 'success' : 'warning'}>
            {overview.lineupReadiness.present ? `${overview.lineupReadiness.slotCount} slot(s) saved` : 'No lineup saved'}
          </Badge>
        )}
        <div style={{ marginTop: 8 }}>
          <Link to={`/teams/${teamId}/lines/edit`}>Edit lineup →</Link>
        </div>
      </Panel>

      <Panel title="Scouting">
        <Row label="Current report versions" value={overview.staleScoutingReports.currentReports} />
        <div style={{ marginTop: 8 }}><Link to={`/teams/${teamId}/scouting`}>Open scouting →</Link></div>
      </Panel>

      <Panel title="Subsystems">
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <Link to={`/teams/${teamId}/contracts`}>Contracts & offers</Link>
          <Link to={`/teams/${teamId}/trade-center`}>Trade Center</Link>
          <Link to={`/teams/${teamId}`}>Team detail</Link>
        </div>
      </Panel>
    </div>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ padding: 12, background: 'var(--surface-panel)', borderRadius: 6, border: '1px solid var(--border-subtle)' }}>
      <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5, color: 'var(--text-tertiary)', marginBottom: 6 }}>{title}</div>
      {children}
    </div>
  );
}
function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return <div style={{ display: 'flex', justifyContent: 'space-between', padding: '2px 0' }}><span style={{ color: 'var(--text-tertiary)' }}>{label}</span><span>{value}</span></div>;
}
