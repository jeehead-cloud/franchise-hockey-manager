import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Badge } from '../ui/Badge';
import { Button } from '../ui/Button';
import { EmptyState, ErrorState, LoadingState } from '../ui/EmptyState';
import { Panel } from '../ui/Panel';
import { Field, SelectInput, TextInput } from '../ui/DataBrowser';
import { useCommissioner } from '../../lib/commissioner';
import {
  cancelInternationalSimulation,
  generateInternationalSchedule,
  getInternationalSimulationRun,
  getInternationalTournamentGroups,
  getInternationalTournamentMedals,
  getInternationalTournamentOverview,
  getInternationalTournamentProgress,
  prepareInternationalTournament,
  previewInternationalTournament,
  simulateInternationalTournament,
} from '../../lib/api';

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: 'flex', gap: 12, font: 'var(--text-body-sm)', marginBottom: 4 }}>
      <span style={{ color: 'var(--text-tertiary)', minWidth: 160 }}>{label}</span>
      <span>{value}</span>
    </div>
  );
}

export function InternationalTournamentPanel({
  editionId,
  editionUpdatedAt,
  onChanged,
}: {
  editionId: string;
  editionUpdatedAt: string;
  onChanged?: () => void;
}) {
  const commissioner = useCommissioner();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [overview, setOverview] = useState<Record<string, unknown> | null>(null);
  const [groups, setGroups] = useState<Record<string, unknown> | null>(null);
  const [medals, setMedals] = useState<unknown[]>([]);
  const [progress, setProgress] = useState<Record<string, unknown> | null>(null);
  const [preview, setPreview] = useState<Record<string, unknown> | null>(null);
  const [run, setRun] = useState<Record<string, unknown> | null>(null);
  const [templateKey, setTemplateKey] = useState('WORLD_CHAMPIONSHIP');
  const [seed, setSeed] = useState('intl-2026');
  const [reason, setReason] = useState('Prepare international tournament');

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [ov, gr, md, pr] = await Promise.all([
        getInternationalTournamentOverview(editionId).catch(() => null),
        getInternationalTournamentGroups(editionId).catch(() => null),
        getInternationalTournamentMedals(editionId).catch(() => null),
        getInternationalTournamentProgress(editionId).catch(() => null),
      ]);
      setOverview((ov?.item as Record<string, unknown>) ?? null);
      setGroups((gr?.item as Record<string, unknown>) ?? null);
      const medalPayload = md?.item as { items?: unknown[] } | unknown[] | undefined;
      setMedals(
        Array.isArray(medalPayload)
          ? medalPayload
          : ((medalPayload as { items?: unknown[] } | undefined)?.items ?? []),
      );
      setProgress((pr?.item as Record<string, unknown>) ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load tournament');
    } finally {
      setLoading(false);
    }
  }, [editionId]);

  useEffect(() => {
    void reload();
  }, [reload, editionUpdatedAt]);

  useEffect(() => {
    if (!run?.id || run.status === 'COMPLETED' || run.status === 'CANCELLED') return;
    const t = setInterval(() => {
      void getInternationalSimulationRun(editionId, String(run.id))
        .then((res) => {
          setRun(res.item);
          if (res.item.status === 'COMPLETED' || res.item.status === 'CANCELLED') {
            void reload();
            onChanged?.();
          }
        })
        .catch(() => undefined);
    }, 800);
    return () => clearInterval(t);
  }, [run?.id, run?.status, editionId, reload, onChanged]);

  async function runAction(fn: () => Promise<unknown>) {
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

  if (loading) return <LoadingState label="Loading tournament…" />;

  const groupTables = (groups?.standingsByGroup ?? groups?.groups ?? null) as
    | Record<string, unknown[]>
    | unknown[]
    | null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {error ? <ErrorState description={error} /> : null}

      <Panel title="Tournament overview">
        {overview ? (
          <>
            <Row label="Template" value={String(overview.tournamentTemplateKey ?? '—')} />
            <Row label="Category" value={String(overview.category ?? '—')} />
            <Row label="Status" value={String(overview.status ?? '—')} />
            <Row label="Phase" value={String(overview.phase ?? progress?.phase ?? '—')} />
            <Row
              label="Schedule hash"
              value={String(overview.tournamentScheduleHash ?? '—').slice(0, 16)}
            />
            <Row
              label="Bracket hash"
              value={String(overview.tournamentBracketHash ?? '—').slice(0, 16)}
            />
            <p style={{ font: 'var(--text-body-sm)', color: 'var(--text-secondary)' }}>
              Simplified development templates — not exact IIHF/IOC formats. Matches use locked F22
              national-team snapshots; club ownership is unchanged.
            </p>
          </>
        ) : (
          <EmptyState
            title="Not prepared"
            description="Preview and prepare an international tournament template for this edition."
          />
        )}
      </Panel>

      {commissioner.enabled ? (
        <Panel title="Commissioner controls">
          <div style={{ display: 'grid', gap: 8, maxWidth: 480 }}>
            <Field label="Template">
              <SelectInput value={templateKey} onChange={(e) => setTemplateKey(e.target.value)}>
                <option value="WORLD_JUNIORS">World Juniors (U20)</option>
                <option value="WORLD_CHAMPIONSHIP">World Championship</option>
                <option value="OLYMPIC_GAMES">Olympic Games</option>
              </SelectInput>
            </Field>
            <Field label="Base seed">
              <TextInput value={seed} onChange={(e) => setSeed(e.target.value)} />
            </Field>
            <Field label="Reason">
              <TextInput value={reason} onChange={(e) => setReason(e.target.value)} />
            </Field>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <Button
                type="button"
                disabled={busy}
                onClick={() =>
                  void runAction(async () => {
                    const res = await previewInternationalTournament(editionId, { templateKey });
                    setPreview(res.item);
                  })
                }
              >
                Preview
              </Button>
              <Button
                type="button"
                disabled={busy}
                onClick={() =>
                  void runAction(() =>
                    prepareInternationalTournament(editionId, {
                      expectedUpdatedAt: editionUpdatedAt,
                      reason,
                      templateKey,
                      baseSeed: seed,
                    }),
                  )
                }
              >
                Prepare
              </Button>
              <Button
                type="button"
                disabled={busy}
                onClick={() =>
                  void runAction(() =>
                    generateInternationalSchedule(editionId, {
                      expectedUpdatedAt: editionUpdatedAt,
                      reason: 'Generate international group schedule',
                      seed,
                    }),
                  )
                }
              >
                Generate Schedule
              </Button>
              <Button
                type="button"
                disabled={busy}
                onClick={() =>
                  void runAction(async () => {
                    const res = await simulateInternationalTournament(editionId, {
                      baseSeed: seed,
                      confirmBackup: true,
                    });
                    setRun(res.item);
                  })
                }
              >
                Simulate Tournament
              </Button>
              {run?.id && run.status !== 'COMPLETED' && run.status !== 'CANCELLED' ? (
                <Button
                  type="button"
                  variant="secondary"
                  disabled={busy}
                  onClick={() =>
                    void runAction(async () => {
                      await cancelInternationalSimulation(editionId, String(run.id));
                      setRun(null);
                    })
                  }
                >
                  Cancel Run
                </Button>
              ) : null}
            </div>
          </div>
          {preview ? (
            <pre style={{ font: 'var(--text-body-sm)', whiteSpace: 'pre-wrap', marginTop: 12 }}>
              {JSON.stringify(
                {
                  matchCount: preview.matchCount,
                  scheduleHash: preview.scheduleHash,
                  warnings: preview.warnings,
                  lockedCount: preview.lockedCount,
                },
                null,
                2,
              )}
            </pre>
          ) : null}
          {run ? (
            <div style={{ marginTop: 12 }}>
              <Badge tone="info">Run {String(run.status)}</Badge>
              <Row label="Progress" value={String(run.progressLabel ?? run.completedMatches ?? '—')} />
            </div>
          ) : null}
        </Panel>
      ) : null}

      <Panel title="Groups">
        {!groupTables ? (
          <EmptyState title="No groups yet" description="Generate the group schedule first." />
        ) : Array.isArray(groupTables) ? (
          <ul style={{ margin: 0, paddingLeft: 18, font: 'var(--text-body-sm)' }}>
            {groupTables.map((g, i) => (
              <li key={i}>{JSON.stringify(g)}</li>
            ))}
          </ul>
        ) : (
          Object.entries(groupTables).map(([key, rows]) => (
            <div key={key} style={{ marginBottom: 16 }}>
              <div style={{ font: 'var(--text-heading-sm)', marginBottom: 8 }}>Group {key}</div>
              <div style={{ overflowX: 'auto' }}>
                <table
                  style={{ width: '100%', borderCollapse: 'collapse', font: 'var(--text-body-sm)' }}
                >
                  <thead>
                    <tr>
                      <th align="left">#</th>
                      <th align="left">Team</th>
                      <th align="left">GP</th>
                      <th align="left">PTS</th>
                      <th align="left">GF</th>
                      <th align="left">GA</th>
                      <th align="left">Qual</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(rows as Array<Record<string, unknown>>).map((r) => (
                      <tr key={String(r.participantId ?? r.teamId ?? r.rank)}>
                        <td>{String(r.rank ?? '—')}</td>
                        <td>{String(r.teamNameSnapshot ?? r.participantId ?? '—')}</td>
                        <td>{String(r.gamesPlayed ?? '—')}</td>
                        <td>{String(r.points ?? '—')}</td>
                        <td>{String(r.goalsFor ?? '—')}</td>
                        <td>{String(r.goalsAgainst ?? '—')}</td>
                        <td>{r.qualified ? '✓' : ''}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))
        )}
      </Panel>

      <Panel title="Medals">
        {medals.length === 0 ? (
          <EmptyState title="No medals yet" description="Complete the knockout stage." />
        ) : (
          <ul style={{ margin: 0, paddingLeft: 18, font: 'var(--text-body-sm)' }}>
            {medals.map((raw) => {
              const m = raw as Record<string, unknown>;
              return (
                <li key={String(m.id ?? m.medalType)}>
                  <Badge tone="success">{String(m.medalType)}</Badge>{' '}
                  {String(m.teamNameSnapshot ?? m.competitionParticipantId)} ·{' '}
                  {String(m.countryNameSnapshot ?? '')}
                </li>
              );
            })}
          </ul>
        )}
      </Panel>

      <p style={{ margin: 0, font: 'var(--text-body-sm)' }}>
        Match results open in the <Link to={`/matches`}>Matches</Link> viewer (F15).
      </p>
    </div>
  );
}
