import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { PageHeader } from '../components/layout/PageHeader';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { DataRow, DataTable, Field, SelectInput, Td, TextInput } from '../components/ui/DataBrowser';
import { Dialog } from '../components/ui/Dialog';
import { EmptyState, ErrorState, LoadingState } from '../components/ui/EmptyState';
import { Panel } from '../components/ui/Panel';
import { Tabs } from '../components/ui/Tabs';
import {
  activateYouthProfileSetVersion,
  createCountryNamePool,
  createYouthProfileSet,
  discardYouthGenerationRun,
  executeYouthGenerationRun,
  getYouthCountries,
  getYouthGenerationReadiness,
  getYouthGenerationRunDiagnostics,
  getYouthGenerationStatus,
  getWorldSummary,
  listYouthCohorts,
  listYouthGeneratedPlayers,
  listYouthGenerationRuns,
  listYouthProfileSets,
  prepareYouthGenerationRun,
  previewYouthGeneration,
  type YouthCountryProfileRow,
  type YouthCohortDto,
  type YouthGeneratedPlayerDto,
  type YouthGenerationReadiness,
  type YouthGenerationRunDiagnostics,
  type YouthGenerationStatus,
  type YouthPreviewResponse,
  type YouthProfileSetSummary,
  type YouthRunDto,
  type YouthRunSummaryDto,
} from '../lib/api';
import { useCommissioner } from '../lib/commissioner';

type YouthTab =
  | 'overview'
  | 'preview'
  | 'runs'
  | 'cohorts'
  | 'prospects'
  | 'country-profiles'
  | 'name-pools'
  | 'diagnostics';

const TAB_ITEMS: Array<{ value: YouthTab; label: string; commissionerOnly?: boolean }> = [
  { value: 'overview', label: 'Overview' },
  { value: 'preview', label: 'Preview', commissionerOnly: true },
  { value: 'runs', label: 'Runs' },
  { value: 'cohorts', label: 'Cohorts' },
  { value: 'prospects', label: 'Prospects' },
  { value: 'country-profiles', label: 'Country Profiles' },
  { value: 'name-pools', label: 'Name Pools', commissionerOnly: true },
  { value: 'diagnostics', label: 'Diagnostics', commissionerOnly: true },
];

function parseTab(raw: string | null, commissioner: boolean): YouthTab {
  const allowed = TAB_ITEMS.filter((t) => commissioner || !t.commissionerOnly).map((t) => t.value);
  if (raw && allowed.includes(raw as YouthTab)) return raw as YouthTab;
  return 'overview';
}

function runStatusTone(status: string): 'success' | 'warning' | 'danger' | 'neutral' | 'info' {
  if (status === 'COMPLETED') return 'success';
  if (status === 'PREPARED' || status === 'RUNNING') return 'warning';
  if (status === 'FAILED') return 'danger';
  if (status === 'CANCELLED') return 'neutral';
  return 'info';
}

function readinessTone(status: string): 'success' | 'warning' | 'danger' {
  if (status === 'READY') return 'success';
  if (status === 'WARNING') return 'warning';
  return 'danger';
}

function playerLabel(p: YouthGeneratedPlayerDto): string {
  return (
    p.displayName ??
    p.playerName ??
    (`${p.firstName ?? ''} ${p.lastName ?? ''}`.trim() || '—')
  );
}

function SummaryCards({ summary }: { summary: YouthRunSummaryDto }) {
  const cards = [
    { label: 'Countries', value: `${summary.enabledCountryCount}/${summary.countryCount}` },
    { label: 'Players', value: String(summary.totalGeneratedPlayers) },
    { label: 'Age 15', value: String(summary.age15Count) },
    { label: 'Age 16', value: String(summary.age16Count) },
    { label: 'Age 17', value: String(summary.age17Count) },
    { label: 'Skaters', value: String(summary.skaterCount) },
    { label: 'Goalies', value: String(summary.goalieCount) },
    { label: 'Warnings', value: String(summary.warningCount) },
  ];
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
      {cards.map((c) => (
        <div
          key={c.label}
          style={{
            padding: '10px 12px',
            background: 'var(--surface-panel-raised)',
            border: '1px solid var(--border-subtle)',
            borderRadius: 'var(--radius-md)',
            minWidth: 100,
            flex: '1 1 100px',
          }}
        >
          <div style={{ font: 'var(--text-label-wide)', color: 'var(--text-tertiary)', textTransform: 'uppercase' }}>
            {c.label}
          </div>
          <div style={{ marginTop: 4, font: 'var(--text-heading-sm)', color: 'var(--text-primary)' }}>{c.value}</div>
        </div>
      ))}
    </div>
  );
}

function CommissionerGate({ onEnable }: { onEnable: () => void }) {
  return (
    <Panel title="Commissioner Mode required">
      <p style={{ margin: '0 0 12px', font: 'var(--text-body-sm)', color: 'var(--text-secondary)' }}>
        Preview, prepare, execute, name pools, and diagnostics require Commissioner Mode. Read-only run
        summaries remain available in normal mode.
      </p>
      <Button variant="danger" onClick={onEnable}>
        Enable Commissioner Mode
      </Button>
    </Panel>
  );
}

