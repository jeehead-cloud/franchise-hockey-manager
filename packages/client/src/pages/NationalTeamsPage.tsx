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
  TextInput,
} from '../components/ui/DataBrowser';
import { ErrorState, LoadingState } from '../components/ui/EmptyState';
import { Panel } from '../components/ui/Panel';
import {
  createNationalTeam,
  getCountries,
  getNationalTeams,
  type CountryItem,
  type Paginated,
} from '../lib/api';
import { useCommissioner } from '../lib/commissioner';
import { useListQueryState } from '../lib/listQuery';

export function NationalTeamsPage() {
  const navigate = useNavigate();
  const commissioner = useCommissioner();
  const { state, setMany, clearFilters } = useListQueryState({ sort: 'name', direction: 'asc' });
  const [data, setData] = useState<Paginated<Record<string, unknown>> | null>(null);
  const [countries, setCountries] = useState<CountryItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [countryId, setCountryId] = useState('');
  const [category, setCategory] = useState<'SENIOR_MEN' | 'JUNIOR_U20'>('SENIOR_MEN');
  const [displayName, setDisplayName] = useState('');
  const [reason, setReason] = useState('Create national team');

  useEffect(() => {
    const c = new AbortController();
    getCountries(c.signal)
      .then((res) => setCountries(res.items))
      .catch(() => undefined);
    return () => c.abort();
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    getNationalTeams(
      {
        search: state.search || undefined,
        countryId: state.get('countryId') || undefined,
        category: state.get('category') || undefined,
        page: state.page,
        pageSize: state.pageSize,
      },
      controller.signal,
    )
      .then((res) => {
        setData(res as Paginated<Record<string, unknown>>);
        setError(null);
      })
      .catch((err: unknown) => {
        if (controller.signal.aborted) return;
        setError(err instanceof Error ? err.message : 'Failed to load national teams');
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [state]);

  async function onCreate() {
    if (!countryId || !displayName.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const res = await createNationalTeam({
        countryId,
        category,
        displayName: displayName.trim(),
        reason,
      });
      const id = (res.item as { id: string }).id;
      navigate(`/national-teams/${id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Create failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ padding: 20 }}>
      <PageHeader
        title="National Teams"
        subtitle={data ? `${data.total} national teams` : 'Country / category squads'}
        badge="F22"
      />

      <FilterBar>
        <Field label="Search" htmlFor="nt-search">
          <TextInput
            id="nt-search"
            value={state.search}
            placeholder="Name…"
            onChange={(e) => setMany({ search: e.target.value })}
          />
        </Field>
        <Field label="Country" htmlFor="nt-country">
          <SelectInput
            id="nt-country"
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
        <Field label="Category" htmlFor="nt-cat">
          <SelectInput
            id="nt-cat"
            value={state.get('category')}
            onChange={(e) => setMany({ category: e.target.value || undefined })}
          >
            <option value="">All</option>
            <option value="SENIOR_MEN">Senior Men</option>
            <option value="JUNIOR_U20">Junior U20</option>
          </SelectInput>
        </Field>
        <Button type="button" onClick={() => clearFilters()}>
          Clear
        </Button>
      </FilterBar>

      {error ? <ErrorState description={error} /> : null}
      {loading ? <LoadingState label="Loading national teams…" /> : null}

      {!loading && data && data.items.length === 0 ? (
        <Panel title="No national teams yet">
          <p style={{ margin: 0, font: 'var(--text-body-sm)', color: 'var(--text-secondary)' }}>
            The minimal development fixture ships without national teams. A national team is created
            from an existing Country (SENIOR_MEN or JUNIOR_U20 category); after creation, open the
            team to prepare its F22 tournament roster.
          </p>
          <p style={{ margin: '12px 0 0', font: 'var(--text-body-sm)', color: 'var(--text-secondary)' }}>
            <strong>Available countries:</strong>{' '}
            {countries.length > 0
              ? countries.map((c) => c.name).join(', ')
              : 'none loaded (initialize the world or extend the dataset).'}
          </p>
          {commissioner.enabled ? (
            <p style={{ margin: '12px 0 0', font: 'var(--text-body-sm)', color: 'var(--text-secondary)' }}>
              Use the <strong>Create national team</strong> form below.
            </p>
          ) : (
            <p style={{ margin: '12px 0 0', font: 'var(--text-body-sm)', color: 'var(--text-tertiary)' }}>
              Enable Commissioner Mode (top bar) to reveal the create form.
            </p>
          )}
        </Panel>
      ) : null}

      {!loading && data && data.items.length > 0 ? (
        <Panel>
          <DataTable
            headers={[
              { key: 'name', label: 'Team' },
              { key: 'country', label: 'Country' },
              { key: 'category', label: 'Category' },
              { key: 'status', label: 'Status' },
            ]}
          >
            {data.items.map((row) => (
              <DataRow
                key={String(row.id)}
                onActivate={() => navigate(`/national-teams/${String(row.id)}`)}
              >
                <Td>
                  <Link to={`/national-teams/${String(row.id)}`}>{String(row.displayName)}</Link>
                </Td>
                <Td>{String((row.country as { name?: string } | undefined)?.name ?? '—')}</Td>
                <Td>
                  <Badge tone="neutral">{String(row.category).replace('_', ' ')}</Badge>
                </Td>
                <Td>{String(row.status)}</Td>
              </DataRow>
            ))}
          </DataTable>
          <Pagination
            page={data.page}
            totalPages={Math.ceil(data.total / data.pageSize) || 0}
            total={data.total}
            onPage={(page) => setMany({ page: String(page) }, false)}
          />
        </Panel>
      ) : null}

      {commissioner.enabled ? (
        <Panel title="Create national team">
          <div style={{ display: 'grid', gap: 8, maxWidth: 420 }}>
            <Field label="Country">
              <SelectInput value={countryId} onChange={(e) => setCountryId(e.target.value)}>
                <option value="">Select…</option>
                {countries.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </SelectInput>
            </Field>
            <Field label="Category">
              <SelectInput
                value={category}
                onChange={(e) => setCategory(e.target.value as 'SENIOR_MEN' | 'JUNIOR_U20')}
              >
                <option value="SENIOR_MEN">Senior Men</option>
                <option value="JUNIOR_U20">Junior U20</option>
              </SelectInput>
            </Field>
            <Field label="Display name">
              <TextInput value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
            </Field>
            <Field label="Reason">
              <TextInput value={reason} onChange={(e) => setReason(e.target.value)} />
            </Field>
            <Button type="button" disabled={busy} onClick={() => void onCreate()}>
              Create
            </Button>
          </div>
        </Panel>
      ) : null}
    </div>
  );
}
