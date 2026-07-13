import {
  PERIOD_DURATION_SECONDS,
  REGULATION_PERIODS,
  parsePlayoffConfig,
  generatePlayoffBracket,
  resolveGameHomeAway,
  toMatchCompletionRules,
  PlayoffError,
  type PlayoffConfig,
  type CompetitionRules,
} from '@fhm/engine';
import type { CommissionerAuditSource, Prisma } from '@prisma/client';
import { prisma } from '../db/client.js';
import { assertExpectedUpdatedAt, parseStoredRules, writeCompetitionAudit } from './competition-helpers.js';
import { assertTeamSimulationReady } from './simulation-input.js';
import { canonicalizeStoredMatchRules, type StoredMatchRules } from './match-rules.js';
import { PlayoffHttpError } from './playoff-errors.js';

function mapEngine(err: unknown): never {
  if (err instanceof PlayoffError) {
    const status =
      err.code === 'InvalidPlayoffConfiguration' || err.code === 'BracketGenerationFailed'
        ? 422
        : err.code === 'InvalidPlayoffParticipantCount'
          ? 409
          : 400;
    throw new PlayoffHttpError(status, err.code, err.message);
  }
  throw err;
}

export async function loadPlayoffStage(stageId: string) {
  const stage = await prisma.competitionStage.findUnique({
    where: { id: stageId },
    include: {
      edition: true,
      participants: {
        include: { participant: true },
        orderBy: [{ seed: 'asc' }, { stageOrder: 'asc' }],
      },
    },
  });
  if (!stage) throw new PlayoffHttpError(404, 'CompetitionStageNotFound', 'Competition stage not found');
  if (stage.stageType !== 'BEST_OF_SERIES' && stage.stageType !== 'KNOCKOUT') {
    throw new PlayoffHttpError(409, 'StageNotPlayoff', 'Stage is not a playoff stage');
  }
  return stage;
}

function parseConfig(stage: { configText: string; participants: unknown[] }): PlayoffConfig {
  try {
    return parsePlayoffConfig(JSON.parse(stage.configText), {
      participantCount: Math.max(2, (stage.participants as unknown[]).length || 2),
    });
  } catch (err) {
    if (err instanceof SyntaxError) {
      throw new PlayoffHttpError(422, 'InvalidPlayoffConfiguration', 'Stage config is not valid JSON');
    }
    mapEngine(err);
  }
}

function buildPlayoffMatchRules(rules: CompetitionRules, config: PlayoffConfig): StoredMatchRules {
  const base = toMatchCompletionRules(rules.matchRules);
  return {
    regulationPeriods: REGULATION_PERIODS,
    periodDurationSeconds: PERIOD_DURATION_SECONDS,
    completion: {
      overtimeEnabled: true,
      shootoutEnabled: config.matchRules.shootoutEnabled,
      tiesAllowed: false,
    },
  };
}

