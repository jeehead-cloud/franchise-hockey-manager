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

type TabId = 'profile' | 'attributes' | 'preferences' | 'development';

export function PlayerDetailPage() {
  const { playerId = '' } = useParams();
  const [player, setPlayer] = useState<PlayerDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<TabId>('profile');

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

  const model = player.playerModel;
  const complete = model?.modelStatus === 'COMPLETE';

  return (
    <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 16 }}>
      <BackLink to="/players" label="Players" />
      <PageHeader
        title={playerLabel(player)}
        subtitle={[
          player.primaryPosition,
          player.nationality?.name,
          player.currentTeam?.name ?? 'Unassigned',
          complete && 'currentAbility' in model ? `CA ${model.currentAbility}` : null,
          complete && 'roleLabel' in model ? model.roleLabel : null,
        ]
          .filter(Boolean)
          .join(' · ')}
        badge={player.rosterStatus}
        actions={
          <Badge tone={complete ? 'success' : 'warning'}>
            {complete ? 'Model complete' : 'Model incomplete'}
          </Badge>
        }
      />

      <Tabs
        items={[
          { value: 'profile', label: 'Profile' },
          { value: 'attributes', label: 'Attributes' },
          { value: 'preferences', label: 'Preferences & Personality' },
          { value: 'development', label: 'Development' },
        ]}
        value={tab}
        onChange={(v) => setTab(v as TabId)}
      />

      {!complete ? (
        <EmptyState
          title="Player model incomplete"
          description={
            (model && 'message' in model && model.message) ||
            'This structural player lacks F5 attribute/profile data. Reimport with schemaVersion 2 or backfill.'
          }
        />
      ) : null}

      {tab === 'profile' && complete && model && 'kind' in model ? (
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
          <Panel title="Ratings & role">
            <Row label="Current ability" value={String(model.currentAbility)} />
            {'offensiveRating' in model ? (
              <Row label="Offensive rating" value={String(model.offensiveRating)} />
            ) : null}
            {'defensiveRating' in model ? (
              <Row label="Defensive rating" value={String(model.defensiveRating)} />
            ) : null}
            <Row label="Role" value={model.roleLabel} />
            <Row label="Role rating" value={String(model.roleRating)} />
            <Row label="Potential estimate" value={model.publicPotentialEstimate} />
          </Panel>
          <Panel title="Current assignment">
            {player.currentTeam ? (
              <>
                <Row
                  label="Team"
                  value={<Link to={`/teams/${player.currentTeam.id}`}>{player.currentTeam.name}</Link>}
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
      ) : null}

      {tab === 'attributes' && complete && model && 'attributes' in model ? (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
            gap: 16,
          }}
        >
          <Panel title={model.kind === 'skater' ? 'Skater attributes' : 'Goalie attributes'}>
            {Object.entries(model.attributes).map(([k, v]) => (
              <AttrBar key={k} label={k} value={v as number} />
            ))}
          </Panel>
          <Panel title="Role explanation">
            <p style={{ margin: 0, font: 'var(--text-body-sm)', color: 'var(--text-secondary)' }}>
              {model.roleExplanation}
            </p>
            {'winningPair' in model && model.winningPair ? (
              <p style={{ margin: '8px 0 0', font: 'var(--text-body-sm)', color: 'var(--text-tertiary)' }}>
                Winning pair: {model.winningPair.a} + {model.winningPair.b}
              </p>
            ) : null}
            <div style={{ marginTop: 12 }}>
              <Row label="Current ability" value={String(model.currentAbility)} />
              {'offensiveRating' in model ? (
                <Row label="Offensive" value={String(model.offensiveRating)} />
              ) : null}
              {'defensiveRating' in model ? (
                <Row label="Defensive" value={String(model.defensiveRating)} />
              ) : null}
              <Row label="Role rating" value={String(model.roleRating)} />
            </div>
          </Panel>
        </div>
      ) : null}

      {tab === 'preferences' && complete && model && 'personality' in model ? (
        <Panel title="Preferences & personality">
          <Row label="Preferred coaching" value={model.preferredCoachingStyle} />
          <Row label="Preferred tactics" value={model.preferredTactics} />
          <Row label="Personality" value={model.personality} />
          <Row label="Hero rating" value={String(model.heroRating)} />
          <Row label="Stability" value={String(model.stability)} />
          <p style={{ margin: '12px 0 0', font: 'var(--text-body-sm)', color: 'var(--text-tertiary)' }}>
            Hero rating and stability do not modify permanent ability ratings in F5. Chemistry and
            match variance arrive later.
          </p>
        </Panel>
      ) : null}

      {tab === 'development' && complete && model && 'developmentRate' in model ? (
        <Panel title="Development profile">
          <Row label="Development rate" value={String(model.developmentRate)} />
          <Row label="Public potential estimate" value={model.publicPotentialEstimate} />
          <Row label="Current ability" value={String(model.currentAbility)} />
          <EmptyState
            title="Annual development starts in F24"
            description="Exact hidden potential floor/ceiling and development risk are not shown on this public profile. Scouting fog of war arrives in F26."
          />
        </Panel>
      ) : null}
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

function AttrBar({ label, value }: { label: string; value: number }) {
  const pct = Math.round(((value - 1) / 19) * 100);
  return (
    <div style={{ marginBottom: 8 }}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          font: 'var(--text-body-sm)',
          marginBottom: 4,
        }}
      >
        <span style={{ color: 'var(--text-secondary)' }}>{label}</span>
        <span style={{ color: 'var(--text-primary)' }}>{value}</span>
      </div>
      <div
        style={{
          height: 6,
          background: 'var(--border-subtle)',
          borderRadius: 999,
          overflow: 'hidden',
        }}
        aria-hidden
      >
        <div
          style={{
            width: `${pct}%`,
            height: '100%',
            background: 'var(--accent-primary)',
          }}
        />
      </div>
    </div>
  );
}
