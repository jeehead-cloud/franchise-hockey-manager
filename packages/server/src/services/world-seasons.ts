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

/** The current (ACTIVE) WorldSeason. Falls back to the latest by order. F31 uses
 *  `status = ACTIVE` as the single source of truth for "current" — no competing
 *  isCurrent boolean. */
export async function getCurrentWorldSeason() {
  const active = await prisma.worldSeason.findFirst({ where: { status: 'ACTIVE' }, orderBy: { startYear: 'desc' } });
  if (active) return mapWorldSeason(active);
  const latest = await prisma.worldSeason.findFirst({ orderBy: { startYear: 'desc' } });
  return latest ? mapWorldSeason(latest) : null;
}

/** Readiness summary for a single WorldSeason — used by /seasons/:id/readiness
 *  to surface transition eligibility (completed OffseasonRun, archived
 *  competitions, ownership integrity) without exposing Player truth. */
export async function getWorldSeasonReadiness(id: string) {
  const season = await prisma.worldSeason.findUnique({ where: { id } });
  if (!season) return null;
  const [completedOffseason, activeEditions, completedUnarchived, archived] = await Promise.all([
    prisma.offseasonRun.findFirst({ where: { worldSeasonId: id, status: 'COMPLETED' }, select: { id: true, completedAt: true } }),
    prisma.competitionEdition.count({ where: { worldSeasonId: id, status: { in: ['ACTIVE', 'PREPARING', 'READY'] } } }),
    prisma.competitionEdition.count({ where: { worldSeasonId: id, status: 'COMPLETED' } }),
    prisma.competitionArchive.count({ where: { worldSeasonId: id, isCurrent: true } }),
  ]);
  const transitionEligible = completedOffseason !== null && activeEditions === 0 && completedUnarchived === 0;
  return {
    worldSeasonId: id,
    label: season.label,
    status: season.status,
    completedOffseasonRun: completedOffseason ? { id: completedOffseason.id, completedAt: completedOffseason.completedAt } : null,
    activeCompetitionEditions: activeEditions,
    completedButUnarchived: Math.max(0, completedUnarchived - archived),
    transitionEligible,
    transitionEligibleReason: !completedOffseason
      ? 'No completed OffseasonRun'
      : activeEditions > 0
        ? 'Active competition editions remain'
        : completedUnarchived > 0
          ? 'Completed editions not archived'
          : 'Ready for F31 season transition',
  };
}
