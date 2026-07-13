import type {
  MatchPlayerStatSummary,
  MatchTeamStatSummary,
  PlayerSeasonStatRow,
  StandingParticipant,
  TeamSeasonStatRow,
} from './types.js';

export function aggregateTeamSeasonStats(input: {
  participants: StandingParticipant[];
  /** Per completed match, two team rows. */
  teamGameStats: MatchTeamStatSummary[];
}): TeamSeasonStatRow[] {
  const byTeam = new Map<string, TeamSeasonStatRow & { participantId: string }>();
  for (const p of input.participants) {
    byTeam.set(p.teamId, {
      participantId: p.participantId,
      teamId: p.teamId,
      teamNameSnapshot: p.teamNameSnapshot,
      gamesPlayed: 0,
      goals: 0,
      goalsAgainst: 0,
      shotsOnGoal: 0,
      shotAttempts: 0,
      penalties: 0,
      penaltyMinutes: 0,
      powerPlayGoals: 0,
      powerPlayOpportunities: 0,
      shortHandedGoals: 0,
      shootoutAttempts: 0,
      shootoutGoals: 0,
      shootingPercentage: null,
      powerPlayPercentage: null,
      penaltyKillPercentage: null,
    });
  }

  // Pair goals against from opposing team in same match — caller should pass goalsAgainst on each row
  for (const s of input.teamGameStats) {
    const row = byTeam.get(s.teamId);
    if (!row) continue;
    row.gamesPlayed += 1;
    row.goals += s.goals;
    row.shotsOnGoal += s.shotsOnGoal;
    row.shotAttempts += s.shotAttempts ?? s.shotsOnGoal;
    row.penalties += s.penalties;
    row.penaltyMinutes += s.penaltyMinutes;
    row.powerPlayGoals += s.powerPlayGoals;
    row.powerPlayOpportunities += s.powerPlayOpportunities ?? 0;
    row.shortHandedGoals += s.shortHandedGoals;
    row.shootoutAttempts += s.shootoutAttempts;
    row.shootoutGoals += s.shootoutGoals;
  }

  // Second pass for goalsAgainst if provided via extras
  for (const s of input.teamGameStats) {
    const row = byTeam.get(s.teamId);
    if (!row) continue;
    if (typeof s.extras?.goalsAgainst === 'number') {
      row.goalsAgainst += s.extras.goalsAgainst as number;
    }
  }

  return [...byTeam.values()]
    .map((row) => ({
      ...row,
      shootingPercentage:
        row.shotAttempts > 0 ? row.goals / row.shotAttempts : row.shotsOnGoal > 0 ? row.goals / row.shotsOnGoal : null,
      powerPlayPercentage:
        row.powerPlayOpportunities > 0 ? row.powerPlayGoals / row.powerPlayOpportunities : null,
      penaltyKillPercentage: null,
    }))
    .sort((a, b) => a.teamNameSnapshot.localeCompare(b.teamNameSnapshot));
}

export function aggregatePlayerSeasonStats(input: {
  playerGameStats: MatchPlayerStatSummary[];
  teamNameById: Record<string, string>;
}): PlayerSeasonStatRow[] {
  const byPlayer = new Map<string, PlayerSeasonStatRow>();

  for (const s of input.playerGameStats) {
    const isGoalie = s.position === 'G';
    let row = byPlayer.get(s.playerId);
    if (!row) {
      row = {
        playerId: s.playerId,
        teamId: s.teamId,
        teamNameSnapshot: input.teamNameById[s.teamId] ?? s.teamId,
        firstNameSnapshot: s.firstName ?? '',
        lastNameSnapshot: s.lastName ?? '',
        position: s.position,
        isGoalie,
        gamesPlayed: 0,
        goals: 0,
        assists: 0,
        points: 0,
        shotsOnGoal: 0,
        penaltyMinutes: 0,
        powerPlayGoals: 0,
        shortHandedGoals: 0,
        shootoutAttempts: 0,
        shootoutGoals: 0,
        wins: 0,
        losses: 0,
        shotsAgainst: 0,
        saves: 0,
        goalsAgainst: 0,
        shutouts: 0,
        savePercentage: null,
        shootingPercentage: null,
      };
      byPlayer.set(s.playerId, row);
    }
    row.gamesPlayed += 1;
    row.goals += s.goals;
    row.assists += s.assists;
    row.points += s.points;
    row.shotsOnGoal += s.shotsOnGoal;
    row.penaltyMinutes += s.penaltyMinutes;
    row.powerPlayGoals += s.powerPlayGoals;
    row.shortHandedGoals += s.shortHandedGoals;
    row.shootoutAttempts += s.shootoutAttempts;
    row.shootoutGoals += s.shootoutGoals;
    if (isGoalie) {
      row.shotsAgainst += s.shotsAgainst ?? 0;
      row.saves += s.saves ?? 0;
      row.goalsAgainst += s.goalsAgainst ?? 0;
      if (s.isShutout) row.shutouts += 1;
      if (s.isWin) row.wins += 1;
      if (s.isLoss) row.losses += 1;
    }
  }

  return [...byPlayer.values()]
    .map((row) => ({
      ...row,
      shootingPercentage: row.shotsOnGoal > 0 ? row.goals / row.shotsOnGoal : null,
      savePercentage:
        row.shotsAgainst > 0 ? row.saves / row.shotsAgainst : null,
    }))
    .sort((a, b) => b.points - a.points || a.lastNameSnapshot.localeCompare(b.lastNameSnapshot));
}
