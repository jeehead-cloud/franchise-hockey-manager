import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { PageHeader } from '../components/layout/PageHeader';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import {
  DataRow,
  DataTable,
  Field,
  Td,
  TextInput,
} from '../components/ui/DataBrowser';
import { Dialog } from '../components/ui/Dialog';
import { EmptyState, ErrorState, LoadingState } from '../components/ui/EmptyState';
import {
  ChemistryOverallPanel,
  ChemistryUnitsPanel,
} from '../components/ui/ChemistrySummary';
import { LineupBoard, type AssignmentMap } from '../components/ui/LineupBoard';
import { Panel } from '../components/ui/Panel';
import { BackLink, RecordNotFound } from '../components/ui/RecordStates';
import { Tabs } from '../components/ui/Tabs';
import {
  autoFillCommissionerTeamLineup,
  getTeam,
  getTeamChemistry,
  getTeamLineup,
  saveCommissionerTeamLineup,
  type LineupChemistrySummary,
  type LineupSlot,
  type TeamDetail,
  type TeamLineup,
} from '../lib/api';
import { useCommissioner } from '../lib/commissioner';
import { playerLabel } from '../lib/listQuery';
import { presenceTone, secondaryLabel, validationTone } from '../lib/lineupUi';

type ConfirmKind = 'REPLACE' | 'FILL_EMPTY' | 'CLEAR';

