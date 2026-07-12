import { prisma } from '../db/client.js';
import { mapTeam } from '../mappers.js';

const teamInclude = {
  country: { select: { id: true, name: true, code: true } },
  league: { select: { id: true, name: true, shortName: true } },
  coach: { select: { id: true, firstName: true, lastName: true } },
} as const;

export async function listTeams() {
  const rows = await prisma.team.findMany({
    orderBy: { name: 'asc' },
    include: teamInclude,
  });
  return rows.map(mapTeam);
}

export async function getTeamById(id: string) {
  const row = await prisma.team.findUnique({
    where: { id },
    include: teamInclude,
  });
  return row ? mapTeam(row) : null;
}
