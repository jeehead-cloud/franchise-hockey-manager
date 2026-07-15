import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { PageHeader } from '../components/layout/PageHeader';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { EmptyState, ErrorState, LoadingState } from '../components/ui/EmptyState';
import { Panel } from '../components/ui/Panel';
import { getWorldSummary, getDevelopmentStatus, getYouthGenerationStatus, getDraftStatus, type DraftStatusDto, type WorldSummary } from '../lib/api';

export function WorldPage() {
  const [data, setData] = useState<WorldSummary | null>(null);
  const [devApplied, setDevApplied] = useState<boolean | null>(null);
  const [youthApplied, setYouthApplied] = useState<boolean | null>(null);
  const [youthProspectCount, setYouthProspectCount] = useState<number | null>(null);
  const [draftStatus, setDraftStatus] = useState<DraftStatusDto | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    getWorldSummary(controller.signal)
      .then(async (summary) => {
        setData(summary);
        setError(null);
        if (summary.season?.id) {
          try {
            const [dev, youth, draft] = await Promise.all([
              getDevelopmentStatus(summary.season.id, controller.signal),
              getYouthGenerationStatus(summary.season.id, controller.signal),
              getDraftStatus(controller.signal),
            ]);
            setDevApplied(dev.item.developmentApplied);
            setYouthApplied(youth.item.youthGenerationApplied);
            setYouthProspectCount(youth.item.generatedProspectCount);
            setDraftStatus(draft.item);
          } catch {
            setDevApplied(null);
            setYouthApplied(null);
            setYouthProspectCount(null);
            setDraftStatus(null);
          }
        } else {
          setDevApplied(null);
          setYouthApplied(null);
          setYouthProspectCount(null);
          setDraftStatus(null);
        }
      })
      .catch((err: unknown) => {
        if (controller.signal.aborted) return;
        setError(err instanceof Error ? err.message : 'Unable to load world summary');
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, []);

  if (loading) {
    return (
      <div style={{ padding: 20 }}>
        <PageHeader title="World Dashboard" subtitle="Loading world summary…" />
        <LoadingState label="Loading world…" />
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ padding: 20 }}>
        <PageHeader title="World Dashboard" />
        <ErrorState description={error} />
      </div>
    );
  }

  if (!data) return null;

  if (!data.initialized) {
    return (
      <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 16 }}>
        <PageHeader title="World Dashboard" subtitle="No world initialized yet." badge="Empty" />
        <div
          style={{
            background: 'var(--gradient-team-hero)',
            borderRadius: 'var(--radius-lg)',
            padding: '20px 24px',
            color: '#fff',
            display: 'flex',
            justifyContent: 'space-between',
            gap: 16,
            flexWrap: 'wrap',
            alignItems: 'center',
          }}
        >
          <div>
            <div style={{ font: 'var(--text-heading-md)' }}>Initialize Hockey World</div>
            <div style={{ font: 'var(--text-body-sm)', opacity: 0.85 }}>
              Import a prepared local dataset before browsing teams and players.
            </div>
          </div>
          <Link to="/setup" style={{ textDecoration: 'none' }}>
            <Button style={{ background: '#fff', color: 'var(--accent-primary-active)' }}>
              Open Setup
            </Button>
          </Link>
        </div>
      </div>
    );
  }

  const action = data.recommendedNextAction;

  return (
    <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 16 }}>
      <PageHeader
        title="World Dashboard"
        subtitle={
          data.season
            ? `${data.season.label} · ${data.season.phase.replaceAll('_', ' ')} · ${data.season.status}`
            : 'Initialized world'
        }
        badge={data.fictionalDataset ? 'Dev fixture' : 'Initialized'}
        actions={
          data.fictionalDataset ? <Badge tone="warning">Fictional data</Badge> : undefined
        }
      />

      <div
        style={{
          background: 'var(--gradient-team-hero)',
          borderRadius: 'var(--radius-lg)',
          padding: '20px 24px',
          color: '#fff',
          display: 'flex',
          justifyContent: 'space-between',
          gap: 16,
          flexWrap: 'wrap',
          alignItems: 'center',
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <div
            style={{
              font: 'var(--text-label)',
              letterSpacing: 'var(--text-tracking-wide)',
              textTransform: 'uppercase',
              opacity: 0.8,
            }}
          >
            Recommended next action
          </div>
          <div style={{ font: 'var(--text-heading-md)' }}>{action.label}</div>
          <div style={{ font: 'var(--text-body-sm)', opacity: 0.85 }}>{action.detail}</div>
          {data.dataset ? (
            <div style={{ font: 'var(--text-body-sm)', opacity: 0.8, marginTop: 4 }}>
              Dataset {data.dataset.name ?? data.dataset.id}
              {data.dataset.sourceUpdatedAt ? ` · source ${data.dataset.sourceUpdatedAt}` : ''}
            </div>
          ) : null}
        </div>
        <Link to={action.href} style={{ textDecoration: 'none' }}>
          <Button style={{ background: '#fff', color: 'var(--accent-primary-active)' }}>
            {action.label}
          </Button>
        </Link>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
          gap: 12,
        }}
      >
        {Object.entries(data.counts).map(([key, value]) => (
          <Panel key={key}>
            <div style={{ font: 'var(--text-label)', color: 'var(--text-tertiary)' }}>{key}</div>
            <div style={{ font: 'var(--text-heading-md)', color: 'var(--text-primary)' }}>{value}</div>
          </Panel>
        ))}
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
          gap: 16,
        }}
      >
        <Panel title="Structure">
          <Stat label="Detailed leagues" value={data.structure.detailedLeagues} />
          <Stat label="Aggregated leagues" value={data.structure.aggregatedLeagues} />
          <Stat label="Club teams" value={data.structure.clubTeams} />
          <Stat label="National teams" value={data.structure.nationalTeams} />
          <Stat label="Assigned players" value={data.structure.assignedPlayers} />
          <Stat label="Unassigned players" value={data.structure.unassignedPlayers} />
          {Object.entries(data.structure.playersByRosterStatus).map(([k, v]) => (
            <Stat key={k} label={`Players ${k}`} value={v} />
          ))}
        </Panel>
        {data.structure.readyTeams !== undefined ? (
          <Panel title="Team readiness">
            <Stat label="Ready" value={data.structure.readyTeams ?? 0} />
            <Stat label="Warnings" value={data.structure.warningTeams ?? 0} />
            <Stat label="Not ready" value={data.structure.notReadyTeams ?? 0} />
            <Stat label="No tactical style" value={data.structure.teamsWithoutTacticalStyle ?? 0} />
            <Stat label="No head coach" value={data.structure.teamsWithoutCoaches} />
          </Panel>
        ) : null}

        {data.structure.teamsWithoutLineup !== undefined ? (
          <Panel title="Lineups">
            <Stat label="Valid" value={data.structure.teamsWithValidLineup ?? 0} />
            <Stat label="Incomplete" value={data.structure.teamsWithIncompleteLineup ?? 0} />
            <Stat label="Invalid" value={data.structure.teamsWithInvalidLineup ?? 0} />
            <Stat label="None" value={data.structure.teamsWithoutLineup ?? 0} />
          </Panel>
        ) : null}

        <Panel title="Competition editions">
          {data.competitionEditions.length === 0 ? (
            <EmptyState title="No editions" description="No competition editions yet." />
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {data.competitionEditions.map((ed) => (
                <Link
                  key={ed.id}
                  to={ed.competition ? `/competitions/${ed.competition.id}` : '/competitions'}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    gap: 8,
                    textDecoration: 'none',
                    color: 'var(--text-secondary)',
                    font: 'var(--text-body-sm)',
                    paddingBottom: 8,
                    borderBottom: '1px solid var(--border-subtle)',
                  }}
                >
                  <span style={{ color: 'var(--text-primary)' }}>
                    {ed.competition?.name ?? ed.displayName}
                  </span>
                  <span>
                    {ed.worldSeason?.label ?? '—'} · {ed.status}
                  </span>
                </Link>
              ))}
            </div>
          )}
        </Panel>

        <Panel title="Draft">
          {draftStatus?.draftEvent ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, font: 'var(--text-body-sm)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--text-primary)' }}>{draftStatus.draftEvent.name}</span>
                <Badge tone={draftStatus.draftEvent.status === 'COMPLETED' ? 'success' : draftStatus.draftEvent.status === 'IN_PROGRESS' ? 'info' : 'warning'}>
                  {draftStatus.draftEvent.status}
                </Badge>
              </div>
              <div style={{ color: 'var(--text-secondary)' }}>
                Pick {draftStatus.draftEvent.currentOverallPick} / {draftStatus.draftEvent.totalPicks} · {draftStatus.draftEvent.rounds} rounds
              </div>
              {draftStatus.latestSelections.slice(0, 3).map((s, i) => (
                <div key={i} style={{ color: 'var(--text-tertiary)', font: 'var(--text-data-sm)' }}>
                  #{s.overallPick} {s.teamName} → {s.playerName ?? '—'}
                </div>
              ))}
              <Link to={`/drafts/${draftStatus.draftEvent.id}`}><Button>Open Draft Room</Button></Link>
            </div>
          ) : (
            <EmptyState title="No draft" description="No draft event for the current season." />
          )}
        </Panel>

        {(data.nationalTeamPreparation?.length ?? 0) > 0 ? (
          <Panel title="National team preparation">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {data.nationalTeamPreparation!.map((nt) => (
                <Link
                  key={nt.competitionEditionId}
                  to={`/competitions/${nt.competitionId}/editions/${nt.competitionEditionId}?tab=national-teams`}
                  style={{
                    display: 'block',
                    textDecoration: 'none',
                    color: 'var(--text-secondary)',
                    font: 'var(--text-body-sm)',
                    paddingBottom: 8,
                    borderBottom: '1px solid var(--border-subtle)',
                  }}
                >
                  <div style={{ color: 'var(--text-primary)' }}>{nt.displayName}</div>
                  <div>
                    Ready {nt.ready}/{nt.total} · Locked {nt.locked}/{nt.total}
                    {nt.blockers[0] ? ` · ${nt.blockers[0]}` : ''}
                  </div>
                </Link>
              ))}
            </div>
            <Link to="/national-teams" style={{ font: 'var(--text-body-sm)' }}>
              Open National Teams
            </Link>
          </Panel>
        ) : null}

        {devApplied !== null ? (
          <Panel title="Player development">
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center' }}>
              <div>
                <div style={{ font: 'var(--text-body-sm)', color: 'var(--text-primary)' }}>
                  {devApplied ? 'Annual development applied' : 'Development pending'}
                </div>
                <div style={{ font: 'var(--text-body-sm)', color: 'var(--text-tertiary)', marginTop: 4 }}>
                  F24 official runs update abilities, roles, form, and retirements.
                </div>
              </div>
              <Link to="/development" style={{ font: 'var(--text-body-sm)', color: 'var(--text-link)' }}>
                Open Development
              </Link>
            </div>
          </Panel>
        ) : null}

        {youthApplied !== null ? (
          <Panel title="Youth generation">
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center' }}>
              <div>
                <div style={{ font: 'var(--text-body-sm)', color: 'var(--text-primary)' }}>
                  {youthApplied ? 'Youth prospects generated' : 'Youth generation pending'}
                </div>
                <div style={{ font: 'var(--text-body-sm)', color: 'var(--text-tertiary)', marginTop: 4 }}>
                  {youthApplied && youthProspectCount != null
                    ? `${youthProspectCount} generated prospects in the active run.`
                    : 'F25 official runs create age 15–17 prospect cohorts per country.'}
                </div>
              </div>
              <Link to="/youth-generation" style={{ font: 'var(--text-body-sm)', color: 'var(--text-link)' }}>
                Open Youth Generation
              </Link>
            </div>
          </Panel>
        ) : null}

        <Panel title="Warnings">
          {data.warnings.length === 0 ? (
            <p style={{ margin: 0, font: 'var(--text-body-sm)', color: 'var(--text-secondary)' }}>
              No structural warnings.
            </p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {data.warnings.map((w) => (
                <div key={w.code} style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                  <Badge tone={w.severity === 'warning' ? 'warning' : 'info'}>{w.severity}</Badge>
                  <span style={{ font: 'var(--text-body-sm)', color: 'var(--text-secondary)' }}>
                    {w.message}
                  </span>
                </div>
              ))}
            </div>
          )}
        </Panel>
      </div>

      {data.ageReference ? (
        <p style={{ margin: 0, font: 'var(--text-body-sm)', color: 'var(--text-tertiary)' }}>
          Player ages are derived as of {data.ageReference.referenceDate} (1 July of WorldSeason
          start year), not the browser clock.
        </p>
      ) : null}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        gap: 12,
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
