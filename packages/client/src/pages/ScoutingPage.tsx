import { useCallback, useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { PageHeader } from '../components/layout/PageHeader';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { DataRow, DataTable, Field, SelectInput, Td, TextInput } from '../components/ui/DataBrowser';
import { EmptyState, ErrorState, LoadingState } from '../components/ui/EmptyState';
import { Panel } from '../components/ui/Panel';
import { Tabs } from '../components/ui/Tabs';
import {
  createCommissionerScout,
  createCommissionerScoutingDepartment,
  createScoutingAssignment,
  deleteCommissionerScout,
  deleteScoutingWatchlistEntry,
  executeScoutingAssignment,
  getCommissionerScout,
  getCommissionerScoutingConfiguration,
  getCommissionerScoutingDepartment,
  getCommissionerScoutingDiagnostics,
  getCountries,
  getScoutingAssignment,
  getScoutingOverview,
  getScoutingProspect,
  getTeams,
  listCommissionerScoutingDepartments,
  listCommissionerScouts,
  listScoutingAssignments,
  listScoutingProspects,
  listScoutingRankings,
  listScoutingReports,
  listScoutingWatchlist,
  previewScoutingAssignment,
  updateCommissionerScout,
  updateCommissionerScoutingDepartment,
  upsertScoutingWatchlistEntry,
  type CommissionerScoutingDepartment,
  type CountryItem,
  type ScoutPayload,
  type ScoutProfile,
  type ScoutingAssignment,
  type ScoutingAssignmentDetail,
  type ScoutingDiagnostics,
  type ScoutingEstimate,
  type ScoutingOverview,
  type ScoutingPreset,
  type ScoutingProspect,
  type ScoutingReport,
} from '../lib/api';
import { useCommissioner } from '../lib/commissioner';

type Tab = 'overview' | 'prospects' | 'watchlist' | 'assignments' | 'rankings' | 'reports' | 'department' | 'configuration' | 'diagnostics';
const tabs: Array<{ value: Tab; label: string; commissioner?: boolean }> = [
  { value: 'overview', label: 'Overview' },
  { value: 'prospects', label: 'Prospects' },
  { value: 'watchlist', label: 'Watchlist' },
  { value: 'assignments', label: 'Assignments' },
  { value: 'rankings', label: 'Rankings' },
  { value: 'reports', label: 'Reports' },
  { value: 'department', label: 'Department', commissioner: true },
  { value: 'configuration', label: 'Configuration', commissioner: true },
  { value: 'diagnostics', label: 'Diagnostics', commissioner: true },
];

function confidenceText(value?: number | null) {
  return value == null ? 'Unknown confidence' : `${Math.round(value * 100)}% confidence`;
}

function confidenceTone(value?: number | null): 'neutral' | 'warning' | 'info' | 'success' {
  if (value == null) return 'neutral';
  if (value < 0.4) return 'warning';
  if (value < 0.75) return 'info';
  return 'success';
}

function estimateText(estimate?: ScoutingEstimate | null) {
  if (!estimate || estimate.estimate == null) return 'Unknown';
  if (estimate.low != null && estimate.high != null) return `${estimate.low}–${estimate.high} (est. ${estimate.estimate})`;
  return `Estimate ${estimate.estimate}`;
}

function Estimate({ estimate, stale }: { estimate?: ScoutingEstimate | null; stale?: boolean }) {
  if (!estimate || estimate.estimate == null) return <Badge tone="neutral">Unknown</Badge>;
  return (
    <span style={{ display: 'inline-flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
      <strong>{estimateText(estimate)}</strong>
      <Badge tone={confidenceTone(estimate.confidence)}>{confidenceText(estimate.confidence)}</Badge>
      {stale ? <Badge tone="warning">Stale</Badge> : null}
    </span>
  );
}

function ProspectEstimate({ prospect }: { prospect: ScoutingProspect }) {
  return <Estimate estimate={prospect.report?.potential ?? prospect.report?.currentAbility} stale={prospect.report?.stale} />;
}

function Row({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, padding: '6px 0', borderBottom: '1px solid var(--border-subtle)', font: 'var(--text-body-sm)' }}>
      <span style={{ color: 'var(--text-tertiary)' }}>{label}</span>
      <span style={{ color: 'var(--text-primary)', textAlign: 'right' }}>{value}</span>
    </div>
  );
}

function formatDate(value?: string | null) {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString();
}

export function ScoutingLandingPage() {
  const [teams, setTeams] = useState<Array<{ id: string; name: string }>>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    getTeams({ page: 1, pageSize: 100, teamType: 'CLUB' }, controller.signal)
      .then((response) => setTeams(response.items))
      .catch((value: unknown) => !controller.signal.aborted && setError(value instanceof Error ? value.message : 'Unable to load clubs'))
      .finally(() => !controller.signal.aborted && setLoading(false));
    return () => controller.abort();
  }, []);
  return (
    <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 16 }}>
      <PageHeader title="Scouting" subtitle="Select a club to open its private scouting view." badge="F26" />
      {error ? <ErrorState description={error} /> : loading ? <LoadingState label="Loading clubs…" /> : (
        <Panel title="Club scouting departments">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))', gap: 10 }}>
            {teams.map((team) => <Link key={team.id} to={`/teams/${team.id}/scouting`} style={{ padding: 12, textDecoration: 'none', color: 'var(--text-primary)', background: 'var(--surface-panel-raised)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-md)' }}>{team.name}</Link>)}
          </div>
        </Panel>
      )}
    </div>
  );
}

