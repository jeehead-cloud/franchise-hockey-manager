import {
  assertYouthReconciliation,
  evaluateYouthGenerationReadiness,
  generateYouthRun,
  YouthGenerationError,
  type GeneratedYouthPlayer,
  type YouthGenerationCountryInput,
  type YouthGenerationRunResult,
} from '@fhm/engine';
import type { CommissionerAuditSource, Prisma } from '@prisma/client';
import { prisma } from '../db/client.js';
import { createSqliteSafetyBackup } from './sqlite-backup.js';
import {
  getActiveYouthSnapshot,
  getYouthProfileSetVersion,
  loadCountryInputsFromVersion,
} from './youth-generation-config.js';
import {
  mapCohortRow,
  mapGeneratedPlayer,
  mapProvenanceRow,
  mapRunRow,
  mapRunSummary,
} from './youth-generation-dto.js';

export class YouthGenerationHttpError extends Error {
  statusCode: number;
  code: string;
  details?: unknown;
  constructor(statusCode: number, code: string, message: string, details?: unknown) {
    super(message);
    this.name = code;
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
  }
}

function wrapEngineError(err: unknown): never {
  if (err instanceof YouthGenerationHttpError) throw err;
  if (err instanceof YouthGenerationError) {
    const status =
      err.code === 'InvalidYouthProfile' ||
      err.code === 'InvalidNamePool' ||
      err.code === 'InvalidGeneratedPlayer' ||
      err.code === 'YouthGenerationReconciliationFailed' ||
      err.code === 'YouthGenerationNotReady'
        ? 422
        : 500;
    throw new YouthGenerationHttpError(status, err.code, err.message, err.details);
  }
  throw err;
}

interface PlannedInputSnapshot {
  worldSeasonId: string;
  referenceDate: string;
  baseSeed: string;
  profileSetVersionId: string;
  profileSetHash: string;
  countries: YouthGenerationCountryInput[];
  previewResultHash: string;
}

function parsePlannedInput(text: string): PlannedInputSnapshot {
  return JSON.parse(text) as PlannedInputSnapshot;
}

function birthDateFromIso(iso: string): Date {
  return new Date(`${iso}T00:00:00.000Z`);
}

async function writeYouthAudit(
  tx: Prisma.TransactionClient,
  entityId: string,
  action:
    | 'YOUTH_GENERATION_PREPARED'
    | 'YOUTH_GENERATION_CANCELLED'
    | 'YOUTH_GENERATION_STARTED'
    | 'YOUTH_GENERATION_COMPLETED'
    | 'YOUTH_GENERATION_FAILED',
  reason: string,
  before: unknown,
  after: unknown,
  changedFields: string[],
  source: CommissionerAuditSource,
) {
  await tx.commissionerAuditLog.create({
    data: {
      entityType: 'YOUTH_GENERATION_RUN',
      entityId,
      action,
      reason,
      beforeJson: JSON.stringify(before),
      afterJson: JSON.stringify(after),
      changedFieldsJson: JSON.stringify(changedFields),
      source,
      schemaVersion: 1,
    },
  });
}

async function assertNoCompletedRun(worldSeasonId: string) {
  const completed = await prisma.youthGenerationRun.findFirst({
    where: { worldSeasonId, status: 'COMPLETED', isCurrent: true },
  });
  if (completed) {
    throw new YouthGenerationHttpError(
      409,
      'YouthGenerationAlreadyApplied',
      'Official youth generation already applied for this WorldSeason',
      { runId: completed.id },
    );
  }
}

async function assertNoActiveRun(worldSeasonId: string) {
  const active = await prisma.youthGenerationRun.findFirst({
    where: {
      worldSeasonId,
      status: { in: ['PREPARED', 'RUNNING'] },
    },
  });
  if (active) {
    throw new YouthGenerationHttpError(
      409,
      active.status === 'RUNNING' ? 'YouthGenerationRunning' : 'YouthGenerationAlreadyPrepared',
      `A ${active.status} youth generation run already exists for this WorldSeason`,
      { runId: active.id },
    );
  }
}

