import { generateBirthDate, pickAge } from './ages.js';
import {
  generateAbilityTarget,
  generateDevelopmentRate,
  generatePotentialCeiling,
  pickQualityTier,
} from './quality.js';
import { pickHandedness, pickPosition } from './positions.js';
import { generatePhysical } from './physical.js';
import {
  generateGoalieAttributes,
  generateProfileExtras,
  generateSkaterAttributes,
  reconcileAttributesToAbilityBand,
} from './attributes.js';
import { pickNamePair, validateAndNormalizeNamePool } from './names.js';
import {
  hashCountryYouthProfile,
  hashGeneratedYouthPlayer,
  hashYouthCohort,
  hashYouthGenerationInput,
  hashYouthGenerationResult,
  hashYouthNamePool,
} from './hashing.js';
import { seededUnit } from './distributions.js';
import type {
  GeneratedYouthCohort,
  GeneratedYouthPlayer,
  YouthGenerationCountryInput,
  YouthGenerationRunResult,
} from './types.js';
import { YouthGenerationError } from './types.js';

export function planCohortSize(input: {
  profile: YouthGenerationCountryInput['profile'];
  baseSeed: string;
  countryKey: string;
}): number {
  const { baseSize, sizeVariance, minimumSize, maximumSize } = input.profile.cohort;
  const delta =
    (seededUnit(`${input.baseSeed}:country:${input.countryKey}:size`) * 2 - 1) *
    sizeVariance *
    baseSize;
  const size = Math.round(baseSize + delta);
  return Math.max(minimumSize, Math.min(maximumSize, size));
}

