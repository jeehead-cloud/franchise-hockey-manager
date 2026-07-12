import { useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';

export function useListQueryState(defaults: {
  pageSize?: number;
  sort?: string;
  direction?: 'asc' | 'desc';
} = {}) {
  const [params, setParams] = useSearchParams();

  const state = useMemo(() => {
    const page = Math.max(1, Number(params.get('page') ?? '1') || 1);
    const pageSize = Math.min(
      100,
      Math.max(1, Number(params.get('pageSize') ?? String(defaults.pageSize ?? 25)) || 25),
    );
    return {
      search: params.get('search') ?? '',
      page,
      pageSize,
      sort: params.get('sort') ?? defaults.sort ?? '',
      direction: (params.get('direction') === 'desc' ? 'desc' : 'asc') as 'asc' | 'desc',
      get: (key: string) => params.get(key) ?? '',
    };
  }, [params, defaults.pageSize, defaults.sort]);

  const setMany = useCallback(
    (patch: Record<string, string | undefined>, resetPage = true) => {
      const next = new URLSearchParams(params);
      for (const [k, v] of Object.entries(patch)) {
        if (v === undefined || v === '') next.delete(k);
        else next.set(k, v);
      }
      if (resetPage && !('page' in patch)) next.set('page', '1');
      setParams(next, { replace: true });
    },
    [params, setParams],
  );

  const clearFilters = useCallback(() => {
    const next = new URLSearchParams();
    if (defaults.sort) next.set('sort', defaults.sort);
    if (defaults.direction) next.set('direction', defaults.direction);
    if (defaults.pageSize) next.set('pageSize', String(defaults.pageSize));
    setParams(next, { replace: true });
  }, [defaults.direction, defaults.pageSize, defaults.sort, setParams]);

  return { state, setMany, clearFilters, params };
}

export function playerLabel(p: { firstName: string; lastName: string }) {
  return `${p.firstName} ${p.lastName}`;
}