async function resolveProfileSetVersion(profileSetVersionId?: string) {
  if (profileSetVersionId) {
    const version = await getYouthProfileSetVersion(profileSetVersionId);
    if (!version) {
      throw new YouthGenerationHttpError(
        404,
        'YouthProfileSetVersionNotFound',
        'Youth profile set version not found',
      );
    }
    const loaded = await loadCountryInputsFromVersion(version.id);
    return loaded;
  }
  const active = await getActiveYouthSnapshot();
  const loaded = await loadCountryInputsFromVersion(active.version.id);
  return loaded;
}

function runGeneration(input: {
  worldSeasonId: string;
  referenceDate: string;
  baseSeed: string;
  profileSetHash: string;
  countries: YouthGenerationCountryInput[];
}): YouthGenerationRunResult {
  try {
    return generateYouthRun(input);
  } catch (err) {
    wrapEngineError(err);
  }
}

function filterPlayers(
  players: GeneratedYouthPlayer[],
  filters?: {
    countryIds?: string[];
    age?: number | null;
    position?: string | null;
    qualityTier?: string | null;
  },
) {
  if (!filters) return players;
  return players.filter((p) => {
    if (filters.countryIds?.length && !filters.countryIds.includes(p.countryId)) return false;
    if (filters.age != null && p.ageOnReferenceDate !== filters.age) return false;
    if (filters.position && p.position !== filters.position) return false;
    if (filters.qualityTier && p.qualityTier !== filters.qualityTier) return false;
    return true;
  });
}

async function verifyFrozenInputs(run: {
  profileSetVersionId: string;
  profileSetHash: string;
  plannedInputText: string | null;
}) {
  if (!run.plannedInputText) {
    throw new YouthGenerationHttpError(
      422,
      'YouthGenerationFailed',
      'Prepared run is missing frozen input snapshot',
    );
  }
  const planned = parsePlannedInput(run.plannedInputText);
  const version = await prisma.youthGenerationProfileSetVersion.findUnique({
    where: { id: run.profileSetVersionId },
    include: {
      countryProfiles: {
        include: { country: true, namePoolVersion: true },
        orderBy: { country: { code: 'asc' } },
      },
    },
  });
  if (!version) {
    throw new YouthGenerationHttpError(
      404,
      'YouthProfileSetVersionNotFound',
      'Frozen profile set version is missing',
    );
  }
  if (version.configHash !== run.profileSetHash) {
    throw new YouthGenerationHttpError(
      422,
      'YouthGenerationFailed',
      'Frozen profile set hash mismatch',
    );
  }

  for (const row of version.countryProfiles) {
    const match = planned.countries.find((c) => c.countryId === row.countryId);
    if (!match) {
      throw new YouthGenerationHttpError(
        422,
        'YouthGenerationFailed',
        `Frozen country profile missing for ${row.countryId}`,
      );
    }
    if (match.profileHash !== row.profileHash) {
      throw new YouthGenerationHttpError(422, 'YouthGenerationFailed', 'Frozen profile hash mismatch');
    }
    if (match.namePoolVersionId !== row.namePoolVersionId) {
      throw new YouthGenerationHttpError(
        422,
        'YouthGenerationFailed',
        'Frozen name pool version mismatch',
      );
    }
    if (match.namePoolHash !== row.namePoolVersion.poolHash) {
      throw new YouthGenerationHttpError(422, 'YouthGenerationFailed', 'Frozen name pool hash mismatch');
    }
    const country = await prisma.country.findUnique({ where: { id: row.countryId } });
    if (!country) {
      throw new YouthGenerationHttpError(
        422,
        'YouthGenerationFailed',
        `Source country ${row.countryId} no longer exists`,
      );
    }
  }
}

