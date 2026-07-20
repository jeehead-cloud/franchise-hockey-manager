import { ShieldCheck, ShieldAlert } from 'lucide-react';
import { useCommissioner } from '../../lib/commissioner';

/**
 * Compact global Commissioner Mode control for the TopBar action area.
 *
 * - Off: a ghost button labelled "Commissioner: Off" that opens the existing
 *   enable-confirmation dialog (requestEnable). No silent enable.
 * - On: a warning-tone "Commissioner: On" badge button that disables on click
 *   (tryDisable). If a dirty guard is registered, the existing discard dialog
 *   opens instead of silently disabling.
 *
 * State comes from the single global CommissionerProvider; there is no
 * page-local state. The strong always-on CommissionerBanner remains under the
 * TopBar for visual prominence. This control only makes the global state
 * visible and reachable from every page.
 *
 * This is a local-sandbox indicator, NOT authentication.
 */
export function CommissionerToggle() {
  const { enabled, requestEnable, tryDisable } = useCommissioner();

  if (enabled) {
    return (
      <button
        type="button"
        onClick={() => tryDisable()}
        title="Commissioner Mode is ON. Click to disable. (Local sandbox; not authentication.)"
        aria-label="Commissioner Mode is on. Click to disable."
        aria-pressed={true}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 6,
          padding: '2px 10px',
          height: 30,
          borderRadius: 'var(--radius-md)',
          border: '1px solid var(--accent-warning, #d97706)',
          background: 'var(--accent-warning-muted, #fff4e5)',
          color: 'var(--accent-warning, #b45309)',
          cursor: 'pointer',
          font: 'var(--text-label-wide)',
          letterSpacing: 'var(--text-tracking-wide)',
          textTransform: 'uppercase',
        }}
      >
        <ShieldAlert size={14} aria-hidden />
        <span>Commissioner: On</span>
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={requestEnable}
      title="Enable Commissioner Mode (local sandbox; not authentication). Opens a confirmation."
      aria-label="Enable Commissioner Mode."
      aria-pressed={false}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        padding: '2px 10px',
        height: 30,
        borderRadius: 'var(--radius-md)',
        border: '1px solid var(--border-default)',
        background: 'transparent',
        color: 'var(--text-secondary)',
        cursor: 'pointer',
        font: 'var(--text-label-wide)',
        letterSpacing: 'var(--text-tracking-wide)',
        textTransform: 'uppercase',
      }}
    >
      <ShieldCheck size={14} aria-hidden />
      <span>Commissioner: Off</span>
    </button>
  );
}
