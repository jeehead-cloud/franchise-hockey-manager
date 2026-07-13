import type {
  FinalMatchResult,
  SimulationInput,
  SimulationResult,
  TeamStats,
} from '../match/types.js';
import type {
  LabGameSummary,
  LabPlayerContribution,
  LabTeamSideStats,
  LabUnitContribution,
  LabWinner,
} from './types.js';
import { DEFAULT_LAB_ANOMALY_GUARDRAILS } from './types.js';

type CompleteOutput = SimulationResult & { finalResult: FinalMatchResult };

function mapTeamStats(stats: TeamStats): LabTeamSideStats {
  return {
    goals: stats.goals,
    shotAttempts: stats.shotAttempts,
    shotsOnGoal: stats.shotsOnGoal,
    saves: stats.saves,
    shootingPercentage: stats.shootingPercentage,
    faceoffWins: stats.faceoffWins,
    possessionSeconds: stats.possessionSeconds,
    offensiveZoneSeconds: stats.offensiveZoneSeconds,
    defensiveZoneSeconds: stats.defensiveZoneSeconds,
    penalties: stats.penalties,
    penaltyMinutes: stats.penaltyMinutes,
    powerPlayOpportunities: stats.powerPlayOpportunities,
    powerPlayGoals: stats.powerPlayGoals,
    powerPlayPercentage: stats.powerPlayPercentage,
    penaltyKillOpportunities: stats.penaltyKillOpportunities,
    penaltyKills: stats.penaltyKills,
    penaltyKillPercentage: stats.penaltyKillPercentage,
    shortHandedGoals: stats.shortHandedGoals,
    shootoutAttempts: stats.shootoutAttempts,
    shootoutGoals: stats.shootoutGoals,
  };
}

function computePreMatchStrengthFromTeams(
  teamA: SimulationInput['homeTeam'],
  teamB: SimulationInput['homeTeam'],
): { gap: number; stronger: 'TEAM_A' | 'TEAM_B' | 'EVEN' } {
  const strength = (team: SimulationInput['homeTeam']) => {
    const units = [...team.forwardLines, ...team.defensePairs];
    const unitAvg =
      units.length === 0
        ? 0
        : units.reduce((sum, u) => sum + u.effectivePerformance, 0) / units.length;
    return unitAvg * 0.85 + team.starterGoalie.effectivePerformance * 0.15;
  };
  const a = strength(teamA);
  const b = strength(teamB);
  const gap = Math.abs(a - b);
  const threshold = DEFAULT_LAB_ANOMALY_GUARDRAILS.evenStrengthGapThreshold;
  const stronger = gap < threshold ? 'EVEN' : a >= b ? 'TEAM_A' : 'TEAM_B';
  return { gap, stronger };
}

export function toLabGameSummary(opts: {
  gameIndex: number;
  seed: string;
  teamAWasHome: boolean;
  teamAId: string;
  teamBId: string;
  inputForStrength: SimulationInput;
  result: CompleteOutput;
}): LabGameSummary {
  const { result, teamAWasHome, teamAId, teamBId } = opts;
  const fr = result.finalResult;
  const homeIsA = teamAWasHome;
  const teamAStats = mapTeamStats(homeIsA ? result.statistics.home : result.statistics.away);
  const teamBStats = mapTeamStats(homeIsA ? result.statistics.away : result.statistics.home);
  const teamAScore = homeIsA ? fr.displayScore.home : fr.displayScore.away;
  const teamBScore = homeIsA ? fr.displayScore.away : fr.displayScore.home;
  const teamARegulation = homeIsA ? fr.regulationScore.home : fr.regulationScore.away;
  const teamBRegulation = homeIsA ? fr.regulationScore.away : fr.regulationScore.home;

  const winnerTeamId =
    fr.winnerSide === 'HOME'
      ? opts.inputForStrength.homeTeam.teamId
      : fr.winnerSide === 'AWAY'
        ? opts.inputForStrength.awayTeam.teamId
        : null;

  let winner: LabWinner = 'TIE';
  if (winnerTeamId === teamAId) winner = 'TEAM_A';
  else if (winnerTeamId === teamBId) winner = 'TEAM_B';
  else if (fr.decisionType === 'TIE') winner = 'TIE';
  else if (teamAScore > teamBScore) winner = 'TEAM_A';
  else if (teamBScore > teamAScore) winner = 'TEAM_B';

  const teamASnap = teamAWasHome ? opts.inputForStrength.homeTeam : opts.inputForStrength.awayTeam;
  const teamBSnap = teamAWasHome ? opts.inputForStrength.awayTeam : opts.inputForStrength.homeTeam;
  const pre = computePreMatchStrengthFromTeams(teamASnap, teamBSnap);

  const isUpset =
    pre.stronger !== 'EVEN' &&
    ((pre.stronger === 'TEAM_A' && winner === 'TEAM_B') ||
      (pre.stronger === 'TEAM_B' && winner === 'TEAM_A'));

  return {
    gameIndex: opts.gameIndex,
    seed: opts.seed,
    teamAWasHome,
    winner,
    decisionType: fr.decisionType,
    teamAScore,
    teamBScore,
    teamARegulationScore: teamARegulation,
    teamBRegulationScore: teamBRegulation,
    overtimeOccurred:
      fr.decisionType === 'OVERTIME' || fr.overtimeScore.home + fr.overtimeScore.away > 0,
    shootoutOccurred: fr.decisionType === 'SHOOTOUT',
    teamAStats,
    teamBStats,
    playerContributions: buildPlayerContributions(result, teamAId),
    unitContributions: buildUnitContributions(opts.inputForStrength, result, teamAWasHome),
    traceHash: result.diagnostics.traceHash,
    reconciliationPassed: result.reconciliation.ok,
    preMatchStronger: pre.stronger,
    preMatchStrengthGap: pre.gap,
    isUpset,
  };
}

