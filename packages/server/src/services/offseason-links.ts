import type { PrismaClient } from '@prisma/client';
import { prisma } from '../db/client.js';

type Db = PrismaClient | Parameters<Parameters<PrismaClient['$transaction']>[0]>[0];

/**
 * F30 underlying-operation detection.
 *
 * These helpers find already-completed underlying subsystem runs for a
 * WorldSeason so the corresponding offseason phase can link to them instead of
 * re-running them. They never invoke the subsystems' write APIs — they only
 * read existing authoritative rows. Repeated calls are idempotent.
 */

export async function findCompletedDevelopmentRun(worldSeasonId: string, db: Db = prisma) {
  return db.playerDevelopmentRun.findFirst({
    where: { worldSeasonId, status: 'COMPLETED', isCurrent: true },
    orderBy: { completedAt: 'desc' },
    select: { id: true, resultHash: true, completedAt: true, runVersion: true, totalPlayers: true, developedCount: true, declinedCount: true, retiredCount: true },
  });
}

export async function findCompletedYouthGenerationRun(worldSeasonId: string, db: Db = prisma) {
  return db.youthGenerationRun.findFirst({
    where: { worldSeasonId, status: 'COMPLETED', isCurrent: true },
    orderBy: { completedAt: 'desc' },
    select: { id: true, resultHash: true, completedAt: true, runVersion: true },
  });
}

export async function findCompletedDraftEvent(worldSeasonId: string, db: Db = prisma) {
  return db.draftEvent.findFirst({
    where: { worldSeasonId, status: 'COMPLETED' },
    orderBy: { completedAt: 'desc' },
    select: { id: true, resultHash: true, completedAt: true, name: true },
  });
}

export async function findCompletedContractExpirationRun(worldSeasonId: string, db: Db = prisma) {
  return db.contractExpirationRun.findFirst({
    where: { worldSeasonId, status: 'COMPLETED' },
    orderBy: { completedAt: 'desc' },
    select: { id: true, resultHash: true, completedAt: true, effectiveSeasonOrder: true, totalContracts: true, expiredCount: true, activatedFutureCount: true, freeAgentCount: true },
  });
}

export async function findArchivedEditions(worldSeasonId: string, db: Db = prisma) {
  const editions = await db.competitionEdition.findMany({
    where: { worldSeasonId, status: 'ARCHIVED' },
    select: {
      id: true,
      displayName: true,
      archivedAt: true,
      archives: { where: { isCurrent: true }, select: { id: true, archiveHash: true, archiveSchemaVersion: true } },
    },
  });
  return editions.flatMap((e) => e.archives.map((a) => ({ editionId: e.id, editionName: e.displayName, archiveId: a.id, archiveHash: a.archiveHash, archivedAt: e.archivedAt })));
}

/**
 * Count the WorldSeasons strictly after the given season by startYear. Used by
 * the no-next-season warning at completion time — F30 must NOT create the next
 * WorldSeason (F31 does).
 */
export async function findNextWorldSeason(worldSeasonId: string, db: Db = prisma) {
  const season = await db.worldSeason.findUnique({ where: { id: worldSeasonId }, select: { startYear: true } });
  if (!season) return null;
  return db.worldSeason.findFirst({
    where: { startYear: { gt: season.startYear } },
    orderBy: { startYear: 'asc' },
    select: { id: true, label: true, startYear: true, status: true },
  });
}
