import type { SimulationInput } from '@fhm/engine';
import { prisma } from '../db/client.js';
import { MatchHttpError } from './matches.js';
import {
  buildPlayerDirectory,
  buildTeamDirectory,
  loadMatchResultContext,
  parseSimulationInput,
  pct,
  playerDisplayName,
} from './match-result-context.js';

interface PersistedEvent {
  index?: number;
  type?: string;
  period?: number;
  remainingSeconds?: number;
  teamId?: string | null;
  playerIds?: string[];
  strengthState?: string;
  details?: Record<string, unknown>;
}

function strengthLabel(strength: unknown, goalStrength: unknown): string {
  if (goalStrength === 'POWER_PLAY') return 'PP';
  if (goalStrength === 'SHORT_HANDED') return 'SH';
  if (typeof strength === 'string' && strength.includes('POWER_PLAY')) return 'PP';
  if (typeof strength === 'string' && strength.includes('EVEN_3V3')) return 'OT';
  return 'EV';
}

function derivePeriodScores(
  events: Array<{ eventType: string; period: number; teamId: string | null; eventJson: string }>,
  homeTeamId: string,
  awayTeamId: string,
) {
  const byPeriod = new Map<number, { home: number; away: number }>();
  for (const row of events) {
    if (row.eventType !== 'GOAL' || !row.teamId) continue;
    const bucket = byPeriod.get(row.period) ?? { home: 0, away: 0 };
    if (row.teamId === homeTeamId) bucket.home += 1;
    else if (row.teamId === awayTeamId) bucket.away += 1;
    byPeriod.set(row.period, bucket);
  }
  return [...byPeriod.entries()]
    .sort(([a], [b]) => a - b)
    .map(([period, scores]) => ({ period, home: scores.home, away: scores.away }));
}

function buildScoringSummary(
  events: Array<{ eventType: string; period: number; remainingSeconds: number; teamId: string | null; eventJson: string }>,
  homeTeamId: string,
  awayTeamId: string,
  playerDirectory: ReturnType<typeof buildPlayerDirectory>,
  teamDirectory: ReturnType<typeof buildTeamDirectory>,
) {
  let home = 0;
  let away = 0;
  const goals = [];
  for (const row of events) {
    if (row.eventType !== 'GOAL') continue;
    const event = JSON.parse(row.eventJson) as PersistedEvent;
    const d = event.details ?? {};
    if (row.teamId === homeTeamId) home += 1;
    else if (row.teamId === awayTeamId) away += 1;
    const scorerId = String(d.scorerId ?? event.playerIds?.[0] ?? '');
    const primaryAssistId = d.primaryAssistId ? String(d.primaryAssistId) : null;
    const secondaryAssistId = d.secondaryAssistId ? String(d.secondaryAssistId) : null;
    goals.push({
      period: row.period,
      remainingSeconds: row.remainingSeconds,
      teamId: row.teamId,
      teamName: row.teamId ? teamDirectory.get(row.teamId)?.teamName ?? null : null,
      scorerId: scorerId || null,
      scorerName: playerDisplayName(playerDirectory.get(scorerId), scorerId),
      primaryAssistId,
      primaryAssistName: primaryAssistId
        ? playerDisplayName(playerDirectory.get(primaryAssistId), primaryAssistId)
        : null,
      secondaryAssistId,
      secondaryAssistName: secondaryAssistId
        ? playerDisplayName(playerDirectory.get(secondaryAssistId), secondaryAssistId)
        : null,
      strength: strengthLabel(event.strengthState, d.goalStrength),
      scoreAfter: { home, away },
    });
  }
  return goals;
}

function buildShootoutSummary(
  events: Array<{ eventType: string; eventJson: string }>,
  playerDirectory: ReturnType<typeof buildPlayerDirectory>,
  teamDirectory: ReturnType<typeof buildTeamDirectory>,
) {
  return events
    .filter((row) => row.eventType === 'SHOOTOUT_ATTEMPT')
    .map((row) => {
      const event = JSON.parse(row.eventJson) as PersistedEvent;
      const d = event.details ?? {};
      const shooterId = String(d.shooterId ?? event.playerIds?.[0] ?? '');
      const goalieId = d.goalieId ? String(d.goalieId) : null;
      const teamId = event.teamId ?? null;
      return {
        round: typeof d.round === 'number' ? d.round : null,
        attemptNumber: typeof d.attemptNumber === 'number' ? d.attemptNumber : null,
        teamId,
        teamName: teamId ? teamDirectory.get(teamId)?.teamName ?? null : null,
        shooterId: shooterId || null,
        shooterName: playerDisplayName(playerDirectory.get(shooterId), shooterId),
        goalieId,
        goalieName: goalieId ? playerDisplayName(playerDirectory.get(goalieId), goalieId) : null,
        scored: Boolean(d.scored),
        shootoutScore: d.shootoutScore ?? null,
      };
    });
}

