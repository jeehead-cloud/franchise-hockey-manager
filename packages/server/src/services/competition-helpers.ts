/**
 * Shared helpers for F17 competition read/write services.
 */
import type { CommissionerAuditAction, CommissionerAuditSource, Prisma, PrismaClient } from '@prisma/client';
import {
  assertEditionStructurallyEditable,
  assertEditionTransition,
  evaluateEditionReadiness,
  hashCompetitionRules,
  hashStageConfig,
  parseCompetitionRulesJson,
  transitionRequiresReadiness,
  validateCompetitionRules,
  validateStageConfig,
  validateStageDependencyGraph,
  type CompetitionEditionStatus,
  type CompetitionRules,
  type CompetitionStageDefinition,
  type CompetitionStageType,
  type EditionReadinessResult,
  type StageParticipantSource,
} from '@fhm/engine';
import { CommissionerHttpError } from '../commissioner/errors.js';

export function assertExpectedUpdatedAt(current: Date, expected: string | undefined | null) {
  if (!expected || current.toISOString() !== expected) {
    throw new CommissionerHttpError(
      409,
      'EditConflict',
      'Resource was modified elsewhere; reload and retry',
      { currentUpdatedAt: current.toISOString() },
    );
  }
}

export async function writeCompetitionAudit(
  tx: Prisma.TransactionClient,
  entityType:
    | 'COMPETITION'
    | 'COMPETITION_EDITION'
    | 'COMPETITION_STAGE'
    | 'COMPETITION_PARTICIPANT',
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

export function parseStoredRules(text: string): CompetitionRules {
  try {
    return parseCompetitionRulesJson(text);
  } catch (err) {
    throw new CommissionerHttpError(
      422,
      'InvalidCompetitionRules',
      err instanceof Error ? err.message : 'Invalid competition rules',
    );
  }
}

export function rulesPayload(rules: CompetitionRules) {
  return {
    rules,
    rulesHash: hashCompetitionRules(rules),
    rulesSnapshotText: JSON.stringify(rules),
  };
}

export function parseStageConfigText(stageType: CompetitionStageType, text: string) {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new CommissionerHttpError(422, 'InvalidStageConfig', 'Stage config is not valid JSON');
  }
  try {
    const config = validateStageConfig(stageType, parsed);
    return { config, configText: JSON.stringify(config), configHash: hashStageConfig(config) };
  } catch (err) {
    throw new CommissionerHttpError(
      422,
      'InvalidStageConfig',
      err instanceof Error ? err.message : 'Invalid stage config',
    );
  }
}

export function mapStageToDefinition(row: {
  id: string;
  name: string;
  stageType: CompetitionStageType;
  stageOrder: number;
  status: string;
  participantSource: StageParticipantSource;
  sourceStageId: string | null;
  expectedQualifierCount: number | null;
  configText: string;
}): CompetitionStageDefinition {
  const { config } = parseStageConfigText(row.stageType, row.configText);
  return {
    id: row.id,
    name: row.name,
    stageType: row.stageType,
    stageOrder: row.stageOrder,
    status: row.status as CompetitionStageDefinition['status'],
    participantSource: row.participantSource,
    sourceStageId: row.sourceStageId,
    expectedQualifierCount: row.expectedQualifierCount,
    config,
  };
}

