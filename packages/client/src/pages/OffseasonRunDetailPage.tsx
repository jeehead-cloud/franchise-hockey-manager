import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { PageHeader } from '../components/layout/PageHeader';
import { Panel } from '../components/ui/Panel';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { EmptyState } from '../components/ui/EmptyState';
import { Tabs } from '../components/ui/Tabs';
import {
  completeOffseasonPhase,
  completeOffseasonRun,
  getOffseasonFinalReview,
  getOffseasonRun,
  getOffseasonRunReadiness,
  getOffseasonRunTeams,
  refreshOffseasonRun,
  skipOffseasonPhase,
  startOffseasonPhase,
  startOffseasonRun,
  type OffseasonRunItem,
} from '../lib/api';
import { useCommissioner } from '../lib/commissioner';

const phaseTone = (status: string): 'success' | 'info' | 'warning' | 'danger' | 'neutral' => {
  if (status === 'COMPLETED') return 'success';
  if (status === 'IN_PROGRESS') return 'info';
  if (status === 'FAILED') return 'danger';
  if (status === 'SKIPPED') return 'neutral';
  if (status === 'READY' || status === 'BLOCKED') return 'warning';
  return 'neutral';
};

const PHASE_LABEL: Record<string, string> = {
  COMPETITION_ARCHIVE: 'Competition Archive',
  CONTRACT_EXPIRATION: 'Contract Expiration',
  PLAYER_DEVELOPMENT: 'Player Development',
  RETIREMENT_REVIEW: 'Retirement Review',
  YOUTH_GENERATION: 'Youth Generation',
  DRAFT: 'Amateur Draft',
  DRAFTED_PLAYER_SIGNINGS: 'Drafted Player Signings',
  FREE_AGENCY: 'Free Agency',
  TRADES: 'Trades',
  ROSTER_REVIEW: 'Roster Review',
  LINEUP_REVIEW: 'Lineup Review',
  SCOUTING_REVIEW: 'Scouting Review',
  FINAL_REVIEW: 'Final Review',
};

const SUBSYSTEM_LINK: Record<string, string> = {
  COMPETITION_ARCHIVE: '/history',
  CONTRACT_EXPIRATION: '/contracts?tab=expiration',
  PLAYER_DEVELOPMENT: '/development',
  RETIREMENT_REVIEW: '/players?rosterStatus=RETIRED',
  YOUTH_GENERATION: '/youth-generation',
  DRAFT: '/drafts',
  DRAFTED_PLAYER_SIGNINGS: '/contracts',
  FREE_AGENCY: '/free-agency',
  TRADES: '/trades',
  ROSTER_REVIEW: '/teams',
  LINEUP_REVIEW: '/teams',
  SCOUTING_REVIEW: '/scouting',
  FINAL_REVIEW: '',
};