async function createPlayerFromGenerated(
  tx: Prisma.TransactionClient,
  generated: GeneratedYouthPlayer,
) {
  const isGoalie = generated.position === 'G';
  const player = await tx.player.create({
    data: {
      firstName: generated.firstName,
      lastName: generated.lastName,
      dateOfBirth: birthDateFromIso(generated.dateOfBirth),
      nationalityCountryId: generated.primaryNationalityCountryId,
      currentTeamId: null,
      primaryPosition: generated.position as never,
      sourceType: 'GENERATED_YOUTH',
      rosterStatus: 'PROSPECT',
      preferredCoachingStyle: generated.preferredCoachingStyle as never,
      preferredTactics: generated.preferredTactics as never,
      personality: generated.personality as never,
      heroRating: generated.heroRating,
      stability: generated.stability,
      developmentRate: generated.developmentRate,
      developmentRisk: generated.developmentRisk,
      potentialFloor: generated.potentialFloor,
      potentialCeiling: generated.potentialCeiling,
      publicPotentialEstimate: generated.publicPotentialEstimate as never,
      form: generated.form,
      ...(isGoalie
        ? {
            goalieAttributes: {
              create: {
                reflexes: generated.attributes.reflexes!,
                positioning: generated.attributes.positioning!,
                reboundControl: generated.attributes.reboundControl!,
                glove: generated.attributes.glove!,
                blocker: generated.attributes.blocker!,
                movement: generated.attributes.movement!,
                puckHandling: generated.attributes.puckHandling!,
                consistency: generated.attributes.consistency!,
                stamina: generated.attributes.stamina!,
              },
            },
          }
        : {
            skaterAttributes: {
              create: {
                stickhandling: generated.attributes.stickhandling!,
                shooting: generated.attributes.shooting!,
                passing: generated.attributes.passing!,
                strength: generated.attributes.strength!,
                speed: generated.attributes.speed!,
                balance: generated.attributes.balance!,
                aggression: generated.attributes.aggression!,
                offensiveAwareness: generated.attributes.offensiveAwareness!,
                defensiveAwareness: generated.attributes.defensiveAwareness!,
              },
            },
          }),
    },
  });
  return player;
}

export async function getYouthGenerationStatus(worldSeasonId?: string) {
  const season =
    worldSeasonId != null
      ? await prisma.worldSeason.findUnique({ where: { id: worldSeasonId } })
      : await prisma.worldSeason.findFirst({ orderBy: { createdAt: 'asc' } });
  if (!season) return null;

  const currentRun = await prisma.youthGenerationRun.findFirst({
    where: { worldSeasonId: season.id, isCurrent: true, status: 'COMPLETED' },
    orderBy: { completedAt: 'desc' },
  });
  const preparedRun = await prisma.youthGenerationRun.findFirst({
    where: { worldSeasonId: season.id, status: { in: ['PREPARED', 'RUNNING'] } },
    orderBy: { createdAt: 'desc' },
  });

  let activeConfig: {
    profileSetName: string;
    versionId: string;
    versionNumber: number;
    configHash: string;
  } | null = null;
  try {
    const active = await getActiveYouthSnapshot();
    activeConfig = {
      profileSetName: active.profileSet.name,
      versionId: active.version.id,
      versionNumber: active.version.versionNumber,
      configHash: active.version.configHash,
    };
  } catch {
    activeConfig = null;
  }

  const prospectCount = currentRun
    ? await prisma.youthGeneratedPlayer.count({ where: { youthGenerationRunId: currentRun.id } })
    : 0;

  return {
    worldSeason: {
      id: season.id,
      label: season.label,
      status: season.status,
      phase: season.phase,
      updatedAt: season.updatedAt.toISOString(),
    },
    activeConfig,
    currentCompletedRun: currentRun ? mapRunRow(currentRun) : null,
    activeRun: preparedRun ? mapRunRow(preparedRun) : null,
    youthGenerationApplied: Boolean(currentRun),
    generatedProspectCount: prospectCount,
  };
}

