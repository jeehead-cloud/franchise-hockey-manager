import { useEffect, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { PageHeader } from '../components/layout/PageHeader';
import { Badge } from '../components/ui/Badge';
import { EmptyState, ErrorState, LoadingState } from '../components/ui/EmptyState';
import { Panel } from '../components/ui/Panel';
import { Tabs } from '../components/ui/Tabs';
import { BackLink, RecordNotFound } from '../components/ui/RecordStates';
import {
  getHistoryArchive,
  getHistoryArchiveAwards,
  getHistoryArchiveBracket,
  getHistoryArchiveGoalieStats,
  getHistoryArchiveMatches,
  getHistoryArchiveParticipants,
  getHistoryArchivePlayerStats,
  getHistoryArchiveStandings,
  getHistoryArchiveTeamStats,
} from '../lib/api';

type Tab =
  | 'overview'
  | 'standings'
  | 'matches'
  | 'playoffs'
  | 'team-stats'
  | 'player-stats'
  | 'goalies'
  | 'awards'
  | 'participants'
  | 'metadata';

const TABS: Array<{ value: Tab; label: string }> = [
  { value: 'overview', label: 'Overview' },
  { value: 'standings', label: 'Standings' },
  { value: 'matches', label: 'Schedule & Results' },
  { value: 'playoffs', label: 'Playoffs' },
  { value: 'team-stats', label: 'Team Statistics' },
  { value: 'player-stats', label: 'Player Statistics' },
  { value: 'goalies', label: 'Goalies' },
  { value: 'awards', label: 'Awards' },
  { value: 'participants', label: 'Participants' },
  { value: 'metadata', label: 'Metadata' },
];

export function HistoryArchivePage() {
  const { archiveId = '' } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const tab = (searchParams.get('tab') as Tab) || 'overview';
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [detail, setDetail] = useState<Record<string, unknown> | null>(null);
  const [section, setSection] = useState<unknown>(null);

  useEffect(() => {
    const ac = new AbortController();
    setLoading(true);
    setError(null);
    void getHistoryArchive(archiveId, ac.signal)
      .then((res) => {
        setDetail(res.item);
        setNotFound(false);
      })
      .catch((err: unknown) => {
        if (ac.signal.aborted) return;
        if ((err as { status?: number }).status === 404) setNotFound(true);
        else setError(err instanceof Error ? err.message : 'Failed to load archive');
      })
      .finally(() => {
        if (!ac.signal.aborted) setLoading(false);
      });
    return () => ac.abort();
  }, [archiveId]);

  useEffect(() => {
    if (!detail || tab === 'overview' || tab === 'metadata') {
      setSection(null);
      return;
    }
    const ac = new AbortController();
    const load = async () => {
      switch (tab) {
        case 'standings':
          return (await getHistoryArchiveStandings(archiveId, ac.signal)).item;
        case 'matches':
          return (await getHistoryArchiveMatches(archiveId, { page: 1, pageSize: 100 }, ac.signal))
            .items;
        case 'playoffs':
          return (await getHistoryArchiveBracket(archiveId, ac.signal)).item;
        case 'team-stats':
          return (await getHistoryArchiveTeamStats(archiveId, ac.signal)).item;
        case 'player-stats':
          return (
            await getHistoryArchivePlayerStats(archiveId, { page: 1, pageSize: 100 }, ac.signal)
          ).items;
        case 'goalies':
          return (
            await getHistoryArchiveGoalieStats(archiveId, { page: 1, pageSize: 100 }, ac.signal)
          ).items;
        case 'awards':
          return (await getHistoryArchiveAwards(archiveId, ac.signal)).item;
        case 'participants':
          return (await getHistoryArchiveParticipants(archiveId, ac.signal)).item;
        default:
          return null;
      }
    };
    void load()
      .then(setSection)
      .catch((err: unknown) => {
        if (!ac.signal.aborted) setError(err instanceof Error ? err.message : 'Section failed');
      });
    return () => ac.abort();
  }, [archiveId, detail, tab]);

  if (notFound)
    return <RecordNotFound entity="Archive" listHref="/history" listLabel="History" />;
  if (loading) return <LoadingState />;
  if (error) return <ErrorState description={error} />;
  if (!detail) return null;

  const champion = detail.champion as { name: string } | null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <BackLink to="/history" label="History" />
      <PageHeader
        title={String(detail.competitionNameSnapshot ?? 'Archive')}
        subtitle={`${detail.worldSeasonNameSnapshot} · ${detail.editionNameSnapshot}`}
      />
      <div
        style={{
          padding: '10px 12px',
          border: '1px solid var(--border-subtle)',
          background: 'var(--surface-panel)',
          font: 'var(--text-body-sm)',
        }}
        role="status"
      >
        Archived history — read only.
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <Badge tone="neutral">ARCHIVED</Badge>
        {champion ? <Badge tone="success">Champion: {champion.name}</Badge> : null}
      </div>
      <Tabs
        items={TABS}
        value={tab}
        onChange={(v) => setSearchParams(v === 'overview' ? {} : { tab: v })}
      />

      {tab === 'overview' && (
        <Panel title="Overview">
          <Row label="Season" value={String(detail.worldSeasonNameSnapshot)} />
          <Row label="Competition" value={String(detail.competitionNameSnapshot)} />
          <Row label="Edition" value={String(detail.editionNameSnapshot)} />
          <Row label="Champion" value={champion?.name ?? '—'} />
          <Row label="Participants" value={String(detail.participantCount)} />
          <Row label="Matches" value={String(detail.matchCount)} />
          <Row
            label="Archive hash"
            value={`${String(detail.archiveHash).slice(0, 12)}…`}
          />
          <Row label="Archived at" value={String(detail.archivedAt)} />
          <Row
            label="Engine versions"
            value={(detail.engineVersions as string[] | undefined)?.join(', ') || '—'}
          />
          <Row
            label="Balance versions"
            value={(detail.balanceVersions as string[] | undefined)?.join(', ') || '—'}
          />
        </Panel>
      )}

      {tab === 'metadata' && (
        <Panel title="Metadata">
          <Row label="Rules hash" value={String(detail.rulesHash)} />
          <Row label="Archive hash" value={String(detail.archiveHash)} />
          <Row label="Schema version" value={String(detail.archiveSchemaVersion)} />
          <Row label="Archive version" value={String(detail.archiveVersion)} />
        </Panel>
      )}

      {tab === 'standings' && (
        <Panel title="Archived standings">
          {!section ? (
            <LoadingState />
          ) : (
            <StandingsTable rows={section as Array<Record<string, unknown>>} />
          )}
        </Panel>
      )}

      {tab === 'matches' && (
        <Panel title="Schedule & results">
          {!section ? (
            <LoadingState />
          ) : (section as unknown[]).length === 0 ? (
            <EmptyState title="No matches" description="" />
          ) : (
            <ul style={{ margin: 0, paddingLeft: 18 }}>
              {(section as Array<Record<string, unknown>>).map((m) => (
                <li key={String(m.id)} style={{ font: 'var(--text-body-sm)', marginBottom: 6 }}>
                  {String(m.homeNameSnapshot)} {String(m.homeScore)}–{String(m.awayScore)}{' '}
                  {String(m.awayNameSnapshot)} ({String(m.decisionType)})
                  {m.sourceMatchId ? (
                    <>
                      {' '}
                      · <Link to={`/matches/${String(m.sourceMatchId)}`}>Match</Link>
                    </>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </Panel>
      )}

      {tab === 'playoffs' && (
        <Panel title="Playoff bracket">
          {!section ? (
            <LoadingState />
          ) : (
            <ul style={{ margin: 0, paddingLeft: 18 }}>
              {(
                (section as { series: Array<Record<string, unknown>> }).series ?? []
              ).map((s) => (
                <li key={String(s.id)} style={{ font: 'var(--text-body-sm)', marginBottom: 8 }}>
                  R{String(s.roundNumber)} {String(s.roundNameSnapshot)}: seed{' '}
                  {String(s.participant1Seed)} vs {String(s.participant2Seed)} —{' '}
                  {String(s.participant1Wins)}–{String(s.participant2Wins)} ({String(s.status)})
                </li>
              ))}
            </ul>
          )}
        </Panel>
      )}

      {tab === 'awards' && (
        <Panel title="Awards">
          {!section ? (
            <LoadingState />
          ) : (
            <ul style={{ margin: 0, paddingLeft: 18 }}>
              {(section as Array<Record<string, unknown>>).map((a) => (
                <li key={String(a.id)} style={{ font: 'var(--text-body-sm)', marginBottom: 6 }}>
                  {String(a.awardNameSnapshot)}: {String(a.playerNameSnapshot ?? a.teamNameSnapshot)}{' '}
                  {a.valueText ? `(${String(a.valueText)})` : ''}
                  {a.shared ? ' · shared' : ''}
                </li>
              ))}
            </ul>
          )}
        </Panel>
      )}

      {(tab === 'team-stats' ||
        tab === 'player-stats' ||
        tab === 'goalies' ||
        tab === 'participants') && (
        <Panel title={TABS.find((t) => t.value === tab)?.label ?? tab}>
          {!section ? (
            <LoadingState />
          ) : (
            <pre
              style={{
                margin: 0,
                font: 'var(--text-mono-sm, 12px monospace)',
                whiteSpace: 'pre-wrap',
                color: 'var(--text-secondary)',
                maxHeight: 480,
                overflow: 'auto',
              }}
            >
              {JSON.stringify(section, null, 2)}
            </pre>
          )}
        </Panel>
      )}
    </div>
  );
}

function StandingsTable({ rows }: { rows: Array<Record<string, unknown>> }) {
  if (!rows.length) return <EmptyState title="No standings" description="" />;
  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', font: 'var(--text-body-sm)' }}>
        <thead>
          <tr>
            {['#', 'Team', 'GP', 'W', 'L', 'GF', 'GA', 'Pts', 'Qual'].map((h) => (
              <th
                key={h}
                style={{
                  textAlign: 'left',
                  borderBottom: '1px solid var(--border-subtle)',
                  padding: '4px 6px',
                }}
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const p = r.participant as { teamNameSnapshot?: string } | undefined;
            return (
              <tr key={String(r.id)}>
                <td style={{ padding: '4px 6px' }}>{String(r.rank)}</td>
                <td style={{ padding: '4px 6px' }}>{p?.teamNameSnapshot ?? '—'}</td>
                <td style={{ padding: '4px 6px' }}>{String(r.gamesPlayed)}</td>
                <td style={{ padding: '4px 6px' }}>{String(r.wins)}</td>
                <td style={{ padding: '4px 6px' }}>{String(r.losses)}</td>
                <td style={{ padding: '4px 6px' }}>{String(r.goalsFor)}</td>
                <td style={{ padding: '4px 6px' }}>{String(r.goalsAgainst)}</td>
                <td style={{ padding: '4px 6px' }}>{String(r.points)}</td>
                <td style={{ padding: '4px 6px' }}>{r.qualified ? 'Y' : ''}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        gap: 8,
        font: 'var(--text-body-sm)',
        padding: '4px 0',
        borderBottom: '1px solid var(--border-subtle)',
      }}
    >
      <span style={{ color: 'var(--text-tertiary)' }}>{label}</span>
      <span style={{ color: 'var(--text-primary)' }}>{value}</span>
    </div>
  );
}