interface WatchDraft { priority: string; note: string }

export function ScoutingPage() {
  const { teamId = '' } = useParams();
  const { enabled, requestEnable } = useCommissioner();
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const rawTab = params.get('tab') as Tab | null;
  const tab: Tab = tabs.some((item) => item.value === rawTab && (enabled || !item.commissioner)) ? rawTab! : 'overview';
  const visibleTabs = useMemo(() => tabs.filter((item) => enabled || !item.commissioner), [enabled]);

  const [overview, setOverview] = useState<ScoutingOverview | null>(null);
  const [prospects, setProspects] = useState<ScoutingProspect[]>([]);
  const [assignments, setAssignments] = useState<ScoutingAssignment[]>([]);
  const [reports, setReports] = useState<ScoutingReport[]>([]);
  const [countries, setCountries] = useState<CountryItem[]>([]);
  const [watchDrafts, setWatchDrafts] = useState<Record<string, WatchDraft>>({});
  const [department, setDepartment] = useState<CommissionerScoutingDepartment | null>(null);
  const [scouts, setScouts] = useState<ScoutProfile[]>([]);
  const [presets, setPresets] = useState<ScoutingPreset[]>([]);
  const [diagnostics, setDiagnostics] = useState<ScoutingDiagnostics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const today = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const [targetType, setTargetType] = useState<'PLAYER' | 'COUNTRY' | 'WATCHLIST'>('WATCHLIST');
  const [playerId, setPlayerId] = useState('');
  const [countryId, setCountryId] = useState('');
  const [selectedScoutIds, setSelectedScoutIds] = useState<string[]>([]);
  const [observedOn, setObservedOn] = useState(today);
  const [durationDays, setDurationDays] = useState('14');
  const [seed, setSeed] = useState(`scouting-${today}`);
  const [preview, setPreview] = useState<ScoutingAssignmentDetail | null>(null);
  const [departmentName, setDepartmentName] = useState('');
  const [departmentScoutIds, setDepartmentScoutIds] = useState<string[]>([]);

  const load = useCallback(async (signal?: AbortSignal) => {
    const base = await getScoutingOverview(teamId, signal);
    setOverview(base.item);
    if (selectedScoutIds.length === 0 && base.item.department?.scouts?.length) {
      setSelectedScoutIds(base.item.department.scouts.map((scout) => scout.id));
    }
    if (tab === 'prospects') setProspects((await listScoutingProspects(teamId, {}, signal)).items);
    if (tab === 'watchlist') {
      const items = (await listScoutingWatchlist(teamId, signal)).items;
      setProspects(items);
      setWatchDrafts(Object.fromEntries(items.map((item) => [item.playerId, { priority: String(item.watchlist?.priority ?? 0), note: item.watchlist?.notes ?? '' }])));
    }
    if (tab === 'assignments') {
      const [assignmentResponse, prospectResponse, countryResponse] = await Promise.all([
        listScoutingAssignments(teamId, signal),
        listScoutingProspects(teamId, {}, signal),
        getCountries(signal),
      ]);
      setAssignments(assignmentResponse.items);
      setProspects(prospectResponse.items);
      setCountries(countryResponse.items);
    }
    if (tab === 'rankings') setProspects((await listScoutingRankings(teamId, signal)).items);
    if (tab === 'reports') setReports((await listScoutingReports(teamId, signal)).items);
    if (enabled && tab === 'department') {
      const [departmentResponse, scoutResponse] = await Promise.all([
        getCommissionerScoutingDepartment(teamId, signal),
        listCommissionerScouts(signal),
      ]);
      setDepartment(departmentResponse.item);
      setScouts(scoutResponse.items);
      setDepartmentName(departmentResponse.item?.name ?? `${base.item.team.name} Scouting`);
      setDepartmentScoutIds(departmentResponse.item?.scouts.map((entry) => entry.scoutId) ?? []);
    }
    if (enabled && tab === 'configuration') setPresets((await getCommissionerScoutingConfiguration(signal)).items);
    if (enabled && tab === 'diagnostics') setDiagnostics((await getCommissionerScoutingDiagnostics(signal)).item);
  }, [enabled, selectedScoutIds.length, tab, teamId]);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    load(controller.signal)
      .then(() => setError(null))
      .catch((value: unknown) => !controller.signal.aborted && setError(value instanceof Error ? value.message : 'Scouting is unavailable'))
      .finally(() => !controller.signal.aborted && setLoading(false));
    return () => controller.abort();
  }, [load]);

  const assignmentPayload = () => ({
    targetType,
    ...(targetType === 'PLAYER' ? { playerIds: [playerId] } : {}),
    ...(targetType === 'COUNTRY' ? { countryId } : {}),
    scoutIds: selectedScoutIds,
    observedOn,
    durationDays: Number(durationDays),
    seed: seed.trim(),
  });
  const assignmentValid = selectedScoutIds.length > 0
    && Boolean(observedOn && seed.trim() && Number(durationDays) > 0)
    && (targetType !== 'PLAYER' || Boolean(playerId))
    && (targetType !== 'COUNTRY' || Boolean(countryId));

  const runAssignmentAction = async (mode: 'preview' | 'create') => {
    if (!assignmentValid) return;
    setBusy(true);
    setError(null);
    try {
      if (mode === 'preview') setPreview((await previewScoutingAssignment(teamId, assignmentPayload())).item);
      else {
        await createScoutingAssignment(teamId, assignmentPayload());
        setPreview(null);
        await load();
      }
    } catch (value) {
      setError(value instanceof Error ? value.message : `Unable to ${mode} assignment`);
    } finally {
      setBusy(false);
    }
  };

  const saveWatch = async (prospect: ScoutingProspect) => {
    const draft = watchDrafts[prospect.playerId] ?? { priority: '0', note: '' };
    setBusy(true);
    try {
      await upsertScoutingWatchlistEntry(teamId, prospect.playerId, { manualPriority: Number(draft.priority) || 0, note: draft.note.trim() || null });
      await load();
    } catch (value) {
      setError(value instanceof Error ? value.message : 'Unable to update watchlist');
    } finally {
      setBusy(false);
    }
  };

  const removeWatch = async (playerIdToRemove: string) => {
    setBusy(true);
    try {
      await deleteScoutingWatchlistEntry(teamId, playerIdToRemove);
      await load();
    } catch (value) {
      setError(value instanceof Error ? value.message : 'Unable to remove watchlist entry');
    } finally {
      setBusy(false);
    }
  };

  const saveDepartment = async () => {
    if (!departmentName.trim()) return;
    setBusy(true);
    try {
      if (department) await updateCommissionerScoutingDepartment(department.id, { name: departmentName.trim(), scoutIds: departmentScoutIds });
      else await createCommissionerScoutingDepartment({ teamId, name: departmentName.trim(), scoutIds: departmentScoutIds });
      await load();
    } catch (value) {
      setError(value instanceof Error ? value.message : 'Unable to save department');
    } finally {
      setBusy(false);
    }
  };

  if (loading) return <div style={{ padding: 20 }}><LoadingState label="Loading scouting department…" /></div>;
  return (
    <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 16 }}>
      <PageHeader title={overview?.team.name ? `${overview.team.name} Scouting` : 'Scouting'} subtitle="Team-private estimates and decision support · F26" badge={enabled ? 'Commissioner' : 'Club view'} actions={enabled ? <Badge tone="warning">Commissioner</Badge> : <Button variant="secondary" size="sm" onClick={requestEnable}>Commissioner controls</Button>} />
      {error ? <ErrorState description={error} /> : null}
      <Tabs items={visibleTabs} value={tab} onChange={(value) => setParams(value === 'overview' ? {} : { tab: value })} />

      {tab === 'overview' ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))', gap: 16 }}>
          <Panel title="Department">
            <Row label="Department" value={overview?.department?.name ?? 'Not configured'} />
            <Row label="Scouts" value={String(overview?.department?.scouts?.length ?? 0)} />
            <Row label="Prepared assignments" value={String(overview?.preparedAssignments ?? 0)} />
          </Panel>
          <Panel title="Decision support">
            <Row label="Published reports" value={String(overview?.reportCount ?? 0)} />
            <Row label="Watchlist" value={String(overview?.watchlistCount ?? 0)} />
            <p style={{ font: 'var(--text-body-sm)', color: 'var(--text-tertiary)' }}>All displayed ratings are uncertain scouting estimates. Missing knowledge remains Unknown.</p>
          </Panel>
        </div>
      ) : null}

      {(tab === 'prospects' || tab === 'watchlist' || tab === 'rankings') ? (
        <Panel title={tab === 'rankings' ? 'Suggested rankings' : tab === 'watchlist' ? 'Watchlist' : 'Prospects'}>
          {prospects.length === 0 ? <EmptyState title="No prospects" description="No team-visible scouting records match this view." /> : (
            <DataTable headers={tab === 'watchlist'
              ? [{ key: 'player', label: 'Player' }, { key: 'estimate', label: 'Potential estimate' }, { key: 'priority', label: 'Manual rank priority' }, { key: 'note', label: 'Notes' }, { key: 'actions', label: 'Actions' }]
              : tab === 'rankings'
                ? [{ key: 'rank', label: 'Rank' }, { key: 'player', label: 'Player' }, { key: 'estimate', label: 'Potential estimate' }, { key: 'score', label: 'Score' }, { key: 'reason', label: 'Reason' }]
                : [{ key: 'player', label: 'Player' }, { key: 'pos', label: 'Pos' }, { key: 'estimate', label: 'Potential estimate' }, { key: 'watch', label: 'Watchlist' }]}>
              {prospects.map((prospect) => (
                <DataRow key={prospect.playerId} onActivate={tab === 'watchlist' ? undefined : () => navigate(`/teams/${teamId}/scouting/prospects/${prospect.playerId}`)}>
                  {tab === 'rankings' ? <Td primary>{prospect.suggestedRank ?? '—'}</Td> : null}
                  <Td primary><Link to={`/teams/${teamId}/scouting/prospects/${prospect.playerId}`}>{prospect.playerName}</Link></Td>
                  {tab === 'prospects' ? <Td>{prospect.position ?? '—'}</Td> : null}
                  <Td><ProspectEstimate prospect={prospect} /></Td>
                  {tab === 'watchlist' ? (
                    <>
                      <Td><TextInput aria-label={`Priority for ${prospect.playerName}`} type="number" value={watchDrafts[prospect.playerId]?.priority ?? '0'} onChange={(event) => setWatchDrafts((current) => ({ ...current, [prospect.playerId]: { priority: event.target.value, note: current[prospect.playerId]?.note ?? '' } }))} style={{ width: 82 }} /></Td>
                      <Td><TextInput aria-label={`Notes for ${prospect.playerName}`} value={watchDrafts[prospect.playerId]?.note ?? ''} onChange={(event) => setWatchDrafts((current) => ({ ...current, [prospect.playerId]: { priority: current[prospect.playerId]?.priority ?? '0', note: event.target.value } }))} placeholder="Manual ranking note" /></Td>
                      <Td><div style={{ display: 'flex', gap: 6 }}><Button size="sm" disabled={busy} onClick={() => saveWatch(prospect)}>Save</Button><Button size="sm" variant="danger" disabled={busy} onClick={() => removeWatch(prospect.playerId)}>Remove</Button></div></Td>
                    </>
                  ) : tab === 'rankings' ? (
                    <><Td>{prospect.rankingScore ?? '—'}</Td><Td>{prospect.rankingReason ?? '—'}</Td></>
                  ) : (
                    <Td><Button size="sm" variant="secondary" disabled={busy} onClick={(event) => { event.stopPropagation(); setWatchDrafts((current) => ({ ...current, [prospect.playerId]: { priority: '3', note: '' } })); void upsertScoutingWatchlistEntry(teamId, prospect.playerId, { manualPriority: 3, note: null }).then(() => load()).catch((value: unknown) => setError(value instanceof Error ? value.message : 'Unable to add prospect')); }}>{prospect.watchlist ? `Priority ${prospect.watchlist.priority}` : 'Add'}</Button></Td>
                  )}
                </DataRow>
              ))}
            </DataTable>
          )}
        </Panel>
      ) : null}

      {tab === 'assignments' ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <Panel title="New assignment">
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 10, alignItems: 'end' }}>
              <Field label="Target type"><SelectInput value={targetType} onChange={(event) => { setTargetType(event.target.value as typeof targetType); setPreview(null); }}><option value="WATCHLIST">Current watchlist</option><option value="PLAYER">Specific player</option><option value="COUNTRY">Country</option></SelectInput></Field>
              {targetType === 'PLAYER' ? <Field label="Player (required)"><SelectInput required value={playerId} onChange={(event) => setPlayerId(event.target.value)}><option value="">Select a prospect</option>{prospects.map((prospect) => <option key={prospect.playerId} value={prospect.playerId}>{prospect.playerName} · {prospect.position}</option>)}</SelectInput></Field> : null}
              {targetType === 'COUNTRY' ? <Field label="Country (required)"><SelectInput required value={countryId} onChange={(event) => setCountryId(event.target.value)}><option value="">Select a country</option>{countries.map((country) => <option key={country.id} value={country.id}>{country.name} ({country.code})</option>)}</SelectInput></Field> : null}
              <Field label="Observed on"><TextInput required type="date" value={observedOn} onChange={(event) => setObservedOn(event.target.value)} /></Field>
              <Field label="Duration days"><TextInput required type="number" min={1} value={durationDays} onChange={(event) => setDurationDays(event.target.value)} /></Field>
              <Field label="Deterministic seed"><TextInput required value={seed} onChange={(event) => setSeed(event.target.value)} /></Field>
            </div>
            <div style={{ marginTop: 12 }}>
              <div style={{ font: 'var(--text-label)', color: 'var(--text-tertiary)', marginBottom: 6 }}>ASSIGNED SCOUTS (AT LEAST ONE REQUIRED)</div>
              {overview?.department?.scouts?.length ? overview.department.scouts.map((scout) => <label key={scout.id} style={{ marginRight: 16, font: 'var(--text-body-sm)', color: 'var(--text-secondary)' }}><input type="checkbox" checked={selectedScoutIds.includes(scout.id)} onChange={() => setSelectedScoutIds((current) => current.includes(scout.id) ? current.filter((id) => id !== scout.id) : [...current, scout.id])} /> {scout.name} ({scout.role})</label>) : <span style={{ color: 'var(--status-warning)' }}>No scouts assigned to this department.</span>}
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
              <Button variant="secondary" disabled={busy || !assignmentValid} onClick={() => runAssignmentAction('preview')}>Preview</Button>
              <Button disabled={busy || !assignmentValid} onClick={() => runAssignmentAction('create')}>Create prepared assignment</Button>
            </div>
            {preview ? <p style={{ color: 'var(--text-secondary)' }}>Preview: {preview.targetCount} targets. No reports were changed.</p> : null}
          </Panel>
          <Panel title="Assignments">
            {assignments.length === 0 ? <EmptyState title="No assignments" description="Create an assignment to collect estimates." /> : assignments.map((assignment) => <Link key={assignment.id} to={`/teams/${teamId}/scouting/assignments/${assignment.id}`} style={{ display: 'block', padding: 10, borderBottom: '1px solid var(--border-subtle)', color: 'var(--text-primary)', textDecoration: 'none' }}>{assignment.targetType} · {assignment.status} · {assignment.scouts?.map((scout) => scout.name).join(', ') || 'No scouts'} · {formatDate(assignment.createdAt)}</Link>)}
          </Panel>
        </div>
      ) : null}

      {tab === 'reports' ? (
        <Panel title="Published reports">
          {reports.length === 0 ? <EmptyState title="No reports" description="Completed assignments publish team-visible estimates here." /> : reports.map((entry) => (
            <div key={entry.id} style={{ padding: '12px 0', borderBottom: '1px solid var(--border-subtle)' }}>
              <Link to={`/teams/${teamId}/scouting/prospects/${entry.playerId}`}>{entry.playerName ?? 'Unknown prospect'}</Link>
              <div style={{ marginTop: 6 }}><Estimate estimate={entry.report.potential} /></div>
              <div style={{ marginTop: 6, color: 'var(--text-tertiary)', font: 'var(--text-body-sm)' }}>Report v{entry.report.versionNumber} · {confidenceText(entry.report.confidence)} · {formatDate(entry.report.createdAt)}</div>
            </div>
          ))}
        </Panel>
      ) : null}

      {tab === 'department' && enabled ? (
        <Panel title="Department management">
          <div style={{ display: 'flex', gap: 10, alignItems: 'end', flexWrap: 'wrap' }}>
            <Field label="Department name"><TextInput value={departmentName} onChange={(event) => setDepartmentName(event.target.value)} /></Field>
            <Button disabled={busy || !departmentName.trim()} onClick={saveDepartment}>{department ? 'Save department' : 'Create department'}</Button>
          </div>
          <div style={{ marginTop: 14, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))', gap: 8 }}>
            {scouts.map((scout) => <label key={scout.id} style={{ padding: 10, border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-md)', color: 'var(--text-secondary)' }}><input type="checkbox" checked={departmentScoutIds.includes(scout.id)} onChange={() => setDepartmentScoutIds((current) => current.includes(scout.id) ? current.filter((id) => id !== scout.id) : [...current, scout.id])} /> <Link to={`/scouts/${scout.id}`}>{scout.name}</Link><div style={{ marginLeft: 20, font: 'var(--text-data-sm)' }}>Evaluate {scout.evaluatingRating} · Potential {scout.potentialRating}</div></label>)}
          </div>
          {scouts.length === 0 ? <p><Link to="/scouts">Create scouts</Link> before staffing this department.</p> : null}
        </Panel>
      ) : null}

      {tab === 'configuration' && enabled ? (
        <Panel title="Scouting configurations">
          {presets.length === 0 ? <EmptyState title="No configurations" description="No scouting calibration presets are available." /> : <DataTable headers={[{ key: 'name', label: 'Preset' }, { key: 'kind', label: 'Type' }, { key: 'versions', label: 'Versions' }, { key: 'latest', label: 'Latest schema/hash' }]}>{presets.map((preset) => { const latest = preset.versions?.at(-1); return <DataRow key={preset.id}><Td primary>{preset.name}<div style={{ color: 'var(--text-tertiary)' }}>{preset.description}</div></Td><Td>{preset.isSystem ? 'System' : 'Commissioner'}</Td><Td>{preset.versions?.length ?? 0}</Td><Td>{latest ? `v${latest.versionNumber} · schema ${latest.schemaVersion} · ${latest.configHash.slice(0, 10)}…` : '—'}</Td></DataRow>; })}</DataTable>}
        </Panel>
      ) : null}

      {tab === 'diagnostics' && enabled ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: 16 }}>
          <Panel title="Active calibration"><Row label="Preset" value={diagnostics?.active.preset.name ?? 'Unknown'} /><Row label="Version" value={diagnostics ? `v${diagnostics.active.version.versionNumber}` : 'Unknown'} /><Row label="Schema" value={String(diagnostics?.active.version.schemaVersion ?? 'Unknown')} /><Row label="Hash" value={diagnostics?.active.version.configHash ? `${diagnostics.active.version.configHash.slice(0, 14)}…` : 'Unknown'} /></Panel>
          <Panel title="Pipeline totals"><Row label="Assignments" value={String(diagnostics?.assignments ?? 0)} /><Row label="Observations" value={String(diagnostics?.observations ?? 0)} /><Row label="Published reports" value={String(diagnostics?.reports ?? 0)} /></Panel>
        </div>
      ) : null}
    </div>
  );
}

