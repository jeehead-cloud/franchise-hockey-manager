import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { PageHeader } from '../components/layout/PageHeader';
import { GoalieStatsTable } from '../components/match/GoalieStatsTable';
import { LineUsagePanel } from '../components/match/LineUsagePanel';
import { MatchAttemptsPanel } from '../components/match/MatchAttemptsPanel';
import { MatchDiagnosticsPanel } from '../components/match/MatchDiagnosticsPanel';
import { MatchEventFeed } from '../components/match/MatchEventFeed';
import { MatchMetadataCard } from '../components/match/MatchMetadataCard';
import { MatchResimulateDialog } from '../components/match/MatchResimulateDialog';
import { MatchScoreboard } from '../components/match/MatchScoreboard';
import { PeriodScoreTable } from '../components/match/PeriodScoreTable';
import { ReconciliationPanel } from '../components/match/ReconciliationPanel';
import { ScoringSummary } from '../components/match/ScoringSummary';
import { SkaterStatsTable } from '../components/match/SkaterStatsTable';
import { TeamComparison } from '../components/match/TeamComparison';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { ErrorState, LoadingState } from '../components/ui/EmptyState';
import { Panel } from '../components/ui/Panel';
import { Tabs } from '../components/ui/Tabs';
import { useCommissioner } from '../lib/commissioner';
import {
  exportMatchDiagnosticsJson,
  exportMatchEventsCsv,
  exportMatchPlayerStatsCsv,
  exportMatchResultJson,
  exportMatchTeamStatsCsv,
  getMatchAttempts,
  getMatchAudit,
  getMatchDiagnostics,
  getMatchEventsView,
  getMatchOverview,
  resimulateMatch,
  simulateMatch,
  type MatchAttemptItem,
  type MatchAuditItem,
  type MatchDiagnostics,
  type MatchEventViewPage,
  type MatchOverview,
  type Paginated,
} from '../lib/api';

type TabId =
  | 'overview'
  | 'events'
  | 'teams'
  | 'players'
  | 'goalies'
  | 'lines'
  | 'diagnostics'
  | 'attempts';

const PUBLIC_TABS: { value: TabId; label: string }[] = [
  { value: 'overview', label: 'Overview' },
  { value: 'events', label: 'Events' },
  { value: 'teams', label: 'Team Statistics' },
  { value: 'players', label: 'Player Statistics' },
  { value: 'goalies', label: 'Goalies' },
  { value: 'lines', label: 'Lines & Usage' },
];

const COMMISSIONER_TABS: { value: TabId; label: string }[] = [
  { value: 'diagnostics', label: 'Diagnostics' },
  { value: 'attempts', label: 'Attempts' },
];

function parseTab(raw: string | null, commissioner: boolean): TabId {
  const allowed = new Set<string>([
    ...PUBLIC_TABS.map((t) => t.value),
    ...(commissioner ? COMMISSIONER_TABS.map((t) => t.value) : []),
  ]);
  if (raw && allowed.has(raw)) return raw as TabId;
  return 'overview';
}

