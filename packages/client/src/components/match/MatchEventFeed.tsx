import { Field, Pagination, SelectInput } from '../ui/DataBrowser';
import { EmptyState, LoadingState } from '../ui/EmptyState';
import { Panel } from '../ui/Panel';
import type { MatchEventCategory, MatchEventViewPage, MatchOverviewTeam } from '../../lib/api';

const CATEGORIES: { value: MatchEventCategory | ''; label: string }[] = [
  { value: '', label: 'All' },
  { value: 'goals', label: 'Goals' },
  { value: 'shots', label: 'Shots' },
  { value: 'saves', label: 'Saves' },
  { value: 'penalties', label: 'Penalties' },
  { value: 'faceoffs', label: 'Faceoffs' },
  { value: 'overtime', label: 'Overtime' },
  { value: 'shootout', label: 'Shootout' },
];

export function MatchEventFeed({
  events,
  loading,
  homeTeam,
  awayTeam,
  period,
  category,
  teamId,
  onPeriodChange,
  onCategoryChange,
  onTeamChange,
  onPageChange,
}: {
  events: MatchEventViewPage | null;
  loading?: boolean;
  homeTeam: MatchOverviewTeam;
  awayTeam: MatchOverviewTeam;
  period: string;
  category: string;
  teamId: string;
  onPeriodChange: (value: string) => void;
  onCategoryChange: (value: string) => void;
  onTeamChange: (value: string) => void;
  onPageChange: (page: number) => void;
}) {
  return (
    <Panel title="Event feed">
      <div style={{ display: 'flex', gap: 12, marginBottom: 12, flexWrap: 'wrap' }}>
        <Field label="Period" htmlFor="event-period">
          <SelectInput
            id="event-period"
            value={period}
            onChange={(e) => onPeriodChange(e.target.value)}
          >
            <option value="">All</option>
            {[1, 2, 3, 4, 5].map((p) => (
              <option key={p} value={String(p)}>
                {p === 4 ? 'OT' : p === 5 ? 'SO' : `P${p}`}
              </option>
            ))}
          </SelectInput>
        </Field>
        <Field label="Category" htmlFor="event-category">
          <SelectInput
            id="event-category"
            value={category}
            onChange={(e) => onCategoryChange(e.target.value)}
          >
            {CATEGORIES.map((c) => (
              <option key={c.value || 'all'} value={c.value}>
                {c.label}
              </option>
            ))}
          </SelectInput>
        </Field>
        <Field label="Team" htmlFor="event-team">
          <SelectInput id="event-team" value={teamId} onChange={(e) => onTeamChange(e.target.value)}>
            <option value="">All</option>
            <option value={awayTeam.id}>{awayTeam.name}</option>
            <option value={homeTeam.id}>{homeTeam.name}</option>
          </SelectInput>
        </Field>
      </div>

      {loading && !events ? <LoadingState label="Loading events…" /> : null}

      {events && events.items.length === 0 ? (
        <EmptyState title="No events" description="No public events match the current filters." />
      ) : null}

      {events && events.items.length > 0 ? (
        <>
          <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'grid', gap: 6 }}>
            {events.items.map((ev) => (
              <li
                key={ev.id}
                style={{
                  padding: '8px 10px',
                  borderRadius: 'var(--radius-sm)',
                  background: 'var(--surface-subtle)',
                  font: 'var(--text-body-sm)',
                }}
              >
                <div>{ev.summary}</div>
                {ev.teamName ? (
                  <div style={{ marginTop: 2, font: 'var(--text-data-sm)', color: 'var(--text-tertiary)' }}>
                    {ev.teamName}
                    {ev.visibility !== 'PUBLIC' ? ` · ${ev.visibility}` : ''}
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
          <Pagination
            page={events.page}
            totalPages={events.totalPages}
            total={events.total}
            onPage={onPageChange}
          />
        </>
      ) : null}
    </Panel>
  );
}