export function ScoutingAssignmentPage() {
  const { teamId = '', assignmentId = '' } = useParams();
  const [item, setItem] = useState<ScoutingAssignmentDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const reload = useCallback(() => getScoutingAssignment(teamId, assignmentId).then((response) => { setItem(response.item); setError(null); }).catch((value: unknown) => setError(value instanceof Error ? value.message : 'Unable to load assignment')), [assignmentId, teamId]);
  useEffect(() => { void reload(); }, [reload]);
  if (!item && !error) return <div style={{ padding: 20 }}><LoadingState label="Loading assignment…" /></div>;
  return (
    <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 16 }}>
      <Link to={`/teams/${teamId}/scouting?tab=assignments`}>← Assignments</Link>
      <PageHeader title={`${item?.targetType ?? 'Scouting'} assignment`} subtitle={item ? `${item.status} · created ${formatDate(item.createdAt)}` : 'Assignment'} />
      {error ? <ErrorState description={error} /> : null}
      {item ? <Panel title="Assignment details" actions={<Button disabled={busy || item.status !== 'PREPARED'} onClick={async () => { setBusy(true); setError(null); try { await executeScoutingAssignment(teamId, assignmentId); await reload(); } catch (value) { setError(value instanceof Error ? value.message : 'Unable to execute assignment'); } finally { setBusy(false); } }}>Execute assignment</Button>}><Row label="Status" value={<Badge tone={item.status === 'COMPLETED' ? 'success' : 'info'}>{item.status}</Badge>} /><Row label="Targets" value={String(item.targetCount)} /><Row label="Observed on" value={item.observedOn ?? '—'} /><Row label="Duration" value={item.durationDays ? `${item.durationDays} days` : '—'} /><Row label="Scouts" value={item.scouts?.map((scout) => scout.name).join(', ') || '—'} /><Row label="Completed" value={formatDate(item.completedAt)} /></Panel> : null}
    </div>
  );
}

