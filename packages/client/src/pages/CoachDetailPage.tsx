import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { PageHeader } from '../components/layout/PageHeader';
import { Button } from '../components/ui/Button';
import { EmptyState, ErrorState, LoadingState } from '../components/ui/EmptyState';
import { Panel } from '../components/ui/Panel';
import { getCoach, type CoachItem } from '../lib/api';
import { useCommissioner } from '../lib/commissioner';

export function CoachDetailPage() {
  const { coachId = '' } = useParams(); const navigate = useNavigate(); const { enabled } = useCommissioner();
  const [coach, setCoach] = useState<CoachItem | null>(null);
  useEffect(() => { const c = new AbortController(); getCoach(coachId, c.signal).then((r) => setCoach(r.item)).catch(() => setCoach(null)); return () => c.abort(); }, [coachId]);
  if (!coach) return <div style={{ padding: 20 }}><LoadingState label="Loading coach…" /></div>;
  return <div style={{ padding: 20, display: 'grid', gap: 16 }}><Link to="/coaches">← Coaches</Link>
    <PageHeader title={`${coach.firstName} ${coach.lastName}`} subtitle={coach.currentTeam?.name ?? 'Unassigned'} actions={enabled ? <Button onClick={() => navigate(`/coaches/${coach.id}/edit`)}>Edit</Button> : undefined} />
    <Panel title="Coaching profile"><p>{coach.coachingStyle} · {coach.tacticalStyle}</p><p>Overall {coach.overallCoaching ?? '—'} · Development {coach.playerDevelopment ?? '—'} · Offense {coach.offense ?? '—'} · Defense {coach.defense ?? '—'}</p></Panel>
    {!coach.currentTeam ? <EmptyState title="Unassigned" description="This coach has no current team." /> : null}
  </div>;
}
