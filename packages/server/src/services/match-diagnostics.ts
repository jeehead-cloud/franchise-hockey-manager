import type { SimulationInput } from '@fhm/engine';
import { prisma } from '../db/client.js';
import { MatchHttpError } from './matches.js';
import {
  buildPlayerDirectory,
  buildTeamDirectory,
  loadMatchResultContext,
  parseSimulationInput,
  playerDisplayName,
} from './match-result-context.js';
import { PUBLIC_EVENT_TYPES } from './match-events.js';

function sanitizePlayer(player: SimulationInput['homeTeam']['players'][number]) {
  return {
    playerId: player.playerId,
    firstName: player.firstName,
    lastName: player.lastName,
    primaryPosition: player.primaryPosition,
    currentAbility: player.currentAbility,
    role: player.role,
    effectivePerformance: player.effectivePerformance,
    // intentionally omit potential / hidden fields
  };
}

function sanitizeInputSummary(input: SimulationInput | null) {
  if (!input) return null;
  const teamSummary = (team: SimulationInput['homeTeam']) => ({
    teamId: team.teamId,
    teamName: team.teamName,
    coach: team.coach
      ? {
          coachingStyle: team.coach.coachingStyle,
          tacticalStyle: team.coach.tacticalStyle,
          overallCoaching: team.coach.overallCoaching,
          offense: team.coach.offense,
          defense: team.coach.defense,
        }
      : null,
    tacticalStyle: team.tacticalStyle,
    lineupAssignments: team.lineupAssignments,
    forwardLines: team.forwardLines.map((u) => ({
      unitKey: u.unitKey,
      playerIds: u.playerIds,
      effectivePerformance: u.effectivePerformance,
    })),
    defensePairs: team.defensePairs.map((u) => ({
      unitKey: u.unitKey,
      playerIds: u.playerIds,
      effectivePerformance: u.effectivePerformance,
    })),
    starterGoalie: {
      unitKey: team.starterGoalie.unitKey,
      playerIds: team.starterGoalie.playerIds,
      effectivePerformance: team.starterGoalie.effectivePerformance,
    },
    players: team.players.map(sanitizePlayer),
  });

  return {
    matchId: input.matchId,
    engineVersion: input.engineVersion,
    simulationMode: input.simulationMode,
    seed: input.seed,
    inputFingerprint: input.inputFingerprint,
    rules: input.rules,
    completionRules: input.completionRules ?? null,
    balance: {
      presetId: input.balance.presetId,
      presetName: input.balance.presetName,
      versionId: input.balance.versionId,
      versionNumber: input.balance.versionNumber,
      schemaVersion: input.balance.schemaVersion,
      configHash: input.balance.configHash,
    },
    homeTeam: teamSummary(input.homeTeam),
    awayTeam: teamSummary(input.awayTeam),
  };
}

