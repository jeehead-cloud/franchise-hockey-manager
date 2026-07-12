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
  getLeagues,
  getTeams,
  type CountryItem,
  type LeagueItem,
  type Paginated,
  type TeamListItem,
} from '../lib/api';
import { useListQueryState } from '../lib/listQuery';

export function TeamsPage() {
  const navigate = useNavigate();
  const { state, setMany, clearFilters } = useListQueryState({ sort: 'name', direction: 'asc' });
  const [data, setData] = useState<Paginated<TeamListItem> | null>(null);
  const [countries, setCountries] = useState<CountryItem[]>([]);
  const [leagues, setLeagues] = useState<LeagueItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const controller = new AbortController();
    Promise.all([getCountries(controller.signal), getLeagues(controller.signal)])
      .then(([c, l]) => {
        setCountries(c.items);
        setLeagues(l.items);
      })
      .catch(() => undefined);
    return () => controller.abort();
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    getTeams(
      {
        search: state.search || undefined,
        countryId: state.get('countryId') || undefined,
        leagueId: state.get('leagueId') || undefined,
        teamType: state.get('teamType') || undefined,
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
        setError(err instanceof Error ? err.message : 'Failed to load teams');
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [state]);

  return (
    <div style={{ padding: 20 }}>
      <PageHeader
        title="Teams"
        subtitle={data ? `${data.total} teams` : 'Browse club and national teams'}
        badge="Browser"
      />

      <FilterBar>
        <Field label="Search" htmlFor="team-search">
          <TextInput
            id="team-search"
            value={state.search}
            placeholder="Name, city…"
            onChange={(e) => setMany({ search: e.target.value })}
          />
        </Field>
        <Field label="Country" htmlFor="team-country">
          <SelectInput
            id="team-country"
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
        <Field label="League" htmlFor="team-league">
          <SelectInput
            id="team-league"
            value={state.get('leagueId')}
            onChange={(e) => setMany({ leagueId: e.target.value || undefined })}
          >
            <option value="">All</option>
            {leagues.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </SelectInput>
        </Field>
        <Field label="Type" htmlFor="team-type">
          <SelectInput
            id="team-type"
            value={state.get('teamType')}
            onChange={(e) => setMany({ teamType: e.target.value || undefined })}
          >
            <option value="">All</option>
            <option value="CLUB">Club</option>
            <option value="NATIONAL">National</option>
          </SelectInput>
        </Field>
        <Field label="Sort" htmlFor="team-sort">
          <SelectInput
            id="team-sort"
            value={state.sort || 'name'}
            onChange={(e) => setMany({ sort: e.target.value }, false)}
          >
            <option value="name">Name</option>
            <option value="city">City</option>
            <option value="teamType">Type</option>
            <option value="createdAt">Created</option>
          </SelectInput>
        </Field>
        <Button variant="secondary" onClick={clearFilters}>
          Clear filters
        </Button>
      </FilterBar>

      {loading ? <LoadingState label="Loading teams…" /> : null}
      {error ? <ErrorState description={error} /> : null}
      {!loading && !error && data && data.items.length === 0 ? (
        <EmptyState
          title="No teams found"
          description="Try clearing filters or initialize a world with team data."
        />
      ) : null}

      {!loading && !error && data && data.items.length > 0 ? (
        <Panel>
          <DataTable
            headers={[
              { key: 'name', label: 'Team' },
              { key: 'short', label: 'Short' },
              { key: 'city', label: 'City' },
              { key: 'country', label: 'Country' },
              { key: 'league', label: 'League' },
              { key: 'type', label: 'Type' },
              { key: 'roster', label: 'Roster' },
              { key: 'coach', label: 'Coach' },
            ]}
          >
            {data.items.map((team) => (
              <DataRow key={team.id} onActivate={() => navigate(`/teams/${team.id}`)}>
                <Td primary>{team.name}</Td>
                <Td>{team.shortName ?? '—'}</Td>
                <Td>{team.city ?? '—'}</Td>
                <Td>{team.country?.name ?? '—'}</Td>
                <Td>{team.league?.name ?? '—'}</Td>
                <Td>
                  <Badge tone="neutral">{team.teamType}</Badge>
                </Td>
                <Td>{team.rosterCount}</Td>
                <Td>
                  {team.coach
                    ? `${team.coach.firstName} ${team.coach.lastName}`
                    : 'Unassigned'}
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
