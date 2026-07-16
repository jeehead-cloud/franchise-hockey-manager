import { useCallback, useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { PageHeader } from '../components/layout/PageHeader';
import { Panel } from '../components/ui/Panel';
import { Badge } from '../components/ui/Badge';
import { EmptyState } from '../components/ui/EmptyState';
import {
  getSeasonTransitionRun,
  getSeasonTransitionRunHistory,
  getSeasonTransitionRunResult,
  type SeasonTransitionRunItem,
  type SeasonTransitionRunEvent,
  type SeasonTransitionEntityRecord,
} from '../lib/api';

const tone = (s: string): 'success' | 'info' | 'warning' | 'danger' | 'neutral' => {
  if (s === 'COMPLETED') return 'success';
  if (s === 'RUNNING') return 'info';
  if (s === 'PREPARED') return 'warning';
  if (s === 'FAILED') return 'danger';
  if (s === 'CANCELLED') return 'neutral';
  return 'neutral';
};

/**
 * F31 season-transition run detail. Shows source/target, status, config + hash
 * prefixes, backup metadata, entity summary, created editions (planned
 * structures only), and the append-only event history. In Commissioner Mode,
 * exposes the diagnostics panel (input/plan/result hashes + snapshots).
 */
export function SeasonTransitionRunDetailPage() {
  const { runId } = useParams<{ runId: string }>();
  const [run, setRun] = useState<SeasonTransitionRunItem | null>(null);
  const [history, setHistory] = useState<SeasonTransitionRunEvent[]>([]);
  const [result, setResult] = useState<{ runId: string; status: string; resultHash: string | null; targetWorldSeasonId: string | null; entityRecords: SeasonTransitionEntityRecord[] } | null>(null);
  const [message, setMessage] = useState('');

  const load = useCallback(async () => {
    if (!runId) return;
    try {
      setRun((await getSeasonTransitionRun(runId)).item);
      setHistory((await getSeasonTransitionRunHistory(runId)).items);
      setResult((await getSeasonTransitionRunResult(runId)).item);
      setMessage('');
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Unable to load transition run');
    }
  }, [runId]);
  useEffect(() => { load().catch(() => { }); }, [load]);

  if (!run) {
    return (
      <div>
        <PageHeader title="Season transition run" />
        {message && <p style={{ color: 'var(--text-tertiary)' }}>{message}</p>}
        <EmptyState title="Run not found" description={message || 'No transition run matches this id.'} />
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title={`Transition → ${run.targetDisplayName}`}
        subtitle={`Source: ${run.sourceWorldSeason.label} (order ${run.sourceWorldSeason.startYear}) · Target order: ${run.targetSeasonOrder}`}
      />
      {message && <p style={{ color: 'var(--text-tertiary)' }}>{message}</p>}

      <Panel title="Status">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(160px,1fr))', gap: 12 }}>
          <Stat label="Status" value={<Badge tone={tone(run.status)}>{run.status}</Badge>} />
          <Stat label="Run version" value={String(run.runVersion)} />
          <Stat label="Prepared at" value={run.preparedAt ? new Date(run.preparedAt).toLocaleString() : '—'} />
          <Stat label="Completed at" value={run.completedAt ? new Date(run.completedAt).toLocaleString() : '—'} />
          <Stat label="Reason" value={run.reason} />
          <Stat label="Created by" value={run.createdBy} />
        </div>
        <p style={{ color: 'var(--text-tertiary)', fontSize: 12, marginTop: 12 }}>
          Source: <Link to={`/seasons/${run.sourceWorldSeasonId}`}>{run.sourceWorldSeason.label}</Link>
          {run.targetWorldSeason && <> · Target: <Link to={`/seasons/${run.targetWorldSeasonId}`}>{run.targetWorldSeason.label}</Link></>}
        </p>
      </Panel>

      <Panel title="Hashes & config">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))', gap: 12 }}>
          <Stat label="Config version" value={`v${run.configVersion.versionNumber}`} />
          <Stat label="Config hash" value={<code>{run.configHash.slice(0, 24)}…</code>} />
          <Stat label="Input hash" value={<code>{run.inputHash.slice(0, 24)}…</code>} />
          <Stat label="Plan hash" value={<code>{run.planHash.slice(0, 24)}…</code>} />
          <Stat label="Result hash" value={run.resultHash ? <code>{run.resultHash.slice(0, 24)}…</code> : '—'} />
        </div>
        {run.backupMetadataText && (
          <p style={{ color: 'var(--text-tertiary)', fontSize: 12, marginTop: 12 }}>
            Backup: <code>{run.backupMetadataText}</code>
          </p>
        )}
      </Panel>

      {result && result.entityRecords.length > 0 && (
        <Panel title="Entity summary">
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ textAlign: 'left', color: 'var(--text-tertiary)', fontSize: 14 }}>
                <th style={{ padding: '8px 12px' }}>Type</th>
                <th style={{ padding: '8px 12px' }}>Action</th>
                <th style={{ padding: '8px 12px' }}>Source → Target</th>
              </tr>
            </thead>
            <tbody>
              {result.entityRecords.map((r) => (
                <tr key={r.id} style={{ borderTop: '1px solid var(--border-subtle)' }}>
                  <td style={{ padding: '8px 12px' }}>{r.entityType}</td>
                  <td style={{ padding: '8px 12px' }}><Badge tone="neutral">{r.action}</Badge></td>
                  <td style={{ padding: '8px 12px' }}>{r.sourceEntityId ?? '—'} → {r.targetEntityId ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>
      )}

      <Panel title="Event history">
        {history.length === 0 ? (
          <EmptyState title="No events" description="This transition has not recorded any orchestration events yet." />
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ textAlign: 'left', color: 'var(--text-tertiary)', fontSize: 14 }}>
                <th style={{ padding: '8px 12px' }}>Time</th>
                <th style={{ padding: '8px 12px' }}>Event</th>
                <th style={{ padding: '8px 12px' }}>Summary</th>
              </tr>
            </thead>
            <tbody>
              {history.map((e) => (
                <tr key={e.id} style={{ borderTop: '1px solid var(--border-subtle)' }}>
                  <td style={{ padding: '8px 12px', whiteSpace: 'nowrap' }}>{new Date(e.createdAt).toLocaleString()}</td>
                  <td style={{ padding: '8px 12px' }}><Badge tone="neutral">{e.eventType}</Badge></td>
                  <td style={{ padding: '8px 12px' }}>{e.summaryText}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Panel>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div style={{ padding: 12, background: 'var(--surface-panel)', borderRadius: 8 }}>
      <div style={{ color: 'var(--text-tertiary)', fontSize: 12, marginBottom: 4 }}>{label}</div>
      <div style={{ fontWeight: 600 }}>{value}</div>
    </div>
  );
}