function buildPlayerContributions(result: CompleteOutput, teamAId: string): LabPlayerContribution[] {
  const sideFor = (teamId: string): 'TEAM_A' | 'TEAM_B' =>
    teamId === teamAId ? 'TEAM_A' : 'TEAM_B';

  const skaters = result.statistics.skaters.map((s) => ({
    playerId: s.playerId,
    teamSide: sideFor(s.teamId),
    firstName: '',
    lastName: '',
    position: s.primaryPosition,
    lineupSlot: s.lineupSlot,
    goals: s.goals,
    assists: s.assists,
    points: s.points,
    shotsOnGoal: s.shotsOnGoal,
    shotAttempts: s.shotAttempts,
    penaltyMinutes: s.penaltyMinutes,
    powerPlayGoals: s.powerPlayGoals,
    shortHandedGoals: s.shortHandedGoals,
    shotsAgainst: 0,
    saves: 0,
    goalsAgainst: 0,
    isGoalie: false,
  }));

  const goalies = result.statistics.goalies.map((g) => ({
    playerId: g.playerId,
    teamSide: sideFor(g.teamId),
    firstName: '',
    lastName: '',
    position: 'G',
    lineupSlot: g.lineupSlot,
    goals: 0,
    assists: 0,
    points: 0,
    shotsOnGoal: 0,
    shotAttempts: 0,
    penaltyMinutes: 0,
    powerPlayGoals: 0,
    shortHandedGoals: 0,
    shotsAgainst: g.shotsAgainst,
    saves: g.saves,
    goalsAgainst: g.goalsAgainst,
    isGoalie: true,
  }));

  return [...skaters, ...goalies].sort((a, b) => a.playerId.localeCompare(b.playerId));
}

function buildUnitContributions(
  input: SimulationInput,
  result: CompleteOutput,
  teamAWasHome: boolean,
): LabUnitContribution[] {
  const shifts = result.diagnostics.shiftsByTeamLine ?? {};
  const mapTeam = (team: SimulationInput['homeTeam'], side: 'TEAM_A' | 'TEAM_B') =>
    [...team.forwardLines, ...team.defensePairs].map((u) => ({
      unitKey: u.unitKey,
      teamSide: side,
      playerIds: [...u.playerIds],
      shiftCount: shifts[`${team.teamId}:${u.unitKey}`] ?? shifts[u.unitKey] ?? 0,
      goalsFor: 0,
      goalsAgainst: 0,
      effectivePerformance: u.effectivePerformance,
    }));

  const homeSide: 'TEAM_A' | 'TEAM_B' = teamAWasHome ? 'TEAM_A' : 'TEAM_B';
  const awaySide: 'TEAM_A' | 'TEAM_B' = teamAWasHome ? 'TEAM_B' : 'TEAM_A';
  return [...mapTeam(input.homeTeam, homeSide), ...mapTeam(input.awayTeam, awaySide)].sort((a, b) =>
    `${a.teamSide}:${a.unitKey}`.localeCompare(`${b.teamSide}:${b.unitKey}`),
  );
}

export function enrichPlayerNames(
  contributions: LabPlayerContribution[],
  input: SimulationInput,
): LabPlayerContribution[] {
  const directory = new Map<string, { firstName: string; lastName: string }>();
  for (const team of [input.homeTeam, input.awayTeam]) {
    for (const p of team.players) {
      directory.set(p.playerId, { firstName: p.firstName, lastName: p.lastName });
    }
  }
  return contributions.map((c) => {
    const d = directory.get(c.playerId);
    return d ? { ...c, firstName: d.firstName, lastName: d.lastName } : c;
  });
}
