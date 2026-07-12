import type { ReactNode } from 'react';

type Tone = 'neutral' | 'info' | 'success' | 'danger' | 'primary' | 'warning';

const toneMap: Record<Tone, { bg: string; fg: string }> = {
  neutral: { bg: 'var(--gray-2)', fg: 'var(--gray-8)' },
  info: { bg: 'var(--accent-info-muted)', fg: 'var(--accent-info)' },
  success: { bg: 'var(--accent-success-muted)', fg: 'var(--accent-success)' },
  danger: { bg: 'var(--accent-danger-muted)', fg: 'var(--accent-danger)' },
  primary: { bg: 'var(--accent-primary-wash)', fg: 'var(--accent-primary)' },
  warning: { bg: 'var(--accent-warning-muted)', fg: 'var(--accent-warning)' },
};

/** Adapted from design/system/components/feedback/Badge.jsx */
export function Badge({ children, tone = 'neutral' }: { children: ReactNode; tone?: Tone }) {
  const t = toneMap[tone];
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        padding: '2px 8px',
        borderRadius: 'var(--radius-pill)',
        background: t.bg,
        color: t.fg,
        font: 'var(--text-label-wide)',
        letterSpacing: 'var(--text-tracking-wide)',
        textTransform: 'uppercase',
      }}
    >
      {children}
    </span>
  );
}
