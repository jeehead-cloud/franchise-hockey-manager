import { useCallback, useEffect, useMemo, useState } from 'react';
import type { BalanceConfig, LoggingLevel, RuntimeSimulationSettings } from '@fhm/engine';
import { PageHeader } from '../components/layout/PageHeader';
import { BalanceConfigEditor, hashPrefix } from '../components/settings/BalanceConfigEditor';
import { BalancePresetsPanel } from '../components/settings/BalancePresetsPanel';
import { BalanceVersionHistory } from '../components/settings/BalanceVersionHistory';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { Field, SelectInput, TextInput } from '../components/ui/DataBrowser';
import { Dialog } from '../components/ui/Dialog';
import { ErrorState, LoadingState } from '../components/ui/EmptyState';
import { Panel } from '../components/ui/Panel';
import { Tabs } from '../components/ui/Tabs';
import {
  activateCommissionerBalanceVersion,
  createCommissionerBalanceVersion,
  duplicateCommissionerBalancePreset,
  exportBalancePresetVersion,
  getActiveBalance,
  getBalancePresetVersion,
  getCommissionerBalanceAudit,
  getCommissionerStatus,
  importCommissionerBalancePreset,
  listBalancePresetVersions,
  listBalancePresets,
  renameCommissionerBalancePreset,
  resetCommissionerBalancePreset,
  validateCommissionerBalanceConfig,
  type ActiveBalanceSnapshot,
  type BalanceAuditItem,
  type BalancePresetSummary,
  type BalancePresetVersionSummary,
  type BalanceValidationPreview,
  type CommissionerStatus,
} from '../lib/api';
import { useCommissioner } from '../lib/commissioner';

type SettingsTab = 'balance' | 'runtime' | 'commissioner';

const LOGGING_LEVELS: LoggingLevel[] = ['MINIMAL', 'STANDARD', 'DETAILED', 'DEBUG'];

function cloneConfig(config: BalanceConfig): BalanceConfig {
  return structuredClone(config);
}

