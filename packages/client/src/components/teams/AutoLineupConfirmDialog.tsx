import { Dialog } from '../ui/Dialog';
import { Field, TextInput } from '../ui/DataBrowser';

export type LineupActionMode = 'REPLACE' | 'FILL_EMPTY' | 'CLEAR';

/**
 * Shared confirmation dialog for auto-lineup / clear-lineup actions.
 *
 * Replaces the three divergent copies (TeamDetailPage, TeamLinesEditPage, and
 * the NationalTeamDetailPage no-dialog variant) with one component using
 * plain-language copy, the team/tournament name, a clear warning that the
 * current lineup is replaced, an explanation that Commissioner changes are
 * recorded in the audit history, a meaningful reason placeholder, and a
 * primary action labelled with the concrete outcome.
 *
 * The audit reason stays mandatory and whitespace-only values are rejected by
 * the caller (server requires `reason` non-empty). The caller disables the
 * confirm button when `reason.trim()` is empty via `reasonIsValid`.
 */
export function AutoLineupConfirmDialog({
  open,
  mode,
  targetName,
  reason,
  onReasonChange,
  busy,
  onClose,
  onConfirm,
  reasonError,
}: {
  open: boolean;
  mode: LineupActionMode | null;
  targetName: string;
  reason: string;
  onReasonChange: (next: string) => void;
  busy: boolean;
  onClose: () => void;
  onConfirm: () => void;
  reasonError?: string | null;
}) {
  if (!mode) {
    // Dialog stays mounted; render an inert closed shell so transition state is
    // consistent for callers that always render this component.
    return (
      <Dialog open={false} title="" onClose={onClose}>
        {null}
      </Dialog>
    );
  }

  const copy = copyFor(mode, targetName);
  const reasonIsValid = reason.trim().length > 0;

  return (
    <Dialog
      open={open}
      title={copy.title}
      confirmLabel={copy.confirmLabel}
      cancelLabel="Cancel"
      confirmVariant={mode === 'CLEAR' ? 'danger' : 'primary'}
      busy={busy}
      onClose={onClose}
      onConfirm={reasonIsValid ? onConfirm : undefined}
    >
      <p style={{ marginTop: 0 }}>{copy.body}</p>
      <p style={{ margin: '0 0 8px', font: 'var(--text-body-sm)', color: 'var(--text-secondary)' }}>
        Commissioner changes are recorded in the audit history.
      </p>
      <Field label="Reason" htmlFor="auto-lineup-reason">
        <TextInput
          id="auto-lineup-reason"
          value={reason}
          placeholder="e.g. Reset to best-on-best after trade deadline"
          onChange={(e) => onReasonChange(e.target.value)}
          aria-invalid={Boolean(reasonError)}
        />
      </Field>
      {reasonError ? (
        <p style={{ margin: '6px 0 0', color: 'var(--accent-danger)', font: 'var(--text-body-sm)' }}>
          {reasonError}
        </p>
      ) : !reasonIsValid ? (
        <p style={{ margin: '6px 0 0', color: 'var(--text-tertiary)', font: 'var(--text-body-sm)' }}>
          An audit reason is required.
        </p>
      ) : null}
    </Dialog>
  );
}

function copyFor(mode: LineupActionMode, targetName: string): { title: string; body: string; confirmLabel: string } {
  switch (mode) {
    case 'REPLACE':
      return {
        title: `Generate and replace lineup for ${targetName}?`,
        body: `This replaces the entire ${targetName} lineup using the deterministic auto-lineup rules (position fit, current ability, role) and saves immediately. The current lineup will be discarded.`,
        confirmLabel: 'Generate and replace lineup',
      };
    case 'FILL_EMPTY':
      return {
        title: `Fill empty slots for ${targetName}?`,
        body: `This fills only the empty slots in the ${targetName} lineup using the auto-lineup rules. Existing assignments are kept.`,
        confirmLabel: 'Fill empty slots',
      };
    case 'CLEAR':
      return {
        title: `Clear ${targetName} lineup?`,
        body: `This removes every assignment from the ${targetName} lineup and saves immediately. The roster itself is unchanged.`,
        confirmLabel: 'Clear lineup',
      };
  }
}
