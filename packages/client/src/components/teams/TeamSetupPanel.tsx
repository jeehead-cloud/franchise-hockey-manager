import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Badge } from '../ui/Badge';
import { Button } from '../ui/Button';
import { Field, SelectInput, TextInput } from '../ui/DataBrowser';
import { ErrorState, LoadingState } from '../ui/EmptyState';
import { Panel } from '../ui/Panel';
import {
  getCoaches,
  getCommissionerTeamSetup,
  getTeam,
  updateCommissionerTeamSetup,
  type CoachItem,
  type TeamDetail,
} from '../../lib/api';
import { useCommissioner } from '../../lib/commissioner';
import { isAbortError } from '../../lib/api';

const TACTICAL_STYLES: Array<{ value: string; label: string }> = [
  { value: 'COMBINATIONAL', label: 'Combinational' },
  { value: 'PHYSICAL', label: 'Physical' },
  { value: 'SPEED', label: 'Speed' },
  { value: 'SYSTEM', label: 'System' },
  { value: 'FORECHECKING', label: 'Forechecking' },
];

interface SetupState {
  tacticalStyle: string; // '' == not configured (null on server)
  headCoachId: string; // '' == unassigned (null on server)
  reason: string;
  replaceExisting: boolean;
  moveFromOtherTeam: boolean;
}

/**
 * Team Setup panel — the single home for Commissioner head-coach
 * assignment/replacement (Finding 2) and tactical-style editing (Finding 3).
 *
 * Both actions ride the existing `PATCH /api/commissioner/teams/:id/setup`
 * endpoint (one transaction, optimistic concurrency via expectedUpdatedAt,
 * audit reason required, HEAD_COACH_ASSIGNED / HEAD_COACH_UNASSIGNED /
 * TEAM_TACTICS_UPDATED audit actions). No new server endpoint or domain logic
 * is introduced.
 *
 * The form intentionally uses beforeunload + popstate for dirty-form guarding
 * (NOT React Router's useBlocker) because the app uses the declarative
 * <BrowserRouter> and useBlocker throws outside a data router — see the first
 * stabilization iteration's ErrorBoundary / PlayerEditPage fix.
 */