export async function getMatchDiagnostics(
  matchId: string,
  resultId?: string | null,
): Promise<Record<string, unknown> | null> {
  const loaded = await loadMatchResultContext(matchId, resultId);
  if (!loaded) return null;
  if (!loaded.result) {
    throw new MatchHttpError(404, 'MatchResultNotFound', 'Match has no completed result yet');
  }

  const { match, result, isCurrent } = loaded;
  const input = parseSimulationInput(result.simulationInputText);
  const diagnostics = result.diagnosticsText ? (JSON.parse(result.diagnosticsText) as Record<string, unknown>) : null;
  const reconciliation = result.reconciliationJson ? JSON.parse(result.reconciliationJson) : null;
  const playerDirectory = buildPlayerDirectory(result.simulationInputText);
  const teamDirectory = buildTeamDirectory(result.simulationInputText);

  const [eventRows, playerStatCount, teamStatCount] = await Promise.all([
    prisma.matchEvent.findMany({
      where: { matchResultId: result.id },
      select: { eventType: true, period: true, visibility: true },
    }),
    prisma.playerGameStat.count({ where: { matchResultId: result.id } }),
    prisma.teamGameStat.count({ where: { matchResultId: result.id } }),
  ]);

  const eventsByType: Record<string, number> = {};
  const eventsByPeriod: Record<string, number> = {};
  let publicCount = 0;
  let technicalCount = 0;
  for (const row of eventRows) {
    eventsByType[row.eventType] = (eventsByType[row.eventType] ?? 0) + 1;
    eventsByPeriod[String(row.period)] = (eventsByPeriod[String(row.period)] ?? 0) + 1;
    if (row.visibility === 'TECHNICAL') technicalCount += 1;
    else publicCount += 1;
  }

  const lightweightChecks = [
    {
      code: 'EVENT_ROWS_PRESENT',
      ok: eventRows.length > 0,
      message: eventRows.length > 0 ? `${eventRows.length} persisted events` : 'No persisted events',
    },
    {
      code: 'TEAM_STAT_ROWS',
      ok: teamStatCount === 2,
      message: `Expected 2 team stat rows, found ${teamStatCount}`,
    },
    {
      code: 'PLAYER_STAT_ROWS',
      ok: playerStatCount > 0,
      message: `Found ${playerStatCount} player stat rows`,
    },
    {
      code: 'STORED_RECONCILIATION',
      ok: Boolean(reconciliation?.ok) || result.reconciliationStatus === 'OK',
      message: `Stored reconciliation status: ${result.reconciliationStatus}`,
    },
  ];

  const topShooters = Array.isArray(diagnostics?.topShooters)
    ? (diagnostics.topShooters as Array<{ playerId: string; shotsOnGoal: number; goals: number }>).map((row) => ({
        ...row,
        playerName: playerDisplayName(playerDirectory.get(row.playerId), row.playerId),
      }))
    : [];

  const goalieSummaries = Array.isArray(diagnostics?.goalieSummaries)
    ? (diagnostics.goalieSummaries as Array<{
        playerId: string;
        shotsAgainst: number;
        saves: number;
        goalsAgainst: number;
        savePercentage: number;
      }>).map((row) => ({
        ...row,
        playerName: playerDisplayName(playerDirectory.get(row.playerId), row.playerId),
        teamName: playerDirectory.get(row.playerId)
          ? teamDirectory.get(playerDirectory.get(row.playerId)!.teamId)?.teamName ?? null
          : null,
      }))
    : [];

  return {
    matchId: match.id,
    resultId: result.id,
    attemptNumber: result.attemptNumber,
    isCurrent,
    resultStatus: result.status,
    identity: {
      engineVersion: result.engineVersion,
      simulationMode: result.simulationMode,
      randomSeed: result.randomSeed,
      inputFingerprint: result.inputFingerprint,
      balance: {
        presetId: result.balancePresetId,
        versionId: result.balancePresetVersionId,
        versionNumber: result.balanceVersionNumber,
        configHash: result.balanceConfigHash,
        presetName: input?.balance.presetName ?? null,
        schemaVersion: input?.balance.schemaVersion ?? null,
      },
      traceHash: result.traceHash,
      startedAt: result.startedAt.toISOString(),
      completedAt: result.completedAt?.toISOString() ?? null,
      supersededAt: result.supersededAt?.toISOString() ?? null,
      supersededByResultId: result.supersededByResultId,
    },
    reconciliation: {
      status: result.reconciliationStatus,
      stored: reconciliation,
      lightweightChecks,
      overallOk: lightweightChecks.every((c) => c.ok) && (Boolean(reconciliation?.ok) || result.reconciliationStatus === 'OK'),
    },
    eventCounts: {
      total: eventRows.length,
      public: publicCount,
      technical: technicalCount,
      byType: eventsByType,
      byPeriod: eventsByPeriod,
      publicEventTypes: PUBLIC_EVENT_TYPES,
    },
    diagnostics,
    shotDiagnostics: diagnostics
      ? {
          shotAttempts: diagnostics.shotAttempts,
          shotsBlocked: diagnostics.shotsBlocked,
          shotsMissed: diagnostics.shotsMissed,
          shotsOnGoal: diagnostics.shotsOnGoal,
          saves: diagnostics.saves,
          goals: diagnostics.goals,
          shootingPercentage: diagnostics.shootingPercentage,
          savePercentage: diagnostics.savePercentage,
          averageShotQuality: diagnostics.averageShotQuality,
          shotQualityNote: 'Average shot quality is a diagnostic composite, not an expected-goals (xG) model.',
          shotTypes: diagnostics.shotTypes,
          shotsByPeriod: diagnostics.shotsByPeriod,
          goalsByPeriod: diagnostics.goalsByPeriod,
          topShooters,
          goalieSummaries,
        }
      : null,
    specialTeams: diagnostics
      ? {
          penalties: diagnostics.penalties,
          powerPlayOpportunities: diagnostics.powerPlayOpportunities,
          powerPlayGoals: diagnostics.powerPlayGoals,
          powerPlayPercentage: diagnostics.powerPlayPercentage,
          shortHandedGoals: diagnostics.shortHandedGoals,
          penaltiesByInfraction: diagnostics.penaltiesByInfraction,
          evenStrengthGoals: diagnostics.evenStrengthGoals,
        }
      : null,
    possessionAndZones: diagnostics
      ? {
          possessionSecondsByTeam: diagnostics.possessionSecondsByTeam,
          zoneSecondsByTeam: diagnostics.zoneSecondsByTeam,
          faceoffWins: diagnostics.faceoffWins,
          turnoversByTeam: diagnostics.turnoversByTeam,
        }
      : null,
    lineUsage: diagnostics?.shiftsByTeamLine ?? null,
    inputSummary: sanitizeInputSummary(input),
  };
}

export async function listMatchAudit(matchId: string, pagination: { skip: number; pageSize: number }) {
  const match = await prisma.match.findUnique({ where: { id: matchId } });
  if (!match) return null;

  const where = {
    OR: [
      { entityType: 'MATCH' as const, entityId: matchId },
      {
        entityType: 'MATCH_RESULT' as const,
        entityId: { in: (await prisma.matchResult.findMany({ where: { matchId }, select: { id: true } })).map((r) => r.id) },
      },
    ],
  };

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
    matchId,
    items: rows.map((row) => ({
      id: row.id,
      entityType: row.entityType,
      entityId: row.entityId,
      action: row.action,
      reason: row.reason,
      source: row.source,
      createdAt: row.createdAt.toISOString(),
      before: row.beforeJson ? JSON.parse(row.beforeJson) : null,
      after: row.afterJson ? JSON.parse(row.afterJson) : null,
    })),
    total,
  };
}
