import { useCallback, useEffect, useMemo, useState, type CSSProperties } from 'react';
import { Link, useParams } from 'react-router-dom';
import { PageHeader } from '../components/layout/PageHeader';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import {
  DataRow,
  DataTable,
  Field,
  Pagination,
  SelectInput,
  Td,
  TextInput,
} from '../components/ui/DataBrowser';
import { ErrorState, LoadingState } from '../components/ui/EmptyState';
import { Dialog } from '../components/ui/Dialog';
import { Panel } from '../components/ui/Panel';
import { useCommissioner } from '../lib/commissioner';
import {
  formatDecisionLabel,
  formatDisplayScore,
  formatPersistedMatchEvent,
} from '../lib/match-format';
import {
  getMatch,
  getMatchAttempts,
  getMatchEvents,
  getMatchResult,
  resimulateMatch,
  type MatchAttemptItem,
  type MatchDetail,
  type MatchEventItem,
  type MatchResultDetail,
  type Paginated,
} from '../lib/api';

type TabId = 'overview' | 'events' | 'teams' | 'players' | 'goalies' | 'metadata';

function tabStyle(active: boolean): CSSProperties {
  return {
    padding: '8px 12px',
    border: 'none',
    borderBottom: active ? '2px solid var(--accent-primary)' : '2px solid transparent',
    background: 'transparent',
    color: active ? 'var(--accent-primary)' : 'var(--text-secondary)',
    font: active ? '600 var(--text-size-sm)/1 var(--font-sans)' : 'var(--text-body-sm)',
    cursor: 'pointer',
  };
}

