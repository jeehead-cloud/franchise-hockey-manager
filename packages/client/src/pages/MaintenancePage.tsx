import { useCallback, useEffect, useState } from 'react';
import { PageHeader } from '../components/layout/PageHeader';
import { Panel } from '../components/ui/Panel';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { EmptyState } from '../components/ui/EmptyState';
import { useCommissioner } from '../lib/commissioner';
import {
  fetchMaintenanceStatusPublic,
  fetchMaintenanceExports,
  fetchMaintenanceImports,
  fetchMaintenanceValidationRuns,
  fetchMaintenanceEvents,
  fetchMaintenanceConfigurations,
  fetchMaintenanceValidationDetail,
  createMaintenanceExport,
  deleteMaintenanceExport,
  runMaintenanceValidation,
  previewMaintenanceReset,
  prepareMaintenanceReset,
  executeMaintenanceReset,
  maintenanceDownloadUrl,
  type MaintenanceStatusPublic,
} from '../lib/api';

type Tab = 'overview' | 'export' | 'import' | 'validation' | 'reset' | 'history' | 'configuration';

interface ExportRunListItem {
  id: string;
  exportType: string;
  status: string;
  format: string;
  privacyLevel: string;
  rowCount: number | null;
  fileSizeBytes: number | null;
  fileSha256Prefix: string | null;
  createdAt: string;
}

interface ValidationRunListItem {
  id: string;
  status: string;
  checkCount: number;
  blockerCount: number;
  warningCount: number;
  resultHashPrefix: string;
  createdAt: string;
  result?: {
    status: 'PASS' | 'WARNING' | 'FAIL';
    checks: Array<{ group: string; code: string; severity: string; message: string }>;
  };
}

interface ImportRunListItem {
  id: string;
  importType: string;
  status: string;
  sourceFileName: string;
  totalRows: number;
  validRows: number;
  invalidRows: number;
  createdAt: string;
}

interface EventItem {
  id: string;
  entityType: string;
  entityId: string;
  eventType: string;
  statusBefore: string | null;
  statusAfter: string | null;
  summary: string;
  createdAt: string;
}

interface ConfigItem {
  id: string;
  name: string;
  description: string | null;
  isSystem: boolean;
  versions: Array<{
    id: string;
    versionNumber: number;
    configHash: string;
    isActive: boolean;
    createdAt: string;
  }>;
}

const statusTone = (s: string): 'success' | 'info' | 'warning' | 'danger' | 'neutral' => {
  if (s === 'COMPLETED' || s === 'PASS' || s === 'VERIFIED' || s === 'OK') return 'success';
  if (s === 'RUNNING' || s === 'PREPARED' || s === 'PREVIEW_READY' || s === 'UPLOADED') return 'info';
  if (s === 'FAILED' || s === 'BLOCKER' || s === 'FAIL') return 'danger';
  if (s === 'WARNING' || s === 'MISSING') return 'warning';
  return 'neutral';
};

const fmtBytes = (n: number | null): string => {
  if (n == null) return '—';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  return `${(n / 1024 / 1024 / 1024).toFixed(2)} GB`;
};

const fmtDate = (s: string | null): string => {
  if (!s) return '—';
  try { return new Date(s).toLocaleString(); } catch { return s; }
};

const EXPORT_TYPES = [
  'PLAYERS_PUBLIC_JSON', 'PLAYERS_PUBLIC_CSV',
  'PLAYERS_COMMISSIONER_JSON', 'PLAYERS_COMMISSIONER_CSV',
  'TEAMS_CSV', 'STANDINGS_CSV', 'PLAYER_STATISTICS_CSV', 'GOALIE_STATISTICS_CSV',
  'COMPETITION_ARCHIVE_JSON', 'CONTRACT_HISTORY_CSV', 'DRAFT_HISTORY_CSV',
  'TRADE_HISTORY_CSV', 'TRANSACTION_HISTORY_CSV', 'CONFIGURATION_PRESET_JSON',
  'NAME_POOLS_JSON', 'FULL_DATABASE_PACKAGE',
] as const;

