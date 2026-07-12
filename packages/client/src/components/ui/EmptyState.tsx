import type { ReactNode } from 'react';
import { Button } from './Button';

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: { label: string; onClick: () => void };
}) {
  return (
    <div
      role="status"
      style={{
        padding: '32px 24px',
        textAlign: 'center',
        background: 'var(--surface-panel)',
        border: '1px dashed var(--border-default)',
        borderRadius: 'var(--radius-md)',
      }}
    >
      <div style={{ font: 'var(--text-heading-sm)', color: 'var(--text-primary)' }}>{title}</div>
      <p
        style={{
          margin: '8px auto 0',
          maxWidth: 420,
          font: 'var(--text-body-sm)',
          color: 'var(--text-tertiary)',
        }}
      >
        {description}
      </p>
      {action && (
        <div style={{ marginTop: 16 }}>
          <Button variant="secondary" onClick={action.onClick}>
            {action.label}
          </Button>
        </div>
      )}
    </div>
  );
}

export function LoadingState({ label = 'Loading…' }: { label?: string }) {
  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        padding: 24,
        font: 'var(--text-body-sm)',
        color: 'var(--text-tertiary)',
      }}
    >
      {label}
    </div>
  );
}

export function ErrorState({
  title = 'Something went wrong',
  description,
  children,
}: {
  title?: string;
  description: string;
  children?: ReactNode;
}) {
  return (
    <div
      role="alert"
      style={{
        padding: 20,
        background: 'var(--accent-danger-wash)',
        border: '1px solid var(--accent-danger-muted)',
        borderRadius: 'var(--radius-md)',
        color: 'var(--accent-danger)',
      }}
    >
      <div style={{ font: 'var(--text-heading-sm)' }}>{title}</div>
      <p style={{ margin: '6px 0 0', font: 'var(--text-body-sm)' }}>{description}</p>
      {children}
    </div>
  );
}
