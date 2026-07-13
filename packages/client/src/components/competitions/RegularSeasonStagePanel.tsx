import { useCallback, useEffect, useState, type ChangeEvent } from 'react';
import { Link } from 'react-router-dom';
import { Badge } from '../ui/Badge';
import { Button } from '../ui/Button';
import { EmptyState, ErrorState, LoadingState } from '../ui/EmptyState';
import { Panel } from '../ui/Panel';
import { Field, TextInput } from '../ui/DataBrowser';
import { useCommissioner } from '../../lib/commissioner';
import {
  cancelRegularSeasonSimulation,
  generateRegularSeasonSchedule,
  getRegularSeasonSimulationRun,
  getStageGoalieStats,
  getStagePlayerStats,
  getStageProgress,
  getStageQualification,
  getStageSchedule,
  getStageStandings,
  getStageTeamStats,
  previewRegularSeasonSchedule,
  regenerateRegularSeasonSchedule,
  simulateRegularSeasonStage,
  type StageProgressDto,
  type StageSimulationRunDto,
  type StageStandingsDto,
} from '../../lib/api';

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: 'flex', gap: 12, font: 'var(--text-body-sm)', marginBottom: 4 }}>
      <span style={{ color: 'var(--text-tertiary)', minWidth: 140 }}>{label}</span>
      <span>{value}</span>
    </div>
  );
}

