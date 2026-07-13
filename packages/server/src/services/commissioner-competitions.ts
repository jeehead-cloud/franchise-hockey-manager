/**
 * F17 Commissioner competition writes — gated, transactional, audited.
 */
import type { CommissionerAuditSource, Prisma } from '@prisma/client';
import {
  getCompetitionRulesTemplate,
  validateStageDependencyGraph,
  type CompetitionEditionStatus,
  type CompetitionRules,
  type CompetitionRulesTemplateKey,
  type CompetitionStageType,
  type StageParticipantSource,
} from '@fhm/engine';
import { prisma } from '../db/client.js';
import { CommissionerHttpError } from '../commissioner/errors.js';
import {
  assertEditableEdition,
  assertExpectedUpdatedAt,
  assertTransition,
  loadEditionStructure,
  mapStageToDefinition,
  parseStageConfigText,
  parseStoredRules,
  rulesPayload,
  transitionRequiresReadiness,
  validateCompetitionRules,
  writeCompetitionAudit,
} from './competition-helpers.js';
import { getCompetitionEditionDetail } from './competition-editions.js';

function requireReason(reason: string | undefined) {
  if (!reason || reason.trim().length < 3) {
    throw new CommissionerHttpError(400, 'InvalidReason', 'reason must be at least 3 characters');
  }
  return reason.trim();
}

export async function updateCompetition(
  competitionId: string,
  body: {
    expectedUpdatedAt: string;
    reason: string;
    name?: string;
    shortName?: string | null;
    simulationLevel?: 'DETAILED' | 'AGGREGATED' | null;
    countryId?: string | null;
    leagueId?: string | null;
    defaultRules?: unknown;
  },
  source: CommissionerAuditSource,
) {
  const reason = requireReason(body.reason);
  return prisma.$transaction(async (tx) => {
    const row = await tx.competition.findUnique({ where: { id: competitionId } });
    if (!row) throw new CommissionerHttpError(404, 'CompetitionNotFound', 'Competition not found');
    assertExpectedUpdatedAt(row.updatedAt, body.expectedUpdatedAt);

    const data: Prisma.CompetitionUpdateInput = {};
    const changed: string[] = [];
    if (body.name !== undefined && body.name !== row.name) {
      data.name = body.name;
      changed.push('name');
    }
    if (body.shortName !== undefined && body.shortName !== row.shortName) {
      data.shortName = body.shortName;
      changed.push('shortName');
    }
    if (body.simulationLevel !== undefined && body.simulationLevel !== row.simulationLevel) {
      data.simulationLevel = body.simulationLevel;
      changed.push('simulationLevel');
    }
    if (body.countryId !== undefined) {
      data.country = body.countryId
        ? { connect: { id: body.countryId } }
        : { disconnect: true };
      changed.push('countryId');
    }
    if (body.leagueId !== undefined) {
      data.league = body.leagueId ? { connect: { id: body.leagueId } } : { disconnect: true };
      changed.push('leagueId');
    }
    if (body.defaultRules !== undefined) {
      const rules = validateCompetitionRules(body.defaultRules);
      data.defaultRulesJson = JSON.stringify(rules);
      changed.push('defaultRulesJson');
    }
    if (changed.length === 0) {
      throw new CommissionerHttpError(400, 'NoChanges', 'No competition fields changed');
    }

    const updated = await tx.competition.update({ where: { id: competitionId }, data });
    await writeCompetitionAudit(
      tx,
      'COMPETITION',
      competitionId,
      'COMPETITION_UPDATED',
      reason,
      row,
      updated,
      changed,
      source,
    );
    return updated;
  });
}

