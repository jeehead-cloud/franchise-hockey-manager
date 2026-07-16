import {
  derivePlayerModel,
  PlayerModelValidationError,
  type DerivedPlayerModel,
} from '@fhm/engine';
import type { CommissionerAuditAction, Prisma } from '@prisma/client';
import { prisma } from '../db/client.js';
import { mapPlayer } from '../mappers.js';
import {
  compactPlayerModelFields,
  publicPlayerModelDetail,
  resolveModelStatus,
  type PlayerModelRow,
} from './player-model.js';
import { deriveAgeYears, parsePagination, isErrorResult } from './query.js';
import { CommissionerHttpError } from '../commissioner/errors.js';
import type { CommissionerPlayerEditInput } from '../commissioner/schemas.js';

const playerInclude = {
  nationality: { select: { id: true, name: true, code: true } },
  currentTeam: {
    select: {
      id: true,
      name: true,
      shortName: true,
      country: { select: { id: true, name: true, code: true } },
      league: { select: { id: true, name: true, shortName: true } },
    },
  },
  skaterAttributes: true,
  goalieAttributes: true,
  secondaryPositions: { select: { position: true } },
} as const;

type PlayerFull = Prisma.PlayerGetPayload<{ include: typeof playerInclude }>;

function stripAttrIds<T extends { playerId?: string; createdAt?: Date; updatedAt?: Date }>(
  row: T | null | undefined,
) {
  if (!row) return null;
  const { playerId: _p, createdAt: _c, updatedAt: _u, ...attrs } = row;
  return attrs as Record<string, number>;
}

function toModelRow(row: PlayerFull): PlayerModelRow {
  return {
    ...row,
    skaterAttributes: stripAttrIds(row.skaterAttributes) ?? undefined,
    goalieAttributes: stripAttrIds(row.goalieAttributes) ?? undefined,
  };
}

async function activeSeasonStartYear() {
  const season = await prisma.worldSeason.findFirst({
    where: { status: 'ACTIVE' },
    orderBy: { startYear: 'desc' },
  });
  return season?.startYear ?? null;
}

function ageYearsOnJuly1(dob: Date, seasonStartYear: number): number {
  const ref = new Date(Date.UTC(seasonStartYear, 6, 1));
  let age = ref.getUTCFullYear() - dob.getUTCFullYear();
  const m = ref.getUTCMonth() - dob.getUTCMonth();
  if (m < 0 || (m === 0 && ref.getUTCDate() < dob.getUTCDate())) age -= 1;
  return age;
}

function editableSnapshot(row: PlayerFull) {
  return {
    identity: {
      firstName: row.firstName,
      lastName: row.lastName,
      dateOfBirth: row.dateOfBirth.toISOString().slice(0, 10),
      nationalityCountryId: row.nationalityCountryId,
      currentTeamId: row.currentTeamId,
      primaryPosition: row.primaryPosition,
      secondaryPositions: (row.secondaryPositions ?? []).map((s) => s.position).sort(),
      rosterStatus: row.rosterStatus,
      sourceType: row.sourceType,
    },
    profile: {
      preferredCoachingStyle: row.preferredCoachingStyle,
      preferredTactics: row.preferredTactics,
      personality: row.personality,
      heroRating: row.heroRating,
      stability: row.stability,
      developmentRate: row.developmentRate,
      developmentRisk: row.developmentRisk,
      potentialFloor: row.potentialFloor,
      potentialCeiling: row.potentialCeiling,
      publicPotentialEstimate: row.publicPotentialEstimate,
    },
    skaterAttributes: stripAttrIds(row.skaterAttributes),
    goalieAttributes: stripAttrIds(row.goalieAttributes),
    modelStatus: resolveModelStatus(toModelRow(row)),
  };
}

