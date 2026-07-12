import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { PageHeader } from '../components/layout/PageHeader';
import { Badge } from '../components/ui/Badge';
import { EmptyState, ErrorState, LoadingState } from '../components/ui/EmptyState';
import { Panel } from '../components/ui/Panel';
import { BackLink, RecordNotFound } from '../components/ui/RecordStates';
import { Tabs } from '../components/ui/Tabs';
import { getCompetition, type CompetitionDetail } from '../lib/api';

export function CompetitionDetailPage() {
  const { competitionId = '' } = useParams();
  const [item, setItem] = useState<CompetitionDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setNotFound(false);
    getCompetition(competitionId, controller.signal)
      .then((res) => {
        setItem(res.item);
        setError(null);
      })
      .catch((err: unknown) => {
        if (controller.signal.aborted) return;
        const status = (err as { status?: number }).status;
        if (status === 404) setNotFound(true);
        else setError(err instanceof Error ? err.message : 'Failed to load competition');
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [competitionId]);

  if (loading) {
    return (
      <div style={{ padding: 20 }}>
        <LoadingState label="Loading competition…" />
      </div>
    );
  }

  if (notFound) {
    return (
      <div style={{ padding: 20 }}>
        <BackLink to="/competitions" label="Competitions" />
        <RecordNotFound
          entity="Competition"
          listHref="/competitions"
          listLabel="Back to Competitions"
        />
      </div>
    );
  }

  if (error || !item) {
    return (
      <div style={{ padding: 20 }}>
        <BackLink to="/competitions" label="Competitions" />
        <ErrorState description={error ?? 'Competition unavailable'} />
      </div>
    );
  }

  return (
    <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 16 }}>
      <BackLink to="/competitions" label="Competitions" />
      <PageHeader
        title={item.name}
        subtitle={[item.shortName, item.type, item.simulationLevel].filter(Boolean).join(' · ')}
        badge="Overview"
      />

      <Tabs
        items={[
          { value: 'overview', label: 'Overview' },
          { value: 'standings', label: 'Standings', disabled: true },
          { value: 'schedule', label: 'Schedule', disabled: true },
          { value: 'stats', label: 'Stats', disabled: true },
        ]}
        value="overview"
        onChange={() => undefined}
      />

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
          gap: 16,
        }}
      >
        <Panel title="Identity">
          <Row label="Type" value={item.type} />
          <Row label="Simulation level" value={item.simulationLevel ?? '—'} />
          <Row label="External ID" value={item.externalId ?? '—'} />
          <Row label="Dataset" value={item.sourceDataset ?? '—'} />
          <Row label="Source updated" value={item.sourceUpdatedAt ?? '—'} />
        </Panel>

        <Panel title="Editions">
          {item.editions.length === 0 ? (
            <EmptyState title="No editions" description="No competition editions linked yet." />
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {item.editions.map((ed) => (
                <div
                  key={ed.id}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    gap: 8,
                    font: 'var(--text-body-sm)',
                    paddingBottom: 8,
                    borderBottom: '1px solid var(--border-subtle)',
                  }}
                >
                  <div>
                    <div style={{ color: 'var(--text-primary)' }}>{ed.displayName}</div>
                    <div style={{ color: 'var(--text-tertiary)' }}>
                      {ed.worldSeason?.label ?? 'No season'}
                    </div>
                  </div>
                  <Badge tone="neutral">{ed.status}</Badge>
                </div>
              ))}
            </div>
          )}
        </Panel>
      </div>

      <EmptyState
        title="Participants & results deferred"
        description="Standings, schedules, playoffs, and statistics arrive in later foundation milestones. F4 is read-only structural browsing."
      />
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
