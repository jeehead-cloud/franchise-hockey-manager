/** Shared list/detail envelopes for read APIs. */

export function listResponse<T>(items: T[]) {
  return { items };
}

export function paginatedResponse<T>(opts: {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
}) {
  const totalPages = opts.total === 0 ? 0 : Math.ceil(opts.total / opts.pageSize);
  return {
    items: opts.items,
    page: opts.page,
    pageSize: opts.pageSize,
    total: opts.total,
    totalPages,
  };
}

export function detailResponse<T>(item: T) {
  return { item };
}

export function notFound(entity: string) {
  return {
    error: 'NotFound',
    message: `${entity} not found`,
  };
}

export function badRequest(message: string, details?: unknown) {
  return {
    error: 'BadRequest',
    message,
    details,
  };
}