export async function loadEditionStructure(
  prisma: Prisma.TransactionClient | PrismaClient,
  editionId: string,
): Promise<{
  edition: {
    id: string;
    status: CompetitionEditionStatus;
    worldSeasonId: string;
    rulesSnapshotText: string;
    competitionId: string;
  };
  readiness: EditionReadinessResult;
  stages: CompetitionStageDefinition[];
}> {
  const edition = await prisma.competitionEdition.findUnique({
    where: { id: editionId },
    include: {
      participants: true,
      stages: { orderBy: { stageOrder: 'asc' }, include: { participants: true } },
      competition: { select: { type: true } },
    },
  });
  if (!edition) {
    throw new CommissionerHttpError(404, 'EditionNotFound', 'Competition edition not found');
  }

  const rules = parseStoredRules(edition.rulesSnapshotText);
  const stages = edition.stages.map((s) =>
    mapStageToDefinition({
      ...s,
      stageType: s.stageType as CompetitionStageType,
      participantSource: s.participantSource as StageParticipantSource,
    }),
  );

  try {
    validateStageDependencyGraph(stages);
  } catch {
    // readiness will surface dependency issues
  }

  const stageParticipantCounts: Record<string, number> = {};
  for (const s of edition.stages) {
    stageParticipantCounts[s.id] = s.participants.length;
  }

  let readiness = evaluateEditionReadiness({
    editionId: edition.id,
    status: edition.status as CompetitionEditionStatus,
    worldSeasonId: edition.worldSeasonId,
    rules,
    participants: edition.participants.map((p) => ({
      id: p.id,
      teamId: p.teamId,
      status: p.status as 'INVITED' | 'CONFIRMED' | 'WITHDRAWN' | 'ELIMINATED' | 'CHAMPION',
      seed: p.seed,
      groupKey: p.groupKey,
      participantOrder: p.participantOrder,
    })),
    stages,
    stageParticipantCounts,
  });

  if (edition.competition.type === 'INTERNATIONAL_TOURNAMENT') {
    const ntEditions = await prisma.nationalTeamEdition.findMany({
      where: { competitionEditionId: editionId, status: { not: 'CANCELLED' } },
      select: { status: true },
    });
    const nationalParticipants = edition.participants.filter((p) => p.status === 'CONFIRMED');
    const nationalTeamIds = nationalParticipants.map((p) => p.teamId);
    const nationalTeams =
      nationalTeamIds.length === 0
        ? []
        : await prisma.team.findMany({
            where: { id: { in: nationalTeamIds }, teamType: 'NATIONAL' },
            select: { id: true },
          });
    const nationalCount = nationalTeams.length;

    if (nationalCount > 0 && ntEditions.length === 0) {
      readiness.checks.push({
        code: 'NATIONAL_TEAM_PREP_MISSING',
        severity: 'BLOCKER',
        message: 'Confirmed national-team participants lack NationalTeamEdition preparation',
      });
      readiness.blockers.push(
        'Confirmed national-team participants lack NationalTeamEdition preparation',
      );
      readiness.status = 'NOT_READY';
    } else if (ntEditions.length > 0) {
      const locked = ntEditions.filter((e) => e.status === 'LOCKED').length;
      const notLocked = ntEditions.length - locked;
      if (notLocked === 0) {
        readiness.checks.push({
          code: 'NATIONAL_TEAMS_LOCKED',
          severity: 'OK',
          message: `All ${locked} national-team edition(s) are LOCKED`,
        });
      } else {
        const msg = `${notLocked}/${ntEditions.length} national-team edition(s) not LOCKED (F23 requires lock)`;
        readiness.checks.push({
          code: 'NATIONAL_TEAMS_NOT_LOCKED',
          severity: 'BLOCKER',
          message: msg,
        });
        readiness.blockers.push(msg);
        readiness.status = 'NOT_READY';
      }
    }
  }

  return {
    edition: {
      id: edition.id,
      status: edition.status as CompetitionEditionStatus,
      worldSeasonId: edition.worldSeasonId,
      rulesSnapshotText: edition.rulesSnapshotText,
      competitionId: edition.competitionId,
    },
    readiness,
    stages,
  };
}

export function assertEditableEdition(status: CompetitionEditionStatus) {
  if (status === 'ARCHIVED') {
    throw new CommissionerHttpError(
      409,
      'CompetitionEditionArchived',
      'ARCHIVED editions cannot be structurally edited',
    );
  }
  try {
    assertEditionStructurallyEditable(status);
  } catch (err) {
    throw new CommissionerHttpError(
      409,
      'EditionLocked',
      err instanceof Error ? err.message : 'Edition is not editable',
    );
  }
}

export function assertTransition(from: CompetitionEditionStatus, to: CompetitionEditionStatus) {
  try {
    assertEditionTransition(from, to);
  } catch (err) {
    throw new CommissionerHttpError(
      409,
      'InvalidEditionTransition',
      err instanceof Error ? err.message : 'Invalid transition',
    );
  }
}

export { transitionRequiresReadiness, validateCompetitionRules, hashCompetitionRules };
