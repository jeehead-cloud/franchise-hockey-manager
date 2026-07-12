import { prisma } from '../db/client.js';
import { mapPlayer } from '../mappers.js';

const playerInclude = {
  nationality: { select: { id: true, name: true, code: true } },
  currentTeam: { select: { id: true, name: true } },
} as const;

export async function listPlayers() {
  const rows = await prisma.player.findMany({
    orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
    include: playerInclude,
  });
  return rows.map(mapPlayer);
}

export async function getPlayerById(id: string) {
  const row = await prisma.player.findUnique({
    where: { id },
    include: playerInclude,
  });
  return row ? mapPlayer(row) : null;
}