export async function createEdition(
  competitionId: string,
  body: {
    worldSeasonId: string;
    displayName: string;
    templateKey?: CompetitionRulesTemplateKey;
    editionNumber?: number | null;
    reason: string;
  },
  source: CommissionerAuditSource,
) {
  const reason = requireReason(body.reason);
  return prisma.$transaction(async (tx) => {
    const competition = await tx.competition.findUnique({ where: { id: competitionId } });
    if (!competition) {
      throw new CommissionerHttpError(404, 'CompetitionNotFound', 'Competition not found');
    }
    const season = await tx.worldSeason.findUnique({ where: { id: body.worldSeasonId } });
    if (!season) {
      throw new CommissionerHttpError(404, 'WorldSeasonNotFound', 'World season not found');
    }
    const existing = await tx.competitionEdition.findUnique({
      where: {
        competitionId_worldSeasonId: {
          competitionId,
          worldSeasonId: body.worldSeasonId,
        },
      },
    });
    if (existing) {
      throw new CommissionerHttpError(
        409,
        'EditionExists',
        'An edition already exists for this competition and world season',
      );
    }

    let rules: CompetitionRules;
    if (body.templateKey) {
      rules = validateCompetitionRules(getCompetitionRulesTemplate(body.templateKey));
    } else if (competition.defaultRulesJson) {
      rules = parseStoredRules(competition.defaultRulesJson);
    } else {
      rules = validateCompetitionRules(getCompetitionRulesTemplate('SIMPLE_LEAGUE'));
    }
    const { rulesSnapshotText, rulesHash } = rulesPayload(rules);

    const created = await tx.competitionEdition.create({
      data: {
        competitionId,
        worldSeasonId: body.worldSeasonId,
        displayName: body.displayName.trim(),
        status: 'PREPARING',
        editionNumber: body.editionNumber ?? null,
        rulesSnapshotText,
        rulesHash,
        preparedAt: new Date(),
      },
    });

    await writeCompetitionAudit(
      tx,
      'COMPETITION_EDITION',
      created.id,
      'EDITION_CREATED',
      reason,
      null,
      created,
      ['displayName', 'status', 'rulesHash', 'worldSeasonId'],
      source,
    );
    return created;
  });
}

export async function updateEdition(
  editionId: string,
  body: {
    expectedUpdatedAt: string;
    reason: string;
    displayName?: string;
    editionNumber?: number | null;
  },
  source: CommissionerAuditSource,
) {
  const reason = requireReason(body.reason);
  return prisma.$transaction(async (tx) => {
    const row = await tx.competitionEdition.findUnique({ where: { id: editionId } });
    if (!row) throw new CommissionerHttpError(404, 'EditionNotFound', 'Edition not found');
    assertExpectedUpdatedAt(row.updatedAt, body.expectedUpdatedAt);
    assertEditableEdition(row.status as CompetitionEditionStatus);

    const data: Prisma.CompetitionEditionUpdateInput = {};
    const changed: string[] = [];
    if (body.displayName !== undefined && body.displayName !== row.displayName) {
      data.displayName = body.displayName.trim();
      changed.push('displayName');
    }
    if (body.editionNumber !== undefined && body.editionNumber !== row.editionNumber) {
      data.editionNumber = body.editionNumber;
      changed.push('editionNumber');
    }
    if (changed.length === 0) {
      throw new CommissionerHttpError(400, 'NoChanges', 'No edition fields changed');
    }
    const updated = await tx.competitionEdition.update({ where: { id: editionId }, data });
    await writeCompetitionAudit(
      tx,
      'COMPETITION_EDITION',
      editionId,
      'EDITION_UPDATED',
      reason,
      row,
      updated,
      changed,
      source,
    );
    return updated;
  });
}

export async function updateEditionRules(
  editionId: string,
  body: { expectedUpdatedAt: string; reason: string; rules: unknown },
  source: CommissionerAuditSource,
) {
  const reason = requireReason(body.reason);
  return prisma.$transaction(async (tx) => {
    const row = await tx.competitionEdition.findUnique({ where: { id: editionId } });
    if (!row) throw new CommissionerHttpError(404, 'EditionNotFound', 'Edition not found');
    assertExpectedUpdatedAt(row.updatedAt, body.expectedUpdatedAt);
    assertEditableEdition(row.status as CompetitionEditionStatus);

    let rules: CompetitionRules;
    try {
      rules = validateCompetitionRules(body.rules);
    } catch (err) {
      throw new CommissionerHttpError(
        422,
        'InvalidCompetitionRules',
        err instanceof Error ? err.message : 'Invalid rules',
      );
    }
    const payload = rulesPayload(rules);
    const updated = await tx.competitionEdition.update({
      where: { id: editionId },
      data: {
        rulesSnapshotText: payload.rulesSnapshotText,
        rulesHash: payload.rulesHash,
      },
    });
    await writeCompetitionAudit(
      tx,
      'COMPETITION_EDITION',
      editionId,
      'EDITION_RULES_UPDATED',
      reason,
      { rulesHash: row.rulesHash },
      { rulesHash: updated.rulesHash },
      ['rulesSnapshotText', 'rulesHash'],
      source,
    );
    return updated;
  });
}