export function MatchDetailPage() {
  const { matchId = '' } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const { enabled: commissionerEnabled } = useCommissioner();

  const tab = parseTab(searchParams.get('tab'), commissionerEnabled);
  const resultId = searchParams.get('resultId');
  const period = searchParams.get('period') ?? '';
  const category = searchParams.get('category') ?? '';
  const teamId = searchParams.get('teamId') ?? '';
  const eventsPage = Number(searchParams.get('eventsPage') || '1') || 1;

  const [overview, setOverview] = useState<MatchOverview | null>(null);
  const [events, setEvents] = useState<MatchEventViewPage | null>(null);
  const [eventsLoading, setEventsLoading] = useState(false);
  const [attempts, setAttempts] = useState<Paginated<MatchAttemptItem> | null>(null);
  const [attemptsPage, setAttemptsPage] = useState(1);
  const [diagnostics, setDiagnostics] = useState<MatchDiagnostics | null>(null);
  const [diagnosticsError, setDiagnosticsError] = useState<string | null>(null);
  const [audit, setAudit] = useState<Paginated<MatchAuditItem> | null>(null);
  const [auditPage, setAuditPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const [simulateBusy, setSimulateBusy] = useState(false);
  const [resimOpen, setResimOpen] = useState(false);
  const [resimSeed, setResimSeed] = useState('');
  const [resimReason, setResimReason] = useState('Commissioner resimulation');
  const [resimBusy, setResimBusy] = useState(false);
  const [resimError, setResimError] = useState<string | null>(null);

  const setParam = useCallback(
    (patch: Record<string, string | null | undefined>, replace = false) => {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          for (const [key, value] of Object.entries(patch)) {
            if (value == null || value === '') next.delete(key);
            else next.set(key, value);
          }
          return next;
        },
        { replace },
      );
    },
    [setSearchParams],
  );

  const reloadOverview = useCallback(
    async (signal?: AbortSignal, overrideResultId?: string | null) => {
      setLoading(true);
      setError(null);
      setNotFound(false);
      try {
        const resolvedResultId =
          overrideResultId !== undefined ? overrideResultId : resultId;
        const res = await getMatchOverview(
          matchId,
          { resultId: resolvedResultId },
          signal,
        );
        setOverview(res.item);
      } catch (err: unknown) {
        if (signal?.aborted) return;
        const status = (err as Error & { status?: number }).status;
        if (status === 404) setNotFound(true);
        else setError(err instanceof Error ? err.message : 'Failed to load match');
      } finally {
        if (!signal?.aborted) setLoading(false);
      }
    },
    [matchId, resultId],
  );

  useEffect(() => {
    const controller = new AbortController();
    void reloadOverview(controller.signal);
    return () => controller.abort();
  }, [reloadOverview]);

  useEffect(() => {
    if (!overview || overview.prepared || !overview.result) {
      setEvents(null);
      return;
    }
    if (tab !== 'events') return;
    const controller = new AbortController();
    setEventsLoading(true);
    getMatchEventsView(
      matchId,
      {
        page: eventsPage,
        pageSize: 50,
        period: period || undefined,
        category: category || undefined,
        teamId: teamId || undefined,
        resultId: resultId || undefined,
        visibility: 'PUBLIC',
        format: 'view',
      },
      controller.signal,
    )
      .then((res) => {
        if (!controller.signal.aborted) setEvents(res);
      })
      .catch(() => {
        if (!controller.signal.aborted) setEvents(null);
      })
      .finally(() => {
        if (!controller.signal.aborted) setEventsLoading(false);
      });
    return () => controller.abort();
  }, [overview, matchId, tab, eventsPage, period, category, teamId, resultId]);

  useEffect(() => {
    if (!commissionerEnabled || !overview || overview.prepared) {
      setAttempts(null);
      return;
    }
    if (tab !== 'attempts' && tab !== 'overview') return;
    const controller = new AbortController();
    getMatchAttempts(matchId, { page: attemptsPage, pageSize: 20 }, controller.signal)
      .then((res) => {
        if (!controller.signal.aborted) setAttempts(res);
      })
      .catch(() => undefined);
    return () => controller.abort();
  }, [commissionerEnabled, overview, matchId, tab, attemptsPage]);

  useEffect(() => {
    if (!commissionerEnabled || !overview || overview.prepared || !overview.result) {
      setDiagnostics(null);
      setAudit(null);
      return;
    }
    if (tab !== 'diagnostics' && tab !== 'overview') return;
    const controller = new AbortController();
    setDiagnosticsError(null);
    getMatchDiagnostics(matchId, { resultId: resultId || overview.result.resultId }, controller.signal)
      .then((res) => {
        if (!controller.signal.aborted) setDiagnostics(res.item);
      })
      .catch((err: unknown) => {
        if (!controller.signal.aborted) {
          setDiagnostics(null);
          setDiagnosticsError(err instanceof Error ? err.message : 'Failed to load diagnostics');
        }
      });
    getMatchAudit(matchId, { page: auditPage, pageSize: 20 }, controller.signal)
      .then((res) => {
        if (!controller.signal.aborted) setAudit(res);
      })
      .catch(() => undefined);
    return () => controller.abort();
  }, [commissionerEnabled, overview, matchId, tab, resultId, auditPage]);

  const tabItems = useMemo(() => {
    const items = [...PUBLIC_TABS];
    if (commissionerEnabled) items.push(...COMMISSIONER_TABS);
    return items;
  }, [commissionerEnabled]);

  const runSimulate = async () => {
    setSimulateBusy(true);
    setExportError(null);
    try {
      await simulateMatch(matchId, {});
      await reloadOverview();
    } catch (err: unknown) {
      setExportError(err instanceof Error ? err.message : 'Simulation failed');
    } finally {
      setSimulateBusy(false);
    }
  };

  const runResimulation = async () => {
    if (!overview?.currentResultId) return;
    setResimBusy(true);
    setResimError(null);
    try {
      await resimulateMatch(matchId, {
        expectedCurrentResultId: overview.currentResultId,
        reason: resimReason.trim() || 'Commissioner resimulation',
        inputMode: 'ORIGINAL',
        ...(resimSeed.trim() ? { seed: resimSeed.trim() } : {}),
      });
      setResimOpen(false);
      setParam({ resultId: null, eventsPage: '1' });
      await reloadOverview(undefined, null);
    } catch (err: unknown) {
      setResimError(err instanceof Error ? err.message : 'Resimulation failed');
    } finally {
      setResimBusy(false);
    }
  };

  const withExport = async (fn: () => Promise<void>) => {
    setExportError(null);
    try {
      await fn();
    } catch (err: unknown) {
      setExportError(err instanceof Error ? err.message : 'Export failed');
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
  if (error || !overview) return <ErrorState description={error ?? 'Failed to load match'} />;

  const result = overview.result;
  const title = `${overview.awayTeam.name} @ ${overview.homeTeam.name}`;
  const statusBadge = overview.prepared
    ? overview.status
    : overview.isCurrent
      ? 'Current'
      : 'Superseded';

  return (
    <div style={{ padding: 20 }}>
      <PageHeader
        title={title}
        subtitle={
          overview.competitionEdition
            ? overview.competitionEdition.displayName
            : overview.source === 'MANUAL'
              ? 'Manual match'
              : 'Competition match'
        }
        badge={statusBadge}
        actions={
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {result ? (
              <>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() =>
                    void withExport(() =>
                      exportMatchResultJson(matchId, { resultId: result.resultId }),
                    )
                  }
                >
                  Export result
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() =>
                    void withExport(() =>
                      exportMatchEventsCsv(matchId, { resultId: result.resultId }),
                    )
                  }
                >
                  Export events
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() =>
                    void withExport(() =>
                      exportMatchPlayerStatsCsv(matchId, { resultId: result.resultId }),
                    )
                  }
                >
                  Export player stats
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() =>
                    void withExport(() =>
                      exportMatchTeamStatsCsv(matchId, { resultId: result.resultId }),
                    )
                  }
                >
                  Export team stats
                </Button>
              </>
            ) : null}
            {commissionerEnabled && overview.status === 'COMPLETED' && overview.isCurrent ? (
              <Button variant="danger" onClick={() => setResimOpen(true)}>
                Resimulate
              </Button>
            ) : null}
          </div>
        }
      />

      {exportError ? (
        <div style={{ marginBottom: 12 }}>
          <ErrorState description={exportError} />
        </div>
      ) : null}

      {overview.prepared || !result ? (
        <Panel>
          <div style={{ display: 'grid', gap: 12 }}>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <span style={{ font: 'var(--text-body-sm)' }}>
                Match status: <strong>{overview.status}</strong>
              </span>
              <Badge tone="neutral">Prepared</Badge>
            </div>
            <p style={{ margin: 0, font: 'var(--text-body-sm)', color: 'var(--text-secondary)' }}>
              This match has no completed result yet. Simulate it here, or continue from the New Match
              flow.
            </p>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {overview.status === 'PREPARED' ? (
                <Button variant="primary" disabled={simulateBusy} onClick={() => void runSimulate()}>
                  {simulateBusy ? 'Simulating…' : 'Simulate match'}
                </Button>
              ) : null}
              <Link to="/matches/new">
                <Button variant="secondary">Open New Match</Button>
              </Link>
            </div>
          </div>
        </Panel>
      ) : (
        <>
          {!overview.isCurrent ? (
            <Panel style={{ marginBottom: 12 }}>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                <Badge tone="warning">Superseded result</Badge>
                <span style={{ font: 'var(--text-body-sm)', color: 'var(--text-secondary)' }}>
                  Viewing a historical attempt. Names below are from the simulation snapshot.
                </span>
                {overview.currentResultId ? (
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => setParam({ resultId: null })}
                  >
                    View current
                  </Button>
                ) : null}
              </div>
            </Panel>
          ) : (
            <div style={{ marginBottom: 12, display: 'flex', gap: 8, alignItems: 'center' }}>
              <Badge tone="success">Current result</Badge>
              <span style={{ font: 'var(--text-body-sm)', color: 'var(--text-tertiary)' }}>
                Attempt #{result.attemptNumber}
              </span>
            </div>
          )}

          <MatchScoreboard overview={overview} result={result} />

          <div style={{ marginTop: 16 }}>
            <Tabs
              items={tabItems}
              value={tab}
              onChange={(value) => setParam({ tab: value === 'overview' ? null : value })}
            />
          </div>

          <div style={{ marginTop: 16, display: 'grid', gap: 16 }}>
            {tab === 'overview' && (
              <>
                <PeriodScoreTable
                  periodScores={result.periodScores}
                  homeName={overview.homeTeam.name}
                  awayName={overview.awayTeam.name}
                  finalHome={result.score.home}
                  finalAway={result.score.away}
                />
                <ScoringSummary goals={result.scoringSummary} shootout={result.shootoutSummary} />
                <MatchMetadataCard metadata={result.metadata} />
                <ReconciliationPanel metadata={result.metadata} diagnostics={diagnostics} />
              </>
            )}

            {tab === 'events' && (
              <MatchEventFeed
                events={events}
                loading={eventsLoading}
                homeTeam={overview.homeTeam}
                awayTeam={overview.awayTeam}
                period={period}
                category={category}
                teamId={teamId}
                onPeriodChange={(value) => setParam({ period: value || null, eventsPage: '1' })}
                onCategoryChange={(value) => setParam({ category: value || null, eventsPage: '1' })}
                onTeamChange={(value) => setParam({ teamId: value || null, eventsPage: '1' })}
                onPageChange={(page) => setParam({ eventsPage: String(page) })}
              />
            )}

            {tab === 'teams' && (
              <TeamComparison
                home={result.teamComparison.home}
                away={result.teamComparison.away}
                homeName={overview.homeTeam.name}
                awayName={overview.awayTeam.name}
              />
            )}

            {tab === 'players' && <SkaterStatsTable skaters={result.skaters} />}

            {tab === 'goalies' && <GoalieStatsTable goalies={result.goalies} />}

            {tab === 'lines' && <LineUsagePanel lineUsage={result.lineUsage} />}

            {tab === 'diagnostics' && commissionerEnabled && (
              <MatchDiagnosticsPanel
                diagnostics={diagnostics}
                audit={audit}
                error={diagnosticsError}
                onExport={() =>
                  void withExport(() =>
                    exportMatchDiagnosticsJson(matchId, {
                      resultId: resultId || result.resultId,
                    }),
                  )
                }
                onAuditPage={setAuditPage}
              />
            )}

            {tab === 'attempts' && commissionerEnabled && (
              <MatchAttemptsPanel
                attempts={attempts}
                currentResultId={overview.currentResultId}
                selectedResultId={resultId || overview.currentResultId}
                onSelectResult={(id) =>
                  setParam({
                    resultId: id === overview.currentResultId ? null : id,
                    tab: 'overview',
                  })
                }
                onViewCurrent={() => setParam({ resultId: null })}
                onPageChange={setAttemptsPage}
              />
            )}
          </div>
        </>
      )}

      <p style={{ marginTop: 16 }}>
        <Link to="/matches">← Back to matches</Link>
      </p>

      <MatchResimulateDialog
        open={resimOpen}
        busy={resimBusy}
        error={resimError}
        reason={resimReason}
        seed={resimSeed}
        onReasonChange={setResimReason}
        onSeedChange={setResimSeed}
        onClose={() => setResimOpen(false)}
        onConfirm={() => void runResimulation()}
      />
    </div>
  );
}
