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
  getCountries,
  getPlayers,
  getTeams,
  type CountryItem,
  type Paginated,
  type PlayerListItem,
  type TeamListItem,
} from '../lib/api';
import { playerLabel, useListQueryState } from '../lib/listQuery';

export function PlayersPage() {
  const navigate = useNavigate();
  const { state, setMany, clearFilters } = useListQueryState({
    sort: 'lastName',
    direction: 'asc',
  });
  const [data, setData] = useState<Paginated<PlayerListItem> | null>(null);
  const [countries, setCountries] = useState<CountryItem[]>([]);
  const [teams, setTeams] = useState<TeamListItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const controller = new AbortController();
    Promise.all([
      getCountries(controller.signal),
      getTeams({ pageSize: 100, sort: 'name' }, controller.signal),
    ])
      .then(([c, t]) => {
        setCountries(c.items);
        setTeams(t.items);
      })
      .catch(() => undefined);
    return () => controller.abort();
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    getPlayers(
      {
        search: state.search || undefined,
        countryId: state.get('countryId') || undefined,
        teamId: state.get('teamId') || undefined,
        position: state.get('position') || undefined,
        sourceType: state.get('sourceType') || undefined,
        rosterStatus: state.get('rosterStatus') || undefined,
        page: state.page,
        pageSize: state.pageSize,
        sort: state.sort || 'lastName',
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
        setError(err instanceof Error ? err.message : 'Failed to load players');
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [state]);

  return (
    <div style={{ padding: 20 }}>
      <PageHeader
        title="Players"
        subtitle={data ? `${data.total} players` : 'Browse structural player records'}
        badge="Browser"
      />

      <FilterBar>
        <Field label="Search" htmlFor="player-search">
          <TextInput
            id="player-search"
            value={state.search}
            placeholder="First or last name"
            onChange={(e) => setMany({ search: e.target.value })}
          />
        </Field>
        <Field label="Country" htmlFor="player-country">
          <SelectInput
            id="player-country"
            value={state.get('countryId')}
            onChange={(e) => setMany({ countryId: e.target.value || undefined })}
          >
            <option value="">All</option>
            {countries.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </SelectInput>
        </Field>
        <Field label="Team" htmlFor="player-team">
          <SelectInput
            id="player-team"
            value={state.get('teamId')}
            onChange={(e) => setMany({ teamId: e.target.value || undefined })}
          >
            <option value="">All</option>
            <option value="unassigned">Unassigned</option>
            {teams.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </SelectInput>
        </Field>
        <Field label="Position" htmlFor="player-pos">
          <SelectInput
            id="player-pos"
            value={state.get('position')}
            onChange={(e) => setMany({ position: e.target.value || undefined })}
          >
            <option value="">All</option>
            {['LW', 'RW', 'C', 'LD', 'RD', 'G'].map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </SelectInput>
        </Field>
        <Field label="Source" htmlFor="player-source">
          <SelectInput
            id="player-source"
            value={state.get('sourceType')}
            onChange={(e) => setMany({ sourceType: e.target.value || undefined })}
          >
            <option value="">All</option>
            {['REAL_INITIAL_DATA', 'GENERATED_YOUTH', 'MANUAL', 'IMPORTED'].map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </SelectInput>
        </Field>
        <Field label="Roster" htmlFor="player-roster">
          <SelectInput
            id="player-roster"
            value={state.get('rosterStatus')}
            onChange={(e) => setMany({ rosterStatus: e.target.value || undefined })}
          >
            <option value="">All</option>
            {['ACTIVE', 'RESERVE', 'PROSPECT', 'UNAVAILABLE'].map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </SelectInput>
        </Field>
        <Button variant="secondary" onClick={clearFilters}>
          Clear filters
        </Button>
      </FilterBar>

      {loading ? <LoadingState label="Loading players…" /> : null}
      {error ? <ErrorState description={error} /> : null}
      {!loading && !error && data && data.items.length === 0 ? (
        <EmptyState title="No players found" description="Try clearing filters." />
      ) : null}

      {!loading && !error && data && data.items.length > 0 ? (
        <Panel>
          <DataTable
            headers={[
              { key: 'player', label: 'Player' },
              { key: 'pos', label: 'Pos' },
              { key: 'dob', label: 'DOB / Age' },
              { key: 'nat', label: 'Nationality' },
              { key: 'team', label: 'Team' },
              { key: 'status', label: 'Status' },
              { key: 'source', label: 'Source' },
            ]}
          >
            {data.items.map((p) => (
              <DataRow key={p.id} onActivate={() => navigate(`/players/${p.id}`)}>
                <Td primary>{playerLabel(p)}</Td>
                <Td>{p.primaryPosition}</Td>
                <Td>
                  {p.dateOfBirth}
                  {p.age != null ? ` · ${p.age}` : ''}
                </Td>
                <Td>{p.nationality?.code ?? '—'}</Td>
                <Td>{p.currentTeam?.name ?? 'Unassigned'}</Td>
                <Td>
                  <Badge tone="neutral">{p.rosterStatus}</Badge>
                </Td>
                <Td>{p.sourceType}</Td>
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