export function RegularSeasonStagePanel({
  stageId,
  stageUpdatedAt,
  section,
  onStageChanged,
}: {
  stageId: string;
  stageUpdatedAt: string;
  section: 'overview' | 'schedule' | 'standings' | 'players' | 'teams';
  onStageChanged?: () => void;
}) {
  const commissioner = useCommissioner();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [seed, setSeed] = useState('nhl-2026-regular-season');
  const [reason, setReason] = useState('Generate regular-season schedule');
  const [progress, setProgress] = useState<StageProgressDto | null>(null);
  const [schedule, setSchedule] = useState<any>(null);
  const [standings, setStandings] = useState<StageStandingsDto | null>(null);
  const [qualification, setQualification] = useState<any>(null);
  const [playerStats, setPlayerStats] = useState<any>(null);
  const [goalieStats, setGoalieStats] = useState<any>(null);
  const [teamStats, setTeamStats] = useState<any>(null);
  const [run, setRun] = useState<StageSimulationRunDto | null>(null);
  const [preview, setPreview] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [p, s] = await Promise.all([
        getStageProgress(stageId),
        section === 'schedule' || section === 'overview'
          ? getStageSchedule(stageId).catch(() => null)
          : Promise.resolve(null),
      ]);
      setProgress(p.item);
      if (s) setSchedule((s as { item: unknown }).item);

      if (section === 'standings' || section === 'overview') {
        const st = await getStageStandings(stageId);
        setStandings(st.item);
        const q = await getStageQualification(stageId);
        setQualification(q.item);
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
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load regular-season data');
    } finally {
      setLoading(false);
    }
  }, [stageId, section]);

  useEffect(() => {
    void reload();
  }, [reload]);

  useEffect(() => {
    if (!run || (run.status !== 'QUEUED' && run.status !== 'RUNNING')) return;
    const t = window.setInterval(() => {
      void getRegularSeasonSimulationRun(stageId, run.id)
        .then((res: { item: StageSimulationRunDto }) => {
          setRun(res.item);
          if (res.item.status === 'COMPLETED' || res.item.status === 'FAILED' || res.item.status === 'CANCELLED') {
            void reload();
            onStageChanged?.();
          }
        })
        .catch(() => undefined);
    }, 800);
    return () => window.clearInterval(t);
  }, [run, stageId, reload, onStageChanged]);

  async function runAction(fn: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    try {
      await fn();
      await reload();
      onStageChanged?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Action failed');
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <LoadingState label="Loading regular season…" />;
  if (error && !progress) return <ErrorState title="Regular season" description={error} />;

  if (section === 'overview') {
    return (
      <Panel title="Regular season overview">
        {error && <p style={{ color: 'var(--danger)', font: 'var(--text-body-sm)' }}>{error}</p>}
        {progress && (
          <>
            <Row label="Stage status" value={progress.status} />
            <Row label="Schedule" value={progress.scheduleStatus} />
            <Row
              label="Progress"
              value={`${progress.completedMatches}/${progress.totalScheduledMatches} (${progress.percentComplete}%)`}
            />
            <Row label="Schedule hash" value={progress.scheduleHash?.slice(0, 16) ?? '—'} />
          </>
        )}
        {standings && (
          <p style={{ font: 'var(--text-body-sm)', marginTop: 12 }}>
            Standings: <Badge tone="neutral">{standings.source}</Badge>
            {standings.standings.rows[0]
              ? ` · Leader ${standings.standings.rows[0].teamNameSnapshot} (${standings.standings.rows[0].points} pts)`
              : ' · No results yet'}
          </p>
        )}
        {qualification && !standings?.standings.provisional && (
          <p style={{ font: 'var(--text-body-sm)' }}>
            Qualified (F19 input):{' '}
            {(qualification.qualifiedParticipantIds as string[] | undefined)?.length ?? 0} teams · Playoffs
            remain disabled until F19.
          </p>
        )}

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 16 }}>
          {commissioner.enabled && (
            <>
              <Button
                size="sm"
                disabled={busy}
                onClick={() =>
                  runAction(async () => {
                    const res = await previewRegularSeasonSchedule(stageId, { seed });
                    setPreview(res.item);
                  })
                }
              >
                Preview schedule
              </Button>
              <Button
                size="sm"
                disabled={busy}
                onClick={() => {
                  if (!window.confirm('Generate and persist the regular-season schedule?')) return;
                  void runAction(() =>
                    generateRegularSeasonSchedule(stageId, {
                      expectedUpdatedAt: stageUpdatedAt,
                      seed,
                      reason,
                    }),
                  );
                }}
              >
                Generate schedule
              </Button>
              <Button
                size="sm"
                variant="secondary"
                disabled={busy}
                onClick={() => {
                  if (!window.confirm('Regenerate schedule? Only allowed before any results.')) return;
                  void runAction(() =>
                    regenerateRegularSeasonSchedule(stageId, {
                      expectedUpdatedAt: stageUpdatedAt,
                      seed,
                      reason: 'Regenerate regular-season schedule',
                    }),
                  );
                }}
              >
                Regenerate
              </Button>
            </>
          )}
          <Button
            size="sm"
            disabled={busy || !progress || progress.remainingMatches === 0}
            onClick={() => {
              if (
                !window.confirm(
                  'Simulate all remaining matches? An automatic SQLite safety backup is created before the first stage match. Completed results are official and are not rolled back on cancel.',
                )
              )
                return;
              void runAction(async () => {
                const res = await simulateRegularSeasonStage(stageId, {
                  baseSeed: seed,
                  mode: 'ALL_REMAINING',
                  confirmBackup: true,
                });
                setRun(res.item);
              });
            }}
          >
            {progress && progress.completedMatches > 0 ? 'Continue remaining' : 'Simulate regular season'}
          </Button>
          {run && (run.status === 'RUNNING' || run.status === 'QUEUED') && (
            <Button
              size="sm"
              variant="secondary"
              disabled={busy}
              onClick={() => runAction(() => cancelRegularSeasonSimulation(stageId, run.id))}
            >
              Cancel run
            </Button>
          )}
        </div>

        {commissioner.enabled && (
          <div style={{ marginTop: 12, display: 'grid', gap: 8, maxWidth: 420 }}>
            <Field label="Seed">
              <TextInput value={seed} onChange={(e: ChangeEvent<HTMLInputElement>) => setSeed(e.target.value)} />
            </Field>
            <Field label="Reason">
              <TextInput value={reason} onChange={(e: ChangeEvent<HTMLInputElement>) => setReason(e.target.value)} />
            </Field>
          </div>
        )}

        {run && (
          <div style={{ marginTop: 16, font: 'var(--text-body-sm)' }}>
            <Row label="Run" value={`${run.status} · ${run.progress.completed}/${run.progress.total}`} />
            {run.backup && <Row label="Backup" value={run.backup.relativeDisplayPath} />}
            {run.note && <p style={{ color: 'var(--text-tertiary)' }}>{run.note}</p>}
            {run.error && (
              <p style={{ color: 'var(--danger)' }}>
                {run.error.code}: {run.error.message}
              </p>
            )}
          </div>
        )}

        {preview && (
          <pre
            style={{
              marginTop: 12,
              font: 'var(--text-body-sm)',
              whiteSpace: 'pre-wrap',
              maxHeight: 240,
              overflow: 'auto',
            }}
          >
            {JSON.stringify(
              {
                scheduleHash: preview.scheduleHash,
                diagnostics: preview.diagnostics,
                persisted: preview.persisted,
              },
              null,
              2,
            )}
          </pre>
        )}
      </Panel>
    );
  }

  if (section === 'schedule') {
    const rounds = (schedule?.rounds ?? []) as Array<{
      roundNumber: number;
      displayLabel: string;
      matches: Array<{
        id: string;
        homeTeamName: string;
        awayTeamName: string;
        status: string;
        currentResult: { homeScore: number; awayScore: number; decisionType: string } | null;
      }>;
    }>;
    return (
      <Panel title="Schedule & results">
        {error && <p style={{ color: 'var(--danger)', font: 'var(--text-body-sm)' }}>{error}</p>}
        {!rounds.length ? (
          <EmptyState title="No schedule" description="Generate a schedule from Overview (Commissioner)." />
        ) : (
          rounds.map((round) => (
            <div key={round.roundNumber} style={{ marginBottom: 16 }}>
              <strong style={{ font: 'var(--text-body-sm)' }}>{round.displayLabel}</strong>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 8 }}>
                {round.matches.map((m) => (
                  <div
                    key={m.id}
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      gap: 8,
                      font: 'var(--text-body-sm)',
                      borderBottom: '1px solid var(--border-subtle)',
                      paddingBottom: 6,
                    }}
                  >
                    <span>
                      {m.homeTeamName} vs {m.awayTeamName}
                    </span>
                    <span style={{ color: 'var(--text-tertiary)' }}>
                      {m.currentResult
                        ? `${m.currentResult.homeScore}–${m.currentResult.awayScore} (${m.currentResult.decisionType})`
                        : m.status}{' '}
                      · <Link to={`/matches/${m.id}`}>Open</Link>
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ))
        )}
      </Panel>
    );
  }

  if (section === 'standings') {
    const rows = standings?.standings.rows ?? [];
    return (
      <Panel
        title="Standings"
        actions={<Badge tone="neutral">{standings?.source ?? '—'}</Badge>}
      >
        {error && <p style={{ color: 'var(--danger)', font: 'var(--text-body-sm)' }}>{error}</p>}
        {!rows.length ? (
          <EmptyState title="No standings yet" description="Simulate matches to populate provisional standings." />
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', font: 'var(--text-body-sm)' }}>
              <thead>
                <tr>
                  {['#', 'Team', 'GP', 'W', 'L', 'GF', 'GA', 'GD', 'PTS', 'Q'].map((h) => (
                    <th key={h} style={{ textAlign: 'left', padding: '4px 6px', color: 'var(--text-tertiary)' }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((r: StageStandingsDto['standings']['rows'][number]) => (
                  <tr key={r.participantId} style={{ borderTop: '1px solid var(--border-subtle)' }}>
                    <td style={{ padding: '4px 6px' }}>{r.rank}</td>
                    <td style={{ padding: '4px 6px' }}>
                      <Link to={`/teams/${r.teamId}`}>{r.teamNameSnapshot}</Link>
                    </td>
                    <td style={{ padding: '4px 6px' }}>{r.gamesPlayed}</td>
                    <td style={{ padding: '4px 6px' }}>{r.wins}</td>
                    <td style={{ padding: '4px 6px' }}>{r.losses}</td>
                    <td style={{ padding: '4px 6px' }}>{r.goalsFor}</td>
                    <td style={{ padding: '4px 6px' }}>{r.goalsAgainst}</td>
                    <td style={{ padding: '4px 6px' }}>{r.goalDifference}</td>
                    <td style={{ padding: '4px 6px' }}>{r.points}</td>
                    <td style={{ padding: '4px 6px' }}>{r.qualified ? '✓' : ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p style={{ font: 'var(--text-body-sm)', color: 'var(--text-tertiary)', marginTop: 12 }}>
          Playoff bracket generation is deferred to F19. Qualification markers are structural input only.
        </p>
      </Panel>
    );
  }

  if (section === 'players') {
    return (
      <Panel title="Player statistics">
        {error && <p style={{ color: 'var(--danger)', font: 'var(--text-body-sm)' }}>{error}</p>}
        <p style={{ font: 'var(--text-body-sm)', color: 'var(--text-tertiary)' }}>
          Source: {playerStats?.source ?? '—'}
        </p>
        <h3 style={{ font: 'var(--text-body-sm)' }}>Skaters</h3>
        <StatTable
          rows={(playerStats?.items ?? []) as Array<Record<string, unknown>>}
          cols={[
            ['name', (r) => `${r.firstNameSnapshot ?? ''} ${r.lastNameSnapshot ?? ''}`.trim() || String(r.playerId)],
            ['team', (r) => String(r.teamNameSnapshot ?? '')],
            ['GP', (r) => String(r.gamesPlayed ?? '')],
            ['G', (r) => String(r.goals ?? '')],
            ['A', (r) => String(r.assists ?? '')],
            ['P', (r) => String(r.points ?? '')],
          ]}
        />
        <h3 style={{ font: 'var(--text-body-sm)', marginTop: 16 }}>Goalies</h3>
        <StatTable
          rows={(goalieStats?.items ?? []) as Array<Record<string, unknown>>}
          cols={[
            ['name', (r) => `${r.firstNameSnapshot ?? ''} ${r.lastNameSnapshot ?? ''}`.trim() || String(r.playerId)],
            ['team', (r) => String(r.teamNameSnapshot ?? '')],
            ['GP', (r) => String(r.gamesPlayed ?? '')],
            ['W', (r) => String(r.wins ?? '')],
            ['SV%', (r) => (r.savePercentage != null ? Number(r.savePercentage).toFixed(3) : '—')],
          ]}
        />
      </Panel>
    );
  }

  // teams
  return (
    <Panel title="Team statistics">
      {error && <p style={{ color: 'var(--danger)', font: 'var(--text-body-sm)' }}>{error}</p>}
      <p style={{ font: 'var(--text-body-sm)', color: 'var(--text-tertiary)' }}>
        Source: {teamStats?.source ?? '—'}
      </p>
      <StatTable
        rows={(teamStats?.items ?? []) as Array<Record<string, unknown>>}
        cols={[
          ['team', (r) => String(r.teamNameSnapshot ?? '')],
          ['GP', (r) => String(r.gamesPlayed ?? '')],
          ['GF', (r) => String(r.goals ?? '')],
          ['GA', (r) => String(r.goalsAgainst ?? '')],
          ['SOG', (r) => String(r.shotsOnGoal ?? '')],
          ['PIM', (r) => String(r.penaltyMinutes ?? '')],
        ]}
      />
    </Panel>
  );
}

function StatTable({
  rows,
  cols,
}: {
  rows: Array<Record<string, unknown>>;
  cols: Array<[string, (r: Record<string, unknown>) => string]>;
}) {
  if (!rows.length) return <EmptyState title="No stats" description="Complete matches to aggregate season stats." />;
  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', font: 'var(--text-body-sm)' }}>
        <thead>
          <tr>
            {cols.map(([h]) => (
              <th key={h} style={{ textAlign: 'left', padding: '4px 6px', color: 'var(--text-tertiary)' }}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={String(r.playerId ?? r.teamId ?? i)} style={{ borderTop: '1px solid var(--border-subtle)' }}>
              {cols.map(([h, fn]) => (
                <td key={h} style={{ padding: '4px 6px' }}>
                  {fn(r)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
