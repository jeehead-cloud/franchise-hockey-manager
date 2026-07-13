import type {
  AggregatedGameSummary,
  AggregatedPlayerSeasonStat,
  AggregatedRosterPlayer,
  AggregatedSeasonConfig,
  AggregatedTeamSeasonStat,
  AggregatedTeamStrengthSnapshot,
} from './types.js';

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

function emptyTeamStat(s: AggregatedTeamStrengthSnapshot): AggregatedTeamSeasonStat {
  return {
    competitionParticipantId: s.competitionParticipantId,
    teamId: s.teamId,
    teamNameSnapshot: s.teamNameSnapshot,
    gamesPlayed: 0,
    wins: 0,
    losses: 0,
    overtimeLosses: 0,
    goals: 0,
    goalsAgainst: 0,
    shots: 0,
    shootingPercentage: 0,
    saves: 0,
    savePercentage: 0,
    powerPlayOpportunities: 0,
    powerPlayGoals: 0,
    powerPlayPercentage: 0,
    penaltyKillOpportunities: 0,
    penaltyKills: 0,
    penaltyKillPercentage: 0,
    penalties: 0,
    penaltyMinutes: 0,
    possessionEstimate: 0,
  };
}

export function accumulateTeamStats(
  strengths: AggregatedTeamStrengthSnapshot[],
  games: AggregatedGameSummary[],
): AggregatedTeamSeasonStat[] {
  const map = new Map(strengths.map((s) => [s.competitionParticipantId, emptyTeamStat(s)]));
  for (const g of games) {
    const home = map.get(g.homeCompetitionParticipantId)!;
    const away = map.get(g.awayCompetitionParticipantId)!;
    home.gamesPlayed += 1;
    away.gamesPlayed += 1;
    home.goals += g.homeScore;
    home.goalsAgainst += g.awayScore;
    away.goals += g.awayScore;
    away.goalsAgainst += g.homeScore;
    home.shots += g.homeShots;
    away.shots += g.awayShots;
    home.saves += g.homeSaves;
    away.saves += g.awaySaves;
    home.penalties += g.homePenalties;
    away.penalties += g.awayPenalties;
    home.penaltyMinutes += g.homePim;
    away.penaltyMinutes += g.awayPim;
    home.powerPlayOpportunities += g.homePpOpportunities;
    away.powerPlayOpportunities += g.awayPpOpportunities;
    home.powerPlayGoals += g.homePpGoals;
    away.powerPlayGoals += g.awayPpGoals;
    home.penaltyKillOpportunities += g.awayPpOpportunities;
    away.penaltyKillOpportunities += g.homePpOpportunities;
    home.penaltyKills += Math.max(0, g.awayPpOpportunities - g.awayPpGoals);
    away.penaltyKills += Math.max(0, g.homePpOpportunities - g.homePpGoals);
    home.possessionEstimate += g.homePossessionEstimate;
    away.possessionEstimate += g.awayPossessionEstimate;

    if (g.winnerParticipantId === home.competitionParticipantId) home.wins += 1;
    else if (g.winnerParticipantId === away.competitionParticipantId) away.wins += 1;

    if (g.decisionType === 'OVERTIME' || g.decisionType === 'SHOOTOUT') {
      if (g.winnerParticipantId === home.competitionParticipantId) away.overtimeLosses += 1;
      if (g.winnerParticipantId === away.competitionParticipantId) home.overtimeLosses += 1;
    } else if (g.winnerParticipantId) {
      if (g.winnerParticipantId === home.competitionParticipantId) away.losses += 1;
      if (g.winnerParticipantId === away.competitionParticipantId) home.losses += 1;
    }
  }

  return [...map.values()]
    .map((t) => ({
      ...t,
      shootingPercentage: t.shots > 0 ? t.goals / t.shots : 0,
      savePercentage: t.saves + t.goalsAgainst > 0 ? t.saves / (t.saves + t.goalsAgainst) : 0,
      powerPlayPercentage:
        t.powerPlayOpportunities > 0 ? t.powerPlayGoals / t.powerPlayOpportunities : 0,
      penaltyKillPercentage:
        t.penaltyKillOpportunities > 0 ? t.penaltyKills / t.penaltyKillOpportunities : 0,
      possessionEstimate: t.gamesPlayed > 0 ? t.possessionEstimate / t.gamesPlayed : 0.5,
    }))
    .sort((a, b) => a.competitionParticipantId.localeCompare(b.competitionParticipantId));
}

/**
 * Deterministically allocate team season totals across roster players.
 * Goals and goalie SA/SV/GA reconcile exactly with team totals.
 */
