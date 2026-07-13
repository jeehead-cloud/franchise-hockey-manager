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
  activateDevelopmentConfigurationVersion,
  createDevelopmentConfiguration,
  createDevelopmentConfigurationVersion,
  discardPlayerDevelopmentRun,
  executePlayerDevelopmentRun,
  getDevelopmentReadiness,
  getDevelopmentStatus,
  getPlayerDevelopmentRunDiagnostics,
  getWorldSummary,
  listDevelopmentConfigurations,
  listDevelopmentResults,
  listDevelopmentRetirements,
  listDevelopmentRuns,
  preparePlayerDevelopmentRun,
  previewPlayerDevelopment,
  type DevelopmentPresetSummary,
  type DevelopmentPreviewResponse,
  type DevelopmentReadiness,
  type DevelopmentResultRow,
  type DevelopmentRetirementRow,
  type DevelopmentRunDiagnostics,
  type DevelopmentRunDto,
  type DevelopmentStatus,
} from '../lib/api';
import { useCommissioner } from '../lib/commissioner';

type DevTab =
  | 'overview'
  | 'preview'
  | 'runs'
  | 'players'
  | 'retirements'
  | 'configuration'
  | 'diagnostics';

const TAB_ITEMS: Array<{ value: DevTab; label: string; commissionerOnly?: boolean }> = [
  { value: 'overview', label: 'Overview' },
  { value: 'preview', label: 'Preview', commissionerOnly: true },
  { value: 'runs', label: 'Runs' },
  { value: 'players', label: 'Players' },
  { value: 'retirements', label: 'Retirements' },
  { value: 'configuration', label: 'Configuration', commissionerOnly: true },
  { value: 'diagnostics', label: 'Diagnostics', commissionerOnly: true },
];

