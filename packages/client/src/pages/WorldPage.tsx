import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { PageHeader } from '../components/layout/PageHeader';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { EmptyState } from '../components/ui/EmptyState';
import { Panel } from '../components/ui/Panel';
import { fetchSetupStatus, type SetupStatus } from '../lib/api';

export function WorldPage() {
  const [status, setStatus] = useState<SetupStatus | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    fetchSetupStatus(controller.signal)
      .then((next) => {
        setStatus(next);
        setLoadError(null);
      })
      .catch((err: unknown) => {
        if (controller.signal.aborted) return;
        setLoadError(err instanceof Error ? err.message : 'Unable to load world status');
      });
    return () => controller.abort();
  }, []);

  const empty = status && !status.initialized && status.canInitialize;
  const initialized = status?.initialized;

  return (
    <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 16 }}>
      <PageHeader
        title="World Dashboard"
        subtitle={
          initialized
            ? 'World is initialized. Full dashboard browsers arrive in F4.'
            : 'Season overview and recommended next actions — initialize a world to continue.'
        }
        badge={initialized ? 'Initialized' : 'Shell'}
      />

      {empty ? (
        <div
          style={{
            background: 'var(--gradient-team-hero)',
            borderRadius: 'var(--radius-lg)',
            padding: '20px 24px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            color: '#fff',
            gap: 16,
            flexWrap: 'wrap',
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
            <div style={{ font: 'var(--text-heading-md)' }}>Initialize Hockey World</div>
            <div style={{ font: 'var(--text-body-sm)', opacity: 0.85 }}>
              Database is empty. Open Setup to import the configured local dataset once.
            </div>
          </div>
          <Link to="/setup" style={{ textDecoration: 'none' }}>
            <Button style={{ background: '#fff', color: 'var(--accent-primary-active)' }}>
              Open Setup
            </Button>
          </Link>
        </div>
      ) : null}

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
          gap: 16,
        }}
      >
        <Panel title="World status">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {loadError ? <Badge tone="danger">API error</Badge> : null}
            {!loadError && !status ? <Badge tone="neutral">Loading</Badge> : null}
            {initialized ? <Badge tone="success">Initialized</Badge> : null}
            {empty ? <Badge tone="warning">Empty — setup required</Badge> : null}
            {status && !initialized && !status.canInitialize ? (
              <Badge tone="warning">Not ready</Badge>
            ) : null}
            <p style={{ margin: 0, font: 'var(--text-body-sm)', color: 'var(--text-secondary)' }}>
              {loadError ??
                (initialized
                  ? `Dataset ${status?.datasetId ?? 'unknown'} · F4 browsers not started.`
                  : status?.blockReason ??
                    'Use Setup World to import a prepared local snapshot. No F4 dashboard yet.')}
            </p>
          </div>
        </Panel>
        <Panel title="Quick links">
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            <Link to="/setup">Setup</Link>
            <Link to="/competitions">Competitions</Link>
            <Link to="/teams">Teams</Link>
            <Link to="/players">Players</Link>
          </div>
        </Panel>
      </div>

      {!initialized ? (
        <EmptyState
          title="No active season"
          description="Initialize the world from Setup, or wait until F4 for richer season overview."
        />
      ) : (
        <EmptyState
          title="Initialized — dashboard pending"
          description="Structural world data is present. World Dashboard entity browsers are deferred to F4."
        />
      )}
    </div>
  );
}
