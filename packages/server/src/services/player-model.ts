import { derivePlayerModel, type DerivedPlayerModel } from '@fhm/engine';

type AttrRow = Record<string, number> | null | undefined;

export type PlayerModelRow = {
  primaryPosition: string;
  preferredCoachingStyle: string | null;
  preferredTactics: string | null;
  personality: string | null;
  heroRating: number | null;
  stability: number | null;
  developmentRate: number | null;
  developmentRisk: number | null;
  potentialFloor: number | null;
  potentialCeiling: number | null;
  publicPotentialEstimate: string | null;
  skaterAttributes?: AttrRow;
  goalieAttributes?: AttrRow;
};

function hasCompleteProfile(row: PlayerModelRow): boolean {
  return Boolean(
    row.preferredCoachingStyle &&
      row.preferredTactics &&
      row.personality &&
      row.heroRating != null &&
      row.stability != null &&
      row.developmentRate != null &&
      row.developmentRisk != null &&
      row.potentialFloor != null &&
      row.potentialCeiling != null &&
      row.publicPotentialEstimate,
  );
}

export function resolveModelStatus(row: PlayerModelRow): 'COMPLETE' | 'INCOMPLETE' {
  if (!hasCompleteProfile(row)) return 'INCOMPLETE';
  if (row.primaryPosition === 'G') {
    return row.goalieAttributes && !row.skaterAttributes ? 'COMPLETE' : 'INCOMPLETE';
  }
  return row.skaterAttributes && !row.goalieAttributes ? 'COMPLETE' : 'INCOMPLETE';
}

export function derivePublicPlayerModel(row: PlayerModelRow): DerivedPlayerModel | null {
  if (resolveModelStatus(row) !== 'COMPLETE') return null;
  try {
    if (row.primaryPosition === 'G') {
      return derivePlayerModel({
        primaryPosition: 'G',
        goalieAttributes: row.goalieAttributes as never,
        preferredCoachingStyle: row.preferredCoachingStyle as never,
        preferredTactics: row.preferredTactics as never,
        personality: row.personality as never,
        heroRating: row.heroRating!,
        stability: row.stability!,
        developmentRate: row.developmentRate!,
        developmentRisk: row.developmentRisk!,
        potentialFloor: row.potentialFloor!,
        potentialCeiling: row.potentialCeiling!,
        publicPotentialEstimate: row.publicPotentialEstimate as never,
      });
    }
    return derivePlayerModel({
      primaryPosition: row.primaryPosition as 'LW' | 'RW' | 'C' | 'LD' | 'RD',
      skaterAttributes: row.skaterAttributes as never,
      preferredCoachingStyle: row.preferredCoachingStyle as never,
      preferredTactics: row.preferredTactics as never,
      personality: row.personality as never,
      heroRating: row.heroRating!,
      stability: row.stability!,
      developmentRate: row.developmentRate!,
      developmentRisk: row.developmentRisk!,
      potentialFloor: row.potentialFloor!,
      potentialCeiling: row.potentialCeiling!,
      publicPotentialEstimate: row.publicPotentialEstimate as never,
    });
  } catch {
    return null;
  }
}

/** Compact public fields for lists / roster previews. Never includes hidden potential. */
export function compactPlayerModelFields(row: PlayerModelRow) {
  const status = resolveModelStatus(row);
  const derived = status === 'COMPLETE' ? derivePublicPlayerModel(row) : null;
  return {
    modelStatus: status,
    currentAbility: derived?.ratings.currentAbility ?? null,
    role: derived?.role.role ?? null,
    roleLabel: derived?.role.roleLabel ?? null,
    roleRating: derived?.ratings.roleRating ?? null,
    publicPotentialEstimate: row.publicPotentialEstimate ?? 'UNKNOWN',
  };
}

/** Full public model payload for player detail. Hidden floor/ceiling/risk omitted. */
export function publicPlayerModelDetail(row: PlayerModelRow) {
  const status = resolveModelStatus(row);
  const derived = status === 'COMPLETE' ? derivePublicPlayerModel(row) : null;
  if (!derived) {
    return {
      modelStatus: 'INCOMPLETE' as const,
      message:
        'Player model incomplete. Reimport or backfill with F5 schemaVersion 2 player-model data.',
    };
  }

  if (derived.kind === 'skater') {
    return {
      modelStatus: 'COMPLETE' as const,
      kind: 'skater' as const,
      attributes: derived.attributes,
      currentAbility: derived.ratings.currentAbility,
      offensiveRating: derived.ratings.offensiveRating,
      defensiveRating: derived.ratings.defensiveRating,
      role: derived.role.role,
      roleLabel: derived.role.roleLabel,
      roleRating: derived.ratings.roleRating,
      roleExplanation: derived.role.explanation,
      winningPair: derived.role.winningPair,
      preferredCoachingStyle: derived.preferredCoachingStyle,
      preferredTactics: derived.preferredTactics,
      personality: derived.personality,
      heroRating: derived.heroRating,
      stability: derived.stability,
      developmentRate: derived.developmentRate,
      publicPotentialEstimate: derived.publicPotentialEstimate,
    };
  }

  return {
    modelStatus: 'COMPLETE' as const,
    kind: 'goalie' as const,
    attributes: derived.attributes,
    currentAbility: derived.ratings.currentAbility,
    role: derived.role.role,
    roleLabel: derived.role.roleLabel,
    roleRating: derived.ratings.roleRating,
    roleExplanation: derived.role.explanation,
    preferredCoachingStyle: derived.preferredCoachingStyle,
    preferredTactics: derived.preferredTactics,
    personality: derived.personality,
    heroRating: derived.heroRating,
    stability: derived.stability,
    developmentRate: derived.developmentRate,
    publicPotentialEstimate: derived.publicPotentialEstimate,
  };
}