export async function getYouthGenerationReadiness(input: {
  worldSeasonId: string;
  referenceDate?: string;
  profileSetVersionId?: string;
}) {
  const season = await prisma.worldSeason.findUnique({ where: { id: input.worldSeasonId } });
  if (!season) {
    throw new YouthGenerationHttpError(404, 'WorldSeasonNotFound', 'WorldSeason not found');
  }

  const completed = await prisma.youthGenerationRun.findFirst({
    where: { worldSeasonId: season.id, status: 'COMPLETED', isCurrent: true },
  });
  const activeRun = await prisma.youthGenerationRun.findFirst({
    where: { worldSeasonId: season.id, status: { in: ['PREPARED', 'RUNNING'] } },
  });

  let countries: YouthGenerationCountryInput[] = [];
  let profileSetActive = false;
  try {
    const resolved = await resolveProfileSetVersion(input.profileSetVersionId);
    countries = resolved.countries;
    profileSetActive = true;
  } catch (err) {
    if (!(err instanceof YouthGenerationHttpError)) throw err;
    if (err.code !== 'YouthProfileSetVersionNotFound') throw err;
  }

  let backupAvailable = true;
  try {
    const url = process.env.DATABASE_URL ?? '';
    if (!url.startsWith('file:')) backupAvailable = false;
  } catch {
    backupAvailable = false;
  }

  const readiness = evaluateYouthGenerationReadiness({
    worldSeasonExists: true,
    hasCompletedOfficialRun: Boolean(completed),
    hasPreparedOrRunningRun: Boolean(activeRun),
    referenceDate: input.referenceDate ?? null,
    profileSetActive,
    countries,
    backupAvailable,
    sourceEnumSupportsGeneratedYouth: true,
    lifecycleSupportsProspect: true,
  });

  return {
    worldSeasonId: season.id,
    referenceDate: input.referenceDate ?? null,
    ...readiness,
  };
}

export async function previewYouthGeneration(input: {
  worldSeasonId: string;
  referenceDate: string;
  baseSeed: string;
  profileSetVersionId?: string;
  filters?: {
    countryIds?: string[];
    age?: number | null;
    position?: string | null;
    qualityTier?: string | null;
  };
  page?: number;
  pageSize?: number;
  includePotential?: boolean;
  includeQualityTier?: boolean;
}) {
  const season = await prisma.worldSeason.findUnique({ where: { id: input.worldSeasonId } });
  if (!season) {
    throw new YouthGenerationHttpError(404, 'WorldSeasonNotFound', 'WorldSeason not found');
  }
  if (!input.referenceDate || !input.baseSeed) {
    throw new YouthGenerationHttpError(
      400,
      'InvalidYouthGenerationRequest',
      'referenceDate and baseSeed are required',
    );
  }

  const resolved = await resolveProfileSetVersion(input.profileSetVersionId);
  const output = runGeneration({
    worldSeasonId: season.id,
    referenceDate: input.referenceDate,
    baseSeed: input.baseSeed,
    profileSetHash: resolved.profileSetHash,
    countries: resolved.countries,
  });

  const filtered = filterPlayers(output.players, input.filters);
  const page = Math.max(1, input.page ?? 1);
  const pageSize = Math.min(200, Math.max(1, input.pageSize ?? 50));
  const skip = (page - 1) * pageSize;
  const slice = filtered.slice(skip, skip + pageSize);

  return {
    preview: true,
    worldSeasonId: season.id,
    referenceDate: input.referenceDate,
    baseSeed: input.baseSeed,
    profileSetVersionId: resolved.versionId,
    profileSetHash: resolved.profileSetHash,
    summary: mapRunSummary(output.summary),
    cohorts: output.cohorts.map((c) => mapCohortRow(c)),
    items: slice.map((p) =>
      mapGeneratedPlayer(p, {
        includePotential: input.includePotential,
        includeQualityTier: input.includeQualityTier,
      }),
    ),
    page,
    pageSize,
    total: filtered.length,
  };
}

