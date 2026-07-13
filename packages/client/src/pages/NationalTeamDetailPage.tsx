import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { PageHeader } from '../components/layout/PageHeader';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { EmptyState, ErrorState, LoadingState } from '../components/ui/EmptyState';
import { Panel } from '../components/ui/Panel';
import { Field, TextInput } from '../components/ui/DataBrowser';
import { Tabs } from '../components/ui/Tabs';
import { BackLink, RecordNotFound } from '../components/ui/RecordStates';
import { useCommissioner } from '../lib/commissioner';
import {
  autoNationalTeamLineup,
  confirmNationalTeamRoster,
  generateNationalTeamCandidates,
  getCompetitionEdition,
  getNationalTeam,
  getNationalTeamEdition,
  getNationalTeamEditionCandidates,
  getNationalTeamEditionLineup,
  getNationalTeamEditionReadiness,
  getNationalTeamEditionRoster,
  getNationalTeamEditionStaff,
  getNationalTeamEditionTactics,
  getNationalTeamEditions,
  lockNationalTeamEdition,
  prepareNationalTeamEdition,
  suggestNationalTeamRoster,
  updateNationalTeamStaff,
  updateNationalTeamTactics,
} from '../lib/api';

type Tab = 'overview' | 'editions' | 'candidates' | 'roster' | 'staff' | 'tactics' | 'lines' | 'readiness';

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: 'flex', gap: 12, font: 'var(--text-body-sm)', marginBottom: 4 }}>
      <span style={{ color: 'var(--text-tertiary)', minWidth: 160 }}>{label}</span>
      <span>{value}</span>
    </div>
  );
}

