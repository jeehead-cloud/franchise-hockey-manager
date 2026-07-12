import { useCallback, useEffect, useState } from 'react';
import { PageHeader } from '../components/layout/PageHeader';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { Field, SelectInput, TextInput } from '../components/ui/DataBrowser';
import { ErrorState, LoadingState } from '../components/ui/EmptyState';
import { Panel } from '../components/ui/Panel';
import {
  getTeams,
  simulateTechnicalRegulation,
  stepTechnicalSimulation,
  type TeamListItem,
  type TechnicalEventDetail,
  type TechnicalMatchEvent,
  type TechnicalMatchSnapshot,
  type TechnicalSimulationDiagnostics,
  type TechnicalSimulationMetadata,
} from '../lib/api';

function formatClock(remainingSeconds: number): string {
  const m = Math.floor(remainingSeconds / 60);
  const s = remainingSeconds % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

function formatEventLine(ev: TechnicalMatchEvent): string {
  const clock = formatClock(ev.remainingSeconds);
  const label = ev.type.replace(/_/g, ' ').toLowerCase();
  const team = ev.teamId ? ` (${ev.teamId.slice(0, 8)})` : '';
  return `P${ev.period} ${clock} — ${label}${team}`;
}

export function SimulationLabPage() {
  const [teams, setTeams] = useState<TeamListItem[]>([]);
  const [loadingTeams, setLoadingTeams] = useState(true);
  const [homeTeamId, setHomeTeamId] = useState('');
  const [awayTeamId, setAwayTeamId] = useState('');
  const [seed, setSeed] = useState('f11-ui-001');
  const [eventDetail, setEventDetail] = useState<TechnicalEventDetail>('SUMMARY');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [metadata, setMetadata] = useState<TechnicalSimulationMetadata | null>(null);
  const [state, setState] = useState<Record<string, unknown> | null>(null);
  const [diagnostics, setDiagnostics] = useState<TechnicalSimulationDiagnostics | null>(null);
  const [events, setEvents] = useState<TechnicalMatchEvent[]>([]);
  const [snapshot, setSnapshot] = useState<TechnicalMatchSnapshot | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await getTeams({ page: 1, pageSize: 100 });
        if (cancelled) return;
        setTeams(res.items);
        if (res.items.length >= 2) {
          setHomeTeamId(res.items[0]!.id);
          setAwayTeamId(res.items[1]!.id);
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load teams');
      } finally {
        if (!cancelled) setLoadingTeams(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const resetOutput = useCallback(() => {
    setMetadata(null);
    setState(null);
    setDiagnostics(null);
    setEvents([]);
    setSnapshot(null);
    setNotice(null);
  }, []);

  const applyResult = useCallback(
    (item: {
      metadata?: TechnicalSimulationMetadata;
      finalState?: Record<string, unknown>;
      state?: Record<string, unknown>;
      diagnostics: TechnicalSimulationDiagnostics;
      events?: TechnicalMatchEvent[];
      snapshot?: TechnicalMatchSnapshot;
      notice?: string;
    }) => {
      if (item.metadata) setMetadata(item.metadata);
      setState(item.finalState ?? item.state ?? null);
      setDiagnostics(item.diagnostics);
      if (item.events) setEvents(item.events);
      if (item.snapshot) setSnapshot(item.snapshot);
      if (item.notice) setNotice(item.notice);
    },
    [],
  );

  const run = useCallback(
    async (mode: 'regulation' | 'next-event' | 'next-shift' | 'end-period' | 'resume') => {
      if (!homeTeamId || !awayTeamId) {
        setError('Select home and away teams');
        return;
      }
      setBusy(true);
      setError(null);
      try {
        if (mode === 'regulation') {
          const res = await simulateTechnicalRegulation({ homeTeamId, awayTeamId, seed, eventDetail });
          applyResult(res.item);
          setSnapshot(null);
          return;
        }
        const stepMode =
          mode === 'next-event'
            ? 'NEXT_EVENT'
            : mode === 'next-shift'
              ? 'NEXT_SHIFT'
              : mode === 'end-period'
                ? 'END_PERIOD'
                : 'END_REGULATION';
        const res = await stepTechnicalSimulation({
          homeTeamId,
          awayTeamId,
          seed,
          stepMode,
          snapshot,
          eventDetail,
        });
        applyResult(res.item);
        if (res.item.events?.length) {
          setEvents((prev) => [...prev, ...res.item.events!].slice(-200));
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Simulation request failed');
      } finally {
        setBusy(false);
      }
    },
    [applyResult, awayTeamId, eventDetail, homeTeamId, seed, snapshot],
  );

  if (loadingTeams) return <LoadingState label="Loading teams…" />;

  const period = typeof state?.period === 'number' ? state.period : '—';
  const clockRemaining =
    typeof state?.clockRemainingSeconds === 'number' ? formatClock(state.clockRemainingSeconds) : '20:00';
  const possession = String(state?.possession ?? 'NONE');
  const zone = state?.zone ? String(state.zone) : '—';
  const score = state?.score as { home?: number; away?: number } | undefined;

  return (
    <div className="page-stack">
      <PageHeader
        title="Technical Match Engine — F11"
        subtitle="Deterministic regulation simulation without shots or scoring. Results remain 0-0 until F12."
      />

      <Panel title="Important">
        <p style={{ margin: 0, font: 'var(--text-body-sm)', color: 'var(--text-secondary)' }}>
          This is not full Simulation Lab batch tooling. Shots, goals, penalties, overtime, and persistence are
          intentionally deferred. Regulation completes as a technical 0-0 trace.
        </p>
      </Panel>

      {error ? <ErrorState description={error} /> : null}

      <Panel title="Controls">
        <div className="form-grid">
          <Field label="Home team">
            <SelectInput value={homeTeamId} onChange={(e) => setHomeTeamId(e.target.value)}>
              {teams.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                  {t.shortName ? ` (${t.shortName})` : ''}
                </option>
              ))}
            </SelectInput>
          </Field>
          <Field label="Away team">
            <SelectInput value={awayTeamId} onChange={(e) => setAwayTeamId(e.target.value)}>
              {teams.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                  {t.shortName ? ` (${t.shortName})` : ''}
                </option>
              ))}
            </SelectInput>
          </Field>
          <Field label="Seed">
            <TextInput value={seed} onChange={(e) => setSeed(e.target.value)} />
          </Field>
          <Field label="Event detail">
            <SelectInput
              value={eventDetail}
              onChange={(e) => setEventDetail(e.target.value as TechnicalEventDetail)}
            >
              <option value="NONE">None</option>
              <option value="SUMMARY">Summary (last 50)</option>
              <option value="FULL">Full</option>
            </SelectInput>
          </Field>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginTop: '1rem' }}>
          <Button disabled={busy} onClick={() => run('regulation')}>
            Simulate regulation
          </Button>
          <Button disabled={busy} variant="secondary" onClick={() => run('next-event')}>
            Step next event
          </Button>
          <Button disabled={busy} variant="secondary" onClick={() => run('next-shift')}>
            Step next shift
          </Button>
          <Button disabled={busy} variant="secondary" onClick={() => run('end-period')}>
            Simulate period
          </Button>
          <Button disabled={busy} variant="secondary" onClick={() => run('resume')}>
            Resume from snapshot
          </Button>
          <Button disabled={busy} variant="ghost" onClick={resetOutput}>
            Reset local snapshot
          </Button>
        </div>
      </Panel>

      <div className="two-column-grid">
        <Panel title="Current state">
          <dl className="detail-list">
            <div>
              <dt>Period</dt>
              <dd>{period}</dd>
            </div>
            <div>
              <dt>Clock</dt>
              <dd>{clockRemaining}</dd>
            </div>
            <div>
              <dt>Score</dt>
              <dd>
                {score ? `${score.home ?? 0} – ${score.away ?? 0}` : '0 – 0'}{' '}
                <Badge tone="neutral">No scoring in F11</Badge>
              </dd>
            </div>
            <div>
              <dt>Possession</dt>
              <dd>{possession}</dd>
            </div>
            <div>
              <dt>Zone (possession-relative)</dt>
              <dd>{zone}</dd>
            </div>
            <div>
              <dt>Status</dt>
              <dd>{String(state?.simulationStatus ?? 'NOT_STARTED')}</dd>
            </div>
          </dl>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.5rem', marginTop: '1rem' }}>
            {(['DEFENSIVE', 'NEUTRAL', 'OFFENSIVE'] as const).map((z) => (
              <div
                key={z}
                style={{
                  border: '1px solid var(--border-subtle)',
                  borderRadius: 'var(--radius-sm)',
                  padding: '0.5rem',
                  textAlign: 'center',
                  background: zone === z ? 'var(--surface-accent)' : 'var(--surface-raised)',
                }}
              >
                {z}
              </div>
            ))}
          </div>
        </Panel>

        <Panel title="Metadata & diagnostics">
          {metadata ? (
            <dl className="detail-list">
              <div>
                <dt>Engine</dt>
                <dd>{metadata.engineVersion}</dd>
              </div>
              <div>
                <dt>Balance</dt>
                <dd>
                  v{metadata.balanceVersionNumber} · {metadata.balanceHash.slice(0, 12)}…
                </dd>
              </div>
              <div>
                <dt>Seed</dt>
                <dd>{String(metadata.seed)}</dd>
              </div>
            </dl>
          ) : (
            <p style={{ margin: 0, color: 'var(--text-secondary)' }}>Run a simulation to populate metadata.</p>
          )}
          {diagnostics ? (
            <>
              <p style={{ margin: '0.75rem 0 0.25rem', font: 'var(--text-body-sm)' }}>
                Events: {diagnostics.totalEvents} · Trace hash: {diagnostics.traceHash.slice(0, 16)}…
              </p>
              <p style={{ margin: 0, font: 'var(--text-body-sm)', color: 'var(--text-secondary)' }}>
                Faceoffs H/A: {diagnostics.faceoffWins.home}/{diagnostics.faceoffWins.away} · Possession seconds H/A/N:{' '}
                {diagnostics.possessionSecondsByTeam.home}/{diagnostics.possessionSecondsByTeam.away}/
                {diagnostics.possessionSecondsByTeam.none}
              </p>
            </>
          ) : null}
          {notice ? (
            <p style={{ marginTop: '0.75rem', font: 'var(--text-body-sm)', color: 'var(--text-secondary)' }}>{notice}</p>
          ) : null}
        </Panel>
      </div>

      <Panel title="Technical event feed">
        {events.length === 0 ? (
          <p style={{ margin: 0, color: 'var(--text-secondary)' }}>No events yet.</p>
        ) : (
          <ul style={{ margin: 0, paddingLeft: '1.25rem', maxHeight: '24rem', overflow: 'auto' }}>
            {events.map((ev) => (
              <li key={ev.index} style={{ font: 'var(--text-body-sm)', marginBottom: '0.25rem' }}>
                {formatEventLine(ev)}
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  );
}
