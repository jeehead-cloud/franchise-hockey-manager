import { useCallback, useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { PageHeader } from '../components/layout/PageHeader';
import { Panel } from '../components/ui/Panel';
import { Badge } from '../components/ui/Badge';
import { EmptyState } from '../components/ui/EmptyState';
import {
  getWorldSeason,
  getWorldSeasonReadiness,
  getSeasonTransitions,
  type WorldSeasonItem,
  type SeasonTransitionListItem,
} from '../lib/api';

const statusTone = (status: string): 'success' | 'info' | 'warning' | 'neutral' => {
  if (status === 'ACTIVE') return 'success';
  if (status === 'COMPLETED') return 'info';
  if (status === 'PLANNED') return 'warning';
  return 'neutral';
};

/**
 * F31 season detail. Shows the season's identity, readiness, planned
 * structures only (no schedule/simulation surfaces — those remain under their
 * own competition tools), and any transition runs that produced or were
 * produced from this season.
 */
export function SeasonDetailPage() {
  const { worldSeasonId } = useParams<{ worldSeasonId: string }>();
  const [season, setSeason] = useState<WorldSeasonItem | null>(null);
  const [readiness, setReadiness] = useState<{ transitionEligible: boolean; transitionEligibleReason: string; completedOffseasonRun: { id: string; completedAt: string | null } | null; activeCompetitionEditions: number; completedButUnarchived: number } | null>(null);
  const [transitions, setTransitions] = useState<SeasonTransitionListItem[]>([]);
  const [message, setMessage] = useState('');

  const load = useCallback(async () => {
    if (!worldSeasonId) return;
    try {
      const s = (await getWorldSeason(worldSeasonId)).item;
      setSeason(s);
      try {
        setReadiness((await getWorldSeasonReadiness(worldSeasonId)).item);
      } catch { setReadiness(null); }
      try {
        const asSource = (await getSeasonTransitions(`?sourceWorldSeasonId=${worldSeasonId}`)).items;
        const asTarget = (await getSeasonTransitions(`?targetWorldSeasonId=${worldSeasonId}`)).items;
        setTransitions([...asSource, ...asTarget]);
      } catch { setTransitions([]); }
      setMessage('');
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Unable to load season');
    }
  }, [worldSeasonId]);
  useEffect(() => { load().catch(() => { }); }, [load]);

  if (!season) {
    return (
      <div>
        <PageHeader title="Season" />
        {message && <p style={{ color: 'var(--text-tertiary)' }}>{message}</p>}
        <EmptyState title="Season not found" description={message || 'No WorldSeason matches this id.'} />
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title={season.label}
        subtitle={`WorldSeason ${season.startYear}/${season.endYear} · F31 displays planned structures only — schedules, matches, and simulations remain under their own competition tools.`}
      />
      {message && <p style={{ color: 'var(--text-tertiary)' }}>{message}</p>}

      <Panel title="Overview">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(160px,1fr))', gap: 12 }}>
          <Stat label="Status" value={<Badge tone={statusTone(season.status)}>{season.status}</Badge>} />
          <Stat label="Phase" value={<Badge tone="neutral">{season.phase}</Badge>} />
          <Stat label="Order (startYear)" value={String(season.startYear)} />
          <Stat label="End year" value={String(season.endYear)} />
        </div>
      </Panel>

      {readiness && (
        <Panel title="Readiness">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))', gap: 12 }}>
            <Stat label="Completed OffseasonRun" value={readiness.completedOffseasonRun ? 'Yes' : 'No'} />
            <Stat label="Active competition editions" value={String(readiness.activeCompetitionEditions)} />
            <Stat label="Completed but unarchived" value={String(readiness.completedButUnarchived)} />
            <Stat label="Transition eligible" value={<Badge tone={readiness.transitionEligible ? 'success' : 'warning'}>{readiness.transitionEligible ? 'YES' : 'NO'}</Badge>} />
          </div>
          <p style={{ color: 'var(--text-tertiary)', marginTop: 12, fontSize: 14 }}>{readiness.transitionEligibleReason}</p>
          {readiness.transitionEligible && (
            <p style={{ marginTop: 12 }}>
              <Link to="/season-transition">Go to Season Transition →</Link>
            </p>
          )}
        </Panel>
      )}

      <Panel title="Transitions">
        {transitions.length === 0 ? (
          <EmptyState title="No transition runs" description="No F31 season transition has produced or consumed this season." />
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ textAlign: 'left', color: 'var(--text-tertiary)', fontSize: 14 }}>
                <th style={{ padding: '8px 12px' }}>Role</th>
                <th style={{ padding: '8px 12px' }}>Status</th>
                <th style={{ padding: '8px 12px' }}>Target</th>
                <th style={{ padding: '8px 12px' }}>Completed</th>
                <th style={{ padding: '8px 12px' }}></th>
              </tr>
            </thead>
            <tbody>
              {transitions.map((t) => {
                const isSource = t.sourceWorldSeasonId === season.id;
                return (
                  <tr key={t.id} style={{ borderTop: '1px solid var(--border-subtle)' }}>
                    <td style={{ padding: '8px 12px' }}>{isSource ? 'Source' : 'Target'}</td>
                    <td style={{ padding: '8px 12px' }}><Badge tone={statusTone(t.status)}>{t.status}</Badge></td>
                    <td style={{ padding: '8px 12px' }}>{t.targetDisplayName} (order {t.targetSeasonOrder})</td>
                    <td style={{ padding: '8px 12px' }}>{t.completedAt ? new Date(t.completedAt).toLocaleString() : '—'}</td>
                    <td style={{ padding: '8px 12px' }}><Link to={`/season-transition/runs/${t.id}`}>View →</Link></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </Panel>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div style={{ padding: 12, background: 'var(--surface-panel)', borderRadius: 8 }}>
      <div style={{ color: 'var(--text-tertiary)', fontSize: 12, marginBottom: 4 }}>{label}</div>
      <div style={{ fontWeight: 600 }}>{value}</div>
    </div>
  );
}
