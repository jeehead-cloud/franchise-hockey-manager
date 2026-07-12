import { Link } from 'react-router-dom';
import { PageHeader } from '../components/layout/PageHeader';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { EmptyState } from '../components/ui/EmptyState';
import { Panel } from '../components/ui/Panel';

export function WorldPage() {
  return (
    <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 16 }}>
      <PageHeader
        title="World Dashboard"
        subtitle="Season overview and recommended next actions — not available until a world exists."
        badge="Shell"
      />

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
            No world database is loaded. Setup arrives in a later foundation milestone.
          </div>
        </div>
        <Link to="/setup" style={{ textDecoration: 'none' }}>
          <Button style={{ background: '#fff', color: 'var(--accent-primary-active)' }}>
            Open Setup
          </Button>
        </Link>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
          gap: 16,
        }}
      >
        <Panel title="World status">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <Badge tone="warning">Empty</Badge>
            <p style={{ margin: 0, font: 'var(--text-body-sm)', color: 'var(--text-secondary)' }}>
              F1 provides the application shell only. Real-world import and league structures are
              out of scope for this milestone.
            </p>
          </div>
        </Panel>
        <Panel title="Quick links">
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            <Link to="/competitions">Competitions</Link>
            <Link to="/teams">Teams</Link>
            <Link to="/players">Players</Link>
            <Link to="/setup">Setup</Link>
          </div>
        </Panel>
      </div>

      <EmptyState
        title="No active season"
        description="Season phases, standings, and recommended actions will appear here once world data exists."
      />
    </div>
  );
}
