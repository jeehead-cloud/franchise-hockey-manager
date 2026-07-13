import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { PageHeader } from '../components/layout/PageHeader';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { EmptyState, ErrorState, LoadingState } from '../components/ui/EmptyState';
import { Panel } from '../components/ui/Panel';
import { BackLink, RecordNotFound } from '../components/ui/RecordStates';
import { Tabs } from '../components/ui/Tabs';
import { Field, SelectInput, TextInput } from '../components/ui/DataBrowser';
import { useCommissioner } from '../lib/commissioner';
import {
  createCompetitionEdition,
  getCompetition,
  getWorldSeasons,
  type CompetitionDetail,
  type WorldSeasonItem,
} from '../lib/api';

export function CompetitionDetailPage() {
  const { competitionId = '' } = useParams();
  const commissioner = useCommissioner();
  const [item, setItem] = useState<CompetitionDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [loading, setLoading] = useState(true);
  const [seasons, setSeasons] = useState<WorldSeasonItem[]>([]);
  const [seasonId, setSeasonId] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [templateKey, setTemplateKey] = useState('SIMPLE_LEAGUE');
  const [busy, setBusy] = useState(false);

  const reload = () => {
    setLoading(true);
    return getCompetition(competitionId)
      .then((res) => {
        setItem(res.item);
        setError(null);
        setNotFound(false);
        if (!displayName) setDisplayName(`${res.item.shortName ?? res.item.name} edition`);
      })
      .catch((err: unknown) => {
        const status = (err as { status?: number }).status;
        if (status === 404) setNotFound(true);
        else setError(err instanceof Error ? err.message : 'Failed to load competition');
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setNotFound(false);
    getCompetition(competitionId, controller.signal)
      .then((res) => {
        setItem(res.item);
        setError(null);
        setDisplayName(`${res.item.shortName ?? res.item.name} edition`);
      })
      .catch((err: unknown) => {
        if (controller.signal.aborted) return;
        const status = (err as { status?: number }).status;
        if (status === 404) setNotFound(true);
        else setError(err instanceof Error ? err.message : 'Failed to load competition');
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [competitionId]);

  useEffect(() => {
    getWorldSeasons()
      .then((res) => {
        setSeasons(res.items);
        if (res.items[0]) setSeasonId(res.items[0].id);
      })
      .catch(() => undefined);
  }, []);

  if (loading) {
    return (
      <div style={{ padding: 20 }}>
        <LoadingState label="Loading competition…" />
      </div>
    );
  }

  if (notFound) {
    return (
      <div style={{ padding: 20 }}>
        <BackLink to="/competitions" label="Competitions" />
        <RecordNotFound
          entity="Competition"
          listHref="/competitions"
          listLabel="Back to Competitions"
        />
      </div>
    );
  }

  if (error || !item) {
    return (
      <div style={{ padding: 20 }}>
        <BackLink to="/competitions" label="Competitions" />
        <ErrorState description={error ?? 'Competition unavailable'} />
      </div>
    );
  }

  return (
    <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 16 }}>
      <BackLink to="/competitions" label="Competitions" />
      <PageHeader
        title={item.name}
        subtitle={[item.shortName, item.type, item.simulationLevel].filter(Boolean).join(' · ')}
        badge="Overview"
      />

      <Tabs
        items={[
          { value: 'overview', label: 'Overview' },
          { value: 'standings', label: 'Standings', disabled: true },
          { value: 'schedule', label: 'Schedule', disabled: true },
          { value: 'stats', label: 'Stats', disabled: true },
        ]}
        value="overview"
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
          <Row label="Type" value={item.type} />
          <Row label="Simulation level" value={item.simulationLevel ?? '—'} />
          <Row label="Country" value={item.country?.name ?? '—'} />
          <Row label="League" value={item.league?.name ?? '—'} />
          <Row label="Default rules" value={item.hasDefaultRules ? 'Present' : '—'} />
          <Row label="External ID" value={item.externalId ?? '—'} />
          <Row label="Dataset" value={item.sourceDataset ?? '—'} />
        </Panel>

        <Panel title="Editions">
          {item.editions.length === 0 ? (
            <EmptyState title="No editions" description="No competition editions linked yet." />
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {item.editions.map((ed) => (
                <Link
                  key={ed.id}
                  to={`/competitions/${competitionId}/editions/${ed.id}`}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    gap: 8,
                    font: 'var(--text-body-sm)',
                    paddingBottom: 8,
                    borderBottom: '1px solid var(--border-subtle)',
                    textDecoration: 'none',
                    color: 'inherit',
                  }}
                >
                  <div>
                    <div style={{ color: 'var(--text-primary)' }}>{ed.displayName}</div>
                    <div style={{ color: 'var(--text-tertiary)' }}>
                      {ed.worldSeason?.label ?? 'No season'}
                      {ed.participantCount != null ? ` · ${ed.participantCount} teams` : ''}
                    </div>
                  </div>
                  <Badge tone="neutral">{ed.status}</Badge>
                </Link>
              ))}
            </div>
          )}
        </Panel>
      </div>

      {commissioner.enabled ? (
        <Panel title="Create edition">
          <div style={{ display: 'grid', gap: 10, maxWidth: 480 }}>
            <Field label="World season">
              <SelectInput value={seasonId} onChange={(e) => setSeasonId(e.target.value)}>
                {seasons.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.label}
                  </option>
                ))}
              </SelectInput>
            </Field>
            <Field label="Display name">
              <TextInput value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
            </Field>
            <Field label="Rules template">
              <SelectInput value={templateKey} onChange={(e) => setTemplateKey(e.target.value)}>
                <option value="SIMPLE_LEAGUE">SIMPLE_LEAGUE</option>
                <option value="SIMPLE_ROUND_ROBIN">SIMPLE_ROUND_ROBIN</option>
                <option value="GROUPS_AND_KNOCKOUT">GROUPS_AND_KNOCKOUT</option>
                <option value="BEST_OF_SERIES_PLAYOFF">BEST_OF_SERIES_PLAYOFF</option>
              </SelectInput>
            </Field>
            <Button
              disabled={busy || !seasonId || !displayName.trim()}
              onClick={async () => {
                setBusy(true);
                setError(null);
                try {
                  await createCompetitionEdition(competitionId, {
                    worldSeasonId: seasonId,
                    displayName: displayName.trim(),
                    templateKey,
                    reason: 'Create competition edition',
                  });
                  await reload();
                } catch (err) {
                  setError(err instanceof Error ? err.message : 'Failed to create edition');
                } finally {
                  setBusy(false);
                }
              }}
            >
              Create edition
            </Button>
          </div>
        </Panel>
      ) : null}

      <EmptyState
        title="Schedules & standings deferred"
        description="F17 prepares competition structure only. Matches, standings, and progression arrive in F18+."
      />
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
