import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { PageHeader } from '../components/layout/PageHeader';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { EmptyState, ErrorState, LoadingState } from '../components/ui/EmptyState';
import { Panel } from '../components/ui/Panel';
import { getWorldSummary, type WorldSummary } from '../lib/api';

export function WorldPage() {
  const [data, setData] = useState<WorldSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    getWorldSummary(controller.signal)
      .then((summary) => {
        setData(summary);
        setError(null);
      })
      .catch((err: unknown) => {
        if (controller.signal.aborted) return;
        setError(err instanceof Error ? err.message : 'Unable to load world summary');
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, []);

  if (loading) {
    return (
      <div style={{ padding: 20 }}>
        <PageHeader title="World Dashboard" subtitle="Loading world summary…" />
        <LoadingState label="Loading world…" />
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ padding: 20 }}>
        <PageHeader title="World Dashboard" />
        <ErrorState description={error} />
      </div>
    );
  }

  if (!data) return null;

  if (!data.initialized) {
    return (
      <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 16 }}>
        <PageHeader title="World Dashboard" subtitle="No world initialized yet." badge="Empty" />
        <div
          style={{
            background: 'var(--gradient-team-hero)',
            borderRadius: 'var(--radius-lg)',
            padding: '20px 24px',
            color: '#fff',
            display: 'flex',
            justifyContent: 'space-between',
            gap: 16,
            flexWrap: 'wrap',
            alignItems: 'center',
          }}
        >
          <div>
            <div style={{ font: 'var(--text-heading-md)' }}>Initialize Hockey World</div>
            <div style={{ font: 'var(--text-body-sm)', opacity: 0.85 }}>
              Import a prepared local dataset before browsing teams and players.
            </div>
          </div>
          <Link to="/setup" style={{ textDecoration: 'none' }}>
            <Button style={{ background: '#fff', color: 'var(--accent-primary-active)' }}>
              Open Setup
            </Button>
          </Link>
        </div>
      </div>
    );
  }

  const action = data.recommendedNextAction;

  return (
    <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 16 }}>
      <PageHeader
        title="World Dashboard"
        subtitle={
          data.season
            ? `${data.season.label} · ${data.season.phase.replaceAll('_', ' ')} · ${data.season.status}`
            : 'Initialized world'
        }
        badge={data.fictionalDataset ? 'Dev fixture' : 'Initialized'}
        actions={
          data.fictionalDataset ? <Badge tone="warning">Fictional data</Badge> : undefined
        }
      />

      <div
        style={{
          background: 'var(--gradient-team-hero)',
          borderRadius: 'var(--radius-lg)',
          padding: '20px 24px',
          color: '#fff',
          display: 'flex',
          justifyContent: 'space-between',
          gap: 16,
          flexWrap: 'wrap',
          alignItems: 'center',
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <div
            style={{
              font: 'var(--text-label)',
              letterSpacing: 'var(--text-tracking-wide)',
              textTransform: 'uppercase',
              opacity: 0.8,
            }}
          >
            Recommended next action
          </div>
          <div style={{ font: 'var(--text-heading-md)' }}>{action.label}</div>
          <div style={{ font: 'var(--text-body-sm)', opacity: 0.85 }}>{action.detail}</div>
          {data.dataset ? (
            <div style={{ font: 'var(--text-body-sm)', opacity: 0.8, marginTop: 4 }}>
              Dataset {data.dataset.name ?? data.dataset.id}
              {data.dataset.sourceUpdatedAt ? ` · source ${data.dataset.sourceUpdatedAt}` : ''}
            </div>
          ) : null}
        </div>
        <Link to={action.href} style={{ textDecoration: 'none' }}>
          <Button style={{ background: '#fff', color: 'var(--accent-primary-active)' }}>
            {action.label}
          </Button>
        </Link>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
          gap: 12,
        }}
      >
        {Object.entries(data.counts).map(([key, value]) => (
          <Panel key={key}>
            <div style={{ font: 'var(--text-label)', color: 'var(--text-tertiary)' }}>{key}</div>
            <div style={{ font: 'var(--text-heading-md)', color: 'var(--text-primary)' }}>{value}</div>
          </Panel>
        ))}
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
          gap: 16,
        }}
      >
        <Panel title="Structure">
          <Stat label="Detailed leagues" value={data.structure.detailedLeagues} />
          <Stat label="Aggregated leagues" value={data.structure.aggregatedLeagues} />
          <Stat label="Club teams" value={data.structure.clubTeams} />
          <Stat label="National teams" value={data.structure.nationalTeams} />
          <Stat label="Assigned players" value={data.structure.assignedPlayers} />
          <Stat label="Unassigned players" value={data.structure.unassignedPlayers} />
          {Object.entries(data.structure.playersByRosterStatus).map(([k, v]) => (
            <Stat key={k} label={`Players ${k}`} value={v} />
          ))}
        </Panel>

        <Panel title="Competition editions">
          {data.competitionEditions.length === 0 ? (
            <EmptyState title="No editions" description="No competition editions yet." />
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {data.competitionEditions.map((ed) => (
                <Link
                  key={ed.id}
                  to={ed.competition ? `/competitions/${ed.competition.id}` : '/competitions'}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    gap: 8,
                    textDecoration: 'none',
                    color: 'var(--text-secondary)',
                    font: 'var(--text-body-sm)',
                    paddingBottom: 8,
                    borderBottom: '1px solid var(--border-subtle)',
                  }}
                >
                  <span style={{ color: 'var(--text-primary)' }}>
                    {ed.competition?.name ?? ed.displayName}
                  </span>
                  <span>
                    {ed.worldSeason?.label ?? '—'} · {ed.status}
                  </span>
                </Link>
              ))}
            </div>
          )}
        </Panel>

        <Panel title="Warnings">
          {data.warnings.length === 0 ? (
            <p style={{ margin: 0, font: 'var(--text-body-sm)', color: 'var(--text-secondary)' }}>
              No structural warnings.
            </p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {data.warnings.map((w) => (
                <div key={w.code} style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                  <Badge tone={w.severity === 'warning' ? 'warning' : 'info'}>{w.severity}</Badge>
                  <span style={{ font: 'var(--text-body-sm)', color: 'var(--text-secondary)' }}>
                    {w.message}
                  </span>
                </div>
              ))}
            </div>
          )}
        </Panel>
      </div>

      {data.ageReference ? (
        <p style={{ margin: 0, font: 'var(--text-body-sm)', color: 'var(--text-tertiary)' }}>
          Player ages are derived as of {data.ageReference.referenceDate} (1 July of WorldSeason
          start year), not the browser clock.
        </p>
      ) : null}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        gap: 12,
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