export async function transitionEdition(
  editionId: string,
  body: {
    expectedUpdatedAt: string;
    reason: string;
    targetStatus: CompetitionEditionStatus;
  },
  source: CommissionerAuditSource,
) {
  const reason = requireReason(body.reason);
  return prisma.$transaction(async (tx) => {
    const row = await tx.competitionEdition.findUnique({ where: { id: editionId } });
    if (!row) throw new CommissionerHttpError(404, 'EditionNotFound', 'Edition not found');
    assertExpectedUpdatedAt(row.updatedAt, body.expectedUpdatedAt);
    const from = row.status as CompetitionEditionStatus;
    const to = body.targetStatus;
    assertTransition(from, to);

    if (transitionRequiresReadiness(to)) {
      const { readiness } = await loadEditionStructure(tx, editionId);
      if (readiness.blockers.length > 0) {
        throw new CommissionerHttpError(
          409,
          'EditionNotReady',
          readiness.blockers[0] ?? 'Edition is not ready',
          { readiness },
        );
      }
    }

    // F20: ARCHIVED requires the dedicated archive endpoint (creates immutable snapshot).
    if (to === 'ARCHIVED') {
      throw new CommissionerHttpError(
        409,
        'ArchiveRequired',
        'Use POST /api/commissioner/competition-editions/:id/archive to archive a COMPLETED edition',
      );
    }

    const data: Prisma.CompetitionEditionUpdateInput = { status: to };
    if (to === 'PREPARING' && !row.preparedAt) data.preparedAt = new Date();
    if (to === 'ACTIVE') data.activatedAt = new Date();
    if (to === 'COMPLETED') {
      const { getEditionCompletionReadiness } = await import('./playoffs-reads.js');
      const readiness = await getEditionCompletionReadiness(editionId);
      if (!readiness?.canCompleteEdition) {
        throw new CommissionerHttpError(
          409,
          'EditionNotReady',
          'Edition cannot be completed yet',
          { blockers: readiness?.blockers ?? ['Unknown blockers'] },
        );
      }
      data.completedAt = new Date();
    }

    const updated = await tx.competitionEdition.update({ where: { id: editionId }, data });
    await writeCompetitionAudit(
      tx,
      'COMPETITION_EDITION',
      editionId,
      'EDITION_STATUS_CHANGED',
      reason,
      { status: from },
      { status: to },
      ['status'],
      source,
    );
    return updated;
  });
}

