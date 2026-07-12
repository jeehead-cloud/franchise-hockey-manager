import { prisma } from '../db/client.js';
import { mapCoach } from '../mappers.js';

const coachInclude = {
  nationality: { select: { id: true, name: true, code: true } },
  currentTeam: { select: { id: true, name: true } },
} as const;

export async function listCoaches() {
  const rows = await prisma.coach.findMany({
    orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
    include: coachInclude,
  });
  return rows.map(mapCoach);
}

export async function getCoachById(id: string) {
  const row = await prisma.coach.findUnique({
    where: { id },
    include: coachInclude,
  });
  return row ? mapCoach(row) : null;
}