function derivedSummary(row: PlayerModelRow) {
  const derived = resolveModelStatus(row) === 'COMPLETE' ? (() => {
    try {
      return derivePlayerModel(
        row.primaryPosition === 'G'
          ? {
              primaryPosition: 'G' as const,
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
            }
          : {
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
            },
      );
    } catch {
      return null;
    }
  })() : null;

  return {
    modelStatus: resolveModelStatus(row),
    currentAbility: derived?.ratings.currentAbility ?? null,
    role: derived?.role.role ?? null,
    roleLabel: derived?.role.roleLabel ?? null,
    roleRating: derived?.ratings.roleRating ?? null,
    offensiveRating:
      derived && derived.kind === 'skater' ? derived.ratings.offensiveRating : null,
    defensiveRating:
      derived && derived.kind === 'skater' ? derived.ratings.defensiveRating : null,
  };
}

function flattenEditable(input: CommissionerPlayerEditInput) {
  return {
    firstName: input.identity.firstName,
    lastName: input.identity.lastName,
    dateOfBirth: input.identity.dateOfBirth,
    nationalityCountryId: input.identity.nationalityCountryId,
    currentTeamId: input.identity.currentTeamId,
    primaryPosition: input.identity.primaryPosition,
    rosterStatus: input.identity.rosterStatus,
    preferredCoachingStyle: input.profile.preferredCoachingStyle,
    preferredTactics: input.profile.preferredTactics,
    personality: input.profile.personality,
    heroRating: input.profile.heroRating,
    stability: input.profile.stability,
    developmentRate: input.profile.developmentRate,
    developmentRisk: input.profile.developmentRisk,
    potentialFloor: input.profile.potentialFloor,
    potentialCeiling: input.profile.potentialCeiling,
    publicPotentialEstimate: input.profile.publicPotentialEstimate,
    skaterAttributes: input.skaterAttributes,
    goalieAttributes: input.goalieAttributes,
  };
}

function collectChangedFields(
  before: ReturnType<typeof editableSnapshot>,
  after: ReturnType<typeof editableSnapshot>,
  beforeDerived: ReturnType<typeof derivedSummary>,
  afterDerived: ReturnType<typeof derivedSummary>,
): string[] {
  const changed: string[] = [];
  const beforeFlat = { ...before.identity, ...before.profile };
  const afterFlat = { ...after.identity, ...after.profile };
  for (const key of Object.keys(afterFlat) as (keyof typeof afterFlat)[]) {
    if (JSON.stringify(beforeFlat[key]) !== JSON.stringify(afterFlat[key])) {
      changed.push(String(key));
    }
  }
  if (JSON.stringify(before.skaterAttributes) !== JSON.stringify(after.skaterAttributes)) {
    changed.push('skaterAttributes');
  }
  if (JSON.stringify(before.goalieAttributes) !== JSON.stringify(after.goalieAttributes)) {
    changed.push('goalieAttributes');
  }
  for (const key of ['currentAbility', 'role', 'roleRating', 'offensiveRating', 'defensiveRating'] as const) {
    if (beforeDerived[key] !== afterDerived[key]) changed.push(`derived.${key}`);
  }
  return changed;
}

function classifyAction(opts: {
  beforeIncomplete: boolean;
  afterComplete: boolean;
  positionModelConverted: boolean;
  teamChanged: boolean;
}): CommissionerAuditAction {
  if (opts.positionModelConverted) return 'POSITION_MODEL_CONVERTED';
  if (opts.beforeIncomplete && opts.afterComplete) return 'MODEL_COMPLETED';
  if (opts.teamChanged) return 'TEAM_ASSIGNMENT_CHANGED';
  return 'UPDATE';
}

function isGoaliePosition(pos: string) {
  return pos === 'G';
}