export async function addParticipant(
  editionId: string,
  body: {
    expectedUpdatedAt: string;
    reason: string;
    teamId: string;
    status?: 'INVITED' | 'CONFIRMED';
    seed?: number | null;
    groupKey?: string | null;
    source?: 'MANUAL' | 'LEAGUE_MEMBERSHIP' | 'HOST' | 'DEFENDING_CHAMPION' | 'IMPORTED';
  },
  auditSource: CommissionerAuditSource,
) {
  const reason = requireReason(body.reason);
  return prisma.$transaction(async (tx) => {
    const edition = await tx.competitionEdition.findUnique({ where: { id: editionId } });
    if (!edition) throw new CommissionerHttpError(404, 'EditionNotFound', 'Edition not found');
    assertExpectedUpdatedAt(edition.updatedAt, body.expectedUpdatedAt);
    assertEditableEdition(edition.status as CompetitionEditionStatus);

    const team = await tx.team.findUnique({ where: { id: body.teamId } });
    if (!team) throw new CommissionerHttpError(404, 'TeamNotFound', 'Team not found');

    const dup = await tx.competitionParticipant.findUnique({
      where: {
        competitionEditionId_teamId: { competitionEditionId: editionId, teamId: body.teamId },
      },
    });
    if (dup) {
      throw new CommissionerHttpError(409, 'ParticipantExists', 'Team is already a participant');
    }

    const maxOrder = await tx.competitionParticipant.aggregate({
      where: { competitionEditionId: editionId },
      _max: { participantOrder: true },
    });
    const participantOrder = (maxOrder._max.participantOrder ?? 0) + 1;

    const created = await tx.competitionParticipant.create({
      data: {
        competitionEditionId: editionId,
        teamId: body.teamId,
        participantOrder,
        status: body.status ?? 'CONFIRMED',
        seed: body.seed ?? null,
        groupKey: body.groupKey ?? null,
        source: body.source ?? 'MANUAL',
        teamNameSnapshot: team.name,
        teamShortNameSnapshot: team.shortName,
      },
    });
    await tx.competitionEdition.update({
      where: { id: editionId },
      data: { updatedAt: new Date() },
    });
    await writeCompetitionAudit(
      tx,
      'COMPETITION_PARTICIPANT',
      created.id,
      'PARTICIPANT_ADDED',
      reason,
      null,
      created,
      ['teamId', 'status', 'participantOrder'],
      auditSource,
    );
    return created;
  });
}

export async function updateParticipant(
  editionId: string,
  participantId: string,
  body: {
    expectedUpdatedAt: string;
    reason: string;
    status?: 'INVITED' | 'CONFIRMED' | 'WITHDRAWN';
    seed?: number | null;
    groupKey?: string | null;
    participantOrder?: number;
  },
  source: CommissionerAuditSource,
) {
  const reason = requireReason(body.reason);
  return prisma.$transaction(async (tx) => {
    const edition = await tx.competitionEdition.findUnique({ where: { id: editionId } });
    if (!edition) throw new CommissionerHttpError(404, 'EditionNotFound', 'Edition not found');
    assertExpectedUpdatedAt(edition.updatedAt, body.expectedUpdatedAt);
    assertEditableEdition(edition.status as CompetitionEditionStatus);

    const row = await tx.competitionParticipant.findFirst({
      where: { id: participantId, competitionEditionId: editionId },
    });
    if (!row) throw new CommissionerHttpError(404, 'ParticipantNotFound', 'Participant not found');

    const data: Prisma.CompetitionParticipantUpdateInput = {};
    const changed: string[] = [];
    if (body.status !== undefined && body.status !== row.status) {
      data.status = body.status;
      changed.push('status');
    }
    if (body.seed !== undefined && body.seed !== row.seed) {
      data.seed = body.seed;
      changed.push('seed');
    }
    if (body.groupKey !== undefined && body.groupKey !== row.groupKey) {
      data.groupKey = body.groupKey;
      changed.push('groupKey');
    }
    if (body.participantOrder !== undefined && body.participantOrder !== row.participantOrder) {
      data.participantOrder = body.participantOrder;
      changed.push('participantOrder');
    }
    if (changed.length === 0) {
      throw new CommissionerHttpError(400, 'NoChanges', 'No participant fields changed');
    }

    const updated = await tx.competitionParticipant.update({ where: { id: participantId }, data });
    await tx.competitionEdition.update({
      where: { id: editionId },
      data: { updatedAt: new Date() },
    });
    await writeCompetitionAudit(
      tx,
      'COMPETITION_PARTICIPANT',
      participantId,
      'PARTICIPANT_UPDATED',
      reason,
      row,
      updated,
      changed,
      source,
    );
    return updated;
  });
}