export async function importQualifiedParticipants(
  stageId: string,
  opts: {
    expectedUpdatedAt: string;
    sourceStageId: string;
    qualificationCount: number;
    reason: string;
  },
  source: CommissionerAuditSource,
) {
  const stage = await loadPlayoffStage(stageId);
  assertExpectedUpdatedAt(stage.updatedAt, opts.expectedUpdatedAt);
  if (stage.status !== 'PLANNED' && stage.status !== 'READY') {
    throw new PlayoffHttpError(409, 'StageNotPlayoff', `Cannot import qualifiers in status ${stage.status}`);
  }
  if (stage.bracketHash) {
    throw new PlayoffHttpError(409, 'BracketAlreadyGenerated', 'Cannot re-import after bracket generation');
  }

  const sourceStage = await prisma.competitionStage.findUnique({ where: { id: opts.sourceStageId } });
  if (!sourceStage || sourceStage.competitionEditionId !== stage.competitionEditionId) {
    throw new PlayoffHttpError(404, 'CompetitionStageNotFound', 'Source stage not found in this edition');
  }
  if (sourceStage.status !== 'COMPLETED') {
    throw new PlayoffHttpError(409, 'SourceStageNotCompleted', 'Source stage must be COMPLETED');
  }

  const standings = await prisma.competitionStageStanding.findMany({
    where: { competitionStageId: opts.sourceStageId, qualified: true },
    orderBy: { rank: 'asc' },
  });
  if (standings.length === 0) {
    throw new PlayoffHttpError(
      409,
      'QualifiedParticipantsUnavailable',
      'No qualified final standings rows on source stage',
    );
  }
  if (opts.qualificationCount > standings.length) {
    throw new PlayoffHttpError(
      409,
      'QualifiedParticipantsUnavailable',
      `Requested ${opts.qualificationCount} qualifiers but only ${standings.length} available`,
    );
  }
  if ((opts.qualificationCount & (opts.qualificationCount - 1)) !== 0) {
    throw new PlayoffHttpError(
      409,
      'InvalidPlayoffParticipantCount',
      'qualificationCount must be a power of two',
    );
  }

  const selected = standings.slice(0, opts.qualificationCount);

  return prisma.$transaction(async (tx) => {
    await tx.stageParticipant.deleteMany({ where: { competitionStageId: stageId } });
    let order = 0;
    for (const row of selected) {
      order += 1;
      await tx.stageParticipant.create({
        data: {
          competitionStageId: stageId,
          competitionParticipantId: row.competitionParticipantId,
          seed: order,
          stageOrder: order,
          status: 'CONFIRMED',
        },
      });
    }

    const configObj = {
      ...JSON.parse(stage.configText),
      sourceStageId: opts.sourceStageId,
      qualificationCount: opts.qualificationCount,
      winsRequired: JSON.parse(stage.configText).winsRequired ?? 4,
      homePattern: JSON.parse(stage.configText).homePattern ?? '2-2-1-1-1',
      reseeding: JSON.parse(stage.configText).reseeding ?? false,
    };
    const { hashStageConfig, validateStageConfig } = await import('@fhm/engine');
    const validated = validateStageConfig(stage.stageType, configObj);
    const updated = await tx.competitionStage.update({
      where: { id: stageId },
      data: {
        sourceStageId: opts.sourceStageId,
        expectedQualifierCount: opts.qualificationCount,
        configText: JSON.stringify(validated),
        configHash: hashStageConfig(validated),
        status: 'READY',
        participantSource: 'PREVIOUS_STAGE_QUALIFIERS',
      },
    });

    await writeCompetitionAudit(
      tx,
      'COMPETITION_STAGE',
      stageId,
      'QUALIFIERS_IMPORTED',
      opts.reason,
      { participantCount: 0 },
      { participantCount: selected.length, seeds: selected.map((s) => s.competitionParticipantId) },
      ['stageParticipants', 'sourceStageId', 'status'],
      source,
    );

    return {
      stageId,
      status: updated.status,
      importedCount: selected.length,
      seeds: selected.map((s, i) => ({
        seed: i + 1,
        competitionParticipantId: s.competitionParticipantId,
        teamId: s.teamId,
        teamNameSnapshot: s.teamNameSnapshot,
      })),
      updatedAt: updated.updatedAt.toISOString(),
    };
  });
}

async function createSeriesGame1(
  tx: Prisma.TransactionClient,
  opts: {
    seriesId: string;
    stageId: string;
    editionId: string;
    config: PlayoffConfig;
    rules: CompetitionRules;
    rulesHash: string;
    participant1Id: string;
    participant2Id: string;
    participant1Seed: number;
    participant2Seed: number;
    teamIdByParticipant: Map<string, string>;
  },
) {
  const higher =
    opts.participant1Seed <= opts.participant2Seed
      ? { id: opts.participant1Id, seed: opts.participant1Seed }
      : { id: opts.participant2Id, seed: opts.participant2Seed };
  const lower =
    opts.participant1Seed <= opts.participant2Seed
      ? { id: opts.participant2Id, seed: opts.participant2Seed }
      : { id: opts.participant1Id, seed: opts.participant1Seed };

  const sides = resolveGameHomeAway({
    config: opts.config,
    gameNumber: 1,
    higherSeedParticipantId: higher.id,
    lowerSeedParticipantId: lower.id,
  });
  const homeTeamId = opts.teamIdByParticipant.get(sides.homeParticipantId);
  const awayTeamId = opts.teamIdByParticipant.get(sides.awayParticipantId);
  if (!homeTeamId || !awayTeamId) {
    throw new PlayoffHttpError(422, 'BracketGenerationFailed', 'Missing team mapping for playoff game');
  }

  const rulesJson = canonicalizeStoredMatchRules(buildPlayoffMatchRules(opts.rules, opts.config));
  await tx.match.create({
    data: {
      homeTeamId,
      awayTeamId,
      competitionEditionId: opts.editionId,
      competitionStageId: opts.stageId,
      playoffSeriesId: opts.seriesId,
      playoffGameNumber: 1,
      status: 'PREPARED',
      source: 'COMPETITION',
      createdBySource: 'PLAYOFF_BRACKET',
      rulesJson,
      competitionRulesHash: opts.rulesHash,
      scheduleKey: `playoff:${opts.seriesId}:game:1`,
      scheduleOrder: 1,
    },
  });
}