export async function getCommissionerPlayer(id: string) {
  const row = await prisma.player.findUnique({ where: { id }, include: playerInclude });
  if (!row) return null;

  const seasonStartYear = await activeSeasonStartYear();
  const modelRow = toModelRow(row);
  const publicModel = publicPlayerModelDetail(modelRow);
  const compact = compactPlayerModelFields(modelRow);

  return {
    ...mapPlayer(row),
    age: deriveAgeYears(row.dateOfBirth, seasonStartYear),
    ageReference: seasonStartYear
      ? {
          rule: 'july1_of_world_season_start_year',
          referenceDate: `${seasonStartYear}-07-01`,
          seasonStartYear,
        }
      : null,
    currentTeam: row.currentTeam
      ? {
          id: row.currentTeam.id,
          name: row.currentTeam.name,
          shortName: row.currentTeam.shortName,
          country: row.currentTeam.country,
          league: row.currentTeam.league,
        }
      : null,
    updatedAt: row.updatedAt.toISOString(),
    ...compact,
    playerModel: publicModel,
    /** Commissioner-only hidden development fields. */
    hiddenPotential: {
      potentialFloor: row.potentialFloor,
      potentialCeiling: row.potentialCeiling,
      developmentRisk: row.developmentRisk,
    },
    editable: editableSnapshot(row),
  };
}