function buildLineUsage(input: SimulationInput | null, diagnostics: Record<string, unknown> | null) {
  if (!input) return null;
  const shifts = (diagnostics?.shiftsByTeamLine as Record<string, number> | undefined) ?? {};
  const mapTeam = (team: SimulationInput['homeTeam']) => ({
    teamId: team.teamId,
    teamName: team.teamName,
    forwardLines: team.forwardLines.map((unit) => ({
      unitKey: unit.unitKey,
      playerIds: unit.playerIds,
      playerNames: unit.playerIds.map((id) => {
        const p = team.players.find((x) => x.playerId === id);
        return p ? `${p.firstName} ${p.lastName}`.trim() : id.slice(0, 8);
      }),
      effectivePerformance: unit.effectivePerformance,
      shiftCount: shifts[`${team.teamId}:${unit.unitKey}`] ?? shifts[unit.unitKey] ?? 0,
    })),
    defensePairs: team.defensePairs.map((unit) => ({
      unitKey: unit.unitKey,
      playerIds: unit.playerIds,
      playerNames: unit.playerIds.map((id) => {
        const p = team.players.find((x) => x.playerId === id);
        return p ? `${p.firstName} ${p.lastName}`.trim() : id.slice(0, 8);
      }),
      effectivePerformance: unit.effectivePerformance,
      shiftCount: shifts[`${team.teamId}:${unit.unitKey}`] ?? shifts[unit.unitKey] ?? 0,
    })),
    starterGoalie: {
      unitKey: team.starterGoalie.unitKey,
      playerIds: team.starterGoalie.playerIds,
      playerNames: team.starterGoalie.playerIds.map((id) => {
        const p = team.players.find((x) => x.playerId === id);
        return p ? `${p.firstName} ${p.lastName}`.trim() : id.slice(0, 8);
      }),
    },
  });
  return {
    home: mapTeam(input.homeTeam),
    away: mapTeam(input.awayTeam),
    note: 'Shift counts are recorded simulation usage, not official NHL TOI.',
  };
}

