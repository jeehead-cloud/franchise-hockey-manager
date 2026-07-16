import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { PageHeader } from '../components/layout/PageHeader';
import { Panel } from '../components/ui/Panel';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { EmptyState } from '../components/ui/EmptyState';
import {
  getCurrentWorldSeason,
  getSeasonTransitionStatus,
  getWorldSeasons,
  getWorldSeasonReadiness,
  type SeasonTransitionStatusDto,
  type WorldSeasonItem,
} from '../lib/api';

const statusTone = (status: string): 'success' | 'info' | 'warning' | 'danger' | 'neutral' => {
  if (status === 'ACTIVE') return 'success';
  if (status === 'COMPLETED') return 'info';
  if (status === 'ARCHIVED') return 'neutral';
  if (status === 'PLANNED') return 'warning';
  return 'neutral';
};

interface SeasonReadiness {
  worldSeasonId: string;
  label: string;
  status: string;
  completedOffseasonRun: { id: string; completedAt: string | null } | null;
  activeCompetitionEditions: number;
  completedButUnarchived: number;
  transitionEligible: boolean;
  transitionEligibleReason: string;
}

/**
 * F31 Seasons timeline. Lists all WorldSeasons with status/current markers,
 * surfaces the current-season card, and links to the F31 season-transition
 * workflow when the current season's offseason has completed. Normal mode is
 * read-only; Commissioner Mode is required for transition mutations (handled
 * on the /season-transition page).
 */
export function SeasonsPage() {
  const [seasons, setSeasons] = useState<WorldSeasonItem[]>([]);
  const [current, setCurrent] = useState<WorldSeasonItem | null>(null);
  const [status, setStatus] = useState<SeasonTransitionStatusDto | null>(null);
  const [currentReadiness, setCurrentReadiness] = useState<SeasonReadiness | null>(null);
  const [message, setMessage] = useState('');

  const load = useCallback(async () => {
    try {
      const [seasonsRes, currentRes, statusRes] = await Promise.all([
        getWorldSeasons(),
        getCurrentWorldSeason(),
        getSeasonTransitionStatus(),
      ]);
      setSeasons(seasonsRes.items);
      setCurrent(currentRes.item);
      setStatus(statusRes.item);
      if (currentRes.item) {
        try {
          const r = (await getWorldSeasonReadiness(currentRes.item.id)).item;
          setCurrentReadiness(r);
        } catch {
          setCurrentReadiness(null);
        }
      } else {
        setCurrentReadiness(null);
      }
      setMessage('');
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Unable to load seasons');
    }
  }, []);
  useEffect(() => { load().catch(() => { }); }, [load]);

  return (
    <div>
      <PageHeader
        title="Seasons"
        subtitle="World season timeline and the F31 season-transition workflow. Completing F30 enables creating the next WorldSeason — no schedules or matches are generated automatically."
      />
      {message && <p style={{ color: 'var(--text-tertiary)' }}>{message}</p>}

      {current && (
        <Panel title={`Current season: ${current.label}`}>
          <p style={{ color: 'var(--text-tertiary)', marginBottom: 8 }}>
            Status: <Badge tone={statusTone(current.status)}>{current.status}</Badge>{' '}
            · Phase: <Badge tone="neutral">{current.phase}</Badge>{' '}
            · Years: {current.startYear}/{current.endYear}
          </p>
          {currentReadiness && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))', gap: 12, marginTop: 12 }}>
              <Stat label="Completed OffseasonRun" value={currentReadiness.completedOffseasonRun ? 'Yes' : 'No'} />
              <Stat label="Active competition editions" value={String(currentReadiness.activeCompetitionEditions)} />
              <Stat label="Completed but unarchived" value={String(currentReadiness.completedButUnarchived)} />
              <Stat label="Transition eligible" value={<Badge tone={currentReadiness.transitionEligible ? 'success' : 'warning'}>{currentReadiness.transitionEligible ? 'YES' : 'NO'}</Badge>} />
            </div>
          )}
          <p style={{ color: 'var(--text-tertiary)', marginTop: 12, fontSize: 14 }}>
            {currentReadiness?.transitionEligibleReason}
          </p>
          {currentReadiness?.transitionEligible ? (
            <div style={{ marginTop: 12 }}>
              <Link to="/season-transition">
                <Button>Create Next Season →</Button>
              </Link>
            </div>
          ) : (
            <p style={{ marginTop: 12, fontSize: 14, color: 'var(--text-tertiary)' }}>
              Complete the F30 offseason workflow for this season before creating the next one.
            </p>
          )}
        </Panel>
      )}

      <Panel title="Season timeline">
        {seasons.length === 0 ? (
          <EmptyState title="No seasons" description="Initialize a world to create the first WorldSeason." />
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ textAlign: 'left', color: 'var(--text-tertiary)', fontSize: 14 }}>
                <th style={{ padding: '8px 12px' }}>Order</th>
                <th style={{ padding: '8px 12px' }}>Label</th>
                <th style={{ padding: '8px 12px' }}>Years</th>
                <th style={{ padding: '8px 12px' }}>Status</th>
                <th style={{ padding: '8px 12px' }}>Phase</th>
                <th style={{ padding: '8px 12px' }}>Current</th>
                <th style={{ padding: '8px 12px' }}></th>
              </tr>
            </thead>
            <tbody>
              {seasons.map((s) => {
                const isCurrent = current?.id === s.id;
                return (
                  <tr key={s.id} style={{ borderTop: '1px solid var(--border-subtle)' }}>
                    <td style={{ padding: '8px 12px' }}>{s.startYear}</td>
                    <td style={{ padding: '8px 12px' }}>
                      <Link to={`/seasons/${s.id}`}>{s.label}</Link>
                    </td>
                    <td style={{ padding: '8px 12px' }}>{s.startYear}/{s.endYear}</td>
                    <td style={{ padding: '8px 12px' }}><Badge tone={statusTone(s.status)}>{s.status}</Badge></td>
                    <td style={{ padding: '8px 12px' }}><Badge tone="neutral">{s.phase}</Badge></td>
                    <td style={{ padding: '8px 12px' }}>{isCurrent ? <Badge tone="success">CURRENT</Badge> : null}</td>
                    <td style={{ padding: '8px 12px' }}>
                      <Link to={`/seasons/${s.id}`}>View →</Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </Panel>

      {status?.latestTransition && (
        <Panel title="Latest transition">
          <p style={{ color: 'var(--text-tertiary)' }}>
            <Badge tone={statusTone(status.latestTransition.status)}>{status.latestTransition.status}</Badge>{' '}
            · {status.latestTransition.targetDisplayName} (order {status.latestTransition.targetSeasonOrder})
          </p>
          <p style={{ marginTop: 8 }}>
            <Link to={`/season-transition/runs/${status.latestTransition.id}`}>View transition run →</Link>
          </p>
        </Panel>
      )}
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
