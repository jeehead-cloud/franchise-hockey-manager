import { sortJsonValue } from '../balance/canonicalize.js';
import { stableDigest } from '../simulation/batch/hash.js';
import { canonicalizeCountryYouthProfile } from './config.js';
import type {
  CountryYouthProfile,
  GeneratedYouthCohort,
  GeneratedYouthPlayer,
  NamePoolInput,
} from './types.js';
import { hashNamePool, type NormalizedNamePool } from './names.js';

export function hashCountryYouthProfile(profile: CountryYouthProfile): string {
  return stableDigest(canonicalizeCountryYouthProfile(profile));
}

export function hashYouthNamePool(pool: NormalizedNamePool | NamePoolInput): string {
  return hashNamePool({
    firstNames: pool.firstNames,
    lastNames: pool.lastNames,
  });
}

export function hashGeneratedYouthPlayer(player: GeneratedYouthPlayer): string {
  return stableDigest(
    JSON.stringify(
      sortJsonValue({
        generationIndex: player.generationIndex,
        countryKey: player.countryKey,
        firstName: player.firstName,
        lastName: player.lastName,
        dateOfBirth: player.dateOfBirth,
        ageOnReferenceDate: player.ageOnReferenceDate,
        position: player.position,
        shoots: player.shoots,
        heightCm: player.heightCm,
        weightKg: player.weightKg,
        qualityTier: player.qualityTier,
        attributes: player.attributes,
        currentAbility: player.currentAbility,
        potentialFloor: player.potentialFloor,
        potentialCeiling: player.potentialCeiling,
        developmentRate: player.developmentRate,
        role: player.role,
        form: player.form,
        lifecycleStatus: player.lifecycleStatus,
        sourceType: player.sourceType,
        currentTeamId: player.currentTeamId,
      }),
    ),
  );
}

export function hashYouthCohort(cohort: Omit<GeneratedYouthCohort, 'cohortHash'> & { cohortHash?: string }): string {
  return stableDigest(
    JSON.stringify(
      sortJsonValue({
        countryKey: cohort.countryKey,
        cohortOrder: cohort.cohortOrder,
        profileHash: cohort.profileHash,
        namePoolHash: cohort.namePoolHash,
        plannedSize: cohort.plannedSize,
        generatedSize: cohort.generatedSize,
        age15Count: cohort.age15Count,
        age16Count: cohort.age16Count,
        age17Count: cohort.age17Count,
        skaterCount: cohort.skaterCount,
        goalieCount: cohort.goalieCount,
        playerHashes: cohort.players.map((p) => p.generationHash).sort(),
      }),
    ),
  );
}

export function hashYouthGenerationInput(input: {
  worldSeasonId: string;
  referenceDate: string;
  baseSeed: string;
  profileSetHash: string;
  countryProfileHashes: string[];
  namePoolHashes: string[];
}): string {
  return stableDigest(
    JSON.stringify({
      worldSeasonId: input.worldSeasonId,
      referenceDate: input.referenceDate,
      baseSeed: input.baseSeed,
      profileSetHash: input.profileSetHash,
      countryProfileHashes: [...input.countryProfileHashes].sort(),
      namePoolHashes: [...input.namePoolHashes].sort(),
    }),
  );
}

export function hashYouthGenerationResult(input: {
  inputHash: string;
  cohortHashes: string[];
  playerHashes: string[];
}): string {
  return stableDigest(
    JSON.stringify({
      inputHash: input.inputHash,
      cohortHashes: [...input.cohortHashes].sort(),
      playerHashes: [...input.playerHashes].sort(),
    }),
  );
}