export async function updateCommissionerPlayer(
  id: string,
  input: CommissionerPlayerEditInput,
  source: 'COMMISSIONER_UI' | 'COMMISSIONER_API' = 'COMMISSIONER_API',
) {
  const existing = await prisma.player.findUnique({ where: { id }, include: playerInclude });
  if (!existing) {
    throw new CommissionerHttpError(404, 'PlayerNotFound', 'Player not found');
  }

  const expectedIso = input.expectedUpdatedAt;
  if (existing.updatedAt.toISOString() !== expectedIso) {
    throw new CommissionerHttpError(
      409,
      'EditConflict',
      'Player was modified since this editor was loaded. Reload and try again.',
      { currentUpdatedAt: existing.updatedAt.toISOString() },
    );
  }

  const country = await prisma.country.findUnique({
    where: { id: input.identity.nationalityCountryId },
  });
  if (!country) {
    throw new CommissionerHttpError(404, 'CountryNotFound', 'Nationality country not found');
  }

  if (input.identity.currentTeamId) {
    const team = await prisma.team.findUnique({ where: { id: input.identity.currentTeamId } });
    if (!team) {
      throw new CommissionerHttpError(404, 'TeamNotFound', 'Team not found');
    }
  }

  const dob = new Date(`${input.identity.dateOfBirth}T00:00:00.000Z`);
  if (Number.isNaN(dob.getTime())) {
    throw new CommissionerHttpError(400, 'InvalidRequest', 'Invalid dateOfBirth');
  }

  const seasonStartYear = await activeSeasonStartYear();
  const warnings: string[] = [];
  if (seasonStartYear != null) {
    const age = ageYearsOnJuly1(dob, seasonStartYear);
    if (age < 14 || age > 50) {
      throw new CommissionerHttpError(
        422,
        'PlayerModelValidationError',
        `dateOfBirth implies age ${age} as of ${seasonStartYear}-07-01; allowed range is 14–50`,
        { field: 'identity.dateOfBirth', age, referenceDate: `${seasonStartYear}-07-01` },
      );
    }
  } else {
    warnings.push('No active WorldSeason; age plausibility check skipped');
  }

  let derived: DerivedPlayerModel;
  try {
    derived = derivePlayerModel(
      input.identity.primaryPosition === 'G'
        ? {
            primaryPosition: 'G',
            goalieAttributes: input.goalieAttributes!,
            ...input.profile,
          }
        : {
            primaryPosition: input.identity.primaryPosition,
            skaterAttributes: input.skaterAttributes!,
            ...input.profile,
          },
    );
  } catch (err) {
    if (err instanceof PlayerModelValidationError) {
      throw new CommissionerHttpError(
        422,
        'PlayerModelValidationError',
        'Player model validation failed',
        { issues: err.issues },
      );
    }
    throw err;
  }

  const beforeSnap = editableSnapshot(existing);
  const beforeDerived = derivedSummary(toModelRow(existing));
  const beforeIncomplete = resolveModelStatus(toModelRow(existing)) === 'INCOMPLETE';
  const wasGoalie = isGoaliePosition(existing.primaryPosition);
  const willGoalie = isGoaliePosition(input.identity.primaryPosition);
  const positionModelConverted = wasGoalie !== willGoalie;
  const teamChanged = (existing.currentTeamId ?? null) !== (input.identity.currentTeamId ?? null);
  if (teamChanged) {
    const contractState = await prisma.appMeta.findUnique({
      where: { id: 'default' },
      select: { contractsInitializedAt: true },
    });
    if (contractState?.contractsInitializedAt) {
      throw new CommissionerHttpError(
        409,
        'ContractOwnershipCorrectionRequired',
        'Team ownership is contract-authoritative after F28 initialization. Use signing, expiration, or release; accepted terms are not edited in place.',
      );
    }
  }

  const updated = await prisma.$transaction(async (tx) => {
    await tx.player.update({
      where: { id },
      data: {
        firstName: input.identity.firstName,
        lastName: input.identity.lastName,
        dateOfBirth: dob,
        nationalityCountryId: input.identity.nationalityCountryId,
        currentTeamId: input.identity.currentTeamId,
        primaryPosition: input.identity.primaryPosition,
        rosterStatus: input.identity.rosterStatus,
        preferredCoachingStyle: input.profile.preferredCoachingStyle,
        preferredTactics: input.profile.preferredTactics,
        personality: input.profile.personality,
        heroRating: input.profile.heroRating,
        stability: input.profile.stability,
        developmentRate: input.profile.developmentRate,
        developmentRisk: input.profile.developmentRisk,
        potentialFloor: input.profile.potentialFloor,
        potentialCeiling: input.profile.potentialCeiling,
        publicPotentialEstimate: input.profile.publicPotentialEstimate,
      },
    });

    if (willGoalie) {
      if (existing.skaterAttributes) {
        await tx.skaterAttributes.delete({ where: { playerId: id } });
      }
      await tx.goalieAttributes.upsert({
        where: { playerId: id },
        create: { playerId: id, ...input.goalieAttributes! },
        update: { ...input.goalieAttributes! },
      });
    } else {
      if (existing.goalieAttributes) {
        await tx.goalieAttributes.delete({ where: { playerId: id } });
      }
      await tx.skaterAttributes.upsert({
        where: { playerId: id },
        create: { playerId: id, ...input.skaterAttributes! },
        update: { ...input.skaterAttributes! },
      });
    }

    await tx.playerSecondaryPosition.deleteMany({ where: { playerId: id } });
    const secondary = willGoalie ? [] : input.identity.secondaryPositions;
    if (secondary.length > 0) {
      await tx.playerSecondaryPosition.createMany({
        data: secondary.map((position) => ({ playerId: id, position })),
      });
    }

    const finalRow = await tx.player.findUniqueOrThrow({
      where: { id },
      include: playerInclude,
    });

    const afterSnap = editableSnapshot(finalRow);
    const afterDerived = derivedSummary(toModelRow(finalRow));
    const afterComplete = resolveModelStatus(toModelRow(finalRow)) === 'COMPLETE';
    const changedFields = collectChangedFields(beforeSnap, afterSnap, beforeDerived, afterDerived);
    const action = classifyAction({
      beforeIncomplete,
      afterComplete,
      positionModelConverted,
      teamChanged,
    });

    await tx.commissionerAuditLog.create({
      data: {
        entityType: 'PLAYER',
        entityId: id,
        action,
        reason: input.reason,
        beforeJson: JSON.stringify({ ...beforeSnap, derived: beforeDerived }),
        afterJson: JSON.stringify({
          ...afterSnap,
          derived: afterDerived,
          engineDerived: {
            role: derived.role.role,
            roleLabel: derived.role.roleLabel,
            ratings: derived.ratings,
          },
        }),
        changedFieldsJson: JSON.stringify(changedFields),
        source,
        schemaVersion: 1,
      },
    });

    return finalRow;
  });

  const detail = await getCommissionerPlayer(updated.id);
  return {
    item: detail,
    warnings,
    publicPlayerModel: publicPlayerModelDetail(toModelRow(updated)),
  };
}

