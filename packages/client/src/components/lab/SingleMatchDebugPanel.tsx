import { useCallback, useEffect, useMemo, useState } from 'react';
import { Badge } from '../ui/Badge';
import { Button } from '../ui/Button';
import { Field, SelectInput, TextInput } from '../ui/DataBrowser';
import { ErrorState, LoadingState } from '../ui/EmptyState';
import { Panel } from '../ui/Panel';
import {
  getTeams,
  simulateTechnicalRegulation,
  stepTechnicalSimulation,
  type TeamListItem,
  type TechnicalEventDetail,
  type TechnicalMatchEvent,
  type TechnicalMatchSnapshot,
  type TechnicalMatchStatistics,
  type TechnicalPeriodScore,
  type TechnicalPlayerDirectoryEntry,
  type TechnicalReconciliation,
  type TechnicalSimulationDiagnostics,
  type TechnicalSimulationMetadata,
} from '../../lib/api';

function formatClock(remainingSeconds: number): string {
  const m = Math.floor(remainingSeconds / 60);
  const s = remainingSeconds % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

function playerName(
  playerId: string | null | undefined,
  directory: Record<string, TechnicalPlayerDirectoryEntry>,
): string {
  if (!playerId) return 'Unknown';
  const p = directory[playerId];
  if (!p) return playerId.slice(0, 8);
  return `${p.firstName} ${p.lastName}`.trim();
}

function formatPct(value: number): string {
  if (!Number.isFinite(value)) return '—';
  return `${(value * 100).toFixed(1)}%`;
}

function formatStrengthLabel(strength: unknown): string {
  switch (strength) {
    case 'HOME_POWER_PLAY_5V4':
      return 'Home PP 5v4';
    case 'AWAY_POWER_PLAY_5V4':
      return 'Away PP 5v4';
    case 'EVEN_5V5':
      return '5v5';
    default:
      return typeof strength === 'string' ? strength : '5v5';
  }
}

function formatInfraction(infraction: unknown): string {
  if (typeof infraction !== 'string' || !infraction) return 'penalty';
  return infraction.replace(/_/g, ' ').toLowerCase();
}

function formatGoalStrength(goalStrength: unknown): string {
  if (goalStrength === 'POWER_PLAY') return 'Power-play goal';
  if (goalStrength === 'SHORT_HANDED') return 'Short-handed goal';
  return 'Goal';
}

function formatEventLine(
  ev: TechnicalMatchEvent,
  directory: Record<string, TechnicalPlayerDirectoryEntry>,
): string {
  const clock = formatClock(ev.remainingSeconds);
  const prefix = `P${ev.period} ${clock}`;
  const d = ev.details;

  switch (ev.type) {
    case 'GOAL': {
      const scorer = playerName(String(d.scorerId ?? ev.playerIds[0]), directory);
      const primary = d.primaryAssistId ? playerName(String(d.primaryAssistId), directory) : null;
      const secondary = d.secondaryAssistId ? playerName(String(d.secondaryAssistId), directory) : null;
      const assists =
        primary && secondary
          ? ` (${primary}, ${secondary})`
          : primary
            ? ` (${primary})`
            : '';
      return `${prefix} — ${formatGoalStrength(d.goalStrength)}: ${scorer}${assists}`;
    }
    case 'PENALTY': {
      const offender = playerName(String(d.penalizedPlayerId ?? ev.playerIds[0]), directory);
      const duration =
        typeof d.durationSeconds === 'number' ? formatClock(d.durationSeconds) : '2:00';
      return `${prefix} — Penalty: ${offender} — ${formatInfraction(d.infraction)} (${duration})`;
    }
    case 'PENALTY_EXPIRED': {
      const offender = playerName(String(d.penalizedPlayerId ?? ev.playerIds[0]), directory);
      const reason = d.reason ? ` (${String(d.reason).replace(/_/g, ' ').toLowerCase()})` : '';
      return `${prefix} — Penalty expired: ${offender}${reason}`;
    }
    case 'SAVE': {
      const shooter = playerName(String(d.shooterId ?? ev.playerIds[1]), directory);
      const goalie = playerName(String(d.goalieId ?? ev.playerIds[0]), directory);
      const shotType = String(d.shotType ?? 'shot').toLowerCase();
      return `${prefix} — ${shooter} ${shotType} saved by ${goalie}`;
    }
    case 'SHOT': {
      const shooter = playerName(String(d.shooterId), directory);
      const shotType = String(d.shotType ?? 'shot').toLowerCase();
      return `${prefix} — ${shooter} ${shotType} shot (pending resolution)`;
    }
    case 'SHOT_BLOCKED': {
      const shooter = playerName(String(d.shooterId), directory);
      const blocker = playerName(String(d.blockerId), directory);
      return `${prefix} — ${shooter} shot blocked by ${blocker}`;
    }
    case 'SHOT_MISSED': {
      const shooter = playerName(String(d.shooterId), directory);
      const reason = d.missReason ? ` (${String(d.missReason).toLowerCase()})` : '';
      return `${prefix} — ${shooter} shot missed${reason}`;
    }
    default: {
      const label = ev.type.replace(/_/g, ' ').toLowerCase();
      return `${prefix} — ${label}`;
    }
  }
}

export function SingleMatchDebugPanel() {
  const [teams, setTeams] = useState<TeamListItem[]>([]);
  const [loadingTeams, setLoadingTeams] = useState(true);
  const [homeTeamId, setHomeTeamId] = useState('');
  const [awayTeamId, setAwayTeamId] = useState('');
  const [seed, setSeed] = useState('f13-ui-001');
  const [eventDetail, setEventDetail] = useState<TechnicalEventDetail>('SUMMARY');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [metadata, setMetadata] = useState<TechnicalSimulationMetadata | null>(null);
  const [state, setState] = useState<Record<string, unknown> | null>(null);
  const [diagnostics, setDiagnostics] = useState<TechnicalSimulationDiagnostics | null>(null);
  const [statistics, setStatistics] = useState<TechnicalMatchStatistics | null>(null);
  const [reconciliation, setReconciliation] = useState<TechnicalReconciliation | null>(null);
  const [periodScores, setPeriodScores] = useState<TechnicalPeriodScore[]>([]);
  const [playerDirectory, setPlayerDirectory] = useState<Record<string, TechnicalPlayerDirectoryEntry>>({});
  const [events, setEvents] = useState<TechnicalMatchEvent[]>([]);
  const [snapshot, setSnapshot] = useState<TechnicalMatchSnapshot | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const homeTeam = teams.find((t) => t.id === homeTeamId);
  const awayTeam = teams.find((t) => t.id === awayTeamId);

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
    setStatistics(null);
    setReconciliation(null);
    setPeriodScores([]);
    setPlayerDirectory({});
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
      statistics?: TechnicalMatchStatistics;
      reconciliation?: TechnicalReconciliation;
      periodScores?: TechnicalPeriodScore[];
      playerDirectory?: Record<string, TechnicalPlayerDirectoryEntry>;
      events?: TechnicalMatchEvent[];
      snapshot?: TechnicalMatchSnapshot;
      notice?: string;
    }) => {
      if (item.metadata) setMetadata(item.metadata);
      setState(item.finalState ?? item.state ?? null);
      setDiagnostics(item.diagnostics);
      if (item.statistics) setStatistics(item.statistics);
      if (item.reconciliation) setReconciliation(item.reconciliation);
      if (item.periodScores) setPeriodScores(item.periodScores);
      if (item.playerDirectory) setPlayerDirectory(item.playerDirectory);
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

  const scoringSkaters = useMemo(() => {
    if (!statistics) return [];
    return statistics.skaters
      .filter(
        (s) =>
          s.goals > 0 ||
          s.assists > 0 ||
          s.shotsOnGoal > 0 ||
          s.penaltyMinutes > 0 ||
          s.powerPlayGoals > 0 ||
          s.shortHandedGoals > 0,
      )
      .sort((a, b) => b.points - a.points || b.goals - a.goals || b.penaltyMinutes - a.penaltyMinutes);
  }, [statistics]);

  if (loadingTeams) return <LoadingState label="Loading teams…" />;

  const period = typeof state?.period === 'number' ? state.period : '—';
  const clockRemaining =
    typeof state?.clockRemainingSeconds === 'number' ? formatClock(state.clockRemainingSeconds) : '20:00';
  const score = state?.score as { home?: number; away?: number } | undefined;
  const pendingShot = state?.pendingShot as Record<string, unknown> | null | undefined;
  const strengthLabel = formatStrengthLabel(state?.strengthState);
  const activePenalty = state?.activePenalty as
    | {
        penalizedPlayerId?: string;
        infraction?: string;
        remainingSeconds?: number;
      }
    | null
    | undefined;

  return (
    <div className="page-stack" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <Panel title="Single Match Debug">
        <p style={{ margin: 0, font: 'var(--text-body-sm)', color: 'var(--text-secondary)' }}>
          Technical single-match tool for regulation scoring and special teams. Step/resume debug only —
          results are not persisted and are separate from Batch Lab aggregates.
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
              <option value="SUMMARY">Summary</option>
              <option value="FULL">Full</option>
            </SelectInput>
          </Field>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginTop: '1rem' }}>
          <Button disabled={busy} onClick={() => run('regulation')}>
            Finish regulation
          </Button>
          <Button disabled={busy} variant="secondary" onClick={() => run('next-event')}>
            Next event
          </Button>
          <Button disabled={busy} variant="secondary" onClick={() => run('next-shift')}>
            Next shift
          </Button>
          <Button disabled={busy} variant="secondary" onClick={() => run('end-period')}>
            End period
          </Button>
          <Button disabled={busy} variant="secondary" onClick={() => run('resume')}>
            Resume from snapshot
          </Button>
          <Button disabled={busy} variant="ghost" onClick={resetOutput}>
            Reset local snapshot
          </Button>
        </div>
      </Panel>

      <Panel title="Scoreboard">
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr auto 1fr',
            gap: '1rem',
            alignItems: 'center',
            textAlign: 'center',
          }}
        >
          <div>
            <div style={{ font: 'var(--text-body-sm)', color: 'var(--text-secondary)' }}>
              {homeTeam?.name ?? 'Home'}
            </div>
            <div style={{ fontSize: '2rem', fontWeight: 700 }}>{score?.home ?? 0}</div>
          </div>
          <div>
            <Badge tone="neutral">P{period}</Badge>
            <div style={{ marginTop: '0.25rem', font: 'var(--text-body-sm)' }}>{clockRemaining}</div>
            <div style={{ marginTop: '0.5rem' }}>
              <Badge tone="neutral">{strengthLabel}</Badge>
            </div>
          </div>
          <div>
            <div style={{ font: 'var(--text-body-sm)', color: 'var(--text-secondary)' }}>
              {awayTeam?.name ?? 'Away'}
            </div>
            <div style={{ fontSize: '2rem', fontWeight: 700 }}>{score?.away ?? 0}</div>
          </div>
        </div>
        {activePenalty ? (
          <p style={{ margin: '0.75rem 0 0', font: 'var(--text-body-sm)' }}>
            Active penalty:{' '}
            {playerName(activePenalty.penalizedPlayerId, playerDirectory)} —{' '}
            {formatInfraction(activePenalty.infraction)}
            {typeof activePenalty.remainingSeconds === 'number'
              ? ` · ${formatClock(activePenalty.remainingSeconds)} remaining`
              : ''}
          </p>
        ) : (
          <p style={{ margin: '0.75rem 0 0', font: 'var(--text-body-sm)', color: 'var(--text-secondary)' }}>
            No active penalty
          </p>
        )}
        {periodScores.length > 0 ? (
          <p style={{ margin: '0.5rem 0 0', font: 'var(--text-body-sm)', color: 'var(--text-secondary)' }}>
            Period scores:{' '}
            {periodScores.map((p) => `P${p.period} ${p.home}-${p.away}`).join(' · ')}
          </p>
        ) : null}
      </Panel>

      {pendingShot ? (
        <Panel title="Pending shot">
          <dl className="detail-list">
            <div>
              <dt>Shooter</dt>
              <dd>{playerName(String(pendingShot.shooterId), playerDirectory)}</dd>
            </div>
            <div>
              <dt>Shot type</dt>
              <dd>{String(pendingShot.shotType ?? '—')}</dd>
            </div>
            <div>
              <dt>Quality</dt>
              <dd>{Number(pendingShot.shotQuality ?? 0).toFixed(3)}</dd>
            </div>
            <div>
              <dt>Status</dt>
              <dd>Awaiting resolution on next event</dd>
            </div>
          </dl>
        </Panel>
      ) : null}

      <div className="two-column-grid">
        <Panel title="Team comparison">
          {statistics ? (
            <table className="data-table" style={{ width: '100%' }}>
              <thead>
                <tr>
                  <th>Stat</th>
                  <th>{homeTeam?.shortName ?? 'Home'}</th>
                  <th>{awayTeam?.shortName ?? 'Away'}</th>
                </tr>
              </thead>
              <tbody>
                {(
                  [
                    ['Goals', statistics.home.goals, statistics.away.goals],
                    ['Shots on goal', statistics.home.shotsOnGoal, statistics.away.shotsOnGoal],
                    ['Shot attempts', statistics.home.shotAttempts, statistics.away.shotAttempts],
                    ['Missed shots', statistics.home.missedShots, statistics.away.missedShots],
                    ['Blocks against', statistics.home.blockedShotsAgainst, statistics.away.blockedShotsAgainst],
                    ['Saves', statistics.home.saves, statistics.away.saves],
                    ['Faceoff wins', statistics.home.faceoffWins, statistics.away.faceoffWins],
                    ['PIM', statistics.home.penaltyMinutes, statistics.away.penaltyMinutes],
                    ['PP opp', statistics.home.powerPlayOpportunities, statistics.away.powerPlayOpportunities],
                    ['PP goals', statistics.home.powerPlayGoals, statistics.away.powerPlayGoals],
                    ['PP%', formatPct(statistics.home.powerPlayPercentage), formatPct(statistics.away.powerPlayPercentage)],
                    ['PK%', formatPct(statistics.home.penaltyKillPercentage), formatPct(statistics.away.penaltyKillPercentage)],
                    ['SH goals', statistics.home.shortHandedGoals, statistics.away.shortHandedGoals],
                  ] as Array<[string, string | number, string | number]>
                ).map(([label, home, away]) => (
                  <tr key={label}>
                    <td>{label}</td>
                    <td>{home}</td>
                    <td>{away}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p style={{ margin: 0, color: 'var(--text-secondary)' }}>Run regulation to populate team stats.</p>
          )}
        </Panel>

        <Panel title="Metadata & diagnostics">
          {metadata ? (
            <dl className="detail-list">
              <div>
                <dt>Engine</dt>
                <dd>
                  {metadata.engineVersion} · {metadata.simulationMode}
                </dd>
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
                Events: {diagnostics.totalEvents} · Goals: {diagnostics.goals ?? 0} · SOG:{' '}
                {diagnostics.shotsOnGoal ?? 0} · Trace: {diagnostics.traceHash.slice(0, 16)}…
              </p>
              <p style={{ margin: 0, font: 'var(--text-body-sm)', color: 'var(--text-secondary)' }}>
                Save% {formatPct(diagnostics.savePercentage ?? 0)} · Shooting%{' '}
                {formatPct(diagnostics.shootingPercentage ?? 0)} · Avg shot quality{' '}
                {(diagnostics.averageShotQuality ?? 0).toFixed(3)}
              </p>
              <p style={{ margin: '0.25rem 0 0', font: 'var(--text-body-sm)', color: 'var(--text-secondary)' }}>
                Penalties: {diagnostics.penalties ?? 0} · PP%{' '}
                {formatPct(diagnostics.powerPlayPercentage ?? 0)} · PP goals:{' '}
                {diagnostics.powerPlayGoals ?? 0}/{diagnostics.powerPlayOpportunities ?? 0} · SH goals:{' '}
                {diagnostics.shortHandedGoals ?? 0}
              </p>
            </>
          ) : null}
          {reconciliation ? (
            <p style={{ margin: '0.75rem 0 0', font: 'var(--text-body-sm)' }}>
              Reconciliation:{' '}
              <Badge tone={reconciliation.ok ? 'success' : 'danger'}>
                {reconciliation.ok ? 'PASS' : 'FAIL'}
              </Badge>
            </p>
          ) : null}
          {notice ? (
            <p style={{ marginTop: '0.75rem', font: 'var(--text-body-sm)', color: 'var(--text-secondary)' }}>{notice}</p>
          ) : null}
        </Panel>
      </div>

      <div className="two-column-grid">
        <Panel title="Skater stats">
          {scoringSkaters.length === 0 ? (
            <p style={{ margin: 0, color: 'var(--text-secondary)' }}>No skater scoring lines yet.</p>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table className="data-table" style={{ width: '100%' }}>
                <thead>
                  <tr>
                    <th>Player</th>
                    <th>G</th>
                    <th>A</th>
                    <th>P</th>
                    <th>SOG</th>
                    <th>PIM</th>
                    <th>PPG</th>
                    <th>SHG</th>
                  </tr>
                </thead>
                <tbody>
                  {scoringSkaters.map((s) => (
                    <tr key={s.playerId}>
                      <td>{playerName(s.playerId, playerDirectory)}</td>
                      <td>{s.goals}</td>
                      <td>{s.assists}</td>
                      <td>{s.points}</td>
                      <td>{s.shotsOnGoal}</td>
                      <td>{s.penaltyMinutes}</td>
                      <td>{s.powerPlayGoals}</td>
                      <td>{s.shortHandedGoals}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>

        <Panel title="Goalie stats">
          {statistics?.goalies.length ? (
            <div style={{ overflowX: 'auto' }}>
              <table className="data-table" style={{ width: '100%' }}>
                <thead>
                  <tr>
                    <th>Goalie</th>
                    <th>SA</th>
                    <th>SV</th>
                    <th>GA</th>
                    <th>SV%</th>
                  </tr>
                </thead>
                <tbody>
                  {statistics.goalies.map((g) => (
                    <tr key={g.playerId}>
                      <td>{playerName(g.playerId, playerDirectory)}</td>
                      <td>{g.shotsAgainst}</td>
                      <td>{g.saves}</td>
                      <td>{g.goalsAgainst}</td>
                      <td>{formatPct(g.savePercentage)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p style={{ margin: 0, color: 'var(--text-secondary)' }}>No goalie stats yet.</p>
          )}
        </Panel>
      </div>

      <Panel title="Event feed">
        {events.length === 0 ? (
          <p style={{ margin: 0, color: 'var(--text-secondary)' }}>No events yet.</p>
        ) : (
          <ul style={{ margin: 0, paddingLeft: '1.25rem', maxHeight: '28rem', overflow: 'auto' }}>
            {events.map((ev) => (
              <li
                key={ev.index}
                style={{
                  font: 'var(--text-body-sm)',
                  marginBottom: '0.25rem',
                  fontWeight: ev.type === 'GOAL' || ev.type === 'PENALTY' ? 600 : 400,
                }}
              >
                {formatEventLine(ev, playerDirectory)}
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  );
}
