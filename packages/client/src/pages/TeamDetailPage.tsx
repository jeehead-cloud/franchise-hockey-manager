import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { PageHeader } from '../components/layout/PageHeader';
import { Badge } from '../components/ui/Badge';
import {
  DataRow,
  DataTable,
  Td,
} from '../components/ui/DataBrowser';
import { EmptyState, ErrorState, LoadingState } from '../components/ui/EmptyState';
import { Panel } from '../components/ui/Panel';
import { BackLink, RecordNotFound } from '../components/ui/RecordStates';
import { Tabs } from '../components/ui/Tabs';
import { getTeam, type TeamDetail } from '../lib/api';
import { playerLabel } from '../lib/listQuery';

export function TeamDetailPage() {
  const { teamId = '' } = useParams();
  const navigate = useNavigate();
  const [team, setTeam] = useState<TeamDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setNotFound(false);
    getTeam(teamId, controller.signal)
      .then((res) => {
        setTeam(res.item);
        setError(null);
      })
      .catch((err: unknown) => {
        if (controller.signal.aborted) return;
        const status = (err as { status?: number }).status;
        if (status === 404) setNotFound(true);
        else setError(err instanceof Error ? err.message : 'Failed to load team');
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [teamId]);

  if (loading) {
    return (
      <div style={{ padding: 20 }}>
        <LoadingState label="Loading team…" />
      </div>
    );
  }

  if (notFound) {
    return (
      <div style={{ padding: 20 }}>
        <BackLink to="/teams" label="Teams" />
        <RecordNotFound entity="Team" listHref="/teams" listLabel="Back to Teams" />
      </div>
    );
  }

  if (error || !team) {
    return (
      <div style={{ padding: 20 }}>
        <BackLink to="/teams" label="Teams" />
        <ErrorState description={error ?? 'Team unavailable'} />
      </div>
    );
  }

  return (
    <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 16 }}>
      <BackLink to="/teams" label="Teams" />
      <div
        style={{
          background: 'var(--gradient-team-hero)',
          borderRadius: 'var(--radius-lg)',
          padding: '20px 24px',
          color: '#fff',
        }}
      >
        <PageHeader
          title={team.name}
          subtitle={[team.city, team.country?.name, team.league?.name, team.teamType]
            .filter(Boolean)
            .join(' · ')}
        />
      </div>

      <Tabs
        items={[
          { value: 'overview', label: 'Overview' },
          { value: 'roster', label: 'Roster', disabled: true },
          { value: 'lines', label: 'Lines', disabled: true },
          { value: 'tactics', label: 'Tactics', disabled: true },
        ]}
        value="overview"
        onChange={() => undefined}
      />

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
          gap: 16,
        }}
      >
        <Panel title="Coach">
          {team.coach ? (
            <div style={{ font: 'var(--text-body-sm)', color: 'var(--text-secondary)' }}>
              <div style={{ color: 'var(--text-primary)', font: 'var(--text-heading-sm)' }}>
                {team.coach.firstName} {team.coach.lastName}
              </div>
              <div>{team.coach.coachingStyle}</div>
              <div>{team.coach.tacticalStyle}</div>
            </div>
          ) : (
            <EmptyState title="Unassigned" description="No current head coach." />
          )}
        </Panel>
        <Panel title="Roster summary">
          <Row label="Total" value={String(team.rosterSummary.total)} />
          {Object.entries(team.rosterSummary.byPosition).map(([k, v]) => (
            <Row key={k} label={k} value={String(v)} />
          ))}
          {Object.entries(team.rosterSummary.byRosterStatus).map(([k, v]) => (
            <Row key={k} label={k} value={String(v)} />
          ))}
          <Row
            label="Average age"
            value={
              team.rosterSummary.averageAge !== null
                ? String(team.rosterSummary.averageAge)
                : '—'
            }
          />
        </Panel>
        <Panel title="Source">
          <Row label="External ID" value={team.externalId ?? '—'} />
          <Row label="Dataset" value={team.sourceDataset ?? '—'} />
          <Row label="Source updated" value={team.sourceUpdatedAt ?? '—'} />
        </Panel>
      </div>

      <Panel
        title="Roster preview"
        actions={
          <Link
            to={`/players?teamId=${team.id}`}
            style={{ font: 'var(--text-body-sm)', color: 'var(--text-link)' }}
          >
            Open in Players
          </Link>
        }
      >
        {team.roster.length === 0 ? (
          <EmptyState title="No players" description="This team has an empty roster." />
        ) : (
          <DataTable
            headers={[
              { key: 'player', label: 'Player' },
              { key: 'pos', label: 'Pos' },
              { key: 'ca', label: 'CA' },
              { key: 'role', label: 'Role' },
              { key: 'model', label: 'Model' },
              { key: 'status', label: 'Status' },
            ]}
          >
            {team.roster.map((p) => (
              <DataRow key={p.id} onActivate={() => navigate(`/players/${p.id}`)}>
                <Td primary>{playerLabel(p)}</Td>
                <Td>{p.primaryPosition}</Td>
                <Td>{p.currentAbility ?? '—'}</Td>
                <Td>{p.roleLabel ?? p.role ?? '—'}</Td>
                <Td>
                  <Badge tone={p.modelStatus === 'COMPLETE' ? 'success' : 'warning'}>
                    {p.modelStatus}
                  </Badge>
                </Td>
                <Td>
                  <Badge tone="neutral">{p.rosterStatus}</Badge>
                </Td>
              </DataRow>
            ))}
          </DataTable>
        )}
      </Panel>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        gap: 8,
        font: 'var(--text-body-sm)',
        padding: '4px 0',
        borderBottom: '1px solid var(--border-subtle)',
      }}
    >
      <span style={{ color: 'var(--text-tertiary)' }}>{label}</span>
      <span style={{ color: 'var(--text-primary)' }}>{value}</span>
    </div>
  );
}
