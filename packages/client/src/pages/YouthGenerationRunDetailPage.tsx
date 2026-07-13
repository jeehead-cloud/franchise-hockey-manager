import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { PageHeader } from '../components/layout/PageHeader';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { DataRow, DataTable, Field, SelectInput, Td } from '../components/ui/DataBrowser';
import { EmptyState, ErrorState, LoadingState } from '../components/ui/EmptyState';
import { Panel } from '../components/ui/Panel';
import { BackLink, RecordNotFound } from '../components/ui/RecordStates';
import {
  getYouthGenerationRun,
  listYouthCohorts,
  listYouthGeneratedPlayers,
  type YouthCohortDto,
  type YouthGeneratedPlayerDto,
  type YouthRunDto,
} from '../lib/api';

function runStatusTone(status: string): 'success' | 'warning' | 'danger' | 'neutral' | 'info' {
  if (status === 'COMPLETED') return 'success';
  if (status === 'PREPARED' || status === 'RUNNING') return 'warning';
  if (status === 'FAILED') return 'danger';
  if (status === 'CANCELLED') return 'neutral';
  return 'info';
}

function playerLabel(p: YouthGeneratedPlayerDto): string {
  return (
    p.displayName ??
    p.playerName ??
    (`${p.firstName ?? ''} ${p.lastName ?? ''}`.trim() || '—')
  );
}