export function ScoutingProspectPage() {
  const { teamId = '', playerId = '' } = useParams();
  const [item, setItem] = useState<(ScoutingProspect & { observations?: Array<{ id: string; scoutId: string; observedOn: string; createdAt: string }> }) | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    getScoutingProspect(teamId, playerId, controller.signal).then((response) => setItem(response.item)).catch((value: unknown) => !controller.signal.aborted && setError(value instanceof Error ? value.message : 'Unable to load prospect'));
    return () => controller.abort();
  }, [playerId, teamId]);
  return (
    <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 16 }}>
      <Link to={`/teams/${teamId}/scouting?tab=prospects`}>← Prospects</Link>
      {error ? <ErrorState description={error} /> : !item ? <LoadingState label="Loading prospect report…" /> : (
        <>
          <PageHeader title={item.playerName} subtitle={[item.position, item.teamName, item.nationality].filter(Boolean).join(' · ')} badge="Private scouting report" />
          <Panel title="Team scouting estimates">
            <Row label="Current ability" value={<Estimate estimate={item.report?.currentAbility} stale={item.report?.stale} />} />
            <Row label="Potential" value={<Estimate estimate={item.report?.potential} stale={item.report?.stale} />} />
            <Row label="Overall confidence" value={<Badge tone={confidenceTone(item.report?.confidence)}>{confidenceText(item.report?.confidence)}</Badge>} />
            <Row label="Observed" value={formatDate(item.report?.observedAt)} />
            <Row label="Strengths" value={item.report?.strengths?.join(', ') || 'Unknown'} />
            <Row label="Weaknesses" value={item.report?.weaknesses?.join(', ') || 'Unknown'} />
            <p style={{ font: 'var(--text-body-sm)', color: 'var(--text-tertiary)' }}>This page contains estimates only. Hidden player quality and true potential are never returned by the team scouting routes.</p>
          </Panel>
          <Panel title="Observation history"><Row label="Observations" value={String(item.observations?.length ?? 0)} />{item.observations?.map((observation) => <Row key={observation.id} label={observation.observedOn} value={`Scout ${observation.scoutId}`} />)}</Panel>
        </>
      )}
    </div>
  );
}