export async function prepareYouthGenerationRun(
  input: {
    worldSeasonId: string;
    expectedWorldSeasonUpdatedAt: string;
    referenceDate: string;
    baseSeed: string;
    profileSetVersionId?: string;
    reason: string;
  },
  source: CommissionerAuditSource,
) {
  const season = await prisma.worldSeason.findUnique({ where: { id: input.worldSeasonId } });
  if (!season) {
    throw new YouthGenerationHttpError(404, 'WorldSeasonNotFound', 'WorldSeason not found');
  }
  if (season.updatedAt.toISOString() !== input.expectedWorldSeasonUpdatedAt) {
    throw new YouthGenerationHttpError(
      409,
      'InvalidYouthGenerationRequest',
      'WorldSeason was modified elsewhere; reload and retry',
      { currentUpdatedAt: season.updatedAt.toISOString() },
    );
  }

  await assertNoCompletedRun(season.id);
  await assertNoActiveRun(season.id);

  const resolved = await resolveProfileSetVersion(input.profileSetVersionId);
  const output = runGeneration({
    worldSeasonId: season.id,
    referenceDate: input.referenceDate,
    baseSeed: input.baseSeed,
    profileSetHash: resolved.profileSetHash,
    countries: resolved.countries,
  });

  const enabledCountries = resolved.countries.filter((c) => c.profile.enabled);
  if (enabledCountries.length === 0) {
    throw new YouthGenerationHttpError(
      422,
      'YouthGenerationNotReady',
      'No enabled country profiles to prepare',
    );
  }

  const plannedInput: PlannedInputSnapshot = {
    worldSeasonId: season.id,
    referenceDate: input.referenceDate,
    baseSeed: input.baseSeed,
    profileSetVersionId: resolved.versionId,
    profileSetHash: resolved.profileSetHash,
    countries: resolved.countries,
    previewResultHash: output.summary.resultHash,
  };

  const latest = await prisma.youthGenerationRun.findFirst({
    where: { worldSeasonId: season.id },
    orderBy: { runVersion: 'desc' },
  });
  const runVersion = (latest?.runVersion ?? 0) + 1;

  const run = await prisma.$transaction(async (tx) => {
    const created = await tx.youthGenerationRun.create({
      data: {
        worldSeasonId: season.id,
        status: 'PREPARED',
        runVersion,
        referenceDate: input.referenceDate,
        baseSeed: input.baseSeed,
        profileSetVersionId: resolved.versionId,
        profileSetHash: resolved.profileSetHash,
        inputHash: output.summary.inputHash,
        countryCount: output.summary.countryCount,
        enabledCountryCount: output.summary.enabledCountryCount,
        totalPlannedPlayers: output.summary.totalPlannedPlayers,
        totalGeneratedPlayers: 0,
        warningCount: output.summary.warningCount,
        isCurrent: false,
        plannedInputText: JSON.stringify(plannedInput),
      },
    });

    await writeYouthAudit(
      tx,
      created.id,
      'YOUTH_GENERATION_PREPARED',
      input.reason,
      null,
      {
        runId: created.id,
        inputHash: output.summary.inputHash,
        profileSetHash: resolved.profileSetHash,
        previewResultHash: output.summary.resultHash,
        enabledCountryCount: output.summary.enabledCountryCount,
      },
      ['run', 'plannedInput'],
      source,
    );

    return created;
  });

  return {
    run: mapRunRow(run),
    previewResultHash: output.summary.resultHash,
    inputHash: output.summary.inputHash,
    profileSetHash: resolved.profileSetHash,
    enabledCountryCount: output.summary.enabledCountryCount,
    totalPlannedPlayers: output.summary.totalPlannedPlayers,
  };
}

export async function discardPreparedYouthGenerationRun(
  runId: string,
  body: { reason: string },
  source: CommissionerAuditSource,
) {
  const run = await prisma.youthGenerationRun.findUnique({ where: { id: runId } });
  if (!run) {
    throw new YouthGenerationHttpError(
      404,
      'YouthGenerationRunNotFound',
      'Youth generation run not found',
    );
  }
  if (run.status === 'COMPLETED') {
    throw new YouthGenerationHttpError(
      409,
      'YouthGenerationRunCompleted',
      'Completed youth generation runs cannot be discarded',
    );
  }
  if (run.status !== 'PREPARED' && run.status !== 'RUNNING') {
    throw new YouthGenerationHttpError(
      409,
      'YouthGenerationCorrectionNotAllowed',
      `Run status ${run.status} cannot be discarded`,
    );
  }

  await prisma.$transaction(async (tx) => {
    await tx.youthGenerationRun.update({
      where: { id: runId },
      data: { status: 'CANCELLED', cancelledAt: new Date() },
    });
    await writeYouthAudit(
      tx,
      runId,
      'YOUTH_GENERATION_CANCELLED',
      body.reason,
      { status: run.status },
      { status: 'CANCELLED' },
      ['status'],
      source,
    );
  });

  return { discarded: true, runId };
}

