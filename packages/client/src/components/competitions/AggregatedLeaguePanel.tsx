import { useCallback, useEffect, useState } from 'react';
import { Badge } from '../ui/Badge';
import { Button } from '../ui/Button';
import { EmptyState, ErrorState, LoadingState } from '../ui/EmptyState';
import { Panel } from '../ui/Panel';
import { Field, TextInput } from '../ui/DataBrowser';
import { useCommissioner } from '../../lib/commissioner';
import {
  discardPreparedAggregatedRun,
  getAggregatedDiagnostics,
  getAggregatedMatches,
  getAggregatedStatus,
  getStageGoalieStats,
  getStagePlayerStats,
  getStageStandings,
  getStageTeamStats,
  prepareAggregatedSeason,
  previewAggregatedSeason,
  simulateAggregatedSeason,
} from '../../lib/api';

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: 'flex', gap: 12, font: 'var(--text-body-sm)', marginBottom: 4 }}>
      <span style={{ color: 'var(--text-tertiary)', minWidth: 150 }}>{label}</span>
      <span>{value}</span>
    </div>
  );
}

function tierLabel(tier: unknown): string {
  const t = String(tier ?? '');
  return t.replace(/_/g, ' ');
}

export function AggregatedLeaguePanel({
  stageId,
  stageUpdatedAt,
  section,
  onStageChanged,
}: {
  stageId: string;
  stageUpdatedAt: string;
  section: 'overview' | 'results' | 'standings' | 'players' | 'teams' | 'diagnostics';
  onStageChanged?: () => void;
}) {
  const commissioner = useCommissioner();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [seed, setSeed] = useState('aggregated-league-2026');
  const [reason, setReason] = useState('Prepare aggregated league season');
  const [status, setStatus] = useState<Record<string, unknown> | null>(null);
  const [preview, setPreview] = useState<Record<string, unknown> | null>(null);
  const [matches, setMatches] = useState<unknown[]>([]);
  const [standings, setStandings] = useState<Record<string, unknown> | null>(null);
  const [playerStats, setPlayerStats] = useState<unknown>(null);
  const [goalieStats, setGoalieStats] = useState<unknown>(null);
  const [teamStats, setTeamStats] = useState<unknown>(null);
  const [diagnostics, setDiagnostics] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(true);
  const [updatedAt, setUpdatedAt] = useState(stageUpdatedAt);

  useEffect(() => {
    setUpdatedAt(stageUpdatedAt);
  }, [stageUpdatedAt]);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const st = await getAggregatedStatus(stageId);
      setStatus(st.item);
      if (section === 'results' || section === 'overview') {
        const m = await getAggregatedMatches(stageId, { page: 1, pageSize: 100 });
        setMatches(m.items);
      }
      if (section === 'standings' || section === 'overview') {
        const s = await getStageStandings(stageId).catch(() => null);
        setStandings((s?.item as unknown as Record<string, unknown>) ?? null);
      }
      if (section === 'players') {
        const [sk, go] = await Promise.all([
          getStagePlayerStats(stageId, { sort: 'points' }),
          getStageGoalieStats(stageId),
        ]);
        setPlayerStats(sk);
        setGoalieStats(go);
      }
      if (section === 'teams') {
        const t = await getStageTeamStats(stageId);
        setTeamStats(t.item);
      }
      if (section === 'diagnostics' && commissioner.enabled) {
        const d = await getAggregatedDiagnostics(stageId).catch(() => null);
        setDiagnostics(d?.item ?? null);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load aggregated league data');
    } finally {
      setLoading(false);
    }
  }, [stageId, section, commissioner.enabled]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const run = status?.run as Record<string, unknown> | null | undefined;
  const runStatus = String(run?.status ?? '');
  const completed = String(status?.stageStatus ?? '') === 'COMPLETED';

  async function onPreview() {
    setBusy(true);
    setError(null);
    try {
      const res = await previewAggregatedSeason(stageId);
      setPreview(res.item);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Preview failed');
    } finally {
      setBusy(false);
    }
  }

  async function onPrepare() {
    setBusy(true);
    setError(null);
    try {
      const res = await prepareAggregatedSeason(stageId, {
        expectedUpdatedAt: updatedAt,
        seed,
        reason,
      });
      const prepared = res.item.run as { id?: string } | undefined;
      setPreview(null);
      await reload();
      onStageChanged?.();
      if (prepared?.id) {
        /* status reload picks up prepared run */
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Prepare failed');
    } finally {
      setBusy(false);
    }
  }

  async function onDiscard() {
    if (!run?.id || runStatus !== 'PREPARED') return;
    setBusy(true);
    setError(null);
    try {
      await discardPreparedAggregatedRun(stageId, {
        expectedUpdatedAt: updatedAt,
        reason: 'Discard prepared aggregated run',
        runId: String(run.id),
      });
      await reload();
      onStageChanged?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Discard failed');
    } finally {
      setBusy(false);
    }
  }

  async function onSimulate() {
    if (!run?.id || runStatus !== 'PREPARED') return;
    setBusy(true);
    setError(null);
    try {
      await simulateAggregatedSeason(stageId, {
        runId: String(run.id),
        confirmation: true,
      });
      await reload();
      onStageChanged?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Simulation failed');
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <LoadingState label="Loading aggregated league…" />;
  if (error && !status) return <ErrorState title="Aggregated league" description={error} />;

  const strengths = (preview?.strengths as Array<Record<string, unknown>> | undefined) ?? [];
  const standingRows =
    ((standings?.standings as { rows?: Array<Record<string, unknown>> } | undefined)?.rows ??
      (standings?.rows as Array<Record<string, unknown>> | undefined) ??
      []) ||
    [];

  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <Panel>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8, flexWrap: 'wrap' }}>
          <Badge>Aggregated Simulation</Badge>
          <span style={{ font: 'var(--text-body-sm)', color: 'var(--text-secondary)' }}>
            Fast season model without detailed shift-by-shift events.
          </span>
        </div>
        {error ? (
          <p style={{ color: 'var(--danger)', font: 'var(--text-body-sm)' }}>{error}</p>
        ) : null}
        {section === 'overview' ? (
          <>
            <Row label="Stage status" value={String(status?.stageStatus ?? '—')} />
            <Row label="Simulation mode" value={String(status?.simulationMode ?? 'AGGREGATED')} />
            <Row
              label="Run"
              value={
                run
                  ? `${String(run.status)} · ${String(run.completedGames ?? 0)}/${String(run.totalGames ?? 0)}`
                  : 'None'
              }
            />
            <Row
              label="Champion"
              value={String(status?.championTeamNameSnapshot ?? '—')}
            />
            <Row
              label="Hashes"
              value={
                run
                  ? `in ${String(run.inputHash ?? '').slice(0, 8)} · cfg ${String(run.configHash ?? '').slice(0, 8)} · res ${String(run.resultHash ?? '—').slice(0, 8)}`
                  : '—'
              }
            />
            {!completed && commissioner.enabled ? (
              <div style={{ display: 'grid', gap: 8, marginTop: 12, maxWidth: 420 }}>
                <Field label="Seed">
                  <TextInput value={seed} onChange={(e) => setSeed(e.target.value)} />
                </Field>
                <Field label="Reason">
                  <TextInput value={reason} onChange={(e) => setReason(e.target.value)} />
                </Field>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <Button type="button" disabled={busy} onClick={() => void onPreview()}>
                    Preview
                  </Button>
                  <Button type="button" disabled={busy} onClick={() => void onPrepare()}>
                    Prepare Season
                  </Button>
                  {runStatus === 'PREPARED' ? (
                    <Button type="button" disabled={busy} onClick={() => void onDiscard()}>
                      Discard Prepared
                    </Button>
                  ) : null}
                </div>
              </div>
            ) : null}
            {!completed && runStatus === 'PREPARED' ? (
              <div style={{ marginTop: 12 }}>
                <Button type="button" disabled={busy} onClick={() => void onSimulate()}>
                  Simulate League
                </Button>
                <p style={{ font: 'var(--text-body-sm)', color: 'var(--text-tertiary)', marginTop: 6 }}>
                  Results become official only after complete reconciliation and publication.
                </p>
              </div>
            ) : null}
            {preview ? (
              <div style={{ marginTop: 16 }}>
                <h3 style={{ font: 'var(--text-title-sm)', marginBottom: 8 }}>Strength preview</h3>
                <Row label="Schedule games" value={String(preview.scheduleGames ?? '—')} />
                <Row label="Input hash" value={String(preview.inputHash ?? '').slice(0, 16)} />
                <div style={{ marginTop: 8, overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', font: 'var(--text-body-sm)' }}>
                    <thead>
                      <tr>
                        <th align="left">Team</th>
                        <th align="left">Overall</th>
                        <th align="left">Offense</th>
                        <th align="left">Defense</th>
                        <th align="left">Goaltending</th>
                      </tr>
                    </thead>
                    <tbody>
                      {strengths.map((s) => (
                        <tr key={String(s.competitionParticipantId)}>
                          <td>{String(s.teamNameSnapshot)}</td>
                          <td>{tierLabel(s.overallTier)}</td>
                          <td>{tierLabel(s.offenseTier)}</td>
                          <td>{tierLabel(s.defenseTier)}</td>
                          <td>{tierLabel(s.goaltendingTier)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : null}
          </>
        ) : null}
      </Panel>

      {section === 'standings' ? (
        <Panel>
          <h3 style={{ font: 'var(--text-title-sm)', marginBottom: 8 }}>Aggregated Final Standings</h3>
          {!standingRows.length ? (
            <EmptyState title="No standings" description="Simulate the aggregated season to publish standings." />
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', font: 'var(--text-body-sm)' }}>
                <thead>
                  <tr>
                    <th align="left">#</th>
                    <th align="left">Team</th>
                    <th>GP</th>
                    <th>Pts</th>
                    <th>GF</th>
                    <th>GA</th>
                    <th>GD</th>
                  </tr>
                </thead>
                <tbody>
                  {standingRows.map((r) => (
                    <tr key={String(r.participantId ?? r.competitionParticipantId ?? r.rank)}>
                      <td>{String(r.rank)}</td>
                      <td>{String(r.teamNameSnapshot)}</td>
                      <td align="center">{String(r.gamesPlayed)}</td>
                      <td align="center">{String(r.points)}</td>
                      <td align="center">{String(r.goalsFor)}</td>
                      <td align="center">{String(r.goalsAgainst)}</td>
                      <td align="center">{String(r.goalDifference)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>
      ) : null}

      {section === 'results' ? (
        <Panel>
          <h3 style={{ font: 'var(--text-title-sm)', marginBottom: 8 }}>Aggregated results</h3>
          {!matches.length ? (
            <EmptyState
              title="No aggregate results"
              description="Official summaries appear after simulation completes."
            />
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', font: 'var(--text-body-sm)' }}>
                <thead>
                  <tr>
                    <th align="left">Round</th>
                    <th align="left">Home</th>
                    <th align="left">Away</th>
                    <th>Score</th>
                    <th>Decision</th>
                  </tr>
                </thead>
                <tbody>
                  {matches.map((raw) => {
                    const m = raw as Record<string, unknown>;
                    return (
                      <tr key={String(m.id)}>
                        <td>{String(m.roundNumber)}</td>
                        <td>{String(m.homeTeamNameSnapshot)}</td>
                        <td>{String(m.awayTeamNameSnapshot)}</td>
                        <td align="center">
                          {String(m.homeScore)}–{String(m.awayScore)}
                        </td>
                        <td align="center">{String(m.decisionType)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          <p style={{ font: 'var(--text-body-sm)', color: 'var(--text-tertiary)', marginTop: 8 }}>
            No detailed event feed — these are aggregate game summaries only.
          </p>
        </Panel>
      ) : null}

      {section === 'teams' ? (
        <Panel>
          <h3 style={{ font: 'var(--text-title-sm)', marginBottom: 8 }}>
            Team statistics · Aggregated season estimates
          </h3>
          <pre style={{ font: 'var(--text-body-sm)', whiteSpace: 'pre-wrap' }}>
            {JSON.stringify(teamStats, null, 2)}
          </pre>
        </Panel>
      ) : null}

      {section === 'players' ? (
        <>
          <Panel>
            <h3 style={{ font: 'var(--text-title-sm)', marginBottom: 8 }}>
              Player statistics · Aggregated season estimates
            </h3>
            <pre style={{ font: 'var(--text-body-sm)', whiteSpace: 'pre-wrap' }}>
              {JSON.stringify(playerStats, null, 2)}
            </pre>
          </Panel>
          <Panel>
            <h3 style={{ font: 'var(--text-title-sm)', marginBottom: 8 }}>
              Goalie statistics · Aggregated season estimates
            </h3>
            <pre style={{ font: 'var(--text-body-sm)', whiteSpace: 'pre-wrap' }}>
              {JSON.stringify(goalieStats, null, 2)}
            </pre>
          </Panel>
        </>
      ) : null}

      {section === 'diagnostics' ? (
        <Panel>
          <h3 style={{ font: 'var(--text-title-sm)', marginBottom: 8 }}>Commissioner diagnostics</h3>
          {!commissioner.enabled ? (
            <EmptyState title="Commissioner Mode required" description="Enable Commissioner Mode to view diagnostics." />
          ) : (
            <pre style={{ font: 'var(--text-body-sm)', whiteSpace: 'pre-wrap' }}>
              {JSON.stringify(diagnostics ?? status, null, 2)}
            </pre>
          )}
        </Panel>
      ) : null}
    </div>
  );
}
