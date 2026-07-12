import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
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
  TextInput,
} from '../components/ui/DataBrowser';
import { EmptyState, ErrorState, LoadingState } from '../components/ui/EmptyState';
import { Panel } from '../components/ui/Panel';
import {
  getCompetitions,
  getWorldSeasons,
  type CompetitionListItem,
  type Paginated,
  type WorldSeasonItem,
} from '../lib/api';
import { useListQueryState } from '../lib/listQuery';

export function CompetitionsPage() {
  const navigate = useNavigate();
  const { state, setMany, clearFilters } = useListQueryState({ sort: 'name', direction: 'asc' });
  const [data, setData] = useState<Paginated<CompetitionListItem> | null>(null);
  const [seasons, setSeasons] = useState<WorldSeasonItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const controller = new AbortController();
    getWorldSeasons(controller.signal)
      .then((res) => setSeasons(res.items))
      .catch(() => undefined);
    return () => controller.abort();
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    getCompetitions(
      {
        search: state.search || undefined,
        type: state.get('type') || undefined,
        simulationLevel: state.get('simulationLevel') || undefined,
        editionStatus: state.get('editionStatus') || undefined,
        worldSeasonId: state.get('worldSeasonId') || undefined,
        page: state.page,
        pageSize: state.pageSize,
        sort: state.sort || 'name',
        direction: state.direction,
      },
      controller.signal,
    )
      .then((res) => {
        setData(res);
        setError(null);
      })
      .catch((err: unknown) => {
        if (controller.signal.aborted) return;
        setError(err instanceof Error ? err.message : 'Failed to load competitions');
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [state]);

  return (
    <div style={{ padding: 20 }}>
      <PageHeader
        title="Competitions"
        subtitle={data ? `${data.total} competitions` : 'Browse competition definitions'}
        badge="Browser"
      />

      <FilterBar>
        <Field label="Search" htmlFor="comp-search">
          <TextInput
            id="comp-search"
            value={state.search}
            onChange={(e) => setMany({ search: e.target.value })}
          />
        </Field>
        <Field label="Type" htmlFor="comp-type">
          <SelectInput
            id="comp-type"
            value={state.get('type')}
            onChange={(e) => setMany({ type: e.target.value || undefined })}
          >
            <option value="">All</option>
            {['LEAGUE', 'PLAYOFF', 'INTERNATIONAL_TOURNAMENT', 'OTHER'].map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </SelectInput>
        </Field>
        <Field label="Simulation" htmlFor="comp-sim">
          <SelectInput
            id="comp-sim"
            value={state.get('simulationLevel')}
            onChange={(e) => setMany({ simulationLevel: e.target.value || undefined })}
          >
            <option value="">All</option>
            <option value="DETAILED">DETAILED</option>
            <option value="AGGREGATED">AGGREGATED</option>
          </SelectInput>
        </Field>
        <Field label="Edition status" htmlFor="comp-status">
          <SelectInput
            id="comp-status"
            value={state.get('editionStatus')}
            onChange={(e) => setMany({ editionStatus: e.target.value || undefined })}
          >
            <option value="">All</option>
            {['PLANNED', 'PREPARING', 'ACTIVE', 'COMPLETED', 'ARCHIVED'].map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </SelectInput>
        </Field>
        <Field label="World season" htmlFor="comp-season">
          <SelectInput
            id="comp-season"
            value={state.get('worldSeasonId')}
            onChange={(e) => setMany({ worldSeasonId: e.target.value || undefined })}
          >
            <option value="">All</option>
            {seasons.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </SelectInput>
        </Field>
        <Button variant="secondary" onClick={clearFilters}>
          Clear filters
        </Button>
      </FilterBar>

      {loading ? <LoadingState label="Loading competitions…" /> : null}
      {error ? <ErrorState description={error} /> : null}
      {!loading && !error && data && data.items.length === 0 ? (
        <EmptyState title="No competitions found" description="Try clearing filters." />
      ) : null}

      {!loading && !error && data && data.items.length > 0 ? (
        <Panel>
          <DataTable
            headers={[
              { key: 'name', label: 'Competition' },
              { key: 'short', label: 'Short' },
              { key: 'type', label: 'Type' },
              { key: 'sim', label: 'Simulation' },
              { key: 'edition', label: 'Current edition' },
              { key: 'season', label: 'Season' },
              { key: 'status', label: 'Status' },
            ]}
          >
            {data.items.map((c) => (
              <DataRow key={c.id} onActivate={() => navigate(`/competitions/${c.id}`)}>
                <Td primary>{c.name}</Td>
                <Td>{c.shortName ?? '—'}</Td>
                <Td>{c.type}</Td>
                <Td>{c.simulationLevel ?? '—'}</Td>
                <Td>{c.currentEdition?.displayName ?? '—'}</Td>
                <Td>{c.currentEdition?.worldSeason?.label ?? '—'}</Td>
                <Td>
                  {c.currentEdition ? (
                    <Badge tone="neutral">{c.currentEdition.status}</Badge>
                  ) : (
                    '—'
                  )}
                </Td>
              </DataRow>
            ))}
          </DataTable>
          <Pagination
            page={data.page}
            totalPages={data.totalPages}
            total={data.total}
            onPage={(page) => setMany({ page: String(page) }, false)}
          />
        </Panel>
      ) : null}
    </div>
  );
}