export async function executeYouthGenerationRun(
  runId: string,
  body: { confirmation?: boolean; reason: string },
  source: CommissionerAuditSource,
) {
  if (!body.confirmation) {
    throw new YouthGenerationHttpError(
      400,
      'InvalidYouthGenerationRequest',
      'confirmation: true is required',
    );
  }

  const run = await prisma.youthGenerationRun.findUnique({ where: { id: runId } });
  if (!run) {
    throw new YouthGenerationHttpError(
      404,
      'YouthGenerationRunNotFound',
      'Youth generation run not found',
    );
  }
  if (run.status === 'COMPLETED') {
    throw new YouthGenerationHttpError(
      409,
      'YouthGenerationRunCompleted',
      'Youth generation run already completed',
    );
  }
  if (run.status !== 'PREPARED') {
    throw new YouthGenerationHttpError(
      409,
      'YouthGenerationCorrectionNotAllowed',
      `Run status ${run.status} cannot be executed`,
    );
  }

  await assertNoCompletedRun(run.worldSeasonId);
  await verifyFrozenInputs(run);

  let backupPath: string | null = null;
  try {
    const backup = await createSqliteSafetyBackup({ label: 'f25-youth-generation' });
    backupPath = backup.relativeDisplayPath;
  } catch (err) {
    throw new YouthGenerationHttpError(
      503,
      'BackupFailed',
      err instanceof Error ? err.message : 'Backup failed',
    );
  }

  const planned = parsePlannedInput(run.plannedInputText!);
  const output = runGeneration({
    worldSeasonId: run.worldSeasonId,
    referenceDate: run.referenceDate,
    baseSeed: run.baseSeed,
    profileSetHash: run.profileSetHash,
    countries: planned.countries,
  });

  if (output.summary.inputHash !== run.inputHash) {
    await prisma.youthGenerationRun.update({
      where: { id: runId },
      data: {
        status: 'FAILED',
        failedAt: new Date(),
        failureReason: 'Prepared input hash mismatch on execution',
      },
    });
    throw new YouthGenerationHttpError(
      422,
      'YouthGenerationReconciliationFailed',
      'Prepared input hash mismatch on execution',
    );
  }

  const enabledCountries = planned.countries.filter((c) => c.profile.enabled);
  try {
    assertYouthReconciliation({
      enabledCountries,
      cohorts: output.cohorts,
      referenceDate: run.referenceDate,
    });
  } catch (err) {
    await prisma.youthGenerationRun.update({
      where: { id: runId },
      data: {
        status: 'FAILED',
        failedAt: new Date(),
        failureReason: err instanceof Error ? err.message : 'Reconciliation failed',
      },
    });
    wrapEngineError(err);
  }

  await prisma.youthGenerationRun.update({
    where: { id: runId },
    data: { status: 'RUNNING', startedAt: new Date(), backupPath },
  });

  try {
    const published = await prisma.$transaction(async (tx) => {
      const cohortIdByCountry = new Map<string, string>();

      for (const cohort of output.cohorts) {
        const createdCohort = await tx.youthCohort.create({
          data: {
            youthGenerationRunId: runId,
            worldSeasonId: run.worldSeasonId,
            countryId: cohort.countryId,
            countryNameSnapshot: cohort.countryName,
            referenceDate: run.referenceDate,
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
          },
        });
        cohortIdByCountry.set(cohort.countryId, createdCohort.id);

        for (const generated of cohort.players) {
          const player = await createPlayerFromGenerated(tx, generated);
          await tx.youthGeneratedPlayer.create({
            data: {
              youthGenerationRunId: runId,
              youthCohortId: createdCohort.id,
              playerId: player.id,
              generationIndex: generated.generationIndex,
              countryId: generated.countryId,
              playerNameSnapshot: generated.displayName,
              dateOfBirthSnapshot: generated.dateOfBirth,
              ageOnReferenceDate: generated.ageOnReferenceDate,
              positionSnapshot: generated.position,
              qualityTier: generated.qualityTier as never,
              currentAbilitySnapshot: generated.currentAbility,
              potentialSnapshot: generated.potentialCeiling,
              developmentRateSnapshot: generated.developmentRate,
              roleSnapshot: generated.role,
              heightCmSnapshot: generated.heightCm,
              weightKgSnapshot: generated.weightKg,
              shootsSnapshot: generated.shoots,
              generationHash: generated.generationHash,
              diagnosticsText: JSON.stringify({ warnings: generated.warnings }),
            },
          });
        }
      }

      const updated = await tx.youthGenerationRun.update({
        where: { id: runId },
        data: {
          status: 'COMPLETED',
          isCurrent: true,
          completedAt: new Date(),
          resultHash: output.summary.resultHash,
          countryCount: output.summary.countryCount,
          enabledCountryCount: output.summary.enabledCountryCount,
          totalPlannedPlayers: output.summary.totalPlannedPlayers,
          totalGeneratedPlayers: output.summary.totalGeneratedPlayers,
          warningCount: output.summary.warningCount,
        },
      });

      await writeYouthAudit(
        tx,
        runId,
        'YOUTH_GENERATION_COMPLETED',
        body.reason,
        { status: 'RUNNING', inputHash: run.inputHash },
        {
          status: 'COMPLETED',
          resultHash: output.summary.resultHash,
          totalGeneratedPlayers: output.summary.totalGeneratedPlayers,
        },
        ['players', 'cohorts', 'provenance'],
        source,
      );

      return updated;
    });

    return {
      run: mapRunRow(published),
      summary: mapRunSummary(output.summary),
      backupPath,
    };
  } catch (err) {
    await prisma.youthGenerationRun.update({
      where: { id: runId },
      data: {
        status: 'FAILED',
        failedAt: new Date(),
        failureReason: err instanceof Error ? err.message : 'Publication failed',
      },
    });
    await prisma.commissionerAuditLog.create({
      data: {
        entityType: 'YOUTH_GENERATION_RUN',
        entityId: runId,
        action: 'YOUTH_GENERATION_FAILED',
        reason: body.reason,
        beforeJson: JSON.stringify({ status: 'RUNNING' }),
        afterJson: JSON.stringify({
          status: 'FAILED',
          failureReason: err instanceof Error ? err.message : 'Publication failed',
        }),
        changedFieldsJson: JSON.stringify(['status']),
        source,
        schemaVersion: 1,
      },
    });
    throw err;
  }
}