export function TeamSetupPanel({
  teamId,
  team,
  onTeamChanged,
}: {
  teamId: string;
  team: TeamDetail;
  onTeamChanged: (next: TeamDetail) => void;
}) {
  const { enabled } = useCommissioner();
  const [editing, setEditing] = useState(false);
  const [setup, setSetup] = useState<{
    tacticalStyle: string | null;
    headCoachId: string | null;
    updatedAt: string;
  } | null>(null);
  const [coaches, setCoaches] = useState<CoachItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState<SetupState | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    setLoading(true);
    Promise.all([
      getCommissionerTeamSetup(teamId),
      getCoaches({ pageSize: 100, sort: 'lastName', direction: 'asc' }, controller.signal),
    ])
      .then(([setupRes, coachRes]) => {
        setSetup({
          tacticalStyle: setupRes.item.tacticalStyle,
          headCoachId: setupRes.item.coach?.id ?? null,
          updatedAt: setupRes.item.updatedAt,
        });
        setCoaches(coachRes.items);
        setError(null);
      })
      .catch((err: unknown) => {
        if (isAbortError(err, controller.signal)) return;
        setError(err instanceof Error ? err.message : 'Failed to load team setup');
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [enabled, teamId]);

  const selectedCoach = useMemo(
    () => (form ? coaches.find((c) => c.id === form.headCoachId) ?? null : null),
    [form, coaches],
  );

  const currentCoach = team.coach;

  function startEdit() {
    setForm({
      tacticalStyle: setup?.tacticalStyle ?? '',
      headCoachId: setup?.headCoachId ?? '',
      reason: '',
      replaceExisting: false,
      moveFromOtherTeam: false,
    });
    setError(null);
    setEditing(true);
  }

  function cancelEdit() {
    setEditing(false);
    setForm(null);
    setError(null);
  }

  const dirty = useMemo(() => {
    if (!form || !setup) return false;
    const tacticsChanged = (form.tacticalStyle || '') !== (setup.tacticalStyle ?? '');
    const coachChanged = (form.headCoachId || '') !== (setup.headCoachId ?? '');
    return tacticsChanged || coachChanged;
  }, [form, setup]);

  // Dirty-form navigation guard — beforeunload + popstate only (no useBlocker,
  // which requires a data router and would throw in <BrowserRouter>).
  useEffect(() => {
    if (!dirty) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    const onPopState = () => {
      if (!window.confirm('You have unsaved team-setup changes. Leave this page?')) {
        window.history.pushState(null, '', window.location.href);
      }
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    window.addEventListener('popstate', onPopState);
    return () => {
      window.removeEventListener('beforeunload', onBeforeUnload);
      window.removeEventListener('popstate', onPopState);
    };
  }, [dirty]);

  async function save() {
    if (!form) return;
    if (!form.reason.trim()) {
      setError('An audit reason is required.');
      return;
    }
    if (!setup) return;
    setBusy(true);
    setError(null);
    try {
      const res = await updateCommissionerTeamSetup(teamId, {
        expectedUpdatedAt: setup.updatedAt,
        reason: form.reason.trim(),
        headCoachId: form.headCoachId || null,
        tacticalStyle: form.tacticalStyle || null,
        replaceExisting: form.replaceExisting || undefined,
        moveFromOtherTeam: form.moveFromOtherTeam || undefined,
      });
      const updated = (res as { item: { tacticalStyle: string | null; coach: CoachItem | null; updatedAt: string } }).item;
      setSetup({
        tacticalStyle: updated.tacticalStyle,
        headCoachId: updated.coach?.id ?? null,
        updatedAt: updated.updatedAt,
      });
      setEditing(false);
      setForm(null);
      // Refresh the team detail so the Overview/Lines readiness + coach reflect the change.
      const refreshed = await getTeam(teamId);
      onTeamChanged(refreshed.item);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Save failed';
      // Conflict guidance — surface actionable hints for the two coach-conflict codes.
      if (/HeadCoachAlreadyAssigned/i.test(message)) {
        setError('This team already has a head coach. Check "Replace current coach" to reassign.');
      } else if (/CoachAssignedElsewhere/i.test(message)) {
        setError(
          'That coach is currently assigned to another team. Check "Move from other team" to reassign.',
        );
      } else if (/EditConflict/i.test(message)) {
        setError('This team was modified since the editor was loaded. Cancel and reopen to edit.');
      } else {
        setError(message);
      }
    } finally {
      setBusy(false);
    }
  }

  if (!enabled) {
    return (
      <Panel title="Team setup">
        <FieldRow label="Tactical style" value={team.tacticalStyle ?? 'Not configured'} />
        <FieldRow
          label="Head coach"
          value={currentCoach ? `${currentCoach.firstName} ${currentCoach.lastName}` : 'Unassigned'}
        />
        <p style={{ margin: '12px 0 0', font: 'var(--text-body-sm)', color: 'var(--text-tertiary)' }}>
          Enable Commissioner Mode (top bar) to change tactics or the head-coach assignment.
        </p>
      </Panel>
    );
  }

  if (loading && !setup) {
    return (
      <Panel title="Team setup">
        <LoadingState label="Loading team setup…" />
      </Panel>
    );
  }

  if (error && !setup) {
    return (
      <Panel title="Team setup">
        <ErrorState description={error} />
        <Button variant="secondary" onClick={() => setEditing(false)}>
          Dismiss
        </Button>
      </Panel>
    );
  }

  if (!setup) return null;

  return (
    <Panel
      title="Team setup"
      actions={
        !editing ? (
          <Button size="sm" onClick={startEdit}>
            Edit setup
          </Button>
        ) : null
      }
    >
      {!editing ? (
        <>
          <FieldRow label="Tactical style" value={setup.tacticalStyle ?? 'Not configured'} />
          <FieldRow
            label="Head coach"
            value={currentCoach ? `${currentCoach.firstName} ${currentCoach.lastName}` : 'Unassigned'}
          />
          {team.readiness ? <ReadinessRow status={team.readiness.status} /> : null}
        </>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <p style={{ margin: 0, font: 'var(--text-body-sm)', color: 'var(--text-secondary)' }}>
            Changes are saved in one transaction and recorded in the audit history. Derived readiness
            updates after save.
          </p>
          <Field label="Head coach" htmlFor="team-setup-coach">
            <SelectInput
              id="team-setup-coach"
              value={form?.headCoachId ?? ''}
              onChange={(e) => setForm((f) => (f ? { ...f, headCoachId: e.target.value } : f))}
            >
              <option value="">Unassigned (no head coach)</option>
              {coaches.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.firstName} {c.lastName}
                  {c.currentTeam ? ` (currently: ${c.currentTeam.name})` : ''}
                </option>
              ))}
            </SelectInput>
          </Field>
          {selectedCoach && selectedCoach.currentTeam && selectedCoach.currentTeam.id !== teamId ? (
            <label style={{ display: 'inline-flex', gap: 6, alignItems: 'center', font: 'var(--text-body-sm)' }}>
              <input
                type="checkbox"
                checked={form?.moveFromOtherTeam ?? false}
                onChange={(e) => setForm((f) => (f ? { ...f, moveFromOtherTeam: e.target.checked } : f))}
              />
              Move from other team ({selectedCoach.currentTeam.name})
            </label>
          ) : null}
          {currentCoach && form && form.headCoachId && form.headCoachId !== (setup.headCoachId ?? '') ? (
            <label style={{ display: 'inline-flex', gap: 6, alignItems: 'center', font: 'var(--text-body-sm)' }}>
              <input
                type="checkbox"
                checked={form.replaceExisting}
                onChange={(e) => setForm((f) => (f ? { ...f, replaceExisting: e.target.checked } : f))}
              />
              Replace current coach ({currentCoach.firstName} {currentCoach.lastName})
            </label>
          ) : null}
          <Field label="Tactical style" htmlFor="team-setup-tactics">
            <SelectInput
              id="team-setup-tactics"
              value={form?.tacticalStyle ?? ''}
              onChange={(e) => setForm((f) => (f ? { ...f, tacticalStyle: e.target.value } : f))}
            >
              <option value="">Not configured</option>
              {TACTICAL_STYLES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label} ({t.value})
                </option>
              ))}
            </SelectInput>
          </Field>
          <Field label="Reason (required)" htmlFor="team-setup-reason">
            <TextInput
              id="team-setup-reason"
              value={form?.reason ?? ''}
              placeholder="Why is this Commissioner correction being made?"
              onChange={(e) => setForm((f) => (f ? { ...f, reason: e.target.value } : f))}
            />
          </Field>
          {error ? <ErrorState description={error} /> : null}
          <div style={{ display: 'flex', gap: 8 }}>
            <Button onClick={() => void save()} disabled={busy || !dirty}>
              {busy ? 'Saving…' : 'Save changes'}
            </Button>
            <Button variant="secondary" disabled={busy} onClick={cancelEdit}>
              Cancel
            </Button>
          </div>
        </div>
      )}
    </Panel>
  );
}

function FieldRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        gap: 12,
        padding: '6px 0',
        borderBottom: '1px solid var(--border-subtle)',
        font: 'var(--text-body-sm)',
      }}
    >
      <span style={{ color: 'var(--text-tertiary)' }}>{label}</span>
      <span style={{ color: 'var(--text-primary)', textAlign: 'right' }}>{value}</span>
    </div>
  );
}

function ReadinessRow({ status }: { status: 'READY' | 'WARNING' | 'NOT_READY' }) {
  const tone = status === 'READY' ? 'success' : status === 'WARNING' ? 'warning' : 'danger';
  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        gap: 12,
        padding: '6px 0',
        borderBottom: '1px solid var(--border-subtle)',
        font: 'var(--text-body-sm)',
      }}
    >
      <span style={{ color: 'var(--text-tertiary)' }}>Readiness</span>
      <Badge tone={tone}>{status}</Badge>
    </div>
  );
}
