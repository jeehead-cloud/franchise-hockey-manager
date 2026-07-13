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
  transitionCompetitionEdition,
  updateCompetitionEditionRules,
  type CompetitionEditionDetail,
  type LeagueItem,
} from '../lib/api';

type Tab =
  | 'overview'
  | 'participants'
  | 'stages'
  | 'rules'
  | 'readiness'
  | 'matches'
  | 'standings'
  | 'statistics'
  | 'history';

const TABS: Array<{ value: Tab; label: string; disabled?: boolean }> = [
  { value: 'overview', label: 'Overview' },
  { value: 'participants', label: 'Participants' },
  { value: 'stages', label: 'Stages' },
  { value: 'rules', label: 'Rules' },
  { value: 'readiness', label: 'Readiness' },
  { value: 'matches', label: 'Matches', disabled: true },
  { value: 'standings', label: 'Standings', disabled: true },
  { value: 'statistics', label: 'Statistics', disabled: true },
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
      return 'Active structure; F18/F19 will operate on it. No schedules are generated in F17.';
    case 'COMPLETED':
    case 'ARCHIVED':
      return 'Historical and read-only.';
    case 'CANCELLED':
      return 'Cancelled and read-only.';
    default:
      return status;
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
            <Row label="Prepared" value={item.preparedAt ?? '—'} />
            <Row label="Activated" value={item.activatedAt ?? '—'} />
          </Panel>
          <Panel title="Notice">
            <p style={{ margin: 0, font: 'var(--text-body-sm)', color: 'var(--text-secondary)' }}>
              Schedules, standings, and simulation arrive in later milestones. Activation in F17 only
              locks structure.
            </p>
          </Panel>
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

      {tab === 'stages' && (
        <Panel
          title="Stages"
          actions={
            commissioner.enabled && editable ? (
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
            READY means structure can activate. It does not mean schedules, lineups, or standings exist.
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
                        'Activate this edition? Structure becomes read-only. No matches are generated.',
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