export async function removeParticipant(
  editionId: string,
  participantId: string,
  body: { expectedUpdatedAt: string; reason: string },
  source: CommissionerAuditSource,
) {
  const reason = requireReason(body.reason);
  return prisma.$transaction(async (tx) => {
    const edition = await tx.competitionEdition.findUnique({ where: { id: editionId } });
    if (!edition) throw new CommissionerHttpError(404, 'EditionNotFound', 'Edition not found');
    assertExpectedUpdatedAt(edition.updatedAt, body.expectedUpdatedAt);
    assertEditableEdition(edition.status as CompetitionEditionStatus);

    const row = await tx.competitionParticipant.findFirst({
      where: { id: participantId, competitionEditionId: editionId },
    });
    if (!row) throw new CommissionerHttpError(404, 'ParticipantNotFound', 'Participant not found');

    const stageLinks = await tx.stageParticipant.count({
      where: { competitionParticipantId: participantId },
    });
    if (stageLinks > 0) {
      throw new CommissionerHttpError(
        409,
        'ParticipantInStage',
        'Remove stage participant links before removing the edition participant',
      );
    }

    await tx.competitionParticipant.delete({ where: { id: participantId } });
    await tx.competitionEdition.update({
      where: { id: editionId },
      data: { updatedAt: new Date() },
    });
    await writeCompetitionAudit(
      tx,
      'COMPETITION_PARTICIPANT',
      participantId,
      'PARTICIPANT_REMOVED',
      reason,
      row,
      null,
      ['deleted'],
      source,
    );
    return { deleted: true, id: participantId };
  });
}

export async function addParticipantsFromLeague(
  editionId: string,
  body: {
    expectedUpdatedAt: string;
    reason: string;
    leagueId: string;
    status?: 'INVITED' | 'CONFIRMED';
  },
  source: CommissionerAuditSource,
) {
  const reason = requireReason(body.reason);
  return prisma.$transaction(async (tx) => {
    const edition = await tx.competitionEdition.findUnique({ where: { id: editionId } });
    if (!edition) throw new CommissionerHttpError(404, 'EditionNotFound', 'Edition not found');
    assertExpectedUpdatedAt(edition.updatedAt, body.expectedUpdatedAt);
    assertEditableEdition(edition.status as CompetitionEditionStatus);

    const league = await tx.league.findUnique({
      where: { id: body.leagueId },
      include: { teams: { orderBy: { name: 'asc' } } },
    });
    if (!league) throw new CommissionerHttpError(404, 'LeagueNotFound', 'League not found');

    const existing = await tx.competitionParticipant.findMany({
      where: { competitionEditionId: editionId },
      select: { teamId: true, participantOrder: true },
    });
    const existingTeams = new Set(existing.map((e) => e.teamId));
    let nextOrder = existing.reduce((m, e) => Math.max(m, e.participantOrder), 0);
    const added: string[] = [];
    const skipped: string[] = [];

    for (const team of league.teams) {
      if (existingTeams.has(team.id)) {
        skipped.push(team.id);
        continue;
      }
      nextOrder += 1;
      const created = await tx.competitionParticipant.create({
        data: {
          competitionEditionId: editionId,
          teamId: team.id,
          participantOrder: nextOrder,
          status: body.status ?? 'CONFIRMED',
          source: 'LEAGUE_MEMBERSHIP',
          teamNameSnapshot: team.name,
          teamShortNameSnapshot: team.shortName,
        },
      });
      added.push(created.id);
    }

    await tx.competitionEdition.update({
      where: { id: editionId },
      data: { updatedAt: new Date() },
    });
    await writeCompetitionAudit(
      tx,
      'COMPETITION_EDITION',
      editionId,
      'LEAGUE_PARTICIPANTS_ADDED',
      reason,
      { existing: existing.length },
      { added: added.length, skipped: skipped.length, leagueId: body.leagueId },
      ['participants'],
      source,
    );
    return { addedCount: added.length, skippedCount: skipped.length, addedIds: added, skippedTeamIds: skipped };
  });
}

