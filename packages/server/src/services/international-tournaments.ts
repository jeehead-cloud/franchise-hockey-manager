/**
 * F23 International Tournaments — preview, prepare, schedule, simulation, medals.
 */
import type { CommissionerAuditSource, Prisma } from '@prisma/client';
import {
  InternationalTournamentError,
  PERIOD_DURATION_SECONDS,
  REGULATION_PERIODS,
  assignTournamentGroups,
  buildQualificationAndKnockout,
  computeAllGroupStandings,
  deriveInternationalGroupMatchSeed,
  deriveInternationalKnockoutMatchSeed,
  deriveMedalsFromKnockout,
  generateInternationalGroupSchedule,
  getCompetitionRulesTemplate,
  getTestInternationalTemplate,
  hashCompetitionRules,
  hashInternationalTemplate,
  hashStageConfig,
  hashTournamentMedals,
  hashTournamentResult,
  progressKnockoutBracket,
  resolveInternationalTemplate,
  toMatchCompletionRules,
  validateStageConfig,
  type CompetitionRules,
  type CompletedKnockoutGame,
  type GeneratedKnockoutBracket,
  type InternationalTemplateKey,
  type InternationalTournamentTemplate,
  type KnockoutMatchupSpec,
} from '@fhm/engine';
import { prisma } from '../db/client.js';
import { assertExpectedUpdatedAt, writeCompetitionAudit } from './competition-helpers.js';
import { assertNationalTeamSimulationReady } from './international-match-input.js';
import { canonicalizeStoredMatchRules, type StoredMatchRules } from './match-rules.js';
import { simulateMatch } from './match-simulation.js';
import {
  createStageRun,
  getActiveStageRun,
  getStageRun,
  requestCancelStageRun,
  yieldEventLoop,
  type StageRunRecord,
} from './regular-season-runs.js';
import { serializeRun } from './regular-season-simulation.js';
import { createSqliteSafetyBackup } from './sqlite-backup.js';