export function MatchDetailPage() {
  const { matchId = '' } = useParams();
  const { enabled: commissionerEnabled } = useCommissioner();
  const [match, setMatch] = useState<MatchDetail | null>(null);
  const [result, setResult] = useState<MatchResultDetail | null>(null);
  const [events, setEvents] = useState<Paginated<MatchEventItem> | null>(null);
  const [attempts, setAttempts] = useState<Paginated<MatchAttemptItem> | null>(null);
  const [tab, setTab] = useState<TabId>('overview');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [eventPage, setEventPage] = useState(1);
  const [eventPeriod, setEventPeriod] = useState('');
  const [eventType, setEventType] = useState('');
  const [resimOpen, setResimOpen] = useState(false);
  const [resimSeed, setResimSeed] = useState('');
  const [resimReason, setResimReason] = useState('Commissioner resimulation');
  const [resimBusy, setResimBusy] = useState(false);
  const [resimError, setResimError] = useState<string | null>(null);

  const reload = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    setError(null);
    setNotFound(false);
    try {
      const matchRes = await getMatch(matchId, signal);
      setMatch(matchRes.item);
      if (matchRes.item.status === 'COMPLETED') {
        const [resultRes, eventsRes] = await Promise.all([
          getMatchResult(matchId, signal),
          getMatchEvents(matchId, { page: 1, pageSize: 50 }, signal),
        ]);
        setResult(resultRes.item);
        setEvents(eventsRes);
        if (commissionerEnabled) {
          const attemptsRes = await getMatchAttempts(matchId, { page: 1, pageSize: 20 }, signal);
          setAttempts(attemptsRes);
        } else {
          setAttempts(null);
        }
      } else {
        setResult(null);
        setEvents(null);
        setAttempts(null);
      }
    } catch (err: unknown) {
      const status = (err as Error & { status?: number }).status;
      if (status === 404) {
        setNotFound(true);
      } else {
        setError(err instanceof Error ? err.message : 'Failed to load match');
      }
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, [matchId, commissionerEnabled]);

  useEffect(() => {
    const controller = new AbortController();
    void reload(controller.signal);
    return () => controller.abort();
  }, [reload]);

  useEffect(() => {
    if (match?.status !== 'COMPLETED' || tab !== 'events') return;
    const controller = new AbortController();
    getMatchEvents(
      matchId,
      {
        page: eventPage,
        pageSize: 50,
        period: eventPeriod ? Number(eventPeriod) : undefined,
        eventType: eventType || undefined,
      },
      controller.signal,
    )
      .then(setEvents)
      .catch(() => undefined);
    return () => controller.abort();
  }, [matchId, match?.status, tab, eventPage, eventPeriod, eventType]);

  const goalies = useMemo(
    () => (result?.playerStats ?? []).filter((p) => p.position === 'G' || p.stats.role === 'GOALIE'),
    [result],
  );

  const skaters = useMemo(
    () => (result?.playerStats ?? []).filter((p) => p.position !== 'G' && p.stats.role !== 'GOALIE'),
    [result],
  );

  const runResimulation = async () => {
    if (!result || !match?.currentResultId) return;
    setResimBusy(true);
    setResimError(null);
    try {
      await resimulateMatch(matchId, {
        expectedCurrentResultId: match.currentResultId,
        reason: resimReason.trim() || 'Commissioner resimulation',
        inputMode: 'ORIGINAL',
        ...(resimSeed.trim() ? { seed: resimSeed.trim() } : {}),
      });
      setResimOpen(false);
      setEventPage(1);
      await reload();
    } catch (err: unknown) {
      setResimError(err instanceof Error ? err.message : 'Resimulation failed');
    } finally {
      setResimBusy(false);
    }
  };

  if (loading) return <LoadingState label="Loading match…" />;
  if (notFound) {
    return (
      <div style={{ padding: 20 }}>
        <ErrorState description="Match not found" />
        <Link to="/matches">Back to matches</Link>
      </div>
    );
  }
  if (error || !match) return <ErrorState description={error ?? 'Failed to load match'} />;

  const scoreboard =
    result &&
    formatDisplayScore(result.score.home, result.score.away, result.decisionType);

  return (
    <div style={{ padding: 20 }}>
      <PageHeader
        title={`${match.awayTeamName} @ ${match.homeTeamName}`}
        subtitle="Persisted match result"
        badge={match.status === 'COMPLETED' ? 'Persisted' : match.status}
        actions={
          commissionerEnabled && match.status === 'COMPLETED' ? (
            <Button variant="danger" onClick={() => setResimOpen(true)}>
              Resimulate
            </Button>
          ) : undefined
        }
      />

      {match.status !== 'COMPLETED' && (
        <Panel>
          <p style={{ margin: 0 }}>
            Match status: <strong>{match.status}</strong>.{' '}
            {match.status === 'PREPARED' && (
              <Link to="/matches/new">Simulate from New Match</Link>
            )}
          </p>
        </Panel>
      )}

      {result && (
        <>
          <Panel>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr auto 1fr',
                gap: 16,
                alignItems: 'center',
                textAlign: 'center',
              }}
            >
              <div>
                <div style={{ font: 'var(--text-data-sm)', color: 'var(--text-tertiary)' }}>Away</div>
                <div style={{ fontSize: 22, fontWeight: 700 }}>{result.awayTeam.name}</div>
                <div style={{ fontSize: 36, fontWeight: 800 }}>{result.score.away}</div>
              </div>
              <div>
                <div style={{ fontSize: 28, fontWeight: 800 }}>{scoreboard}</div>
                <Badge tone="success">{formatDecisionLabel(result.decisionType)}</Badge>
                {result.winnerTeamId && (
                  <div style={{ marginTop: 6, font: 'var(--text-body-sm)', color: 'var(--text-secondary)' }}>
                    Winner:{' '}
                    {result.winnerTeamId === result.homeTeam.id
                      ? result.homeTeam.name
                      : result.awayTeam.name}
                  </div>
                )}
              </div>
              <div>
                <div style={{ font: 'var(--text-data-sm)', color: 'var(--text-tertiary)' }}>Home</div>
                <div style={{ fontSize: 22, fontWeight: 700 }}>{result.homeTeam.name}</div>
                <div style={{ fontSize: 36, fontWeight: 800 }}>{result.score.home}</div>
              </div>
            </div>

            <div
              style={{
                marginTop: 16,
                display: 'flex',
                gap: 16,
                flexWrap: 'wrap',
                font: 'var(--text-body-sm)',
                color: 'var(--text-secondary)',
              }}
            >
              <span>
                Regulation: {result.score.homeRegulation}–{result.score.awayRegulation}
              </span>
              {(result.score.homeOvertime > 0 || result.score.awayOvertime > 0) && (
                <span>
                  OT goals: {result.score.homeOvertime}–{result.score.awayOvertime}
                </span>
              )}
              {(result.score.homeShootout > 0 ||
                result.score.awayShootout > 0 ||
                result.decisionType === 'SHOOTOUT') && (
                <span>
                  Shootout: {result.score.homeShootout}–{result.score.awayShootout}
                </span>
              )}
            </div>
          </Panel>

          <div style={{ display: 'flex', gap: 4, borderBottom: '1px solid var(--border-subtle)', marginTop: 16 }}>
            {(
              [
                ['overview', 'Overview'],
                ['events', 'Events'],
                ['teams', 'Team stats'],
                ['players', 'Player stats'],
                ['goalies', 'Goalies'],
                ['metadata', 'Technical'],
              ] as const
            ).map(([id, label]) => (
              <button key={id} type="button" style={tabStyle(tab === id)} onClick={() => setTab(id)}>
                {label}
              </button>
            ))}
          </div>

          {tab === 'overview' && (
            <Panel style={{ marginTop: 16 }}>
              <div style={{ display: 'grid', gap: 8, font: 'var(--text-body-sm)' }}>
                <div>
                  <strong>Result ID:</strong>{' '}
                  <span style={{ fontFamily: 'var(--font-mono)' }}>{result.resultId}</span>
                </div>
                <div>
                  <strong>Attempt:</strong> #{result.attemptNumber}
                </div>
                <div>
                  <strong>Completed:</strong>{' '}
                  {result.completedAt ? new Date(result.completedAt).toLocaleString() : '—'}
                </div>
                <div>
                  <strong>Reconciliation:</strong>{' '}
                  {result.reconciliation?.ok ? (
                    <Badge tone="success">OK</Badge>
                  ) : (
                    <Badge tone="danger">Failed</Badge>
                  )}
                </div>
              </div>
            </Panel>
          )}

          {tab === 'events' && events && (
            <Panel style={{ marginTop: 16 }}>
              <div style={{ display: 'flex', gap: 12, marginBottom: 12, flexWrap: 'wrap' }}>
                <Field label="Period" htmlFor="event-period">
                  <SelectInput
                    id="event-period"
                    value={eventPeriod}
                    onChange={(e) => {
                      setEventPeriod(e.target.value);
                      setEventPage(1);
                    }}
                  >
                    <option value="">All</option>
                    {[1, 2, 3, 4, 5].map((p) => (
                      <option key={p} value={String(p)}>
                        P{p}
                      </option>
                    ))}
                  </SelectInput>
                </Field>
                <Field label="Event type" htmlFor="event-type">
                  <TextInput
                    id="event-type"
                    value={eventType}
                    placeholder="e.g. GOAL"
                    onChange={(e) => {
                      setEventType(e.target.value);
                      setEventPage(1);
                    }}
                  />
                </Field>
              </div>
              <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'grid', gap: 6 }}>
                {events.items.map((ev) => (
                  <li
                    key={ev.id}
                    style={{
                      padding: '8px 10px',
                      borderRadius: 'var(--radius-sm)',
                      background: 'var(--surface-subtle)',
                      font: 'var(--text-body-sm)',
                    }}
                  >
                    {formatPersistedMatchEvent(ev)}
                  </li>
                ))}
              </ul>
              <Pagination
                page={events.page}
                totalPages={events.totalPages}
                total={events.total}
                onPage={setEventPage}
              />
            </Panel>
          )}

          {tab === 'teams' && (
            <Panel style={{ marginTop: 16 }}>
              <DataTable
                headers={[
                  { key: 'team', label: 'Team' },
                  { key: 'g', label: 'G' },
                  { key: 'sog', label: 'SOG' },
                  { key: 'pim', label: 'PIM' },
                  { key: 'ppg', label: 'PPG' },
                  { key: 'shg', label: 'SHG' },
                  { key: 'so', label: 'SO att' },
                ]}
              >
                {result.teamStats.map((row) => (
                  <DataRow key={row.teamId}>
                    <Td primary>{row.teamName ?? row.teamId}</Td>
                    <Td>{row.goals}</Td>
                    <Td>{row.shotsOnGoal}</Td>
                    <Td>{row.penaltyMinutes}</Td>
                    <Td>{row.powerPlayGoals}</Td>
                    <Td>{row.shortHandedGoals}</Td>
                    <Td>
                      {row.shootoutGoals}/{row.shootoutAttempts}
                    </Td>
                  </DataRow>
                ))}
              </DataTable>
            </Panel>
          )}

          {tab === 'players' && (
            <Panel style={{ marginTop: 16 }}>
              <DataTable
                headers={[
                  { key: 'player', label: 'Player' },
                  { key: 'pos', label: 'Pos' },
                  { key: 'g', label: 'G' },
                  { key: 'a', label: 'A' },
                  { key: 'p', label: 'P' },
                  { key: 'sog', label: 'SOG' },
                  { key: 'pim', label: 'PIM' },
                ]}
              >
                {skaters.map((row) => (
                  <DataRow key={row.playerId}>
                    <Td primary>
                      {[row.firstName, row.lastName].filter(Boolean).join(' ') || row.playerId.slice(0, 8)}
                    </Td>
                    <Td>{row.position}</Td>
                    <Td>{row.goals}</Td>
                    <Td>{row.assists}</Td>
                    <Td>{row.points}</Td>
                    <Td>{row.shotsOnGoal}</Td>
                    <Td>{row.penaltyMinutes}</Td>
                  </DataRow>
                ))}
              </DataTable>
            </Panel>
          )}

          {tab === 'goalies' && (
            <Panel style={{ marginTop: 16 }}>
              <DataTable
                headers={[
                  { key: 'goalie', label: 'Goalie' },
                  { key: 'sa', label: 'SA' },
                  { key: 'sv', label: 'SV' },
                  { key: 'ga', label: 'GA' },
                ]}
              >
                {goalies.map((row) => {
                  const g = row.stats as { shotsAgainst?: number; saves?: number; goalsAgainst?: number };
                  return (
                    <DataRow key={row.playerId}>
                      <Td primary>
                        {[row.firstName, row.lastName].filter(Boolean).join(' ') || row.playerId.slice(0, 8)}
                      </Td>
                      <Td>{g.shotsAgainst ?? '—'}</Td>
                      <Td>{g.saves ?? '—'}</Td>
                      <Td>{g.goalsAgainst ?? row.goals}</Td>
                    </DataRow>
                  );
                })}
              </DataTable>
            </Panel>
          )}

          {tab === 'metadata' && (
            <Panel style={{ marginTop: 16 }}>
              <div style={{ display: 'grid', gap: 8, font: 'var(--text-body-sm)' }}>
                <div>
                  <strong>Engine:</strong> {result.engineVersion} ({result.simulationMode})
                </div>
                <div>
                  <strong>Seed:</strong>{' '}
                  <span style={{ fontFamily: 'var(--font-mono)' }}>{result.randomSeed}</span>
                </div>
                <div>
                  <strong>Input fingerprint:</strong>{' '}
                  <span style={{ fontFamily: 'var(--font-mono)' }}>{result.inputFingerprint}</span>
                </div>
                <div>
                  <strong>Trace hash:</strong>{' '}
                  <span style={{ fontFamily: 'var(--font-mono)' }}>{result.traceHash}</span>
                </div>
                <div>
                  <strong>Balance:</strong> v{result.balance.versionNumber} ·{' '}
                  <span style={{ fontFamily: 'var(--font-mono)' }}>{result.balance.configHash.slice(0, 16)}…</span>
                </div>
              </div>
            </Panel>
          )}

          {commissionerEnabled && attempts && attempts.items.length > 0 && (
            <Panel title="Attempt history (Commissioner)" style={{ marginTop: 16 }}>
              <DataTable
                headers={[
                  { key: 'attempt', label: '#' },
                  { key: 'status', label: 'Status' },
                  { key: 'score', label: 'Score' },
                  { key: 'decision', label: 'Decision' },
                  { key: 'seed', label: 'Seed' },
                  { key: 'completed', label: 'Completed' },
                ]}
              >
                {attempts.items.map((row) => (
                  <DataRow key={row.id}>
                    <Td primary>
                      #{row.attemptNumber}
                      {row.id === match.currentResultId ? (
                        <span style={{ marginLeft: 6 }}>
                          <Badge tone="success">Current</Badge>
                        </span>
                      ) : null}
                    </Td>
                    <Td>{row.status}</Td>
                    <Td>{formatDisplayScore(row.homeScore, row.awayScore, row.decisionType)}</Td>
                    <Td>{formatDecisionLabel(row.decisionType)}</Td>
                    <Td>
                      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }}>
                        {row.randomSeed.slice(0, 12)}
                      </span>
                    </Td>
                    <Td>{row.completedAt ? new Date(row.completedAt).toLocaleString() : '—'}</Td>
                  </DataRow>
                ))}
              </DataTable>
            </Panel>
          )}
        </>
      )}

      <p style={{ marginTop: 16 }}>
        <Link to="/matches">← Back to matches</Link>
      </p>

      <Dialog
        open={resimOpen}
        title="Resimulate match?"
        confirmLabel="Resimulate with new seed"
        confirmVariant="danger"
        busy={resimBusy}
        onClose={() => setResimOpen(false)}
        onConfirm={() => void runResimulation()}
      >
        <p style={{ margin: '0 0 8px' }}>
          The current result will be <strong>superseded</strong>, not deleted. The original immutable simulation
          input is reused; only the seed changes. Standings are not affected in F14.
        </p>
        <Field label="Reason" htmlFor="resim-reason">
          <TextInput id="resim-reason" value={resimReason} onChange={(e) => setResimReason(e.target.value)} />
        </Field>
        <Field label="New seed (optional)" htmlFor="resim-seed">
          <TextInput
            id="resim-seed"
            value={resimSeed}
            placeholder="Leave blank for server-generated seed"
            onChange={(e) => setResimSeed(e.target.value)}
          />
        </Field>
        {resimError && (
          <p style={{ color: 'var(--status-danger)', marginTop: 8 }} role="alert">
            {resimError}
          </p>
        )}
      </Dialog>
    </div>
  );
}
