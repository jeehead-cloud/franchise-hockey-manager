import type { ConnectionState } from '../../lib/api';

const styles: Record<ConnectionState, { bg: string; fg: string; label: string }> = {
  loading: { bg: 'var(--gray-2)', fg: 'var(--text-tertiary)', label: 'Checking…' },
  connected: { bg: 'var(--accent-success-wash)', fg: 'var(--accent-success)', label: 'Connected' },
  unavailable: {
    bg: 'var(--accent-danger-wash)',
    fg: 'var(--accent-danger)',
    label: 'Unavailable',
  },
};

export function ConnectionStatus({
  state,
  detail,
}: {
  state: ConnectionState;
  detail?: string | null;
}) {
  const s = styles[state];
  return (
    <div
      title={detail ?? s.label}
      aria-live="polite"
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        padding: '3px 8px',
        borderRadius: 'var(--radius-pill)',
        background: s.bg,
        color: s.fg,
        font: 'var(--text-label-wide)',
        letterSpacing: 'var(--text-tracking-wide)',
        textTransform: 'uppercase',
        whiteSpace: 'nowrap',
      }}
    >
      <span
        aria-hidden
        style={{
          width: 6,
          height: 6,
          borderRadius: '50%',
          background: s.fg,
          flexShrink: 0,
        }}
      />
      {s.label}
    </div>
  );
}
