import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { PageHeader } from '../components/layout/PageHeader';
import { Button } from '../components/ui/Button';
import { DataRow, DataTable, Td } from '../components/ui/DataBrowser';
import { EmptyState, ErrorState, LoadingState } from '../components/ui/EmptyState';
import { Panel } from '../components/ui/Panel';
import { getCoaches, type CoachItem, type Paginated } from '../lib/api';
import { useCommissioner } from '../lib/commissioner';

export function CoachesPage() {
  const navigate = useNavigate(); const { enabled } = useCommissioner();
  const [data, setData] = useState<Paginated<CoachItem> | null>(null); const [error, setError] = useState<string | null>(null);
  useEffect(() => { const c = new AbortController(); getCoaches({}, c.signal).then(setData).catch((e: unknown) => setError(e instanceof Error ? e.message : 'Failed to load coaches')); return () => c.abort(); }, []);
  return <div style={{ padding: 20 }}>
    <PageHeader title="Coaches" subtitle={data ? `${data.total} coaches` : 'Browse coaching staff'} badge="Browser" actions={enabled ? <Button onClick={() => navigate('/coaches/new')}>New coach</Button> : undefined} />
    {error ? <ErrorState description={error} /> : !data ? <LoadingState label="Loading coaches…" /> : data.items.length === 0 ? <EmptyState title="No coaches" description="Create a coach in Commissioner Mode." /> :
      <Panel><DataTable headers={[{ key: 'name', label: 'Coach' }, { key: 'team', label: 'Team' }, { key: 'style', label: 'Style' }, { key: 'ratings', label: 'Ratings' }]}>
        {data.items.map((c) => <DataRow key={c.id} onActivate={() => navigate(`/coaches/${c.id}`)}><Td primary>{c.firstName} {c.lastName}</Td><Td>{c.currentTeam?.name ?? 'Unassigned'}</Td><Td>{c.coachingStyle} · {c.tacticalStyle}</Td><Td>{[c.overallCoaching, c.playerDevelopment, c.offense, c.defense].map((v) => v ?? '—').join(' / ')}</Td></DataRow>)}
      </DataTable></Panel>}
  </div>;
}
