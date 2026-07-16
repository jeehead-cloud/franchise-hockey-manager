import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { PageHeader } from '../components/layout/PageHeader';
import { Panel } from '../components/ui/Panel';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { EmptyState } from '../components/ui/EmptyState';
import {
  getCurrentWorldSeason,
  previewSeasonTransition,
  prepareSeasonTransition,
  executeSeasonTransition,
  getSeasonTransitions,
  type SeasonTransitionReadiness,
  type SeasonTransitionListItem,
  type WorldSeasonItem,
} from '../lib/api';
import { useCommissioner } from '../lib/commissioner';

const tone = (s: string): 'success' | 'info' | 'warning' | 'danger' | 'neutral' => {
  if (s === 'READY') return 'success';
  if (s === 'WARNING') return 'info';
  if (s === 'NOT_READY') return 'danger';
  if (s === 'COMPLETED') return 'success';
  if (s === 'PREPARED') return 'warning';
  if (s === 'RUNNING') return 'info';
  return 'neutral';
};

/**
 * F31 season-transition launcher. Walks the Commissioner through the preview →
 * prepare → execute flow. Preview is write-free; prepare freezes the input;
 * execute creates the next WorldSeason atomically. Banner states explicitly
 * that no schedules or matches are generated and that a safety backup is
 * created. Normal mode is read-only.
 */