export function SettingsPage() {
  const { enabled, requestEnable, tryDisable, registerDirtyGuard } = useCommissioner();
  const [tab, setTab] = useState<SettingsTab>('balance');
  const [status, setStatus] = useState<CommissionerStatus | null>(null);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const [active, setActive] = useState<ActiveBalanceSnapshot | null>(null);
  const [presets, setPresets] = useState<BalancePresetSummary[]>([]);
  const [selectedPresetId, setSelectedPresetId] = useState<string | null>(null);
  const [versions, setVersions] = useState<BalancePresetVersionSummary[]>([]);
  const [selectedVersionId, setSelectedVersionId] = useState<string | null>(null);

  const [draftConfig, setDraftConfig] = useState<BalanceConfig | null>(null);
  const [baselineConfig, setBaselineConfig] = useState<BalanceConfig | null>(null);
  const [validation, setValidation] = useState<BalanceValidationPreview | null>(null);
  const [validating, setValidating] = useState(false);

  const [runtime, setRuntime] = useState<RuntimeSimulationSettings | null>(null);

  const [audit, setAudit] = useState<BalanceAuditItem[]>([]);
  const [auditLoading, setAuditLoading] = useState(false);

  const [dupOpen, setDupOpen] = useState(false);
  const [dupPreset, setDupPreset] = useState<BalancePresetSummary | null>(null);
  const [dupName, setDupName] = useState('');
  const [dupReason, setDupReason] = useState('');

  const [renameOpen, setRenameOpen] = useState(false);
  const [renamePreset, setRenamePreset] = useState<BalancePresetSummary | null>(null);
  const [renameName, setRenameName] = useState('');
  const [renameReason, setRenameReason] = useState('');

  const [activateOpen, setActivateOpen] = useState(false);
  const [activateVersion, setActivateVersion] = useState<BalancePresetVersionSummary | null>(null);
  const [activateReason, setActivateReason] = useState('');

  const [resetOpen, setResetOpen] = useState(false);
  const [resetPreset, setResetPreset] = useState<BalancePresetSummary | null>(null);
  const [resetReason, setResetReason] = useState('');
  const [resetActivate, setResetActivate] = useState(false);

  const [importOpen, setImportOpen] = useState(false);
  const [importName, setImportName] = useState('');
  const [importReason, setImportReason] = useState('');
  const [importConfig, setImportConfig] = useState<unknown>(null);

  const [saveOpen, setSaveOpen] = useState(false);
  const [saveReason, setSaveReason] = useState('');
  const [saveActivate, setSaveActivate] = useState(false);

  const selectedPreset = useMemo(
    () => presets.find((p) => p.id === selectedPresetId) ?? null,
    [presets, selectedPresetId],
  );

  const dirty = useMemo(
    () =>
      draftConfig && baselineConfig
        ? JSON.stringify(draftConfig) !== JSON.stringify(baselineConfig)
        : false,
    [draftConfig, baselineConfig],
  );

  useEffect(() => {
    registerDirtyGuard(() => dirty);
    return () => registerDirtyGuard(null);
  }, [dirty, registerDirtyGuard]);

  const reloadCore = useCallback(async (signal?: AbortSignal) => {
    const [activeRes, presetsRes] = await Promise.all([
      getActiveBalance(signal),
      listBalancePresets(signal),
    ]);
    setActive(activeRes.item);
    setPresets(presetsRes.items);
    setRuntime(activeRes.item.runtimeDefaults);
    return { active: activeRes.item, presets: presetsRes.items };
  }, []);

  const loadVersionConfig = useCallback(async (versionId: string, signal?: AbortSignal) => {
    const res = await getBalancePresetVersion(versionId, signal);
    const config = cloneConfig(res.item.config);
    setDraftConfig(config);
    setBaselineConfig(cloneConfig(config));
    setValidation(null);
    setSelectedVersionId(versionId);
  }, []);

  const loadVersionsForPreset = useCallback(
    async (presetId: string, preferVersionId?: string, signal?: AbortSignal) => {
      const res = await listBalancePresetVersions(presetId, signal);
      setVersions(res.items);
      const versionId =
        preferVersionId ??
        res.items.find((v) => v.isActive)?.id ??
        res.items[0]?.id ??
        null;
      if (versionId) {
        await loadVersionConfig(versionId, signal);
      } else {
        setSelectedVersionId(null);
        setDraftConfig(null);
        setBaselineConfig(null);
      }
    },
    [loadVersionConfig],
  );

  const refreshAll = useCallback(async () => {
    setBusy(true);
    setActionError(null);
    try {
      const { active: activeSnap, presets: presetList } = await reloadCore();
      const presetId = selectedPresetId ?? activeSnap.preset.id;
      setSelectedPresetId(presetId);
      await loadVersionsForPreset(presetId, activeSnap.version.id);
      if (enabled) {
        const auditRes = await getCommissionerBalanceAudit({ pageSize: 20 });
        setAudit(auditRes.items);
      }
      setPresets(presetList);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to refresh balance data');
    } finally {
      setBusy(false);
    }
  }, [reloadCore, loadVersionsForPreset, selectedPresetId, enabled]);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    Promise.all([
      getCommissionerStatus(controller.signal).then(setStatus).catch(() => setStatus(null)),
      reloadCore(controller.signal)
        .then(async ({ active: activeSnap, presets: presetList }) => {
          setSelectedPresetId(activeSnap.preset.id);
          await loadVersionsForPreset(activeSnap.preset.id, activeSnap.version.id, controller.signal);
          setPresets(presetList);
        })
        .catch((err: unknown) => {
          if (controller.signal.aborted) return;
          setError(err instanceof Error ? err.message : 'Failed to load balance settings');
        }),
    ]).finally(() => {
      if (!controller.signal.aborted) setLoading(false);
    });
    return () => controller.abort();
  }, [reloadCore, loadVersionsForPreset]);

  useEffect(() => {
    if (!enabled || tab !== 'balance') return;
    const controller = new AbortController();
    setAuditLoading(true);
    getCommissionerBalanceAudit({ pageSize: 20 }, controller.signal)
      .then((res) => setAudit(res.items))
      .catch(() => setAudit([]))
      .finally(() => {
        if (!controller.signal.aborted) setAuditLoading(false);
      });
    return () => controller.abort();
  }, [enabled, tab]);

  const handleSelectPreset = async (presetId: string) => {
    setSelectedPresetId(presetId);
    setActionError(null);
    try {
      setBusy(true);
      await loadVersionsForPreset(presetId);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to load preset versions');
    } finally {
      setBusy(false);
    }
  };

  const handleSelectVersion = async (versionId: string) => {
    if (dirty && !window.confirm('Discard unsaved config edits?')) return;
    setActionError(null);
    try {
      setBusy(true);
      await loadVersionConfig(versionId);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to load version');
    } finally {
      setBusy(false);
    }
  };

  const handleValidate = async () => {
    if (!draftConfig || !selectedPresetId || !selectedVersionId) return;
    setValidating(true);
    setActionError(null);
    try {
      const result = await validateCommissionerBalanceConfig({
        presetId: selectedPresetId,
        baseVersionId: selectedVersionId,
        config: draftConfig,
      });
      setValidation(result);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Validation failed');
    } finally {
      setValidating(false);
    }
  };

  const handleExport = async (version: BalancePresetVersionSummary) => {
    setActionError(null);
    try {
      setBusy(true);
      const payload = await exportBalancePresetVersion(version.id);
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${payload.preset.name.replace(/\s+/g, '-').toLowerCase()}-v${payload.version.versionNumber}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Export failed');
    } finally {
      setBusy(false);
    }
  };

  const handleImportFile = (file: File) => {
    setActionError(null);
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result));
        const config = parsed?.config ?? parsed;
        setImportConfig(config);
        setImportName(file.name.replace(/\.json$/i, ''));
        setImportReason('');
        setImportOpen(true);
      } catch {
        setActionError('Import file is not valid JSON');
      }
    };
    reader.readAsText(file);
  };

  const confirmDuplicate = async () => {
    if (!dupPreset || !dupName.trim() || !dupReason.trim()) return;
    setBusy(true);
    setActionError(null);
    try {
      const res = await duplicateCommissionerBalancePreset(dupPreset.id, {
        name: dupName.trim(),
        reason: dupReason.trim(),
      });
      setDupOpen(false);
      await reloadCore();
      setSelectedPresetId(res.item.id);
      await loadVersionsForPreset(res.item.id);
      const auditRes = await getCommissionerBalanceAudit({ pageSize: 20 });
      setAudit(auditRes.items);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Duplicate failed');
    } finally {
      setBusy(false);
    }
  };

  const confirmRename = async () => {
    if (!renamePreset || !renameName.trim() || !renameReason.trim()) return;
    setBusy(true);
    setActionError(null);
    try {
      await renameCommissionerBalancePreset(renamePreset.id, {
        expectedUpdatedAt: renamePreset.updatedAt,
        name: renameName.trim(),
        reason: renameReason.trim(),
      });
      setRenameOpen(false);
      await refreshAll();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Rename failed');
    } finally {
      setBusy(false);
    }
  };

  const confirmActivate = async () => {
    if (!activateVersion || !activateReason.trim()) return;
    setBusy(true);
    setActionError(null);
    try {
      await activateCommissionerBalanceVersion(activateVersion.id, {
        reason: activateReason.trim(),
        expectedActiveVersionId: active?.version.id,
      });
      setActivateOpen(false);
      await refreshAll();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Activate failed');
    } finally {
      setBusy(false);
    }
  };

  const confirmReset = async () => {
    if (!resetPreset || !resetReason.trim()) return;
    setBusy(true);
    setActionError(null);
    try {
      await resetCommissionerBalancePreset(resetPreset.id, {
        reason: resetReason.trim(),
        activate: resetActivate,
      });
      setResetOpen(false);
      await refreshAll();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Reset failed');
    } finally {
      setBusy(false);
    }
  };

  const confirmImport = async () => {
    if (!importName.trim() || !importReason.trim() || !importConfig) return;
    setBusy(true);
    setActionError(null);
    try {
      const res = await importCommissionerBalancePreset({
        name: importName.trim(),
        reason: importReason.trim(),
        config: importConfig,
      });
      setImportOpen(false);
      await reloadCore();
      setSelectedPresetId(res.item.id);
      await loadVersionsForPreset(res.item.id);
      const auditRes = await getCommissionerBalanceAudit({ pageSize: 20 });
      setAudit(auditRes.items);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Import failed');
    } finally {
      setBusy(false);
    }
  };

  const confirmSaveVersion = async () => {
    if (!selectedPresetId || !selectedVersionId || !draftConfig || !saveReason.trim()) return;
    setBusy(true);
    setActionError(null);
    try {
      const latest = versions[0];
      if (!latest) throw new Error('No latest version found for preset');
      await createCommissionerBalanceVersion(selectedPresetId, {
        expectedLatestVersionId: latest.id,
        reason: saveReason.trim(),
        config: draftConfig,
        activate: saveActivate,
      });
      setSaveOpen(false);
      setSaveReason('');
      setSaveActivate(false);
      await refreshAll();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Create version failed');
    } finally {
      setBusy(false);
    }
  };

  const handleTabChange = (next: string) => {
    if (dirty && next !== tab && !window.confirm('Discard unsaved config edits?')) return;
    setTab(next as SettingsTab);
  };

  return (
    <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 16 }}>
      <PageHeader
        title="Settings"
        subtitle="Game balance presets, runtime simulation defaults, and local commissioner utilities."
      />

      <Tabs
        items={[
          { value: 'balance', label: 'Game Balance' },
          { value: 'runtime', label: 'Runtime & Debug' },
          { value: 'commissioner', label: 'Commissioner Mode' },
        ]}
        value={tab}
        onChange={handleTabChange}
      />

      {tab === 'balance' ? (
        loading ? (
          <LoadingState label="Loading balance configuration…" />
        ) : error ? (
          <ErrorState description={error} />
        ) : (
          <>
            {actionError ? (
              <div style={{ font: 'var(--text-body-sm)', color: 'var(--accent-danger, #b91c1c)' }}>
                {actionError}
              </div>
            ) : null}
            <BalancePresetsPanel
              active={active}
              presets={presets}
              selectedPresetId={selectedPresetId}
              commissionerEnabled={enabled}
              onSelect={handleSelectPreset}
              onDuplicate={(p) => {
                setDupPreset(p);
                setDupName(`${p.name} Copy`);
                setDupReason('');
                setDupOpen(true);
              }}
              onRename={(p) => {
                setRenamePreset(p);
                setRenameName(p.name);
                setRenameReason('');
                setRenameOpen(true);
              }}
              onReset={(p) => {
                setResetPreset(p);
                setResetReason('');
                setResetActivate(false);
                setResetOpen(true);
              }}
              onImport={handleImportFile}
              busy={busy}
            />
            <BalanceVersionHistory
              presetName={selectedPreset?.name ?? null}
              versions={versions}
              selectedVersionId={selectedVersionId}
              commissionerEnabled={enabled}
              onSelect={handleSelectVersion}
              onActivate={(v) => {
                setActivateVersion(v);
                setActivateReason('');
                setActivateOpen(true);
              }}
              onExport={handleExport}
              busy={busy}
            />
            {draftConfig && baselineConfig ? (
              <BalanceConfigEditor
                config={draftConfig}
                baselineConfig={baselineConfig}
                readOnly={!enabled}
                validation={validation}
                validating={validating}
                onChange={(c) => {
                  setDraftConfig(c);
                  setValidation(null);
                }}
                onValidate={handleValidate}
                onSaveVersion={() => {
                  setSaveReason('');
                  setSaveActivate(false);
                  setSaveOpen(true);
                }}
                saving={busy}
              />
            ) : null}
            {enabled ? (
              <Panel title="Balance audit log">
                {auditLoading ? (
                  <p style={{ margin: 0, font: 'var(--text-body-sm)', color: 'var(--text-tertiary)' }}>
                    Loading audit…
                  </p>
                ) : audit.length === 0 ? (
                  <p style={{ margin: 0, font: 'var(--text-body-sm)', color: 'var(--text-tertiary)' }}>
                    No balance audit entries yet.
                  </p>
                ) : (
                  <ul style={{ margin: 0, paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {audit.map((entry) => (
                      <li key={entry.id} style={{ font: 'var(--text-body-sm)', color: 'var(--text-secondary)' }}>
                        <span style={{ color: 'var(--text-primary)' }}>{entry.action}</span>
                        {' · '}
                        {entry.entityType} · {new Date(entry.createdAt).toLocaleString()}
                        <div style={{ color: 'var(--text-tertiary)' }}>{entry.reason}</div>
                        {entry.changedFields.length > 0 ? (
                          <div style={{ color: 'var(--text-tertiary)' }}>
                            Changed: {entry.changedFields.join(', ')}
                          </div>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                )}
              </Panel>
            ) : null}
          </>
        )
      ) : null}

      {tab === 'runtime' ? (
        loading && !runtime ? (
          <LoadingState label="Loading runtime defaults…" />
        ) : (
          <Panel title="Runtime & debug (session only)">
            <p style={{ margin: '0 0 12px', font: 'var(--text-body-sm)', color: 'var(--text-secondary)' }}>
              Values below are loaded from the active balance snapshot but are not persisted. They reset on page reload.
            </p>
            {active ? (
              <div
                style={{
                  marginBottom: 12,
                  font: 'var(--text-body-sm)',
                  color: 'var(--text-tertiary)',
                }}
              >
                Active preset: {active.preset.name} v{active.version.versionNumber} ·{' '}
                {hashPrefix(active.version.configHash)}
              </div>
            ) : null}
            {runtime ? (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
                <Field label="Simulation randomness">
                  <TextInput
                    type="number"
                    min={0}
                    max={1}
                    step={0.01}
                    value={String(runtime.simulationRandomness)}
                    onChange={(e) => {
                      const n = Number(e.target.value);
                      if (!Number.isNaN(n)) setRuntime({ ...runtime, simulationRandomness: n });
                    }}
                  />
                </Field>
                <Field label="Random seed">
                  <TextInput
                    type="number"
                    value={runtime.randomSeed == null ? '' : String(runtime.randomSeed)}
                    placeholder="null (non-deterministic)"
                    onChange={(e) => {
                      const raw = e.target.value.trim();
                      setRuntime({
                        ...runtime,
                        randomSeed: raw === '' ? null : Number(raw),
                      });
                    }}
                  />
                </Field>
                <Field label="Logging level">
                  <SelectInput
                    value={runtime.loggingLevel}
                    onChange={(e) =>
                      setRuntime({ ...runtime, loggingLevel: e.target.value as LoggingLevel })
                    }
                  >
                    {LOGGING_LEVELS.map((level) => (
                      <option key={level} value={level}>
                        {level}
                      </option>
                    ))}
                  </SelectInput>
                </Field>
              </div>
            ) : (
              <ErrorState description="Runtime defaults unavailable" />
            )}
          </Panel>
        )
      ) : null}

      {tab === 'commissioner' ? (
        <Panel title="Commissioner Mode">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <span style={{ font: 'var(--text-body-sm)', color: 'var(--text-secondary)' }}>
                Current state:
              </span>
              <Badge tone={enabled ? 'warning' : 'neutral'}>{enabled ? 'Enabled' : 'Disabled'}</Badge>
            </div>
            <p style={{ margin: 0, font: 'var(--text-body-sm)', color: 'var(--text-secondary)' }}>
              Commissioner Mode is a local administrative sandbox for correcting players, coaches, team setup, and
              game balance. It defaults off on every page load, is not persisted, and is not a user-account permission
              system. Write requests send <code>X-FHM-Commissioner-Mode: enabled</code> — a safety boundary, not
              authentication.
            </p>
            <p style={{ margin: 0, font: 'var(--text-body-sm)', color: 'var(--text-tertiary)' }}>
              Server writes:{' '}
              {status
                ? status.writesEnabled
                  ? 'enabled'
                  : 'disabled (FHM_COMMISSIONER_WRITES_ENABLED)'
                : 'unknown'}
            </p>
            <div style={{ display: 'flex', gap: 8 }}>
              {enabled ? (
                <Button variant="secondary" onClick={() => tryDisable({ hasUnsavedChanges: dirty })}>
                  Disable Commissioner Mode
                </Button>
              ) : (
                <Button variant="danger" onClick={requestEnable}>
                  Enable Commissioner Mode
                </Button>
              )}
            </div>
            <ul
              style={{
                margin: 0,
                paddingLeft: 18,
                font: 'var(--text-body-sm)',
                color: 'var(--text-tertiary)',
              }}
            >
              <li>Edit players, attributes, profile, potential, and team assignment</li>
              <li>Derived ratings and roles recalculate on the server</li>
              <li>Every successful edit creates an immutable audit record</li>
              <li>Edit coaches, tactical style, head coach assignment, and roster status</li>
              <li>Manage balance presets, versions, and activation from Game Balance tab</li>
            </ul>
          </div>
        </Panel>
      ) : null}

      <Dialog
        open={dupOpen}
        title="Duplicate preset"
        confirmLabel="Duplicate"
        onClose={() => setDupOpen(false)}
        onConfirm={confirmDuplicate}
        busy={busy}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <Field label="New preset name">
            <TextInput value={dupName} onChange={(e) => setDupName(e.target.value)} />
          </Field>
          <Field label="Reason">
            <TextInput value={dupReason} onChange={(e) => setDupReason(e.target.value)} />
          </Field>
        </div>
      </Dialog>

      <Dialog
        open={renameOpen}
        title="Rename preset"
        confirmLabel="Rename"
        onClose={() => setRenameOpen(false)}
        onConfirm={confirmRename}
        busy={busy}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <Field label="Name">
            <TextInput value={renameName} onChange={(e) => setRenameName(e.target.value)} />
          </Field>
          <Field label="Reason">
            <TextInput value={renameReason} onChange={(e) => setRenameReason(e.target.value)} />
          </Field>
        </div>
      </Dialog>

      <Dialog
        open={activateOpen}
        title="Activate version"
        confirmLabel="Activate"
        confirmVariant="danger"
        onClose={() => setActivateOpen(false)}
        onConfirm={confirmActivate}
        busy={busy}
      >
        <p style={{ margin: '0 0 10px' }}>
          Activate v{activateVersion?.versionNumber} ({hashPrefix(activateVersion?.configHash ?? '')}) for{' '}
          {selectedPreset?.name}? This changes live chemistry and balance behavior.
        </p>
        <Field label="Reason">
          <TextInput value={activateReason} onChange={(e) => setActivateReason(e.target.value)} />
        </Field>
      </Dialog>

      <Dialog
        open={resetOpen}
        title="Reset Standard preset"
        confirmLabel="Reset"
        confirmVariant="danger"
        onClose={() => setResetOpen(false)}
        onConfirm={confirmReset}
        busy={busy}
      >
        <p style={{ margin: '0 0 10px' }}>
          Reset Standard to repository defaults? Creates a new version from engine JSON sources.
        </p>
        <Field label="Reason">
          <TextInput value={resetReason} onChange={(e) => setResetReason(e.target.value)} />
        </Field>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 10, font: 'var(--text-body-sm)' }}>
          <input
            type="checkbox"
            checked={resetActivate}
            onChange={(e) => setResetActivate(e.target.checked)}
          />
          Activate after reset
        </label>
      </Dialog>

      <Dialog
        open={importOpen}
        title="Import balance preset"
        confirmLabel="Import"
        onClose={() => setImportOpen(false)}
        onConfirm={confirmImport}
        busy={busy}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <Field label="Preset name">
            <TextInput value={importName} onChange={(e) => setImportName(e.target.value)} />
          </Field>
          <Field label="Reason">
            <TextInput value={importReason} onChange={(e) => setImportReason(e.target.value)} />
          </Field>
          <p style={{ margin: 0, font: 'var(--text-body-sm)', color: 'var(--text-tertiary)' }}>
            Imported presets start inactive until you activate a version.
          </p>
        </div>
      </Dialog>

      <Dialog
        open={saveOpen}
        title="Create new version"
        confirmLabel="Create version"
        onClose={() => setSaveOpen(false)}
        onConfirm={confirmSaveVersion}
        busy={busy}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <Field label="Reason">
            <TextInput value={saveReason} onChange={(e) => setSaveReason(e.target.value)} />
          </Field>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, font: 'var(--text-body-sm)' }}>
            <input
              type="checkbox"
              checked={saveActivate}
              onChange={(e) => setSaveActivate(e.target.checked)}
            />
            Activate after create
          </label>
        </div>
      </Dialog>
    </div>
  );
}
