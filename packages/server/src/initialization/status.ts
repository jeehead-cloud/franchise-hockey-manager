import type { PrismaClient } from '@prisma/client';
import type { DomainCounts } from './types.js';

export async function getDomainCounts(prisma: PrismaClient): Promise<DomainCounts> {
  const [
    worldSeasons,
    countries,
    leagues,
    teams,
    players,
    coaches,
    competitions,
    competitionEditions,
  ] = await Promise.all([
    prisma.worldSeason.count(),
    prisma.country.count(),
    prisma.league.count(),
    prisma.team.count(),
    prisma.player.count(),
    prisma.coach.count(),
    prisma.competition.count(),
    prisma.competitionEdition.count(),
  ]);

  return {
    worldSeasons,
    countries,
    leagues,
    teams,
    players,
    coaches,
    competitions,
    competitionEditions,
  };
}

export function hasDomainData(counts: DomainCounts): boolean {
  return (
    counts.worldSeasons > 0 ||
    counts.countries > 0 ||
    counts.leagues > 0 ||
    counts.teams > 0 ||
    counts.players > 0 ||
    counts.coaches > 0 ||
    counts.competitions > 0 ||
    counts.competitionEditions > 0
  );
}

export async function getInitializationMeta(prisma: PrismaClient) {
  const meta = await prisma.appMeta.findUnique({ where: { id: 'default' } });
  return {
    worldInitialized: meta?.worldInitialized ?? false,
    worldDatasetId: meta?.worldDatasetId ?? null,
    worldInitializedAt: meta?.worldInitializedAt ?? null,
    worldSchemaVersion: meta?.worldSchemaVersion ?? null,
  };
}

/**
 * Initialization is allowed only when AppMeta does not mark the world initialized
 * and no foundational domain records exist. AppMeta-only F1 rows do not block.
 */
export async function assessEmptyWorld(prisma: PrismaClient): Promise<{
  initialized: boolean;
  canInitialize: boolean;
  blockReason: string | null;
  counts: DomainCounts;
  meta: Awaited<ReturnType<typeof getInitializationMeta>>;
}> {
  const meta = await getInitializationMeta(prisma);
  const counts = await getDomainCounts(prisma);
  const domainPresent = hasDomainData(counts);

  if (meta.worldInitialized) {
    return {
      initialized: true,
      canInitialize: false,
      blockReason: 'World already initialized',
      counts,
      meta,
    };
  }

  if (domainPresent) {
    return {
      initialized: false,
      canInitialize: false,
      blockReason: 'Database already contains world domain records',
      counts,
      meta,
    };
  }

  return {
    initialized: false,
    canInitialize: true,
    blockReason: null,
    counts,
    meta,
  };
}