/** Test-only helper: run update with a mid-transaction failure hook. */
export async function updateCommissionerPlayerWithFailAfter(
  id: string,
  input: CommissionerPlayerEditInput,
  failAfter: 'player' | 'attributes' | 'audit',
) {
  const existing = await prisma.player.findUnique({ where: { id }, include: playerInclude });
  if (!existing) throw new CommissionerHttpError(404, 'PlayerNotFound', 'Player not found');
  if (existing.updatedAt.toISOString() !== input.expectedUpdatedAt) {
    throw new CommissionerHttpError(409, 'EditConflict', 'stale');
  }

  derivePlayerModel(
    input.identity.primaryPosition === 'G'
      ? { primaryPosition: 'G', goalieAttributes: input.goalieAttributes!, ...input.profile }
      : {
          primaryPosition: input.identity.primaryPosition,
          skaterAttributes: input.skaterAttributes!,
          ...input.profile,
        },
  );

  await prisma.$transaction(async (tx) => {
    await tx.player.update({
      where: { id },
      data: {
        firstName: input.identity.firstName,
        lastName: input.identity.lastName,
        dateOfBirth: new Date(`${input.identity.dateOfBirth}T00:00:00.000Z`),
        nationalityCountryId: input.identity.nationalityCountryId,
        currentTeamId: input.identity.currentTeamId,
        primaryPosition: input.identity.primaryPosition,
        rosterStatus: input.identity.rosterStatus,
        preferredCoachingStyle: input.profile.preferredCoachingStyle,
        preferredTactics: input.profile.preferredTactics,
        personality: input.profile.personality,
        heroRating: input.profile.heroRating,
        stability: input.profile.stability,
        developmentRate: input.profile.developmentRate,
        developmentRisk: input.profile.developmentRisk,
        potentialFloor: input.profile.potentialFloor,
        potentialCeiling: input.profile.potentialCeiling,
        publicPotentialEstimate: input.profile.publicPotentialEstimate,
      },
    });
    if (failAfter === 'player') throw new Error('__FAIL_AFTER__player');

    if (input.identity.primaryPosition === 'G') {
      if (existing.skaterAttributes) await tx.skaterAttributes.delete({ where: { playerId: id } });
      await tx.goalieAttributes.upsert({
        where: { playerId: id },
        create: { playerId: id, ...input.goalieAttributes! },
        update: { ...input.goalieAttributes! },
      });
    } else {
      if (existing.goalieAttributes) await tx.goalieAttributes.delete({ where: { playerId: id } });
      await tx.skaterAttributes.upsert({
        where: { playerId: id },
        create: { playerId: id, ...input.skaterAttributes! },
        update: { ...input.skaterAttributes! },
      });
    }
    if (failAfter === 'attributes') throw new Error('__FAIL_AFTER__attributes');

    await tx.commissionerAuditLog.create({
      data: {
        entityType: 'PLAYER',
        entityId: id,
        action: 'UPDATE',
        reason: input.reason,
        beforeJson: '{}',
        afterJson: '{}',
        changedFieldsJson: '[]',
        source: 'COMMISSIONER_API',
      },
    });
    if (failAfter === 'audit') throw new Error('__FAIL_AFTER__audit');
  });
}