export async function previewPlayoffBracket(stageId: string, seed: string): Promise<{
  rounds: number;
  initialSeries: unknown[];
  byeAdvancements: unknown[];
  bracketHash: string;
  diagnostics: unknown;
  config: unknown;
  participants: unknown[];
  persisted: false;
}> {
  const stage = await loadPlayoffStage(stageId);
  if (stage.edition.status !== 'ACTIVE') {
    throw new PlayoffHttpError(409, 'StageNotPlayoff', 'Edition must be ACTIVE');
  }
  const participants = stage.participants
    .filter((p) => p.status === 'CONFIRMED' && p.seed != null)
    .map((p) => ({
      competitionParticipantId: p.competitionParticipantId,
      seed: p.seed!,
    }));
  const config = parseConfig({ ...stage, participants });
  try {
    const bracket = generatePlayoffBracket({
      stageId,
      participants,
      config: { ...config, qualificationCount: participants.length },
      bracketSeed: seed,
    });
    return { ...bracket, persisted: false };
  } catch (err) {
    mapEngine(err);
  }
}

export async function generatePlayoffBracketPersisted(
  stageId: string,
  opts: { expectedUpdatedAt: string; seed: string; reason: string },
  source: CommissionerAuditSource,
) {
  const stage = await loadPlayoffStage(stageId);
  assertExpectedUpdatedAt(stage.updatedAt, opts.expectedUpdatedAt);
  if (stage.edition.status !== 'ACTIVE') {
    throw new PlayoffHttpError(409, 'StageNotPlayoff', 'Edition must be ACTIVE');
  }
  if (stage.status !== 'READY' && stage.status !== 'PLANNED') {
    throw new PlayoffHttpError(409, 'StageNotPlayoff', `Cannot generate bracket in status ${stage.status}`);
  }
  if (stage.bracketHash) {
    throw new PlayoffHttpError(409, 'BracketAlreadyGenerated', 'Bracket already generated; use regenerate');
  }

  const participants = stage.participants
    .filter((p) => p.status === 'CONFIRMED' && p.seed != null)
    .map((p) => ({
      competitionParticipantId: p.competitionParticipantId,
      seed: p.seed!,
      teamId: p.participant.teamId,
      name: p.participant.teamNameSnapshot,
    }));

  for (const p of participants) {
    try {
      await assertTeamSimulationReady(p.teamId);
    } catch (err) {
      throw new PlayoffHttpError(
        409,
        'MatchNotSimulationReady',
        `Team ${p.name} is not simulation-ready`,
        { cause: err instanceof Error ? err.message : String(err) },
      );
    }
  }

  const config = parseConfig({ ...stage, participants });
  let bracket;
  try {
    bracket = generatePlayoffBracket({
      stageId,
      participants: participants.map((p) => ({
        competitionParticipantId: p.competitionParticipantId,
        seed: p.seed,
      })),
      config: { ...config, qualificationCount: participants.length },
      bracketSeed: opts.seed,
    });
  } catch (err) {
    mapEngine(err);
  }

  const rules = parseStoredRules(stage.edition.rulesSnapshotText);
  const teamByParticipant = new Map(participants.map((p) => [p.competitionParticipantId, p]));

  return prisma.$transaction(async (tx) => {
    for (const spec of bracket.initialSeries) {
      const p1 = teamByParticipant.get(spec.participant1Id)!;
      const p2 = teamByParticipant.get(spec.participant2Id)!;
      const series = await tx.playoffSeries.create({
        data: {
          competitionStageId: stageId,
          roundNumber: spec.roundNumber,
          roundName: spec.roundName,
          seriesOrder: spec.seriesOrder,
          bracketSlot: spec.bracketSlot,
          status: 'READY',
          participant1Id: spec.participant1Id,
          participant2Id: spec.participant2Id,
          participant1Seed: spec.participant1Seed,
          participant2Seed: spec.participant2Seed,
          participant1NameSnapshot: p1.name,
          participant2NameSnapshot: p2.name,
          winsRequired: spec.winsRequired,
          homeAdvantageParticipantId: spec.homeAdvantageParticipantId,
          homePatternText: spec.homePatternText,
        },
      });

      await createSeriesGame1(tx, {
        seriesId: series.id,
        stageId,
        editionId: stage.competitionEditionId,
        config: bracket.config,
        rules,
        rulesHash: stage.edition.rulesHash,
        participant1Id: spec.participant1Id,
        participant2Id: spec.participant2Id,
        participant1Seed: spec.participant1Seed,
        participant2Seed: spec.participant2Seed,
        teamIdByParticipant: new Map(participants.map((p) => [p.competitionParticipantId, p.teamId])),
      });
    }

    const updated = await tx.competitionStage.update({
      where: { id: stageId },
      data: {
        status: 'SCHEDULED',
        bracketSeed: opts.seed,
        bracketHash: bracket.bracketHash,
        bracketVersion: stage.bracketVersion + 1,
        bracketGeneratedAt: new Date(),
        scheduleStatus: 'GENERATED',
      },
    });

    await writeCompetitionAudit(
      tx,
      'COMPETITION_STAGE',
      stageId,
      'BRACKET_GENERATED',
      opts.reason,
      { bracketHash: null },
      { bracketHash: bracket.bracketHash, series: bracket.initialSeries.length },
      ['bracketHash', 'status', 'bracketVersion'],
      source,
    );

    return {
      stageId,
      status: updated.status,
      bracketHash: updated.bracketHash,
      bracketVersion: updated.bracketVersion,
      seriesCount: bracket.initialSeries.length,
      diagnostics: bracket.diagnostics,
    };
  });
}