/** OffseasonRun detail with checklist, history, and final-review tabs. */
export function OffseasonRunDetailPage() {
  const { runId = '' } = useParams();
  const [run, setRun] = useState<OffseasonRunItem | null>(null);
  const [tab, setTab] = useState('checklist');
  const [readiness, setReadiness] = useState<Array<{ phaseType: string; level: string; blockers: string[]; warnings: string[]; allowedActions: string[]; linkedOperation: { type: string; id: string | null; summary?: string | null } | null }>>([]);
  const [finalReview, setFinalReview] = useState<{ ready: boolean; blockers: Array<{ code: string; message: string }>; warnings: Array<{ code: string; message: string }> } | null>(null);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const { enabled: commissioner } = useCommissioner();

  const load = useCallback(async () => {
    try {
      const [r, rd] = await Promise.all([getOffseasonRun(runId), getOffseasonRunReadiness(runId).catch(() => ({ item: { phases: [] } }))]);
      setRun(r.item);
      setReadiness(rd.item.phases);
      setMessage('');
    } catch (e) { setMessage(e instanceof Error ? e.message : 'Unable to load run'); }
  }, [runId]);
  useEffect(() => { load().catch(() => { }); }, [load]);

  useEffect(() => {
    if (tab === 'final') getOffseasonFinalReview(runId).then((f) => setFinalReview(f.item)).catch(() => setFinalReview(null));
  }, [tab, runId]);

  const act = async (fn: () => unknown) => {
    setBusy(true);
    try { await fn(); await load(); } catch (e) { setMessage(e instanceof Error ? e.message : 'Action failed'); } finally { setBusy(false); }
  };

  if (!run) return <div><PageHeader title="Offseason Run" />{message && <p>{message}</p>}</div>;

  const readinessByPhase = new Map(readiness.map((r) => [r.phaseType, r]));

  return (
    <div>
      <PageHeader title={`Offseason: ${run.worldSeason.label}`} subtitle={`Status ${run.status} · current phase ${run.currentPhaseType ?? '—'} · config v${run.configVersion.versionNumber}`} />
      {message && <p style={{ color: 'var(--text-tertiary)' }}>{message}</p>}

      {commissioner && (
        <Panel title="Run controls">
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {(run.status === 'PLANNED' || run.status === 'READY') && (
              <Button onClick={() => act(() => startOffseasonRun(run.id, 'Start', run.updatedAt))} disabled={busy}>Start Run</Button>
            )}
            <Button onClick={() => act(() => refreshOffseasonRun(run.id, run.updatedAt))} disabled={busy}>Refresh</Button>
            {run.status === 'IN_PROGRESS' && (
              <Button onClick={() => act(() => completeOffseasonRun(run.id, 'Complete offseason', run.updatedAt))} disabled={busy}>Complete Offseason</Button>
            )}
          </div>
          <p style={{ color: 'var(--text-tertiary)', fontSize: 12, marginTop: 8 }}>
            Completing F30 does not create the next WorldSeason. F31 handles season rollover.
          </p>
        </Panel>
      )}

      <Tabs
        items={[
          { value: 'checklist', label: 'Checklist' },
          { value: 'history', label: `History (${run.events.length})` },
          { value: 'teams', label: 'Teams' },
          { value: 'final', label: 'Final Review' },
        ]}
        value={tab}
        onChange={setTab}
      />

      {tab === 'checklist' && (
        <Panel title="Phase checklist">
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>{['#', 'Phase', 'Required', 'Category', 'Status', 'Linked', 'Blockers', 'Actions'].map((h) => (
                  <th key={h} style={{ textAlign: 'left', padding: 8, borderBottom: '1px solid var(--border-default)' }}>{h}</th>
                ))}</tr>
              </thead>
              <tbody>
                {run.phases.map((p) => {
                  const rd = readinessByPhase.get(p.phaseType);
                  const blockers = rd?.blockers ?? [];
                  const warnings = rd?.warnings ?? [];
                  const allowed = rd?.allowedActions ?? [];
                  return (
                    <tr key={p.id}>
                      <td style={{ padding: 8 }}>{p.phaseOrder}</td>
                      <td style={{ padding: 8 }}>
                        {PHASE_LABEL[p.phaseType] ?? p.phaseType}
                        {warnings.length > 0 && <div style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>⚠ {warnings.join('; ')}</div>}
                      </td>
                      <td style={{ padding: 8 }}>{p.required ? <Badge tone="danger">Required</Badge> : <Badge tone="neutral">Optional</Badge>}</td>
                      <td style={{ padding: 8 }}><Badge tone={p.category === 'AUTOMATED' ? 'info' : 'neutral'}>{p.category}</Badge></td>
                      <td style={{ padding: 8 }}><Badge tone={phaseTone(p.status)}>{p.status}</Badge></td>
                      <td style={{ padding: 8, fontSize: 12 }}>
                        {p.contractExpirationRunId && <div>Expiration: {p.contractExpirationRunId.slice(-6)}</div>}
                        {p.playerDevelopmentRunId && <div>Development: {p.playerDevelopmentRunId.slice(-6)}</div>}
                        {p.youthGenerationRunId && <div>Youth: {p.youthGenerationRunId.slice(-6)}</div>}
                        {p.draftEventId && <div>Draft: {p.draftEventId.slice(-6)}</div>}
                      </td>
                      <td style={{ padding: 8, fontSize: 12, color: 'var(--text-tertiary)' }}>{blockers.join('; ') || '—'}</td>
                      <td style={{ padding: 8 }}>
                        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                          {SUBSYSTEM_LINK[p.phaseType] && <Link to={SUBSYSTEM_LINK[p.phaseType]}>Open</Link>}
                          {commissioner && allowed.includes('START') && (p.status === 'PENDING' || p.status === 'READY') && (
                            <Button size="sm" onClick={() => act(() => startOffseasonPhase(p.id, run.id, 'Start phase', run.updatedAt))} disabled={busy}>Start</Button>
                          )}
                          {commissioner && (p.status === 'IN_PROGRESS' || allowed.includes('COMPLETE')) && p.status !== 'COMPLETED' && p.status !== 'SKIPPED' && (
                            <Button size="sm" onClick={() => act(() => completeOffseasonPhase(p.id, run.id, 'Complete phase', run.updatedAt))} disabled={busy}>Complete</Button>
                          )}
                          {commissioner && p.allowSkip && !p.required && p.status !== 'COMPLETED' && p.status !== 'SKIPPED' && (
                            <Button size="sm" variant="secondary" onClick={() => act(() => skipOffseasonPhase(p.id, run.id, 'Skip optional phase', run.updatedAt))} disabled={busy}>Skip</Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Panel>
      )}

      {tab === 'history' && (
        <Panel title="Operational history (append-only)">
          {!run.events.length ? <EmptyState title="No events" description="Run events are recorded as the workflow progresses." /> : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead><tr>{['Time', 'Event', 'Summary', 'Reason'].map((h) => <th key={h} style={{ textAlign: 'left', padding: 8, borderBottom: '1px solid var(--border-default)' }}>{h}</th>)}</tr></thead>
                <tbody>
                  {run.events.map((e) => (
                    <tr key={e.id}>
                      <td style={{ padding: 8 }}>{new Date(e.createdAt).toLocaleString()}</td>
                      <td style={{ padding: 8 }}><Badge tone="neutral">{e.eventType}</Badge></td>
                      <td style={{ padding: 8 }}>{e.summaryText}</td>
                      <td style={{ padding: 8, color: 'var(--text-tertiary)' }}>{e.reason || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>
      )}

      {tab === 'teams' && (
        <Panel title="Team offseason pages">
          <p style={{ color: 'var(--text-tertiary)' }}>Open a team's offseason page for its contracts, free agents, draft rights, trades, roster, and lineup readiness.</p>
          <TeamList runId={run.id} />
        </Panel>
      )}

      {tab === 'final' && (
        <Panel title="Final review readiness">
          {!finalReview ? <EmptyState title="Loading…" description="" /> : (
            <div>
              <p>Ready to complete: <Badge tone={finalReview.ready ? 'success' : 'danger'}>{finalReview.ready ? 'YES' : 'NO'}</Badge></p>
              {finalReview.blockers.length > 0 && (
                <div>
                  <h4 style={{ margin: '12px 0 4px' }}>Blockers ({finalReview.blockers.length})</h4>
                  <ul>{finalReview.blockers.map((b) => <li key={b.code} style={{ color: 'var(--text-tertiary)' }}>{b.message}</li>)}</ul>
                </div>
              )}
              {finalReview.warnings.length > 0 && (
                <div>
                  <h4 style={{ margin: '12px 0 4px' }}>Warnings ({finalReview.warnings.length})</h4>
                  <ul>{finalReview.warnings.map((w) => <li key={w.code} style={{ color: 'var(--text-tertiary)' }}>{w.message}</li>)}</ul>
                </div>
              )}
              {commissioner && run.status === 'IN_PROGRESS' && finalReview.ready && (
                <Button onClick={() => act(() => completeOffseasonRun(run.id, 'Complete offseason', run.updatedAt))} disabled={busy}>Complete Offseason</Button>
              )}
              <p style={{ color: 'var(--text-tertiary)', fontSize: 12, marginTop: 12 }}>
                Completing F30 does not create the next WorldSeason. F31 handles season rollover.
              </p>
            </div>
          )}
        </Panel>
      )}
    </div>
  );
}

function TeamList({ runId }: { runId: string }) {
  const [items, setItems] = useState<Array<{ id: string; name: string; shortName: string | null }>>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  useEffect(() => {
    getOffseasonRunTeams(runId, `?page=${page}&pageSize=25`).then((r) => { setItems(r.items); setTotalPages(r.totalPages); }).catch(() => { });
  }, [runId, page]);
  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(220px,1fr))', gap: 8 }}>
        {items.map((t) => (
          <Link key={t.id} to={`/offseason/runs/${runId}/teams/${t.id}`} style={{ padding: 8, border: '1px solid var(--border-subtle)', borderRadius: 6, display: 'block' }}>
            {t.name}
          </Link>
        ))}
      </div>
      {totalPages > 1 && (
        <div style={{ marginTop: 8 }}>
          <Button size="sm" variant="secondary" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>Prev</Button>{' '}
          <span>Page {page} / {totalPages}</span>{' '}
          <Button size="sm" variant="secondary" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>Next</Button>
        </div>
      )}
    </div>
  );
}
