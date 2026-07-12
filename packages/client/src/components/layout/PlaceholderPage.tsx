import type { ReactNode } from 'react';
import { EmptyState } from '../ui/EmptyState';
import { Panel } from '../ui/Panel';
import { Tabs } from '../ui/Tabs';
import { PageHeader } from './PageHeader';

/** Shared placeholder layout for F1 product areas — no invented gameplay data. */
export function PlaceholderPage({
  title,
  purpose,
  tabs,
  children,
}: {
  title: string;
  purpose: string;
  tabs?: { value: string; label: string }[];
  children?: ReactNode;
}) {
  return (
    <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 16 }}>
      <PageHeader title={title} subtitle={purpose} badge="Not implemented" />

      {tabs && tabs.length > 0 && (
        <Tabs items={tabs} value={tabs[0]!.value} onChange={() => undefined} />
      )}

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
          gap: 16,
        }}
      >
        <Panel title="Area status">
          <p style={{ margin: 0, font: 'var(--text-body-sm)', color: 'var(--text-secondary)' }}>
            This product area is part of the approved application shell. Gameplay systems for{' '}
            {title.toLowerCase()} arrive in later milestones.
          </p>
        </Panel>
        <Panel title="What will live here">
          <p style={{ margin: 0, font: 'var(--text-body-sm)', color: 'var(--text-secondary)' }}>
            {purpose}
          </p>
        </Panel>
      </div>

      <EmptyState
        title={`${title} is not available yet`}
        description="No gameplay data is loaded in F1. This page exists so navigation, layout, and design-system patterns can be validated against the approved screens."
      />

      {children}
    </div>
  );
}