export async function listPlayerAudit(id: string, query: Record<string, unknown> = {}) {
  const player = await prisma.player.findUnique({ where: { id }, select: { id: true } });
  if (!player) return null;

  const pagination = parsePagination(query);
  if (isErrorResult(pagination)) {
    throw new CommissionerHttpError(400, 'InvalidRequest', pagination.error);
  }

  const where = { entityType: 'PLAYER' as const, entityId: id };
  const [total, rows] = await Promise.all([
    prisma.commissionerAuditLog.count({ where }),
    prisma.commissionerAuditLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: pagination.skip,
      take: pagination.pageSize,
    }),
  ]);

  return {
    items: rows.map((row) => {
      const before = JSON.parse(row.beforeJson) as Record<string, unknown>;
      const after = JSON.parse(row.afterJson) as Record<string, unknown>;
      const changedFields = JSON.parse(row.changedFieldsJson) as string[];
      return {
        id: row.id,
        action: row.action,
        reason: row.reason,
        source: row.source,
        createdAt: row.createdAt.toISOString(),
        changedFields,
        summary: {
          beforePosition: (before.identity as { primaryPosition?: string } | undefined)
            ?.primaryPosition,
          afterPosition: (after.identity as { primaryPosition?: string } | undefined)
            ?.primaryPosition,
          beforeRole: (before.derived as { role?: string } | undefined)?.role ?? null,
          afterRole: (after.derived as { role?: string } | undefined)?.role ?? null,
          beforeAbility: (before.derived as { currentAbility?: number } | undefined)
            ?.currentAbility ?? null,
          afterAbility: (after.derived as { currentAbility?: number } | undefined)
            ?.currentAbility ?? null,
        },
        before,
        after,
      };
    }),
    page: pagination.page,
    pageSize: pagination.pageSize,
    total,
  };
}

/** Exported for tests that need to build payloads from DB rows. */
export function buildEditPayloadFromPlayer(
  row: PlayerFull,
  overrides: Partial<{
    identity: Partial<CommissionerPlayerEditInput['identity']>;
    profile: Partial<CommissionerPlayerEditInput['profile']>;
    skaterAttributes: CommissionerPlayerEditInput['skaterAttributes'];
    goalieAttributes: CommissionerPlayerEditInput['goalieAttributes'];
    reason: string;
  }> = {},
): CommissionerPlayerEditInput {
  const snap = editableSnapshot(row);
  if (snap.profile.preferredCoachingStyle == null) {
    throw new Error('Cannot build edit payload from incomplete player without defaults');
  }
  return {
    expectedUpdatedAt: row.updatedAt.toISOString(),
    reason: overrides.reason ?? 'Test edit',
    identity: {
      firstName: snap.identity.firstName,
      lastName: snap.identity.lastName,
      dateOfBirth: snap.identity.dateOfBirth,
      nationalityCountryId: snap.identity.nationalityCountryId,
      currentTeamId: snap.identity.currentTeamId,
      primaryPosition: snap.identity.primaryPosition as CommissionerPlayerEditInput['identity']['primaryPosition'],
      secondaryPositions: snap.identity.secondaryPositions as CommissionerPlayerEditInput['identity']['secondaryPositions'],
      rosterStatus: snap.identity.rosterStatus as CommissionerPlayerEditInput['identity']['rosterStatus'],
      ...overrides.identity,
    },
    profile: {
      preferredCoachingStyle: snap.profile.preferredCoachingStyle!,
      preferredTactics: snap.profile.preferredTactics!,
      personality: snap.profile.personality!,
      heroRating: snap.profile.heroRating!,
      stability: snap.profile.stability!,
      developmentRate: snap.profile.developmentRate!,
      developmentRisk: snap.profile.developmentRisk!,
      potentialFloor: snap.profile.potentialFloor!,
      potentialCeiling: snap.profile.potentialCeiling!,
      publicPotentialEstimate: snap.profile
        .publicPotentialEstimate as CommissionerPlayerEditInput['profile']['publicPotentialEstimate'],
      ...overrides.profile,
    },
    skaterAttributes:
      overrides.skaterAttributes !== undefined
        ? overrides.skaterAttributes
        : (snap.skaterAttributes as CommissionerPlayerEditInput['skaterAttributes']),
    goalieAttributes:
      overrides.goalieAttributes !== undefined
        ? overrides.goalieAttributes
        : (snap.goalieAttributes as CommissionerPlayerEditInput['goalieAttributes']),
  };
}

export { flattenEditable };