export async function regeneratePlayoffBracket(
  stageId: string,
  opts: { expectedUpdatedAt: string; seed: string; reason: string },
  source: CommissionerAuditSource,
) {
  const stage = await loadPlayoffStage(stageId);
  assertExpectedUpdatedAt(stage.updatedAt, opts.expectedUpdatedAt);

  const completedGames = await prisma.match.count({
    where: {
      competitionStageId: stageId,
      playoffSeriesId: { not: null },
      OR: [{ status: 'COMPLETED' }, { currentResultId: { not: null } }],
    },
  });
  if (completedGames > 0 || stage.status === 'COMPLETED' || stage.status === 'IN_PROGRESS') {
    throw new PlayoffHttpError(
      409,
      'BracketLockedByResults',
      'Bracket regeneration is blocked after playoff results exist',
    );
  }

  await prisma.$transaction(async (tx) => {
    await tx.match.deleteMany({
      where: {
        competitionStageId: stageId,
        playoffSeriesId: { not: null },
        status: { in: ['PREPARED', 'FAILED'] },
        currentResultId: null,
      },
    });
    await tx.playoffSeries.deleteMany({ where: { competitionStageId: stageId } });
    await tx.competitionStage.update({
      where: { id: stageId },
      data: {
        status: 'READY',
        bracketSeed: null,
        bracketHash: null,
        bracketGeneratedAt: null,
        scheduleStatus: 'NONE',
      },
    });
  });

  // Refresh updatedAt for generate
  const refreshed = await prisma.competitionStage.findUniqueOrThrow({ where: { id: stageId } });
  return generatePlayoffBracketPersisted(
    stageId,
    {
      expectedUpdatedAt: refreshed.updatedAt.toISOString(),
      seed: opts.seed,
      reason: opts.reason,
    },
    source,
  ).then(async (result) => {
    await prisma.commissionerAuditLog.create({
      data: {
        entityType: 'COMPETITION_STAGE',
        entityId: stageId,
        action: 'BRACKET_REGENERATED',
        reason: opts.reason,
        beforeJson: JSON.stringify({ bracketHash: stage.bracketHash }),
        afterJson: JSON.stringify({ bracketHash: result.bracketHash }),
        changedFieldsJson: JSON.stringify(['bracketHash', 'bracketVersion']),
        source,
        schemaVersion: 1,
      },
    });
    return result;
  });
}

export { parseConfig, buildPlayoffMatchRules, createSeriesGame1, mapEngine };
