import type {
  MatchEvent,
  MatchState,
  MatchStatistics,
  PeriodScore,
  PlayerGoalieStats,
  PlayerSkaterStats,
  SimulationInput,
  TeamStats,
} from './types.js';

function emptySkater(
  playerId: string,
  teamId: string,
  side: 'HOME' | 'AWAY',
  lineupSlot: string,
  primaryPosition: PlayerSkaterStats['primaryPosition'],
): PlayerSkaterStats {
  return {
    playerId,
    teamId,
    side,
    lineupSlot,
    primaryPosition,
    goals: 0,
    primaryAssists: 0,
    secondaryAssists: 0,
    assists: 0,
    points: 0,
    shots: 0,
    shotAttempts: 0,
    blockedAttempts: 0,
    missedAttempts: 0,
    shotsOnGoal: 0,
    blocks: 0,
    timeOnIceSeconds: 0,
    penaltyMinutes: 0,
    penaltiesTaken: 0,
    powerPlayGoals: 0,
    shortHandedGoals: 0,
  };
}

function emptyGoalie(
  playerId: string,
  teamId: string,
  side: 'HOME' | 'AWAY',
  lineupSlot: string,
): PlayerGoalieStats {
  return {
    playerId,
    teamId,
    side,
    lineupSlot,
    shotsAgainst: 0,
    saves: 0,
    goalsAgainst: 0,
    savePercentage: 0,
    timeOnIceSeconds: 0,
  };
}

function emptyTeam(teamId: string, side: 'HOME' | 'AWAY'): TeamStats {
  return {
    teamId,
    side,
    goals: 0,
    shotAttempts: 0,
    shotsOnGoal: 0,
    blockedShotsAgainst: 0,
    missedShots: 0,
    saves: 0,
    shootingPercentage: 0,
    faceoffWins: 0,
    possessionSeconds: 0,
    offensiveZoneSeconds: 0,
    defensiveZoneSeconds: 0,
    penalties: 0,
    penaltyMinutes: 0,
    powerPlayOpportunities: 0,
    powerPlayGoals: 0,
    powerPlayPercentage: 0,
    penaltyKillOpportunities: 0,
    penaltyKills: 0,
    penaltyKillPercentage: 0,
    shortHandedGoals: 0,
  };
}

function pct(numer: number, denom: number): number {
  if (!(denom > 0)) return 0;
  return numer / denom;
}

function accumulateToiFromShifts(
  input: SimulationInput,
  events: MatchEvent[],
  skaters: Map<string, PlayerSkaterStats>,
  goalies: Map<string, PlayerGoalieStats>,
): void {
  const periodDuration = input.rules.periodDurationSeconds;
  type OpenShift = {
    startElapsed: number;
    period: number;
    playerIds: string[];
  };
  let open: OpenShift | null = null;

  const credit = (fromElapsed: number, toElapsed: number, period: number, playerIds: string[]) => {
    const seconds = Math.max(0, Math.min(periodDuration, toElapsed) - Math.min(periodDuration, fromElapsed));
    if (seconds <= 0) return;
    void period;
    for (const id of playerIds) {
      const sk = skaters.get(id);
      if (sk) sk.timeOnIceSeconds += seconds;
      const g = goalies.get(id);
      if (g) g.timeOnIceSeconds += seconds;
    }
  };

  for (const e of events) {
    if (e.type === 'SHIFT_START') {
      const lines = e.details.lines as
        | {
            homeForwardPlayerIds: string[];
            homeDefensePlayerIds: string[];
            awayForwardPlayerIds: string[];
            awayDefensePlayerIds: string[];
            homeGoalieId: string;
            awayGoalieId: string;
          }
        | undefined;
      const playerIds = lines
        ? [
            ...lines.homeForwardPlayerIds,
            ...lines.homeDefensePlayerIds,
            ...lines.awayForwardPlayerIds,
            ...lines.awayDefensePlayerIds,
            lines.homeGoalieId,
            lines.awayGoalieId,
          ]
        : e.playerIds;
      open = { startElapsed: e.elapsedSeconds, period: e.period, playerIds };
    } else if (e.type === 'SHIFT_END' && open) {
      credit(open.startElapsed, e.elapsedSeconds, open.period, open.playerIds);
      open = null;
    } else if (e.type === 'PERIOD_END' && open) {
      credit(open.startElapsed, e.elapsedSeconds, open.period, open.playerIds);
      open = null;
    }
  }
}

function computePenaltyKills(events: MatchEvent[], teamById: Map<string, TeamStats>): void {
  const penaltyEvents = events.filter((e) => e.type === 'PENALTY');
  const ppGoalSequences = new Set<number>();
  for (const g of events) {
    if (g.type !== 'GOAL') continue;
    if (g.details.goalStrength !== 'POWER_PLAY') continue;
    const seq = Number(g.details.activePenaltySequenceId);
    if (Number.isFinite(seq) && seq > 0) {
      ppGoalSequences.add(seq);
    }
  }

  for (const p of penaltyEvents) {
    const seq = Number(p.details.penaltySequenceId);
    if (!Number.isFinite(seq) || seq <= 0) continue;
    if (ppGoalSequences.has(seq)) continue;
    const penalizedTeamId = String(p.details.penalizedTeamId ?? p.teamId ?? '');
    const pkTeam = teamById.get(penalizedTeamId);
    if (pkTeam) pkTeam.penaltyKills += 1;
  }
}

