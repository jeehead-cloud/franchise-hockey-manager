import type { ReactNode } from 'react';
import { Badge } from '../ui/Badge';

export function PageHeader({
  title,
  subtitle,
  badge,
  actions,
}: {
  title: string;
  subtitle?: string;
  badge?: string;
  actions?: ReactNode;
}) {
  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        gap: 16,
        marginBottom: 16,
      }}
    >
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <h1 style={{ margin: 0, font: 'var(--text-heading-lg)', color: 'var(--text-primary)' }}>
            {title}
          </h1>
          {badge && <Badge tone="primary">{badge}</Badge>}
        </div>
        {subtitle && (
          <p style={{ margin: '4px 0 0', font: 'var(--text-body-sm)', color: 'var(--text-tertiary)' }}>
            {subtitle}
          </p>
        )}
      </div>
      {actions}
    </div>
  );
}
