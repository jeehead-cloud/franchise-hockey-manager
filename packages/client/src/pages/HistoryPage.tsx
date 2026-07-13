import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { PageHeader } from '../components/layout/PageHeader';
import { EmptyState, ErrorState, LoadingState } from '../components/ui/EmptyState';
import { Panel } from '../components/ui/Panel';
import { Tabs } from '../components/ui/Tabs';
import {
  getHistoryChampions,
  getHistoryCompetitions,
  getHistoryLanding,
  getHistoryRecords,
} from '../lib/api';

type Tab = 'overview' | 'competitions' | 'champions' | 'records';

const TABS: Array<{ value: Tab; label: string }> = [
  { value: 'overview', label: 'Overview' },
  { value: 'competitions', label: 'Competitions' },
  { value: 'champions', label: 'Champions' },
  { value: 'records', label: 'Records' },
];

export function HistoryPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const tab = (searchParams.get('tab') as Tab) || 'overview';
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [landing, setLanding] = useState<Awaited<ReturnType<typeof getHistoryLanding>>['item'] | null>(
    null,
  );
  const [competitions, setCompetitions] = useState<
    Awaited<ReturnType<typeof getHistoryCompetitions>>['items']
  >([]);
  const [champions, setChampions] = useState<unknown[]>([]);
  const [records, setRecords] = useState<unknown[]>([]);

  useEffect(() => {
    const ac = new AbortController();
    setLoading(true);
    setError(null);
    const load = async () => {
      if (tab === 'overview') {
        setLanding((await getHistoryLanding(ac.signal)).item);
      } else if (tab === 'competitions') {
        setCompetitions((await getHistoryCompetitions({ page: 1, pageSize: 50 }, ac.signal)).items);
      } else if (tab === 'champions') {
        setChampions((await getHistoryChampions({ page: 1, pageSize: 50 }, ac.signal)).items);
      } else {
        setRecords((await getHistoryRecords(ac.signal)).item);
      }
    };
    void load()
      .catch((err: unknown) => {
        if (ac.signal.aborted) return;
        setError(err instanceof Error ? err.message : 'Failed to load history');
      })
      .finally(() => {
        if (!ac.signal.aborted) setLoading(false);
      });
    return () => ac.abort();
  }, [tab]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <PageHeader
        title="History"
        subtitle="Archived competition editions — permanent read-only season records."
      />
      <Tabs
        items={TABS}
        value={tab}
        onChange={(v) => setSearchParams(v === 'overview' ? {} : { tab: v })}
      />
      {loading && <LoadingState />}
      {error && <ErrorState description={error} />}
      {!loading && !error && tab === 'overview' && landing && (
        <>
          <Panel title="Summary">
            <p style={{ font: 'var(--text-body-sm)', color: 'var(--text-secondary)' }}>
              {landing.archiveCount} archived competition
              {landing.archiveCount === 1 ? '' : 's'}.
            </p>
          </Panel>
          <Panel title="Latest archives">
            {landing.latest.length === 0 ? (
              <EmptyState
                title="No archives yet"
                description="Complete and archive a competition edition to populate history."
              />
            ) : (
              <ul style={{ margin: 0, paddingLeft: 18 }}>
                {landing.latest.map((a) => (
                  <li key={a.id} style={{ font: 'var(--text-body-sm)', marginBottom: 6 }}>
                    <Link to={`/history/competitions/${a.id}`}>
                      {a.worldSeasonNameSnapshot} · {a.competitionNameSnapshot}
                    </Link>
                    {a.championNameSnapshot ? ` — Champion: ${a.championNameSnapshot}` : ''}
                  </li>
                ))}
              </ul>
            )}
          </Panel>
          <Panel title="Latest champions">
            {landing.champions.length === 0 ? (
              <EmptyState title="No champions archived" description="" />
            ) : (
              <ul style={{ margin: 0, paddingLeft: 18 }}>
                {landing.champions.map((c) => (
                  <li key={c.id} style={{ font: 'var(--text-body-sm)', marginBottom: 6 }}>
                    <Link to={`/history/competitions/${c.id}`}>
                      {c.championNameSnapshot} ({c.worldSeasonNameSnapshot})
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </>
      )}
      {!loading && !error && tab === 'competitions' && (
        <Panel title="Archived competitions">
          {competitions.length === 0 ? (
            <EmptyState title="No archived competitions" description="" />
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {competitions.map((c) => (
                <div key={c.id} style={{ font: 'var(--text-body-sm)' }}>
                  <Link to={`/history/competitions/${c.id}`}>
                    {c.worldSeasonNameSnapshot} · {c.competitionNameSnapshot} ·{' '}
                    {c.editionNameSnapshot}
                  </Link>
                  <div style={{ color: 'var(--text-tertiary)' }}>
                    {c.championNameSnapshot
                      ? `Champion: ${c.championNameSnapshot} · `
                      : ''}
                    {c.matchCount} matches · {c.participantCount} teams
                  </div>
                </div>
              ))}
            </div>
          )}
        </Panel>
      )}
      {!loading && !error && tab === 'champions' && (
        <Panel title="Champions">
          {champions.length === 0 ? (
            <EmptyState title="No champions" description="" />
          ) : (
            <ul style={{ margin: 0, paddingLeft: 18 }}>
              {(champions as Array<Record<string, string>>).map((c) => (
                <li key={c.id} style={{ font: 'var(--text-body-sm)', marginBottom: 6 }}>
                  <Link to={`/history/competitions/${c.id}`}>
                    {c.worldSeasonNameSnapshot}: {c.championNameSnapshot} (
                    {c.competitionNameSnapshot})
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      )}
      {!loading && !error && tab === 'records' && (
        <Panel title="Historical records">
          {records.length === 0 ? (
            <EmptyState title="No records yet" description="Archive at least one edition." />
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {(
                records as Array<{
                  category: string;
                  scope: string;
                  holders: Array<{ label: string; value: number; archiveId: string | null }>;
                }>
              ).map((r) => (
                <div key={r.category}>
                  <div style={{ font: 'var(--text-body-sm)', fontWeight: 600 }}>
                    {r.category.replace(/_/g, ' ')} ({r.scope})
                  </div>
                  <ul style={{ margin: '4px 0 0', paddingLeft: 18 }}>
                    {r.holders.map((h, i) => (
                      <li key={`${h.label}-${i}`} style={{ font: 'var(--text-body-sm)' }}>
                        {h.label}: {h.value}
                        {h.archiveId ? (
                          <>
                            {' '}
                            · <Link to={`/history/competitions/${h.archiveId}`}>archive</Link>
                          </>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          )}
        </Panel>
      )}
    </div>
  );
}
