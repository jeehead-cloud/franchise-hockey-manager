import { useCallback, useEffect, useState } from 'react';
import { PageHeader } from '../components/layout/PageHeader';
import { Panel } from '../components/ui/Panel';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { EmptyState } from '../components/ui/EmptyState';
import { useCommissioner } from '../lib/commissioner';
import {
  fetchBackupStatusPublic,
  fetchBackups,
  createManualBackup,
  verifyBackup,
  protectBackup,
  unprotectBackup,
  previewRetention,
  executePrune,
  scanStorage,
  previewRestore,
  prepareRestore,
  requestRestart,
  cancelRestore,
  type BackupStatusPublic,
  type BackupItem,
  type RetentionPreviewPlan,
  type StorageScanResult,
  type RestorePreviewResult,
} from '../lib/api';

type Tab = 'overview' | 'backups' | 'create' | 'restore' | 'retention' | 'storage';

const statusTone = (s: string): 'success' | 'info' | 'warning' | 'danger' | 'neutral' => {
  if (s === 'VERIFIED' || s === 'COMPLETED' || s === 'OK') return 'success';
  if (s === 'CREATING' || s === 'VERIFYING' || s === 'PREPARED' || s === 'WAITING_FOR_RESTART' || s === 'RUNNING') return 'info';
  if (s === 'CORRUPT' || s === 'FAILED' || s === 'BLOCKER') return 'danger';
  if (s === 'MISSING' || s === 'WARNING') return 'warning';
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
  try {
    return new Date(s).toLocaleString();
  } catch {
    return s;
  }
};

/**
 * F32 Backup & Recovery page. Commissioner-only management surface for the
 * local SQLite backup inventory, manual creation, verification, retention,
 * storage scan, and the restart-required restore workflow.
 *
 * Invariants surfaced to the user:
 *  - backup creation never mutates world data;
 *  - only VERIFIED backups are restorable;
 *  - restore replaces the entire local world database and requires a typed
 *    confirmation phrase + a controlled server restart;
 *  - protected backups cannot be pruned;
 *  - paths are never exposed (only filenames and hash prefixes).
 *
 * Normal-mode users see only the bounded system backup status (no filenames,
 * paths, hashes, or operation details).
 */