export async function getMatchOverview(matchId: string, resultId?: string | null) {
  const loaded = await loadMatchResultContext(matchId, resultId);
  if (!loaded) return null;
  const { match, result, isCurrent } = loaded;

  if (match.status !== 'COMPLETED' || !result) {
    return {
      matchId: match.id,
      status: match.status,
      isCurrent: false,
      prepared: true as const,
      homeTeam: {
        id: match.homeTeamId,
        name: match.homeTeam.name,
        side: 'HOME' as const,
      },
      awayTeam: {
        id: match.awayTeamId,
        name: match.awayTeam.name,
        side: 'AWAY' as const,
      },
      competitionEdition: match.competitionEdition
        ? {
            id: match.competitionEdition.id,
            displayName: match.competitionEdition.displayName,
            status: match.competitionEdition.status,
          }
        : null,
      source: match.source,
      currentResultId: match.currentResultId,
      result: null,
    };
  }

  const playerDirectory = buildPlayerDirectory(result.simulationInputText);
  const teamDirectory = buildTeamDirectory(result.simulationInputText);
  const input = parseSimulationInput(result.simulationInputText);
  const homeSnapshot = teamDirectory.get(match.homeTeamId);
  const awaySnapshot = teamDirectory.get(match.awayTeamId);

  const events = await prisma.matchEvent.findMany({
    where: { matchResultId: result.id },
    orderBy: { eventIndex: 'asc' },
    select: {
      eventType: true,
      period: true,
      remainingSeconds: true,
      teamId: true,
      eventJson: true,
    },
  });

  const [playerStats, teamStats] = await Promise.all([
    prisma.playerGameStat.findMany({ where: { matchResultId: result.id }, orderBy: { points: 'desc' } }),
    prisma.teamGameStat.findMany({ where: { matchResultId: result.id }, orderBy: { side: 'asc' } }),
  ]);

  const diagnostics = result.diagnosticsText ? (JSON.parse(result.diagnosticsText) as Record<string, unknown>) : null;
  const reconciliation = result.reconciliationJson ? JSON.parse(result.reconciliationJson) : null;

  const homeTeamStat = teamStats.find((row) => row.side === 'HOME') ?? teamStats.find((row) => row.teamId === match.homeTeamId);
  const awayTeamStat = teamStats.find((row) => row.side === 'AWAY') ?? teamStats.find((row) => row.teamId === match.awayTeamId);

  const mapTeamStat = (row: (typeof teamStats)[number] | undefined) => {
    if (!row) return null;
    const stats = JSON.parse(row.statsJson) as Record<string, number>;
    return {
      teamId: row.teamId,
      teamName: teamDirectory.get(row.teamId)?.teamName ?? null,
      side: row.side,
      goals: row.goals,
      shotsOnGoal: row.shotsOnGoal,
      shotAttempts: stats.shotAttempts ?? null,
      blockedAttempts: stats.blockedShotsAgainst ?? null,
      missedAttempts: stats.missedShots ?? null,
      saves: stats.saves ?? null,
      shootingPercentage: stats.shootingPercentage ?? pct(row.goals, row.shotsOnGoal),
      faceoffWins: stats.faceoffWins ?? null,
      possessionSeconds: stats.possessionSeconds ?? null,
      offensiveZoneSeconds: stats.offensiveZoneSeconds ?? null,
      defensiveZoneSeconds: stats.defensiveZoneSeconds ?? null,
      penalties: row.penalties,
      penaltyMinutes: row.penaltyMinutes,
      powerPlayOpportunities: stats.powerPlayOpportunities ?? null,
      powerPlayGoals: row.powerPlayGoals,
      powerPlayPercentage: stats.powerPlayPercentage ?? null,
      penaltyKillOpportunities: stats.penaltyKillOpportunities ?? null,
      penaltyKills: stats.penaltyKills ?? null,
      penaltyKillPercentage: stats.penaltyKillPercentage ?? null,
      shortHandedGoals: row.shortHandedGoals,
      shootoutAttempts: row.shootoutAttempts,
      shootoutGoals: row.shootoutGoals,
      savePercentage: stats.saves != null && stats.shotsOnGoal != null
        ? pct(Number(stats.saves), Number(row.shotsOnGoal) || Number(stats.shotsOnGoal) || 0)
        : null,
      stats,
    };
  };

  const skaters = playerStats
    .filter((row) => row.position !== 'G')
    .map((row) => {
      const player = playerDirectory.get(row.playerId);
      const stats = JSON.parse(row.statsJson) as Record<string, unknown>;
      return {
        playerId: row.playerId,
        teamId: row.teamId,
        teamName: teamDirectory.get(row.teamId)?.teamName ?? null,
        firstName: player?.firstName ?? null,
        lastName: player?.lastName ?? null,
        position: row.position,
        lineupSlot: (stats.lineupSlot as string | undefined) ?? player?.lineupSlot ?? null,
        goals: row.goals,
        assists: row.assists,
        points: row.points,
        shotsOnGoal: row.shotsOnGoal,
        shotAttempts: typeof stats.shotAttempts === 'number' ? stats.shotAttempts : null,
        blockedAttempts: typeof stats.blockedAttempts === 'number' ? stats.blockedAttempts : null,
        missedAttempts: typeof stats.missedAttempts === 'number' ? stats.missedAttempts : null,
        blocks: typeof stats.blocks === 'number' ? stats.blocks : null,
        penaltyMinutes: row.penaltyMinutes,
        powerPlayGoals: row.powerPlayGoals,
        shortHandedGoals: row.shortHandedGoals,
        shootoutAttempts: row.shootoutAttempts,
        shootoutGoals: row.shootoutGoals,
        timeOnIceSeconds: typeof stats.timeOnIceSeconds === 'number' ? stats.timeOnIceSeconds : null,
        stats,
      };
    });

  const goalies = playerStats
    .filter((row) => {
      const stats = JSON.parse(row.statsJson) as Record<string, unknown>;
      return row.position === 'G' || stats.lineupSlot === 'G_STARTER' || stats.lineupSlot === 'G_BACKUP';
    })
    .map((row) => {
      const player = playerDirectory.get(row.playerId);
      const stats = JSON.parse(row.statsJson) as Record<string, number | string>;
      const shotsAgainst = typeof stats.shotsAgainst === 'number' ? stats.shotsAgainst : 0;
      const saves = typeof stats.saves === 'number' ? stats.saves : 0;
      const goalsAgainst = typeof stats.goalsAgainst === 'number' ? stats.goalsAgainst : 0;
      return {
        playerId: row.playerId,
        teamId: row.teamId,
        teamName: teamDirectory.get(row.teamId)?.teamName ?? null,
        firstName: player?.firstName ?? null,
        lastName: player?.lastName ?? null,
        lineupSlot: typeof stats.lineupSlot === 'string' ? stats.lineupSlot : player?.lineupSlot ?? null,
        shotsAgainst,
        saves,
        goalsAgainst,
        savePercentage:
          typeof stats.savePercentage === 'number' ? stats.savePercentage : pct(saves, shotsAgainst),
        timeOnIceSeconds: typeof stats.timeOnIceSeconds === 'number' ? stats.timeOnIceSeconds : null,
        shootoutAttemptsFaced: row.shootoutAttempts,
        shootoutGoalsAllowed: row.shootoutGoals,
        didNotPlay: shotsAgainst === 0 && goalsAgainst === 0 && (typeof stats.timeOnIceSeconds !== 'number' || stats.timeOnIceSeconds === 0),
        stats,
      };
    });

  return {
    matchId: match.id,
    status: match.status,
    prepared: false as const,
    isCurrent,
    source: match.source,
    currentResultId: match.currentResultId,
    competitionEdition: match.competitionEdition
      ? {
          id: match.competitionEdition.id,
          displayName: match.competitionEdition.displayName,
          status: match.competitionEdition.status,
        }
      : null,
    homeTeam: {
      id: match.homeTeamId,
      name: homeSnapshot?.teamName ?? match.homeTeam.name,
      currentName: match.homeTeam.name,
      side: 'HOME' as const,
    },
    awayTeam: {
      id: match.awayTeamId,
      name: awaySnapshot?.teamName ?? match.awayTeam.name,
      currentName: match.awayTeam.name,
      side: 'AWAY' as const,
    },
    result: {
      resultId: result.id,
      attemptNumber: result.attemptNumber,
      status: result.status,
      decisionType: result.decisionType,
      score: {
        home: result.homeScore,
        away: result.awayScore,
        homeRegulation: result.homeRegulationScore,
        awayRegulation: result.awayRegulationScore,
        homeOvertime: result.homeOvertimeScore,
        awayOvertime: result.awayOvertimeScore,
        homeShootout: result.homeShootoutScore,
        awayShootout: result.awayShootoutScore,
      },
      winnerTeamId: result.winnerTeamId,
      completedAt: result.completedAt?.toISOString() ?? null,
      supersededAt: result.supersededAt?.toISOString() ?? null,
      periodScores: derivePeriodScores(events, match.homeTeamId, match.awayTeamId),
      scoringSummary: buildScoringSummary(events, match.homeTeamId, match.awayTeamId, playerDirectory, teamDirectory),
      shootoutSummary: buildShootoutSummary(events, playerDirectory, teamDirectory),
      teamComparison: {
        home: mapTeamStat(homeTeamStat),
        away: mapTeamStat(awayTeamStat),
      },
      skaters,
      goalies,
      lineUsage: buildLineUsage(input, diagnostics),
      metadata: {
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
        reconciliationStatus: result.reconciliationStatus,
        reconciliationOk: Boolean(reconciliation?.ok),
      },
    },
  };
}

export async function getMatchResultForView(matchId: string, resultId?: string | null) {
  const overview = await getMatchOverview(matchId, resultId);
  if (!overview) return null;
  if (overview.prepared || !overview.result) {
    throw new MatchHttpError(404, 'MatchResultNotFound', 'Match has no completed result yet');
  }
  return overview;
}
