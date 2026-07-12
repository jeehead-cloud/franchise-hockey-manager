import { useEffect, useState, type ReactNode } from 'react';
import { Link, useParams } from 'react-router-dom';
import { PageHeader } from '../components/layout/PageHeader';
import { Badge } from '../components/ui/Badge';
import { EmptyState, ErrorState, LoadingState } from '../components/ui/EmptyState';
import { Panel } from '../components/ui/Panel';
import { BackLink, RecordNotFound } from '../components/ui/RecordStates';
import { Tabs } from '../components/ui/Tabs';
import { getPlayer, type PlayerDetail } from '../lib/api';
import { playerLabel } from '../lib/listQuery';

export function PlayerDetailPage() {
  const { playerId = '' } = useParams();
  const [player, setPlayer] = useState<PlayerDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setNotFound(false);
    getPlayer(playerId, controller.signal)
      .then((res) => {
        setPlayer(res.item);
        setError(null);
      })
      .catch((err: unknown) => {
        if (controller.signal.aborted) return;
        const status = (err as { status?: number }).status;
        if (status === 404) setNotFound(true);
        else setError(err instanceof Error ? err.message : 'Failed to load player');
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [playerId]);

  if (loading) {
    return (
      <div style={{ padding: 20 }}>
        <LoadingState label="Loading player…" />
      </div>
    );
  }

  if (notFound) {
    return (
      <div style={{ padding: 20 }}>
        <BackLink to="/players" label="Players" />
        <RecordNotFound entity="Player" listHref="/players" listLabel="Back to Players" />
      </div>
    );
  }

  if (error || !player) {
    return (
      <div style={{ padding: 20 }}>
        <BackLink to="/players" label="Players" />
        <ErrorState description={error ?? 'Player unavailable'} />
      </div>
    );
  }

  return (
    <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 16 }}>
      <BackLink to="/players" label="Players" />
      <PageHeader
        title={playerLabel(player)}
        subtitle={[
          player.primaryPosition,
          player.nationality?.name,
          player.currentTeam?.name ?? 'Unassigned',
        ]
          .filter(Boolean)
          .join(' · ')}
        badge={player.rosterStatus}
      />

      <Tabs
        items={[
          { value: 'profile', label: 'Profile' },
          { value: 'attributes', label: 'Attributes', disabled: true },
          { value: 'development', label: 'Development', disabled: true },
          { value: 'stats', label: 'Stats', disabled: true },
        ]}
        value="profile"
        onChange={() => undefined}
      />

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
          gap: 16,
        }}
      >
        <Panel title="Identity">
          <Row label="Date of birth" value={player.dateOfBirth} />
          <Row
            label="Age"
            value={
              player.age != null
                ? `${player.age}${player.ageReference ? ` (as of ${player.ageReference.referenceDate})` : ''}`
                : '—'
            }
          />
          <Row label="Nationality" value={player.nationality?.name ?? '—'} />
          <Row label="Position" value={player.primaryPosition} />
          <Row label="Roster status" value={player.rosterStatus} />
          <Row label="Source type" value={player.sourceType} />
        </Panel>

        <Panel title="Current assignment">
          {player.currentTeam ? (
            <>
              <Row
                label="Team"
                value={
                  <Link to={`/teams/${player.currentTeam.id}`}>{player.currentTeam.name}</Link>
                }
              />
              <Row label="League" value={player.currentTeam.league?.name ?? '—'} />
              <Row label="Team country" value={player.currentTeam.country?.name ?? '—'} />
            </>
          ) : (
            <EmptyState title="Unassigned" description="No current team assignment." />
          )}
        </Panel>

        <Panel title="Source information">
          <Row label="External ID" value={player.externalId ?? '—'} />
          <Row label="Dataset" value={player.sourceDataset ?? '—'} />
          <Row label="Source updated" value={player.sourceUpdatedAt ?? '—'} />
        </Panel>
      </div>

      <Panel title="Attributes & ratings">
        <EmptyState
          title="Coming in F5+"
          description="Attributes, ratings, roles, potential, preferences, personality, and development history are not part of F4. This profile is structural identity only."
        />
        <div style={{ marginTop: 8 }}>
          <Badge tone="info">No placeholder values</Badge>
        </div>
      </Panel>
    </div>
  );
}

function Row({ label, value }: { label: string; value: ReactNode }) {
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
      <span style={{ color: 'var(--text-primary)', textAlign: 'right' }}>{value}</span>
    </div>
  );
}
