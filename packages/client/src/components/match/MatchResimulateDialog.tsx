import { Field, TextInput } from '../ui/DataBrowser';
import { Dialog } from '../ui/Dialog';

export function MatchResimulateDialog({
  open,
  busy,
  error,
  reason,
  seed,
  onReasonChange,
  onSeedChange,
  onClose,
  onConfirm,
}: {
  open: boolean;
  busy: boolean;
  error: string | null;
  reason: string;
  seed: string;
  onReasonChange: (value: string) => void;
  onSeedChange: (value: string) => void;
  onClose: () => void;
  onConfirm: () => void;
}) {
  return (
    <Dialog
      open={open}
      title="Resimulate match?"
      confirmLabel="Resimulate with new seed"
      confirmVariant="danger"
      busy={busy}
      onClose={onClose}
      onConfirm={onConfirm}
    >
      <p style={{ margin: '0 0 8px' }}>
        The current result will be <strong>superseded</strong>, not deleted. The original immutable
        simulation input is reused; only the seed changes. Standings are not affected in F15.
      </p>
      <Field label="Reason" htmlFor="resim-reason">
        <TextInput id="resim-reason" value={reason} onChange={(e) => onReasonChange(e.target.value)} />
      </Field>
      <Field label="New seed (optional)" htmlFor="resim-seed">
        <TextInput
          id="resim-seed"
          value={seed}
          placeholder="Leave blank for server-generated seed"
          onChange={(e) => onSeedChange(e.target.value)}
        />
      </Field>
      {error ? (
        <p style={{ color: 'var(--status-danger, var(--accent-danger))', marginTop: 8 }} role="alert">
          {error}
        </p>
      ) : null}
    </Dialog>
  );
}