export async function createStage(
  editionId: string,
  body: {
    expectedUpdatedAt: string;
    reason: string;
    name: string;
    stageType: CompetitionStageType;
    stageOrder: number;
    participantSource: StageParticipantSource;
    sourceStageId?: string | null;
    expectedQualifierCount?: number | null;
    config: unknown;
  },
  source: CommissionerAuditSource,
) {
  const reason = requireReason(body.reason);
  return prisma.$transaction(async (tx) => {
    const edition = await tx.competitionEdition.findUnique({
      where: { id: editionId },
      include: { stages: true },
    });
    if (!edition) throw new CommissionerHttpError(404, 'EditionNotFound', 'Edition not found');
    assertExpectedUpdatedAt(edition.updatedAt, body.expectedUpdatedAt);
    assertEditableEdition(edition.status as CompetitionEditionStatus);

    const parsed = parseStageConfigText(body.stageType, JSON.stringify(body.config));
    const created = await tx.competitionStage.create({
      data: {
        competitionEditionId: editionId,
        name: body.name.trim(),
        stageType: body.stageType,
        stageOrder: body.stageOrder,
        participantSource: body.participantSource,
        sourceStageId: body.sourceStageId ?? null,
        expectedQualifierCount: body.expectedQualifierCount ?? null,
        configText: parsed.configText,
        configHash: parsed.configHash,
        status: 'PLANNED',
      },
    });

    const allStages = await tx.competitionStage.findMany({
      where: { competitionEditionId: editionId },
      orderBy: { stageOrder: 'asc' },
    });
    try {
      validateStageDependencyGraph(
        allStages.map((s) =>
          mapStageToDefinition({
            ...s,
            stageType: s.stageType as CompetitionStageType,
            participantSource: s.participantSource as StageParticipantSource,
          }),
        ),
      );
    } catch (err) {
      throw new CommissionerHttpError(
        422,
        'InvalidStageDependency',
        err instanceof Error ? err.message : 'Invalid stage dependency',
      );
    }

    await tx.competitionEdition.update({
      where: { id: editionId },
      data: { updatedAt: new Date() },
    });
    await writeCompetitionAudit(
      tx,
      'COMPETITION_STAGE',
      created.id,
      'STAGE_CREATED',
      reason,
      null,
      created,
      ['name', 'stageType', 'stageOrder', 'configHash'],
      source,
    );
    return created;
  });
}

export async function updateStage(
  stageId: string,
  body: {
    expectedUpdatedAt: string;
    reason: string;
    name?: string;
    stageOrder?: number;
    participantSource?: StageParticipantSource;
    sourceStageId?: string | null;
    expectedQualifierCount?: number | null;
    config?: unknown;
    status?: 'PLANNED' | 'READY' | 'CANCELLED';
  },
  source: CommissionerAuditSource,
) {
  const reason = requireReason(body.reason);
  return prisma.$transaction(async (tx) => {
    const row = await tx.competitionStage.findUnique({ where: { id: stageId } });
    if (!row) throw new CommissionerHttpError(404, 'StageNotFound', 'Stage not found');
    const edition = await tx.competitionEdition.findUnique({
      where: { id: row.competitionEditionId },
    });
    if (!edition) throw new CommissionerHttpError(404, 'EditionNotFound', 'Edition not found');
    assertExpectedUpdatedAt(edition.updatedAt, body.expectedUpdatedAt);
    assertEditableEdition(edition.status as CompetitionEditionStatus);

    const data: Prisma.CompetitionStageUpdateInput = {};
    const changed: string[] = [];
    if (body.name !== undefined) {
      data.name = body.name.trim();
      changed.push('name');
    }
    if (body.stageOrder !== undefined) {
      data.stageOrder = body.stageOrder;
      changed.push('stageOrder');
    }
    if (body.participantSource !== undefined) {
      data.participantSource = body.participantSource;
      changed.push('participantSource');
    }
    if (body.sourceStageId !== undefined) {
      data.sourceStage = body.sourceStageId
        ? { connect: { id: body.sourceStageId } }
        : { disconnect: true };
      changed.push('sourceStageId');
    }
    if (body.expectedQualifierCount !== undefined) {
      data.expectedQualifierCount = body.expectedQualifierCount;
      changed.push('expectedQualifierCount');
    }
    if (body.status !== undefined) {
      data.status = body.status;
      changed.push('status');
    }
    if (body.config !== undefined) {
      const parsed = parseStageConfigText(row.stageType as CompetitionStageType, JSON.stringify(body.config));
      data.configText = parsed.configText;
      data.configHash = parsed.configHash;
      changed.push('configText', 'configHash');
    }
    if (changed.length === 0) {
      throw new CommissionerHttpError(400, 'NoChanges', 'No stage fields changed');
    }

    const updated = await tx.competitionStage.update({ where: { id: stageId }, data });
    await loadEditionStructure(tx, edition.id); // throws if dependency graph invalid after update? readiness only
    await tx.competitionEdition.update({
      where: { id: edition.id },
      data: { updatedAt: new Date() },
    });
    await writeCompetitionAudit(
      tx,
      'COMPETITION_STAGE',
      stageId,
      'STAGE_UPDATED',
      reason,
      row,
      updated,
      changed,
      source,
    );
    return updated;
  });
}

