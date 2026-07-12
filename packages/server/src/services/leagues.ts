import { prisma } from '../db/client.js';
import { mapLeague } from '../mappers.js';

export async function listLeagues() {
  const rows = await prisma.league.findMany({
    orderBy: { name: 'asc' },
    include: { country: { select: { id: true, name: true, code: true } } },
  });
  return rows.map(mapLeague);
}

export async function getLeagueById(id: string) {
  const row = await prisma.league.findUnique({
    where: { id },
    include: { country: { select: { id: true, name: true, code: true } } },
  });
  return row ? mapLeague(row) : null;
}
