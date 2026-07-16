import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { PageHeader } from '../components/layout/PageHeader';
import { Panel } from '../components/ui/Panel';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { EmptyState } from '../components/ui/EmptyState';
import {
  completeOffseasonRun,
  createOffseasonRun,
  getOffseasonStatus,
  refreshOffseasonRun,
  startOffseasonRun,
  type OffseasonStatusDto,
} from '../lib/api';
import { useCommissioner } from '../lib/commissioner';

const statusTone = (status: string): 'success' | 'info' | 'warning' | 'danger' | 'neutral' => {
  if (status === 'COMPLETED') return 'success';
  if (status === 'IN_PROGRESS') return 'info';
  if (status === 'BLOCKED' || status === 'FAILED') return 'danger';
  if (status === 'PLANNED' || status === 'READY') return 'warning';
  return 'neutral';
};

/**
 * F30 Offseason landing page. Shows the current WorldSeason, whether an
 * OffseasonRun exists, run status, and Commissioner create/start/refresh/
 * complete controls. Normal mode is read-only.
 */
export function OffseasonPage() {
  const [status, setStatus] = useState<OffseasonStatusDto | null>(null);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const { enabled: commissioner } = useCommissioner();

  const load = useCallback(async () => {
    try {
      setStatus((await getOffseasonStatus()).item);
      setMessage('');
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Unable to load offseason status');
    }
  }, []);
  useEffect(() => { load().catch(() => { }); }, [load]);

  const run = status?.currentRun ?? null;
  const percent = run ? Math.round((run.phases.filter((p) => p.status === 'COMPLETED' || p.status === 'SKIPPED').length / Math.max(1, run.phases.length)) * 100) : 0;

  const act = async (fn: () => unknown) => {
    setBusy(true);
    try { await fn(); await load(); } catch (e) { setMessage(e instanceof Error ? e.message : 'Action failed'); } finally { setBusy(false); }
  };

  return (
    <div>
      <PageHeader
        title="Offseason"
        subtitle="Persistent, resumable offseason orchestration. Coordinates competition archive, contract expiration, development, youth generation, the draft, free agency, trades, and roster/lineup review — without duplicating their logic."
      />
      {message && <p style={{ color: 'var(--text-tertiary)' }}>{message}</p>}

      {!status?.initialized || !status.worldSeason ? (
        <Panel title="No world season">
          <EmptyState title="No world initialized" description="Initialize a world to begin an offseason." />
        </Panel>
      ) : (
        <Panel title={`World season: ${status.worldSeason.label}`}>
          <p style={{ color: 'var(--text-tertiary)' }}>
            Season status: <Badge tone={statusTone(status.worldSeason.status)}>{status.worldSeason.status}</Badge>{' '}
            · Phase: <Badge tone="neutral">{status.worldSeason.phase}</Badge>
          </p>
          {!run ? (
            <EmptyState
              title="No offseason run"
              description={commissioner ? 'Create an OffseasonRun to begin the end-of-season workflow.' : 'Commissioner Mode is required to create an OffseasonRun.'}
              action={commissioner ? { label: 'Create Offseason Run', onClick: () => act(() => createOffseasonRun({ worldSeasonId: status.worldSeason!.id, reason: 'Create offseason run', createdBy: 'commissioner' })) } : undefined}
            />
          ) : (
            <div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(160px,1fr))', gap: 12, marginBottom: 12 }}>
                <Stat label="Run status" value={<Badge tone={statusTone(run.status)}>{run.status}</Badge>} />
                <Stat label="Current phase" value={run.currentPhaseType ?? '—'} />
                <Stat label="Progress" value={`${percent}%`} />
                <Stat label="Phases resolved" value={`${run.phases.filter((p) => p.status === 'COMPLETED' || p.status === 'SKIPPED').length} / ${run.phases.length}`} />
              </div>
              <div style={{ height: 8, background: 'var(--surface-panel)', borderRadius: 4, overflow: 'hidden', marginBottom: 12 }}>
                <div style={{ width: `${percent}%`, height: '100%', background: 'var(--accent-primary)' }} />
              </div>
              <p style={{ marginBottom: 8 }}>
                <Link to={`/offseason/runs/${run.id}`}>Open run detail →</Link>
              </p>
              {commissioner && (
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {(run.status === 'PLANNED' || run.status === 'READY') && (
                    <Button onClick={() => act(() => startOffseasonRun(run.id, 'Start offseason'))} disabled={busy}>Start Run</Button>
                  )}
                  <Button onClick={() => act(() => refreshOffseasonRun(run.id, run.updatedAt))} disabled={busy}>Refresh</Button>
                  {run.status !== 'COMPLETED' && run.status !== 'CANCELLED' && (
                    <Button onClick={() => act(() => completeOffseasonRun(run.id, 'Complete offseason', run.updatedAt))} disabled={busy}>Complete Run</Button>
                  )}
                </div>
              )}
              <p style={{ color: 'var(--text-tertiary)', fontSize: 12, marginTop: 12 }}>
                Completing F30 does <strong>not</strong> create the next WorldSeason — F31 will handle season rollover. Completed runs are immutable.
              </p>
            </div>
          )}
        </Panel>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div style={{ padding: 12, background: 'var(--surface-panel)', borderRadius: 6, border: '1px solid var(--border-subtle)' }}>
      <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5, color: 'var(--text-tertiary)' }}>{label}</div>
      <div style={{ fontSize: 18, fontWeight: 600, marginTop: 4 }}>{value}</div>
    </div>
  );
}
