import type { CSSProperties, ReactNode } from 'react';

/** Adapted from design/system/components/game/Panel.jsx */
export function Panel({
  title,
  actions,
  children,
  width = '100%',
  style,
}: {
  title?: string;
  actions?: ReactNode;
  children: ReactNode;
  width?: string;
  style?: CSSProperties;
}) {
  return (
    <div
      style={{
        width,
        background: 'var(--surface-panel)',
        border: '1px solid var(--border-default)',
        borderRadius: 'var(--radius-md)',
        boxShadow: 'var(--shadow-sm)',
        overflow: 'hidden',
        boxSizing: 'border-box',
        ...style,
      }}
    >
      {title && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '10px 12px',
            borderBottom: '1px solid var(--border-subtle)',
            background: 'var(--surface-panel-raised)',
          }}
        >
          <span
            style={{
              font: 'var(--text-label-wide)',
              letterSpacing: 'var(--text-tracking-wide)',
              textTransform: 'uppercase',
              color: 'var(--text-tertiary)',
            }}
          >
            {title}
          </span>
          {actions && <div style={{ display: 'flex', gap: '4px' }}>{actions}</div>}
        </div>
      )}
      <div style={{ padding: '12px' }}>{children}</div>
    </div>
  );
}
