import type { GeneratedYouthCohort, GeneratedYouthPlayer, YouthGenerationRunResult } from '@fhm/engine';
import type { YouthGenerationRunStatus } from '@prisma/client';

export interface YouthRunSummaryDto {
  countryCount: number;
  enabledCountryCount: number;
  totalPlannedPlayers: number;
  totalGeneratedPlayers: number;
  age15Count: number;
  age16Count: number;
  age17Count: number;
  skaterCount: number;
  goalieCount: number;
  warningCount: number;
  duplicateNameCount: number;
  inputHash: string;
  resultHash: string;
}

export interface YouthRunDto {
  id: string;
  worldSeasonId: string;
  status: YouthGenerationRunStatus;
  runVersion: number;
  referenceDate: string;
  baseSeed: string;
  profileSetVersionId: string;
  profileSetHash: string;
  inputHash: string;
  resultHash: string | null;
  countryCount: number;
  enabledCountryCount: number;
  totalPlannedPlayers: number;
  totalGeneratedPlayers: number;
  warningCount: number;
  isCurrent: boolean;
  backupPath: string | null;
  failureReason: string | null;
  startedAt: string | null;
  completedAt: string | null;
  failedAt: string | null;
  cancelledAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface YouthCohortDto {
  id?: string;
  countryId: string;
  countryKey: string;
  countryName: string;
  cohortOrder: number;
  profileHash: string;
  namePoolVersionId: string;
  namePoolHash: string;
  plannedSize: number;
  generatedSize: number;
  age15Count: number;
  age16Count: number;
  age17Count: number;
  skaterCount: number;
  goalieCount: number;
  cohortHash: string;
  warnings: string[];
}

export interface YouthGeneratedPlayerDto {
  generationIndex: number;
  countryId: string;
  countryKey: string;
  firstName: string;
  lastName: string;
  displayName: string;
  dateOfBirth: string;
  ageOnReferenceDate: number;
  position: string;
  shoots: string;
  heightCm: number;
  weightKg: number;
  currentAbility: number;
  developmentRate: number;
  role: string;
  form: number;
  lifecycleStatus: string;
  sourceType: string;
  currentTeamId: null;
  generationHash: string;
  warnings: string[];
  playerId?: string;
}

export function mapRunSummary(summary: YouthGenerationRunResult['summary']): YouthRunSummaryDto {
  return {
    countryCount: summary.countryCount,
    enabledCountryCount: summary.enabledCountryCount,
    totalPlannedPlayers: summary.totalPlannedPlayers,
    totalGeneratedPlayers: summary.totalGeneratedPlayers,
    age15Count: summary.age15Count,
    age16Count: summary.age16Count,
    age17Count: summary.age17Count,
    skaterCount: summary.skaterCount,
    goalieCount: summary.goalieCount,
    warningCount: summary.warningCount,
    duplicateNameCount: summary.duplicateNameCount,
    inputHash: summary.inputHash,
    resultHash: summary.resultHash,
  };
}

export function mapRunRow(run: {
  id: string;
  worldSeasonId: string;
  status: YouthGenerationRunStatus;
  runVersion: number;
  referenceDate: string;
  baseSeed: string;
  profileSetVersionId: string;
  profileSetHash: string;
  inputHash: string;
  resultHash: string | null;
  countryCount: number;
  enabledCountryCount: number;
  totalPlannedPlayers: number;
  totalGeneratedPlayers: number;
  warningCount: number;
  isCurrent: boolean;
  backupPath: string | null;
  failureReason: string | null;
  startedAt: Date | null;
  completedAt: Date | null;
  failedAt: Date | null;
  cancelledAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}): YouthRunDto {
  return {
    id: run.id,
    worldSeasonId: run.worldSeasonId,
    status: run.status,
    runVersion: run.runVersion,
    referenceDate: run.referenceDate,
    baseSeed: run.baseSeed,
    profileSetVersionId: run.profileSetVersionId,
    profileSetHash: run.profileSetHash,
    inputHash: run.inputHash,
    resultHash: run.resultHash,
    countryCount: run.countryCount,
    enabledCountryCount: run.enabledCountryCount,
    totalPlannedPlayers: run.totalPlannedPlayers,
    totalGeneratedPlayers: run.totalGeneratedPlayers,
    warningCount: run.warningCount,
    isCurrent: run.isCurrent,
    backupPath: run.backupPath,
    failureReason: run.failureReason,
    startedAt: run.startedAt?.toISOString() ?? null,
    completedAt: run.completedAt?.toISOString() ?? null,
    failedAt: run.failedAt?.toISOString() ?? null,
    cancelledAt: run.cancelledAt?.toISOString() ?? null,
    createdAt: run.createdAt.toISOString(),
    updatedAt: run.updatedAt.toISOString(),
  };
}

export function mapCohortRow(
  cohort: GeneratedYouthCohort | (YouthCohortDto & { id: string }),
  opts?: { includeDiagnostics?: boolean },
): YouthCohortDto {
  const base: YouthCohortDto = {
    ...( 'id' in cohort && cohort.id ? { id: cohort.id } : {}),
    countryId: cohort.countryId,
    countryKey: cohort.countryKey,
    countryName: cohort.countryName,
    cohortOrder: cohort.cohortOrder,
    profileHash: cohort.profileHash,
    namePoolVersionId: cohort.namePoolVersionId,
    namePoolHash: cohort.namePoolHash,
    plannedSize: cohort.plannedSize,
    generatedSize: cohort.generatedSize,
    age15Count: cohort.age15Count,
    age16Count: cohort.age16Count,
    age17Count: cohort.age17Count,
    skaterCount: cohort.skaterCount,
    goalieCount: cohort.goalieCount,
    cohortHash: cohort.cohortHash,
    warnings: cohort.warnings,
  };
  void opts;
  return base;
}

export function mapGeneratedPlayer(
  player: GeneratedYouthPlayer,
  opts?: { includePotential?: boolean; includeQualityTier?: boolean; playerId?: string },
): YouthGeneratedPlayerDto {
  const dto: YouthGeneratedPlayerDto & {
    potentialFloor?: number;
    potentialCeiling?: number;
    qualityTier?: string;
  } = {
    generationIndex: player.generationIndex,
    countryId: player.countryId,
    countryKey: player.countryKey,
    firstName: player.firstName,
    lastName: player.lastName,
    displayName: player.displayName,
    dateOfBirth: player.dateOfBirth,
    ageOnReferenceDate: player.ageOnReferenceDate,
    position: player.position,
    shoots: player.shoots,
    heightCm: player.heightCm,
    weightKg: player.weightKg,
    currentAbility: player.currentAbility,
    developmentRate: player.developmentRate,
    role: player.role,
    form: player.form,
    lifecycleStatus: player.lifecycleStatus,
    sourceType: player.sourceType,
    currentTeamId: null,
    generationHash: player.generationHash,
    warnings: player.warnings,
    ...(opts?.playerId ? { playerId: opts.playerId } : {}),
  };
  if (opts?.includePotential) {
    dto.potentialFloor = player.potentialFloor;
    dto.potentialCeiling = player.potentialCeiling;
  }
  if (opts?.includeQualityTier) {
    dto.qualityTier = player.qualityTier;
  }
  return dto;
}

export function mapProvenanceRow(row: {
  id: string;
  youthGenerationRunId: string;
  youthCohortId: string;
  playerId: string;
  generationIndex: number;
  countryId: string;
  playerNameSnapshot: string;
  dateOfBirthSnapshot: string;
  ageOnReferenceDate: number;
  positionSnapshot: string;
  qualityTier: string;
  currentAbilitySnapshot: number;
  potentialSnapshot: number;
  developmentRateSnapshot: number;
  roleSnapshot: string;
  heightCmSnapshot: number | null;
  weightKgSnapshot: number | null;
  shootsSnapshot: string | null;
  generationHash: string;
  diagnosticsText: string | null;
  createdAt: Date;
  run?: {
    id: string;
    worldSeasonId: string;
    referenceDate: string;
    status: YouthGenerationRunStatus;
    profileSetVersionId: string;
    completedAt: Date | null;
  };
  cohort?: {
    id: string;
    countryNameSnapshot: string;
    profileHash: string;
    namePoolVersionId: string;
    cohortHash: string;
  };
}, opts?: { includePotential?: boolean; includeQualityTier?: boolean }) {
  const item = {
    id: row.id,
    runId: row.youthGenerationRunId,
    cohortId: row.youthCohortId,
    playerId: row.playerId,
    generationIndex: row.generationIndex,
    countryId: row.countryId,
    playerName: row.playerNameSnapshot,
    dateOfBirth: row.dateOfBirthSnapshot,
    ageOnReferenceDate: row.ageOnReferenceDate,
    position: row.positionSnapshot,
    currentAbility: row.currentAbilitySnapshot,
    developmentRate: row.developmentRateSnapshot,
    role: row.roleSnapshot,
    heightCm: row.heightCmSnapshot,
    weightKg: row.weightKgSnapshot,
    shoots: row.shootsSnapshot,
    generationHash: row.generationHash,
    diagnostics: row.diagnosticsText ? JSON.parse(row.diagnosticsText) : null,
    createdAt: row.createdAt.toISOString(),
    run: row.run
      ? {
          id: row.run.id,
          worldSeasonId: row.run.worldSeasonId,
          referenceDate: row.run.referenceDate,
          status: row.run.status,
          profileSetVersionId: row.run.profileSetVersionId,
          completedAt: row.run.completedAt?.toISOString() ?? null,
        }
      : undefined,
    cohort: row.cohort
      ? {
          id: row.cohort.id,
          countryName: row.cohort.countryNameSnapshot,
          profileHash: row.cohort.profileHash,
          namePoolVersionId: row.cohort.namePoolVersionId,
          cohortHash: row.cohort.cohortHash,
        }
      : undefined,
  };
  if (opts?.includePotential) {
    Object.assign(item, { potentialCeiling: row.potentialSnapshot });
  }
  if (opts?.includeQualityTier) {
    Object.assign(item, { qualityTier: row.qualityTier });
  }
  return item;
}
