import type { FastifyInstance } from 'fastify';
import { detailResponse, listResponse, notFound } from '../http.js';

type ListFn = () => Promise<unknown[]>;
type GetFn = (id: string) => Promise<unknown | null>;

/** Thin list/detail route wiring — entity logic stays in services. */
export function registerListDetailRoutes(
  app: FastifyInstance,
  opts: {
    basePath: string;
    entityName: string;
    list: ListFn;
    getById: GetFn;
  },
) {
  const { basePath, entityName, list, getById } = opts;

  app.get(basePath, async (_request, reply) => {
    const items = await list();
    return reply.send(listResponse(items));
  });

  app.get<{ Params: { id: string } }>(`${basePath}/:id`, async (request, reply) => {
    const item = await getById(request.params.id);
    if (!item) {
      return reply.status(404).send(notFound(entityName));
    }
    return reply.send(detailResponse(item));
  });
}