const emptyScout: ScoutPayload = {
  firstName: '',
  lastName: '',
  evaluatingRating: 10,
  potentialRating: 10,
  skaterRating: 10,
  goalieRating: 10,
  specialties: ['GENERAL'],
  countryFamiliarity: {},
  positionFamiliarity: {},
  persistentBias: 0,
};

function ScoutForm({ value, onChange, onSubmit, submitLabel, busy }: { value: ScoutPayload; onChange: (value: ScoutPayload) => void; onSubmit: () => void; submitLabel: string; busy: boolean }) {
  const rating = (key: 'evaluatingRating' | 'potentialRating' | 'skaterRating' | 'goalieRating') => <TextInput required type="number" min={1} max={20} value={String(value[key])} onChange={(event) => onChange({ ...value, [key]: Number(event.target.value) })} />;
  return (
    <form onSubmit={(event: FormEvent) => { event.preventDefault(); onSubmit(); }} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10 }}>
        <Field label="First name"><TextInput required value={value.firstName} onChange={(event) => onChange({ ...value, firstName: event.target.value })} /></Field>
        <Field label="Last name"><TextInput required value={value.lastName} onChange={(event) => onChange({ ...value, lastName: event.target.value })} /></Field>
        <Field label="Evaluation">{rating('evaluatingRating')}</Field>
        <Field label="Potential">{rating('potentialRating')}</Field>
        <Field label="Skaters">{rating('skaterRating')}</Field>
        <Field label="Goalies">{rating('goalieRating')}</Field>
        <Field label="Persistent bias"><TextInput type="number" min={-5} max={5} step="0.1" value={String(value.persistentBias)} onChange={(event) => onChange({ ...value, persistentBias: Number(event.target.value) })} /></Field>
      </div>
      <div><span style={{ font: 'var(--text-label)', color: 'var(--text-tertiary)' }}>SPECIALTIES </span>{(['GENERAL', 'SKATER', 'GOALIE', 'POTENTIAL'] as const).map((specialty) => <label key={specialty} style={{ marginLeft: 12, color: 'var(--text-secondary)' }}><input type="checkbox" checked={value.specialties.includes(specialty)} onChange={() => onChange({ ...value, specialties: value.specialties.includes(specialty) ? value.specialties.filter((item) => item !== specialty) : [...value.specialties, specialty] })} /> {specialty}</label>)}</div>
      <Button type="submit" disabled={busy || !value.firstName.trim() || !value.lastName.trim()}>{submitLabel}</Button>
    </form>
  );
}

