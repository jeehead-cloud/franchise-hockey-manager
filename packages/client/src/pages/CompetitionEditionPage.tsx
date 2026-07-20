import { useCallback, useEffect, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { PageHeader } from '../components/layout/PageHeader';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { EmptyState, ErrorState, LoadingState } from '../components/ui/EmptyState';
import { Panel } from '../components/ui/Panel';
import { BackLink, RecordNotFound } from '../components/ui/RecordStates';
import { Tabs } from '../components/ui/Tabs';
import { Field, SelectInput, TextInput } from '../components/ui/DataBrowser';
import { useCommissioner } from '../lib/commissioner';
import {
  addCompetitionParticipantsFromLeague,
  createCompetitionStage,
  getCompetitionEdition,
  getCompetitionEditionAudit,
  getLeagues,
  getNationalTeamEditions,
  getNationalTeams,
  prepareNationalTeamEdition,
  transitionCompetitionEdition,
  updateCompetitionEditionRules,
  type CompetitionEditionDetail,
  type LeagueItem,
} from '../lib/api';
import { RegularSeasonStagePanel } from '../components/competitions/RegularSeasonStagePanel';
import { AggregatedLeaguePanel } from '../components/competitions/AggregatedLeaguePanel';
import { PlayoffStagePanel } from '../components/competitions/PlayoffStagePanel';
import { ArchiveEditionPanel } from '../components/competitions/ArchiveEditionPanel';
import { InternationalTournamentPanel } from '../components/competitions/InternationalTournamentPanel';

type Tab =
  | 'overview'
  | 'participants'
  | 'national-teams'
  | 'tournament'
  | 'stages'
  | 'rules'
  | 'readiness'
  | 'matches'
  | 'standings'
  | 'statistics'
  | 'playoffs'
  | 'history';

const TABS: Array<{ value: Tab; label: string; disabled?: boolean }> = [
  { value: 'overview', label: 'Overview' },
  { value: 'participants', label: 'Participants' },
  { value: 'national-teams', label: 'National Teams' },
  { value: 'tournament', label: 'Tournament' },
  { value: 'stages', label: 'Stages' },
  { value: 'rules', label: 'Rules' },
  { value: 'readiness', label: 'Readiness' },
  { value: 'matches', label: 'Schedule & Results' },
  { value: 'standings', label: 'Standings' },
  { value: 'statistics', label: 'Statistics' },
  { value: 'playoffs', label: 'Playoffs' },
  { value: 'history', label: 'History' },
];

function lifecycleBanner(status: string): string {
  switch (status) {
    case 'PLANNED':
    case 'PREPARING':
      return 'Structure is editable.';
    case 'READY':
      return 'Validated and locked pending activation.';
    case 'ACTIVE':
      return 'Active edition. Detailed stages use F18/F19; AGGREGATED leagues use F21 fast season simulation.';
    case 'COMPLETED':
      return 'Completed — ready to archive when Commissioner confirms.';
    case 'ARCHIVED':
      return 'Archived history — read only. Open the permanent archive for canonical historical data.';
    case 'CANCELLED':
      return 'Cancelled and read-only.';
    default:
      return status;
  }
}

/**
 * Plain-language explanation of why Schedule / Standings / Statistics are
 * unavailable for an edition that hasn't produced authoritative match data yet,
 * and the next step to take. Returned as null when the edition is in a state
 * where these tabs would have data (ACTIVE/COMPLETED/ARCHIVED) — so the card
 * only appears when it's actually informative. Does NOT weaken lifecycle
 * checks or auto-advance anything.
 */
function nextStepForDataTabs(status: string, hasRegularSeasonStage: boolean): { title: string; body: string } | null {
  switch (status) {
    case 'PLANNED':
    case 'PREPARING':
      return {
        title: hasRegularSeasonStage
          ? 'Schedule is unavailable until the edition is activated'
          : 'Schedule is unavailable because this edition is still planned',
        body: hasRegularSeasonStage
          ? 'Prepare the competition structure (participants, stages, rules) and validate readiness, then a Commissioner can mark the edition Ready and Activate it. Schedules, standings, and statistics appear only after the edition is Active.'
          : 'Add a REGULAR_SEASON (detailed) stage while the edition is editable, prepare participants and rules, then activate. Standings appear after matches are recorded; statistics appear after match results are persisted.',
      };
    case 'READY':
      return {
        title: 'Schedule is unavailable because the edition is not Active yet',
        body: 'This edition is validated and locked pending activation. A Commissioner can Activate it from the Readiness tab. Schedule generation, standings, and statistics become available once the edition is Active.',
      };
    case 'COMPLETED':
    case 'ARCHIVED':
    case 'ACTIVE':
    case 'CANCELLED':
    default:
      return null;
  }
}

export function CompetitionEditionPage() {
  const { competitionId = '', editionId = '' } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const tab = (searchParams.get('tab') as Tab) || 'overview';
  const commissioner = useCommissioner();
  const [item, setItem] = useState<CompetitionEditionDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [leagues, setLeagues] = useState<LeagueItem[]>([]);
  const [leagueId, setLeagueId] = useState('');
  const [reason, setReason] = useState('Commissioner competition edit');
  const [audit, setAudit] = useState<
    Array<{ id: string; action: string; reason: string; createdAt: string; changedFields: string[] }>
  >([]);
  const [rulesText, setRulesText] = useState('');
  const [ntEditions, setNtEditions] = useState<unknown[]>([]);
  const [ntProfiles, setNtProfiles] = useState<unknown[]>([]);
  const [prepareNtId, setPrepareNtId] = useState('');

  const reload = useCallback(
    (signal?: AbortSignal) => {
      setLoading(true);
      return getCompetitionEdition(editionId, signal)
        .then((res) => {
          setItem(res.item);
          setRulesText(JSON.stringify(res.item.rules, null, 2));
          setError(null);
          setNotFound(false);
        })
        .catch((err: unknown) => {
          if (signal?.aborted) return;
          const status = (err as { status?: number }).status;
          if (status === 404) setNotFound(true);
          else setError(err instanceof Error ? err.message : 'Failed to load edition');
        })
        .finally(() => {
          if (!signal?.aborted) setLoading(false);
        });
    },
    [editionId],
  );

  useEffect(() => {
    const controller = new AbortController();
    void reload(controller.signal);
    return () => controller.abort();
  }, [reload]);

  useEffect(() => {
    getLeagues()
      .then((res) => {
        setLeagues(res.items);
        if (res.items[0]) setLeagueId(res.items[0].id);
      })
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    if (!commissioner.enabled || tab !== 'history') return;
    getCompetitionEditionAudit(editionId)
      .then((res) => setAudit(res.items))
      .catch(() => setAudit([]));
  }, [commissioner.enabled, tab, editionId, item?.updatedAt]);

  useEffect(() => {
    if (tab !== 'national-teams') return;
    const c = new AbortController();
    getNationalTeamEditions({ competitionEditionId: editionId }, c.signal)
      .then((res) => setNtEditions(res.items))
      .catch(() => setNtEditions([]));
    getNationalTeams({}, c.signal)
      .then((res) => {
        setNtProfiles(res.items);
        if (res.items[0] && !prepareNtId) {
          setPrepareNtId(String((res.items[0] as { id: string }).id));
        }
      })
      .catch(() => undefined);
    return () => c.abort();
  }, [tab, editionId, item?.updatedAt, prepareNtId]);

  const setTab = (value: string) => {
    const next = new URLSearchParams(searchParams);
    next.set('tab', value);
    setSearchParams(next, { replace: true });
  };

  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Action failed');
    } finally {
      setBusy(false);
    }
  };

  if (loading && !item) {
    return (
      <div style={{ padding: 20 }}>
        <LoadingState label="Loading edition…" />
      </div>
    );
  }

  if (notFound) {
    return (
      <div style={{ padding: 20 }}>
        <BackLink to={`/competitions/${competitionId}`} label="Competition" />
        <RecordNotFound
          entity="Competition edition"
          listHref={`/competitions/${competitionId}`}
          listLabel="Back to competition"
        />
      </div>
    );
  }

  if (!item) {
    return (
      <div style={{ padding: 20 }}>
        <ErrorState description={error ?? 'Edition unavailable'} />
      </div>
    );
  }

  const editable = item.status === 'PLANNED' || item.status === 'PREPARING';
  const rules = item.rules as {
    format?: string;
    points?: Record<string, number>;
    matchRules?: Record<string, unknown>;
    tiebreakers?: string[];
  } | null;

  return (
    <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 16 }}>
      <BackLink to={`/competitions/${competitionId}`} label="Competition" />
      <PageHeader
        title={item.displayName}
        subtitle={[item.competition?.name, item.worldSeason?.label, item.status]
          .filter(Boolean)
          .join(' · ')}
        badge="Edition"
      />

      <Panel title="Lifecycle">
        <p style={{ margin: 0, font: 'var(--text-body-sm)', color: 'var(--text-secondary)' }}>
          {lifecycleBanner(item.status)}
        </p>
        <div style={{ marginTop: 8, display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <Badge tone="neutral">{item.status}</Badge>
          <Badge tone="neutral">Readiness: {item.readiness.status}</Badge>
          <span style={{ font: 'var(--text-body-sm)', color: 'var(--text-tertiary)' }}>
            Hash {item.rulesHash.slice(0, 12)}…
          </span>
        </div>
      </Panel>

      {error ? <ErrorState description={error} /> : null}

      <Tabs
        items={TABS.map((t) => ({
          ...t,
          disabled: t.disabled || (t.value === 'history' && !commissioner.enabled),
        }))}
        value={tab}
        onChange={setTab}
      />

      {tab === 'overview' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {(item.status === 'COMPLETED' ||
            item.status === 'ARCHIVED' ||
            item.status === 'ACTIVE') && (
            <ArchiveEditionPanel
              editionId={item.id}
              editionStatus={item.status}
              updatedAt={item.updatedAt}
              reason={reason}
              commissionerEnabled={commissioner.enabled}
              onArchived={() => void reload()}
            />
          )}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
              gap: 16,
            }}
          >
            <Panel title="Summary">
              <Row label="Participants" value={String(item.participantCount)} />
              <Row label="Stages" value={String(item.stageCount)} />
              <Row label="Matches" value={String(item.matchCount)} />
              <Row
                label="Simulation"
                value={String(item.competition?.simulationLevel ?? 'DETAILED')}
              />
              <Row label="Prepared" value={item.preparedAt ?? '—'} />
              <Row label="Activated" value={item.activatedAt ?? '—'} />
              <Row label="Completed" value={item.completedAt ?? '—'} />
              <Row label="Archived" value={item.archivedAt ?? '—'} />
              {item.competition?.simulationLevel === 'AGGREGATED' ? (
                <div style={{ marginTop: 8 }}>
                  <Badge tone="neutral">Aggregated Simulation</Badge>
                </div>
              ) : null}
            </Panel>
            <Panel title="Notice">
              <p style={{ margin: 0, font: 'var(--text-body-sm)', color: 'var(--text-secondary)' }}>
                {item.status === 'ARCHIVED'
                  ? 'Canonical historical data lives in the competition archive under History.'
                  : item.status === 'COMPLETED'
                    ? 'Archive this edition to freeze standings, bracket, awards, and statistics.'
                    : 'Activation locks structure. Regular season and playoffs run while ACTIVE.'}
              </p>
            </Panel>
          </div>
        </div>
      )}

      {tab === 'participants' && (
        <Panel
          title="Participants"
          actions={
            commissioner.enabled && editable ? (
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'end' }}>
                <Field label="League">
                  <SelectInput value={leagueId} onChange={(e) => setLeagueId(e.target.value)}>
                    {leagues.map((l) => (
                      <option key={l.id} value={l.id}>
                        {l.name}
                      </option>
                    ))}
                  </SelectInput>
                </Field>
                <Button
                  size="sm"
                  disabled={busy || !leagueId}
                  onClick={() =>
                    run(() =>
                      addCompetitionParticipantsFromLeague(item.id, {
                        expectedUpdatedAt: item.updatedAt,
                        leagueId,
                        status: 'CONFIRMED',
                        reason,
                      }),
                    )
                  }
                >
                  Add from league
                </Button>
              </div>
            ) : null
          }
        >
          {item.participants.length === 0 ? (
            <EmptyState title="No participants" description="Add teams while the edition is editable." />
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {item.participants.map((p) => (
                <div
                  key={p.id}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    gap: 8,
                    font: 'var(--text-body-sm)',
                    borderBottom: '1px solid var(--border-subtle)',
                    paddingBottom: 8,
                  }}
                >
                  <div>
                    <div style={{ color: 'var(--text-primary)' }}>
                      {p.teamNameSnapshot}
                      {p.currentTeam.name !== p.teamNameSnapshot
                        ? ` (now ${p.currentTeam.name})`
                        : ''}
                    </div>
                    <div style={{ color: 'var(--text-tertiary)' }}>
                      #{p.participantOrder} · {p.source} · seed {p.seed ?? '—'}
                    </div>
                  </div>
                  <Badge tone="neutral">{p.status}</Badge>
                </div>
              ))}
            </div>
          )}
        </Panel>
      )}

      {tab === 'national-teams' && (
        <Panel
          title="National team preparation"
          actions={
            commissioner.enabled &&
            editable &&
            item.competition?.type === 'INTERNATIONAL_TOURNAMENT' ? (
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'end' }}>
                <Field label="National team">
                  <SelectInput value={prepareNtId} onChange={(e) => setPrepareNtId(e.target.value)}>
                    {ntProfiles.map((raw) => {
                      const p = raw as { id: string; displayName: string; category: string };
                      return (
                        <option key={p.id} value={p.id}>
                          {p.displayName} ({p.category})
                        </option>
                      );
                    })}
                  </SelectInput>
                </Field>
                <Button
                  size="sm"
                  disabled={busy || !prepareNtId}
                  onClick={() =>
                    run(async () => {
                      await prepareNationalTeamEdition(item.id, prepareNtId, {
                        expectedUpdatedAt: item.updatedAt,
                        reason,
                      });
                      const res = await getNationalTeamEditions({
                        competitionEditionId: item.id,
                      });
                      setNtEditions(res.items);
                    })
                  }
                >
                  Prepare national team
                </Button>
              </div>
            ) : null
          }
        >
          {item.competition?.type !== 'INTERNATIONAL_TOURNAMENT' ? (
            <EmptyState
              title="Domestic edition"
              description="National-team preparation applies only to INTERNATIONAL_TOURNAMENT competitions."
            />
          ) : ntEditions.length === 0 ? (
            <EmptyState
              title="No national-team editions"
              description="Prepare participating national teams for this tournament edition (F22). Schedules arrive in F23."
            />
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {ntEditions.map((raw) => {
                const e = raw as {
                  id: string;
                  status: string;
                  teamNameSnapshot?: string;
                  profile?: { id: string; displayName: string; category: string };
                };
                return (
                  <div
                    key={e.id}
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      gap: 8,
                      font: 'var(--text-body-sm)',
                      borderBottom: '1px solid var(--border-subtle)',
                      paddingBottom: 8,
                    }}
                  >
                    <div>
                      <Link
                        to={`/national-teams/${e.profile?.id ?? ''}`}
                        style={{ color: 'var(--accent-primary)' }}
                      >
                        {e.teamNameSnapshot ?? e.profile?.displayName ?? e.id}
                      </Link>
                      <div style={{ color: 'var(--text-tertiary)' }}>
                        {e.profile?.category ?? '—'} · {e.status}
                      </div>
                    </div>
                    <Badge tone={e.status === 'LOCKED' ? 'success' : 'neutral'}>{e.status}</Badge>
                  </div>
                );
              })}
              <p style={{ margin: 0, font: 'var(--text-body-sm)', color: 'var(--text-secondary)' }}>
                Locked:{' '}
                {ntEditions.filter((x) => (x as { status: string }).status === 'LOCKED').length} /{' '}
                {ntEditions.length}. F23 activation requires all LOCKED.
              </p>
            </div>
          )}
        </Panel>
      )}

      {tab === 'tournament' && (
        <InternationalTournamentPanel
          editionId={item.id}
          editionUpdatedAt={item.updatedAt}
          onChanged={() => void reload()}
        />
      )}

      {tab === 'stages' && (
        <Panel
          title="Stages"
          actions={
            commissioner.enabled && editable ? (
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <Button
                  size="sm"
                  disabled={busy}
                  onClick={() =>
                    run(() =>
                      createCompetitionStage(item.id, {
                        expectedUpdatedAt: item.updatedAt,
                        reason,
                        name: `Stage ${item.stageCount + 1}`,
                        stageType: 'REGULAR_SEASON',
                        stageOrder: item.stageCount + 1,
                        participantSource: 'EDITION_PARTICIPANTS',
                        config: { gamesPerTeam: 4, qualifiersCount: 2 },
                      }),
                    )
                  }
                >
                  Add regular-season stage
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={busy}
                  onClick={() => {
                    const rs = item.stages.find((s) => s.stageType === 'REGULAR_SEASON');
                    void run(() =>
                      createCompetitionStage(item.id, {
                        expectedUpdatedAt: item.updatedAt,
                        reason,
                        name: 'Playoffs',
                        stageType: 'BEST_OF_SERIES',
                        stageOrder: item.stageCount + 1,
                        participantSource: 'PREVIOUS_STAGE_QUALIFIERS',
                        sourceStageId: rs?.id ?? null,
                        expectedQualifierCount: 2,
                        config: {
                          winsRequired: 4,
                          reseeding: false,
                          homePattern: '2-2-1-1-1',
                          qualificationCount: 2,
                          bracketMode: 'FIXED',
                          sourceStageId: rs?.id,
                          matchRules: {
                            tiesAllowed: false,
                            overtimeEnabled: true,
                            shootoutEnabled: false,
                          },
                        },
                      }),
                    );
                  }}
                >
                  Add playoff stage
                </Button>
              </div>
            ) : null
          }
        >
          {item.stages.length === 0 ? (
            <EmptyState title="No stages" description="Add ordered stages while editable." />
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {item.stages.map((s) => (
                <div
                  key={s.id}
                  style={{
                    border: '1px solid var(--border-subtle)',
                    padding: 12,
                    borderRadius: 4,
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                    <strong style={{ font: 'var(--text-body-sm)' }}>
                      {s.stageOrder}. {s.name}
                    </strong>
                    <Badge tone="neutral">{s.stageType}</Badge>
                  </div>
                  <div style={{ font: 'var(--text-body-sm)', color: 'var(--text-tertiary)', marginTop: 6 }}>
                    Source {s.participantSource}
                    {s.sourceStageId ? ` ← ${s.sourceStageId.slice(0, 8)}…` : ''} · participants{' '}
                    {s.participantCount} · {s.status}
                  </div>
                </div>
              ))}
            </div>
          )}
        </Panel>
      )}

      {tab === 'rules' && (
        <Panel title="Rules snapshot">
          <div style={{ display: 'grid', gap: 8, marginBottom: 12 }}>
            <Row label="Format" value={rules?.format ?? '—'} />
            <Row
              label="OT / SO"
              value={
                rules?.matchRules
                  ? `OT ${String(rules.matchRules.overtimeEnabled)} · SO ${String(rules.matchRules.shootoutEnabled)}`
                  : '—'
              }
            />
            <Row label="Tiebreakers" value={(rules?.tiebreakers ?? []).join(' → ') || '—'} />
          </div>
          {commissioner.enabled && editable ? (
            <>
              <Field label="Reason">
                <TextInput value={reason} onChange={(e) => setReason(e.target.value)} />
              </Field>
              <label style={{ display: 'block', marginTop: 8 }}>
                <span style={{ font: 'var(--text-body-sm)', color: 'var(--text-tertiary)' }}>
                  Advanced JSON (validated on save)
                </span>
                <textarea
                  value={rulesText}
                  onChange={(e) => setRulesText(e.target.value)}
                  rows={16}
                  style={{
                    width: '100%',
                    marginTop: 6,
                    fontFamily: 'ui-monospace, monospace',
                    fontSize: 12,
                  }}
                />
              </label>
              <Button
                style={{ marginTop: 8 }}
                disabled={busy}
                onClick={() =>
                  run(async () => {
                    const parsed = JSON.parse(rulesText) as unknown;
                    await updateCompetitionEditionRules(item.id, {
                      expectedUpdatedAt: item.updatedAt,
                      reason,
                      rules: parsed,
                    });
                  })
                }
              >
                Save rules
              </Button>
            </>
          ) : (
            <pre
              style={{
                margin: 0,
                font: 'var(--text-body-sm)',
                whiteSpace: 'pre-wrap',
                color: 'var(--text-secondary)',
              }}
            >
              {JSON.stringify(item.rules, null, 2)}
            </pre>
          )}
        </Panel>
      )}

      {tab === 'readiness' && (
        <Panel title="Structural readiness">
          <p style={{ font: 'var(--text-body-sm)', color: 'var(--text-secondary)' }}>
            READY means structure can activate. Regular-season schedules are generated after activation (F18).
          </p>
          <Row label="Overall" value={item.readiness.status} />
          <Row label="Confirmed" value={String(item.readiness.confirmedParticipantCount)} />
          <Row label="Stages" value={String(item.readiness.stageCount)} />
          <ul style={{ margin: '12px 0', paddingLeft: 18 }}>
            {item.readiness.checks.map((c) => (
              <li key={`${c.code}-${c.message}`} style={{ font: 'var(--text-body-sm)' }}>
                [{c.severity}] {c.message}
              </li>
            ))}
          </ul>
          {commissioner.enabled && (
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {item.readiness.allowedNextStatuses.includes('READY') && (
                <Button
                  disabled={busy}
                  onClick={() => {
                    if (!window.confirm('Mark this edition READY? Structure will lock until reverted.'))
                      return;
                    void run(() =>
                      transitionCompetitionEdition(item.id, {
                        expectedUpdatedAt: item.updatedAt,
                        targetStatus: 'READY',
                        reason,
                      }),
                    );
                  }}
                >
                  Mark Ready
                </Button>
              )}
              {item.readiness.allowedNextStatuses.includes('ACTIVE') && (
                <Button
                  disabled={busy}
                  onClick={() => {
                    if (
                      !window.confirm(
                        'Activate this edition? Structure becomes read-only. Regular-season schedules can then be generated.',
                      )
                    )
                      return;
                    void run(() =>
                      transitionCompetitionEdition(item.id, {
                        expectedUpdatedAt: item.updatedAt,
                        targetStatus: 'ACTIVE',
                        reason,
                      }),
                    );
                  }}
                >
                  Activate
                </Button>
              )}
              {item.status === 'READY' && (
                <Button
                  variant="secondary"
                  disabled={busy}
                  onClick={() =>
                    run(() =>
                      transitionCompetitionEdition(item.id, {
                        expectedUpdatedAt: item.updatedAt,
                        targetStatus: 'PREPARING',
                        reason,
                      }),
                    )
                  }
                >
                  Revert to Preparing
                </Button>
              )}
            </div>
          )}
        </Panel>
      )}

      {(tab === 'matches' || tab === 'standings' || tab === 'statistics') && (
        <>
          {(() => {
            const rs = item.stages.find((s) => s.stageType === 'REGULAR_SEASON');
            const isAggregated = item.competition?.simulationLevel === 'AGGREGATED';
            const next = nextStepForDataTabs(item.status, Boolean(rs));
            if (next) {
              return (
                <Panel title={next.title}>
                  <p style={{ margin: 0, font: 'var(--text-body-sm)', color: 'var(--text-secondary)' }}>
                    {next.body}
                  </p>
                  <div style={{ marginTop: 10, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <Link to={`/competitions/${competitionId}/editions/${editionId}?tab=readiness`}>
                      <Button variant="secondary" size="sm">Open Readiness</Button>
                    </Link>
                    <Link to={`/competitions/${competitionId}/editions/${editionId}?tab=stages`}>
                      <Button variant="secondary" size="sm">Open Stages</Button>
                    </Link>
                  </div>
                </Panel>
              );
            }
            if (!rs) {
              return (
                <EmptyState
                  title="No regular-season stage"
                  description="Add a REGULAR_SEASON stage while the edition is editable."
                />
              );
            }
            if (isAggregated) {
              if (tab === 'matches') {
                return (
                  <>
                    <AggregatedLeaguePanel
                      stageId={rs.id}
                      stageUpdatedAt={rs.updatedAt ?? item.updatedAt}
                      section="overview"
                      onStageChanged={() => void reload()}
                    />
                    <div style={{ height: 12 }} />
                    <AggregatedLeaguePanel
                      stageId={rs.id}
                      stageUpdatedAt={rs.updatedAt ?? item.updatedAt}
                      section="results"
                      onStageChanged={() => void reload()}
                    />
                  </>
                );
              }
              if (tab === 'standings') {
                return (
                  <AggregatedLeaguePanel
                    stageId={rs.id}
                    stageUpdatedAt={rs.updatedAt ?? item.updatedAt}
                    section="standings"
                    onStageChanged={() => void reload()}
                  />
                );
              }
              return (
                <>
                  <AggregatedLeaguePanel
                    stageId={rs.id}
                    stageUpdatedAt={rs.updatedAt ?? item.updatedAt}
                    section="players"
                    onStageChanged={() => void reload()}
                  />
                  <div style={{ height: 12 }} />
                  <AggregatedLeaguePanel
                    stageId={rs.id}
                    stageUpdatedAt={rs.updatedAt ?? item.updatedAt}
                    section="teams"
                    onStageChanged={() => void reload()}
                  />
                  <div style={{ height: 12 }} />
                  <AggregatedLeaguePanel
                    stageId={rs.id}
                    stageUpdatedAt={rs.updatedAt ?? item.updatedAt}
                    section="diagnostics"
                    onStageChanged={() => void reload()}
                  />
                </>
              );
            }
            if (tab === 'matches') {
              return (
                <>
                  <RegularSeasonStagePanel
                    stageId={rs.id}
                    stageUpdatedAt={rs.updatedAt ?? item.updatedAt}
                    section="overview"
                    onStageChanged={() => void reload()}
                  />
                  <div style={{ height: 12 }} />
                  <RegularSeasonStagePanel
                    stageId={rs.id}
                    stageUpdatedAt={rs.updatedAt ?? item.updatedAt}
                    section="schedule"
                    onStageChanged={() => void reload()}
                  />
                </>
              );
            }
            if (tab === 'standings') {
              return (
                <RegularSeasonStagePanel
                  stageId={rs.id}
                  stageUpdatedAt={rs.updatedAt ?? item.updatedAt}
                  section="standings"
                  onStageChanged={() => void reload()}
                />
              );
            }
            return (
              <>
                <RegularSeasonStagePanel
                  stageId={rs.id}
                  stageUpdatedAt={rs.updatedAt ?? item.updatedAt}
                  section="players"
                  onStageChanged={() => void reload()}
                />
                <div style={{ height: 12 }} />
                <RegularSeasonStagePanel
                  stageId={rs.id}
                  stageUpdatedAt={rs.updatedAt ?? item.updatedAt}
                  section="teams"
                  onStageChanged={() => void reload()}
                />
              </>
            );
          })()}
        </>
      )}

      {tab === 'playoffs' && (
        <>
          {(() => {
            const po = item.stages.find(
              (s) => s.stageType === 'BEST_OF_SERIES' || s.stageType === 'KNOCKOUT',
            );
            const rs = item.stages.find((s) => s.stageType === 'REGULAR_SEASON');
            if (!po) {
              return (
                <EmptyState
                  title="No playoff stage"
                  description="Add a BEST_OF_SERIES stage while the edition is editable."
                />
              );
            }
            return (
              <PlayoffStagePanel
                stageId={po.id}
                stageUpdatedAt={po.updatedAt ?? item.updatedAt}
                sourceStageId={po.sourceStageId ?? rs?.id ?? null}
                onChanged={() => void reload()}
              />
            );
          })()}
        </>
      )}

      {tab === 'history' && (
        <Panel title="Commissioner audit">
          {!commissioner.enabled ? (
            <EmptyState title="Commissioner Mode required" description="Enable Commissioner Mode to view audit." />
          ) : audit.length === 0 ? (
            <EmptyState title="No audit rows" description="No competition edition changes recorded yet." />
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {audit.map((a) => (
                <div key={a.id} style={{ font: 'var(--text-body-sm)' }}>
                  <div style={{ color: 'var(--text-primary)' }}>
                    {a.action} · {a.createdAt}
                  </div>
                  <div style={{ color: 'var(--text-tertiary)' }}>
                    {a.reason} · {a.changedFields.join(', ')}
                  </div>
                </div>
              ))}
            </div>
          )}
        </Panel>
      )}

      <p style={{ margin: 0, font: 'var(--text-body-sm)' }}>
        <Link to={`/competitions/${competitionId}`}>Back to competition</Link>
      </p>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        gap: 8,
        font: 'var(--text-body-sm)',
        padding: '4px 0',
        borderBottom: '1px solid var(--border-subtle)',
      }}
    >
      <span style={{ color: 'var(--text-tertiary)' }}>{label}</span>
      <span style={{ color: 'var(--text-primary)' }}>{value}</span>
    </div>
  );
}
