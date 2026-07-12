import type { ReactNode } from 'react';
import { Button } from './Button';

/** Adapted from design/system/components/feedback/Dialog.jsx */
export function Dialog({
  open,
  title,
  children,
  onClose,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  onConfirm,
  confirmVariant = 'primary',
  busy = false,
}: {
  open: boolean;
  title: string;
  children: ReactNode;
  onClose: () => void;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm?: () => void;
  confirmVariant?: 'primary' | 'danger';
  busy?: boolean;
}) {
  if (!open) return null;
  return (
    <div
      role="presentation"
      style={{
        position: 'fixed',
        inset: 0,
        background: 'var(--surface-overlay, rgba(15, 23, 42, 0.45))',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 100,
        padding: 16,
      }}
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="fhm-dialog-title"
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 'min(420px, 100%)',
          background: 'var(--surface-panel)',
          border: '1px solid var(--border-default)',
          borderRadius: 'var(--radius-lg)',
          boxShadow: 'var(--shadow-lg, 0 12px 40px rgba(0,0,0,0.18))',
          overflow: 'hidden',
        }}
      >
        <div
          id="fhm-dialog-title"
          style={{
            padding: 16,
            borderBottom: '1px solid var(--border-subtle)',
            font: 'var(--text-heading-sm)',
            color: 'var(--text-primary)',
          }}
        >
          {title}
        </div>
        <div style={{ padding: 16, font: 'var(--text-body)', color: 'var(--text-secondary)' }}>
          {children}
        </div>
        <div
          style={{
            padding: '12px 16px',
            borderTop: '1px solid var(--border-subtle)',
            display: 'flex',
            justifyContent: 'flex-end',
            gap: 8,
          }}
        >
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            {cancelLabel}
          </Button>
          {onConfirm ? (
            <Button variant={confirmVariant} onClick={onConfirm} disabled={busy}>
              {confirmLabel}
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
