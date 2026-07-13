import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Badge } from '../ui/Badge';
import { Button } from '../ui/Button';
import { EmptyState, ErrorState, LoadingState } from '../ui/EmptyState';
import { Panel } from '../ui/Panel';
import { Field, TextInput } from '../ui/DataBrowser';
import { useCommissioner } from '../../lib/commissioner';
import { apiBase } from '../../lib/api';

const COMMISSIONER_HEADER = 'X-FHM-Commissioner-Mode';

async function commissionerPost<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${apiBase()}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      [COMMISSIONER_HEADER]: 'enabled',
      'X-FHM-Commissioner-Source': 'ui',
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = new Error((await res.json().catch(() => ({}))).message || res.statusText) as Error & {
      status?: number;
    };
    err.status = res.status;
    throw err;
  }
  return res.json() as Promise<T>;
}

async function getJson<T>(path: string): Promise<T> {
  const res = await fetch(`${apiBase()}${path}`);
  if (!res.ok) throw new Error(`Request failed: ${res.status}`);
  return res.json() as Promise<T>;
}

async function postJson<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${apiBase()}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const payload = await res.json().catch(() => ({}));
    throw new Error(payload.message || `Request failed: ${res.status}`);
  }
  return res.json() as Promise<T>;
}

export function PlayoffStagePanel({
  stageId,
  stageUpdatedAt,
  sourceStageId,
  onChanged,
}: {
  stageId: string;
  stageUpdatedAt: string;
  sourceStageId?: string | null;
  onChanged?: () => void;
}) {
  const commissioner = useCommissioner();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [bracket, setBracket] = useState<any>(null);
  const [progress, setProgress] = useState<any>(null);
  const [seed, setSeed] = useState('playoffs-2026');
  const [reason, setReason] = useState('Playoff commissioner action');
  const [preview, setPreview] = useState<any>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [b, p] = await Promise.all([
        getJson<{ item: unknown }>(`/api/competition-stages/${stageId}/bracket`).catch(() => null),
        getJson<{ item: unknown }>(`/api/competition-stages/${stageId}/playoff-progress`).catch(() => null),
      ]);
      if (b) setBracket(b.item);
      if (p) setProgress(p.item);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load playoffs');
    } finally {
      setLoading(false);
    }
  }, [stageId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  async function run(fn: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    try {
      await fn();
      await reload();
      onChanged?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Action failed');
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <LoadingState label="Loading playoffs…" />;
  if (error && !bracket && !progress) return <ErrorState title="Playoffs" description={error} />;

  const rounds = (bracket?.rounds ?? []) as Array<{
    roundNumber: number;
    roundName: string;
    series: Array<{
      id: string;
      status: string;
      winsRequired: number;
      participant1: { seed: number; name: string; wins: number };
      participant2: { seed: number; name: string; wins: number };
      winnerParticipantId: string | null;
      nextGame: { id: string; gameNumber: number } | null;
    }>;
  }>;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <Panel title="Playoff overview">
        {error && <p style={{ color: 'var(--danger)', font: 'var(--text-body-sm)' }}>{error}</p>}
        {progress && (
          <>
            <Row label="Status" value={String(progress.status)} />
            <Row
              label="Series"
              value={`${progress.completedSeries}/${progress.totalSeries}`}
            />
            <Row label="Games" value={`${progress.completedGames}/${progress.totalGames}`} />
            <Row
              label="Champion"
              value={progress.championTeamNameSnapshot ?? '—'}
            />
          </>
        )}
        {bracket?.stage?.bracketHash && (
          <Row label="Bracket hash" value={String(bracket.stage.bracketHash).slice(0, 16)} />
        )}

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 12 }}>
          {commissioner.enabled && (
            <>
              <Button
                size="sm"
                disabled={busy || !sourceStageId}
                onClick={() =>
                  run(() =>
                    commissionerPost(`/api/commissioner/competition-stages/${stageId}/import-qualified-participants`, {
                      expectedUpdatedAt: stageUpdatedAt,
                      sourceStageId,
                      qualificationCount: 2,
                      reason,
                    }),
                  )
                }
              >
                Import qualifiers
              </Button>
              <Button
                size="sm"
                disabled={busy}
                onClick={() =>
                  run(async () => {
                    const res = await commissionerPost<{ item: unknown }>(
                      `/api/commissioner/competition-stages/${stageId}/bracket-preview`,
                      { seed },
                    );
                    setPreview(res.item);
                  })
                }
              >
                Preview bracket
              </Button>
              <Button
                size="sm"
                disabled={busy}
                onClick={() => {
                  if (!window.confirm('Generate playoff bracket and first games?')) return;
                  void run(() =>
                    commissionerPost(`/api/commissioner/competition-stages/${stageId}/generate-bracket`, {
                      expectedUpdatedAt: stageUpdatedAt,
                      seed,
                      reason,
                    }),
                  );
                }}
              >
                Generate bracket
              </Button>
            </>
          )}
          <Button
            size="sm"
            disabled={busy}
            onClick={() => {
              if (
                !window.confirm(
                  'Simulate all remaining playoffs? Backup is created before the first playoff game. Completed games remain official on cancel.',
                )
              )
                return;
              void run(async () => {
                await postJson(`/api/competition-stages/${stageId}/simulate-playoffs`, {
                  baseSeed: seed,
                });
              });
            }}
          >
            Simulate all playoffs
          </Button>
        </div>

        {commissioner.enabled && (
          <div style={{ marginTop: 12, display: 'grid', gap: 8, maxWidth: 420 }}>
            <Field label="Seed">
              <TextInput value={seed} onChange={(e) => setSeed(e.target.value)} />
            </Field>
            <Field label="Reason">
              <TextInput value={reason} onChange={(e) => setReason(e.target.value)} />
            </Field>
          </div>
        )}

        {preview && (
          <pre style={{ font: 'var(--text-body-sm)', whiteSpace: 'pre-wrap', marginTop: 12 }}>
            {JSON.stringify(
              { bracketHash: preview.bracketHash, diagnostics: preview.diagnostics, persisted: preview.persisted },
              null,
              2,
            )}
          </pre>
        )}
      </Panel>

      <Panel title="Bracket">
        {!rounds.length ? (
          <EmptyState title="No bracket" description="Import qualifiers and generate a bracket (Commissioner)." />
        ) : (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
              gap: 12,
            }}
          >
            {rounds.map((round) => (
              <div key={round.roundNumber}>
                <strong style={{ font: 'var(--text-body-sm)' }}>{round.roundName}</strong>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 8 }}>
                  {round.series.map((s) => (
                    <div
                      key={s.id}
                      style={{
                        border: '1px solid var(--border-subtle)',
                        padding: 10,
                        borderRadius: 4,
                        font: 'var(--text-body-sm)',
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                        <span>
                          #{s.participant1.seed} {s.participant1.name}
                        </span>
                        <span>{s.participant1.wins}</span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                        <span>
                          #{s.participant2.seed} {s.participant2.name}
                        </span>
                        <span>{s.participant2.wins}</span>
                      </div>
                      <div style={{ marginTop: 6, color: 'var(--text-tertiary)' }}>
                        <Badge tone="neutral">{s.status}</Badge> · best of {s.winsRequired * 2 - 1} (
                        first to {s.winsRequired})
                        {s.nextGame ? (
                          <>
                            {' '}
                            · <Link to={`/matches/${s.nextGame.id}`}>Game {s.nextGame.gameNumber}</Link>
                          </>
                        ) : null}
                      </div>
                      {s.status !== 'COMPLETED' && (
                        <Button
                          size="sm"
                          style={{ marginTop: 8 }}
                          disabled={busy}
                          onClick={() =>
                            run(() =>
                              postJson(`/api/playoff-series/${s.id}/simulate-series`, { baseSeed: seed }),
                            )
                          }
                        >
                          Simulate series
                        </Button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
        <p style={{ font: 'var(--text-body-sm)', color: 'var(--text-tertiary)', marginTop: 12 }}>
          Awards and archive remain future milestones. Edition completion is a separate Commissioner action when
          readiness passes.
        </p>
      </Panel>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: 'flex', gap: 12, font: 'var(--text-body-sm)', marginBottom: 4 }}>
      <span style={{ color: 'var(--text-tertiary)', minWidth: 120 }}>{label}</span>
      <span>{value}</span>
    </div>
  );
}
