import { prisma } from '../db/client.js';
import { mapCompetition } from '../mappers.js';

export async function listCompetitions() {
  const rows = await prisma.competition.findMany({ orderBy: { name: 'asc' } });
  return rows.map(mapCompetition);
}

export async function getCompetitionById(id: string) {
  const row = await prisma.competition.findUnique({ where: { id } });
  return row ? mapCompetition(row) : null;
}
