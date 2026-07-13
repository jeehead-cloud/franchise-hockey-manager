import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { PageHeader } from '../components/layout/PageHeader';
import { Badge } from '../components/ui/Badge';
import { EmptyState, ErrorState, LoadingState } from '../components/ui/EmptyState';
import { Panel } from '../components/ui/Panel';
import { getCompetition, getCompetitions, type CompetitionListItem } from '../lib/api';

export function InternationalTournamentsPage() {
  const [items, setItems] = useState<
    Array<{
      competition: CompetitionListItem;
      editionId: string;
      displayName: string;
      status: string;
    }>
  >([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const c = new AbortController();
    setLoading(true);
    getCompetitions({ type: 'INTERNATIONAL_TOURNAMENT' }, c.signal)
      .then(async (res) => {
        const rows: Array<{
          competition: CompetitionListItem;
          editionId: string;
          displayName: string;
          status: string;
        }> = [];
        for (const competition of res.items) {
          const detail = await getCompetition(competition.id, c.signal);
          for (const ed of detail.item.editions ?? []) {
            rows.push({
              competition,
              editionId: ed.id,
              displayName: ed.displayName,
              status: ed.status,
            });
          }
        }
        setItems(rows);
        setError(null);
      })
      .catch((err: unknown) => {
        if (c.signal.aborted) return;
        setError(err instanceof Error ? err.message : 'Failed to load');
      })
      .finally(() => {
        if (!c.signal.aborted) setLoading(false);
      });
    return () => c.abort();
  }, []);

  return (
    <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 16 }}>
      <PageHeader
        title="International Tournaments"
        subtitle="World Juniors, World Championship, Olympics — F23"
        badge="F23"
      />
      <p style={{ margin: 0, font: 'var(--text-body-sm)', color: 'var(--text-secondary)' }}>
        Configurable templates over the F17 competition framework. Locked F22 national-team rosters
        are required. Formats are simplified development presets.
      </p>
      {error ? <ErrorState description={error} /> : null}
      {loading ? <LoadingState label="Loading tournaments…" /> : null}
      {!loading && items.length === 0 ? (
        <EmptyState
          title="No international editions"
          description="Create an INTERNATIONAL_TOURNAMENT competition and edition, lock national teams (F22), then prepare the tournament."
        />
      ) : null}
      {!loading && items.length > 0 ? (
        <Panel>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {items.map((row) => (
              <Link
                key={row.editionId}
                to={`/competitions/${row.competition.id}/editions/${row.editionId}?tab=tournament`}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  gap: 8,
                  textDecoration: 'none',
                  color: 'var(--text-secondary)',
                  font: 'var(--text-body-sm)',
                  paddingBottom: 8,
                  borderBottom: '1px solid var(--border-subtle)',
                }}
              >
                <span style={{ color: 'var(--text-primary)' }}>
                  {row.competition.name} · {row.displayName}
                </span>
                <Badge tone="neutral">{row.status}</Badge>
              </Link>
            ))}
          </div>
        </Panel>
      ) : null}
    </div>
  );
}