export async function listYouthGenerationRuns(worldSeasonId: string) {
  const season = await prisma.worldSeason.findUnique({ where: { id: worldSeasonId } });
  if (!season) return null;
  const runs = await prisma.youthGenerationRun.findMany({
    where: { worldSeasonId },
    orderBy: { runVersion: 'desc' },
  });
  return { items: runs.map(mapRunRow) };
}

export async function getYouthGenerationRun(runId: string) {
  const run = await prisma.youthGenerationRun.findUnique({ where: { id: runId } });
  if (!run) return null;
  return mapRunRow(run);
}

export async function listYouthCohorts(
  runId: string,
  query?: { page?: number; pageSize?: number },
) {
  const run = await prisma.youthGenerationRun.findUnique({ where: { id: runId } });
  if (!run) return null;

  const page = Math.max(1, query?.page ?? 1);
  const pageSize = Math.min(200, Math.max(1, query?.pageSize ?? 50));
  const [total, rows] = await Promise.all([
    prisma.youthCohort.count({ where: { youthGenerationRunId: runId } }),
    prisma.youthCohort.findMany({
      where: { youthGenerationRunId: runId },
      orderBy: { cohortOrder: 'asc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
  ]);

  return {
    items: rows.map((c) => ({
      id: c.id,
      countryId: c.countryId,
      countryName: c.countryNameSnapshot,
      cohortOrder: c.cohortOrder,
      profileHash: c.profileHash,
      namePoolVersionId: c.namePoolVersionId,
      namePoolHash: c.namePoolHash,
      plannedSize: c.plannedSize,
      generatedSize: c.generatedSize,
      age15Count: c.age15Count,
      age16Count: c.age16Count,
      age17Count: c.age17Count,
      skaterCount: c.skaterCount,
      goalieCount: c.goalieCount,
      cohortHash: c.cohortHash,
      createdAt: c.createdAt.toISOString(),
    })),
    page,
    pageSize,
    total,
  };
}

export async function listYouthGeneratedPlayers(
  runId: string,
  query?: {
    page?: number;
    pageSize?: number;
    countryId?: string;
    includePotential?: boolean;
    includeQualityTier?: boolean;
  },
) {
  const run = await prisma.youthGenerationRun.findUnique({ where: { id: runId } });
  if (!run) return null;

  const page = Math.max(1, query?.page ?? 1);
  const pageSize = Math.min(200, Math.max(1, query?.pageSize ?? 50));
  const where = {
    youthGenerationRunId: runId,
    ...(query?.countryId ? { countryId: query.countryId } : {}),
  };

  const [total, rows] = await Promise.all([
    prisma.youthGeneratedPlayer.count({ where }),
    prisma.youthGeneratedPlayer.findMany({
      where,
      orderBy: [{ generationIndex: 'asc' }],
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
  ]);

  return {
    items: rows.map((r) => {
      const base = {
        id: r.id,
        playerId: r.playerId,
        generationIndex: r.generationIndex,
        countryId: r.countryId,
        playerName: r.playerNameSnapshot,
        dateOfBirth: r.dateOfBirthSnapshot,
        ageOnReferenceDate: r.ageOnReferenceDate,
        position: r.positionSnapshot,
        currentAbility: r.currentAbilitySnapshot,
        developmentRate: r.developmentRateSnapshot,
        role: r.roleSnapshot,
        generationHash: r.generationHash,
      };
      if (query?.includePotential) {
        return { ...base, potentialCeiling: r.potentialSnapshot };
      }
      if (query?.includeQualityTier) {
        return { ...base, qualityTier: r.qualityTier };
      }
      return base;
    }),
    page,
    pageSize,
    total,
  };
}

export async function getPlayerYouthProvenance(
  playerId: string,
  opts?: { includePotential?: boolean; includeQualityTier?: boolean },
) {
  const row = await prisma.youthGeneratedPlayer.findUnique({
    where: { playerId },
    include: {
      run: true,
      cohort: true,
    },
  });
  if (!row) return null;
  return mapProvenanceRow(row, opts);
}

export async function getYouthGenerationRunDiagnostics(runId: string) {
  const run = await prisma.youthGenerationRun.findUnique({
    where: { id: runId },
    include: {
      profileSetVersion: { include: { profileSet: true } },
      cohorts: { orderBy: { cohortOrder: 'asc' }, take: 5 },
      generatedPlayers: { orderBy: { currentAbilitySnapshot: 'desc' }, take: 5 },
    },
  });
  if (!run) return null;

  return {
    run: mapRunRow(run),
    config: {
      profileSetName: run.profileSetVersion.profileSet.name,
      versionNumber: run.profileSetVersion.versionNumber,
      configHash: run.profileSetVersion.configHash,
    },
    cohortSample: run.cohorts.map((c) => ({
      countryName: c.countryNameSnapshot,
      generatedSize: c.generatedSize,
      age15Count: c.age15Count,
      age16Count: c.age16Count,
      age17Count: c.age17Count,
      goalieCount: c.goalieCount,
      cohortHash: c.cohortHash,
    })),
    topProspects: run.generatedPlayers.map((p) => ({
      playerId: p.playerId,
      playerName: p.playerNameSnapshot,
      position: p.positionSnapshot,
      ageOnReferenceDate: p.ageOnReferenceDate,
      currentAbility: p.currentAbilitySnapshot,
      potentialCeiling: p.potentialSnapshot,
      qualityTier: p.qualityTier,
      role: p.roleSnapshot,
      diagnostics: p.diagnosticsText ? JSON.parse(p.diagnosticsText) : null,
    })),
    plannedInput: run.plannedInputText ? JSON.parse(run.plannedInputText) : null,
  };
}