export function generateYouthPlayer(input: {
  country: YouthGenerationCountryInput;
  generationIndex: number;
  referenceDate: string;
  baseSeed: string;
  usedDisplayNames: Set<string>;
}): GeneratedYouthPlayer {
  const { country, generationIndex, referenceDate, baseSeed } = input;
  const profile = country.profile;
  const warnings: string[] = [];

  const pool = validateAndNormalizeNamePool(country.namePool);
  const name = pickNamePair({
    pool,
    baseSeed,
    countryKey: country.countryKey,
    generationIndex,
    usedDisplayNames: input.usedDisplayNames,
  });
  if (name.duplicateAllowed) warnings.push('duplicate_display_name');

  const age = pickAge({
    ages: profile.ages,
    baseSeed,
    countryKey: country.countryKey,
    generationIndex,
  });
  const dateOfBirth = generateBirthDate({
    age,
    referenceDate,
    baseSeed,
    countryKey: country.countryKey,
    generationIndex,
  });
  const position = pickPosition({
    positions: profile.positions,
    baseSeed,
    countryKey: country.countryKey,
    generationIndex,
  });
  const shoots = pickHandedness({
    handedness: profile.handedness,
    baseSeed,
    countryKey: country.countryKey,
    generationIndex,
  });
  const physical = generatePhysical({
    profile,
    position,
    baseSeed,
    countryKey: country.countryKey,
    generationIndex,
  });
  const qualityTier = pickQualityTier({
    profile,
    baseSeed,
    countryKey: country.countryKey,
    generationIndex,
  });
  const potentialCeiling = generatePotentialCeiling({
    profile,
    tier: qualityTier,
    baseSeed,
    countryKey: country.countryKey,
    generationIndex,
  });
  const abilityTarget = generateAbilityTarget({
    profile,
    tier: qualityTier,
    age,
    baseSeed,
    countryKey: country.countryKey,
    generationIndex,
  });
  const developmentRate = generateDevelopmentRate({
    profile,
    tier: qualityTier,
    age,
    baseSeed,
    countryKey: country.countryKey,
    generationIndex,
  });

  const playerType = position === 'G' ? 'GOALIE' : 'SKATER';
  const rawAttrs =
    playerType === 'GOALIE'
      ? generateGoalieAttributes({
          profile,
          abilityTarget,
          baseSeed,
          countryKey: country.countryKey,
          generationIndex,
        })
      : generateSkaterAttributes({
          profile,
          position: position as Exclude<typeof position, 'G'>,
          abilityTarget,
          baseSeed,
          countryKey: country.countryKey,
          generationIndex,
        });

  // Soft CA band from attribute target (~ attr*5 maps roughly onto 0–100).
  const softMid = Math.round(((abilityTarget - 1) / 19) * 100);
  const softMin = Math.max(5, softMid - 12);
  const softMax = Math.min(potentialCeiling, softMid + 12);

  const reconciled = reconcileAttributesToAbilityBand({
    playerType,
    position,
    attributes: rawAttrs,
    softMinAbility: softMin,
    softMaxAbility: softMax,
    potentialCeiling,
  });

  const extras = generateProfileExtras({
    baseSeed,
    countryKey: country.countryKey,
    generationIndex,
    potentialCeiling,
  });

  if (reconciled.currentAbility > potentialCeiling) {
    warnings.push('ability_near_potential');
  }

  const partial: Omit<GeneratedYouthPlayer, 'generationHash'> = {
    generationIndex,
    countryKey: country.countryKey,
    countryId: country.countryId,
    firstName: name.firstName,
    lastName: name.lastName,
    displayName: name.displayName,
    dateOfBirth,
    ageOnReferenceDate: age,
    primaryNationalityCountryId: country.countryId,
    position,
    shoots,
    heightCm: physical.heightCm,
    weightKg: physical.weightKg,
    qualityTier,
    attributes: reconciled.attributes,
    currentAbility: reconciled.currentAbility,
    potentialFloor: Math.min(extras.potentialFloor, potentialCeiling),
    potentialCeiling,
    developmentRate,
    developmentRisk: extras.developmentRisk,
    heroRating: extras.heroRating,
    stability: extras.stability,
    preferredCoachingStyle: extras.preferredCoachingStyle,
    preferredTactics: extras.preferredTactics,
    personality: extras.personality,
    publicPotentialEstimate: extras.publicPotentialEstimate,
    role: reconciled.role,
    form: extras.form,
    lifecycleStatus: 'PROSPECT',
    sourceType: 'GENERATED_YOUTH',
    currentTeamId: null,
    warnings,
  };

  const player: GeneratedYouthPlayer = { ...partial, generationHash: '' };
  player.generationHash = hashGeneratedYouthPlayer(player);
  return player;
}

export function generateYouthCohort(input: {
  country: YouthGenerationCountryInput;
  cohortOrder: number;
  referenceDate: string;
  baseSeed: string;
  usedDisplayNames: Set<string>;
  startIndex: number;
}): GeneratedYouthCohort {
  if (!input.country.profile.enabled) {
    throw new YouthGenerationError(
      'InvalidYouthProfile',
      `Country ${input.country.countryKey} profile is disabled`,
    );
  }
  const plannedSize = planCohortSize({
    profile: input.country.profile,
    baseSeed: input.baseSeed,
    countryKey: input.country.countryKey,
  });
  const players: GeneratedYouthPlayer[] = [];
  const warnings: string[] = [];
  if (input.country.namePool.firstNames.length < 20) warnings.push('small_first_name_pool');
  if (input.country.namePool.lastNames.length < 30) warnings.push('small_last_name_pool');

  for (let i = 0; i < plannedSize; i += 1) {
    players.push(
      generateYouthPlayer({
        country: input.country,
        generationIndex: input.startIndex + i,
        referenceDate: input.referenceDate,
        baseSeed: input.baseSeed,
        usedDisplayNames: input.usedDisplayNames,
      }),
    );
  }

  let age15Count = 0;
  let age16Count = 0;
  let age17Count = 0;
  let skaterCount = 0;
  let goalieCount = 0;
  for (const p of players) {
    if (p.ageOnReferenceDate === 15) age15Count += 1;
    else if (p.ageOnReferenceDate === 16) age16Count += 1;
    else age17Count += 1;
    if (p.position === 'G') goalieCount += 1;
    else skaterCount += 1;
    warnings.push(...p.warnings);
  }

  const cohortBase: Omit<GeneratedYouthCohort, 'cohortHash'> = {
    countryKey: input.country.countryKey,
    countryId: input.country.countryId,
    countryName: input.country.countryName,
    cohortOrder: input.cohortOrder,
    profileHash: input.country.profileHash || hashCountryYouthProfile(input.country.profile),
    namePoolVersionId: input.country.namePoolVersionId,
    namePoolHash: input.country.namePoolHash || hashYouthNamePool(input.country.namePool),
    plannedSize,
    generatedSize: players.length,
    age15Count,
    age16Count,
    age17Count,
    skaterCount,
    goalieCount,
    players,
    warnings: [...new Set(warnings)],
  };
  return { ...cohortBase, cohortHash: hashYouthCohort(cohortBase) };
}