export function BackupRecoveryPage() {
  const { enabled: commissioner } = useCommissioner();
  const [tab, setTab] = useState<Tab>('overview');
  const [status, setStatus] = useState<BackupStatusPublic | null>(null);
  const [backups, setBackups] = useState<BackupItem[]>([]);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const s = await fetchBackupStatusPublic();
      setStatus(s.item);
      if (commissioner) {
        try {
          const b = await fetchBackups();
          setBackups(b.items);
        } catch {
          setBackups([]);
        }
      }
    } catch {
      setStatus(null);
    }
  }, [commissioner]);

  useEffect(() => {
    void load();
  }, [load]);

  const run = async (fn: () => Promise<void>, label: string) => {
    setBusy(true);
    setMessage(`${label}…`);
    try {
      await fn();
      setMessage(`${label}: done.`);
      await load();
    } catch (e) {
      setMessage(`${label} failed: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(false);
    }
  };

  const tabs: Array<{ key: Tab; label: string }> = [
    { key: 'overview', label: 'Overview' },
    { key: 'backups', label: 'Backups' },
    { key: 'create', label: 'Create Backup' },
    { key: 'restore', label: 'Restore' },
    { key: 'retention', label: 'Retention' },
    { key: 'storage', label: 'Storage Scan' },
  ];

  return (
    <div className="space-y-4">
      <PageHeader
        title="Backup & Recovery"
        subtitle="Commissioner-managed safety copies of the local world database (SQLite-only). Restore replaces the entire database and requires a server restart."
      />

      {status?.maintenanceMode && (
        <Panel>
          <Badge tone="warning">Maintenance / recovery in progress</Badge>
          <p className="mt-2 text-sm text-neutral-600">
            A restore is pending or running. Mutating APIs are blocked until the restart completes and verification succeeds.
          </p>
        </Panel>
      )}

      {!commissioner && (
        <Panel>
          <p className="text-sm text-neutral-600">
            Normal-mode view: only bounded system backup health is shown. Enable Commissioner Mode to manage backups,
            retention, storage, and restore.
          </p>
        </Panel>
      )}

      {commissioner && (
        <div className="flex flex-wrap gap-2">
          {tabs.map((t) => (
            <Button key={t.key} variant={tab === t.key ? 'primary' : 'secondary'} onClick={() => setTab(t.key)}>
              {t.label}
            </Button>
          ))}
        </div>
      )}

      {message && <p className="text-sm text-neutral-700">{message}</p>}

      {tab === 'overview' && <OverviewTab status={status} />}
      {commissioner && tab === 'backups' && (
        <BackupsTab backups={backups} busy={busy} run={run} setMessage={setMessage} />
      )}
      {commissioner && tab === 'create' && (
        <CreateTab busy={busy} run={run} />
      )}
      {commissioner && tab === 'restore' && (
        <RestoreTab backups={backups} busy={busy} run={run} />
      )}
      {commissioner && tab === 'retention' && <RetentionTab />}
      {commissioner && tab === 'storage' && <StorageScanTab />}
    </div>
  );
}

function OverviewTab({ status }: { status: BackupStatusPublic | null }) {
  if (!status) return <EmptyState title="Backup status unavailable" description="The backup subsystem could not be reached." />;
  return (
    <Panel>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        <Stat label="Subsystem configured" value={status.configured ? 'Yes' : 'No'} />
        <Stat label="Verified backups" value={String(status.verifiedBackupCount)} />
        <Stat label="Corrupt / missing" value={String(status.corruptOrMissingCount)} />
        <Stat
          label="Last verified backup"
          value={status.lastVerifiedBackupAgeDays == null ? 'None' : `${status.lastVerifiedBackupAgeDays} day(s) ago`}
        />
        <Stat label="Pending restore" value={status.pendingRestore ? 'Yes' : 'No'} />
        <Stat label="Maintenance mode" value={status.maintenanceMode ? 'Yes' : 'No'} />
      </div>
      <p className="mt-3 text-xs text-neutral-500">
        SQLite-only local safety copies. No cloud durability. No filenames, paths, or hashes are exposed in this view.
      </p>
    </Panel>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs uppercase tracking-wide text-neutral-500">{label}</div>
      <div className="text-sm font-medium text-neutral-900">{value}</div>
    </div>
  );
}

function BackupsTab({
  backups,
  busy,
  run,
  setMessage,
}: {
  backups: BackupItem[];
  busy: boolean;
  run: (fn: () => Promise<void>, label: string) => void;
  setMessage: (m: string) => void;
}) {
  if (backups.length === 0) return <EmptyState title="No backups yet" description="Create a manual backup to begin." />;
  return (
    <Panel>
      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="text-left text-xs uppercase tracking-wide text-neutral-500">
              <th className="py-2 pr-3">Created</th>
              <th className="py-2 pr-3">Type</th>
              <th className="py-2 pr-3">Reason</th>
              <th className="py-2 pr-3">Status</th>
              <th className="py-2 pr-3">Size</th>
              <th className="py-2 pr-3">Season</th>
              <th className="py-2 pr-3">Hash</th>
              <th className="py-2 pr-3">Protected</th>
              <th className="py-2 pr-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            {backups.map((b) => (
              <tr key={b.id} className="border-t border-neutral-200">
                <td className="py-2 pr-3">{fmtDate(b.createdAt)}</td>
                <td className="py-2 pr-3">{b.backupType}</td>
                <td className="py-2 pr-3">{b.reasonCode}</td>
                <td className="py-2 pr-3"><Badge tone={statusTone(b.status)}>{b.status}</Badge></td>
                <td className="py-2 pr-3">{fmtBytes(b.fileSizeBytes)}</td>
                <td className="py-2 pr-3">{b.currentWorldSeasonNameSnapshot ?? '—'}</td>
                <td className="py-2 pr-3 font-mono text-xs">{b.fileSha256Prefix ?? '—'}</td>
                <td className="py-2 pr-3">{b.protected ? <Badge tone="warning">Yes</Badge> : 'No'}</td>
                <td className="py-2 pr-3 space-x-1">
                  <Button
                    variant="secondary"
                    disabled={busy}
                    onClick={() =>
                      run(async () => {
                        const r = await verifyBackup(b.id);
                        setMessage(`Verify ${b.id.slice(0, 8)}: ${r.item.outcome}`);
                      }, `Verify ${b.id.slice(0, 8)}`)
                    }
                  >
                    Verify
                  </Button>
                  {b.protected ? (
                    <Button
                      variant="secondary"
                      disabled={busy || b.backupType === 'PRE_RESTORE'}
                      onClick={() => run(async () => { await unprotectBackup(b.id, 'Manual unprotect'); }, `Unprotect ${b.id.slice(0, 8)}`)}
                    >
                      Unprotect
                    </Button>
                  ) : (
                    <Button
                      variant="secondary"
                      disabled={busy}
                      onClick={() => run(async () => { await protectBackup(b.id, 'Manual protect'); }, `Protect ${b.id.slice(0, 8)}`)}
                    >
                      Protect
                    </Button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}

function CreateTab({ busy, run }: { busy: boolean; run: (fn: () => Promise<void>, label: string) => void }) {
  const [reasonText, setReasonText] = useState('');
  return (
    <Panel>
      <p className="text-sm text-neutral-600">
        Creates a SQLite-safe snapshot (VACUUM INTO) of the current world database. Backup creation never mutates world data.
        The backup is verified (integrity check, file SHA-256, database fingerprint, manifest hash) before it becomes available.
      </p>
      <div className="mt-3 flex gap-2">
        <input
          className="flex-1 rounded border border-neutral-300 px-2 py-1 text-sm"
          placeholder="Reason text (optional)"
          value={reasonText}
          onChange={(e) => setReasonText(e.target.value)}
        />
        <Button
          variant="primary"
          disabled={busy}
          onClick={() =>
            run(async () => {
              await createManualBackup({ reasonText });
            }, 'Create manual backup')
          }
        >
          Create Backup
        </Button>
      </div>
    </Panel>
  );
}

function RestoreTab({
  backups,
  busy,
  run,
}: {
  backups: BackupItem[];
  busy: boolean;
  run: (fn: () => Promise<void>, label: string) => void;
}) {
  const verified = backups.filter((b) => b.status === 'VERIFIED');
  const [selectedId, setSelectedId] = useState('');
  const [preview, setPreview] = useState<RestorePreviewResult | null>(null);
  const [confirmPhrase, setConfirmPhrase] = useState('');
  const [reason, setReason] = useState('');

  const loadPreview = async (id: string) => {
    setSelectedId(id);
    setPreview(null);
    setConfirmPhrase('');
    if (!id) return;
    try {
      const p = await previewRestore(id);
      setPreview(p.item);
    } catch (e) {
      setPreview(null);
    }
  };

  return (
    <Panel>
      <div className="rounded border border-danger-300 bg-danger-50 p-3 text-sm text-danger-800">
        <strong>Warning:</strong> Restore replaces the <em>entire</em> local world database. All changes made after the
        selected backup will be lost. A completed restore cannot be undone except by restoring another backup. Restore is
        Commissioner-gated, creates a pre-restore backup, and requires a typed confirmation phrase plus a controlled server restart.
      </div>

      <div className="mt-3 space-y-2">
        <select
          className="w-full rounded border border-neutral-300 px-2 py-1 text-sm"
          value={selectedId}
          onChange={(e) => void loadPreview(e.target.value)}
        >
          <option value="">Select a VERIFIED backup…</option>
          {verified.map((b) => (
            <option key={b.id} value={b.id}>
              {fmtDate(b.createdAt)} · {b.reasonCode} · {fmtBytes(b.fileSizeBytes)} · {b.fileSha256Prefix}
            </option>
          ))}
        </select>

        {preview && (
          <div className="rounded border border-neutral-200 p-3 text-sm">
            <div className="grid grid-cols-2 gap-2">
              <Stat label="Compatibility" value={preview.compatibility.severity} />
              <Stat label="Allowed action" value={preview.allowedAction} />
              <Stat label="Restart required" value={preview.restartRequired ? 'Yes' : 'No'} />
              <Stat label="Pre-restore backup required" value={preview.preRestoreBackupRequired ? 'Yes' : 'No'} />
            </div>
            {preview.dataLossWarning.currentNewerOperationCount > 0 && (
              <p className="mt-2 text-warning-700">
                Data-loss warning: {preview.dataLossWarning.currentNewerOperationCount} newer migration(s) exist on the
                active database and will be rolled back to the backup's state (then re-applied as additive migrations).
              </p>
            )}
            {preview.compatibility.checks
              .filter((c) => c.severity !== 'OK')
              .map((c) => (
                <p key={c.code} className="mt-1">
                  <Badge tone={statusTone(c.severity)}>{c.severity}</Badge> <span className="text-neutral-700">{c.message}</span>
                </p>
              ))}
          </div>
        )}

        {preview && preview.allowedAction === 'PREPARE' && (
          <div className="space-y-2">
            <input
              className="w-full rounded border border-neutral-300 px-2 py-1 text-sm"
              placeholder="Reason for this restore"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
            <Button
              variant="primary"
              disabled={busy || !reason}
              onClick={() =>
                run(async () => {
                  if (!preview) return;
                  const prepared = await prepareRestore(selectedId, {
                    expectedBackupUpdatedAt: preview.backup.createdAt, // optimistic concurrency best-effort
                    expectedCurrentDatabaseFingerprint: preview.currentFingerprint,
                    reason,
                  });
                  setConfirmPhrase(prepared.item.confirmationPhrase);
                }, 'Prepare restore')
              }
            >
              Prepare Restore
            </Button>
          </div>
        )}

        {confirmPhrase && (
          <div className="space-y-2 rounded border border-warning-300 bg-warning-50 p-3">
            <p className="text-sm">
              To request the restart-required restore, type the confirmation phrase exactly:{' '}
              <code className="font-mono">{confirmPhrase}</code>
            </p>
            <input
              className="w-full rounded border border-neutral-300 px-2 py-1 text-sm"
              placeholder={confirmPhrase}
              value={confirmPhrase}
              onChange={(e) => setConfirmPhrase(e.target.value)}
            />
            <p className="text-xs text-neutral-600">
              After requesting restart, stop and restart the server. The startup bootstrap performs the atomic database
              replacement, verification, and additive migration before the app opens.
            </p>
            <div className="flex gap-2">
              <Button
                variant="primary"
                disabled={busy}
                onClick={() =>
                  run(async () => {
                    // Re-derive the run id from the latest prepared restore.
                    const { fetchRestoreRuns } = await import('../lib/api');
                    const runs = await fetchRestoreRuns();
                    const pending = runs.items.find((r) => r.status === 'PREPARED' || r.status === 'WAITING_FOR_RESTART');
                    if (!pending) throw new Error('No prepared restore found');
                    await requestRestart(pending.id, confirmPhrase);
                    setConfirmPhrase('');
                  }, 'Request restart')
                }
              >
                Request Restart
              </Button>
              <Button
                variant="secondary"
                disabled={busy}
                onClick={() =>
                  run(async () => {
                    const { fetchRestoreRuns } = await import('../lib/api');
                    const runs = await fetchRestoreRuns();
                    const pending = runs.items.find((r) => r.status === 'PREPARED' || r.status === 'WAITING_FOR_RESTART');
                    if (!pending) throw new Error('No prepared restore found');
                    await cancelRestore(pending.id, 'Cancelled from UI');
                    setConfirmPhrase('');
                  }, 'Cancel restore')
                }
              >
                Cancel
              </Button>
            </div>
          </div>
        )}
      </div>
    </Panel>
  );
}

function RetentionTab() {
  const [plan, setPlan] = useState<RetentionPreviewPlan | null>(null);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');

  const load = useCallback(async () => {
    try {
      setPlan(await previewRetention());
    } catch {
      setPlan(null);
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  return (
    <Panel>
      <p className="text-sm text-neutral-600">
        Deterministic retention preview. Protected backups are never pruned. Execution is Commissioner-gated and requires an explicit reason.
      </p>
      {plan && (
        <div className="mt-3 text-sm">
          <div>Keep: {plan.plan.keepIds.length}</div>
          <div>Proposed for pruning: {plan.plan.pruneIds.length}</div>
          <div>Protected: {plan.plan.protectedIds.length}</div>
        </div>
      )}
      <div className="mt-3 flex gap-2">
        <input
          className="flex-1 rounded border border-neutral-300 px-2 py-1 text-sm"
          placeholder="Reason for pruning"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
        />
        <Button
          variant="primary"
          disabled={busy || !reason || !plan || plan.plan.pruneIds.length === 0}
          onClick={async () => {
            setBusy(true);
            try {
              await executePrune(reason, plan!.plan.pruneIds);
              setMsg('Prune complete.');
              await load();
            } catch (e) {
              setMsg(`Prune failed: ${e instanceof Error ? e.message : String(e)}`);
            } finally {
              setBusy(false);
            }
          }}
        >
          Execute Prune
        </Button>
      </div>
      {msg && <p className="mt-2 text-sm">{msg}</p>}
    </Panel>
  );
}

function StorageScanTab() {
  const [result, setResult] = useState<StorageScanResult | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <Panel>
      <p className="text-sm text-neutral-600">
        Scans the backup directory for stale/orphan/corrupt artifacts. No automatic deletion — findings are reported only.
      </p>
      <Button
        variant="primary"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          try {
            const r = await scanStorage();
            setResult(r.item);
          } finally {
            setBusy(false);
          }
        }}
      >
        Scan Storage
      </Button>
      {result && (
        <div className="mt-3 text-sm">
          <div>Total files: {result.totalFiles} · metadata rows: {result.totalMetadataRows} · findings: {result.findings.length}</div>
          {result.findings.length > 0 && (
            <ul className="mt-2 space-y-1">
              {result.findings.map((f, i) => (
                <li key={i} className="rounded border border-neutral-200 p-2">
                  <Badge tone={statusTone('WARNING')}>{f.kind}</Badge> <span className="font-mono text-xs">{f.fileName}</span>
                  <div className="text-xs text-neutral-600">{f.message}</div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </Panel>
  );
}