function parseTab(raw: string | null, commissioner: boolean): DevTab {
  const allowed = TAB_ITEMS.filter((t) => commissioner || !t.commissionerOnly).map((t) => t.value);
  if (raw && allowed.includes(raw as DevTab)) return raw as DevTab;
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

function SummaryCards({
  summary,
}: {
  summary: {
    totalPlayers: number;
    developedCount: number;
    declinedCount: number;
    stableCount: number;
    retiredCount: number;
    warningCount: number;
    averageAbilityChange?: number;
  };
}) {
  const cards = [
    { label: 'Players', value: String(summary.totalPlayers) },
    { label: 'Developed', value: String(summary.developedCount) },
    { label: 'Declined', value: String(summary.declinedCount) },
    { label: 'Stable', value: String(summary.stableCount) },
    { label: 'Retired', value: String(summary.retiredCount) },
    { label: 'Warnings', value: String(summary.warningCount) },
    ...(summary.averageAbilityChange != null
      ? [{ label: 'Avg CA Δ', value: summary.averageAbilityChange.toFixed(2) }]
      : []),
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
        Preview, prepare, execute, configuration, and diagnostics require Commissioner Mode. Read-only run
        summaries remain available in normal mode.
      </p>
      <Button variant="danger" onClick={onEnable}>
        Enable Commissioner Mode
      </Button>
    </Panel>
  );
}

export function DevelopmentPage() {
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
  const [status, setStatus] = useState<DevelopmentStatus | null>(null);
  const [readiness, setReadiness] = useState<DevelopmentReadiness | null>(null);
  const [runs, setRuns] = useState<DevelopmentRunDto[]>([]);
  const [configs, setConfigs] = useState<DevelopmentPresetSummary[]>([]);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [effectiveDate, setEffectiveDate] = useState('');
  const [baseSeed, setBaseSeed] = useState('development-preview');
  const [configVersionId, setConfigVersionId] = useState('');
  const [preview, setPreview] = useState<DevelopmentPreviewResponse | null>(null);

  const [results, setResults] = useState<DevelopmentResultRow[]>([]);
  const [resultsPage, setResultsPage] = useState(1);
  const [resultsTotal, setResultsTotal] = useState(0);
  const [outcomeFilter, setOutcomeFilter] = useState('');

  const [retirements, setRetirements] = useState<DevelopmentRetirementRow[]>([]);

  const [diagnostics, setDiagnostics] = useState<DevelopmentRunDiagnostics | null>(null);
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
  const [versionJsonOpen, setVersionJsonOpen] = useState(false);
  const [versionJsonPreset, setVersionJsonPreset] = useState<DevelopmentPresetSummary | null>(null);
  const [versionJson, setVersionJson] = useState('{}');
  const [versionJsonReason, setVersionJsonReason] = useState('');

  const worldSeasonId = status?.worldSeason.id ?? '';
  const currentRun = status?.currentCompletedRun ?? null;
  const activeRun = status?.activeRun ?? null;
  const resultsRunId = currentRun?.id ?? runs.find((r) => r.status === 'COMPLETED')?.id ?? '';
  const retirementsRunId = resultsRunId;

  const visibleTabs = useMemo(
    () => TAB_ITEMS.filter((t) => enabled || !t.commissionerOnly),
    [enabled],
  );

  const reload = useCallback(async (signal?: AbortSignal) => {
    const statusRes = await getDevelopmentStatus(undefined, signal);
    const wsId = statusRes.item.worldSeason.id;
    const [readinessRes, runsRes, configsRes, worldRes] = await Promise.all([
      getDevelopmentReadiness({ worldSeasonId: wsId }, signal),
      listDevelopmentRuns(wsId, signal),
      listDevelopmentConfigurations(signal),
      getWorldSummary(signal),
    ]);
    setStatus(statusRes.item);
    setReadiness(readinessRes.item);
    setRuns(runsRes.items);
    setConfigs(configsRes.items);
    setEffectiveDate((prev) => prev || (worldRes.season ? `${worldRes.season.endYear}-07-01` : ''));
    setConfigVersionId((prev) => prev || statusRes.item.activeConfig.versionId);
    setError(null);
  }, []);

  useEffect(() => {
    const c = new AbortController();
    setLoading(true);
    reload(c.signal)
      .catch((err: unknown) => {
        if (c.signal.aborted) return;
        setError(err instanceof Error ? err.message : 'Failed to load development status');
      })
      .finally(() => {
        if (!c.signal.aborted) setLoading(false);
      });
    return () => c.abort();
  }, [reload]);

  useEffect(() => {
    if (!enabled && (tab === 'preview' || tab === 'configuration' || tab === 'diagnostics')) {
      setTab('overview');
    }
  }, [enabled, tab, setTab]);

  useEffect(() => {
    if (tab !== 'players' || !resultsRunId) return;
    const c = new AbortController();
    listDevelopmentResults(
      resultsRunId,
      { page: resultsPage, pageSize: 50, outcome: outcomeFilter || undefined },
      c.signal,
    )
      .then((res) => {
        setResults(res.items);
        setResultsTotal(res.total);
      })
      .catch(() => {
        if (!c.signal.aborted) setResults([]);
      });
    return () => c.abort();
  }, [tab, resultsRunId, resultsPage, outcomeFilter]);

  useEffect(() => {
    if (tab !== 'retirements' || !retirementsRunId) return;
    const c = new AbortController();
    listDevelopmentRetirements(retirementsRunId, c.signal)
      .then((res) => setRetirements(res.item.items))
      .catch(() => {
        if (!c.signal.aborted) setRetirements([]);
      });
    return () => c.abort();
  }, [tab, retirementsRunId]);

  useEffect(() => {
    if (tab !== 'diagnostics' || !enabled) return;
    const runId = diagnosticsRunId || activeRun?.id || currentRun?.id || '';
    if (!runId) return;
    const c = new AbortController();
    getPlayerDevelopmentRunDiagnostics(runId, c.signal)
      .then((res) => setDiagnostics(res.item))
      .catch(() => {
        if (!c.signal.aborted) setDiagnostics(null);
      });
    return () => c.abort();
  }, [tab, enabled, diagnosticsRunId, activeRun?.id, currentRun?.id]);

  const handlePreview = async () => {
    if (!worldSeasonId || !effectiveDate || !baseSeed) return;
    setBusy(true);
    setActionError(null);
    try {
      const res = await previewPlayerDevelopment({
        worldSeasonId,
        effectiveDate,
        baseSeed,
        configVersionId: configVersionId || undefined,
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
      await preparePlayerDevelopmentRun({
        worldSeasonId: status.worldSeason.id,
        expectedWorldSeasonUpdatedAt: status.worldSeason.updatedAt,
        effectiveDate,
        baseSeed,
        configVersionId: configVersionId || undefined,
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
      await executePlayerDevelopmentRun(activeRun.id, {
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
      await discardPlayerDevelopmentRun(activeRun.id, { reason: discardReason.trim() });
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
      await createDevelopmentConfiguration({
        name: newPresetName.trim(),
        reason: newPresetReason.trim(),
      });
      setCreatePresetOpen(false);
      setNewPresetName('');
      setNewPresetReason('');
      await reload();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Create preset failed');
    } finally {
      setBusy(false);
    }
  };

  const handleActivate = async () => {
    if (!activateVersionId || !activateReason.trim()) return;
    setBusy(true);
    setActionError(null);
    try {
      await activateDevelopmentConfigurationVersion(activateVersionId, {
        reason: activateReason.trim(),
        expectedActiveVersionId: status?.activeConfig.versionId,
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

  const handleSaveVersionJson = async () => {
    if (!versionJsonPreset?.latestVersion || !versionJsonReason.trim()) return;
    setBusy(true);
    setActionError(null);
    try {
      const config = JSON.parse(versionJson) as unknown;
      await createDevelopmentConfigurationVersion(versionJsonPreset.id, {
        expectedLatestVersionId: versionJsonPreset.latestVersion.id,
        config,
        reason: versionJsonReason.trim(),
      });
      setVersionJsonOpen(false);
      setVersionJson('');
      setVersionJsonReason('');
      await reload();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Save version failed');
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return (
      <div style={{ padding: 20 }}>
        <PageHeader title="Player Development" subtitle="Loading…" badge="F24" />
        <LoadingState label="Loading development status…" />
      </div>
    );
  }

  if (error || !status) {
    return (
      <div style={{ padding: 20 }}>
        <PageHeader title="Player Development" badge="F24" />
        <ErrorState description={error ?? 'Development status unavailable'} />
      </div>
    );
  }

  return (
    <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 16 }}>
      <PageHeader
        title="Player Development"
        subtitle={`${status.worldSeason.label} · annual ability progression · F24`}
        badge={status.developmentApplied ? 'Applied' : 'Pending'}
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
        Official development runs update player abilities, roles, form, and retirements for the active world
        season. Preview is dry-run only; prepare and execute persist changes.
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
                label="Development applied"
                value={
                  <Badge tone={status.developmentApplied ? 'success' : 'warning'}>
                    {status.developmentApplied ? 'Yes' : 'No'}
                  </Badge>
                }
              />
            </Panel>
            <Panel title="Active configuration">
              <Row label="Preset" value={status.activeConfig.presetName} />
              <Row label="Version" value={`v${status.activeConfig.versionNumber}`} />
              <Row label="Config hash" value={status.activeConfig.configHash.slice(0, 12)} />
            </Panel>
            <Panel title="Readiness">
              {readiness ? (
                <>
                  <Row
                    label="Status"
                    value={<Badge tone={readinessTone(readiness.status)}>{readiness.status}</Badge>}
                  />
                  <Row label="Eligible players" value={String(readiness.eligiblePlayerCount)} />
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
              <Row label="Run" value={<Link to={`/development/runs/${activeRun.id}`}>#{activeRun.runVersion}</Link>} />
              <Row label="Effective date" value={activeRun.effectiveDate} />
              <Row label="Players" value={String(activeRun.totalPlayers)} />
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
                  <Link to={`/development/runs/${currentRun.id}`}>
                    v{currentRun.runVersion} · {currentRun.effectiveDate}
                  </Link>
                }
              />
              <Row label="Completed" value={currentRun.completedAt ? new Date(currentRun.completedAt).toLocaleString() : '—'} />
              <SummaryCards summary={currentRun} />
            </Panel>
          ) : (
            <EmptyState
              title="No completed development run"
              description="Run annual development from Preview (Commissioner Mode) when the world is ready."
            />
          )}
        </div>
      ) : null}

      {tab === 'preview' ? (
        enabled ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <Panel title="Preview parameters">
              <p style={{ margin: '0 0 12px', font: 'var(--text-body-sm)', color: 'var(--accent-warning)' }}>
                Preview only — no player data changed.
              </p>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                  gap: 12,
                }}
              >
                <Field label="Effective date">
                  <TextInput value={effectiveDate} onChange={(e) => setEffectiveDate(e.target.value)} />
                </Field>
                <Field label="Base seed">
                  <TextInput value={baseSeed} onChange={(e) => setBaseSeed(e.target.value)} />
                </Field>
                <Field label="Config version">
                  <SelectInput value={configVersionId} onChange={(e) => setConfigVersionId(e.target.value)}>
                    <option value="">Active config</option>
                    {configs.flatMap((p) =>
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
                    Config hash {preview.configHash.slice(0, 16)} · showing {preview.items.length} of{' '}
                    {preview.total}
                  </p>
                </Panel>
                <Panel title="Preview results">
                  <DataTable
                    headers={[
                      { key: 'player', label: 'Player' },
                      { key: 'team', label: 'Team' },
                      { key: 'ca', label: 'CA' },
                      { key: 'role', label: 'Role' },
                      { key: 'form', label: 'Form' },
                      { key: 'outcome', label: 'Outcome' },
                    ]}
                  >
                    {preview.items.map((r) => (
                      <DataRow key={r.playerId}>
                        <Td primary>
                          <Link to={`/players/${r.playerId}`}>{r.playerName}</Link>
                        </Td>
                        <Td>{r.teamName ?? '—'}</Td>
                        <Td>
                          {r.currentAbilityBefore} → {r.currentAbilityAfter}
                        </Td>
                        <Td>
                          {r.roleBefore} → {r.roleAfter}
                        </Td>
                        <Td>
                          {r.formBefore} → {r.formAfter}
                        </Td>
                        <Td>
                          <Badge tone={r.retired ? 'danger' : r.outcome === 'DEVELOPED' ? 'success' : 'neutral'}>
                            {r.outcome}
                          </Badge>
                        </Td>
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
        <Panel title="Development runs">
          {runs.length === 0 ? (
            <EmptyState title="No runs" description="No development runs recorded for this world season." />
          ) : (
            <DataTable
              headers={[
                { key: 'ver', label: 'Ver' },
                { key: 'status', label: 'Status' },
                { key: 'date', label: 'Effective' },
                { key: 'counts', label: 'Outcomes' },
                { key: 'current', label: 'Current' },
              ]}
            >
              {runs.map((run) => (
                <DataRow key={run.id} onActivate={() => navigate(`/development/runs/${run.id}`)}>
                  <Td primary>v{run.runVersion}</Td>
                  <Td>
                    <Badge tone={runStatusTone(run.status)}>{run.status}</Badge>
                  </Td>
                  <Td>{run.effectiveDate}</Td>
                  <Td>
                    +{run.developedCount} / −{run.declinedCount} / ={run.stableCount} / R{run.retiredCount}
                  </Td>
                  <Td>{run.isCurrent ? 'Yes' : '—'}</Td>
                </DataRow>
              ))}
            </DataTable>
          )}
        </Panel>
      ) : null}

      {tab === 'players' ? (
        <Panel
          title="Run results"
          actions={
            resultsRunId ? (
              <Link to={`/development/runs/${resultsRunId}`} style={{ font: 'var(--text-body-sm)' }}>
                Open run detail
              </Link>
            ) : null
          }
        >
          {!resultsRunId ? (
            <EmptyState title="No completed run" description="Complete a development run to browse player results." />
          ) : (
            <>
              <Field label="Outcome filter">
                <SelectInput value={outcomeFilter} onChange={(e) => { setOutcomeFilter(e.target.value); setResultsPage(1); }}>
                  <option value="">All outcomes</option>
                  <option value="DEVELOPED">Developed</option>
                  <option value="DECLINED">Declined</option>
                  <option value="STABLE">Stable</option>
                  <option value="RETIRED">Retired</option>
                </SelectInput>
              </Field>
              <DataTable
                headers={[
                  { key: 'player', label: 'Player' },
                  { key: 'team', label: 'Team' },
                  { key: 'ca', label: 'CA' },
                  { key: 'role', label: 'Role' },
                  { key: 'outcome', label: 'Outcome' },
                ]}
              >
                {results.map((r) => (
                  <DataRow key={r.id}>
                    <Td primary>
                      <Link to={`/players/${r.playerId}`}>{r.playerName}</Link>
                    </Td>
                    <Td>{r.teamName ?? '—'}</Td>
                    <Td>
                      {r.currentAbilityBefore} → {r.currentAbilityAfter}
                    </Td>
                    <Td>
                      {r.roleBefore} → {r.roleAfter}
                    </Td>
                    <Td>
                      <Badge tone={r.retired ? 'danger' : 'neutral'}>{r.outcome}</Badge>
                    </Td>
                  </DataRow>
                ))}
              </DataTable>
              <div style={{ display: 'flex', gap: 8, marginTop: 12, alignItems: 'center' }}>
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={resultsPage <= 1}
                  onClick={() => setResultsPage((p) => p - 1)}
                >
                  Previous
                </Button>
                <span style={{ font: 'var(--text-body-sm)', color: 'var(--text-tertiary)' }}>
                  Page {resultsPage} · {resultsTotal} total
                </span>
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={resultsPage * 50 >= resultsTotal}
                  onClick={() => setResultsPage((p) => p + 1)}
                >
                  Next
                </Button>
              </div>
            </>
          )}
        </Panel>
      ) : null}

      {tab === 'retirements' ? (
        <Panel title="Retirements">
          {!retirementsRunId ? (
            <EmptyState title="No run" description="Complete a development run to list retirements." />
          ) : retirements.length === 0 ? (
            <EmptyState title="No retirements" description="No players retired in the selected run." />
          ) : (
            <DataTable
              headers={[
                { key: 'player', label: 'Player' },
                { key: 'team', label: 'Team' },
                { key: 'age', label: 'Age' },
                { key: 'ca', label: 'CA' },
                { key: 'reason', label: 'Reason' },
              ]}
            >
              {retirements.map((r) => (
                <DataRow key={r.playerId}>
                  <Td primary>
                    <Link to={`/players/${r.playerId}`}>{r.playerName}</Link>
                  </Td>
                  <Td>{r.teamName ?? '—'}</Td>
                  <Td>{r.ageOnEffectiveDate}</Td>
                  <Td>
                    {r.currentAbilityBefore} → {r.currentAbilityAfter}
                  </Td>
                  <Td>{r.retirementReason ?? '—'}</Td>
                </DataRow>
              ))}
            </DataTable>
          )}
        </Panel>
      ) : null}

      {tab === 'configuration' ? (
        enabled ? (
          <Panel
            title="Development configurations"
            actions={
              <Button size="sm" onClick={() => setCreatePresetOpen(true)}>
                New preset
              </Button>
            }
          >
            {configs.length === 0 ? (
              <EmptyState title="No presets" description="Seed default configuration on server startup." />
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {configs.map((p) => (
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
                      {p.latestVersion ? (
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => {
                            setVersionJsonPreset(p);
                            setVersionJson('{}');
                            setVersionJsonOpen(true);
                          }}
                        >
                          New version (JSON)
                        </Button>
                      ) : null}
                    </div>
                  </div>
                ))}
              </div>
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
                      v{r.runVersion} · {r.status} · {r.effectiveDate}
                    </option>
                  ))}
                </SelectInput>
              </Field>
              {diagnostics ? (
                <>
                  <Row label="Preset" value={diagnostics.config.presetName} />
                  <Row label="Version" value={`v${diagnostics.config.versionNumber}`} />
                  <Row label="Input hash" value={diagnostics.run.inputHash.slice(0, 16)} />
                  <Row label="Result hash" value={diagnostics.run.resultHash?.slice(0, 16) ?? '—'} />
                  <h4 style={{ margin: '16px 0 8px', font: 'var(--text-body-sm)', color: 'var(--text-secondary)' }}>
                    Sample top changes
                  </h4>
                  {diagnostics.sampleTopChanges.map((s) => (
                    <div
                      key={s.playerId}
                      style={{
                        padding: '8px 0',
                        borderBottom: '1px solid var(--border-subtle)',
                        font: 'var(--text-body-sm)',
                      }}
                    >
                      <Link to={`/players/${s.playerId}`}>{s.playerName}</Link> · Δ{s.abilityDelta} ·{' '}
                      {s.outcome}
                      {s.retired ? ' · retired' : ''}
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

      <Dialog open={prepareOpen} title="Prepare official run" onClose={() => setPrepareOpen(false)} onConfirm={handlePrepare} confirmLabel="Prepare" confirmVariant="danger" busy={busy}>
        <p style={{ margin: '0 0 8px', font: 'var(--text-body-sm)' }}>
          Creates a PREPARED run with frozen inputs. Execute separately after review.
        </p>
        <Field label="Reason (required)">
          <TextInput value={prepareReason} onChange={(e) => setPrepareReason(e.target.value)} />
        </Field>
      </Dialog>

      <Dialog open={executeOpen} title="Execute development run" onClose={() => setExecuteOpen(false)} onConfirm={handleExecute} confirmLabel="Execute" confirmVariant="danger" busy={busy}>
        <p style={{ margin: '0 0 8px', font: 'var(--text-body-sm)' }}>
          Persists player ability, role, form, and retirement changes. Requires confirmation.
        </p>
        <Field label="Reason (required)">
          <TextInput value={executeReason} onChange={(e) => setExecuteReason(e.target.value)} />
        </Field>
      </Dialog>

      <Dialog open={discardOpen} title="Discard prepared run" onClose={() => setDiscardOpen(false)} onConfirm={handleDiscard} confirmLabel="Discard" confirmVariant="danger" busy={busy}>
        <Field label="Reason (required)">
          <TextInput value={discardReason} onChange={(e) => setDiscardReason(e.target.value)} />
        </Field>
      </Dialog>

      <Dialog open={createPresetOpen} title="Create configuration preset" onClose={() => setCreatePresetOpen(false)} onConfirm={handleCreatePreset} confirmLabel="Create" busy={busy}>
        <Field label="Name">
          <TextInput value={newPresetName} onChange={(e) => setNewPresetName(e.target.value)} />
        </Field>
        <Field label="Reason">
          <TextInput value={newPresetReason} onChange={(e) => setNewPresetReason(e.target.value)} />
        </Field>
      </Dialog>

      <Dialog open={activateOpen} title="Activate configuration version" onClose={() => setActivateOpen(false)} onConfirm={handleActivate} confirmLabel="Activate" confirmVariant="danger" busy={busy}>
        <Field label="Reason">
          <TextInput value={activateReason} onChange={(e) => setActivateReason(e.target.value)} />
        </Field>
      </Dialog>

      <Dialog open={versionJsonOpen} title="New version from JSON" onClose={() => setVersionJsonOpen(false)} onConfirm={handleSaveVersionJson} confirmLabel="Save version" busy={busy}>
        <p style={{ margin: '0 0 8px', font: 'var(--text-body-sm)', color: 'var(--text-tertiary)' }}>
          Advanced: paste a full development config object. Invalid JSON will be rejected by the server.
        </p>
        <Field label="Config JSON">
          <textarea
            value={versionJson}
            onChange={(e) => setVersionJson(e.target.value)}
            rows={8}
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
          <TextInput value={versionJsonReason} onChange={(e) => setVersionJsonReason(e.target.value)} />
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
