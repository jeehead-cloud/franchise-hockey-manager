import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { PageHeader } from '../components/layout/PageHeader';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import {
  DataRow,
  DataTable,
  Field,
  FilterBar,
  Pagination,
  SelectInput,
  Td,
} from '../components/ui/DataBrowser';
import { EmptyState, ErrorState, LoadingState } from '../components/ui/EmptyState';
import { Panel } from '../components/ui/Panel';
import { formatDecisionLabel, formatDisplayScore } from '../lib/match-format';
import { getMatches, type MatchListItem, type Paginated } from '../lib/api';
import { useListQueryState } from '../lib/listQuery';

function statusBadge(status: MatchListItem['status']) {
  switch (status) {
    case 'COMPLETED':
      return <Badge tone="success">Completed</Badge>;
    case 'PREPARED':
      return <Badge tone="neutral">Prepared</Badge>;
    case 'SIMULATING':
      return <Badge tone="warning">Simulating</Badge>;
    case 'FAILED':
      return <Badge tone="danger">Failed</Badge>;
    default:
      return <Badge tone="neutral">{status}</Badge>;
  }
}

export function MatchesPage() {
  const navigate = useNavigate();
  const { state, setMany, clearFilters } = useListQueryState({ sort: 'createdAt', direction: 'desc' });
  const [data, setData] = useState<Paginated<MatchListItem> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    getMatches(
      {
        status: state.get('status') || undefined,
        decisionType: state.get('decisionType') || undefined,
        teamId: state.get('teamId') || undefined,
        page: state.page,
        pageSize: state.pageSize,
      },
      controller.signal,
    )
      .then((res) => {
        setData(res);
        setError(null);
      })
      .catch((err: unknown) => {
        if (controller.signal.aborted) return;
        setError(err instanceof Error ? err.message : 'Failed to load matches');
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [state]);

  return (
    <div style={{ padding: 20 }}>
      <PageHeader
        title="Matches"
        subtitle={data ? `${data.total} matches` : 'Persistent ad hoc match results'}
        badge="F14"
        actions={
          <Button variant="primary" onClick={() => navigate('/matches/new')}>
            New match
          </Button>
        }
      />

      <FilterBar>
        <Field label="Status" htmlFor="match-status">
          <SelectInput
            id="match-status"
            value={state.get('status')}
            onChange={(e) => setMany({ status: e.target.value || undefined })}
          >
            <option value="">All</option>
            <option value="PREPARED">Prepared</option>
            <option value="COMPLETED">Completed</option>
            <option value="SIMULATING">Simulating</option>
            <option value="FAILED">Failed</option>
          </SelectInput>
        </Field>
        <Field label="Decision" htmlFor="match-decision">
          <SelectInput
            id="match-decision"
            value={state.get('decisionType')}
            onChange={(e) => setMany({ decisionType: e.target.value || undefined })}
          >
            <option value="">All</option>
            <option value="REGULATION">Regulation</option>
            <option value="OVERTIME">Overtime</option>
            <option value="SHOOTOUT">Shootout</option>
            <option value="TIE">Tie</option>
          </SelectInput>
        </Field>
        <Button variant="secondary" onClick={clearFilters}>
          Clear filters
        </Button>
      </FilterBar>

      {loading ? <LoadingState label="Loading matches…" /> : null}
      {error ? <ErrorState description={error} /> : null}
      {!loading && !error && data && data.total === 0 ? (
        <EmptyState
          title="No matches yet"
          description="Create an ad hoc match between two simulation-ready teams."
          action={{ label: 'New match', onClick: () => navigate('/matches/new') }}
        />
      ) : null}

      {!loading && !error && data && data.total > 0 ? (
        <Panel>
          <DataTable
            headers={[
              { key: 'match', label: 'Match' },
              { key: 'status', label: 'Status' },
              { key: 'score', label: 'Score' },
              { key: 'decision', label: 'Decision' },
              { key: 'completed', label: 'Completed' },
              { key: 'seed', label: 'Seed' },
            ]}
          >
            {data.items.map((match) => {
              const result = match.currentResult;
              return (
                <DataRow key={match.id} onActivate={() => navigate(`/matches/${match.id}`)}>
                  <Td primary>
                    <div>{match.awayTeamName} @ {match.homeTeamName}</div>
                    <div style={{ font: 'var(--text-data-sm)', color: 'var(--text-tertiary)' }}>
                      {match.source === 'MANUAL' ? 'Manual' : 'Competition'}
                    </div>
                  </Td>
                  <Td>{statusBadge(match.status)}</Td>
                  <Td>
                    {result
                      ? formatDisplayScore(result.homeScore, result.awayScore, result.decisionType)
                      : '—'}
                  </Td>
                  <Td>{result ? formatDecisionLabel(result.decisionType) : '—'}</Td>
                  <Td>
                    {result?.completedAt
                      ? new Date(result.completedAt).toLocaleString()
                      : new Date(match.createdAt).toLocaleString()}
                  </Td>
                  <Td>
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }}>
                      {result?.randomSeed?.slice(0, 12) ?? '—'}
                    </span>
                  </Td>
                </DataRow>
              );
            })}
          </DataTable>
          <Pagination
            page={data.page}
            totalPages={data.totalPages}
            total={data.total}
            onPage={(page) => setMany({ page: String(page) }, false)}
          />
        </Panel>
      ) : null}

      <p style={{ marginTop: 16, font: 'var(--text-body-sm)', color: 'var(--text-tertiary)' }}>
        F14 supports manual matches only — no schedules or standings updates.{' '}
        <Link to="/simulation-lab">Simulation Lab</Link> remains the technical debug tool.
      </p>
    </div>
  );
}