export function TeamDetailPage() {
  const { teamId = '' } = useParams();
  const navigate = useNavigate();
  const { enabled } = useCommissioner();
  const [team, setTeam] = useState<TeamDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'overview' | 'roster' | 'setup' | 'lines'>('overview');
  const [lineup, setLineup] = useState<TeamLineup | null>(null);
  const [lineupLoading, setLineupLoading] = useState(false);
  const [lineupError, setLineupError] = useState<string | null>(null);
  const [chemistry, setChemistry] = useState<LineupChemistrySummary | null>(null);
  const [chemistryError, setChemistryError] = useState<string | null>(null);
  const [confirmKind, setConfirmKind] = useState<ConfirmKind | null>(null);
  const [actionReason, setActionReason] = useState('');
  const [actionBusy, setActionBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setNotFound(false);
    getTeam(teamId, controller.signal)
      .then((res) => {
        setTeam(res.item);
        setError(null);
      })
      .catch((err: unknown) => {
        if (controller.signal.aborted) return;
        const status = (err as { status?: number }).status;
        if (status === 404) setNotFound(true);
        else setError(err instanceof Error ? err.message : 'Failed to load team');
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [teamId]);

  useEffect(() => {
    if (tab !== 'lines') return;
    const controller = new AbortController();
    setLineupLoading(true);
    setLineupError(null);
    setChemistryError(null);
    void Promise.all([
      getTeamLineup(teamId, controller.signal).then((res) => {
        if (!controller.signal.aborted) setLineup(res.item);
      }),
      getTeamChemistry(teamId, controller.signal)
        .then((res) => {
          if (!controller.signal.aborted) setChemistry(res.item.chemistry);
        })
        .catch((err: unknown) => {
          if (controller.signal.aborted) return;
          setChemistry(null);
          setChemistryError(err instanceof Error ? err.message : 'Failed to load chemistry');
        }),
    ])
      .catch((err: unknown) => {
        if (controller.signal.aborted) return;
        setLineupError(err instanceof Error ? err.message : 'Failed to load lineup');
      })
      .finally(() => {
        if (!controller.signal.aborted) setLineupLoading(false);
      });
    return () => controller.abort();
  }, [tab, teamId]);

  const boardAssignments: AssignmentMap = useMemo(() => {
    if (!lineup) return {};
    const map: AssignmentMap = {};
    for (const row of lineup.assignments) {
      map[row.slot] = row.player ?? null;
    }
    // Prefer board grouping when assignments empty but board has data
    const b = lineup.board;
    const put = (slot: LineupSlot, player: typeof b.goalies.starter) => {
      if (player) map[slot] = player;
    };
    b.forwardLines.forEach((line, i) => {
      const n = (i + 1) as 1 | 2 | 3 | 4;
      put(`F${n}_LW`, line.lw);
      put(`F${n}_C`, line.c);
      put(`F${n}_RW`, line.rw);
    });
    b.defensePairs.forEach((pair, i) => {
      const n = (i + 1) as 1 | 2 | 3;
      put(`D${n}_LD`, pair.ld);
      put(`D${n}_RD`, pair.rd);
    });
    put('G_STARTER', b.goalies.starter);
    put('G_BACKUP', b.goalies.backup);
    return map;
  }, [lineup]);

  async function runConfirmedAction() {
    if (!confirmKind || !lineup) return;
    if (!actionReason.trim()) {
      setActionError('Reason is required');
      return;
    }
    setActionBusy(true);
    setActionError(null);
    try {
      if (confirmKind === 'CLEAR') {
        await saveCommissionerTeamLineup(teamId, {
          expectedUpdatedAt: lineup.updatedAt,
          reason: actionReason.trim(),
          assignments: [],
        });
      } else {
        await autoFillCommissionerTeamLineup(teamId, {
          expectedUpdatedAt: lineup.updatedAt,
          reason: actionReason.trim(),
          mode: confirmKind,
        });
      }
      const [refreshed, teamRes] = await Promise.all([
        getTeamLineup(teamId),
        getTeam(teamId),
      ]);
      setLineup(refreshed.item);
      setTeam(teamRes.item);
      try {
        const chemRes = await getTeamChemistry(teamId);
        setChemistry(chemRes.item.chemistry);
        setChemistryError(null);
      } catch (chemErr: unknown) {
        setChemistry(null);
        setChemistryError(
          chemErr instanceof Error ? chemErr.message : 'Failed to load chemistry',
        );
      }
      setConfirmKind(null);
      setActionReason('');
    } catch (err: unknown) {
      setActionError(err instanceof Error ? err.message : 'Action failed');
    } finally {
      setActionBusy(false);
    }
  }

  if (loading) {
    return (
      <div style={{ padding: 20 }}>
        <LoadingState label="Loading team…" />
      </div>
    );
  }

  if (notFound) {
    return (
      <div style={{ padding: 20 }}>
        <BackLink to="/teams" label="Teams" />
        <RecordNotFound entity="Team" listHref="/teams" listLabel="Back to Teams" />
      </div>
    );
  }

  if (error || !team) {
    return (
      <div style={{ padding: 20 }}>
        <BackLink to="/teams" label="Teams" />
        <ErrorState description={error ?? 'Team unavailable'} />
      </div>
    );
  }

  const summary = team.lineupSummary;

  return (
    <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 16 }}>
      <BackLink to="/teams" label="Teams" />
      <div
        style={{
          background: 'var(--gradient-team-hero)',
          borderRadius: 'var(--radius-lg)',
          padding: '20px 24px',
          color: '#fff',
        }}
      >
        <PageHeader
          title={team.name}
          subtitle={[team.city, team.country?.name, team.league?.name, team.teamType]
            .filter(Boolean)
            .join(' · ')}
        />
      </div>

      <Tabs
        items={[
          { value: 'overview', label: 'Overview' },
          { value: 'roster', label: 'Roster' },
          { value: 'setup', label: 'Setup' },
          { value: 'lines', label: 'Lines' },
        ]}
        value={tab}
        onChange={(value) => setTab(value as typeof tab)}
      />

      {tab === 'overview' ? <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
          gap: 16,
        }}
      >
        <Panel title="Coach">
          {team.coach ? (
            <div style={{ font: 'var(--text-body-sm)', color: 'var(--text-secondary)' }}>
              <div style={{ color: 'var(--text-primary)', font: 'var(--text-heading-sm)' }}>
                {team.coach.firstName} {team.coach.lastName}
              </div>
              <div>{team.coach.coachingStyle}</div>
              <div>{team.coach.tacticalStyle}</div>
            </div>
          ) : (
            <EmptyState title="Unassigned" description="No current head coach." />
          )}
        </Panel>
        <Panel title="Roster summary">
          <Row label="Total" value={String(team.rosterSummary.total)} />
          {Object.entries(team.rosterSummary.byPosition).map(([k, v]) => (
            <Row key={k} label={k} value={String(v)} />
          ))}
          {Object.entries(team.rosterSummary.byRosterStatus).map(([k, v]) => (
            <Row key={k} label={k} value={String(v)} />
          ))}
          <Row
            label="Average age"
            value={
              team.rosterSummary.averageAge !== null
                ? String(team.rosterSummary.averageAge)
                : '—'
            }
          />
        </Panel>
        <Panel title="Source">
          <Row label="External ID" value={team.externalId ?? '—'} />
          <Row label="Dataset" value={team.sourceDataset ?? '—'} />
          <Row label="Source updated" value={team.sourceUpdatedAt ?? '—'} />
        </Panel>
        {summary ? (
          <Panel title="Lineup">
            <div style={{ marginBottom: 8 }}>
              <Badge tone={presenceTone(summary.presence)}>{summary.presence}</Badge>
            </div>
            <Row
              label="Validation"
              value={summary.validationStatus ?? '—'}
            />
            <Row
              label="Filled"
              value={`${summary.filledSlots}/${summary.requiredSlots}`}
            />
            <Row label="Updated" value={summary.updatedAt ?? '—'} />
          </Panel>
        ) : null}
      </div> : null}

      {tab === 'overview' && team.readiness ? <Panel title="Readiness">
        <Badge tone={team.readiness.status === 'READY' ? 'success' : team.readiness.status === 'WARNING' ? 'warning' : 'danger'}>{team.readiness.status}</Badge>
        {team.readiness.checks.map((check) => <Row key={check.code} label={check.label} value={`${check.result} · ${check.explanation}`} />)}
      </Panel> : null}

      {tab === 'roster' ? <Panel
        title="Roster preview"
        actions={
          <Link
            to={`/players?teamId=${team.id}`}
            style={{ font: 'var(--text-body-sm)', color: 'var(--text-link)' }}
          >
            Open in Players
          </Link>
        }
      >
        {team.roster.length === 0 ? (
          <EmptyState title="No players" description="This team has an empty roster." />
        ) : (
          <DataTable
            headers={[
              { key: 'player', label: 'Player' },
              { key: 'pos', label: 'Pos' },
              { key: 'sec', label: 'Secondary' },
              { key: 'ca', label: 'CA' },
              { key: 'role', label: 'Role' },
              { key: 'model', label: 'Model' },
              { key: 'status', label: 'Status' },
            ]}
          >
            {team.roster.map((p) => (
              <DataRow key={p.id} onActivate={() => navigate(`/players/${p.id}`)}>
                <Td primary>{playerLabel(p)}</Td>
                <Td>{p.primaryPosition}</Td>
                <Td>{secondaryLabel(p.secondaryPositions) || '—'}</Td>
                <Td>{p.currentAbility ?? '—'}</Td>
                <Td>{p.roleLabel ?? p.role ?? '—'}</Td>
                <Td>
                  <Badge tone={p.modelStatus === 'COMPLETE' ? 'success' : 'warning'}>
                    {p.modelStatus}
                  </Badge>
                </Td>
                <Td>
                  <Badge tone="neutral">{p.rosterStatus}</Badge>
                </Td>
              </DataRow>
            ))}
          </DataTable>
        )}
      </Panel> : null}
      {tab === 'setup' ? <Panel title="Team setup">
        <Row label="Tactical style" value={team.tacticalStyle ?? 'Not configured'} />
        <Row label="Head coach" value={team.coach ? `${team.coach.firstName} ${team.coach.lastName}` : 'Unassigned'} />
        <p style={{ margin: '12px 0 0', font: 'var(--text-body-sm)', color: 'var(--text-tertiary)' }}>
          Enable Commissioner Mode to change tactics, head coach assignment, or player roster status.
        </p>
      </Panel> : null}

      {tab === 'lines' ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <Panel
            title="Lines"
            actions={
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                {lineup ? (
                  <>
                    <Badge tone={presenceTone(lineup.presence)}>{lineup.presence}</Badge>
                    <Badge tone={validationTone(lineup.validation.status)}>
                      {lineup.validation.status}
                    </Badge>
                  </>
                ) : null}
                {enabled ? (
                  <>
                    <Button size="sm" onClick={() => navigate(`/teams/${teamId}/lines/edit`)}>
                      Edit Lines
                    </Button>
                    <Button size="sm" variant="secondary" onClick={() => setConfirmKind('REPLACE')}>
                      Auto-Lineup
                    </Button>
                    <Button size="sm" variant="secondary" onClick={() => setConfirmKind('FILL_EMPTY')}>
                      Fill Empty
                    </Button>
                    <Button size="sm" variant="danger" onClick={() => setConfirmKind('CLEAR')}>
                      Clear
                    </Button>
                  </>
                ) : (
                  <span style={{ font: 'var(--text-body-sm)', color: 'var(--text-tertiary)' }}>
                    Enable Commissioner Mode to edit lines.
                  </span>
                )}
              </div>
            }
          >
            {lineupLoading ? <LoadingState label="Loading lineup…" /> : null}
            {lineupError ? <ErrorState description={lineupError} /> : null}
            {!lineupLoading && !lineupError && lineup ? (
              <>
                <div style={{ marginBottom: 12, font: 'var(--text-body-sm)', color: 'var(--text-secondary)' }}>
                  {lineup.filledSlots}/{lineup.requiredSlots} slots filled
                  {lineup.updatedAt ? ` · updated ${lineup.updatedAt}` : ' · no saved lineup yet'}
                </div>
                {lineup.validation.errors.length > 0 || lineup.validation.warnings.length > 0 ? (
                  <div style={{ marginBottom: 12, display: 'flex', flexDirection: 'column', gap: 4 }}>
                    {lineup.validation.errors.map((issue, i) => (
                      <div key={`e-${i}`} style={{ font: 'var(--text-body-sm)', color: 'var(--accent-danger)' }}>
                        {issue.message}
                      </div>
                    ))}
                    {lineup.validation.warnings.map((issue, i) => (
                      <div key={`w-${i}`} style={{ font: 'var(--text-body-sm)', color: 'var(--accent-warning)' }}>
                        {issue.message}
                      </div>
                    ))}
                  </div>
                ) : null}
                <LineupBoard assignments={boardAssignments} />
              </>
            ) : null}
            {actionError ? <ErrorState description={actionError} /> : null}
          </Panel>
          {!lineupLoading && chemistryError ? (
            <ErrorState description={chemistryError} />
          ) : null}
          {!lineupLoading && !chemistryError && chemistry ? (
            <>
              <ChemistryOverallPanel chemistry={chemistry} />
              <ChemistryUnitsPanel chemistry={chemistry} />
            </>
          ) : null}
        </div>
      ) : null}

      <Dialog
        open={confirmKind !== null}
        title={
          confirmKind === 'CLEAR'
            ? 'Clear lineup?'
            : confirmKind === 'REPLACE'
              ? 'Run Auto-Lineup (REPLACE)?'
              : 'Fill empty slots?'
        }
        confirmLabel="Confirm"
        confirmVariant={confirmKind === 'CLEAR' ? 'danger' : 'primary'}
        busy={actionBusy}
        onClose={() => {
          setConfirmKind(null);
          setActionError(null);
        }}
        onConfirm={() => void runConfirmedAction()}
      >
        <p style={{ marginTop: 0 }}>
          {confirmKind === 'CLEAR'
            ? 'Removes all assignments and saves immediately.'
            : confirmKind === 'REPLACE'
              ? 'Replaces the entire lineup using auto-lineup rules and saves immediately.'
              : 'Fills empty slots only and saves immediately.'}
        </p>
        <Field label="Reason" htmlFor="lineup-action-reason">
          <TextInput
            id="lineup-action-reason"
            value={actionReason}
            onChange={(e) => setActionReason(e.target.value)}
            placeholder="Required audit reason"
          />
        </Field>
        {actionError ? (
          <p style={{ color: 'var(--accent-danger)', font: 'var(--text-body-sm)' }}>{actionError}</p>
        ) : null}
      </Dialog>
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