export function generateYouthRun(input: {
  worldSeasonId: string;
  referenceDate: string;
  baseSeed: string;
  profileSetHash: string;
  countries: YouthGenerationCountryInput[];
}): YouthGenerationRunResult {
  const enabled = input.countries
    .filter((c) => c.profile.enabled)
    .sort((a, b) => a.countryKey.localeCompare(b.countryKey));

  if (enabled.length === 0) {
    throw new YouthGenerationError('YouthGenerationNotReady', 'No enabled country profiles');
  }

  const usedDisplayNames = new Set<string>();
  const cohorts: GeneratedYouthCohort[] = [];
  let nextIndex = 0;
  for (let order = 0; order < enabled.length; order += 1) {
    const country = enabled[order]!;
    const cohort = generateYouthCohort({
      country,
      cohortOrder: order,
      referenceDate: input.referenceDate,
      baseSeed: input.baseSeed,
      usedDisplayNames,
      startIndex: nextIndex,
    });
    nextIndex += cohort.generatedSize;
    cohorts.push(cohort);
  }

  const players = cohorts.flatMap((c) => c.players);
  const inputHash = hashYouthGenerationInput({
    worldSeasonId: input.worldSeasonId,
    referenceDate: input.referenceDate,
    baseSeed: input.baseSeed,
    profileSetHash: input.profileSetHash,
    countryProfileHashes: enabled.map(
      (c) => c.profileHash || hashCountryYouthProfile(c.profile),
    ),
    namePoolHashes: enabled.map((c) => c.namePoolHash || hashYouthNamePool(c.namePool)),
  });
  const resultHash = hashYouthGenerationResult({
    inputHash,
    cohortHashes: cohorts.map((c) => c.cohortHash),
    playerHashes: players.map((p) => p.generationHash),
  });

  let age15Count = 0;
  let age16Count = 0;
  let age17Count = 0;
  let skaterCount = 0;
  let goalieCount = 0;
  let warningCount = 0;
  const nameCounts = new Map<string, number>();
  for (const p of players) {
    if (p.ageOnReferenceDate === 15) age15Count += 1;
    else if (p.ageOnReferenceDate === 16) age16Count += 1;
    else age17Count += 1;
    if (p.position === 'G') goalieCount += 1;
    else skaterCount += 1;
    warningCount += p.warnings.length;
    const k = p.displayName.toLocaleLowerCase('en');
    nameCounts.set(k, (nameCounts.get(k) ?? 0) + 1);
  }
  let duplicateNameCount = 0;
  for (const n of nameCounts.values()) {
    if (n > 1) duplicateNameCount += n - 1;
  }

  return {
    cohorts,
    players,
    summary: {
      countryCount: input.countries.length,
      enabledCountryCount: enabled.length,
      totalPlannedPlayers: players.length,
      totalGeneratedPlayers: players.length,
      age15Count,
      age16Count,
      age17Count,
      skaterCount,
      goalieCount,
      warningCount,
      duplicateNameCount,
      inputHash,
      resultHash,
    },
  };
}