/**
 * Pure statistics reducer — events are the source of truth.
 * Includes every lineup player (zeros allowed), ordered by team then lineup slot.
 */
export function reduceStatistics(
  input: SimulationInput,
  events: MatchEvent[],
  finalState: MatchState,
): MatchStatistics {
  const skaters = new Map<string, PlayerSkaterStats>();
  const goalies = new Map<string, PlayerGoalieStats>();
  const home = emptyTeam(input.homeTeam.teamId, 'HOME');
  const away = emptyTeam(input.awayTeam.teamId, 'AWAY');
  const teamById = new Map<string, TeamStats>([
    [home.teamId, home],
    [away.teamId, away],
  ]);

  const periodGoalCounts = new Map<number, { home: number; away: number }>();
  for (let p = 1; p <= input.rules.regulationPeriods; p += 1) {
    periodGoalCounts.set(p, { home: 0, away: 0 });
  }

  for (const team of [input.homeTeam, input.awayTeam]) {
    for (const assignment of team.lineupAssignments) {
      const player = team.players.find((p) => p.playerId === assignment.playerId);
      if (!player) continue;
      if (player.primaryPosition === 'G') {
        goalies.set(
          player.playerId,
          emptyGoalie(player.playerId, team.teamId, team.side, assignment.slot),
        );
      } else {
        skaters.set(
          player.playerId,
          emptySkater(player.playerId, team.teamId, team.side, assignment.slot, player.primaryPosition),
        );
      }
    }
  }

  let prevElapsed = 0;
  let prevPossession: MatchEvent['possession'] = 'NONE';
  let prevZone: MatchEvent['zone'] = null;
  let prevTeamId: string | null = null;

  for (const e of events) {
    const delta = Math.max(0, e.elapsedSeconds - prevElapsed);
    if (prevPossession === 'HOME') home.possessionSeconds += delta;
    else if (prevPossession === 'AWAY') away.possessionSeconds += delta;

    if (prevTeamId && prevZone === 'OFFENSIVE') {
      const t = teamById.get(prevTeamId);
      if (t) t.offensiveZoneSeconds += delta;
    } else if (prevTeamId && prevZone === 'DEFENSIVE') {
      const t = teamById.get(prevTeamId);
      if (t) t.defensiveZoneSeconds += delta;
    }

    prevElapsed = e.elapsedSeconds;
    prevPossession = e.possession;
    prevZone = e.zone;
    prevTeamId = e.teamId;

    if (e.type === 'FACEOFF' && e.teamId) {
      const t = teamById.get(e.teamId);
      if (t) t.faceoffWins += 1;
    }

    if (e.type === 'PENALTY') {
      const penalizedPlayerId = String(e.details.penalizedPlayerId ?? e.playerIds[0] ?? '');
      const penalizedTeamId = String(e.details.penalizedTeamId ?? e.teamId ?? '');
      const advantagedTeamId = String(e.details.advantagedTeamId ?? '');
      const sk = skaters.get(penalizedPlayerId);
      if (sk) {
        sk.penaltiesTaken += 1;
        sk.penaltyMinutes += 2;
      }
      const penalizedTeam = teamById.get(penalizedTeamId);
      if (penalizedTeam) {
        penalizedTeam.penalties += 1;
        penalizedTeam.penaltyMinutes += 2;
        penalizedTeam.penaltyKillOpportunities += 1;
      }
      const advantagedTeam = teamById.get(advantagedTeamId);
      if (advantagedTeam) advantagedTeam.powerPlayOpportunities += 1;
    }

    if (e.type === 'SHOT') {
      const shooterId = String(e.details.shooterId ?? e.playerIds[0] ?? '');
      const shootingTeamId = String(e.details.shootingTeamId ?? e.teamId ?? '');
      const sk = skaters.get(shooterId);
      if (sk) {
        sk.shotAttempts += 1;
        sk.shots += 1;
      }
      const team = teamById.get(shootingTeamId);
      if (team) team.shotAttempts += 1;
    }

    if (e.type === 'SHOT_BLOCKED') {
      const shooterId = String(e.details.shooterId ?? '');
      const blockerId = String(e.details.blockerId ?? '');
      const attackingTeamId = String(e.details.attackingTeamId ?? '');
      const sk = skaters.get(shooterId);
      if (sk) sk.blockedAttempts += 1;
      const blocker = skaters.get(blockerId);
      if (blocker) blocker.blocks += 1;
      const defendingTeamId = String(e.details.defendingTeamId ?? '');
      const defending = teamById.get(defendingTeamId);
      if (defending) defending.blockedShotsAgainst += 1;
    }

    if (e.type === 'SHOT_MISSED') {
      const shooterId = String(e.details.shooterId ?? '');
      const attackingTeamId = String(e.details.attackingTeamId ?? e.teamId ?? '');
      const sk = skaters.get(shooterId);
      if (sk) sk.missedAttempts += 1;
      const team = teamById.get(attackingTeamId);
      if (team) team.missedShots += 1;
    }

    if (e.type === 'SAVE') {
      const shooterId = String(e.details.shooterId ?? '');
      const goalieId = String(e.details.goalieId ?? '');
      const sk = skaters.get(shooterId);
      if (sk) sk.shotsOnGoal += 1;
      const g = goalies.get(goalieId);
      if (g) {
        g.saves += 1;
        g.shotsAgainst += 1;
      }
      const shootingTeam =
        skaters.get(shooterId)?.teamId ??
        (e.possession === 'HOME' ? home.teamId : e.possession === 'AWAY' ? away.teamId : null);
      if (shootingTeam) {
        const t = teamById.get(shootingTeam);
        if (t) t.shotsOnGoal += 1;
      }
      const goalieTeam = goalies.get(goalieId)?.teamId;
      if (goalieTeam) {
        const t = teamById.get(goalieTeam);
        if (t) t.saves += 1;
      }
    }

    if (e.type === 'GOAL') {
      const scorerId = String(e.details.scorerId ?? e.playerIds[0] ?? '');
      const goalieId = String(e.details.goalieId ?? '');
      const scoringTeamId = String(e.details.scoringTeamId ?? e.teamId ?? '');
      const goalStrength = String(e.details.goalStrength ?? 'EVEN_STRENGTH');
      const primaryAssistId =
        e.details.primaryAssistId == null ? null : String(e.details.primaryAssistId);
      const secondaryAssistId =
        e.details.secondaryAssistId == null ? null : String(e.details.secondaryAssistId);

      const scorer = skaters.get(scorerId);
      if (scorer) {
        scorer.goals += 1;
        scorer.shotsOnGoal += 1;
        scorer.points += 1;
        if (goalStrength === 'POWER_PLAY') scorer.powerPlayGoals += 1;
        if (goalStrength === 'SHORT_HANDED') scorer.shortHandedGoals += 1;
      }
      if (primaryAssistId) {
        const a = skaters.get(primaryAssistId);
        if (a) {
          a.primaryAssists += 1;
          a.assists += 1;
          a.points += 1;
        }
      }
      if (secondaryAssistId) {
        const a = skaters.get(secondaryAssistId);
        if (a) {
          a.secondaryAssists += 1;
          a.assists += 1;
          a.points += 1;
        }
      }

      const g = goalies.get(goalieId);
      if (g) {
        g.goalsAgainst += 1;
        g.shotsAgainst += 1;
      }

      const scoring = teamById.get(scoringTeamId);
      if (scoring) {
        scoring.goals += 1;
        scoring.shotsOnGoal += 1;
        if (goalStrength === 'POWER_PLAY') scoring.powerPlayGoals += 1;
        if (goalStrength === 'SHORT_HANDED') scoring.shortHandedGoals += 1;
      }

      const bucket = periodGoalCounts.get(e.period) ?? { home: 0, away: 0 };
      if (scoringTeamId === home.teamId) bucket.home += 1;
      else if (scoringTeamId === away.teamId) bucket.away += 1;
      periodGoalCounts.set(e.period, bucket);
    }
  }

  accumulateToiFromShifts(input, events, skaters, goalies);
  computePenaltyKills(events, teamById);

  home.shootingPercentage = pct(home.goals, home.shotsOnGoal);
  away.shootingPercentage = pct(away.goals, away.shotsOnGoal);
  home.powerPlayPercentage = pct(home.powerPlayGoals, home.powerPlayOpportunities);
  away.powerPlayPercentage = pct(away.powerPlayGoals, away.powerPlayOpportunities);
  home.penaltyKillPercentage = pct(home.penaltyKills, home.penaltyKillOpportunities);
  away.penaltyKillPercentage = pct(away.penaltyKills, away.penaltyKillOpportunities);

  for (const g of goalies.values()) {
    g.savePercentage = pct(g.saves, g.shotsAgainst);
  }

  void finalState;

  const skaterList = [...skaters.values()].sort((a, b) => {
    if (a.side !== b.side) return a.side === 'HOME' ? -1 : 1;
    return a.lineupSlot.localeCompare(b.lineupSlot);
  });
  const goalieList = [...goalies.values()].sort((a, b) => {
    if (a.side !== b.side) return a.side === 'HOME' ? -1 : 1;
    return a.lineupSlot.localeCompare(b.lineupSlot);
  });

  const periodScores: PeriodScore[] = [...periodGoalCounts.entries()]
    .sort(([a], [b]) => a - b)
    .map(([period, scores]) => ({ period, home: scores.home, away: scores.away }));

  return {
    home,
    away,
    skaters: skaterList,
    goalies: goalieList,
    periodScores,
  };
}