export function ScoutsPage() {
  const { enabled, requestEnable } = useCommissioner();
  const navigate = useNavigate();
  const [scouts, setScouts] = useState<ScoutProfile[]>([]);
  const [draft, setDraft] = useState<ScoutPayload>(emptyScout);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const load = useCallback(() => listCommissionerScouts().then((response) => setScouts(response.items)), []);
  useEffect(() => { if (enabled) void load().catch((value: unknown) => setError(value instanceof Error ? value.message : 'Unable to load scouts')); }, [enabled, load]);
  return (
    <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 16 }}>
      <PageHeader title="Scouts" subtitle="Commissioner scout management" badge="F26" />
      {!enabled ? <Panel title="Commissioner Mode required"><p>Scout management is administrative. Club scouting exposes only private estimates.</p><Button onClick={requestEnable}>Enable Commissioner Mode</Button></Panel> : (
        <>
          {error ? <ErrorState description={error} /> : null}
          <Panel title="Create scout"><ScoutForm value={draft} onChange={setDraft} busy={busy} submitLabel="Create scout" onSubmit={async () => { setBusy(true); setError(null); try { await createCommissionerScout(draft); setDraft(emptyScout); await load(); } catch (value) { setError(value instanceof Error ? value.message : 'Unable to create scout'); } finally { setBusy(false); } }} /></Panel>
          <Panel title="Scout directory">{scouts.length === 0 ? <EmptyState title="No scouts" description="Create the first scout above." /> : <DataTable headers={[{ key: 'name', label: 'Scout' }, { key: 'eval', label: 'Evaluation' }, { key: 'pot', label: 'Potential' }, { key: 'specialty', label: 'Specialties' }]}>{scouts.map((scout) => <DataRow key={scout.id} onActivate={() => navigate(`/scouts/${scout.id}`)}><Td primary><Link to={`/scouts/${scout.id}`}>{scout.name}</Link></Td><Td>{scout.evaluatingRating}/20</Td><Td>{scout.potentialRating}/20</Td><Td>{scout.specialties.join(', ') || 'None'}</Td></DataRow>)}</DataTable>}</Panel>
        </>
      )}
    </div>
  );
}