export function YouthGenerationPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { enabled, requestEnable } = useCommissioner();

  const tab = parseTab(searchParams.get('tab'), enabled);
  const setTab = useCallback(
    (value: string) => {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          if (value === 'overview') next.delete('tab');
          else next.set('tab', value);
          return next;
        },
        { replace: true },
      );
    },
    [setSearchParams],
  );

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<YouthGenerationStatus | null>(null);
  const [readiness, setReadiness] = useState<YouthGenerationReadiness | null>(null);
  const [runs, setRuns] = useState<YouthRunDto[]>([]);
  const [profileSets, setProfileSets] = useState<YouthProfileSetSummary[]>([]);
  const [countries, setCountries] = useState<YouthCountryProfileRow[]>([]);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [referenceDate, setReferenceDate] = useState('');
  const [baseSeed, setBaseSeed] = useState('youth-generation-preview');
  const [profileSetVersionId, setProfileSetVersionId] = useState('');
  const [preview, setPreview] = useState<YouthPreviewResponse | null>(null);

  const [cohorts, setCohorts] = useState<YouthCohortDto[]>([]);
  const [prospects, setProspects] = useState<YouthGeneratedPlayerDto[]>([]);
  const [prospectsPage, setProspectsPage] = useState(1);
  const [prospectsTotal, setProspectsTotal] = useState(0);
  const [countryFilter, setCountryFilter] = useState('');

  const [diagnostics, setDiagnostics] = useState<YouthGenerationRunDiagnostics | null>(null);
  const [diagnosticsRunId, setDiagnosticsRunId] = useState('');

  const [prepareOpen, setPrepareOpen] = useState(false);
  const [prepareReason, setPrepareReason] = useState('');
  const [executeOpen, setExecuteOpen] = useState(false);
  const [executeReason, setExecuteReason] = useState('');
  const [discardOpen, setDiscardOpen] = useState(false);
  const [discardReason, setDiscardReason] = useState('');

  const [createPresetOpen, setCreatePresetOpen] = useState(false);
  const [newPresetName, setNewPresetName] = useState('');
  const [newPresetReason, setNewPresetReason] = useState('');
  const [activateOpen, setActivateOpen] = useState(false);
  const [activateVersionId, setActivateVersionId] = useState('');
  const [activateReason, setActivateReason] = useState('');

  const [namePoolOpen, setNamePoolOpen] = useState(false);
  const [namePoolCountry, setNamePoolCountry] = useState<YouthCountryProfileRow | null>(null);
  const [namePoolName, setNamePoolName] = useState('');
  const [namePoolFirstNames, setNamePoolFirstNames] = useState('');
  const [namePoolLastNames, setNamePoolLastNames] = useState('');
  const [namePoolReason, setNamePoolReason] = useState('');

  const worldSeasonId = status?.worldSeason.id ?? '';
  const currentRun = status?.currentCompletedRun ?? null;
  const activeRun = status?.activeRun ?? null;
  const resultsRunId = currentRun?.id ?? runs.find((r) => r.status === 'COMPLETED')?.id ?? '';

  const visibleTabs = useMemo(
    () => TAB_ITEMS.filter((t) => enabled || !t.commissionerOnly),
    [enabled],
  );

  const reload = useCallback(async (signal?: AbortSignal) => {
    const statusRes = await getYouthGenerationStatus(undefined, signal);
    const wsId = statusRes.item.worldSeason.id;
    const [readinessRes, runsRes, profileSetsRes, countriesRes, worldRes] = await Promise.all([
      getYouthGenerationReadiness({ worldSeasonId: wsId }, signal),
      listYouthGenerationRuns(wsId, signal),
      listYouthProfileSets(signal),
      getYouthCountries(signal),
      getWorldSummary(signal),
    ]);
    setStatus(statusRes.item);
    setReadiness(readinessRes.item);
    setRuns(runsRes.items);
    setProfileSets(profileSetsRes.items);
    setCountries(countriesRes.item.items);
    setReferenceDate((prev) => prev || (worldRes.season ? `${worldRes.season.endYear}-07-01` : ''));
    setProfileSetVersionId(
      (prev) => prev || statusRes.item.activeConfig?.versionId || countriesRes.item.activeProfileSetVersionId,
    );
    setError(null);
  }, []);

  useEffect(() => {
    const c = new AbortController();
    setLoading(true);
    reload(c.signal)
      .catch((err: unknown) => {
        if (c.signal.aborted) return;
        setError(err instanceof Error ? err.message : 'Failed to load youth generation status');
      })
      .finally(() => {
        if (!c.signal.aborted) setLoading(false);
      });
    return () => c.abort();
  }, [reload]);

  useEffect(() => {
    if (!enabled && (tab === 'preview' || tab === 'name-pools' || tab === 'diagnostics')) {
      setTab('overview');
    }
  }, [enabled, tab, setTab]);

  useEffect(() => {
    if (tab !== 'cohorts' || !resultsRunId) return;
    const c = new AbortController();
    listYouthCohorts(resultsRunId, { page: 1, pageSize: 100 }, c.signal)
      .then((res) => setCohorts(res.items))
      .catch(() => {
        if (!c.signal.aborted) setCohorts([]);
      });
    return () => c.abort();
  }, [tab, resultsRunId]);

  useEffect(() => {
    if (tab !== 'prospects' || !resultsRunId) return;
    const c = new AbortController();
    listYouthGeneratedPlayers(
      resultsRunId,
      { page: prospectsPage, pageSize: 50, countryId: countryFilter || undefined },
      c.signal,
    )
      .then((res) => {
        setProspects(res.items);
        setProspectsTotal(res.total);
      })
      .catch(() => {
        if (!c.signal.aborted) setProspects([]);
      });
    return () => c.abort();
  }, [tab, resultsRunId, prospectsPage, countryFilter]);

  useEffect(() => {
    if (tab !== 'diagnostics' || !enabled) return;
    const runId = diagnosticsRunId || activeRun?.id || currentRun?.id || '';
    if (!runId) return;
    const c = new AbortController();
    getYouthGenerationRunDiagnostics(runId, c.signal)
      .then((res) => setDiagnostics(res.item))
      .catch(() => {
        if (!c.signal.aborted) setDiagnostics(null);
      });
    return () => c.abort();
  }, [tab, enabled, diagnosticsRunId, activeRun?.id, currentRun?.id]);

  const handlePreview = async () => {
    if (!worldSeasonId || !referenceDate || !baseSeed) return;
    setBusy(true);
    setActionError(null);
    try {
      const res = await previewYouthGeneration({
        worldSeasonId,
        referenceDate,
        baseSeed,
        profileSetVersionId: profileSetVersionId || undefined,
        page: 1,
        pageSize: 100,
      });
      setPreview(res.item);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Preview failed');
    } finally {
      setBusy(false);
    }
  };

  const handlePrepare = async () => {
    if (!status || !prepareReason.trim()) return;
    setBusy(true);
    setActionError(null);
    try {
      await prepareYouthGenerationRun({
        worldSeasonId: status.worldSeason.id,
        expectedWorldSeasonUpdatedAt: status.worldSeason.updatedAt,
        referenceDate,
        baseSeed,
        profileSetVersionId: profileSetVersionId || undefined,
        reason: prepareReason.trim(),
      });
      setPrepareOpen(false);
      setPrepareReason('');
      await reload();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Prepare failed');
    } finally {
      setBusy(false);
    }
  };

  const handleExecute = async () => {
    if (!activeRun || !executeReason.trim()) return;
    setBusy(true);
    setActionError(null);
    try {
      await executeYouthGenerationRun(activeRun.id, {
        confirmation: true,
        reason: executeReason.trim(),
      });
      setExecuteOpen(false);
      setExecuteReason('');
      await reload();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Execute failed');
    } finally {
      setBusy(false);
    }
  };

  const handleDiscard = async () => {
    if (!activeRun || !discardReason.trim()) return;
    setBusy(true);
    setActionError(null);
    try {
      await discardYouthGenerationRun(activeRun.id, { reason: discardReason.trim() });
      setDiscardOpen(false);
      setDiscardReason('');
      await reload();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Discard failed');
    } finally {
      setBusy(false);
    }
  };

  const handleCreatePreset = async () => {
    if (!newPresetName.trim() || !newPresetReason.trim()) return;
    setBusy(true);
    setActionError(null);
    try {
      await createYouthProfileSet({
        name: newPresetName.trim(),
        reason: newPresetReason.trim(),
      });
      setCreatePresetOpen(false);
      setNewPresetName('');
      setNewPresetReason('');
      await reload();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Create profile set failed');
    } finally {
      setBusy(false);
    }
  };

  const handleActivate = async () => {
    if (!activateVersionId || !activateReason.trim()) return;
    setBusy(true);
    setActionError(null);
    try {
      await activateYouthProfileSetVersion(activateVersionId, {
        reason: activateReason.trim(),
        expectedActiveVersionId: status?.activeConfig?.versionId,
      });
      setActivateOpen(false);
      setActivateReason('');
      setActivateVersionId('');
      await reload();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Activate failed');
    } finally {
      setBusy(false);
    }
  };

  const handleCreateNamePool = async () => {
    if (!namePoolCountry || !namePoolName.trim() || !namePoolReason.trim()) return;
    const firstNames = namePoolFirstNames.split('\n').map((s) => s.trim()).filter(Boolean);
    const lastNames = namePoolLastNames.split('\n').map((s) => s.trim()).filter(Boolean);
    if (firstNames.length === 0 || lastNames.length === 0) return;
    setBusy(true);
    setActionError(null);
    try {
      await createCountryNamePool(namePoolCountry.countryId, {
        name: namePoolName.trim(),
        firstNames,
        lastNames,
        reason: namePoolReason.trim(),
      });
      setNamePoolOpen(false);
      setNamePoolName('');
      setNamePoolFirstNames('');
      setNamePoolLastNames('');
      setNamePoolReason('');
      setNamePoolCountry(null);
      await reload();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Create name pool failed');
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return (
      <div style={{ padding: 20 }}>
        <PageHeader title="Youth Generation" subtitle="Loading…" badge="F25" />
        <LoadingState label="Loading youth generation status…" />
      </div>
    );
  }

  if (error || !status) {
    return (
      <div style={{ padding: 20 }}>
        <PageHeader title="Youth Generation" badge="F25" />
        <ErrorState description={error ?? 'Youth generation status unavailable'} />
      </div>
    );
  }

  const countryOptions = countries.map((c) => [c.countryId, c.countryName] as const);

  return (
    <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 16 }}>
      <PageHeader
        title="Youth Generation"
        subtitle={`${status.worldSeason.label} · prospect cohort generation · F25`}
        badge={status.youthGenerationApplied ? 'Applied' : 'Pending'}
        actions={
          enabled ? (
            <Badge tone="warning">Commissioner</Badge>
          ) : (
            <Button variant="secondary" size="sm" onClick={requestEnable}>
              Commissioner controls
            </Button>
          )
        }
      />

      <p style={{ margin: 0, font: 'var(--text-body-sm)', color: 'var(--text-secondary)' }}>
        Official youth generation runs create prospect players (ages 15–17) per country profile. Preview is
        dry-run only; prepare and execute persist players.
      </p>

      {actionError ? <ErrorState description={actionError} /> : null}

      <Tabs items={visibleTabs} value={tab} onChange={setTab} />

      {tab === 'overview' ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
              gap: 16,
            }}
          >
            <Panel title="World season">
              <Row label="Season" value={status.worldSeason.label} />
              <Row label="Phase" value={status.worldSeason.phase.replaceAll('_', ' ')} />
              <Row label="Status" value={status.worldSeason.status} />
              <Row
                label="Youth generation applied"
                value={
                  <Badge tone={status.youthGenerationApplied ? 'success' : 'warning'}>
                    {status.youthGenerationApplied ? 'Yes' : 'No'}
                  </Badge>
                }
              />
              <Row label="Generated prospects" value={String(status.generatedProspectCount)} />
            </Panel>
            <Panel title="Active profile set">
              {status.activeConfig ? (
                <>
                  <Row label="Profile set" value={status.activeConfig.profileSetName} />
                  <Row label="Version" value={`v${status.activeConfig.versionNumber}`} />
                  <Row label="Config hash" value={status.activeConfig.configHash.slice(0, 12)} />
                </>
              ) : (
                <EmptyState title="No active profile set" description="Configure a profile set in Commissioner Mode." />
              )}
            </Panel>
            <Panel title="Readiness">
              {readiness ? (
                <>
                  <Row
                    label="Status"
                    value={<Badge tone={readinessTone(readiness.status)}>{readiness.status}</Badge>}
                  />
                  <Row label="Enabled countries" value={String(readiness.enabledCountryCount)} />
                  <Row label="Planned estimate" value={String(readiness.plannedPlayersEstimate)} />
                  {readiness.blockers[0] ? (
                    <p style={{ margin: '8px 0 0', font: 'var(--text-body-sm)', color: 'var(--accent-danger)' }}>
                      {readiness.blockers[0]}
                    </p>
                  ) : null}
                  {readiness.warnings[0] ? (
                    <p style={{ margin: '4px 0 0', font: 'var(--text-body-sm)', color: 'var(--accent-warning)' }}>
                      {readiness.warnings[0]}
                    </p>
                  ) : null}
                </>
              ) : (
                <LoadingState label="Checking readiness…" />
              )}
            </Panel>
          </div>

          {activeRun ? (
            <Panel
              title="Prepared run"
              actions={<Badge tone={runStatusTone(activeRun.status)}>{activeRun.status}</Badge>}
            >
              <Row
                label="Run"
                value={<Link to={`/youth-generation/runs/${activeRun.id}`}>#{activeRun.runVersion}</Link>}
              />
              <Row label="Reference date" value={activeRun.referenceDate} />
              <Row label="Planned players" value={String(activeRun.totalPlannedPlayers)} />
              {enabled ? (
                <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
                  <Button onClick={() => setExecuteOpen(true)} disabled={busy}>
                    Execute run
                  </Button>
                  <Button variant="secondary" onClick={() => setDiscardOpen(true)} disabled={busy}>
                    Discard prepared run
                  </Button>
                </div>
              ) : (
                <p style={{ margin: '8px 0 0', font: 'var(--text-body-sm)', color: 'var(--text-tertiary)' }}>
                  Enable Commissioner Mode to execute or discard this prepared run.
                </p>
              )}
            </Panel>
          ) : null}

          {currentRun ? (
            <Panel title="Last completed run">
              <Row
                label="Run"
                value={
                  <Link to={`/youth-generation/runs/${currentRun.id}`}>
                    v{currentRun.runVersion} · {currentRun.referenceDate}
                  </Link>
                }
              />
              <Row
                label="Completed"
                value={currentRun.completedAt ? new Date(currentRun.completedAt).toLocaleString() : '—'}
              />
              <SummaryCards
                summary={{
                  countryCount: currentRun.countryCount,
                  enabledCountryCount: currentRun.enabledCountryCount,
                  totalPlannedPlayers: currentRun.totalPlannedPlayers,
                  totalGeneratedPlayers: currentRun.totalGeneratedPlayers,
                  age15Count: 0,
                  age16Count: 0,
                  age17Count: 0,
                  skaterCount: 0,
                  goalieCount: 0,
                  warningCount: currentRun.warningCount,
                  duplicateNameCount: 0,
                  inputHash: currentRun.inputHash,
                  resultHash: currentRun.resultHash ?? '',
                }}
              />
            </Panel>
          ) : (
            <EmptyState
              title="No completed youth generation run"
              description="Run youth generation from Preview (Commissioner Mode) when the world is ready."
            />
          )}
        </div>
      ) : null}

      {tab === 'preview' ? (
        enabled ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <Panel title="Preview parameters">
              <p style={{ margin: '0 0 12px', font: 'var(--text-body-sm)', color: 'var(--accent-warning)' }}>
                Preview only — no players will be created.
              </p>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                  gap: 12,
                }}
              >
                <Field label="Reference date">
                  <TextInput value={referenceDate} onChange={(e) => setReferenceDate(e.target.value)} />
                </Field>
                <Field label="Base seed">
                  <TextInput value={baseSeed} onChange={(e) => setBaseSeed(e.target.value)} />
                </Field>
                <Field label="Profile set version">
                  <SelectInput value={profileSetVersionId} onChange={(e) => setProfileSetVersionId(e.target.value)}>
                    <option value="">Active profile set</option>
                    {profileSets.flatMap((p) =>
                      p.latestVersion
                        ? [
                            <option key={p.latestVersion.id} value={p.latestVersion.id}>
                              {p.name} v{p.latestVersion.versionNumber}
                            </option>,
                          ]
                        : [],
                    )}
                  </SelectInput>
                </Field>
              </div>
              <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
                <Button onClick={handlePreview} disabled={busy}>
                  Run preview
                </Button>
                <Button variant="secondary" onClick={() => setPrepareOpen(true)} disabled={busy || Boolean(activeRun)}>
                  Prepare official run
                </Button>
              </div>
            </Panel>
            {preview ? (
              <>
                <Panel title="Preview summary">
                  <SummaryCards summary={preview.summary} />
                  <p style={{ margin: '8px 0 0', font: 'var(--text-data-sm)', color: 'var(--text-tertiary)' }}>
                    Profile set hash {preview.profileSetHash.slice(0, 16)} · showing {preview.items.length} of{' '}
                    {preview.total}
                  </p>
                </Panel>
                <Panel title={`Preview cohorts (${preview.cohorts.length})`}>
                  <DataTable
                    headers={[
                      { key: 'country', label: 'Country' },
                      { key: 'size', label: 'Generated' },
                      { key: 'ages', label: '15/16/17' },
                      { key: 'warnings', label: 'Warnings' },
                    ]}
                  >
                    {preview.cohorts.map((c) => (
                      <DataRow key={`${c.countryId}-${c.cohortOrder}`}>
                        <Td primary>{c.countryName}</Td>
                        <Td>
                          {c.generatedSize}/{c.plannedSize}
                        </Td>
                        <Td>
                          {c.age15Count}/{c.age16Count}/{c.age17Count}
                        </Td>
                        <Td>{c.warnings?.length ?? 0}</Td>
                      </DataRow>
                    ))}
                  </DataTable>
                </Panel>
                <Panel title="Preview players">
                  <DataTable
                    headers={[
                      { key: 'player', label: 'Player' },
                      { key: 'country', label: 'Country' },
                      { key: 'age', label: 'Age' },
                      { key: 'pos', label: 'Pos' },
                      { key: 'ca', label: 'CA' },
                      { key: 'tier', label: 'Tier' },
                    ]}
                  >
                    {preview.items.map((p) => (
                      <DataRow key={`${p.generationIndex}-${p.countryId}`}>
                        <Td primary>{playerLabel(p)}</Td>
                        <Td>{p.countryKey ?? p.countryId.slice(0, 8)}</Td>
                        <Td>{p.ageOnReferenceDate}</Td>
                        <Td>{p.position}</Td>
                        <Td>{p.currentAbility}</Td>
                        <Td>{p.qualityTier ?? '—'}</Td>
                      </DataRow>
                    ))}
                  </DataTable>
                </Panel>
              </>
            ) : null}
          </div>
        ) : (
          <CommissionerGate onEnable={requestEnable} />
        )
      ) : null}

      {tab === 'runs' ? (
        <Panel title="Youth generation runs">
          {runs.length === 0 ? (
            <EmptyState title="No runs" description="No youth generation runs recorded for this world season." />
          ) : (
            <DataTable
              headers={[
                { key: 'ver', label: 'Ver' },
                { key: 'status', label: 'Status' },
                { key: 'date', label: 'Reference' },
                { key: 'counts', label: 'Players' },
                { key: 'current', label: 'Current' },
              ]}
            >
              {runs.map((run) => (
                <DataRow key={run.id} onActivate={() => navigate(`/youth-generation/runs/${run.id}`)}>
                  <Td primary>v{run.runVersion}</Td>
                  <Td>
                    <Badge tone={runStatusTone(run.status)}>{run.status}</Badge>
                  </Td>
                  <Td>{run.referenceDate}</Td>
                  <Td>
                    {run.totalGeneratedPlayers}/{run.totalPlannedPlayers}
                  </Td>
                  <Td>{run.isCurrent ? 'Yes' : '—'}</Td>
                </DataRow>
              ))}
            </DataTable>
          )}
        </Panel>
      ) : null}

      {tab === 'cohorts' ? (
        <Panel
          title="Country cohorts"
          actions={
            resultsRunId ? (
              <Link to={`/youth-generation/runs/${resultsRunId}`} style={{ font: 'var(--text-body-sm)' }}>
                Open run detail
              </Link>
            ) : null
          }
        >
          {!resultsRunId ? (
            <EmptyState title="No completed run" description="Complete a youth generation run to browse cohorts." />
          ) : cohorts.length === 0 ? (
            <EmptyState title="No cohorts" description="No cohort data for the selected run." />
          ) : (
            <DataTable
              headers={[
                { key: 'country', label: 'Country' },
                { key: 'size', label: 'Generated' },
                { key: 'ages', label: '15/16/17' },
                { key: 'skaters', label: 'Skaters' },
                { key: 'goalies', label: 'Goalies' },
              ]}
            >
              {cohorts.map((c) => (
                <DataRow key={c.id ?? `${c.countryId}-${c.cohortOrder}`}>
                  <Td primary>{c.countryName}</Td>
                  <Td>
                    {c.generatedSize}/{c.plannedSize}
                  </Td>
                  <Td>
                    {c.age15Count}/{c.age16Count}/{c.age17Count}
                  </Td>
                  <Td>{c.skaterCount}</Td>
                  <Td>{c.goalieCount}</Td>
                </DataRow>
              ))}
            </DataTable>
          )}
        </Panel>
      ) : null}

      {tab === 'prospects' ? (
        <Panel
          title="Generated prospects"
          actions={
            resultsRunId ? (
              <Link to={`/youth-generation/runs/${resultsRunId}`} style={{ font: 'var(--text-body-sm)' }}>
                Open run detail
              </Link>
            ) : null
          }
        >
          {!resultsRunId ? (
            <EmptyState title="No completed run" description="Complete a youth generation run to browse prospects." />
          ) : (
            <>
              <Field label="Country filter">
                <SelectInput
                  value={countryFilter}
                  onChange={(e) => {
                    setCountryFilter(e.target.value);
                    setProspectsPage(1);
                  }}
                >
                  <option value="">All countries</option>
                  {countryOptions.map(([id, name]) => (
                    <option key={id} value={id}>
                      {name}
                    </option>
                  ))}
                </SelectInput>
              </Field>
              <DataTable
                headers={[
                  { key: 'player', label: 'Player' },
                  { key: 'country', label: 'Country' },
                  { key: 'age', label: 'Age' },
                  { key: 'pos', label: 'Pos' },
                  { key: 'ca', label: 'CA' },
                  { key: 'role', label: 'Role' },
                ]}
              >
                {prospects.map((p) => (
                  <DataRow key={p.id ?? `${p.generationIndex}-${p.countryId}`}>
                    <Td primary>
                      {p.playerId ? (
                        <Link to={`/players/${p.playerId}`}>{playerLabel(p)}</Link>
                      ) : (
                        playerLabel(p)
                      )}
                    </Td>
                    <Td>{p.countryKey ?? p.countryId.slice(0, 8)}</Td>
                    <Td>{p.ageOnReferenceDate}</Td>
                    <Td>{p.position}</Td>
                    <Td>{p.currentAbility}</Td>
                    <Td>{p.role}</Td>
                  </DataRow>
                ))}
              </DataTable>
              <div style={{ display: 'flex', gap: 8, marginTop: 12, alignItems: 'center' }}>
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={prospectsPage <= 1}
                  onClick={() => setProspectsPage((p) => p - 1)}
                >
                  Previous
                </Button>
                <span style={{ font: 'var(--text-body-sm)', color: 'var(--text-tertiary)' }}>
                  Page {prospectsPage} · {prospectsTotal} total
                </span>
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={prospectsPage * 50 >= prospectsTotal}
                  onClick={() => setProspectsPage((p) => p + 1)}
                >
                  Next
                </Button>
              </div>
            </>
          )}
        </Panel>
      ) : null}

      {tab === 'country-profiles' ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <Panel title="Active country profiles">
            {countries.length === 0 ? (
              <EmptyState title="No profiles" description="No country profiles in the active profile set." />
            ) : (
              <DataTable
                headers={[
                  { key: 'country', label: 'Country' },
                  { key: 'enabled', label: 'Enabled' },
                  { key: 'size', label: 'Cohort size' },
                  { key: 'pool', label: 'Name pool' },
                  { key: 'hash', label: 'Profile hash' },
                ]}
              >
                {countries.map((c) => (
                  <DataRow key={c.countryId}>
                    <Td primary>
                      {c.countryName} ({c.countryCode})
                    </Td>
                    <Td>
                      <Badge tone={c.enabled ? 'success' : 'neutral'}>{c.enabled ? 'Yes' : 'No'}</Badge>
                    </Td>
                    <Td>{c.cohortBaseSize}</Td>
                    <Td>{c.namePoolVersionId.slice(0, 8)}</Td>
                    <Td>{c.profileHash.slice(0, 10)}</Td>
                  </DataRow>
                ))}
              </DataTable>
            )}
          </Panel>
          {enabled ? (
            <Panel
              title="Profile sets"
              actions={
                <Button size="sm" onClick={() => setCreatePresetOpen(true)}>
                  New profile set
                </Button>
              }
            >
              {profileSets.length === 0 ? (
                <EmptyState title="No profile sets" description="Seed default profile set on server startup." />
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {profileSets.map((p) => (
                    <div
                      key={p.id}
                      style={{
                        padding: '10px 0',
                        borderBottom: '1px solid var(--border-subtle)',
                        display: 'flex',
                        justifyContent: 'space-between',
                        gap: 12,
                        flexWrap: 'wrap',
                        alignItems: 'flex-start',
                      }}
                    >
                      <div>
                        <div style={{ font: 'var(--text-body-sm)', color: 'var(--text-primary)' }}>
                          {p.name}{' '}
                          {p.isActive ? <Badge tone="success">Active</Badge> : null}
                          {p.isSystem ? <Badge tone="neutral">System</Badge> : null}
                        </div>
                        <div style={{ font: 'var(--text-body-sm)', color: 'var(--text-tertiary)', marginTop: 4 }}>
                          {p.description ?? '—'}
                          {p.latestVersion
                            ? ` · latest v${p.latestVersion.versionNumber} · ${p.latestVersion.configHash.slice(0, 10)}`
                            : ''}
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                        {p.latestVersion && !p.latestVersion.isActive ? (
                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={() => {
                              setActivateVersionId(p.latestVersion!.id);
                              setActivateOpen(true);
                            }}
                          >
                            Activate latest
                          </Button>
                        ) : null}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Panel>
          ) : null}
        </div>
      ) : null}

      {tab === 'name-pools' ? (
        enabled ? (
          <Panel title="Country name pools">
            {countries.length === 0 ? (
              <EmptyState title="No countries" description="Load country profiles first." />
            ) : (
              <DataTable
                headers={[
                  { key: 'country', label: 'Country' },
                  { key: 'pool', label: 'Name pool version' },
                  { key: 'action', label: 'Action' },
                ]}
              >
                {countries.map((c) => (
                  <DataRow key={c.countryId}>
                    <Td primary>
                      {c.countryName} ({c.countryCode})
                    </Td>
                    <Td>{c.namePoolVersionId}</Td>
                    <Td>
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => {
                          setNamePoolCountry(c);
                          setNamePoolName(`${c.countryCode} pool`);
                          setNamePoolOpen(true);
                        }}
                      >
                        Create pool
                      </Button>
                    </Td>
                  </DataRow>
                ))}
              </DataTable>
            )}
          </Panel>
        ) : (
          <CommissionerGate onEnable={requestEnable} />
        )
      ) : null}

      {tab === 'diagnostics' ? (
        enabled ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <Panel title="Run diagnostics">
              <Field label="Run">
                <SelectInput
                  value={diagnosticsRunId || activeRun?.id || currentRun?.id || ''}
                  onChange={(e) => setDiagnosticsRunId(e.target.value)}
                >
                  {runs.map((r) => (
                    <option key={r.id} value={r.id}>
                      v{r.runVersion} · {r.status} · {r.referenceDate}
                    </option>
                  ))}
                </SelectInput>
              </Field>
              {diagnostics ? (
                <>
                  <Row label="Profile set" value={diagnostics.config.profileSetName} />
                  <Row label="Version" value={`v${diagnostics.config.versionNumber}`} />
                  <Row label="Input hash" value={diagnostics.run.inputHash.slice(0, 16)} />
                  <Row label="Result hash" value={diagnostics.run.resultHash?.slice(0, 16) ?? '—'} />
                  <h4 style={{ margin: '16px 0 8px', font: 'var(--text-body-sm)', color: 'var(--text-secondary)' }}>
                    Cohort sample
                  </h4>
                  {diagnostics.cohortSample.map((c) => (
                    <div
                      key={c.cohortHash}
                      style={{
                        padding: '8px 0',
                        borderBottom: '1px solid var(--border-subtle)',
                        font: 'var(--text-body-sm)',
                      }}
                    >
                      {c.countryName} · {c.generatedSize} players · ages {c.age15Count}/{c.age16Count}/
                      {c.age17Count}
                    </div>
                  ))}
                  <h4 style={{ margin: '16px 0 8px', font: 'var(--text-body-sm)', color: 'var(--text-secondary)' }}>
                    Top prospects (commissioner)
                  </h4>
                  {diagnostics.topProspects.map((p) => (
                    <div
                      key={p.playerId}
                      style={{
                        padding: '8px 0',
                        borderBottom: '1px solid var(--border-subtle)',
                        font: 'var(--text-body-sm)',
                      }}
                    >
                      <Link to={`/players/${p.playerId}`}>{p.playerName}</Link> · {p.position} · CA {p.currentAbility}{' '}
                      · pot {p.potentialCeiling} · {p.qualityTier}
                    </div>
                  ))}
                </>
              ) : (
                <LoadingState label="Loading diagnostics…" />
              )}
            </Panel>
          </div>
        ) : (
          <CommissionerGate onEnable={requestEnable} />
        )
      ) : null}

      <Dialog
        open={prepareOpen}
        title="Prepare official run"
        onClose={() => setPrepareOpen(false)}
        onConfirm={handlePrepare}
        confirmLabel="Prepare"
        confirmVariant="danger"
        busy={busy}
      >
        <p style={{ margin: '0 0 8px', font: 'var(--text-body-sm)' }}>
          Creates a PREPARED run with frozen inputs. Execute separately after review.
        </p>
        <Field label="Reason (required)">
          <TextInput value={prepareReason} onChange={(e) => setPrepareReason(e.target.value)} />
        </Field>
      </Dialog>

      <Dialog
        open={executeOpen}
        title="Execute youth generation run"
        onClose={() => setExecuteOpen(false)}
        onConfirm={handleExecute}
        confirmLabel="Execute"
        confirmVariant="danger"
        busy={busy}
      >
        <p style={{ margin: '0 0 8px', font: 'var(--text-body-sm)' }}>
          Persists generated prospect players. Requires confirmation.
        </p>
        <Field label="Reason (required)">
          <TextInput value={executeReason} onChange={(e) => setExecuteReason(e.target.value)} />
        </Field>
      </Dialog>

      <Dialog
        open={discardOpen}
        title="Discard prepared run"
        onClose={() => setDiscardOpen(false)}
        onConfirm={handleDiscard}
        confirmLabel="Discard"
        confirmVariant="danger"
        busy={busy}
      >
        <Field label="Reason (required)">
          <TextInput value={discardReason} onChange={(e) => setDiscardReason(e.target.value)} />
        </Field>
      </Dialog>

      <Dialog
        open={createPresetOpen}
        title="Create profile set"
        onClose={() => setCreatePresetOpen(false)}
        onConfirm={handleCreatePreset}
        confirmLabel="Create"
        busy={busy}
      >
        <Field label="Name">
          <TextInput value={newPresetName} onChange={(e) => setNewPresetName(e.target.value)} />
        </Field>
        <Field label="Reason">
          <TextInput value={newPresetReason} onChange={(e) => setNewPresetReason(e.target.value)} />
        </Field>
      </Dialog>

      <Dialog
        open={activateOpen}
        title="Activate profile set version"
        onClose={() => setActivateOpen(false)}
        onConfirm={handleActivate}
        confirmLabel="Activate"
        confirmVariant="danger"
        busy={busy}
      >
        <Field label="Reason">
          <TextInput value={activateReason} onChange={(e) => setActivateReason(e.target.value)} />
        </Field>
      </Dialog>

      <Dialog
        open={namePoolOpen}
        title={`Create name pool${namePoolCountry ? ` · ${namePoolCountry.countryName}` : ''}`}
        onClose={() => setNamePoolOpen(false)}
        onConfirm={handleCreateNamePool}
        confirmLabel="Create pool"
        busy={busy}
      >
        <Field label="Pool name">
          <TextInput value={namePoolName} onChange={(e) => setNamePoolName(e.target.value)} />
        </Field>
        <Field label="First names (one per line)">
          <textarea
            value={namePoolFirstNames}
            onChange={(e) => setNamePoolFirstNames(e.target.value)}
            rows={5}
            style={{
              width: '100%',
              font: 'var(--text-data-sm)',
              padding: 8,
              borderRadius: 'var(--radius-sm)',
              border: '1px solid var(--border-subtle)',
              background: 'var(--surface-panel-raised)',
              color: 'var(--text-primary)',
            }}
          />
        </Field>
        <Field label="Last names (one per line)">
          <textarea
            value={namePoolLastNames}
            onChange={(e) => setNamePoolLastNames(e.target.value)}
            rows={5}
            style={{
              width: '100%',
              font: 'var(--text-data-sm)',
              padding: 8,
              borderRadius: 'var(--radius-sm)',
              border: '1px solid var(--border-subtle)',
              background: 'var(--surface-panel-raised)',
              color: 'var(--text-primary)',
            }}
          />
        </Field>
        <Field label="Reason">
          <TextInput value={namePoolReason} onChange={(e) => setNamePoolReason(e.target.value)} />
        </Field>
      </Dialog>
    </div>
  );
}

function Row({ label, value }: { label: string; value: ReactNode }) {
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
      <span style={{ color: 'var(--text-primary)', textAlign: 'right' }}>{value}</span>
    </div>
  );
}
