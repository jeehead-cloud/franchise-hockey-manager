import Fastify from 'fastify';
import cors from '@fastify/cors';
import { registerTeamRoutes } from './routes/teams.js';

const PORT = Number(process.env.PORT ?? 3000);
const HOST = process.env.HOST ?? '0.0.0.0';

async function main() {
  const app = Fastify({ logger: true });

  await app.register(cors, {
    origin: true,
  });

  app.get('/api/health', async () => ({ ok: true }));

  await registerTeamRoutes(app);

  await app.listen({ port: PORT, host: HOST });
  console.log(`FHM server listening on http://localhost:${PORT}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
