import { prisma } from '../db/client.js';
import { mapCompetitionEdition } from '../mappers.js';

const editionInclude = {
  competition: { select: { id: true, name: true, type: true } },
  worldSeason: { select: { id: true, label: true } },
} as const;

export async function listCompetitionEditions() {
  const rows = await prisma.competitionEdition.findMany({
    orderBy: { displayName: 'asc' },
    include: editionInclude,
  });
  return rows.map(mapCompetitionEdition);
}

export async function getCompetitionEditionById(id: string) {
  const row = await prisma.competitionEdition.findUnique({
    where: { id },
    include: editionInclude,
  });
  return row ? mapCompetitionEdition(row) : null;
}
