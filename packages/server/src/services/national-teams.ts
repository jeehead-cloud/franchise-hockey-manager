/**
 * F22 National Teams — persistence, commissioner workflow, readiness (no F23 matches).
 */
import {
  defaultEligibilityRules,
  defaultRosterRoleForPosition,
  evaluateNationalTeamReadiness,
  generateNationalTeamLineup,
  hashEligibilityRules,
  hashLineupSlots,
  hashRosterPlayers,
  NationalTeamError,
  parseEligibilityRules,
  rankEligibleCandidates,
  suggestNationalTeamRoster,
  validateNationalTeamLineup,
  validateNationalTeamRoster,
  type LineupSlotInput,
  type NationalTeamEligibilityRules,
  type NationalTeamPlayerInput,
  type RosterPlayerInput,
} from '@fhm/engine';
import { createHash } from 'node:crypto';
import type {
  CommissionerAuditAction,
  CommissionerAuditEntityType,
  CommissionerAuditSource,
  NationalTeamEditionStatus,
  Prisma,
  TacticalStyle,
} from '@prisma/client';
import { prisma } from '../db/client.js';
import { assertExpectedUpdatedAt } from './competition-helpers.js';

export class NationalTeamHttpError extends Error {
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

function digest(payload: unknown): string {
  return createHash('sha256').update(JSON.stringify(payload)).digest('hex');
}

function requireReason(reason: string | undefined) {
  if (!reason || reason.trim().length < 3) {
    throw new NationalTeamHttpError(400, 'InvalidReason', 'reason must be at least 3 characters');
  }
  return reason.trim();
}

function wrapEngineError(err: unknown): never {
  if (err instanceof NationalTeamHttpError) throw err;
  if (err instanceof NationalTeamError) {
    const status =
      err.code === 'InvalidEligibilityRules' || err.code === 'RosterValidationFailed'
        ? 422
        : 400;
    throw new NationalTeamHttpError(status, err.code, err.message);
  }
  throw err;
}

function isoDate(d: Date | null | undefined): string | null {
  if (!d) return null;
  return d.toISOString().slice(0, 10);
}

function avgAttrs(attrs: Record<string, unknown> | null | undefined): number {
  if (!attrs) return 10;
  const nums = Object.entries(attrs)
    .filter(([k, v]) => k !== 'playerId' && k !== 'createdAt' && k !== 'updatedAt' && typeof v === 'number')
    .map(([, v]) => v as number);
  if (nums.length === 0) return 10;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

function abilityFromPlayer(p: {
  primaryPosition: string;
  skaterAttributes: Record<string, unknown> | null;
  goalieAttributes: Record<string, unknown> | null;
}): number {
  if (p.primaryPosition === 'G') return avgAttrs(p.goalieAttributes);
  return avgAttrs(p.skaterAttributes);
}

function mapPlayerInput(p: {
  id: string;
  firstName: string;
  lastName: string;
  dateOfBirth: Date;
  nationalityCountryId: string;
  primaryPosition: string;
  currentTeamId: string | null;
  currentTeam: { id: string; name: string } | null;
  skaterAttributes: Record<string, unknown> | null;
  goalieAttributes: Record<string, unknown> | null;
}): NationalTeamPlayerInput {
  const ability = abilityFromPlayer(p);
  return {
    playerId: p.id,
    displayName: `${p.firstName} ${p.lastName}`.trim(),
    birthDate: isoDate(p.dateOfBirth),
    primaryNationalityCountryId: p.nationalityCountryId,
    citizenshipCountryIds: [],
    birthCountryId: null,
    position: p.primaryPosition,
    shoots: null,
    currentAbility: ability,
    effectivePerformance: ability,
    clubTeamId: p.currentTeamId,
    clubTeamName: p.currentTeam?.name ?? null,
    injuryStatus: 'HEALTHY',
    activeStatus: 'ACTIVE',
  };
}

async function writeAudit(
  tx: Prisma.TransactionClient,
  entityType: CommissionerAuditEntityType,
  entityId: string,
  action: CommissionerAuditAction,
  reason: string,
  before: unknown,
  after: unknown,
  changedFields: string[],
  source: CommissionerAuditSource,
) {
  await tx.commissionerAuditLog.create({
    data: {
      entityType,
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

export function assertNotLocked(status: NationalTeamEditionStatus) {
  if (status === 'LOCKED') {
    throw new NationalTeamHttpError(409, 'NationalTeamEditionLocked', 'National-team edition is locked');
  }
  if (status === 'CANCELLED') {
    throw new NationalTeamHttpError(
      409,
      'NationalTeamEditionCancelled',
      'National-team edition is cancelled',
    );
  }
}

export function assertEditable(status: NationalTeamEditionStatus) {
  assertNotLocked(status);
  if (status !== 'PLANNED' && status !== 'PREPARING') {
    throw new NationalTeamHttpError(
      409,
      'NationalTeamEditionNotEditable',
      'Roster and candidates are editable only while PLANNED or PREPARING',
    );
  }
}

function parseRulesSnapshot(text: string): NationalTeamEligibilityRules {
  try {
    return parseEligibilityRules(JSON.parse(text || '{}'));
  } catch (err) {
    wrapEngineError(err);
  }
}

function serializeProfile(
  row: {
    id: string;
    teamId: string;
    countryId: string;
    category: string;
    displayName: string;
    shortName: string | null;
    status: string;
    defaultRosterRulesText: string;
    defaultTacticsText: string | null;
    createdAt: Date;
    updatedAt: Date;
    team?: { id: string; name: string; shortName: string | null; teamType: string } | null;
    country?: { id: string; name: string; code: string | null } | null;
    _count?: { editions: number } | null;
  },
) {
  return {
    id: row.id,
    teamId: row.teamId,
    countryId: row.countryId,
    category: row.category,
    displayName: row.displayName,
    shortName: row.shortName,
    status: row.status,
    defaultRosterRules: (() => {
      try {
        return JSON.parse(row.defaultRosterRulesText || '{}');
      } catch {
        return {};
      }
    })(),
    defaultTacticsText: row.defaultTacticsText,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    team: row.team ?? undefined,
    country: row.country ?? undefined,
    editionCount: row._count?.editions,
  };
}

function serializeEdition(
  row: {
    id: string;
    nationalTeamProfileId: string;
    competitionEditionId: string;
    competitionParticipantId: string;
    status: string;
    teamNameSnapshot: string;
    shortNameSnapshot: string | null;
    countryNameSnapshot: string;
    rosterRulesSnapshotText: string;
    rosterRulesHash: string;
    eligibilitySnapshotText: string;
    eligibilityHash: string;
    tacticsSnapshotText: string | null;
    tacticsHash: string | null;
    rosterHash: string | null;
    lineupHash: string | null;
    preparedAt: Date | null;
    confirmedAt: Date | null;
    lockedAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
    profile?: {
      id: string;
      category: string;
      displayName: string;
      countryId: string;
      teamId: string;
    } | null;
  },
) {
  return {
    id: row.id,
    nationalTeamProfileId: row.nationalTeamProfileId,
    competitionEditionId: row.competitionEditionId,
    competitionParticipantId: row.competitionParticipantId,
    status: row.status,
    teamNameSnapshot: row.teamNameSnapshot,
    shortNameSnapshot: row.shortNameSnapshot,
    countryNameSnapshot: row.countryNameSnapshot,
    rosterRules: (() => {
      try {
        return JSON.parse(row.rosterRulesSnapshotText || '{}');
      } catch {
        return {};
      }
    })(),
    rosterRulesHash: row.rosterRulesHash,
    eligibilityRules: (() => {
      try {
        return JSON.parse(row.eligibilitySnapshotText || '{}');
      } catch {
        return {};
      }
    })(),
    eligibilityHash: row.eligibilityHash,
    tacticsSnapshotText: row.tacticsSnapshotText,
    tacticsHash: row.tacticsHash,
    rosterHash: row.rosterHash,
    lineupHash: row.lineupHash,
    preparedAt: row.preparedAt?.toISOString() ?? null,
    confirmedAt: row.confirmedAt?.toISOString() ?? null,
    lockedAt: row.lockedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    profile: row.profile ?? undefined,
  };
}

const editionInclude = {
  profile: {
    select: {
      id: true,
      category: true,
      displayName: true,
      countryId: true,
      teamId: true,
    },
  },
} as const;

export async function listNationalTeams(query: {
  page?: number;
  pageSize?: number;
  countryId?: string;
  category?: 'SENIOR_MEN' | 'JUNIOR_U20';
  status?: 'ACTIVE' | 'INACTIVE';
  search?: string;
}) {
  const page = query.page && query.page > 0 ? query.page : 1;
  const pageSize =
    query.pageSize && query.pageSize > 0 ? Math.min(query.pageSize, 100) : 25;
  const where: Prisma.NationalTeamProfileWhereInput = {};
  if (query.countryId) where.countryId = query.countryId;
  if (query.category) where.category = query.category;
  if (query.status) where.status = query.status;
  if (query.search?.trim()) {
    const q = query.search.trim();
    where.OR = [
      { displayName: { contains: q } },
      { shortName: { contains: q } },
      { team: { name: { contains: q } } },
      { country: { name: { contains: q } } },
    ];
  }

  const [total, rows] = await Promise.all([
    prisma.nationalTeamProfile.count({ where }),
    prisma.nationalTeamProfile.findMany({
      where,
      include: {
        team: { select: { id: true, name: true, shortName: true, teamType: true } },
        country: { select: { id: true, name: true, code: true } },
        _count: { select: { editions: true } },
      },
      orderBy: [{ countryId: 'asc' }, { category: 'asc' }],
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
  ]);
  return { items: rows.map(serializeProfile), total, page, pageSize };
}

export async function getNationalTeam(id: string) {
  const row = await prisma.nationalTeamProfile.findUnique({
    where: { id },
    include: {
      team: { select: { id: true, name: true, shortName: true, teamType: true } },
      country: { select: { id: true, name: true, code: true } },
      _count: { select: { editions: true } },
      editions: {
        orderBy: { createdAt: 'desc' },
        take: 20,
        select: {
          id: true,
          competitionEditionId: true,
          status: true,
          teamNameSnapshot: true,
          confirmedAt: true,
          lockedAt: true,
          updatedAt: true,
        },
      },
    },
  });
  if (!row) return null;
  return {
    ...serializeProfile(row),
    editions: row.editions.map((e) => ({
      ...e,
      confirmedAt: e.confirmedAt?.toISOString() ?? null,
      lockedAt: e.lockedAt?.toISOString() ?? null,
      updatedAt: e.updatedAt.toISOString(),
    })),
  };
}

export async function createNationalTeam(
  body: {
    countryId: string;
    category: 'SENIOR_MEN' | 'JUNIOR_U20';
    displayName: string;
    shortName?: string | null;
    reason: string;
    defaultRosterRules?: unknown;
  },
  source: CommissionerAuditSource,
) {
  const reason = requireReason(body.reason);
  try {
    return await prisma.$transaction(async (tx) => {
      const country = await tx.country.findUnique({ where: { id: body.countryId } });
      if (!country) {
        throw new NationalTeamHttpError(404, 'CountryNotFound', 'Country not found');
      }
      const existing = await tx.nationalTeamProfile.findUnique({
        where: {
          countryId_category: { countryId: body.countryId, category: body.category },
        },
      });
      if (existing) {
        throw new NationalTeamHttpError(
          409,
          'NationalTeamExists',
          'A national team already exists for this country and category',
        );
      }

      const rules = body.defaultRosterRules
        ? parseEligibilityRules(body.defaultRosterRules)
        : defaultEligibilityRules(body.category);

      const team = await tx.team.create({
        data: {
          name: body.displayName,
          shortName: body.shortName ?? null,
          teamType: 'NATIONAL',
          countryId: body.countryId,
          leagueId: null,
        },
      });

      const profile = await tx.nationalTeamProfile.create({
        data: {
          teamId: team.id,
          countryId: body.countryId,
          category: body.category,
          displayName: body.displayName,
          shortName: body.shortName ?? null,
          defaultRosterRulesText: JSON.stringify(rules),
        },
        include: {
          team: { select: { id: true, name: true, shortName: true, teamType: true } },
          country: { select: { id: true, name: true, code: true } },
          _count: { select: { editions: true } },
        },
      });

      await writeAudit(
        tx,
        'NATIONAL_TEAM',
        profile.id,
        'NATIONAL_TEAM_CREATED',
        reason,
        null,
        profile,
        ['teamId', 'countryId', 'category', 'displayName'],
        source,
      );
      return serializeProfile(profile);
    });
  } catch (err) {
    wrapEngineError(err);
  }
}

export async function updateNationalTeam(
  id: string,
  body: {
    expectedUpdatedAt: string;
    reason: string;
    displayName?: string;
    shortName?: string | null;
    status?: 'ACTIVE' | 'INACTIVE';
    defaultRosterRules?: unknown;
    defaultTacticsText?: string | null;
  },
  source: CommissionerAuditSource,
) {
  const reason = requireReason(body.reason);
  try {
    return await prisma.$transaction(async (tx) => {
      const row = await tx.nationalTeamProfile.findUnique({ where: { id } });
      if (!row) {
        throw new NationalTeamHttpError(404, 'NationalTeamNotFound', 'National team not found');
      }
      assertExpectedUpdatedAt(row.updatedAt, body.expectedUpdatedAt);

      const data: Prisma.NationalTeamProfileUpdateInput = {};
      const changed: string[] = [];
      if (body.displayName !== undefined && body.displayName !== row.displayName) {
        data.displayName = body.displayName;
        changed.push('displayName');
        await tx.team.update({
          where: { id: row.teamId },
          data: { name: body.displayName },
        });
      }
      if (body.shortName !== undefined && body.shortName !== row.shortName) {
        data.shortName = body.shortName;
        changed.push('shortName');
        await tx.team.update({
          where: { id: row.teamId },
          data: { shortName: body.shortName },
        });
      }
      if (body.status !== undefined && body.status !== row.status) {
        data.status = body.status;
        changed.push('status');
      }
      if (body.defaultRosterRules !== undefined) {
        const rules = parseEligibilityRules(body.defaultRosterRules);
        data.defaultRosterRulesText = JSON.stringify(rules);
        changed.push('defaultRosterRulesText');
      }
      if (body.defaultTacticsText !== undefined && body.defaultTacticsText !== row.defaultTacticsText) {
        data.defaultTacticsText = body.defaultTacticsText;
        changed.push('defaultTacticsText');
      }
      if (changed.length === 0) {
        throw new NationalTeamHttpError(400, 'NoChanges', 'No national-team fields changed');
      }

      const updated = await tx.nationalTeamProfile.update({
        where: { id },
        data,
        include: {
          team: { select: { id: true, name: true, shortName: true, teamType: true } },
          country: { select: { id: true, name: true, code: true } },
          _count: { select: { editions: true } },
        },
      });
      await writeAudit(
        tx,
        'NATIONAL_TEAM',
        id,
        'NATIONAL_TEAM_UPDATED',
        reason,
        row,
        updated,
        changed,
        source,
      );
      return serializeProfile(updated);
    });
  } catch (err) {
    wrapEngineError(err);
  }
}

export async function listNationalTeamEditions(query: {
  page?: number;
  pageSize?: number;
  nationalTeamProfileId?: string;
  competitionEditionId?: string;
  status?: NationalTeamEditionStatus;
}) {
  const page = query.page && query.page > 0 ? query.page : 1;
  const pageSize =
    query.pageSize && query.pageSize > 0 ? Math.min(query.pageSize, 100) : 25;
  const where: Prisma.NationalTeamEditionWhereInput = {};
  if (query.nationalTeamProfileId) where.nationalTeamProfileId = query.nationalTeamProfileId;
  if (query.competitionEditionId) where.competitionEditionId = query.competitionEditionId;
  if (query.status) where.status = query.status;

  const [total, rows] = await Promise.all([
    prisma.nationalTeamEdition.count({ where }),
    prisma.nationalTeamEdition.findMany({
      where,
      include: editionInclude,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
  ]);
  return { items: rows.map(serializeEdition), total, page, pageSize };
}

export async function getNationalTeamEdition(id: string) {
  const row = await prisma.nationalTeamEdition.findUnique({
    where: { id },
    include: editionInclude,
  });
  if (!row) return null;
  return serializeEdition(row);
}

export async function prepareNationalTeamEdition(
  competitionEditionId: string,
  nationalTeamProfileId: string,
  body: {
    expectedUpdatedAt: string;
    reason: string;
    rules?: unknown;
  },
  source: CommissionerAuditSource,
) {
  const reason = requireReason(body.reason);
  try {
    return await prisma.$transaction(async (tx) => {
      const competitionEdition = await tx.competitionEdition.findUnique({
        where: { id: competitionEditionId },
        include: { competition: true },
      });
      if (!competitionEdition) {
        throw new NationalTeamHttpError(404, 'EditionNotFound', 'Competition edition not found');
      }
      assertExpectedUpdatedAt(competitionEdition.updatedAt, body.expectedUpdatedAt);

      if (competitionEdition.competition.type !== 'INTERNATIONAL_TOURNAMENT') {
        throw new NationalTeamHttpError(
          409,
          'CompetitionNotInternational',
          'National-team preparation requires INTERNATIONAL_TOURNAMENT competition',
        );
      }
      if (competitionEdition.status === 'ARCHIVED' || competitionEdition.status === 'CANCELLED') {
        throw new NationalTeamHttpError(
          409,
          'EditionNotEditable',
          'Competition edition cannot accept national-team preparation',
        );
      }

      const profile = await tx.nationalTeamProfile.findUnique({
        where: { id: nationalTeamProfileId },
        include: {
          team: true,
          country: true,
        },
      });
      if (!profile) {
        throw new NationalTeamHttpError(404, 'NationalTeamNotFound', 'National team not found');
      }
      if (profile.status !== 'ACTIVE') {
        throw new NationalTeamHttpError(409, 'NationalTeamInactive', 'National team is inactive');
      }

      const existingNt = await tx.nationalTeamEdition.findUnique({
        where: {
          nationalTeamProfileId_competitionEditionId: {
            nationalTeamProfileId,
            competitionEditionId,
          },
        },
        include: editionInclude,
      });
      if (existingNt) {
        return serializeEdition(existingNt);
      }

      let rules: NationalTeamEligibilityRules;
      if (body.rules !== undefined) {
        rules = parseEligibilityRules({
          ...(typeof body.rules === 'object' && body.rules ? body.rules : {}),
          category: profile.category,
        });
      } else {
        try {
          const stored = JSON.parse(profile.defaultRosterRulesText || '{}');
          rules =
            stored && typeof stored === 'object' && Object.keys(stored).length > 0
              ? parseEligibilityRules({ ...stored, category: profile.category })
              : defaultEligibilityRules(profile.category);
        } catch {
          rules = defaultEligibilityRules(profile.category);
        }
      }
      const rulesJson = JSON.stringify(rules);
      const rulesHash = hashEligibilityRules(rules);

      let participant = await tx.competitionParticipant.findUnique({
        where: {
          competitionEditionId_teamId: {
            competitionEditionId,
            teamId: profile.teamId,
          },
        },
      });
      if (!participant) {
        const maxOrder = await tx.competitionParticipant.aggregate({
          where: { competitionEditionId },
          _max: { participantOrder: true },
        });
        participant = await tx.competitionParticipant.create({
          data: {
            competitionEditionId,
            teamId: profile.teamId,
            participantOrder: (maxOrder._max.participantOrder ?? 0) + 1,
            status: 'CONFIRMED',
            source: 'MANUAL',
            teamNameSnapshot: profile.team.name,
            teamShortNameSnapshot: profile.team.shortName,
          },
        });
      }

      const created = await tx.nationalTeamEdition.create({
        data: {
          nationalTeamProfileId,
          competitionEditionId,
          competitionParticipantId: participant.id,
          status: 'PLANNED',
          teamNameSnapshot: profile.displayName,
          shortNameSnapshot: profile.shortName,
          countryNameSnapshot: profile.country.name,
          rosterRulesSnapshotText: rulesJson,
          rosterRulesHash: rulesHash,
          eligibilitySnapshotText: rulesJson,
          eligibilityHash: rulesHash,
          preparedAt: new Date(),
        },
        include: editionInclude,
      });

      await tx.competitionEdition.update({
        where: { id: competitionEditionId },
        data: { updatedAt: new Date() },
      });

      await writeAudit(
        tx,
        'NATIONAL_TEAM_EDITION',
        created.id,
        'NATIONAL_TEAM_EDITION_PREPARED',
        reason,
        null,
        created,
        ['nationalTeamProfileId', 'competitionEditionId', 'status'],
        source,
      );
      return serializeEdition(created);
    });
  } catch (err) {
    wrapEngineError(err);
  }
}

export async function updateNationalTeamEditionRules(
  id: string,
  body: {
    expectedUpdatedAt: string;
    reason: string;
    rules: unknown;
  },
  source: CommissionerAuditSource,
) {
  const reason = requireReason(body.reason);
  try {
    return await prisma.$transaction(async (tx) => {
      const row = await tx.nationalTeamEdition.findUnique({
        where: { id },
        include: { profile: true },
      });
      if (!row) {
        throw new NationalTeamHttpError(
          404,
          'NationalTeamEditionNotFound',
          'National-team edition not found',
        );
      }
      assertExpectedUpdatedAt(row.updatedAt, body.expectedUpdatedAt);
      assertEditable(row.status);

      const rules = parseEligibilityRules({
        ...(typeof body.rules === 'object' && body.rules ? body.rules : {}),
        category: row.profile.category,
      });
      const rulesJson = JSON.stringify(rules);
      const rulesHash = hashEligibilityRules(rules);
      const updated = await tx.nationalTeamEdition.update({
        where: { id },
        data: {
          rosterRulesSnapshotText: rulesJson,
          rosterRulesHash: rulesHash,
          eligibilitySnapshotText: rulesJson,
          eligibilityHash: rulesHash,
        },
        include: editionInclude,
      });
      await writeAudit(
        tx,
        'NATIONAL_TEAM_EDITION',
        id,
        'NATIONAL_TEAM_UPDATED',
        reason,
        row,
        updated,
        ['rosterRulesSnapshotText', 'eligibilitySnapshotText'],
        source,
      );
      return serializeEdition(updated);
    });
  } catch (err) {
    wrapEngineError(err);
  }
}

async function loadPlayersForCandidates(tx: Prisma.TransactionClient) {
  return tx.player.findMany({
    where: { rosterStatus: 'ACTIVE' },
    include: {
      currentTeam: { select: { id: true, name: true } },
      skaterAttributes: true,
      goalieAttributes: true,
    },
  });
}

export async function generateCandidates(
  id: string,
  body: { expectedUpdatedAt: string; reason: string },
  source: CommissionerAuditSource,
) {
  const reason = requireReason(body.reason);
  try {
    return await prisma.$transaction(async (tx) => {
      const edition = await tx.nationalTeamEdition.findUnique({
        where: { id },
        include: { profile: true },
      });
      if (!edition) {
        throw new NationalTeamHttpError(
          404,
          'NationalTeamEditionNotFound',
          'National-team edition not found',
        );
      }
      assertExpectedUpdatedAt(edition.updatedAt, body.expectedUpdatedAt);
      assertEditable(edition.status);

      const rules = parseRulesSnapshot(edition.eligibilitySnapshotText);
      const players = await loadPlayersForCandidates(tx);
      const inputs = players.map(mapPlayerInput);
      const ranked = rankEligibleCandidates({
        players: inputs,
        countryId: edition.profile.countryId,
        rules,
      });
      const byId = new Map(inputs.map((p) => [p.playerId, p]));
      const poolHash = digest({
        countryId: edition.profile.countryId,
        rulesHash: edition.eligibilityHash,
        playerIds: ranked.map((r) => r.playerId),
      });

      await tx.nationalTeamCandidate.deleteMany({ where: { nationalTeamEditionId: id } });

      if (ranked.length > 0) {
        await tx.nationalTeamCandidate.createMany({
          data: ranked.map((c) => {
            const p = byId.get(c.playerId)!;
            return {
              nationalTeamEditionId: id,
              sourcePlayerId: c.playerId,
              playerNameSnapshot: p.displayName,
              birthDateSnapshot: p.birthDate ? new Date(`${p.birthDate}T00:00:00.000Z`) : null,
              positionSnapshot: p.position,
              clubTeamIdSnapshot: p.clubTeamId,
              clubNameSnapshot: p.clubTeamName,
              eligibilityStatus: 'ELIGIBLE' as const,
              eligibilityReasonText: c.evaluation.reasons.join('; '),
              rankingScore: c.rankingScore,
              rankingOrder: c.rankingOrder,
              selected: false,
              inputHash: digest({ playerId: c.playerId, poolHash }),
            };
          }),
        });
      }

      const updated = await tx.nationalTeamEdition.update({
        where: { id },
        data: { status: 'PREPARING' },
        include: editionInclude,
      });

      await writeAudit(
        tx,
        'NATIONAL_TEAM_EDITION',
        id,
        'CANDIDATE_POOL_GENERATED',
        reason,
        { candidateCount: 0 },
        { candidateCount: ranked.length, status: 'PREPARING' },
        ['candidates', 'status'],
        source,
      );

      return {
        edition: serializeEdition(updated),
        eligibleCount: ranked.length,
        ineligibleSkipped: players.length - ranked.length,
      };
    });
  } catch (err) {
    wrapEngineError(err);
  }
}

async function loadPlayerMap(
  tx: Prisma.TransactionClient,
  playerIds: string[],
): Promise<Map<string, NationalTeamPlayerInput>> {
  if (playerIds.length === 0) return new Map();
  const players = await tx.player.findMany({
    where: { id: { in: playerIds } },
    include: {
      currentTeam: { select: { id: true, name: true } },
      skaterAttributes: true,
      goalieAttributes: true,
    },
  });
  return new Map(players.map((p) => [p.id, mapPlayerInput(p)]));
}

async function otherSelectedPlayerIds(
  tx: Prisma.TransactionClient,
  competitionEditionId: string,
  excludeNationalTeamEditionId: string,
): Promise<Set<string>> {
  const others = await tx.nationalTeamRosterPlayer.findMany({
    where: {
      nationalTeamEditionId: { not: excludeNationalTeamEditionId },
      edition: { competitionEditionId },
    },
    select: { sourcePlayerId: true },
  });
  return new Set(others.map((r) => r.sourcePlayerId));
}

async function replaceRosterRows(
  tx: Prisma.TransactionClient,
  editionId: string,
  countryId: string,
  rules: NationalTeamEligibilityRules,
  roster: Array<{
    playerId: string;
    rosterRole: RosterPlayerInput['rosterRole'];
    rosterOrder: number;
    jerseyNumber?: number | null;
    captainRole?: RosterPlayerInput['captainRole'];
    selectionSource?: RosterPlayerInput['selectionSource'];
    positionSnapshot?: string;
  }>,
  options: { validate: boolean },
) {
  const playerIds = roster.map((r) => r.playerId);
  const playersById = await loadPlayerMap(tx, playerIds);
  const rosterInputs: RosterPlayerInput[] = roster.map((r) => {
    const p = playersById.get(r.playerId);
    const position = r.positionSnapshot ?? p?.position ?? 'C';
    return {
      playerId: r.playerId,
      positionSnapshot: position,
      rosterRole: r.rosterRole,
      rosterOrder: r.rosterOrder,
      jerseyNumber: r.jerseyNumber ?? null,
      captainRole: r.captainRole ?? 'NONE',
      selectionSource: r.selectionSource ?? 'MANUAL',
    };
  });

  if (options.validate) {
    const otherIds = await otherSelectedPlayerIds(tx, (
      await tx.nationalTeamEdition.findUniqueOrThrow({ where: { id: editionId } })
    ).competitionEditionId, editionId);
    const validation = validateNationalTeamRoster({
      roster: rosterInputs,
      playersById,
      countryId,
      rules,
      otherEditionSelectedPlayerIds: otherIds,
    });
    if (!validation.ok) {
      throw new NationalTeamHttpError(422, 'RosterValidationFailed', 'Roster validation failed', {
        issues: validation.issues,
      });
    }
  }

  await tx.nationalTeamRosterPlayer.deleteMany({ where: { nationalTeamEditionId: editionId } });
  if (rosterInputs.length > 0) {
    await tx.nationalTeamRosterPlayer.createMany({
      data: rosterInputs.map((r) => {
        const p = playersById.get(r.playerId);
        return {
          nationalTeamEditionId: editionId,
          sourcePlayerId: r.playerId,
          playerNameSnapshot: p?.displayName ?? r.playerId,
          clubTeamIdSnapshot: p?.clubTeamId ?? null,
          clubNameSnapshot: p?.clubTeamName ?? null,
          positionSnapshot: r.positionSnapshot,
          rosterRole: r.rosterRole,
          rosterOrder: r.rosterOrder,
          jerseyNumber: r.jerseyNumber,
          captainRole: r.captainRole,
          selectionSource: r.selectionSource,
          eligibilityHash: hashEligibilityRules(rules),
        };
      }),
    });
  }

  await tx.nationalTeamCandidate.updateMany({
    where: { nationalTeamEditionId: editionId },
    data: { selected: false },
  });
  if (playerIds.length > 0) {
    await tx.nationalTeamCandidate.updateMany({
      where: { nationalTeamEditionId: editionId, sourcePlayerId: { in: playerIds } },
      data: { selected: true },
    });
  }

  return { rosterInputs, rosterHash: hashRosterPlayers(rosterInputs) };
}

export async function suggestRoster(
  id: string,
  body: {
    expectedUpdatedAt: string;
    reason: string;
    targetRosterSize?: number;
  },
  source: CommissionerAuditSource,
) {
  const reason = requireReason(body.reason);
  try {
    return await prisma.$transaction(async (tx) => {
      const edition = await tx.nationalTeamEdition.findUnique({
        where: { id },
        include: { profile: true, candidates: true },
      });
      if (!edition) {
        throw new NationalTeamHttpError(
          404,
          'NationalTeamEditionNotFound',
          'National-team edition not found',
        );
      }
      assertExpectedUpdatedAt(edition.updatedAt, body.expectedUpdatedAt);
      assertEditable(edition.status);

      const rules = parseRulesSnapshot(edition.eligibilitySnapshotText);
      const candidateIds = edition.candidates
        .filter((c) => c.eligibilityStatus === 'ELIGIBLE')
        .map((c) => c.sourcePlayerId);
      if (candidateIds.length === 0) {
        throw new NationalTeamHttpError(
          422,
          'CandidatePoolEmpty',
          'Generate candidates before suggesting a roster',
        );
      }
      const playersById = await loadPlayerMap(tx, candidateIds);
      const players = [...playersById.values()];
      const suggestion = suggestNationalTeamRoster({
        players,
        countryId: edition.profile.countryId,
        rules,
        targetRosterSize: body.targetRosterSize,
      });

      await replaceRosterRows(
        tx,
        id,
        edition.profile.countryId,
        rules,
        suggestion.players.map((p) => ({
          playerId: p.playerId,
          rosterRole: p.rosterRole,
          rosterOrder: p.rosterOrder,
          selectionSource: 'SUGGESTED',
          captainRole: 'NONE',
          jerseyNumber: null,
        })),
        { validate: false },
      );

      const updated = await tx.nationalTeamEdition.update({
        where: { id },
        data: {
          status: 'PREPARING',
          rosterHash: null,
          confirmedAt: null,
          lineupHash: null,
        },
        include: editionInclude,
      });
      await tx.nationalTeamLineup.deleteMany({ where: { nationalTeamEditionId: id } });

      await writeAudit(
        tx,
        'NATIONAL_TEAM_ROSTER',
        id,
        'ROSTER_SUGGESTED',
        reason,
        null,
        suggestion,
        ['roster'],
        source,
      );

      return {
        edition: serializeEdition(updated),
        suggestion,
      };
    });
  } catch (err) {
    wrapEngineError(err);
  }
}

export async function updateRoster(
  id: string,
  body: {
    expectedUpdatedAt: string;
    reason: string;
    roster: Array<{
      playerId: string;
      rosterRole: 'FORWARD' | 'DEFENSE' | 'GOALIE' | 'RESERVE';
      rosterOrder: number;
      jerseyNumber?: number | null;
      captainRole?: 'NONE' | 'CAPTAIN' | 'ALTERNATE';
      selectionSource?: 'SUGGESTED' | 'MANUAL' | 'IMPORTED';
      positionSnapshot?: string;
    }>;
  },
  source: CommissionerAuditSource,
) {
  const reason = requireReason(body.reason);
  try {
    return await prisma.$transaction(async (tx) => {
      const edition = await tx.nationalTeamEdition.findUnique({
        where: { id },
        include: { profile: true },
      });
      if (!edition) {
        throw new NationalTeamHttpError(
          404,
          'NationalTeamEditionNotFound',
          'National-team edition not found',
        );
      }
      assertExpectedUpdatedAt(edition.updatedAt, body.expectedUpdatedAt);
      assertEditable(edition.status);

      const rules = parseRulesSnapshot(edition.eligibilitySnapshotText);
      const { rosterHash } = await replaceRosterRows(
        tx,
        id,
        edition.profile.countryId,
        rules,
        body.roster.map((r) => ({
          ...r,
          selectionSource: r.selectionSource ?? 'MANUAL',
        })),
        { validate: true },
      );

      const updated = await tx.nationalTeamEdition.update({
        where: { id },
        data: {
          status: 'PREPARING',
          rosterHash: null,
          confirmedAt: null,
          lineupHash: null,
        },
        include: editionInclude,
      });
      await tx.nationalTeamLineup.deleteMany({ where: { nationalTeamEditionId: id } });

      await writeAudit(
        tx,
        'NATIONAL_TEAM_ROSTER',
        id,
        'ROSTER_UPDATED',
        reason,
        null,
        { rosterCount: body.roster.length, draftHash: rosterHash },
        ['roster'],
        source,
      );
      return serializeEdition(updated);
    });
  } catch (err) {
    wrapEngineError(err);
  }
}

export async function confirmRoster(
  id: string,
  body: { expectedUpdatedAt: string; reason: string },
  source: CommissionerAuditSource,
) {
  const reason = requireReason(body.reason);
  try {
    return await prisma.$transaction(async (tx) => {
      const edition = await tx.nationalTeamEdition.findUnique({
        where: { id },
        include: { profile: true, roster: true },
      });
      if (!edition) {
        throw new NationalTeamHttpError(
          404,
          'NationalTeamEditionNotFound',
          'National-team edition not found',
        );
      }
      assertExpectedUpdatedAt(edition.updatedAt, body.expectedUpdatedAt);
      assertEditable(edition.status);

      const rules = parseRulesSnapshot(edition.eligibilitySnapshotText);
      const rosterInputs: RosterPlayerInput[] = edition.roster.map((r) => ({
        playerId: r.sourcePlayerId,
        positionSnapshot: r.positionSnapshot,
        rosterRole: r.rosterRole,
        rosterOrder: r.rosterOrder,
        jerseyNumber: r.jerseyNumber,
        captainRole: r.captainRole,
        selectionSource: r.selectionSource,
      }));
      const playersById = await loadPlayerMap(
        tx,
        rosterInputs.map((r) => r.playerId),
      );
      const otherIds = await otherSelectedPlayerIds(tx, edition.competitionEditionId, id);
      const validation = validateNationalTeamRoster({
        roster: rosterInputs,
        playersById,
        countryId: edition.profile.countryId,
        rules,
        otherEditionSelectedPlayerIds: otherIds,
      });
      if (!validation.ok) {
        throw new NationalTeamHttpError(422, 'RosterValidationFailed', 'Roster validation failed', {
          issues: validation.issues,
        });
      }

      const rosterHash = hashRosterPlayers(rosterInputs);
      const updated = await tx.nationalTeamEdition.update({
        where: { id },
        data: {
          status: 'READY',
          rosterHash,
          confirmedAt: new Date(),
        },
        include: editionInclude,
      });

      await writeAudit(
        tx,
        'NATIONAL_TEAM_ROSTER',
        id,
        'ROSTER_CONFIRMED',
        reason,
        { status: edition.status },
        { status: 'READY', rosterHash },
        ['status', 'rosterHash', 'confirmedAt'],
        source,
      );
      return serializeEdition(updated);
    });
  } catch (err) {
    wrapEngineError(err);
  }
}

export async function reopenRoster(
  id: string,
  body: { expectedUpdatedAt: string; reason: string },
  source: CommissionerAuditSource,
) {
  const reason = requireReason(body.reason);
  return prisma.$transaction(async (tx) => {
    const edition = await tx.nationalTeamEdition.findUnique({
      where: { id },
      include: { edition: true },
    });
    if (!edition) {
      throw new NationalTeamHttpError(
        404,
        'NationalTeamEditionNotFound',
        'National-team edition not found',
      );
    }
    assertExpectedUpdatedAt(edition.updatedAt, body.expectedUpdatedAt);
    assertNotLocked(edition.status);
    if (edition.status !== 'READY') {
      throw new NationalTeamHttpError(
        409,
        'NationalTeamEditionNotReady',
        'Only READY national-team editions can be reopened',
      );
    }
    const parentStatus = edition.edition.status;
    if (parentStatus !== 'PLANNED' && parentStatus !== 'PREPARING') {
      throw new NationalTeamHttpError(
        409,
        'CompetitionEditionNotReopenable',
        'Parent competition edition must be PLANNED or PREPARING to reopen roster',
      );
    }

    const updated = await tx.nationalTeamEdition.update({
      where: { id },
      data: {
        status: 'PREPARING',
        confirmedAt: null,
        rosterHash: null,
      },
      include: editionInclude,
    });
    await writeAudit(
      tx,
      'NATIONAL_TEAM_ROSTER',
      id,
      'ROSTER_REOPENED',
      reason,
      { status: 'READY' },
      { status: 'PREPARING' },
      ['status'],
      source,
    );
    return serializeEdition(updated);
  });
}

export async function updateStaff(
  id: string,
  body: {
    expectedUpdatedAt: string;
    reason: string;
    staff: Array<{
      sourceCoachId: string;
      role: 'HEAD_COACH' | 'ASSISTANT_COACH' | 'GOALIE_COACH';
      assignmentOrder?: number;
    }>;
  },
  source: CommissionerAuditSource,
) {
  const reason = requireReason(body.reason);
  return prisma.$transaction(async (tx) => {
    const edition = await tx.nationalTeamEdition.findUnique({ where: { id } });
    if (!edition) {
      throw new NationalTeamHttpError(
        404,
        'NationalTeamEditionNotFound',
        'National-team edition not found',
      );
    }
    assertExpectedUpdatedAt(edition.updatedAt, body.expectedUpdatedAt);
    assertNotLocked(edition.status);

    const coachIds = body.staff.map((s) => s.sourceCoachId);
    const coaches = await tx.coach.findMany({ where: { id: { in: coachIds } } });
    const byId = new Map(coaches.map((c) => [c.id, c]));
    for (const s of body.staff) {
      if (!byId.has(s.sourceCoachId)) {
        throw new NationalTeamHttpError(404, 'CoachNotFound', `Coach ${s.sourceCoachId} not found`);
      }
    }

    await tx.nationalTeamStaffAssignment.deleteMany({ where: { nationalTeamEditionId: id } });
    const roleCounts = new Map<string, number>();
    for (const s of body.staff) {
      const order = s.assignmentOrder ?? (roleCounts.get(s.role) ?? 0) + 1;
      roleCounts.set(s.role, order);
      const coach = byId.get(s.sourceCoachId)!;
      await tx.nationalTeamStaffAssignment.create({
        data: {
          nationalTeamEditionId: id,
          sourceCoachId: s.sourceCoachId,
          coachNameSnapshot: `${coach.firstName} ${coach.lastName}`.trim(),
          role: s.role,
          assignmentOrder: order,
        },
      });
    }

    // Do NOT change Coach.currentTeamId — club assignment stays intact.
    const updated = await tx.nationalTeamEdition.update({
      where: { id },
      data: { updatedAt: new Date() },
      include: editionInclude,
    });

    await writeAudit(
      tx,
      'NATIONAL_TEAM_STAFF',
      id,
      'STAFF_UPDATED',
      reason,
      null,
      { staff: body.staff },
      ['staff'],
      source,
    );
    return serializeEdition(updated);
  });
}

export async function updateTactics(
  id: string,
  body: {
    expectedUpdatedAt: string;
    reason: string;
    tacticalStyle: TacticalStyle;
    tactics?: unknown;
  },
  source: CommissionerAuditSource,
) {
  const reason = requireReason(body.reason);
  return prisma.$transaction(async (tx) => {
    const edition = await tx.nationalTeamEdition.findUnique({
      where: { id },
      include: { profile: { include: { team: true } } },
    });
    if (!edition) {
      throw new NationalTeamHttpError(
        404,
        'NationalTeamEditionNotFound',
        'National-team edition not found',
      );
    }
    assertExpectedUpdatedAt(edition.updatedAt, body.expectedUpdatedAt);
    assertNotLocked(edition.status);

    const tacticsText = JSON.stringify(body.tactics ?? {});
    const tacticsHash = digest({ tacticalStyle: body.tacticalStyle, tacticsText });
    const clubTacticalStyle = edition.profile.team.tacticalStyle;

    await tx.nationalTeamTactics.upsert({
      where: { nationalTeamEditionId: id },
      create: {
        nationalTeamEditionId: id,
        tacticalStyle: body.tacticalStyle,
        tacticsText,
        tacticsHash,
      },
      update: {
        tacticalStyle: body.tacticalStyle,
        tacticsText,
        tacticsHash,
      },
    });

    const updated = await tx.nationalTeamEdition.update({
      where: { id },
      data: {
        tacticsSnapshotText: tacticsText,
        tacticsHash,
      },
      include: editionInclude,
    });

    // Do NOT touch Team.tacticalStyle
    await writeAudit(
      tx,
      'NATIONAL_TEAM_EDITION',
      id,
      'NATIONAL_TEAM_TACTICS_UPDATED',
      reason,
      { clubTacticalStyle },
      { tacticalStyle: body.tacticalStyle, tacticsHash },
      ['tactics'],
      source,
    );
    return serializeEdition(updated);
  });
}

async function persistLineup(
  tx: Prisma.TransactionClient,
  editionId: string,
  rosterHash: string,
  slots: LineupSlotInput[],
  generatedBy: string,
  nameByPlayer: Map<string, { name: string; position: string }>,
) {
  const lineupHash = hashLineupSlots(slots);
  await tx.nationalTeamLineupSlot.deleteMany({
    where: { lineup: { nationalTeamEditionId: editionId } },
  });
  await tx.nationalTeamLineup.deleteMany({ where: { nationalTeamEditionId: editionId } });

  const lineup = await tx.nationalTeamLineup.create({
    data: {
      nationalTeamEditionId: editionId,
      status: 'DRAFT',
      generatedBy,
      rosterHash,
      lineupHash,
      slots: {
        create: slots.map((s) => {
          const meta = nameByPlayer.get(s.playerId);
          return {
            unitType: s.unitType,
            unitNumber: s.unitNumber,
            slotType: s.slotType,
            sourcePlayerId: s.playerId,
            playerNameSnapshot: meta?.name ?? s.playerId,
            positionSnapshot: meta?.position ?? 'C',
            slotOrder: s.slotOrder,
          };
        }),
      },
    },
    include: { slots: { orderBy: [{ unitType: 'asc' }, { unitNumber: 'asc' }, { slotOrder: 'asc' }] } },
  });

  await tx.nationalTeamEdition.update({
    where: { id: editionId },
    data: { lineupHash },
  });
  return lineup;
}

export async function autoLineup(
  id: string,
  body: { expectedUpdatedAt: string; reason: string },
  source: CommissionerAuditSource,
) {
  const reason = requireReason(body.reason);
  try {
    return await prisma.$transaction(async (tx) => {
      const edition = await tx.nationalTeamEdition.findUnique({
        where: { id },
        include: { roster: true },
      });
      if (!edition) {
        throw new NationalTeamHttpError(
          404,
          'NationalTeamEditionNotFound',
          'National-team edition not found',
        );
      }
      assertExpectedUpdatedAt(edition.updatedAt, body.expectedUpdatedAt);
      assertNotLocked(edition.status);
      if (edition.status !== 'READY' && edition.status !== 'PREPARING') {
        throw new NationalTeamHttpError(
          409,
          'NationalTeamEditionNotReady',
          'Confirm or prepare roster before generating lineup',
        );
      }

      const rosterInputs: RosterPlayerInput[] = edition.roster.map((r) => ({
        playerId: r.sourcePlayerId,
        positionSnapshot: r.positionSnapshot,
        rosterRole: r.rosterRole,
        rosterOrder: r.rosterOrder,
        jerseyNumber: r.jerseyNumber,
        captainRole: r.captainRole,
        selectionSource: r.selectionSource,
      }));
      if (rosterInputs.length === 0) {
        throw new NationalTeamHttpError(422, 'RosterEmpty', 'Roster is empty');
      }

      const playersById = await loadPlayerMap(
        tx,
        rosterInputs.map((r) => r.playerId),
      );
      const abilityByPlayerId = new Map(
        [...playersById.entries()].map(([pid, p]) => [pid, p.effectivePerformance]),
      );
      const generated = generateNationalTeamLineup({
        roster: rosterInputs,
        abilityByPlayerId,
      });
      const validation = validateNationalTeamLineup({
        slots: generated.slots,
        rosterPlayerIds: new Set(rosterInputs.map((r) => r.playerId)),
        roster: rosterInputs,
      });
      if (!validation.ok) {
        throw new NationalTeamHttpError(422, 'LineupValidationFailed', 'Lineup validation failed', {
          issues: validation.issues,
          warnings: generated.warnings,
        });
      }

      const rosterHash = edition.rosterHash ?? hashRosterPlayers(rosterInputs);
      const nameByPlayer = new Map(
        edition.roster.map((r) => [
          r.sourcePlayerId,
          { name: r.playerNameSnapshot, position: r.positionSnapshot },
        ]),
      );
      const lineup = await persistLineup(
        tx,
        id,
        rosterHash,
        generated.slots,
        'AUTO',
        nameByPlayer,
      );

      const updated = await tx.nationalTeamEdition.findUniqueOrThrow({
        where: { id },
        include: editionInclude,
      });

      await writeAudit(
        tx,
        'NATIONAL_TEAM_LINEUP',
        id,
        'NATIONAL_TEAM_LINEUP_GENERATED',
        reason,
        null,
        { lineupHash: lineup.lineupHash, slotCount: generated.slots.length },
        ['lineup'],
        source,
      );

      return {
        edition: serializeEdition(updated),
        lineup,
        warnings: generated.warnings,
      };
    });
  } catch (err) {
    wrapEngineError(err);
  }
}

export async function updateLineup(
  id: string,
  body: {
    expectedUpdatedAt: string;
    reason: string;
    slots: Array<{
      unitType: LineupSlotInput['unitType'];
      unitNumber: number;
      slotType: LineupSlotInput['slotType'];
      playerId: string;
      slotOrder: number;
    }>;
  },
  source: CommissionerAuditSource,
) {
  const reason = requireReason(body.reason);
  try {
    return await prisma.$transaction(async (tx) => {
      const edition = await tx.nationalTeamEdition.findUnique({
        where: { id },
        include: { roster: true },
      });
      if (!edition) {
        throw new NationalTeamHttpError(
          404,
          'NationalTeamEditionNotFound',
          'National-team edition not found',
        );
      }
      assertExpectedUpdatedAt(edition.updatedAt, body.expectedUpdatedAt);
      assertNotLocked(edition.status);

      const rosterInputs: RosterPlayerInput[] = edition.roster.map((r) => ({
        playerId: r.sourcePlayerId,
        positionSnapshot: r.positionSnapshot,
        rosterRole: r.rosterRole,
        rosterOrder: r.rosterOrder,
        jerseyNumber: r.jerseyNumber,
        captainRole: r.captainRole,
        selectionSource: r.selectionSource,
      }));
      const slots: LineupSlotInput[] = body.slots;
      const validation = validateNationalTeamLineup({
        slots,
        rosterPlayerIds: new Set(rosterInputs.map((r) => r.playerId)),
        roster: rosterInputs,
      });
      if (!validation.ok) {
        throw new NationalTeamHttpError(422, 'LineupValidationFailed', 'Lineup validation failed', {
          issues: validation.issues,
        });
      }

      const rosterHash = edition.rosterHash ?? hashRosterPlayers(rosterInputs);
      const nameByPlayer = new Map(
        edition.roster.map((r) => [
          r.sourcePlayerId,
          { name: r.playerNameSnapshot, position: r.positionSnapshot },
        ]),
      );
      const lineup = await persistLineup(tx, id, rosterHash, slots, 'MANUAL', nameByPlayer);
      const updated = await tx.nationalTeamEdition.findUniqueOrThrow({
        where: { id },
        include: editionInclude,
      });

      await writeAudit(
        tx,
        'NATIONAL_TEAM_LINEUP',
        id,
        'NATIONAL_TEAM_LINEUP_UPDATED',
        reason,
        null,
        { lineupHash: lineup.lineupHash },
        ['lineup'],
        source,
      );
      return { edition: serializeEdition(updated), lineup };
    });
  } catch (err) {
    wrapEngineError(err);
  }
}

export async function getCandidates(id: string) {
  const edition = await prisma.nationalTeamEdition.findUnique({ where: { id } });
  if (!edition) return null;
  const items = await prisma.nationalTeamCandidate.findMany({
    where: { nationalTeamEditionId: id },
    orderBy: [{ rankingOrder: 'asc' }, { sourcePlayerId: 'asc' }],
  });
  return {
    editionId: id,
    items: items.map((c) => ({
      ...c,
      birthDateSnapshot: c.birthDateSnapshot?.toISOString() ?? null,
      generatedAt: c.generatedAt.toISOString(),
      createdAt: c.createdAt.toISOString(),
    })),
  };
}

export async function getRoster(id: string) {
  const edition = await prisma.nationalTeamEdition.findUnique({ where: { id } });
  if (!edition) return null;
  const items = await prisma.nationalTeamRosterPlayer.findMany({
    where: { nationalTeamEditionId: id },
    orderBy: [{ rosterRole: 'asc' }, { rosterOrder: 'asc' }],
  });
  return {
    editionId: id,
    rosterHash: edition.rosterHash,
    status: edition.status,
    items: items.map((r) => ({
      ...r,
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
    })),
  };
}

export async function getStaff(id: string) {
  const edition = await prisma.nationalTeamEdition.findUnique({ where: { id } });
  if (!edition) return null;
  const items = await prisma.nationalTeamStaffAssignment.findMany({
    where: { nationalTeamEditionId: id },
    orderBy: [{ role: 'asc' }, { assignmentOrder: 'asc' }],
  });
  return {
    editionId: id,
    items: items.map((s) => ({
      ...s,
      createdAt: s.createdAt.toISOString(),
      updatedAt: s.updatedAt.toISOString(),
    })),
  };
}

export async function getTactics(id: string) {
  const edition = await prisma.nationalTeamEdition.findUnique({ where: { id } });
  if (!edition) return null;
  const tactics = await prisma.nationalTeamTactics.findUnique({
    where: { nationalTeamEditionId: id },
  });
  if (!tactics) {
    return {
      editionId: id,
      item: null,
      tacticsHash: edition.tacticsHash,
    };
  }
  return {
    editionId: id,
    item: {
      ...tactics,
      tactics: (() => {
        try {
          return JSON.parse(tactics.tacticsText || '{}');
        } catch {
          return {};
        }
      })(),
      createdAt: tactics.createdAt.toISOString(),
      updatedAt: tactics.updatedAt.toISOString(),
    },
    tacticsHash: edition.tacticsHash,
  };
}

export async function getLineup(id: string) {
  const edition = await prisma.nationalTeamEdition.findUnique({ where: { id } });
  if (!edition) return null;
  const lineup = await prisma.nationalTeamLineup.findUnique({
    where: { nationalTeamEditionId: id },
    include: {
      slots: { orderBy: [{ unitType: 'asc' }, { unitNumber: 'asc' }, { slotOrder: 'asc' }] },
    },
  });
  if (!lineup) {
    return { editionId: id, item: null, lineupHash: edition.lineupHash };
  }
  return {
    editionId: id,
    item: {
      ...lineup,
      createdAt: lineup.createdAt.toISOString(),
      updatedAt: lineup.updatedAt.toISOString(),
      slots: lineup.slots.map((s) => ({
        ...s,
        createdAt: s.createdAt.toISOString(),
      })),
    },
    lineupHash: edition.lineupHash,
  };
}

export async function getReadiness(id: string) {
  const edition = await prisma.nationalTeamEdition.findUnique({
    where: { id },
    include: {
      profile: true,
      participant: true,
      edition: { include: { competition: true } },
      roster: true,
      staff: true,
      tactics: true,
      lineup: { include: { slots: true } },
      _count: { select: { candidates: true } },
    },
  });
  if (!edition) return null;

  const rules = parseRulesSnapshot(edition.eligibilitySnapshotText);
  const limits = rules.rosterLimits;
  const active = edition.roster.filter((r) => r.rosterRole !== 'RESERVE');
  const forwardCount = active.filter((r) => r.rosterRole === 'FORWARD').length;
  const defenseCount = active.filter((r) => r.rosterRole === 'DEFENSE').length;
  const goalieCount = active.filter((r) => r.rosterRole === 'GOALIE').length;
  const reserveCount = edition.roster.filter((r) => r.rosterRole === 'RESERVE').length;

  const otherIds = await otherSelectedPlayerIds(
    prisma,
    edition.competitionEditionId,
    edition.id,
  );
  const hasCrossTeamDuplicate = edition.roster.some((r) => otherIds.has(r.sourcePlayerId));

  const slots = (edition.lineup?.slots ?? []).map((s) => ({
    unitType: s.unitType,
    unitNumber: s.unitNumber,
    slotType: s.slotType,
    playerId: s.sourcePlayerId,
    slotOrder: s.slotOrder,
  }));
  const lineupValidation =
    slots.length > 0
      ? validateNationalTeamLineup({
          slots,
          rosterPlayerIds: new Set(edition.roster.map((r) => r.sourcePlayerId)),
          roster: edition.roster.map((r) => ({
            playerId: r.sourcePlayerId,
            positionSnapshot: r.positionSnapshot,
            rosterRole: r.rosterRole,
            rosterOrder: r.rosterOrder,
            jerseyNumber: r.jerseyNumber,
            captainRole: r.captainRole,
            selectionSource: r.selectionSource,
          })),
        })
      : { ok: false, issues: ['missing'] };

  const starter = slots.some((s) => s.unitType === 'GOALIE' && s.slotType === 'STARTER');
  const backup = slots.some((s) => s.unitType === 'GOALIE' && s.slotType === 'BACKUP');
  const rosterHash =
    edition.rosterHash ??
    hashRosterPlayers(
      edition.roster.map((r) => ({
        playerId: r.sourcePlayerId,
        positionSnapshot: r.positionSnapshot,
        rosterRole: r.rosterRole,
        rosterOrder: r.rosterOrder,
        jerseyNumber: r.jerseyNumber,
        captainRole: r.captainRole,
        selectionSource: r.selectionSource,
      })),
    );

  const readiness = evaluateNationalTeamReadiness({
    hasProfile: Boolean(edition.profile),
    hasCompetitionParticipant: Boolean(edition.participant),
    isInternationalCompetition: edition.edition.competition.type === 'INTERNATIONAL_TOURNAMENT',
    hasEligibilitySnapshot: Boolean(edition.eligibilitySnapshotText),
    candidatePoolGenerated: edition._count.candidates > 0,
    rosterConfirmed: edition.status === 'READY' || edition.status === 'LOCKED',
    rosterSize: edition.roster.length,
    minimumPlayers: limits.minimumPlayers,
    maximumPlayers: limits.maximumPlayers,
    forwardCount,
    minimumForwards: limits.minimumForwards,
    defenseCount,
    minimumDefensemen: limits.minimumDefensemen,
    goalieCount,
    minimumGoalies: limits.minimumGoalies,
    hasCrossTeamDuplicate,
    hasHeadCoach: edition.staff.some((s) => s.role === 'HEAD_COACH'),
    hasValidTactics: Boolean(edition.tactics),
    hasLineup: Boolean(edition.lineup),
    primarySlotsFilled: lineupValidation.ok,
    hasStarterAndBackupGoalie: starter && backup,
    rosterHashMatchesLineup: Boolean(
      edition.lineup && edition.lineup.rosterHash === rosterHash,
    ),
    editionArchived: edition.edition.status === 'ARCHIVED',
    hasIneligibleRosterPlayer: false,
    status: edition.status,
    reserveCount,
    weakGoalieDepth: goalieCount < 3,
  });

  return {
    editionId: id,
    editionStatus: edition.status,
    readiness,
  };
}

export async function lockNationalTeamEdition(
  id: string,
  body: { expectedUpdatedAt: string; reason: string; confirmation?: boolean },
  source: CommissionerAuditSource,
) {
  const reason = requireReason(body.reason);
  if (body.confirmation === false) {
    throw new NationalTeamHttpError(400, 'ConfirmationRequired', 'confirmation must be true');
  }

  const readinessPayload = await getReadiness(id);
  if (!readinessPayload) {
    throw new NationalTeamHttpError(
      404,
      'NationalTeamEditionNotFound',
      'National-team edition not found',
    );
  }
  if (readinessPayload.readiness.status === 'NOT_READY') {
    throw new NationalTeamHttpError(
      422,
      'NationalTeamNotReady',
      'National-team edition is not ready to lock',
      { readiness: readinessPayload.readiness },
    );
  }

  return prisma.$transaction(async (tx) => {
    const edition = await tx.nationalTeamEdition.findUnique({ where: { id } });
    if (!edition) {
      throw new NationalTeamHttpError(
        404,
        'NationalTeamEditionNotFound',
        'National-team edition not found',
      );
    }
    assertExpectedUpdatedAt(edition.updatedAt, body.expectedUpdatedAt);
    if (edition.status !== 'READY') {
      throw new NationalTeamHttpError(
        409,
        'NationalTeamEditionNotReady',
        'Only READY national-team editions can be locked',
      );
    }

    const updated = await tx.nationalTeamEdition.update({
      where: { id },
      data: {
        status: 'LOCKED',
        lockedAt: new Date(),
      },
      include: editionInclude,
    });

    await writeAudit(
      tx,
      'NATIONAL_TEAM_EDITION',
      id,
      'NATIONAL_TEAM_LOCKED',
      reason,
      { status: 'READY' },
      { status: 'LOCKED' },
      ['status', 'lockedAt'],
      source,
    );
    return serializeEdition(updated);
  });
}

export async function getNationalTeamEditionAudit(
  id: string,
  query: { page?: number; pageSize?: number },
) {
  const edition = await prisma.nationalTeamEdition.findUnique({ where: { id } });
  if (!edition) return null;
  const page = query.page && query.page > 0 ? query.page : 1;
  const pageSize =
    query.pageSize && query.pageSize > 0 ? Math.min(query.pageSize, 100) : 25;
  const where = {
    OR: [
      { entityType: 'NATIONAL_TEAM_EDITION' as const, entityId: id },
      { entityType: 'NATIONAL_TEAM_ROSTER' as const, entityId: id },
      { entityType: 'NATIONAL_TEAM_LINEUP' as const, entityId: id },
      { entityType: 'NATIONAL_TEAM_STAFF' as const, entityId: id },
    ],
  };
  const [total, rows] = await Promise.all([
    prisma.commissionerAuditLog.count({ where }),
    prisma.commissionerAuditLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
  ]);
  return {
    items: rows.map((r) => ({
      id: r.id,
      entityType: r.entityType,
      entityId: r.entityId,
      action: r.action,
      reason: r.reason,
      source: r.source,
      createdAt: r.createdAt.toISOString(),
    })),
    total,
    page,
    pageSize,
  };
}

/** Exported for tests / callers that need role defaults. */
export { defaultRosterRoleForPosition };