export function SeasonTransitionPage() {
  const { enabled: commissioner } = useCommissioner();
  const [current, setCurrent] = useState<WorldSeasonItem | null>(null);
  const [preview, setPreview] = useState<{ previewOnly: boolean; inputHash: string; readiness: SeasonTransitionReadiness } | null>(null);
  const [runs, setRuns] = useState<SeasonTransitionListItem[]>([]);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [preparedRunId, setPreparedRunId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const c = (await getCurrentWorldSeason()).item;
      setCurrent(c);
      if (c) {
        try {
          const p = await previewSeasonTransition(c.id);
          setPreview(p.item);
        } catch (e) {
          setPreview(null);
          setMessage(e instanceof Error ? e.message : 'Preview failed');
        }
        try {
          const list = (await getSeasonTransitions(`?sourceWorldSeasonId=${c.id}`)).items;
          setRuns(list);
          const active = list.find((r) => r.status === 'PREPARED' || r.status === 'RUNNING' || r.status === 'COMPLETED');
          setPreparedRunId(active?.id ?? null);
        } catch { setRuns([]); }
      }
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Unable to load current season');
    }
  }, []);
  useEffect(() => { load().catch(() => { }); }, [load]);

  const act = async (fn: () => unknown) => {
    setBusy(true);
    try { await fn(); await load(); setMessage(''); } catch (e) { setMessage(e instanceof Error ? e.message : 'Action failed'); } finally { setBusy(false); }
  };

  const readiness = preview?.readiness;
  const eligible = readiness && readiness.status !== 'NOT_READY';

  return (
    <div>
      <PageHeader
        title="Season Transition"
        subtitle="Creates the next WorldSeason from a completed F30 OffseasonRun. Does not generate schedules or simulate competitions. A safety backup will be created. Completed transitions cannot be undone in the UI."
      />
      {message && <p style={{ color: 'var(--text-tertiary)' }}>{message}</p>}

      {!current ? (
        <Panel title="No current season"><EmptyState title="No world initialized" description="Initialize a world first." /></Panel>
      ) : (
        <>
          <Panel title={`Source season: ${current.label}`}>
            <p style={{ color: 'var(--text-tertiary)' }}>
              Status: <Badge tone={tone(current.status)}>{current.status}</Badge> · Phase: <Badge tone="neutral">{current.phase}</Badge>
            </p>
          </Panel>

          {readiness && (
            <Panel title={`Preview → target: ${readiness.proposedTargetSeason.displayName}`}>
              <p style={{ color: 'var(--text-tertiary)', marginBottom: 8 }}>
                Preview only — no world data changed.
              </p>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(160px,1fr))', gap: 12, marginBottom: 12 }}>
                <Stat label="Target order" value={String(readiness.proposedTargetSeason.order)} />
                <Stat label="Target label" value={readiness.proposedTargetSeason.label} />
                <Stat label="Start date" value={readiness.proposedTargetSeason.startDateIso} />
                <Stat label="End date" value={readiness.proposedTargetSeason.endDateIso} />
                <Stat label="Readiness" value={<Badge tone={tone(readiness.status)}>{readiness.status}</Badge>} />
                <Stat label="Planned editions" value={String(readiness.competitionPlan.length)} />
              </div>

              {readiness.blockers.length > 0 && (
                <div style={{ marginBottom: 12 }}>
                  <h4 style={{ color: 'var(--text-tertiary)', fontSize: 14, marginBottom: 4 }}>Blockers</h4>
                  <ul style={{ margin: 0, paddingLeft: 20, color: 'var(--text-tertiary)' }}>
                    {readiness.blockers.map((b) => <li key={b.code}>{b.message}</li>)}
                  </ul>
                </div>
              )}
              {readiness.warnings.length > 0 && (
                <div style={{ marginBottom: 12 }}>
                  <h4 style={{ color: 'var(--text-tertiary)', fontSize: 14, marginBottom: 4 }}>Warnings</h4>
                  <ul style={{ margin: 0, paddingLeft: 20, color: 'var(--text-tertiary)' }}>
                    {readiness.warnings.map((w) => <li key={w.code}>{w.message}</li>)}
                  </ul>
                </div>
              )}

              {readiness.competitionPlan.length > 0 && (
                <div style={{ marginBottom: 12 }}>
                  <h4 style={{ color: 'var(--text-tertiary)', fontSize: 14, marginBottom: 4 }}>Competitions to create</h4>
                  <ul style={{ margin: 0, paddingLeft: 20 }}>
                    {readiness.competitionPlan.map((p) => (
                      <li key={p.competitionId}>{p.displayName} ({p.initialStatus}, {p.stages.length} stage(s), {p.participantCount} participant(s)) — {p.selectionReason}</li>
                    ))}
                  </ul>
                </div>
              )}

              <p style={{ color: 'var(--text-tertiary)', fontSize: 12, marginBottom: 12 }}>
                Input hash: <code>{preview?.inputHash.slice(0, 16)}…</code> · Readiness hash: <code>{readiness.readinessHash.slice(0, 16)}…</code>
              </p>

              {commissioner ? (
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <Button disabled={!eligible || busy || !!preparedRunId} onClick={() => act(() => prepareSeasonTransition({ sourceWorldSeasonId: current.id, reason: 'Prepare next season', createdBy: 'commissioner' }))}>
                    {preparedRunId ? 'Already prepared' : 'Prepare'}
                  </Button>
                  {preparedRunId && (
                    <Button disabled={busy} onClick={() => {
                      if (confirm('Execute the season transition? A safety backup will be created first. This cannot be undone in the UI.')) {
                        act(() => executeSeasonTransition(preparedRunId, 'Execute season transition'));
                      }
                    }}>Execute</Button>
                  )}
                </div>
              ) : (
                <p style={{ color: 'var(--text-tertiary)', fontSize: 14 }}>Enable Commissioner Mode to prepare or execute a transition.</p>
              )}
            </Panel>
          )}

          {runs.length > 0 && (
            <Panel title="Transition runs for this season">
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ textAlign: 'left', color: 'var(--text-tertiary)', fontSize: 14 }}>
                    <th style={{ padding: '8px 12px' }}>Status</th>
                    <th style={{ padding: '8px 12px' }}>Target</th>
                    <th style={{ padding: '8px 12px' }}>Completed</th>
                    <th style={{ padding: '8px 12px' }}></th>
                  </tr>
                </thead>
                <tbody>
                  {runs.map((r) => (
                    <tr key={r.id} style={{ borderTop: '1px solid var(--border-subtle)' }}>
                      <td style={{ padding: '8px 12px' }}><Badge tone={tone(r.status)}>{r.status}</Badge></td>
                      <td style={{ padding: '8px 12px' }}>{r.targetDisplayName}</td>
                      <td style={{ padding: '8px 12px' }}>{r.completedAt ? new Date(r.completedAt).toLocaleString() : '—'}</td>
                      <td style={{ padding: '8px 12px' }}><Link to={`/season-transition/runs/${r.id}`}>View →</Link></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Panel>
          )}
        </>
      )}
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
