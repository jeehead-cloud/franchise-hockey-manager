/** Shared list/detail envelope for F2 read APIs. */

export function listResponse<T>(items: T[]) {
  return { items };
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