export function YouthGenerationRunDetailPage() {
  const { runId = '' } = useParams();
  const [run, setRun] = useState<YouthRunDto | null>(null);
  const [cohorts, setCohorts] = useState<YouthCohortDto[]>([]);
  const [cohortsTotal, setCohortsTotal] = useState(0);
  const [players, setPlayers] = useState<YouthGeneratedPlayerDto[]>([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [countryFilter, setCountryFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    const c = new AbortController();
    setLoading(true);
    setNotFound(false);
    getYouthGenerationRun(runId, c.signal)
      .then((res) => {
        setRun(res.item);
        setError(null);
      })
      .catch((err: unknown) => {
        if (c.signal.aborted) return;
        const status = (err as { status?: number }).status;
        if (status === 404) setNotFound(true);
        else setError(err instanceof Error ? err.message : 'Failed to load run');
      })
      .finally(() => {
        if (!c.signal.aborted) setLoading(false);
      });
    return () => c.abort();
  }, [runId]);

  useEffect(() => {
    if (!runId) return;
    const c = new AbortController();
    listYouthCohorts(runId, { page: 1, pageSize: 100 }, c.signal)
      .then((res) => {
        setCohorts(res.items);
        setCohortsTotal(res.total);
      })
      .catch(() => {
        if (!c.signal.aborted) setCohorts([]);
      });
    return () => c.abort();
  }, [runId]);

  useEffect(() => {
    if (!runId) return;
    const c = new AbortController();
    listYouthGeneratedPlayers(
      runId,
      { page, pageSize: 50, countryId: countryFilter || undefined },
      c.signal,
    )
      .then((res) => {
        setPlayers(res.items);
        setTotal(res.total);
      })
      .catch(() => {
        if (!c.signal.aborted) setPlayers([]);
      });
    return () => c.abort();
  }, [runId, page, countryFilter]);

  if (loading) {
    return (
      <div style={{ padding: 20 }}>
        <LoadingState label="Loading run…" />
      </div>
    );
  }

  if (notFound) {
    return (
      <div style={{ padding: 20 }}>
        <BackLink to="/youth-generation" label="Youth Generation" />
        <RecordNotFound
          entity="Youth generation run"
          listHref="/youth-generation"
          listLabel="Back to Youth Generation"
        />
      </div>
    );
  }

  if (error || !run) {
    return (
      <div style={{ padding: 20 }}>
        <BackLink to="/youth-generation" label="Youth Generation" />
        <ErrorState description={error ?? 'Run unavailable'} />
      </div>
    );
  }

  const countryOptions = [...new Map(cohorts.map((c) => [c.countryId, c.countryName])).entries()];

  return (
    <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 16 }}>
      <BackLink to="/youth-generation" label="Youth Generation" />
      <PageHeader
        title={`Youth generation run v${run.runVersion}`}
        subtitle={`${run.referenceDate} · seed ${run.baseSeed}`}
        badge={run.status}
        actions={<Badge tone={runStatusTone(run.status)}>{run.status}</Badge>}
      />

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
          gap: 16,
        }}
      >
        <Panel title="Run metadata">
          <Row label="World season" value={run.worldSeasonId.slice(0, 8)} />
          <Row label="Reference date" value={run.referenceDate} />
          <Row label="Base seed" value={run.baseSeed} />
          <Row label="Profile set version" value={run.profileSetVersionId.slice(0, 8)} />
          <Row label="Current official" value={run.isCurrent ? 'Yes' : 'No'} />
          {run.failureReason ? <Row label="Failure" value={run.failureReason} /> : null}
        </Panel>
        <Panel title="Counts">
          <Row label="Countries" value={`${run.enabledCountryCount} / ${run.countryCount}`} />
          <Row label="Planned players" value={String(run.totalPlannedPlayers)} />
          <Row label="Generated players" value={String(run.totalGeneratedPlayers)} />
          <Row label="Warnings" value={String(run.warningCount)} />
        </Panel>
        <Panel title="Hashes">
          <Row label="Profile set hash" value={run.profileSetHash} />
          <Row label="Input hash" value={run.inputHash} />
          <Row label="Result hash" value={run.resultHash ?? '—'} />
          <Row
            label="Timestamps"
            value={
              [
                run.startedAt ? `started ${new Date(run.startedAt).toLocaleString()}` : null,
                run.completedAt ? `completed ${new Date(run.completedAt).toLocaleString()}` : null,
                run.failedAt ? `failed ${new Date(run.failedAt).toLocaleString()}` : null,
              ]
                .filter(Boolean)
                .join(' · ') || '—'
            }
          />
        </Panel>
      </div>

      <Panel title={`Cohorts (${cohortsTotal})`}>
        {cohorts.length === 0 ? (
          <EmptyState title="No cohorts" description="No country cohorts recorded for this run." />
        ) : (
          <DataTable
            headers={[
              { key: 'country', label: 'Country' },
              { key: 'size', label: 'Generated' },
              { key: 'ages', label: 'Ages 15/16/17' },
              { key: 'skaters', label: 'Skaters' },
              { key: 'goalies', label: 'Goalies' },
            ]}
          >
            {cohorts.map((c) => (
              <DataRow key={c.id ?? `${c.countryId}-${c.cohortOrder}`}>
                <Td primary>{c.countryName}</Td>
                <Td>
                  {c.generatedSize} / {c.plannedSize}
                </Td>
                <Td>
                  {c.age15Count}/{c.age16Count}/{c.age17Count}
                </Td>
                <Td>{c.skaterCount}</Td>
                <Td>{c.goalieCount}</Td>
              </DataRow>
            ))}
          </DataTable>
        )}
      </Panel>

      <Panel title="Generated players">
        <Field label="Country filter">
          <SelectInput
            value={countryFilter}
            onChange={(e) => {
              setCountryFilter(e.target.value);
              setPage(1);
            }}
          >
            <option value="">All countries</option>
            {countryOptions.map(([id, name]) => (
              <option key={id} value={id}>
                {name}
              </option>
            ))}
          </SelectInput>
        </Field>
        {players.length === 0 ? (
          <EmptyState title="No players" description="No generated players match this filter." />
        ) : (
          <>
            <DataTable
              headers={[
                { key: 'player', label: 'Player' },
                { key: 'country', label: 'Country' },
                { key: 'age', label: 'Age' },
                { key: 'pos', label: 'Pos' },
                { key: 'ca', label: 'CA' },
                { key: 'role', label: 'Role' },
              ]}
            >
              {players.map((p) => (
                <DataRow key={p.id ?? `${p.generationIndex}-${p.countryId}`}>
                  <Td primary>
                    {p.playerId ? (
                      <Link to={`/players/${p.playerId}`}>{playerLabel(p)}</Link>
                    ) : (
                      playerLabel(p)
                    )}
                  </Td>
                  <Td>{p.countryKey ?? p.countryId.slice(0, 8)}</Td>
                  <Td>{p.ageOnReferenceDate}</Td>
                  <Td>{p.position}</Td>
                  <Td>{p.currentAbility}</Td>
                  <Td>{p.role}</Td>
                </DataRow>
              ))}
            </DataTable>
            <div style={{ display: 'flex', gap: 8, marginTop: 12, alignItems: 'center' }}>
              <Button variant="secondary" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                Previous
              </Button>
              <span style={{ font: 'var(--text-body-sm)', color: 'var(--text-tertiary)' }}>
                Page {page} · {total} total
              </span>
              <Button
                variant="secondary"
                size="sm"
                disabled={page * 50 >= total}
                onClick={() => setPage((p) => p + 1)}
              >
                Next
              </Button>
            </div>
          </>
        )}
      </Panel>
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
        wordBreak: 'break-all',
      }}
    >
      <span style={{ color: 'var(--text-tertiary)', flexShrink: 0 }}>{label}</span>
      <span style={{ color: 'var(--text-primary)', textAlign: 'right' }}>{value}</span>
    </div>
  );
}