export async function removeStage(
  stageId: string,
  body: { expectedUpdatedAt: string; reason: string },
  source: CommissionerAuditSource,
) {
  const reason = requireReason(body.reason);
  return prisma.$transaction(async (tx) => {
    const row = await tx.competitionStage.findUnique({ where: { id: stageId } });
    if (!row) throw new CommissionerHttpError(404, 'StageNotFound', 'Stage not found');
    const edition = await tx.competitionEdition.findUnique({
      where: { id: row.competitionEditionId },
    });
    if (!edition) throw new CommissionerHttpError(404, 'EditionNotFound', 'Edition not found');
    assertExpectedUpdatedAt(edition.updatedAt, body.expectedUpdatedAt);
    assertEditableEdition(edition.status as CompetitionEditionStatus);

    const dependents = await tx.competitionStage.count({ where: { sourceStageId: stageId } });
    if (dependents > 0) {
      throw new CommissionerHttpError(
        409,
        'StageHasDependents',
        'Other stages depend on this stage; update them first',
      );
    }

    await tx.stageParticipant.deleteMany({ where: { competitionStageId: stageId } });
    await tx.competitionStage.delete({ where: { id: stageId } });
    await tx.competitionEdition.update({
      where: { id: edition.id },
      data: { updatedAt: new Date() },
    });
    await writeCompetitionAudit(
      tx,
      'COMPETITION_STAGE',
      stageId,
      'STAGE_REMOVED',
      reason,
      row,
      null,
      ['deleted'],
      source,
    );
    return { deleted: true, id: stageId };
  });
}

export async function reorderStages(
  editionId: string,
  body: {
    expectedUpdatedAt: string;
    reason: string;
    orderedStageIds: string[];
  },
  source: CommissionerAuditSource,
) {
  const reason = requireReason(body.reason);
  return prisma.$transaction(async (tx) => {
    const edition = await tx.competitionEdition.findUnique({
      where: { id: editionId },
      include: { stages: true },
    });
    if (!edition) throw new CommissionerHttpError(404, 'EditionNotFound', 'Edition not found');
    assertExpectedUpdatedAt(edition.updatedAt, body.expectedUpdatedAt);
    assertEditableEdition(edition.status as CompetitionEditionStatus);

    if (body.orderedStageIds.length !== edition.stages.length) {
      throw new CommissionerHttpError(400, 'InvalidReorder', 'orderedStageIds must include every stage');
    }
    const idSet = new Set(edition.stages.map((s) => s.id));
    for (const id of body.orderedStageIds) {
      if (!idSet.has(id)) {
        throw new CommissionerHttpError(400, 'InvalidReorder', `Unknown stage id ${id}`);
      }
    }

    // Two-phase reorder to avoid unique constraint collisions
    for (let i = 0; i < body.orderedStageIds.length; i++) {
      await tx.competitionStage.update({
        where: { id: body.orderedStageIds[i] },
        data: { stageOrder: 10_000 + i },
      });
    }
    for (let i = 0; i < body.orderedStageIds.length; i++) {
      await tx.competitionStage.update({
        where: { id: body.orderedStageIds[i] },
        data: { stageOrder: i + 1 },
      });
    }

    await tx.competitionEdition.update({
      where: { id: editionId },
      data: { updatedAt: new Date() },
    });
    await writeCompetitionAudit(
      tx,
      'COMPETITION_EDITION',
      editionId,
      'STAGE_REORDERED',
      reason,
      { order: edition.stages.map((s) => s.id) },
      { order: body.orderedStageIds },
      ['stageOrder'],
      source,
    );
    return { orderedStageIds: body.orderedStageIds };
  });
}