export function allocatePlayerStats(input: {
  strengths: AggregatedTeamStrengthSnapshot[];
  teamStats: AggregatedTeamSeasonStat[];
  rosters: Map<string, AggregatedRosterPlayer[]>;
  config: AggregatedSeasonConfig;
}): AggregatedPlayerSeasonStat[] {
  const out: AggregatedPlayerSeasonStat[] = [];
  const { topLineShare, secondaryScoringShare, depthShare, goalieStartShare } =
    input.config.statAllocation;

  for (const team of input.teamStats) {
    const roster = [...(input.rosters.get(team.competitionParticipantId) ?? [])].sort((a, b) =>
      a.playerId.localeCompare(b.playerId),
    );
    const skaters = roster.filter((p) => !p.isGoalie);
    const goalies = roster.filter((p) => p.isGoalie);
    const sortedSkaters = [...skaters].sort((a, b) => b.ability - a.ability || a.playerId.localeCompare(b.playerId));

    const top = sortedSkaters.slice(0, 6);
    const mid = sortedSkaters.slice(6, 12);
    const depth = sortedSkaters.slice(12);

    const weightFor = (p: AggregatedRosterPlayer): number => {
      if (top.some((x) => x.playerId === p.playerId)) return topLineShare * (p.ability / 20);
      if (mid.some((x) => x.playerId === p.playerId)) return secondaryScoringShare * (p.ability / 20);
      return depthShare * (p.ability / 20);
    };

    const weights = skaters.map((p) => Math.max(0.01, weightFor(p)));
    const weightSum = weights.reduce((a, b) => a + b, 0);

    const goalShares = skaters.map((_, i) => (weights[i]! / weightSum) * team.goals);
    const goalsInt = allocateIntegers(goalShares, team.goals);
    const assistTarget = Math.round(team.goals * 1.55);
    const assistShares = skaters.map((p, i) => (weights[i]! / weightSum) * assistTarget * (0.7 + (p.offense / 40)));
    const assistsInt = allocateIntegers(assistShares, assistTarget);
    const shotShares = skaters.map((_, i) => (weights[i]! / weightSum) * team.shots);
    const shotsInt = allocateIntegers(shotShares, team.shots);
    const pimShares = skaters.map((p) => (1 / Math.max(1, p.ability)) * team.penaltyMinutes);
    const pimInt = allocateIntegers(pimShares, team.penaltyMinutes);
    const ppShares = skaters.map((_, i) => (weights[i]! / weightSum) * team.powerPlayGoals);
    const ppInt = allocateIntegers(ppShares, team.powerPlayGoals);

    for (let i = 0; i < skaters.length; i += 1) {
      const p = skaters[i]!;
      const goals = goalsInt[i]!;
      const assists = assistsInt[i]!;
      out.push({
        playerId: p.playerId,
        teamId: team.teamId,
        competitionParticipantId: team.competitionParticipantId,
        playerNameSnapshot: `${p.firstName} ${p.lastName}`.trim(),
        teamNameSnapshot: team.teamNameSnapshot,
        positionSnapshot: p.position,
        isGoalie: false,
        gamesPlayed: team.gamesPlayed,
        goals,
        assists,
        points: goals + assists,
        shots: shotsInt[i]!,
        penaltyMinutes: pimInt[i]!,
        powerPlayGoals: Math.min(ppInt[i]!, goals),
        shortHandedGoals: 0,
        goalieWins: 0,
        goalieLosses: 0,
        overtimeLosses: 0,
        shotsAgainst: 0,
        saves: 0,
        goalsAgainst: 0,
        savePercentage: null,
        shutouts: 0,
      });
    }

    // Goalies — allocate exact team SA/GA/W/L/OTL totals
    const sortedGoalies = [...goalies].sort(
      (a, b) => b.ability - a.ability || a.playerId.localeCompare(b.playerId),
    );
    const starter = sortedGoalies[0]!;
    const backup = sortedGoalies[1] ?? null;
    const shotsAgainstTeam = team.saves + team.goalsAgainst;

    let starterGames = team.gamesPlayed;
    let backupGames = 0;
    let starterSa = shotsAgainstTeam;
    let backupSa = 0;
    let starterGa = team.goalsAgainst;
    let backupGa = 0;
    let starterWins = team.wins;
    let backupWins = 0;
    let starterLosses = team.losses;
    let backupLosses = 0;
    let starterOtl = team.overtimeLosses;
    let backupOtl = 0;

    if (backup && team.gamesPlayed > 1) {
      starterGames = Math.min(
        team.gamesPlayed - 1,
        Math.max(1, Math.round(team.gamesPlayed * goalieStartShare)),
      );
      backupGames = team.gamesPlayed - starterGames;
      const share = starterGames / team.gamesPlayed;
      starterSa = Math.round(shotsAgainstTeam * share);
      backupSa = shotsAgainstTeam - starterSa;
      starterGa = Math.min(starterSa, Math.round(team.goalsAgainst * share));
      backupGa = team.goalsAgainst - starterGa;
      if (backupGa > backupSa) {
        const overflow = backupGa - backupSa;
        backupGa = backupSa;
        starterGa = Math.min(starterSa, starterGa + overflow);
      }
      starterWins = Math.round(team.wins * share);
      backupWins = team.wins - starterWins;
      starterLosses = Math.round(team.losses * share);
      backupLosses = team.losses - starterLosses;
      starterOtl = Math.round(team.overtimeLosses * share);
      backupOtl = team.overtimeLosses - starterOtl;
    }

    const pushGoalie = (
      p: AggregatedRosterPlayer,
      gp: number,
      sa: number,
      ga: number,
      wins: number,
      losses: number,
      otl: number,
    ) => {
      const safeGa = Math.min(Math.max(0, ga), Math.max(0, sa));
      const saves = Math.max(0, sa - safeGa);
      out.push({
        playerId: p.playerId,
        teamId: team.teamId,
        competitionParticipantId: team.competitionParticipantId,
        playerNameSnapshot: `${p.firstName} ${p.lastName}`.trim(),
        teamNameSnapshot: team.teamNameSnapshot,
        positionSnapshot: p.position,
        isGoalie: true,
        gamesPlayed: gp,
        goals: 0,
        assists: 0,
        points: 0,
        shots: 0,
        penaltyMinutes: 0,
        powerPlayGoals: 0,
        shortHandedGoals: 0,
        goalieWins: wins,
        goalieLosses: losses,
        overtimeLosses: otl,
        shotsAgainst: sa,
        saves,
        goalsAgainst: safeGa,
        savePercentage: sa > 0 ? saves / sa : null,
        shutouts: safeGa === 0 && gp > 0 ? Math.max(0, Math.floor(gp / 10)) : 0,
      });
    };

    pushGoalie(starter, starterGames, starterSa, starterGa, starterWins, starterLosses, starterOtl);
    if (backup && backupGames > 0) {
      pushGoalie(backup, backupGames, backupSa, backupGa, backupWins, backupLosses, backupOtl);
    }

    // Exact goalie reconcile against team totals (rounding safety)
    const teamGoalies = out.filter(
      (p) => p.competitionParticipantId === team.competitionParticipantId && p.isGoalie,
    );
    const gaSum = teamGoalies.reduce((a, p) => a + p.goalsAgainst, 0);
    const saSum = teamGoalies.reduce((a, p) => a + p.shotsAgainst, 0);
    const primary = teamGoalies[0]!;
    if (gaSum !== team.goalsAgainst) {
      primary.goalsAgainst = Math.max(0, primary.goalsAgainst + (team.goalsAgainst - gaSum));
    }
    if (saSum !== shotsAgainstTeam) {
      primary.shotsAgainst = Math.max(0, primary.shotsAgainst + (shotsAgainstTeam - saSum));
    }
    primary.goalsAgainst = Math.min(primary.goalsAgainst, primary.shotsAgainst);
    primary.saves = Math.max(0, primary.shotsAgainst - primary.goalsAgainst);
    primary.savePercentage =
      primary.shotsAgainst > 0 ? primary.saves / primary.shotsAgainst : null;
    if (teamGoalies[1]) {
      const secondary = teamGoalies[1];
      secondary.goalsAgainst = Math.min(secondary.goalsAgainst, secondary.shotsAgainst);
      secondary.saves = Math.max(0, secondary.shotsAgainst - secondary.goalsAgainst);
      secondary.savePercentage =
        secondary.shotsAgainst > 0 ? secondary.saves / secondary.shotsAgainst : null;
      // Re-check primary after secondary bounds
      const ga2 = teamGoalies.reduce((a, p) => a + p.goalsAgainst, 0);
      if (ga2 !== team.goalsAgainst) {
        primary.goalsAgainst = Math.max(
          0,
          Math.min(primary.shotsAgainst, primary.goalsAgainst + (team.goalsAgainst - ga2)),
        );
        primary.saves = Math.max(0, primary.shotsAgainst - primary.goalsAgainst);
        primary.savePercentage =
          primary.shotsAgainst > 0 ? primary.saves / primary.shotsAgainst : null;
      }
    }
  }

  return out.sort((a, b) => {
    const t = a.competitionParticipantId.localeCompare(b.competitionParticipantId);
    if (t !== 0) return t;
    if (a.isGoalie !== b.isGoalie) return a.isGoalie ? 1 : -1;
    return a.playerId.localeCompare(b.playerId);
  });
}

/** Largest-remainder method for exact integer allocation. */
function allocateIntegers(shares: number[], total: number): number[] {
  if (shares.length === 0) return [];
  const floors = shares.map((s) => Math.floor(s));
  let remaining = total - floors.reduce((a, b) => a + b, 0);
  const frac = shares
    .map((s, i) => ({ i, f: s - Math.floor(s) }))
    .sort((a, b) => b.f - a.f || a.i - b.i);
  const out = [...floors];
  let idx = 0;
  while (remaining > 0 && frac.length > 0) {
    out[frac[idx % frac.length]!.i]! += 1;
    remaining -= 1;
    idx += 1;
  }
  while (remaining < 0) {
    // pull from largest floors
    const order = out
      .map((v, i) => ({ i, v }))
      .sort((a, b) => b.v - a.v || a.i - b.i);
    for (const o of order) {
      if (remaining >= 0) break;
      if (out[o.i]! > 0) {
        out[o.i]! -= 1;
        remaining += 1;
      }
    }
    if (order.every((o) => out[o.i] === 0) && remaining < 0) break;
  }
  return out.map((v) => clamp(v, 0, total));
}