export function NationalTeamDetailPage() {
  const { nationalTeamId = '' } = useParams();
  const commissioner = useCommissioner();
  const [tab, setTab] = useState<Tab>('overview');
  const [item, setItem] = useState<Record<string, unknown> | null>(null);
  const [editions, setEditions] = useState<unknown[]>([]);
  const [selectedEditionId, setSelectedEditionId] = useState<string | null>(null);
  const [edition, setEdition] = useState<Record<string, unknown> | null>(null);
  const [candidates, setCandidates] = useState<unknown[]>([]);
  const [roster, setRoster] = useState<unknown[]>([]);
  const [staff, setStaff] = useState<unknown[]>([]);
  const [tactics, setTactics] = useState<Record<string, unknown> | null>(null);
  const [lineup, setLineup] = useState<Record<string, unknown> | null>(null);
  const [readiness, setReadiness] = useState<Record<string, unknown> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [reason, setReason] = useState('National-team preparation');
  const [coachId, setCoachId] = useState('');
  const [tacticalStyle, setTacticalStyle] = useState('SYSTEM');
  const [prepareEditionId, setPrepareEditionId] = useState('');

  const reloadTeam = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await getNationalTeam(nationalTeamId);
      setItem(res.item as Record<string, unknown>);
      const eds = await getNationalTeamEditions({ nationalTeamProfileId: nationalTeamId });
      setEditions(eds.items);
      if (!selectedEditionId && eds.items[0]) {
        setSelectedEditionId(String((eds.items[0] as { id: string }).id));
      }
      setNotFound(false);
    } catch (err) {
      const status = (err as { status?: number }).status;
      if (status === 404) setNotFound(true);
      else setError(err instanceof Error ? err.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, [nationalTeamId, selectedEditionId]);

  const reloadEdition = useCallback(async () => {
    if (!selectedEditionId) {
      setEdition(null);
      return;
    }
    try {
      const [ed, cand, rost, st, tac, lu, rd] = await Promise.all([
        getNationalTeamEdition(selectedEditionId),
        getNationalTeamEditionCandidates(selectedEditionId),
        getNationalTeamEditionRoster(selectedEditionId),
        getNationalTeamEditionStaff(selectedEditionId),
        getNationalTeamEditionTactics(selectedEditionId).catch(() => ({ item: null })),
        getNationalTeamEditionLineup(selectedEditionId).catch(() => ({
          item: { item: null } as Record<string, unknown>,
        })),
        getNationalTeamEditionReadiness(selectedEditionId),
      ]);
      setEdition(ed.item as Record<string, unknown>);
      const candPayload = cand.item as { items?: unknown[] } | undefined;
      const rostPayload = rost.item as { items?: unknown[] } | undefined;
      const staffPayload = st.item as { items?: unknown[] } | undefined;
      const tacPayload = tac.item as { item?: Record<string, unknown> | null } | null;
      const luPayload = lu.item as { item?: Record<string, unknown> | null } | null;
      const rdPayload = rd.item as { readiness?: Record<string, unknown> } | undefined;
      setCandidates(candPayload?.items ?? []);
      setRoster(rostPayload?.items ?? []);
      setStaff(staffPayload?.items ?? []);
      setTactics(tacPayload?.item ?? null);
      setLineup(luPayload?.item ?? null);
      setReadiness(rdPayload?.readiness ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load edition');
    }
  }, [selectedEditionId]);

  useEffect(() => {
    void reloadTeam();
  }, [reloadTeam]);

  useEffect(() => {
    void reloadEdition();
  }, [reloadEdition]);

  if (loading) return <LoadingState label="Loading national team…" />;
  if (notFound) return <RecordNotFound entity="National team" listHref="/national-teams" listLabel="National Teams" />;
  if (!item) return <ErrorState description={error ?? 'Unavailable'} />;

  const updatedAt = String(edition?.updatedAt ?? '');
  const status = String(edition?.status ?? '—');
  const locked = status === 'LOCKED' || status === 'CANCELLED';

  async function runAction(fn: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    try {
      await fn();
      await reloadEdition();
      await reloadTeam();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Action failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 16 }}>
      <BackLink to="/national-teams" label="National Teams" />
      <PageHeader
        title={String(item.displayName)}
        subtitle={[
          String((item.country as { name?: string } | undefined)?.name ?? ''),
          String(item.category),
        ]
          .filter(Boolean)
          .join(' · ')}
        badge="National Team"
      />

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <Badge tone="info">{String(item.category).replace(/_/g, ' ')}</Badge>
        <Badge tone="neutral">{String(item.status)}</Badge>
        {edition ? <Badge tone={locked ? 'warning' : 'success'}>Edition {status}</Badge> : null}
      </div>

      {error ? <ErrorState description={error} /> : null}

      <Tabs
        items={[
          { value: 'overview', label: 'Overview' },
          { value: 'editions', label: 'Tournament Editions' },
          { value: 'candidates', label: 'Candidates' },
          { value: 'roster', label: 'Roster' },
          { value: 'staff', label: 'Staff' },
          { value: 'tactics', label: 'Tactics' },
          { value: 'lines', label: 'Lines' },
          { value: 'readiness', label: 'Readiness' },
        ]}
        value={tab}
        onChange={(v) => setTab(v as Tab)}
      />

      {tab === 'overview' ? (
        <Panel title="Overview">
          <Row label="Display name" value={String(item.displayName)} />
          <Row label="Category" value={String(item.category)} />
          <Row
            label="Country"
            value={String((item.country as { name?: string } | undefined)?.name ?? '—')}
          />
          <Row label="Team id" value={String(item.teamId)} />
          <p style={{ font: 'var(--text-body-sm)', color: 'var(--text-secondary)' }}>
            Club ownership never changes when players are selected. F22 prepares tournament rosters
            only — no international matches yet (F23).
          </p>
          {edition ? (
            <>
              <Row label="Selected edition" value={String(edition.id)} />
              <Row label="Edition status" value={status} />
              <Row label="Roster hash" value={String(edition.rosterHash ?? '—').slice(0, 16)} />
              <Row label="Lineup hash" value={String(edition.lineupHash ?? '—').slice(0, 16)} />
            </>
          ) : (
            <EmptyState
              title="No tournament edition"
              description="Prepare this national team on an INTERNATIONAL_TOURNAMENT CompetitionEdition."
            />
          )}
        </Panel>
      ) : null}

      {tab === 'editions' ? (
        <Panel title="Tournament editions">
          {editions.length === 0 ? (
            <EmptyState title="None" description="No NationalTeamEdition rows yet." />
          ) : (
            <ul style={{ margin: 0, paddingLeft: 18 }}>
              {editions.map((raw) => {
                const e = raw as Record<string, unknown>;
                return (
                  <li key={String(e.id)} style={{ marginBottom: 6 }}>
                    <button
                      type="button"
                      onClick={() => setSelectedEditionId(String(e.id))}
                      style={{
                        background: 'none',
                        border: 'none',
                        color: 'var(--accent-primary)',
                        cursor: 'pointer',
                        font: 'var(--text-body-sm)',
                      }}
                    >
                      {String(e.teamNameSnapshot ?? e.id)} · {String(e.status)}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
          {commissioner.enabled ? (
            <div style={{ display: 'grid', gap: 8, maxWidth: 420, marginTop: 12 }}>
              <Field label="Competition edition id">
                <TextInput
                  value={prepareEditionId}
                  onChange={(e) => setPrepareEditionId(e.target.value)}
                  placeholder="CompetitionEdition id"
                />
              </Field>
              <Field label="Reason">
                <TextInput value={reason} onChange={(e) => setReason(e.target.value)} />
              </Field>
              <Button
                type="button"
                disabled={busy || !prepareEditionId.trim()}
                onClick={() =>
                  void runAction(async () => {
                    const ed = await getCompetitionEdition(prepareEditionId.trim());
                    const prepared = await prepareNationalTeamEdition(
                      prepareEditionId.trim(),
                      nationalTeamId,
                      {
                        reason,
                        expectedUpdatedAt: ed.item.updatedAt,
                      },
                    );
                    const id = String((prepared.item as { id: string }).id);
                    setSelectedEditionId(id);
                  })
                }
              >
                Prepare for Edition
              </Button>
            </div>
          ) : (
            <p style={{ font: 'var(--text-body-sm)', color: 'var(--text-tertiary)' }}>
              Commissioner Mode is required to prepare a tournament edition.
            </p>
          )}
        </Panel>
      ) : null}

      {!edition && tab !== 'overview' && tab !== 'editions' ? (
        <EmptyState title="Select an edition" description="Open Tournament Editions first." />
      ) : null}

      {edition && tab === 'candidates' ? (
        <Panel title="Candidate pool">
          <Row label="Count" value={String(candidates.length)} />
          {commissioner.enabled && !locked ? (
            <Button
              type="button"
              disabled={busy}
              onClick={() =>
                void runAction(() =>
                  generateNationalTeamCandidates(String(edition.id), {
                    expectedUpdatedAt: updatedAt,
                    reason,
                  }),
                )
              }
            >
              Generate Candidates
            </Button>
          ) : null}
          <div style={{ overflowX: 'auto', marginTop: 12 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', font: 'var(--text-body-sm)' }}>
              <thead>
                <tr>
                  <th align="left">Player</th>
                  <th align="left">Pos</th>
                  <th align="left">Club</th>
                  <th align="left">Eligibility</th>
                  <th align="left">Rank</th>
                </tr>
              </thead>
              <tbody>
                {candidates.slice(0, 100).map((raw) => {
                  const c = raw as Record<string, unknown>;
                  return (
                    <tr key={String(c.id ?? c.sourcePlayerId)}>
                      <td>
                        <Link to={`/players/${String(c.sourcePlayerId)}`}>
                          {String(c.playerNameSnapshot)}
                        </Link>
                      </td>
                      <td>{String(c.positionSnapshot)}</td>
                      <td>{String(c.clubNameSnapshot ?? '—')}</td>
                      <td>{String(c.eligibilityStatus)}</td>
                      <td>{String(c.rankingOrder ?? '—')}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Panel>
      ) : null}

      {edition && tab === 'roster' ? (
        <Panel title="Tournament roster">
          <p style={{ font: 'var(--text-body-sm)', color: 'var(--text-secondary)' }}>
            Snapshots preserve names/clubs after confirmation. Club lineups are unaffected.
          </p>
          {commissioner.enabled && !locked ? (
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
              <Button
                type="button"
                disabled={busy}
                onClick={() =>
                  void runAction(() =>
                    suggestNationalTeamRoster(String(edition.id), {
                      expectedUpdatedAt: updatedAt,
                      reason,
                      confirmReplace: true,
                    }),
                  )
                }
              >
                Suggest Roster
              </Button>
              <Button
                type="button"
                disabled={busy || status === 'READY'}
                onClick={() =>
                  void runAction(() =>
                    confirmNationalTeamRoster(String(edition.id), {
                      expectedUpdatedAt: updatedAt,
                      reason,
                    }),
                  )
                }
              >
                Confirm Roster
              </Button>
            </div>
          ) : null}
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', font: 'var(--text-body-sm)' }}>
              <thead>
                <tr>
                  <th align="left">Role</th>
                  <th align="left">Player</th>
                  <th align="left">Pos</th>
                  <th align="left">Club</th>
                  <th align="left">Captain</th>
                </tr>
              </thead>
              <tbody>
                {roster.map((raw) => {
                  const r = raw as Record<string, unknown>;
                  return (
                    <tr key={String(r.id ?? r.sourcePlayerId)}>
                      <td>{String(r.rosterRole)}</td>
                      <td>{String(r.playerNameSnapshot)}</td>
                      <td>{String(r.positionSnapshot)}</td>
                      <td>{String(r.clubNameSnapshot ?? '—')}</td>
                      <td>{String(r.captainRole)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Panel>
      ) : null}

      {edition && tab === 'staff' ? (
        <Panel title="Staff">
          <ul style={{ margin: 0, paddingLeft: 18, font: 'var(--text-body-sm)' }}>
            {staff.map((raw) => {
              const s = raw as Record<string, unknown>;
              return (
                <li key={String(s.id)}>
                  {String(s.role)} — {String(s.coachNameSnapshot)}
                </li>
              );
            })}
          </ul>
          {commissioner.enabled && !locked ? (
            <div style={{ display: 'grid', gap: 8, maxWidth: 420, marginTop: 12 }}>
              <Field label="Head coach id">
                <TextInput value={coachId} onChange={(e) => setCoachId(e.target.value)} />
              </Field>
              <Button
                type="button"
                disabled={busy || !coachId}
                onClick={() =>
                  void runAction(() =>
                    updateNationalTeamStaff(String(edition.id), {
                      expectedUpdatedAt: updatedAt,
                      reason,
                      staff: [
                        {
                          sourceCoachId: coachId,
                          role: 'HEAD_COACH',
                          assignmentOrder: 1,
                        },
                      ],
                    }),
                  )
                }
              >
                Assign Head Coach
              </Button>
              <p style={{ font: 'var(--text-body-sm)', color: 'var(--text-tertiary)' }}>
                Does not remove the coach from any club assignment.
              </p>
            </div>
          ) : null}
        </Panel>
      ) : null}

      {edition && tab === 'tactics' ? (
        <Panel title="Tournament-specific national-team tactics">
          <Row label="Style" value={String(tactics?.tacticalStyle ?? '—')} />
          <p style={{ font: 'var(--text-body-sm)', color: 'var(--text-secondary)' }}>
            Club tactics are unaffected.
          </p>
          {commissioner.enabled && !locked ? (
            <div style={{ display: 'grid', gap: 8, maxWidth: 420 }}>
              <Field label="Tactical style">
                <TextInput
                  value={tacticalStyle}
                  onChange={(e) => setTacticalStyle(e.target.value)}
                />
              </Field>
              <Button
                type="button"
                disabled={busy}
                onClick={() =>
                  void runAction(() =>
                    updateNationalTeamTactics(String(edition.id), {
                      expectedUpdatedAt: updatedAt,
                      reason,
                      tacticalStyle,
                    }),
                  )
                }
              >
                Save Tactics
              </Button>
            </div>
          ) : null}
        </Panel>
      ) : null}

      {edition && tab === 'lines' ? (
        <Panel title="Tournament lines">
          {commissioner.enabled && !locked ? (
            <Button
              type="button"
              disabled={busy}
              onClick={() =>
                void runAction(() =>
                  autoNationalTeamLineup(String(edition.id), {
                    expectedUpdatedAt: updatedAt,
                    reason,
                  }),
                )
              }
            >
              Auto-Lineup
            </Button>
          ) : null}
          <pre style={{ font: 'var(--text-body-sm)', whiteSpace: 'pre-wrap' }}>
            {JSON.stringify(lineup, null, 2)}
          </pre>
        </Panel>
      ) : null}

      {edition && tab === 'readiness' ? (
        <Panel title="Readiness">
          <Row label="Status" value={String(readiness?.status ?? '—')} />
          <ul style={{ margin: 0, paddingLeft: 18, font: 'var(--text-body-sm)' }}>
            {((readiness?.checks as Array<Record<string, unknown>>) ?? []).map((c) => (
              <li key={String(c.id)}>
                [{String(c.status)}] {String(c.message)}
              </li>
            ))}
          </ul>
          {commissioner.enabled && status === 'READY' ? (
            <div style={{ marginTop: 12 }}>
              <Field label="Reason">
                <TextInput value={reason} onChange={(e) => setReason(e.target.value)} />
              </Field>
              <Button
                type="button"
                disabled={busy}
                onClick={() =>
                  void runAction(() =>
                    lockNationalTeamEdition(String(edition.id), {
                      expectedUpdatedAt: updatedAt,
                      reason,
                    }),
                  )
                }
              >
                Lock for Tournament
              </Button>
            </div>
          ) : null}
        </Panel>
      ) : null}
    </div>
  );
}
