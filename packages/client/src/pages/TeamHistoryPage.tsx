import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { PageHeader } from '../components/layout/PageHeader';
import { EmptyState, ErrorState, LoadingState } from '../components/ui/EmptyState';
import { Panel } from '../components/ui/Panel';
import { BackLink } from '../components/ui/RecordStates';
import { getTeamHistorySeasons } from '../lib/api';

export function TeamHistoryPage() {
  const { teamId = '' } = useParams();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [seasons, setSeasons] = useState<unknown[]>([]);

  useEffect(() => {
    const ac = new AbortController();
    void getTeamHistorySeasons(teamId, ac.signal)
      .then((res) => setSeasons(res.item.seasons))
      .catch((err: unknown) => {
        if (!ac.signal.aborted) setError(err instanceof Error ? err.message : 'Failed');
      })
      .finally(() => {
        if (!ac.signal.aborted) setLoading(false);
      });
    return () => ac.abort();
  }, [teamId]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <BackLink to={`/teams/${teamId}`} label="Team" />
      <PageHeader title="Team season history" subtitle="Archived competition snapshots only." />
      {loading && <LoadingState />}
      {error && <ErrorState description={error} />}
      {!loading && !error && (
        <Panel title="Seasons">
          {seasons.length === 0 ? (
            <EmptyState title="No archived seasons" description="" />
          ) : (
            <ul style={{ margin: 0, paddingLeft: 18 }}>
              {(seasons as Array<Record<string, unknown>>).map((s) => {
                const archive = s.archive as Record<string, string>;
                return (
                  <li key={String(s.id)} style={{ font: 'var(--text-body-sm)', marginBottom: 8 }}>
                    <Link to={`/history/competitions/${archive.id}`}>
                      {archive.worldSeasonNameSnapshot} · {archive.competitionNameSnapshot}
                    </Link>
                    {' — '}
                    {String(s.teamNameSnapshot)} · rank {String(s.finalRegularSeasonRank ?? '—')} ·{' '}
                    {String(s.finalPlayoffResult ?? '—')}
                    {archive.championTeamSourceId === teamId ? ' · Champion' : ''}
                  </li>
                );
              })}
            </ul>
          )}
        </Panel>
      )}
    </div>
  );
}
