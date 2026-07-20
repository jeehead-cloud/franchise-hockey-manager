import { Calendar, ChevronRight } from 'lucide-react';
import { Badge } from '../ui/Badge';
import { useCurrentWorldSeason } from '../../lib/useCurrentWorldSeason';

function phaseTone(status: string): 'neutral' | 'success' | 'info' | 'warning' {
  switch (status) {
    case 'ACTIVE':
      return 'success';
    case 'COMPLETED':
      return 'info';
    case 'ARCHIVED':
      return 'neutral';
    case 'PLANNED':
      return 'warning';
    default:
      return 'neutral';
  }
}

export function TopBar({ title }: { title: string }) {
  const { season, loading } = useCurrentWorldSeason();

  const seasonLabel = season ? season.label : loading ? '—' : null;

  return (
    <header
      style={{
        height: 52,
        flexShrink: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 18px',
        borderBottom: '1px solid var(--border-subtle)',
        background: 'var(--surface-panel)',
        gap: 16,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, minWidth: 0 }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 7,
            font: 'var(--text-data-md)',
            color: 'var(--text-secondary)',
            whiteSpace: 'nowrap',
          }}
          className="max-sm:hidden"
        >
          <Calendar size={14} aria-hidden />
          <span style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{seasonLabel ?? 'No season'}</span>
        </div>
        {season ? (
          <Badge tone={phaseTone(season.status)}>
            {season.status} · {season.phase.replaceAll('_', ' ').toLowerCase()}
          </Badge>
        ) : (
          <Badge tone="neutral">No world</Badge>
        )}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            font: 'var(--text-body-sm)',
            color: 'var(--text-tertiary)',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          <ChevronRight size={12} aria-hidden style={{ flexShrink: 0 }} />
          <span>{title}</span>
        </div>
      </div>
    </header>
  );
}