/**
 * F33 Data & Maintenance page. Commissioner-controlled maintenance center
 * for exports, validated imports, database validation, and initialization
 * reset. Normal-mode users see only bounded subsystem status.
 *
 * Invariants surfaced:
 *  - exports never mutate world data;
 *  - public-safe exports omit hidden/private truth;
 *  - Commissioner truth export is gated + warning-bannered;
 *  - imports always preview first and apply atomically after a VERIFIED
 *    F32 backup;
 *  - database validation never silently repairs;
 *  - reset is destructive and requires a typed confirmation phrase;
 *  - paths are never exposed (only filenames + hash prefixes).
 */
export function MaintenancePage() {
  const { enabled: commissioner } = useCommissioner();
  const [tab, setTab] = useState<Tab>('overview');
  const [status, setStatus] = useState<MaintenanceStatusPublic | null>(null);
  const [exports, setExports] = useState<ExportRunListItem[]>([]);
  const [imports, setImports] = useState<ImportRunListItem[]>([]);
  const [validations, setValidations] = useState<ValidationRunListItem[]>([]);
  const [events, setEvents] = useState<EventItem[]>([]);
  const [configs, setConfigs] = useState<ConfigItem[]>([]);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  // Export tab state
  const [exportType, setExportType] = useState<string>('PLAYERS_PUBLIC_CSV');
  const [exportReason, setExportReason] = useState('');
  // Validation detail
  const [validationDetail, setValidationDetail] = useState<ValidationRunListItem | null>(null);
  // Reset tab state
  const [resetMode, setResetMode] = useState<'RESET_SETUP_STATE_ONLY' | 'RESET_WORLD_TO_EMPTY'>('RESET_SETUP_STATE_ONLY');
  const [resetPreview, setResetPreview] = useState<any>(null);
  const [resetConfirm, setResetConfirm] = useState('');

  const load = useCallback(async () => {
    try {
      const s = await fetchMaintenanceStatusPublic();
      setStatus(s.item);
    } catch { setStatus(null); }
    if (!commissioner) return;
    try { setExports((await fetchMaintenanceExports()).items); } catch { setExports([]); }
    try { setImports((await fetchMaintenanceImports()).items); } catch { setImports([]); }
    try { setValidations((await fetchMaintenanceValidationRuns()).items); } catch { setValidations([]); }
    try { setEvents((await fetchMaintenanceEvents()).items); } catch { setEvents([]); }
    try { setConfigs((await fetchMaintenanceConfigurations()).items); } catch { setConfigs([]); }
  }, [commissioner]);

  useEffect(() => { void load(); }, [load]);

  async function runExport() {
    setBusy(true); setMessage('');
    try {
      await createMaintenanceExport({ exportType, filters: {}, reason: exportReason || `${exportType} export` });
      setMessage(`${exportType} export completed.`);
      await load();
    } catch (e: any) {
      setMessage(`Export failed: ${e?.message ?? e}`);
    } finally { setBusy(false); }
  }

  async function downloadExport(runId: string) {
    try {
      const res = await fetch(maintenanceDownloadUrl(runId), {
        headers: { 'X-FHM-Commissioner-Mode': 'enabled' },
      });
      if (!res.ok) throw new Error('download failed');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = runId; a.click();
      URL.revokeObjectURL(url);
    } catch (e: any) { setMessage(`Download failed: ${e?.message ?? e}`); }
  }

  async function deleteExport(runId: string) {
    if (!confirm('Delete this export artifact?')) return;
    setBusy(true); setMessage('');
    try {
      await deleteMaintenanceExport(runId);
      setMessage('Export deleted.');
      await load();
    } catch (e: any) { setMessage(`Delete failed: ${e?.message ?? e}`); }
    finally { setBusy(false); }
  }

  async function runValidation() {
    setBusy(true); setMessage('');
    try {
      const r = await runMaintenanceValidation('UI validation');
      setMessage(`Validation completed: ${r.item.result?.status ?? '?'}`);
      await load();
      const det = await fetchMaintenanceValidationDetail(r.item.runId);
      setValidationDetail(det.item);
    } catch (e: any) { setMessage(`Validation failed: ${e?.message ?? e}`); }
    finally { setBusy(false); }
  }

  async function previewResetMode() {
    setBusy(true); setMessage(''); setResetPreview(null);
    try {
      const r = await previewMaintenanceReset(resetMode);
      setResetPreview(r.item);
      setResetConfirm('');
    } catch (e: any) { setMessage(`Reset preview failed: ${e?.message ?? e}`); }
    finally { setBusy(false); }
  }

  async function executeResetRun() {
    if (!resetPreview) return;
    if (resetConfirm !== resetPreview.requiredConfirmationPhrase) {
      setMessage(`Typed confirmation does not match '${resetPreview.requiredConfirmationPhrase}'`);
      return;
    }
    if (!confirm('This will reset the world. A backup will be created first. Continue?')) return;
    setBusy(true); setMessage('');
    try {
      const prep = await prepareMaintenanceReset(resetMode, 'UI reset');
      const r = await executeMaintenanceReset(prep.item.runId, {
        typedConfirmation: resetConfirm,
        expectedPreviewHash: resetPreview.previewHash,
        currentDatabaseFingerprint: resetPreview.currentDatabaseFingerprint,
        reason: 'UI reset execute',
      });
      setMessage(`Reset completed (backup ${r.item.backupId}). The world is now uninitialized.`);
      setResetPreview(null);
      await load();
    } catch (e: any) { setMessage(`Reset failed: ${e?.message ?? e}`); }
    finally { setBusy(false); }
  }

  const tabs: Array<{ id: Tab; label: string; commissionerOnly?: boolean }> = [
    { id: 'overview', label: 'Overview' },
    { id: 'export', label: 'Export', commissionerOnly: true },
    { id: 'import', label: 'Import', commissionerOnly: true },
    { id: 'validation', label: 'Database Validation', commissionerOnly: true },
    { id: 'reset', label: 'Initialization Reset', commissionerOnly: true },
    { id: 'history', label: 'History', commissionerOnly: true },
    { id: 'configuration', label: 'Configuration', commissionerOnly: true },
  ];

  return (
    <div>
      <PageHeader title="Data & Maintenance" subtitle="F33 export, validated import, database validation, and reset tools" />
      {!commissioner && (
        <Panel>
          <p style={{ font: 'var(--text-body-sm)', color: 'var(--text-secondary)' }}>
            You are viewing bounded public maintenance status. Enable Commissioner Mode in Settings to manage exports, imports,
            validation, and reset.
          </p>
        </Panel>
      )}
      {commissioner && (
        <>
          <div style={{ display: 'flex', gap: 6, marginBottom: 12, flexWrap: 'wrap' }}>
            {tabs.map((t) => (
              <Button key={t.id} variant={tab === t.id ? 'primary' : 'ghost'} onClick={() => setTab(t.id)}>
                {t.label}
              </Button>
            ))}
          </div>
          {message && (
            <Panel>
              <span style={{ font: 'var(--text-body-sm)' }}>{message}</span>
            </Panel>
          )}
        </>
      )}

      {/* Overview — always visible */}
      {tab === 'overview' && (
        <Panel title="Maintenance Overview">
          {!status ? (
            <EmptyState title="Maintenance status unavailable" description="" />
          ) : (
            <dl style={{ display: 'grid', gridTemplateColumns: 'max-content 1fr', gap: '6px 16px', font: 'var(--text-body-sm)' }}>
              <dt>Configured</dt><dd>{status.configured ? 'yes' : 'no'}</dd>
              <dt>Completed exports</dt><dd>{status.completedExports}</dd>
              <dt>Pending imports</dt><dd>{status.pendingImports}</dd>
              <dt>Last full DB package</dt><dd>{status.hasFullDatabasePackage ? `${status.lastFullDatabasePackageAgeDays ?? '?'} days ago` : 'never'}</dd>
              <dt>Last validation</dt><dd>{status.lastValidationStatus ? `${status.lastValidationStatus} (${status.lastValidationAgeDays ?? '?'} days ago)` : 'never'}</dd>
            </dl>
          )}
        </Panel>
      )}

      {commissioner && tab === 'export' && (
        <>
          <Panel title="Generate export">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, font: 'var(--text-body-sm)' }}>
              <label>
                Export type:
                <select value={exportType} onChange={(e) => setExportType(e.target.value)} style={{ marginLeft: 8 }}>
                  {EXPORT_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
              </label>
              <label>
                Reason:
                <input value={exportReason} onChange={(e) => setExportReason(e.target.value)} style={{ marginLeft: 8, width: 360 }} placeholder="required" />
              </label>
              {(exportType.includes('COMMISSIONER') || exportType === 'FULL_DATABASE_PACKAGE') && (
                <div style={{ padding: 8, background: 'var(--accent-warning-wash, #fff3cd)', borderRadius: 4 }}>
                  <strong>Warning:</strong> this export reveals hidden Player truth or a full database snapshot. Commissioner Mode is required.
                </div>
              )}
              <Button onClick={runExport} disabled={busy}>Generate</Button>
            </div>
          </Panel>
          <Panel title="Recent exports">
            {exports.length === 0 ? (
              <EmptyState title="No exports yet" description="" />
            ) : (
              <table style={{ width: '100%', font: 'var(--text-data-sm)', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    {['Type', 'Status', 'Privacy', 'Rows', 'Size', 'Created', 'Actions'].map((h) => (
                      <th key={h} style={{ textAlign: 'left', padding: '4px 8px', borderBottom: '1px solid var(--border-subtle)' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {exports.map((e) => (
                    <tr key={e.id}>
                      <td style={{ padding: '4px 8px' }}>{e.exportType}</td>
                      <td style={{ padding: '4px 8px' }}><Badge tone={statusTone(e.status)}>{e.status}</Badge></td>
                      <td style={{ padding: '4px 8px' }}>{e.privacyLevel}</td>
                      <td style={{ padding: '4px 8px' }}>{e.rowCount ?? '—'}</td>
                      <td style={{ padding: '4px 8px' }}>{fmtBytes(e.fileSizeBytes)}</td>
                      <td style={{ padding: '4px 8px' }}>{fmtDate(e.createdAt)}</td>
                      <td style={{ padding: '4px 8px' }}>
                        {e.status === 'COMPLETED' && <Button variant="ghost" onClick={() => downloadExport(e.id)}>Download</Button>}
                        {e.status !== 'DELETED' && <Button variant="ghost" onClick={() => deleteExport(e.id)}>Delete</Button>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Panel>
        </>
      )}

      {commissioner && tab === 'import' && (
        <Panel title="Imports (history)">
          <p style={{ font: 'var(--text-body-sm)', color: 'var(--text-secondary)', marginBottom: 8 }}>
            Upload via the API (<code>/api/commissioner/maintenance/imports/upload</code>) — multipart for CSV/JSON.
            Every apply creates a VERIFIED F32 backup first.
          </p>
          {imports.length === 0 ? (
            <EmptyState title="No imports yet" description="" />
          ) : (
            <table style={{ width: '100%', font: 'var(--text-data-sm)', borderCollapse: 'collapse' }}>
              <thead>
                <tr>{['Type', 'Status', 'Source', 'Rows', 'Invalid', 'Created'].map((h) => (
                  <th key={h} style={{ textAlign: 'left', padding: '4px 8px', borderBottom: '1px solid var(--border-subtle)' }}>{h}</th>
                ))}</tr>
              </thead>
              <tbody>
                {imports.map((i) => (
                  <tr key={i.id}>
                    <td style={{ padding: '4px 8px' }}>{i.importType}</td>
                    <td style={{ padding: '4px 8px' }}><Badge tone={statusTone(i.status)}>{i.status}</Badge></td>
                    <td style={{ padding: '4px 8px' }}>{i.sourceFileName}</td>
                    <td style={{ padding: '4px 8px' }}>{i.totalRows}</td>
                    <td style={{ padding: '4px 8px' }}>{i.invalidRows}</td>
                    <td style={{ padding: '4px 8px' }}>{fmtDate(i.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Panel>
      )}

      {commissioner && tab === 'validation' && (
        <>
          <Panel title="Run database validation">
            <p style={{ font: 'var(--text-body-sm)', color: 'var(--text-secondary)', marginBottom: 8 }}>
              Read-only validation. Never silently repairs. Generates a diagnostic JSON download.
            </p>
            <Button onClick={runValidation} disabled={busy}>Run validation</Button>
          </Panel>
          <Panel title="Latest validation result">
            {validationDetail?.result ? (
              <ValidationResultView result={validationDetail.result} />
            ) : validations.length === 0 ? (
              <EmptyState title="No validation runs yet" description="" />
            ) : (
              <ValidationResultView result={(validations[0] as any).result ?? { status: 'WARNING', checks: [] }} />
            )}
          </Panel>
          <Panel title="Recent validation runs">
            <table style={{ width: '100%', font: 'var(--text-data-sm)', borderCollapse: 'collapse' }}>
              <thead>
                <tr>{['Status', 'Checks', 'Blockers', 'Warnings', 'Created'].map((h) => (
                  <th key={h} style={{ textAlign: 'left', padding: '4px 8px', borderBottom: '1px solid var(--border-subtle)' }}>{h}</th>
                ))}</tr>
              </thead>
              <tbody>
                {validations.map((v) => (
                  <tr key={v.id}>
                    <td style={{ padding: '4px 8px' }}><Badge tone={statusTone(v.status)}>{v.status}</Badge></td>
                    <td style={{ padding: '4px 8px' }}>{v.checkCount}</td>
                    <td style={{ padding: '4px 8px' }}>{v.blockerCount}</td>
                    <td style={{ padding: '4px 8px' }}>{v.warningCount}</td>
                    <td style={{ padding: '4px 8px' }}>{fmtDate(v.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Panel>
        </>
      )}

      {commissioner && tab === 'reset' && (
        <Panel title="Initialization reset (destructive)">
          <div style={{ padding: 8, background: 'var(--accent-danger-wash, #f8d7da)', borderRadius: 4, marginBottom: 12 }}>
            <strong>Destructive area.</strong> Reset is irreversible except through F32 restore. A typed confirmation
            phrase and a VERIFIED F32 backup are mandatory. Backup files are always preserved.
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, font: 'var(--text-body-sm)' }}>
            <label>
              Mode:
              <select value={resetMode} onChange={(e) => setResetMode(e.target.value as never)} style={{ marginLeft: 8 }}>
                <option value="RESET_SETUP_STATE_ONLY">Reset setup state only (preserves world data)</option>
                <option value="RESET_WORLD_TO_EMPTY">Reset entire world to empty (deletes all domain data)</option>
              </select>
            </label>
            <Button onClick={previewResetMode} disabled={busy}>Preview affected data</Button>
            {resetPreview && (
              <div style={{ marginTop: 8 }}>
                <p><strong>Ready:</strong> {resetPreview.ready ? 'yes' : 'no (blockers remain)'}</p>
                <p><strong>Rows affected:</strong> {resetPreview.totalAffectedRows}</p>
                <p><strong>Fingerprint prefix:</strong> {String(resetPreview.currentDatabaseFingerprint).slice(0, 12)}</p>
                {resetPreview.blockers?.map((b: any) => (
                  <div key={b.code} style={{ color: 'var(--accent-danger)' }}>• {b.code}: {b.message}</div>
                ))}
                {resetPreview.ready && (
                  <>
                    <p style={{ marginTop: 12 }}><strong>Type this phrase to confirm:</strong></p>
                    <code style={{ background: 'var(--surface-panel)', padding: '2px 6px' }}>{resetPreview.requiredConfirmationPhrase}</code>
                    <input value={resetConfirm} onChange={(e) => setResetConfirm(e.target.value)} style={{ display: 'block', marginTop: 6, width: 360 }} />
                    <Button onClick={executeResetRun} disabled={busy || resetConfirm !== resetPreview.requiredConfirmationPhrase} style={{ marginTop: 8 }}>
                      Execute reset
                    </Button>
                  </>
                )}
              </div>
            )}
          </div>
        </Panel>
      )}

      {commissioner && tab === 'history' && (
        <Panel title="Maintenance events (append-only)">
          {events.length === 0 ? (
            <EmptyState title="No events yet" description="" />
          ) : (
            <table style={{ width: '100%', font: 'var(--text-data-sm)', borderCollapse: 'collapse' }}>
              <thead>
                <tr>{['Event', 'Entity', 'Summary', 'Created'].map((h) => (
                  <th key={h} style={{ textAlign: 'left', padding: '4px 8px', borderBottom: '1px solid var(--border-subtle)' }}>{h}</th>
                ))}</tr>
              </thead>
              <tbody>
                {events.map((e) => (
                  <tr key={e.id}>
                    <td style={{ padding: '4px 8px' }}>{e.eventType}</td>
                    <td style={{ padding: '4px 8px' }}>{e.entityType}</td>
                    <td style={{ padding: '4px 8px' }}>{e.summary}</td>
                    <td style={{ padding: '4px 8px' }}>{fmtDate(e.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Panel>
      )}

      {commissioner && tab === 'configuration' && (
        <Panel title="Maintenance configurations">
          {configs.length === 0 ? (
            <EmptyState title="No configurations" description="" />
          ) : (
            configs.map((c) => (
              <div key={c.id} style={{ marginBottom: 12, padding: 8, border: '1px solid var(--border-subtle)', borderRadius: 4 }}>
                <strong>{c.name}</strong> {c.isSystem && <Badge tone="info">system</Badge>}
                <div style={{ font: 'var(--text-data-sm)', color: 'var(--text-secondary)' }}>{c.description ?? ''}</div>
                <ul style={{ font: 'var(--text-data-sm)', marginTop: 4 }}>
                  {c.versions.map((v) => (
                    <li key={v.id}>
                      v{v.versionNumber} {v.isActive && <Badge tone="success">active</Badge>}
                      <code style={{ marginLeft: 8 }}>{v.configHash.slice(0, 12)}</code>
                    </li>
                  ))}
                </ul>
              </div>
            ))
          )}
        </Panel>
      )}
    </div>
  );
}

function ValidationResultView({ result }: { result: { status: string; checks: Array<{ group: string; code: string; severity: string; message: string }> } }) {
  const groups = new Map<string, typeof result.checks>();
  for (const c of result.checks) {
    if (!groups.has(c.group)) groups.set(c.group, []);
    groups.get(c.group)!.push(c);
  }
  return (
    <div>
      <p><strong>Overall:</strong> <Badge tone={statusTone(result.status)}>{result.status}</Badge></p>
      {Array.from(groups.entries()).map(([group, checks]) => (
        <div key={group} style={{ marginTop: 12 }}>
          <strong>{group}</strong>
          <ul style={{ font: 'var(--text-data-sm)', marginTop: 4 }}>
            {checks.map((c) => (
              <li key={c.code}>
                <Badge tone={statusTone(c.severity)}>{c.severity}</Badge> <code>{c.code}</code>: {c.message}
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}
