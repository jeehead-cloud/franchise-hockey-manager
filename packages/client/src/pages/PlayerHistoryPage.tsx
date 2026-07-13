import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { PageHeader } from '../components/layout/PageHeader';
import { EmptyState, ErrorState, LoadingState } from '../components/ui/EmptyState';
import { Panel } from '../components/ui/Panel';
import { BackLink } from '../components/ui/RecordStates';
import { getPlayerHistorySeasons } from '../lib/api';

export function PlayerHistoryPage() {
  const { playerId = '' } = useParams();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<{ seasons: unknown[]; awards: unknown[] } | null>(null);

  useEffect(() => {
    const ac = new AbortController();
    void getPlayerHistorySeasons(playerId, ac.signal)
      .then((res) => setData(res.item))
      .catch((err: unknown) => {
        if (!ac.signal.aborted) setError(err instanceof Error ? err.message : 'Failed');
      })
      .finally(() => {
        if (!ac.signal.aborted) setLoading(false);
      });
    return () => ac.abort();
  }, [playerId]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <BackLink to={`/players/${playerId}`} label="Player" />
      <PageHeader title="Player season history" subtitle="Archived competition snapshots only." />
      {loading && <LoadingState />}
      {error && <ErrorState description={error} />}
      {!loading && !error && data && (
        <>
          <Panel title="Seasons">
            {data.seasons.length === 0 ? (
              <EmptyState title="No archived seasons" description="" />
            ) : (
              <ul style={{ margin: 0, paddingLeft: 18 }}>
                {(data.seasons as Array<Record<string, unknown>>).map((s) => {
                  const archive = s.archive as Record<string, string>;
                  const stage = s.stage as { stageNameSnapshot?: string; stageType?: string };
                  return (
                    <li key={String(s.id)} style={{ font: 'var(--text-body-sm)', marginBottom: 8 }}>
                      <Link to={`/history/competitions/${archive.id}`}>
                        {archive.worldSeasonNameSnapshot} · {archive.competitionNameSnapshot}
                      </Link>
                      {' — '}
                      {stage?.stageNameSnapshot} · {String(s.teamNameSnapshot)} ·{' '}
                      {String(s.gamesPlayed)} GP · {String(s.goals)}G {String(s.assists)}A{' '}
                      {String(s.points)}P
                    </li>
                  );
                })}
              </ul>
            )}
          </Panel>
          <Panel title="Awards">
            {data.awards.length === 0 ? (
              <EmptyState title="No awards" description="" />
            ) : (
              <ul style={{ margin: 0, paddingLeft: 18 }}>
                {(data.awards as Array<Record<string, unknown>>).map((a) => (
                  <li key={String(a.id)} style={{ font: 'var(--text-body-sm)' }}>
                    {String(a.awardNameSnapshot)}
                    {a.valueText ? ` (${String(a.valueText)})` : ''}
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </>
      )}
    </div>
  );
}