export function ScoutDetailPage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const { enabled, requestEnable } = useCommissioner();
  const [scout, setScout] = useState<ScoutProfile | null>(null);
  const [departments, setDepartments] = useState<CommissionerScoutingDepartment[]>([]);
  const [draft, setDraft] = useState<ScoutPayload>(emptyScout);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    const [scoutResponse, departmentResponse] = await Promise.all([getCommissionerScout(id), listCommissionerScoutingDepartments()]);
    setScout(scoutResponse.item);
    setDepartments(departmentResponse.items.filter((department) => department.scouts.some((entry) => entry.scoutId === id)));
    setDraft({
      firstName: scoutResponse.item.firstName,
      lastName: scoutResponse.item.lastName,
      evaluatingRating: scoutResponse.item.evaluatingRating,
      potentialRating: scoutResponse.item.potentialRating,
      skaterRating: scoutResponse.item.skaterRating,
      goalieRating: scoutResponse.item.goalieRating,
      specialties: scoutResponse.item.specialties.filter((value): value is ScoutPayload['specialties'][number] => ['GENERAL', 'SKATER', 'GOALIE', 'POTENTIAL'].includes(value)),
      countryFamiliarity: scoutResponse.item.countryFamiliarity,
      positionFamiliarity: scoutResponse.item.positionFamiliarity,
      persistentBias: scoutResponse.item.persistentBias,
    });
  }, [id]);
  useEffect(() => { if (enabled) void load().catch((value: unknown) => setError(value instanceof Error ? value.message : 'Unable to load scout')); }, [enabled, load]);
  if (!enabled) return <div style={{ padding: 20 }}><Panel title="Commissioner Mode required"><Button onClick={requestEnable}>Enable Commissioner Mode</Button></Panel></div>;
  return (
    <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 16 }}>
      <Link to="/scouts">← Scouts</Link>
      {error ? <ErrorState description={error} /> : !scout ? <LoadingState label="Loading scout…" /> : (
        <>
          <PageHeader title={scout.name} subtitle={departments.length ? departments.map((department) => department.team.name).join(', ') : 'Unassigned scout'} badge="Commissioner" />
          <Panel title="Edit scout"><ScoutForm value={draft} onChange={setDraft} busy={busy} submitLabel="Save scout" onSubmit={async () => { setBusy(true); setError(null); try { await updateCommissionerScout(id, draft); await load(); } catch (value) { setError(value instanceof Error ? value.message : 'Unable to save scout'); } finally { setBusy(false); } }} /></Panel>
          <Panel title="Department assignments">{departments.length ? departments.map((department) => <Row key={department.id} label={department.team.name} value={<Link to={`/teams/${department.teamId}/scouting?tab=department`}>{department.name}</Link>} />) : <p style={{ color: 'var(--text-tertiary)' }}>This scout is not assigned to a department.</p>}</Panel>
          <Panel title="Danger zone"><Button variant="danger" disabled={busy || departments.length > 0} onClick={async () => { if (!window.confirm(`Delete ${scout.name}?`)) return; setBusy(true); try { await deleteCommissionerScout(id); navigate('/scouts'); } catch (value) { setError(value instanceof Error ? value.message : 'Unable to delete scout'); } finally { setBusy(false); } }}>Delete scout</Button>{departments.length ? <p style={{ color: 'var(--status-warning)' }}>Remove this scout from all departments before deletion.</p> : null}</Panel>
        </>
      )}
    </div>
  );
}
