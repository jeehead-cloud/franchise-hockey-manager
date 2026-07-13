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
  getDevelopmentRun,
  listDevelopmentResults,
  listDevelopmentRetirements,
  type DevelopmentResultRow,
  type DevelopmentRetirementRow,
  type DevelopmentRunDto,
} from '../lib/api';

function runStatusTone(status: string): 'success' | 'warning' | 'danger' | 'neutral' | 'info' {
  if (status === 'COMPLETED') return 'success';
  if (status === 'PREPARED' || status === 'RUNNING') return 'warning';
  if (status === 'FAILED') return 'danger';
  if (status === 'CANCELLED') return 'neutral';
  return 'info';
}

export function DevelopmentRunDetailPage() {
  const { runId = '' } = useParams();
  const [run, setRun] = useState<DevelopmentRunDto | null>(null);
  const [results, setResults] = useState<DevelopmentResultRow[]>([]);
  const [retirements, setRetirements] = useState<DevelopmentRetirementRow[]>([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [outcome, setOutcome] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    const c = new AbortController();
    setLoading(true);
    setNotFound(false);
    getDevelopmentRun(runId, c.signal)
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
    listDevelopmentResults(runId, { page, pageSize: 50, outcome: outcome || undefined }, c.signal)
      .then((res) => {
        setResults(res.items);
        setTotal(res.total);
      })
      .catch(() => {
        if (!c.signal.aborted) setResults([]);
      });
    return () => c.abort();
  }, [runId, page, outcome]);

  useEffect(() => {
    if (!runId) return;
    const c = new AbortController();
    listDevelopmentRetirements(runId, c.signal)
      .then((res) => setRetirements(res.item.items))
      .catch(() => {
        if (!c.signal.aborted) setRetirements([]);
      });
    return () => c.abort();
  }, [runId]);

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
        <BackLink to="/development" label="Development" />
        <RecordNotFound entity="Development run" listHref="/development" listLabel="Back to Development" />
      </div>
    );
  }

  if (error || !run) {
    return (
      <div style={{ padding: 20 }}>
        <BackLink to="/development" label="Development" />
        <ErrorState description={error ?? 'Run unavailable'} />
      </div>
    );
  }

  return (
    <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 16 }}>
      <BackLink to="/development" label="Development" />
      <PageHeader
        title={`Development run v${run.runVersion}`}
        subtitle={`${run.effectiveDate} · seed ${run.baseSeed}`}
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
          <Row label="Effective date" value={run.effectiveDate} />
          <Row label="Base seed" value={run.baseSeed} />
          <Row label="Config version" value={run.configVersionId.slice(0, 8)} />
          <Row label="Current official" value={run.isCurrent ? 'Yes' : 'No'} />
          {run.failureReason ? <Row label="Failure" value={run.failureReason} /> : null}
        </Panel>
        <Panel title="Counts">
          <Row label="Total players" value={String(run.totalPlayers)} />
          <Row label="Developed" value={String(run.developedCount)} />
          <Row label="Declined" value={String(run.declinedCount)} />
          <Row label="Stable" value={String(run.stableCount)} />
          <Row label="Retired" value={String(run.retiredCount)} />
          <Row label="Warnings" value={String(run.warningCount)} />
        </Panel>
        <Panel title="Hashes">
          <Row label="Config hash" value={run.configHash} />
          <Row label="Input hash" value={run.inputHash} />
          <Row label="Result hash" value={run.resultHash ?? '—'} />
          <Row
            label="Timestamps"
            value={[
              run.startedAt ? `started ${new Date(run.startedAt).toLocaleString()}` : null,
              run.completedAt ? `completed ${new Date(run.completedAt).toLocaleString()}` : null,
              run.failedAt ? `failed ${new Date(run.failedAt).toLocaleString()}` : null,
            ]
              .filter(Boolean)
              .join(' · ') || '—'}
          />
        </Panel>
      </div>

      <Panel title="Results">
        <Field label="Outcome filter">
          <SelectInput
            value={outcome}
            onChange={(e) => {
              setOutcome(e.target.value);
              setPage(1);
            }}
          >
            <option value="">All outcomes</option>
            <option value="DEVELOPED">Developed</option>
            <option value="DECLINED">Declined</option>
            <option value="STABLE">Stable</option>
            <option value="RETIRED">Retired</option>
          </SelectInput>
        </Field>
        {results.length === 0 ? (
          <EmptyState title="No results" description="No player results match this filter." />
        ) : (
          <>
            <DataTable
              headers={[
                { key: 'player', label: 'Player' },
                { key: 'team', label: 'Team' },
                { key: 'age', label: 'Age' },
                { key: 'ca', label: 'CA' },
                { key: 'role', label: 'Role' },
                { key: 'form', label: 'Form' },
                { key: 'outcome', label: 'Outcome' },
              ]}
            >
              {results.map((r) => (
                <DataRow key={r.id}>
                  <Td primary>
                    <Link to={`/players/${r.playerId}`}>{r.playerName}</Link>
                  </Td>
                  <Td>{r.teamName ?? '—'}</Td>
                  <Td>{r.ageOnEffectiveDate}</Td>
                  <Td>
                    {r.currentAbilityBefore} → {r.currentAbilityAfter}
                  </Td>
                  <Td>
                    {r.roleBefore} → {r.roleAfter}
                  </Td>
                  <Td>
                    {r.formBefore} → {r.formAfter}
                  </Td>
                  <Td>
                    <Badge tone={r.retired ? 'danger' : 'neutral'}>{r.outcome}</Badge>
                  </Td>
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

      <Panel title={`Retirements (${retirements.length})`}>
        {retirements.length === 0 ? (
          <EmptyState title="No retirements" description="No players retired in this run." />
        ) : (
          <DataTable
            headers={[
              { key: 'player', label: 'Player' },
              { key: 'team', label: 'Team' },
              { key: 'age', label: 'Age' },
              { key: 'reason', label: 'Reason' },
            ]}
          >
            {retirements.map((r) => (
              <DataRow key={r.playerId}>
                <Td primary>
                  <Link to={`/players/${r.playerId}`}>{r.playerName}</Link>
                </Td>
                <Td>{r.teamName ?? '—'}</Td>
                <Td>{r.ageOnEffectiveDate}</Td>
                <Td>{r.retirementReason ?? '—'}</Td>
              </DataRow>
            ))}
          </DataTable>
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
