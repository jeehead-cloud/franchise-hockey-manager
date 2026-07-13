import { Badge } from '../ui/Badge';
import { Button } from '../ui/Button';
import { Panel } from '../ui/Panel';
import type { LabRunItem, LabRunStatus } from '../../lib/api';

function toneForStatus(status: LabRunStatus): 'neutral' | 'info' | 'success' | 'danger' | 'warning' {
  switch (status) {
    case 'QUEUED':
      return 'neutral';
    case 'RUNNING':
      return 'info';
    case 'COMPLETED':
      return 'success';
    case 'FAILED':
      return 'danger';
    case 'CANCELLED':
      return 'warning';
    default:
      return 'neutral';
  }
}

function formatElapsed(startedAt: string | null, completedAt: string | null): string {
  if (!startedAt) return '—';
  const start = Date.parse(startedAt);
  if (!Number.isFinite(start)) return '—';
  const end = completedAt ? Date.parse(completedAt) : Date.now();
  if (!Number.isFinite(end)) return '—';
  const ms = Math.max(0, end - start);
  if (ms < 1000) return `${ms} ms`;
  const sec = ms / 1000;
  if (sec < 60) return `${sec.toFixed(1)} s`;
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  return `${m}m ${s}s`;
}

export function LabProgress({
  run,
  onCancel,
  cancelling,
}: {
  run: LabRunItem;
  onCancel?: () => void;
  cancelling?: boolean;
}) {
  const { completed, total } = run.progress;
  const pct = total > 0 ? Math.min(100, Math.round((completed / total) * 100)) : 0;
  const active = run.status === 'QUEUED' || run.status === 'RUNNING';

  return (
    <Panel
      title="Progress"
      actions={
        active && onCancel ? (
          <Button variant="danger" size="sm" disabled={cancelling} onClick={onCancel}>
            Cancel
          </Button>
        ) : null
      }
    >
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center' }}>
        <Badge tone={toneForStatus(run.status)}>{run.status}</Badge>
        {run.isPartial ? <Badge tone="warning">Partial</Badge> : null}
        <span style={{ font: 'var(--text-body-sm)', color: 'var(--text-secondary)' }}>
          {completed} / {total} games ({pct}%)
        </span>
        <span style={{ font: 'var(--text-body-sm)', color: 'var(--text-tertiary)' }}>
          Elapsed {formatElapsed(run.startedAt, run.completedAt)}
        </span>
      </div>
      <div
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={total || 100}
        aria-valuenow={completed}
        aria-label={`Batch progress ${completed} of ${total}`}
        style={{
          marginTop: 12,
          height: 8,
          borderRadius: 4,
          background: 'var(--gray-3)',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            width: `${pct}%`,
            height: '100%',
            background: 'var(--accent-primary)',
            transition: 'width 0.2s ease-out',
          }}
        />
      </div>
      {run.error ? (
        <p style={{ margin: '10px 0 0', font: 'var(--text-body-sm)', color: 'var(--accent-danger)' }}>
          {run.error}
        </p>
      ) : null}
    </Panel>
  );
}