export async function setStageParticipants(
  stageId: string,
  body: {
    expectedUpdatedAt: string;
    reason: string;
    participantIds: string[];
  },
  source: CommissionerAuditSource,
) {
  const reason = requireReason(body.reason);
  return prisma.$transaction(async (tx) => {
    const stage = await tx.competitionStage.findUnique({ where: { id: stageId } });
    if (!stage) throw new CommissionerHttpError(404, 'StageNotFound', 'Stage not found');
    const edition = await tx.competitionEdition.findUnique({
      where: { id: stage.competitionEditionId },
    });
    if (!edition) throw new CommissionerHttpError(404, 'EditionNotFound', 'Edition not found');
    assertExpectedUpdatedAt(edition.updatedAt, body.expectedUpdatedAt);
    assertEditableEdition(edition.status as CompetitionEditionStatus);

    if (stage.participantSource !== 'MANUAL' && stage.participantSource !== 'FIXED_CONFIG') {
      throw new CommissionerHttpError(
        409,
        'StageSourceNotManual',
        'Only MANUAL or FIXED_CONFIG stages accept direct stage participants in F17',
      );
    }

    const editionParticipants = await tx.competitionParticipant.findMany({
      where: { competitionEditionId: edition.id, id: { in: body.participantIds } },
    });
    if (editionParticipants.length !== body.participantIds.length) {
      throw new CommissionerHttpError(
        422,
        'InvalidStageParticipants',
        'All stage participants must belong to the same edition',
      );
    }

    await tx.stageParticipant.deleteMany({ where: { competitionStageId: stageId } });
    let order = 0;
    for (const pid of body.participantIds) {
      order += 1;
      await tx.stageParticipant.create({
        data: {
          competitionStageId: stageId,
          competitionParticipantId: pid,
          stageOrder: order,
          status: 'CONFIRMED',
        },
      });
    }

    await tx.competitionEdition.update({
      where: { id: edition.id },
      data: { updatedAt: new Date() },
    });
    await writeCompetitionAudit(
      tx,
      'COMPETITION_STAGE',
      stageId,
      'STAGE_PARTICIPANTS_UPDATED',
      reason,
      null,
      { participantIds: body.participantIds },
      ['stageParticipants'],
      source,
    );
    return { participantIds: body.participantIds };
  });
}

export async function listEditionAudit(editionId: string, query: Record<string, unknown> = {}) {
  const page = Math.max(1, Number(query.page) || 1);
  const pageSize = Math.min(100, Math.max(1, Number(query.pageSize) || 25));
  const stageIds = (
    await prisma.competitionStage.findMany({
      where: { competitionEditionId: editionId },
      select: { id: true },
    })
  ).map((s) => s.id);
  const participantIds = (
    await prisma.competitionParticipant.findMany({
      where: { competitionEditionId: editionId },
      select: { id: true },
    })
  ).map((p) => p.id);

  const where: Prisma.CommissionerAuditLogWhereInput = {
    OR: [
      { entityType: 'COMPETITION_EDITION', entityId: editionId },
      { entityType: 'COMPETITION_STAGE', entityId: { in: stageIds } },
      { entityType: 'COMPETITION_PARTICIPANT', entityId: { in: participantIds } },
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
      changedFields: JSON.parse(r.changedFieldsJson) as string[],
      createdAt: r.createdAt.toISOString(),
      source: r.source,
    })),
    page,
    pageSize,
    total,
  };
}

export async function getCommissionerEdition(editionId: string) {
  return getCompetitionEditionDetail(editionId);
}
