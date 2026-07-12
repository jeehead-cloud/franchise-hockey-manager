import { prisma } from '../db/client.js';
import { mapWorldSeason } from '../mappers.js';

export async function listWorldSeasons() {
  const rows = await prisma.worldSeason.findMany({ orderBy: { startYear: 'desc' } });
  return rows.map(mapWorldSeason);
}

export async function getWorldSeasonById(id: string) {
  const row = await prisma.worldSeason.findUnique({ where: { id } });
  return row ? mapWorldSeason(row) : null;
}