export class InternationalTournamentHttpError extends Error {
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

export function internationalTournamentErrorBody(err: InternationalTournamentHttpError) {
  return {
    error: err.code,
    message: err.message,
    ...(err.details !== undefined ? { details: err.details } : {}),
  };
}

function mapEngineError(err: unknown): never {
  if (err instanceof InternationalTournamentError) {
    const status =
      err.code === 'InvalidTournamentTemplate' || err.code === 'InvalidGroupAssignment'
        ? 422
        : 409;
    throw new InternationalTournamentHttpError(status, err.code, err.message, err.details);
  }
  throw err;
}

type EditionBundle = NonNullable<Awaited<ReturnType<typeof loadInternationalEdition>>>;

async function loadInternationalEdition(editionId: string) {
  const edition = await prisma.competitionEdition.findUnique({
    where: { id: editionId },
    include: {
      competition: true,
      participants: {
        where: { status: { in: ['CONFIRMED', 'INVITED', 'CHAMPION', 'ELIMINATED'] } },
        orderBy: { participantOrder: 'asc' },
        include: {
          team: true,
          nationalTeamEdition: { include: { profile: true } },
        },
      },
      stages: { orderBy: { stageOrder: 'asc' } },
      tournamentMedals: { orderBy: { finalPlacement: 'asc' } },
    },
  });
  if (!edition) {
    throw new InternationalTournamentHttpError(404, 'CompetitionEditionNotFound', 'Edition not found');
  }
  if (edition.competition.type !== 'INTERNATIONAL_TOURNAMENT') {
    throw new InternationalTournamentHttpError(
      409,
      'NotInternationalTournament',
      'Competition is not INTERNATIONAL_TOURNAMENT',
    );
  }
  return edition;
}

function parseStoredTemplate(edition: {
  tournamentTemplateText: string | null;
  tournamentTemplateKey: string | null;
}): InternationalTournamentTemplate | null {
  if (edition.tournamentTemplateText) {
    try {
      return resolveInternationalTemplate(
        JSON.parse(edition.tournamentTemplateText) as InternationalTournamentTemplate,
      );
    } catch (err) {
      mapEngineError(err);
    }
  }
  return null;
}

function confirmedParticipants(edition: EditionBundle) {
  return edition.participants.filter((p) => p.status === 'CONFIRMED' || p.status === 'CHAMPION' || p.status === 'ELIMINATED');
}

function assertLockedNationalParticipants(
  edition: EditionBundle,
  template: InternationalTournamentTemplate,
) {
  const participants = edition.participants.filter((p) => p.status === 'CONFIRMED');
  if (participants.length !== template.participantCount) {
    throw new InternationalTournamentHttpError(
      422,
      'ParticipantCountMismatch',
      `Expected ${template.participantCount} confirmed participants, got ${participants.length}`,
    );
  }
  for (const p of participants) {
    if (p.team.teamType !== 'NATIONAL') {
      throw new InternationalTournamentHttpError(
        409,
        'ParticipantsMustBeNational',
        `Participant ${p.teamNameSnapshot} is not a NATIONAL team`,
        { participantId: p.id, teamId: p.teamId },
      );
    }
    const nt = p.nationalTeamEdition;
    if (!nt || nt.status !== 'LOCKED') {
      throw new InternationalTournamentHttpError(
        409,
        'NationalTeamsNotLocked',
        `National-team edition for ${p.teamNameSnapshot} is not LOCKED`,
        { participantId: p.id, status: nt?.status ?? null },
      );
    }
    if (nt.profile.category !== template.category) {
      throw new InternationalTournamentHttpError(
        409,
        'NationalTeamCategoryMismatch',
        `Category mismatch for ${p.teamNameSnapshot}: ${nt.profile.category} vs ${template.category}`,
      );
    }
  }
}

function buildRulesFromTemplate(template: InternationalTournamentTemplate): CompetitionRules {
  const base = getCompetitionRulesTemplate('GROUPS_AND_KNOCKOUT');
  return {
    ...base,
    points: {
      regulationWin: template.points.regulationWin,
      overtimeWin: template.points.overtimeWin,
      shootoutWin: template.points.shootoutWin,
      overtimeLoss: template.points.overtimeLoss,
      shootoutLoss: template.points.shootoutLoss,
      regulationLoss: template.points.regulationLoss,
      tie: 0,
    },
    matchRules: {
      overtimeEnabled: template.matchRules.overtimeEnabled,
      overtimeDurationSeconds: 300,
      overtimeSkaterCount: 3,
      shootoutEnabled: template.matchRules.shootoutEnabled,
      shootoutRounds: 3,
      tiesAllowed: template.matchRules.tiesAllowed,
    },
    qualification: {
      qualifiers: template.groupStage.groupCount * template.groupStage.qualifiersPerGroup,
      wildcards: 0,
    },
    series: {
      winsRequired: 1,
      homePattern: '1',
      reseeding: template.knockout.reseeding,
    },
  };
}

function buildMatchRulesFromTemplate(template: InternationalTournamentTemplate): StoredMatchRules {
  const rules = buildRulesFromTemplate(template);
  return {
    regulationPeriods: REGULATION_PERIODS,
    periodDurationSeconds: PERIOD_DURATION_SECONDS,
    completion: toMatchCompletionRules(rules.matchRules),
  };
}

function participantSeeds(edition: EditionBundle) {
  return edition.participants
    .filter((p) => p.status === 'CONFIRMED')
    .map((p, index) => ({
      participantId: p.id,
      teamId: p.teamId,
      tournamentSeed: p.seed ?? index + 1,
      groupKey: p.groupKey,
    }));
}

export async function previewInternationalTournament(
  editionId: string,
  opts?: { templateKey?: InternationalTemplateKey; useTestTemplate?: boolean },
) {
  const edition = await loadInternationalEdition(editionId);
  const template = opts?.useTestTemplate
    ? getTestInternationalTemplate('SENIOR_MEN')
    : opts?.templateKey
      ? resolveInternationalTemplate(opts.templateKey)
      : parseStoredTemplate(edition) ??
        resolveInternationalTemplate(
          (edition.tournamentTemplateKey as InternationalTemplateKey) ?? 'WORLD_CHAMPIONSHIP',
        );

  assertLockedNationalParticipants(edition, template);

  const seeds = participantSeeds(edition);
  const groups = assignTournamentGroups({ participants: seeds, template });
  const schedule = generateInternationalGroupSchedule({
    participants: seeds,
    template,
    seed: edition.tournamentBaseSeed ?? 'preview-seed',
  });
  const knockoutPreview = buildQualificationAndKnockout({
    groupStandings: Object.fromEntries(
      groups.map((g) => [
        g.groupKey,
        g.participantIds.map((id, i) => ({
          participantId: id,
          groupKey: g.groupKey,
          rank: i + 1,
          gamesPlayed: 0,
          regulationWins: 0,
          overtimeWins: 0,
          shootoutWins: 0,
          regulationLosses: 0,
          overtimeLosses: 0,
          shootoutLosses: 0,
          goalsFor: 0,
          goalsAgainst: 0,
          goalDifference: 0,
          points: 0,
          qualified: i < template.groupStage.qualifiersPerGroup,
          tiebreakerSummary: 'preview',
        })),
      ]),
    ),
    template,
  });

  return {
    persisted: false as const,
    editionId,
    template,
    templateHash: hashInternationalTemplate(template),
    groups: schedule.groups,
    groupAssignmentHash: schedule.groupAssignmentHash,
    schedule: {
      matchCount: schedule.matchCount,
      scheduleHash: schedule.scheduleHash,
      matches: schedule.matches,
    },
    knockoutPreview: {
      bracketHash: knockoutPreview.bracketHash,
      matchups: knockoutPreview.matchups,
      qualification: knockoutPreview.qualification,
    },
  };
}

export async function prepareInternationalTournament(
  editionId: string,
  opts: {
    expectedUpdatedAt: string;
    reason: string;
    templateKey?: InternationalTemplateKey;
    useTestTemplate?: boolean;
    baseSeed?: string;
  },
  source: CommissionerAuditSource,
) {
  const edition = await loadInternationalEdition(editionId);
  assertExpectedUpdatedAt(edition.updatedAt, opts.expectedUpdatedAt);

  if (edition.status !== 'PLANNED' && edition.status !== 'PREPARING') {
    throw new InternationalTournamentHttpError(
      409,
      'TournamentAlreadyPrepared',
      `Cannot prepare tournament in status ${edition.status}`,
    );
  }
  if (edition.tournamentPreparedAt && edition.tournamentTemplateHash) {
    throw new InternationalTournamentHttpError(
      409,
      'TournamentAlreadyPrepared',
      'Tournament already prepared; create a new edition to re-prepare',
    );
  }

  let template: InternationalTournamentTemplate;
  try {
    template = opts.useTestTemplate
      ? getTestInternationalTemplate('SENIOR_MEN')
      : resolveInternationalTemplate(opts.templateKey ?? 'WORLD_CHAMPIONSHIP');
  } catch (err) {
    mapEngineError(err);
  }

  assertLockedNationalParticipants(edition, template);

  const seeds = participantSeeds(edition);
  let groups;
  try {
    groups = assignTournamentGroups({ participants: seeds, template });
  } catch (err) {
    mapEngineError(err);
  }

  const rules = buildRulesFromTemplate(template);
  const rulesText = JSON.stringify(rules);
  const rulesHash = hashCompetitionRules(rules);
  const templateText = JSON.stringify(template);
  const templateHash = hashInternationalTemplate(template);
  const baseSeed = opts.baseSeed ?? `intl-${editionId.slice(0, 8)}`;

  const groupStageConfig = validateStageConfig('GROUP_STAGE', {
    groupCount: template.groupStage.groupCount,
    groupSize: template.groupStage.teamsPerGroup,
    doubleRound: template.groupStage.roundRobinMode === 'DOUBLE',
    qualifiersPerGroup: template.groupStage.qualifiersPerGroup,
  });
  const knockoutConfig = validateStageConfig('BEST_OF_SERIES', {
    winsRequired: 1,
    homePattern: '1',
    reseeding: template.knockout.reseeding,
    qualificationCount: template.groupStage.groupCount * template.groupStage.qualifiersPerGroup,
  });

  const groupOf = new Map<string, string>();
  for (const g of groups) {
    for (const id of g.participantIds) groupOf.set(id, g.groupKey);
  }

  return prisma.$transaction(async (tx) => {
    for (const p of edition.participants.filter((x) => x.status === 'CONFIRMED')) {
      await tx.competitionParticipant.update({
        where: { id: p.id },
        data: { groupKey: groupOf.get(p.id) ?? null },
      });
    }

    // Remove prior stages if re-preparing empty structure
    const existingStages = await tx.competitionStage.findMany({
      where: { competitionEditionId: editionId },
      orderBy: { stageOrder: 'asc' },
    });
    if (existingStages.length > 0) {
      const hasMatches = await tx.match.count({ where: { competitionEditionId: editionId } });
      if (hasMatches > 0) {
        throw new InternationalTournamentHttpError(
          409,
          'TournamentAlreadyPrepared',
          'Cannot prepare: matches already exist',
        );
      }
      await tx.stageParticipant.deleteMany({
        where: { stage: { competitionEditionId: editionId } },
      });
      await tx.competitionStage.deleteMany({ where: { competitionEditionId: editionId } });
    }

    const groupStage = await tx.competitionStage.create({
      data: {
        competitionEditionId: editionId,
        name: 'Group Stage',
        stageType: 'GROUP_STAGE',
        stageOrder: 1,
        status: 'PLANNED',
        configText: JSON.stringify(groupStageConfig),
        configHash: hashStageConfig(groupStageConfig),
        participantSource: 'EDITION_PARTICIPANTS',
      },
    });

    await tx.competitionStage.create({
      data: {
        competitionEditionId: editionId,
        name: 'Knockout',
        stageType: 'BEST_OF_SERIES',
        stageOrder: 2,
        status: 'PLANNED',
        configText: JSON.stringify(knockoutConfig),
        configHash: hashStageConfig(knockoutConfig),
        participantSource: 'PREVIOUS_STAGE_QUALIFIERS',
        sourceStageId: groupStage.id,
        expectedQualifierCount:
          template.groupStage.groupCount * template.groupStage.qualifiersPerGroup,
      },
    });

    const updated = await tx.competitionEdition.update({
      where: { id: editionId },
      data: {
        status: 'READY',
        rulesSnapshotText: rulesText,
        rulesHash,
        tournamentTemplateKey: template.templateKey,
        tournamentTemplateText: templateText,
        tournamentTemplateHash: templateHash,
        tournamentBaseSeed: baseSeed,
        tournamentPreparedAt: new Date(),
        preparedAt: edition.preparedAt ?? new Date(),
      },
    });

    await writeCompetitionAudit(
      tx,
      'COMPETITION_EDITION',
      editionId,
      'INTERNATIONAL_TOURNAMENT_PREPARED',
      opts.reason,
      { status: edition.status, tournamentTemplateHash: null },
      {
        status: updated.status,
        tournamentTemplateHash: templateHash,
        groups,
      },
      ['status', 'tournamentTemplateHash', 'rulesHash', 'stages'],
      source,
    );

    return {
      editionId,
      status: updated.status,
      templateKey: template.templateKey,
      templateHash,
      groups,
      groupStageId: groupStage.id,
      updatedAt: updated.updatedAt.toISOString(),
    };
  });
}

export async function generateInternationalSchedule(
  editionId: string,
  opts: { expectedUpdatedAt: string; reason: string; seed?: string },
  source: CommissionerAuditSource,
) {
  const edition = await loadInternationalEdition(editionId);
  assertExpectedUpdatedAt(edition.updatedAt, opts.expectedUpdatedAt);

  if (edition.status !== 'ACTIVE') {
    throw new InternationalTournamentHttpError(
      409,
      'TournamentNotReady',
      'Edition must be ACTIVE to generate international schedule',
    );
  }

  const template = parseStoredTemplate(edition);
  if (!template || !edition.tournamentTemplateHash) {
    throw new InternationalTournamentHttpError(
      409,
      'TournamentNotReady',
      'Tournament has not been prepared',
    );
  }

  const groupStage = edition.stages.find((s) => s.stageType === 'GROUP_STAGE');
  if (!groupStage) {
    throw new InternationalTournamentHttpError(409, 'TournamentNotReady', 'Group stage missing');
  }

  const completedGroup = await prisma.match.count({
    where: {
      competitionStageId: groupStage.id,
      source: 'COMPETITION',
      status: 'COMPLETED',
    },
  });
  if (completedGroup > 0) {
    throw new InternationalTournamentHttpError(
      409,
      'TournamentScheduleLocked',
      'Cannot regenerate schedule after completed group results',
    );
  }

  assertLockedNationalParticipants(edition, template);

  const participants = edition.participants.filter((p) => p.status === 'CONFIRMED');
  for (const p of participants) {
    await assertNationalTeamSimulationReady(editionId, p.teamId);
  }

  const seed = opts.seed ?? edition.tournamentBaseSeed ?? `intl-sched-${editionId.slice(0, 8)}`;
  const seeds = participantSeeds(edition);
  let schedule;
  try {
    schedule = generateInternationalGroupSchedule({ participants: seeds, template, seed });
  } catch (err) {
    mapEngineError(err);
  }

  const rulesJson = canonicalizeStoredMatchRules(buildMatchRulesFromTemplate(template));
  const teamByParticipant = new Map(participants.map((p) => [p.id, p]));

  return prisma.$transaction(async (tx) => {
    await tx.match.deleteMany({
      where: { competitionStageId: groupStage.id, source: 'COMPETITION', playoffSeriesId: null },
    });
    await tx.stageParticipant.deleteMany({ where: { competitionStageId: groupStage.id } });

    let stageOrder = 0;
    for (const g of schedule.groups) {
      for (const participantId of g.participantIds) {
        stageOrder += 1;
        await tx.stageParticipant.create({
          data: {
            competitionStageId: groupStage.id,
            competitionParticipantId: participantId,
            groupKey: g.groupKey,
            stageOrder,
            seed: teamByParticipant.get(participantId)?.seed ?? stageOrder,
            status: 'CONFIRMED',
          },
        });
      }
    }

    for (const m of schedule.matches) {
      const home = teamByParticipant.get(m.homeParticipantId);
      const away = teamByParticipant.get(m.awayParticipantId);
      if (!home || !away) {
        throw new InternationalTournamentHttpError(
          422,
          'InvalidGroupAssignment',
          'Missing participant mapping for scheduled match',
        );
      }
      await tx.match.create({
        data: {
          homeTeamId: home.teamId,
          awayTeamId: away.teamId,
          competitionEditionId: editionId,
          competitionStageId: groupStage.id,
          status: 'PREPARED',
          source: 'COMPETITION',
          createdBySource: 'INTERNATIONAL_SCHEDULE',
          rulesJson,
          competitionRoundNumber: m.roundNumber,
          competitionSlotNumber: m.slotNumber,
          scheduleKey: m.scheduleKey,
          scheduleOrder: m.scheduleOrder,
          competitionRulesHash: edition.rulesHash,
          tournamentGroupKey: m.groupKey,
        },
      });
    }

    const updatedStage = await tx.competitionStage.update({
      where: { id: groupStage.id },
      data: {
        status: 'SCHEDULED',
        scheduleStatus: 'GENERATED',
        scheduleSeed: seed,
        scheduleHash: schedule.scheduleHash,
        scheduleVersion: groupStage.scheduleVersion + 1,
        scheduleGeneratedAt: new Date(),
      },
    });

    const updatedEdition = await tx.competitionEdition.update({
      where: { id: editionId },
      data: {
        tournamentScheduleHash: schedule.scheduleHash,
        tournamentBaseSeed: seed,
      },
    });

    await writeCompetitionAudit(
      tx,
      'COMPETITION_EDITION',
      editionId,
      'INTERNATIONAL_SCHEDULE_GENERATED',
      opts.reason,
      { scheduleHash: edition.tournamentScheduleHash },
      { scheduleHash: schedule.scheduleHash, matchCount: schedule.matchCount },
      ['tournamentScheduleHash', 'groupStage.status'],
      source,
    );

    return {
      editionId,
      groupStageId: groupStage.id,
      scheduleHash: schedule.scheduleHash,
      matchCount: schedule.matchCount,
      groups: schedule.groups,
      stageStatus: updatedStage.status,
      updatedAt: updatedEdition.updatedAt.toISOString(),
    };
  });
}

export async function getInternationalStatus(editionId: string) {
  const edition = await loadInternationalEdition(editionId);
  const groupStage = edition.stages.find((s) => s.stageType === 'GROUP_STAGE');
  const knockoutStage = edition.stages.find((s) => s.stageType === 'BEST_OF_SERIES');
  const groupMatches = groupStage
    ? await prisma.match.groupBy({
        by: ['status'],
        where: { competitionStageId: groupStage.id, source: 'COMPETITION' },
        _count: true,
      })
    : [];
  return {
    editionId,
    status: edition.status,
    templateKey: edition.tournamentTemplateKey,
    templateHash: edition.tournamentTemplateHash,
    scheduleHash: edition.tournamentScheduleHash,
    bracketHash: edition.tournamentBracketHash,
    resultHash: edition.tournamentResultHash,
    preparedAt: edition.tournamentPreparedAt?.toISOString() ?? null,
    groupStage: groupStage
      ? {
          id: groupStage.id,
          status: groupStage.status,
          scheduleHash: groupStage.scheduleHash,
          matchCounts: Object.fromEntries(groupMatches.map((r) => [r.status, r._count])),
        }
      : null,
    knockoutStage: knockoutStage
      ? {
          id: knockoutStage.id,
          status: knockoutStage.status,
          bracketHash: knockoutStage.bracketHash,
          championParticipantId: knockoutStage.championParticipantId,
        }
      : null,
    medalCount: edition.tournamentMedals.length,
  };
}

export async function getInternationalOverview(editionId: string) {
  const edition = await loadInternationalEdition(editionId);
  const template = parseStoredTemplate(edition);
  return {
    editionId,
    displayName: edition.displayName,
    status: edition.status,
    competitionName: edition.competition.name,
    template,
    templateHash: edition.tournamentTemplateHash,
    participants: edition.participants.map((p) => ({
      id: p.id,
      teamId: p.teamId,
      teamName: p.teamNameSnapshot,
      seed: p.seed,
      groupKey: p.groupKey,
      status: p.status,
      nationalTeamEditionStatus: p.nationalTeamEdition?.status ?? null,
      countryName: p.nationalTeamEdition?.countryNameSnapshot ?? null,
    })),
    stages: edition.stages.map((s) => ({
      id: s.id,
      name: s.name,
      stageType: s.stageType,
      stageOrder: s.stageOrder,
      status: s.status,
    })),
    medals: edition.tournamentMedals,
  };
}

export async function getInternationalGroups(editionId: string) {
  const edition = await loadInternationalEdition(editionId);
  const groupStage = edition.stages.find((s) => s.stageType === 'GROUP_STAGE');
  if (!groupStage) {
    return { editionId, groups: [], standings: {}, matches: [] };
  }

  const stageParticipants = await prisma.stageParticipant.findMany({
    where: { competitionStageId: groupStage.id },
    include: { participant: true },
    orderBy: { stageOrder: 'asc' },
  });

  const groupsMap = new Map<string, Array<{ participantId: string; teamName: string; seed: number | null }>>();
  for (const sp of stageParticipants) {
    const gk = sp.groupKey ?? sp.participant.groupKey ?? '?';
    if (!groupsMap.has(gk)) groupsMap.set(gk, []);
    groupsMap.get(gk)!.push({
      participantId: sp.competitionParticipantId,
      teamName: sp.participant.teamNameSnapshot,
      seed: sp.seed,
    });
  }

  const standings = await prisma.competitionStageStanding.findMany({
    where: { competitionStageId: groupStage.id },
    orderBy: { rank: 'asc' },
  });

  const matches = await prisma.match.findMany({
    where: { competitionStageId: groupStage.id, source: 'COMPETITION' },
    orderBy: { scheduleOrder: 'asc' },
    select: {
      id: true,
      scheduleKey: true,
      scheduleOrder: true,
      tournamentGroupKey: true,
      homeTeamId: true,
      awayTeamId: true,
      status: true,
      currentResultId: true,
    },
  });

  const standingsByGroup: Record<string, unknown[]> = {};
  for (const row of standings) {
    let gk = '?';
    try {
      const stats = JSON.parse(row.statisticsJson) as { groupKey?: string };
      if (stats.groupKey) gk = stats.groupKey;
    } catch {
      /* ignore */
    }
    if (!standingsByGroup[gk]) standingsByGroup[gk] = [];
    standingsByGroup[gk].push(row);
  }

  return {
    editionId,
    groupStageId: groupStage.id,
    groups: [...groupsMap.entries()].map(([groupKey, teams]) => ({ groupKey, teams })),
    standingsByGroup,
    matches,
  };
}

export async function getInternationalMedals(editionId: string) {
  const edition = await loadInternationalEdition(editionId);
  return {
    editionId,
    resultHash: edition.tournamentResultHash,
    medals: edition.tournamentMedals,
  };
}

export async function getInternationalProgress(editionId: string) {
  const edition = await loadInternationalEdition(editionId);
  const groupStage = edition.stages.find((s) => s.stageType === 'GROUP_STAGE');
  const knockoutStage = edition.stages.find((s) => s.stageType === 'BEST_OF_SERIES');
  const activeGroup = groupStage ? getActiveStageRun(groupStage.id) : null;
  const activeKo = knockoutStage ? getActiveStageRun(knockoutStage.id) : null;
  // Also track edition-level run keyed by edition id for full tournament sims
  const activeEdition = getActiveStageRun(`intl:${editionId}`);

  let groupProgress = null;
  if (groupStage) {
    const total = await prisma.match.count({
      where: { competitionStageId: groupStage.id, source: 'COMPETITION' },
    });
    const completed = await prisma.match.count({
      where: { competitionStageId: groupStage.id, source: 'COMPETITION', status: 'COMPLETED' },
    });
    groupProgress = { total, completed, remaining: total - completed, status: groupStage.status };
  }

  let knockoutProgress = null;
  if (knockoutStage) {
    const total = await prisma.match.count({
      where: { competitionStageId: knockoutStage.id, source: 'COMPETITION' },
    });
    const completed = await prisma.match.count({
      where: {
        competitionStageId: knockoutStage.id,
        source: 'COMPETITION',
        status: 'COMPLETED',
      },
    });
    knockoutProgress = {
      total,
      completed,
      remaining: total - completed,
      status: knockoutStage.status,
      championParticipantId: knockoutStage.championParticipantId,
    };
  }

  return {
    editionId,
    editionStatus: edition.status,
    group: groupProgress,
    knockout: knockoutProgress,
    medals: edition.tournamentMedals.length,
    activeRun: activeEdition
      ? serializeRun(activeEdition)
      : activeGroup
        ? serializeRun(activeGroup)
        : activeKo
          ? serializeRun(activeKo)
          : null,
  };
}

async function loadGroupMatchResults(groupStageId: string, participants: Array<{ id: string; teamId: string }>) {
  const teamToParticipant = new Map(participants.map((p) => [p.teamId, p.id]));
  const matches = await prisma.match.findMany({
    where: {
      competitionStageId: groupStageId,
      source: 'COMPETITION',
      status: 'COMPLETED',
      currentResultId: { not: null },
    },
    orderBy: { scheduleOrder: 'asc' },
  });
  const results = await prisma.matchResult.findMany({
    where: { id: { in: matches.map((m) => m.currentResultId!) } },
  });
  const byId = new Map(results.map((r) => [r.id, r]));

  return matches.flatMap((m) => {
    const result = byId.get(m.currentResultId!);
    if (!result || !m.tournamentGroupKey) return [];
    const homePid = teamToParticipant.get(m.homeTeamId);
    const awayPid = teamToParticipant.get(m.awayTeamId);
    if (!homePid || !awayPid) return [];
    return [
      {
        homeParticipantId: homePid,
        awayParticipantId: awayPid,
        homeTeamId: m.homeTeamId,
        awayTeamId: m.awayTeamId,
        homeScore: result.homeScore,
        awayScore: result.awayScore,
        homeRegulationScore: result.homeRegulationScore,
        awayRegulationScore: result.awayRegulationScore,
        decisionType: result.decisionType as 'REGULATION' | 'OVERTIME' | 'SHOOTOUT' | 'TIE',
        groupKey: m.tournamentGroupKey,
        scheduleOrder: m.scheduleOrder ?? 0,
        winnerParticipantId:
          result.winnerTeamId == null ? null : teamToParticipant.get(result.winnerTeamId) ?? null,
      },
    ];
  });
}

async function completeGroupStageAndBuildKnockout(editionId: string) {
  const edition = await loadInternationalEdition(editionId);
  const template = parseStoredTemplate(edition);
  if (!template) {
    throw new InternationalTournamentHttpError(409, 'TournamentNotReady', 'Template missing');
  }
  const groupStage = edition.stages.find((s) => s.stageType === 'GROUP_STAGE');
  const knockoutStage = edition.stages.find((s) => s.stageType === 'BEST_OF_SERIES');
  if (!groupStage || !knockoutStage) {
    throw new InternationalTournamentHttpError(409, 'TournamentNotReady', 'Stages missing');
  }

  const participants = edition.participants.filter((p) =>
    ['CONFIRMED', 'ELIMINATED', 'CHAMPION'].includes(p.status),
  );
  const stageParticipants = await prisma.stageParticipant.findMany({
    where: { competitionStageId: groupStage.id },
    include: { participant: true },
  });

  const groups = [...new Set(stageParticipants.map((sp) => sp.groupKey).filter(Boolean) as string[])]
    .sort()
    .map((groupKey) => ({
      groupKey,
      participants: stageParticipants
        .filter((sp) => sp.groupKey === groupKey)
        .map((sp) => ({
          participantId: sp.competitionParticipantId,
          teamId: sp.participant.teamId,
          teamNameSnapshot: sp.participant.teamNameSnapshot,
        })),
    }));

  const results = await loadGroupMatchResults(
    groupStage.id,
    participants.map((p) => ({ id: p.id, teamId: p.teamId })),
  );

  const scheduledByGroup: Record<string, number> = {};
  const allMatches = await prisma.match.findMany({
    where: { competitionStageId: groupStage.id, source: 'COMPETITION' },
    select: { tournamentGroupKey: true },
  });
  for (const m of allMatches) {
    if (!m.tournamentGroupKey) continue;
    scheduledByGroup[m.tournamentGroupKey] = (scheduledByGroup[m.tournamentGroupKey] ?? 0) + 1;
  }

  const { byGroup, hashes } = computeAllGroupStandings({
    groups,
    results,
    template,
    standingsSeed: edition.tournamentBaseSeed ?? editionId,
    provisional: false,
    scheduledMatchCountByGroup: scheduledByGroup,
  });

  let bracket: GeneratedKnockoutBracket;
  try {
    bracket = buildQualificationAndKnockout({ groupStandings: byGroup, template });
  } catch (err) {
    mapEngineError(err);
  }

  const rulesJson = canonicalizeStoredMatchRules(buildMatchRulesFromTemplate(template));
  const participantById = new Map(participants.map((p) => [p.id, p]));

  await prisma.$transaction(async (tx) => {
    await tx.competitionStageStanding.deleteMany({ where: { competitionStageId: groupStage.id } });

    // Unique ranks across groups for schema constraint
    let globalRank = 0;
    const groupKeys = Object.keys(byGroup).sort();
    for (const gk of groupKeys) {
      const rows = byGroup[gk] ?? [];
      for (const row of rows) {
        globalRank += 1;
        const p = participantById.get(row.participantId);
        if (!p) continue;
        await tx.competitionStageStanding.create({
          data: {
            competitionStageId: groupStage.id,
            competitionParticipantId: row.participantId,
            rank: globalRank,
            teamId: p.teamId,
            teamNameSnapshot: p.teamNameSnapshot,
            gamesPlayed: row.gamesPlayed,
            regulationWins: row.regulationWins,
            overtimeWins: row.overtimeWins,
            shootoutWins: row.shootoutWins,
            regulationLosses: row.regulationLosses,
            overtimeLosses: row.overtimeLosses,
            shootoutLosses: row.shootoutLosses,
            ties: 0,
            wins: row.regulationWins + row.overtimeWins + row.shootoutWins,
            losses: row.regulationLosses + row.overtimeLosses + row.shootoutLosses,
            goalsFor: row.goalsFor,
            goalsAgainst: row.goalsAgainst,
            goalDifference: row.goalDifference,
            points: row.points,
            pointsPercentage:
              row.gamesPlayed > 0 ? row.points / (row.gamesPlayed * 3) : 0,
            qualified: row.qualified,
            tiebreakerSummaryText: row.tiebreakerSummary,
            statisticsJson: JSON.stringify({
              groupKey: gk,
              groupRank: row.rank,
              standingsHash: hashes[gk],
            }),
            snapshotHash: hashes[gk] ?? `${gk}:${row.participantId}`,
          },
        });
      }
    }

    await tx.competitionStage.update({
      where: { id: groupStage.id },
      data: {
        status: 'COMPLETED',
        completedAt: new Date(),
        scheduleStatus: 'LOCKED',
      },
    });

    // Materialize knockout stage participants
    await tx.stageParticipant.deleteMany({ where: { competitionStageId: knockoutStage.id } });
    await tx.playoffSeries.deleteMany({ where: { competitionStageId: knockoutStage.id } });
    await tx.match.deleteMany({ where: { competitionStageId: knockoutStage.id } });

    let koOrder = 0;
    for (const q of bracket.qualification) {
      const existing = await tx.stageParticipant.findUnique({
        where: {
          competitionStageId_competitionParticipantId: {
            competitionStageId: knockoutStage.id,
            competitionParticipantId: q.participantId,
          },
        },
      });
      if (existing) continue;
      koOrder += 1;
      await tx.stageParticipant.create({
        data: {
          competitionStageId: knockoutStage.id,
          competitionParticipantId: q.participantId,
          seed: q.knockoutSeed,
          stageOrder: koOrder,
          status: 'CONFIRMED',
        },
      });
    }

    const configText = JSON.stringify({
      winsRequired: 1,
      homePattern: '1',
      reseeding: template.knockout.reseeding,
      qualificationCount: bracket.qualification.length,
      internationalMatchups: bracket.matchups,
    });

    await tx.competitionStage.update({
      where: { id: knockoutStage.id },
      data: {
        status: 'SCHEDULED',
        bracketHash: bracket.bracketHash,
        bracketSeed: edition.tournamentBaseSeed,
        bracketVersion: knockoutStage.bracketVersion + 1,
        bracketGeneratedAt: new Date(),
        scheduleStatus: 'GENERATED',
        configText,
        configHash: hashStageConfig(
          validateStageConfig('BEST_OF_SERIES', {
            winsRequired: 1,
            homePattern: '1',
            reseeding: template.knockout.reseeding,
            qualificationCount: bracket.qualification.length,
          }),
        ),
      },
    });

    await tx.competitionEdition.update({
      where: { id: editionId },
      data: { tournamentBracketHash: bracket.bracketHash },
    });

    // Create series only for matchups with both participants known
    for (const m of bracket.matchups) {
      if (!m.participant1Id || !m.participant2Id) continue;
      await createInternationalSeriesMatch(tx, {
        editionId,
        knockoutStageId: knockoutStage.id,
        matchup: m,
        participantById,
        rulesJson,
        rulesHash: edition.rulesHash,
      });
    }
  });

  return { bracketHash: bracket.bracketHash, groupStandings: byGroup };
}

async function createInternationalSeriesMatch(
  tx: Prisma.TransactionClient,
  opts: {
    editionId: string;
    knockoutStageId: string;
    matchup: KnockoutMatchupSpec;
    participantById: Map<string, { id: string; teamId: string; teamNameSnapshot: string }>;
    rulesJson: string;
    rulesHash: string;
  },
) {
  const p1 = opts.participantById.get(opts.matchup.participant1Id!);
  const p2 = opts.participantById.get(opts.matchup.participant2Id!);
  if (!p1 || !p2) {
    throw new InternationalTournamentHttpError(
      422,
      'QualificationFailed',
      'Missing participant for knockout matchup',
    );
  }
  const seed1 = opts.matchup.participant1Seed ?? 1;
  const seed2 = opts.matchup.participant2Seed ?? 2;
  const homeAdvantage = seed1 <= seed2 ? p1.id : p2.id;
  const homeTeamId = seed1 <= seed2 ? p1.teamId : p2.teamId;
  const awayTeamId = seed1 <= seed2 ? p2.teamId : p1.teamId;

  const series = await tx.playoffSeries.create({
    data: {
      competitionStageId: opts.knockoutStageId,
      roundNumber: opts.matchup.roundNumber,
      roundName: opts.matchup.roundName,
      seriesOrder: opts.matchup.seriesOrder,
      bracketSlot: String(opts.matchup.bracketSlot),
      status: 'READY',
      participant1Id: p1.id,
      participant2Id: p2.id,
      participant1Seed: seed1,
      participant2Seed: seed2,
      participant1NameSnapshot: p1.teamNameSnapshot,
      participant2NameSnapshot: p2.teamNameSnapshot,
      winsRequired: 1,
      homeAdvantageParticipantId: homeAdvantage,
      homePatternText: '1',
    },
  });

  await tx.match.create({
    data: {
      homeTeamId,
      awayTeamId,
      competitionEditionId: opts.editionId,
      competitionStageId: opts.knockoutStageId,
      playoffSeriesId: series.id,
      playoffGameNumber: 1,
      status: 'PREPARED',
      source: 'COMPETITION',
      createdBySource: 'INTERNATIONAL_KNOCKOUT',
      rulesJson: opts.rulesJson,
      competitionRulesHash: opts.rulesHash,
      scheduleKey: `intl-ko:${opts.matchup.roundName}:${opts.matchup.bracketSlot}`,
      scheduleOrder: opts.matchup.seriesOrder,
    },
  });

  return series;
}

function parseMatchupsFromStageConfig(configText: string): KnockoutMatchupSpec[] {
  try {
    const raw = JSON.parse(configText) as { internationalMatchups?: KnockoutMatchupSpec[] };
    return raw.internationalMatchups ?? [];
  } catch {
    return [];
  }
}

export async function progressInternationalKnockoutAfterMatch(matchId: string) {
  const match = await prisma.match.findUnique({ where: { id: matchId } });
  if (!match?.playoffSeriesId || !match.competitionEditionId || !match.competitionStageId) {
    return null;
  }

  const edition = await prisma.competitionEdition.findUnique({
    where: { id: match.competitionEditionId },
    include: { competition: true, participants: true },
  });
  if (!edition || edition.competition.type !== 'INTERNATIONAL_TOURNAMENT') return null;

  const series = await prisma.playoffSeries.findUniqueOrThrow({ where: { id: match.playoffSeriesId } });
  const stage = await prisma.competitionStage.findUniqueOrThrow({
    where: { id: match.competitionStageId },
  });
  const template = parseStoredTemplate(edition);
  if (!template) return null;

  const result = match.currentResultId
    ? await prisma.matchResult.findUnique({ where: { id: match.currentResultId } })
    : null;
  if (!result) return null;

  const winnerParticipantId =
    result.winnerTeamId === null
      ? null
      : edition.participants.find((p) => p.teamId === result.winnerTeamId)?.id ?? null;
  if (!winnerParticipantId) {
    throw new InternationalTournamentHttpError(
      422,
      'KnockoutReconciliationFailed',
      'Knockout match requires a winner',
    );
  }
  const loserParticipantId =
    winnerParticipantId === series.participant1Id ? series.participant2Id : series.participant1Id;

  await prisma.playoffSeries.update({
    where: { id: series.id },
    data: {
      status: 'COMPLETED',
      participant1Wins: winnerParticipantId === series.participant1Id ? 1 : 0,
      participant2Wins: winnerParticipantId === series.participant2Id ? 1 : 0,
      winnerParticipantId,
      completedAt: new Date(),
      startedAt: series.startedAt ?? new Date(),
    },
  });
  await prisma.competitionParticipant.update({
    where: { id: loserParticipantId },
    data: { status: 'ELIMINATED' },
  });

  if (stage.status === 'SCHEDULED') {
    await prisma.competitionStage.update({
      where: { id: stage.id },
      data: {
        status: 'IN_PROGRESS',
        simulationStartedAt: stage.simulationStartedAt ?? new Date(),
        scheduleStatus: 'LOCKED',
      },
    });
  }

  const allSeries = await prisma.playoffSeries.findMany({
    where: { competitionStageId: stage.id, status: 'COMPLETED' },
  });
  const completed: CompletedKnockoutGame[] = allSeries.map((s) => {
    const winner = s.winnerParticipantId!;
    const loser = winner === s.participant1Id ? s.participant2Id : s.participant1Id;
    return {
      roundName: s.roundName as CompletedKnockoutGame['roundName'],
      bracketSlot: Number(s.bracketSlot),
      winnerParticipantId: winner,
      loserParticipantId: loser,
      scheduleKey: `intl-ko:${s.roundName}:${s.bracketSlot}`,
    };
  });

  let matchups = parseMatchupsFromStageConfig(stage.configText);
  matchups = progressKnockoutBracket({ matchups, completed });

  const participantById = new Map(
    edition.participants.map((p) => [
      p.id,
      { id: p.id, teamId: p.teamId, teamNameSnapshot: p.teamNameSnapshot },
    ]),
  );
  const rulesJson = canonicalizeStoredMatchRules(buildMatchRulesFromTemplate(template));

  await prisma.$transaction(async (tx) => {
    const configRaw = JSON.parse(stage.configText) as Record<string, unknown>;
    await tx.competitionStage.update({
      where: { id: stage.id },
      data: {
        configText: JSON.stringify({ ...configRaw, internationalMatchups: matchups }),
      },
    });

    for (const m of matchups) {
      if (!m.participant1Id || !m.participant2Id) continue;
      const existing = await tx.playoffSeries.findUnique({
        where: {
          competitionStageId_bracketSlot: {
            competitionStageId: stage.id,
            bracketSlot: String(m.bracketSlot),
          },
        },
      });
      if (existing) continue;
      await createInternationalSeriesMatch(tx, {
        editionId: edition.id,
        knockoutStageId: stage.id,
        matchup: m,
        participantById,
        rulesJson,
        rulesHash: edition.rulesHash,
      });
    }
  });

  const finalDone = completed.some((c) => c.roundName === 'FINAL');
  const bronzeNeeded = template.knockout.bronzeGame;
  const bronzeDone = !bronzeNeeded || completed.some((c) => c.roundName === 'BRONZE');

  if (finalDone && bronzeDone) {
    await finalizeInternationalTournament(edition.id, completed, template, stage.id);
  }

  return { seriesId: series.id, winnerParticipantId };
}

async function finalizeInternationalTournament(
  editionId: string,
  completed: CompletedKnockoutGame[],
  template: InternationalTournamentTemplate,
  knockoutStageId: string,
) {
  const medals = deriveMedalsFromKnockout({
    completed,
    bronzeEnabled: template.knockout.bronzeGame,
  });
  const edition = await loadInternationalEdition(editionId);
  const participantById = new Map(edition.participants.map((p) => [p.id, p]));
  const medalsHash = hashTournamentMedals(medals);

  const groupStage = edition.stages.find((s) => s.stageType === 'GROUP_STAGE');
  const standingsHashes: string[] = [];
  if (groupStage) {
    const standings = await prisma.competitionStageStanding.findMany({
      where: { competitionStageId: groupStage.id },
    });
    for (const s of standings) {
      try {
        const stats = JSON.parse(s.statisticsJson) as { standingsHash?: string };
        if (stats.standingsHash) standingsHashes.push(stats.standingsHash);
      } catch {
        /* ignore */
      }
    }
  }

  const resultHash = hashTournamentResult({
    scheduleHash: edition.tournamentScheduleHash ?? '',
    bracketHash: edition.tournamentBracketHash ?? '',
    medalsHash,
    standingsHashes: [...new Set(standingsHashes)],
  });

  const gold = medals.find((m) => m.medalType === 'GOLD');
  const champion = gold ? participantById.get(gold.participantId) : null;

  await prisma.$transaction(async (tx) => {
    await tx.tournamentMedalResult.deleteMany({ where: { competitionEditionId: editionId } });

    for (const medal of medals) {
      const p = participantById.get(medal.participantId);
      if (!p) continue;
      const nt = p.nationalTeamEdition;
      const sourceMatch = medal.sourceMatchKey
        ? await tx.match.findFirst({
            where: {
              competitionEditionId: editionId,
              scheduleKey: medal.sourceMatchKey,
            },
          })
        : null;
      const resultHashRow = hashTournamentMedals([medal]);
      await tx.tournamentMedalResult.create({
        data: {
          competitionEditionId: editionId,
          competitionStageId: knockoutStageId,
          medalType: medal.medalType,
          competitionParticipantId: medal.participantId,
          nationalTeamEditionId: nt?.id ?? null,
          teamNameSnapshot: p.teamNameSnapshot,
          countryNameSnapshot: nt?.countryNameSnapshot ?? '',
          sourceMatchId: sourceMatch?.id ?? null,
          finalPlacement: medal.finalPlacement,
          resultHash: resultHashRow,
        },
      });
    }

    if (champion) {
      await tx.competitionParticipant.update({
        where: { id: champion.id },
        data: { status: 'CHAMPION' },
      });
      await tx.competitionStage.update({
        where: { id: knockoutStageId },
        data: {
          status: 'COMPLETED',
          completedAt: new Date(),
          championParticipantId: champion.id,
          championTeamNameSnapshot: champion.teamNameSnapshot,
          championSeed: champion.seed,
        },
      });
    } else {
      await tx.competitionStage.update({
        where: { id: knockoutStageId },
        data: { status: 'COMPLETED', completedAt: new Date() },
      });
    }

    await tx.competitionEdition.update({
      where: { id: editionId },
      data: {
        status: 'COMPLETED',
        completedAt: new Date(),
        tournamentResultHash: resultHash,
      },
    });
  });

  return { resultHash, medals };
}

export async function startInternationalTournamentSimulation(
  editionId: string,
  opts: { baseSeed: string },
): Promise<StageRunRecord> {
  const edition = await loadInternationalEdition(editionId);
  if (edition.status !== 'ACTIVE' && edition.status !== 'COMPLETED') {
    throw new InternationalTournamentHttpError(
      409,
      'TournamentNotReady',
      'Edition must be ACTIVE to simulate',
    );
  }
  if (edition.status === 'COMPLETED') {
    throw new InternationalTournamentHttpError(
      409,
      'TournamentAlreadyCompleted',
      'Tournament is already completed',
    );
  }
  if (!edition.tournamentScheduleHash) {
    throw new InternationalTournamentHttpError(
      409,
      'TournamentNotReady',
      'Group schedule has not been generated',
    );
  }

  const runKey = `intl:${editionId}`;
  const existing = getActiveStageRun(runKey);
  if (existing && (existing.status === 'QUEUED' || existing.status === 'RUNNING')) {
    throw new InternationalTournamentHttpError(
      409,
      'TournamentSimulationAlreadyRunning',
      'A tournament simulation run is already active',
    );
  }

  const groupStage = edition.stages.find((s) => s.stageType === 'GROUP_STAGE');
  if (!groupStage) {
    throw new InternationalTournamentHttpError(409, 'TournamentNotReady', 'Group stage missing');
  }

  const anyCompleted = await prisma.match.count({
    where: { competitionEditionId: editionId, source: 'COMPETITION', status: 'COMPLETED' },
  });

  let backupMeta: StageRunRecord['backup'] = null;
  if (anyCompleted === 0) {
    try {
      const backup = await createSqliteSafetyBackup({
        label: `intl-${editionId.slice(0, 8)}`,
        sourceOperationType: 'INTERNATIONAL_TOURNAMENT',
        sourceOperationId: editionId,
      });
      backupMeta = {
        relativeDisplayPath: backup.relativeDisplayPath,
        createdAt: backup.createdAt,
        bytes: backup.bytes,
      };
    } catch (err) {
      throw new InternationalTournamentHttpError(
        503,
        'BackupFailed',
        err instanceof Error ? err.message : 'Pre-run backup failed',
      );
    }
  }

  const remaining = await prisma.match.count({
    where: {
      competitionEditionId: editionId,
      source: 'COMPETITION',
      status: { in: ['PREPARED', 'FAILED'] },
      currentResultId: null,
    },
  });

  const run = createStageRun({
    stageId: runKey,
    baseSeed: opts.baseSeed,
    total: Math.max(1, remaining),
  });
  run.backup = backupMeta;
  void executeInternationalRun(run.id, editionId).catch(() => undefined);
  return run;
}

async function executeInternationalRun(runId: string, editionId: string) {
  const run = getStageRun(runId);
  if (!run) return;
  run.status = 'RUNNING';
  run.startedAt = Date.now();

  try {
    const edition = await loadInternationalEdition(editionId);
    const template = parseStoredTemplate(edition);
    if (!template) throw new Error('Template missing');
    const groupStage = edition.stages.find((s) => s.stageType === 'GROUP_STAGE');
    if (!groupStage) throw new Error('Group stage missing');
    const scheduleHash = edition.tournamentScheduleHash ?? groupStage.scheduleHash ?? '';
    const baseSeed = run.baseSeed;

    // Group stage matches
    if (groupStage.status !== 'COMPLETED') {
      if (groupStage.status === 'SCHEDULED') {
        await prisma.competitionStage.update({
          where: { id: groupStage.id },
          data: {
            status: 'IN_PROGRESS',
            simulationStartedAt: groupStage.simulationStartedAt ?? new Date(),
            scheduleStatus: 'LOCKED',
          },
        });
      }

      const groupMatches = await prisma.match.findMany({
        where: {
          competitionStageId: groupStage.id,
          source: 'COMPETITION',
          status: { in: ['PREPARED', 'FAILED'] },
          currentResultId: null,
        },
        orderBy: { scheduleOrder: 'asc' },
      });

      for (const m of groupMatches) {
        if (run.cancelRequested) {
          run.status = 'CANCELLED';
          run.completedAt = Date.now();
          run.isPartialOfficial = run.progress.completed > 0;
          return;
        }
        run.progress.currentMatchId = m.id;
        run.progress.currentScheduleOrder = m.scheduleOrder;
        const seed = deriveInternationalGroupMatchSeed(
          baseSeed,
          scheduleHash,
          m.tournamentGroupKey ?? 'A',
          m.scheduleOrder ?? 0,
        );
        await simulateMatch(m.id, seed);
        run.progress.completed += 1;
        await yieldEventLoop();
      }

      await completeGroupStageAndBuildKnockout(editionId);
    }

    // Knockout
    let safety = 0;
    while (safety < 100) {
      safety += 1;
      if (run.cancelRequested) {
        run.status = 'CANCELLED';
        run.completedAt = Date.now();
        run.isPartialOfficial = run.progress.completed > 0;
        return;
      }

      const refreshed = await loadInternationalEdition(editionId);
      if (refreshed.status === 'COMPLETED') break;

      const knockoutStage = refreshed.stages.find((s) => s.stageType === 'BEST_OF_SERIES');
      if (!knockoutStage) break;

      const next = await prisma.match.findFirst({
        where: {
          competitionStageId: knockoutStage.id,
          status: { in: ['PREPARED', 'FAILED'] },
          currentResultId: null,
        },
        include: { playoffSeries: true },
        orderBy: [{ scheduleOrder: 'asc' }, { playoffGameNumber: 'asc' }],
      });
      if (!next || !next.playoffSeries) {
        await yieldEventLoop();
        const still = await prisma.match.findFirst({
          where: {
            competitionStageId: knockoutStage.id,
            status: { in: ['PREPARED', 'FAILED'] },
            currentResultId: null,
          },
        });
        if (!still) {
          const ed = await loadInternationalEdition(editionId);
          if (ed.status === 'COMPLETED') break;
          await yieldEventLoop();
          continue;
        }
        continue;
      }

      run.progress.currentMatchId = next.id;
      run.progress.total = Math.max(run.progress.total, run.progress.completed + 1);
      const koSeed = deriveInternationalKnockoutMatchSeed(
        baseSeed,
        refreshed.tournamentBracketHash ?? knockoutStage.bracketHash ?? '',
        next.playoffSeries.roundName,
        Number(next.playoffSeries.bracketSlot),
      );
      await simulateMatch(next.id, koSeed);
      run.progress.completed += 1;
      await yieldEventLoop();
    }

    run.status = 'COMPLETED';
    run.completedAt = Date.now();
  } catch (err) {
    run.status = 'FAILED';
    run.completedAt = Date.now();
    run.error = {
      code: err instanceof Error ? (err as { code?: string }).code ?? 'SimulationFailed' : 'SimulationFailed',
      message: err instanceof Error ? err.message : 'International tournament simulation failed',
    };
  }
}

export function getInternationalSimulationRun(runId: string) {
  const run = getStageRun(runId);
  if (!run) {
    throw new InternationalTournamentHttpError(404, 'SimulationRunNotFound', 'Run not found');
  }
  return serializeRun(run);
}

export function cancelInternationalSimulation(runId: string) {
  const run = requestCancelStageRun(runId);
  if (!run) {
    throw new InternationalTournamentHttpError(404, 'SimulationRunNotFound', 'Run not found');
  }
  return serializeRun(run);
}

export { serializeRun as serializeInternationalRun };
