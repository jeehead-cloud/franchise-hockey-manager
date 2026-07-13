import {
  COMBINED_GOALS_HISTOGRAM_BUCKETS,
  DEFAULT_LAB_ANOMALY_GUARDRAILS,
  type LabAggregate,
  type LabExactScoreFrequency,
  type LabGameSummary,
  type LabHistogramBucket,
  type LabPlayerAggregate,
  type LabUnitAggregate,
} from './types.js';

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1]! + sorted[mid]!) / 2 : sorted[mid]!;
}

function rate(num: number, den: number): number {
  return den > 0 ? num / den : 0;
}

function emptyHistogram(): LabHistogramBucket[] {
  return COMBINED_GOALS_HISTOGRAM_BUCKETS.map((b) => ({ ...b, count: 0 }));
}

export function createEmptyAggregate(): LabAggregate {
  return {
    outcomes: {
      games: 0,
      teamAWins: 0,
      teamBWins: 0,
      ties: 0,
      teamAWinRate: 0,
      teamBWinRate: 0,
      homeWins: 0,
      homeWinRate: 0,
      teamAHomeGames: 0,
      teamBHomeGames: 0,
      regulationDecisions: 0,
      overtimeDecisions: 0,
      shootoutDecisions: 0,
      tieDecisions: 0,
    },
    scoring: {
      teamAAverageGoals: 0,
      teamBAverageGoals: 0,
      combinedAverageGoals: 0,
      medianCombinedGoals: 0,
      minCombinedGoals: 0,
      maxCombinedGoals: 0,
      averageScoreDifferential: 0,
      shutouts: 0,
      oneGoalGames: 0,
      highScoringGames: 0,
      combinedGoalsHistogram: emptyHistogram(),
      exactScoreFrequencies: [],
    },
    shooting: {
      teamAAverageShotsOnGoal: 0,
      teamBAverageShotsOnGoal: 0,
      teamAAverageShotAttempts: 0,
      teamBAverageShotAttempts: 0,
      teamAShootingPercentage: 0,
      teamBShootingPercentage: 0,
      teamASavePercentage: 0,
      teamBSavePercentage: 0,
    },
    specialTeams: {
      teamAPenaltiesPerGame: 0,
      teamBPenaltiesPerGame: 0,
      teamAPimPerGame: 0,
      teamBPimPerGame: 0,
      teamAPpOpportunitiesPerGame: 0,
      teamBPpOpportunitiesPerGame: 0,
      teamAPowerPlayPercentage: 0,
      teamBPowerPlayPercentage: 0,
      teamAPenaltyKillPercentage: 0,
      teamBPenaltyKillPercentage: 0,
      teamAShortHandedGoalsPerGame: 0,
      teamBShortHandedGoalsPerGame: 0,
    },
    possession: {
      teamAPossessionShare: 0,
      teamBPossessionShare: 0,
      teamAOffensiveZoneShare: 0,
      teamBOffensiveZoneShare: 0,
      teamAFaceoffShare: 0,
      teamBFaceoffShare: 0,
    },
    upsets: {
      expectedStronger: 'EVEN',
      averageStrengthGap: 0,
      evenGames: 0,
      upsetWins: 0,
      upsetRate: 0,
      upsetsByDecision: {},
    },
    players: [],
    units: [],
    failedGames: 0,
    reconciliationFailures: 0,
  };
}

interface MutableTotals {
  teamAGoals: number;
  teamBGoals: number;
  combined: number[];
  differentials: number[];
  teamASog: number;
  teamBSog: number;
  teamAAttempts: number;
  teamBAttempts: number;
  teamASaves: number;
  teamBSaves: number;
  teamASa: number;
  teamBSa: number;
  teamAPen: number;
  teamBPen: number;
  teamAPim: number;
  teamBPim: number;
  teamAPpOpp: number;
  teamBPpOpp: number;
  teamAPpGoals: number;
  teamBPpGoals: number;
  teamAPkOpp: number;
  teamBPkOpp: number;
  teamAPkKills: number;
  teamBPkKills: number;
  teamAShg: number;
  teamBShg: number;
  teamAPoss: number;
  teamBPoss: number;
  teamAOz: number;
  teamBOz: number;
  teamADz: number;
  teamBDz: number;
  teamAFo: number;
  teamBFo: number;
  strengthGapSum: number;
  scoreFreq: Map<string, LabExactScoreFrequency>;
  players: Map<string, LabPlayerAggregate>;
  units: Map<string, LabUnitAggregate & { epSum: number }>;
  strongerCounts: { TEAM_A: number; TEAM_B: number; EVEN: number };
}

function emptyTotals(): MutableTotals {
  return {
    teamAGoals: 0,
    teamBGoals: 0,
    combined: [],
    differentials: [],
    teamASog: 0,
    teamBSog: 0,
    teamAAttempts: 0,
    teamBAttempts: 0,
    teamASaves: 0,
    teamBSaves: 0,
    teamASa: 0,
    teamBSa: 0,
    teamAPen: 0,
    teamBPen: 0,
    teamAPim: 0,
    teamBPim: 0,
    teamAPpOpp: 0,
    teamBPpOpp: 0,
    teamAPpGoals: 0,
    teamBPpGoals: 0,
    teamAPkOpp: 0,
    teamBPkOpp: 0,
    teamAPkKills: 0,
    teamBPkKills: 0,
    teamAShg: 0,
    teamBShg: 0,
    teamAPoss: 0,
    teamBPoss: 0,
    teamAOz: 0,
    teamBOz: 0,
    teamADz: 0,
    teamBDz: 0,
    teamAFo: 0,
    teamBFo: 0,
    strengthGapSum: 0,
    scoreFreq: new Map(),
    players: new Map(),
    units: new Map(),
    strongerCounts: { TEAM_A: 0, TEAM_B: 0, EVEN: 0 },
  };
}

export function reduceGameSummaries(
  games: LabGameSummary[],
  opts?: { includePlayerAggregates?: boolean; includeLineAggregates?: boolean },
): LabAggregate {
  const includePlayers = opts?.includePlayerAggregates ?? true;
  const includeLines = opts?.includeLineAggregates ?? true;
  const agg = createEmptyAggregate();
  const totals = emptyTotals();
  const highThreshold = DEFAULT_LAB_ANOMALY_GUARDRAILS.highScoringCombinedGoals;

  for (const g of games) {
    if (!g.reconciliationPassed) {
      agg.reconciliationFailures += 1;
    }
    agg.outcomes.games += 1;
    if (g.winner === 'TEAM_A') agg.outcomes.teamAWins += 1;
    else if (g.winner === 'TEAM_B') agg.outcomes.teamBWins += 1;
    else agg.outcomes.ties += 1;

    if (g.teamAWasHome) {
      agg.outcomes.teamAHomeGames += 1;
      if (g.winner === 'TEAM_A') agg.outcomes.homeWins += 1;
    } else {
      agg.outcomes.teamBHomeGames += 1;
      if (g.winner === 'TEAM_B') agg.outcomes.homeWins += 1;
    }

    if (g.decisionType === 'REGULATION') agg.outcomes.regulationDecisions += 1;
    else if (g.decisionType === 'OVERTIME') agg.outcomes.overtimeDecisions += 1;
    else if (g.decisionType === 'SHOOTOUT') agg.outcomes.shootoutDecisions += 1;
    else agg.outcomes.tieDecisions += 1;

    totals.teamAGoals += g.teamAScore;
    totals.teamBGoals += g.teamBScore;
    const combined = g.teamAScore + g.teamBScore;
    totals.combined.push(combined);
    totals.differentials.push(Math.abs(g.teamAScore - g.teamBScore));
    if (g.teamAScore === 0 || g.teamBScore === 0) agg.scoring.shutouts += 1;
    if (Math.abs(g.teamAScore - g.teamBScore) === 1) agg.scoring.oneGoalGames += 1;
    if (combined >= highThreshold) agg.scoring.highScoringGames += 1;

    for (const bucket of agg.scoring.combinedGoalsHistogram) {
      if (combined >= bucket.min && (bucket.max == null || combined <= bucket.max)) {
        bucket.count += 1;
        break;
      }
    }

    const freqKey = `${g.teamAScore}-${g.teamBScore}`;
    const existing = totals.scoreFreq.get(freqKey);
    if (existing) existing.count += 1;
    else totals.scoreFreq.set(freqKey, { teamAScore: g.teamAScore, teamBScore: g.teamBScore, count: 1 });

    totals.teamASog += g.teamAStats.shotsOnGoal;
    totals.teamBSog += g.teamBStats.shotsOnGoal;
    totals.teamAAttempts += g.teamAStats.shotAttempts;
    totals.teamBAttempts += g.teamBStats.shotAttempts;
    totals.teamASaves += g.teamAStats.saves;
    totals.teamBSaves += g.teamBStats.saves;
    totals.teamASa += g.teamBStats.shotsOnGoal; // shots against A = B SOG
    totals.teamBSa += g.teamAStats.shotsOnGoal;
    totals.teamAPen += g.teamAStats.penalties;
    totals.teamBPen += g.teamBStats.penalties;
    totals.teamAPim += g.teamAStats.penaltyMinutes;
    totals.teamBPim += g.teamBStats.penaltyMinutes;
    totals.teamAPpOpp += g.teamAStats.powerPlayOpportunities;
    totals.teamBPpOpp += g.teamBStats.powerPlayOpportunities;
    totals.teamAPpGoals += g.teamAStats.powerPlayGoals;
    totals.teamBPpGoals += g.teamBStats.powerPlayGoals;
    totals.teamAPkOpp += g.teamAStats.penaltyKillOpportunities;
    totals.teamBPkOpp += g.teamBStats.penaltyKillOpportunities;
    totals.teamAPkKills += g.teamAStats.penaltyKills;
    totals.teamBPkKills += g.teamBStats.penaltyKills;
    totals.teamAShg += g.teamAStats.shortHandedGoals;
    totals.teamBShg += g.teamBStats.shortHandedGoals;
    totals.teamAPoss += g.teamAStats.possessionSeconds;
    totals.teamBPoss += g.teamBStats.possessionSeconds;
    totals.teamAOz += g.teamAStats.offensiveZoneSeconds;
    totals.teamBOz += g.teamBStats.offensiveZoneSeconds;
    totals.teamADz += g.teamAStats.defensiveZoneSeconds;
    totals.teamBDz += g.teamBStats.defensiveZoneSeconds;
    totals.teamAFo += g.teamAStats.faceoffWins;
    totals.teamBFo += g.teamBStats.faceoffWins;

    totals.strengthGapSum += g.preMatchStrengthGap;
    totals.strongerCounts[g.preMatchStronger] += 1;
    if (g.preMatchStronger === 'EVEN') agg.upsets.evenGames += 1;
    if (g.isUpset) {
      agg.upsets.upsetWins += 1;
      agg.upsets.upsetsByDecision[g.decisionType] =
        (agg.upsets.upsetsByDecision[g.decisionType] ?? 0) + 1;
    }

    if (includePlayers) {
      for (const p of g.playerContributions) {
        const key = `${p.teamSide}:${p.playerId}`;
        let row = totals.players.get(key);
        if (!row) {
          row = {
            playerId: p.playerId,
            teamSide: p.teamSide,
            firstName: p.firstName,
            lastName: p.lastName,
            position: p.position,
            lineupSlot: p.lineupSlot,
            games: 0,
            goals: 0,
            assists: 0,
            points: 0,
            shotsOnGoal: 0,
            shotAttempts: 0,
            penaltyMinutes: 0,
            powerPlayGoals: 0,
            shortHandedGoals: 0,
            pointsPerGame: 0,
            shootingPercentage: null,
            isGoalie: p.isGoalie,
            wins: 0,
            shotsAgainst: 0,
            saves: 0,
            goalsAgainst: 0,
            savePercentage: null,
            shutouts: 0,
          };
          totals.players.set(key, row);
        }
        row.games += 1;
        row.goals += p.goals;
        row.assists += p.assists;
        row.points += p.points;
        row.shotsOnGoal += p.shotsOnGoal;
        row.shotAttempts += p.shotAttempts;
        row.penaltyMinutes += p.penaltyMinutes;
        row.powerPlayGoals += p.powerPlayGoals;
        row.shortHandedGoals += p.shortHandedGoals;
        row.shotsAgainst += p.shotsAgainst;
        row.saves += p.saves;
        row.goalsAgainst += p.goalsAgainst;
        if (p.isGoalie && p.goalsAgainst === 0 && p.shotsAgainst > 0) row.shutouts += 1;
        if (p.isGoalie) {
          const teamWon =
            (p.teamSide === 'TEAM_A' && g.winner === 'TEAM_A') ||
            (p.teamSide === 'TEAM_B' && g.winner === 'TEAM_B');
          if (teamWon && p.shotsAgainst + p.goalsAgainst > 0) row.wins += 1;
        }
        if (p.firstName) row.firstName = p.firstName;
        if (p.lastName) row.lastName = p.lastName;
      }
    }

    if (includeLines) {
      for (const u of g.unitContributions) {
        const key = `${u.teamSide}:${u.unitKey}`;
        let row = totals.units.get(key);
        if (!row) {
          row = {
            unitKey: u.unitKey,
            teamSide: u.teamSide,
            playerIds: [...u.playerIds],
            games: 0,
            shiftCount: 0,
            goalsFor: 0,
            goalsAgainst: 0,
            goalDifferential: 0,
            averageEffectivePerformance: 0,
            epSum: 0,
          };
          totals.units.set(key, row);
        }
        row.games += 1;
        row.shiftCount += u.shiftCount;
        row.goalsFor += u.goalsFor;
        row.goalsAgainst += u.goalsAgainst;
        row.epSum += u.effectivePerformance;
      }
    }
  }

  const n = agg.outcomes.games || 1;
  agg.outcomes.teamAWinRate = rate(agg.outcomes.teamAWins, agg.outcomes.games);
  agg.outcomes.teamBWinRate = rate(agg.outcomes.teamBWins, agg.outcomes.games);
  agg.outcomes.homeWinRate = rate(agg.outcomes.homeWins, agg.outcomes.games);

  agg.scoring.teamAAverageGoals = totals.teamAGoals / n;
  agg.scoring.teamBAverageGoals = totals.teamBGoals / n;
  agg.scoring.combinedAverageGoals = (totals.teamAGoals + totals.teamBGoals) / n;
  agg.scoring.medianCombinedGoals = median(totals.combined);
  agg.scoring.minCombinedGoals = totals.combined.length ? Math.min(...totals.combined) : 0;
  agg.scoring.maxCombinedGoals = totals.combined.length ? Math.max(...totals.combined) : 0;
  agg.scoring.averageScoreDifferential =
    totals.differentials.reduce((a, b) => a + b, 0) / n;
  agg.scoring.exactScoreFrequencies = [...totals.scoreFreq.values()].sort((a, b) => {
    if (b.count !== a.count) return b.count - a.count;
    if (a.teamAScore !== b.teamAScore) return a.teamAScore - b.teamAScore;
    return a.teamBScore - b.teamBScore;
  });

  agg.shooting.teamAAverageShotsOnGoal = totals.teamASog / n;
  agg.shooting.teamBAverageShotsOnGoal = totals.teamBSog / n;
  agg.shooting.teamAAverageShotAttempts = totals.teamAAttempts / n;
  agg.shooting.teamBAverageShotAttempts = totals.teamBAttempts / n;
  agg.shooting.teamAShootingPercentage = rate(totals.teamAGoals, totals.teamASog);
  agg.shooting.teamBShootingPercentage = rate(totals.teamBGoals, totals.teamBSog);
  agg.shooting.teamASavePercentage = rate(totals.teamASaves, totals.teamASa);
  agg.shooting.teamBSavePercentage = rate(totals.teamBSaves, totals.teamBSa);

  agg.specialTeams.teamAPenaltiesPerGame = totals.teamAPen / n;
  agg.specialTeams.teamBPenaltiesPerGame = totals.teamBPen / n;
  agg.specialTeams.teamAPimPerGame = totals.teamAPim / n;
  agg.specialTeams.teamBPimPerGame = totals.teamBPim / n;
  agg.specialTeams.teamAPpOpportunitiesPerGame = totals.teamAPpOpp / n;
  agg.specialTeams.teamBPpOpportunitiesPerGame = totals.teamBPpOpp / n;
  agg.specialTeams.teamAPowerPlayPercentage = rate(totals.teamAPpGoals, totals.teamAPpOpp);
  agg.specialTeams.teamBPowerPlayPercentage = rate(totals.teamBPpGoals, totals.teamBPpOpp);
  agg.specialTeams.teamAPenaltyKillPercentage = rate(totals.teamAPkKills, totals.teamAPkOpp);
  agg.specialTeams.teamBPenaltyKillPercentage = rate(totals.teamBPkKills, totals.teamBPkOpp);
  agg.specialTeams.teamAShortHandedGoalsPerGame = totals.teamAShg / n;
  agg.specialTeams.teamBShortHandedGoalsPerGame = totals.teamBShg / n;

  const possTotal = totals.teamAPoss + totals.teamBPoss;
  agg.possession.teamAPossessionShare = rate(totals.teamAPoss, possTotal);
  agg.possession.teamBPossessionShare = rate(totals.teamBPoss, possTotal);
  const ozA = totals.teamAOz + totals.teamADz;
  const ozB = totals.teamBOz + totals.teamBDz;
  agg.possession.teamAOffensiveZoneShare = rate(totals.teamAOz, ozA);
  agg.possession.teamBOffensiveZoneShare = rate(totals.teamBOz, ozB);
  const foTotal = totals.teamAFo + totals.teamBFo;
  agg.possession.teamAFaceoffShare = rate(totals.teamAFo, foTotal);
  agg.possession.teamBFaceoffShare = rate(totals.teamBFo, foTotal);

  agg.upsets.averageStrengthGap = totals.strengthGapSum / n;
  const decided = agg.outcomes.games - agg.upsets.evenGames;
  agg.upsets.upsetRate = rate(agg.upsets.upsetWins, decided);
  const sc = totals.strongerCounts;
  if (sc.TEAM_A && !sc.TEAM_B && !sc.EVEN) agg.upsets.expectedStronger = 'TEAM_A';
  else if (sc.TEAM_B && !sc.TEAM_A && !sc.EVEN) agg.upsets.expectedStronger = 'TEAM_B';
  else if (!sc.TEAM_A && !sc.TEAM_B) agg.upsets.expectedStronger = 'EVEN';
  else if (sc.EVEN && !sc.TEAM_A && !sc.TEAM_B) agg.upsets.expectedStronger = 'EVEN';
  else agg.upsets.expectedStronger = 'MIXED';

  if (includePlayers) {
    agg.players = [...totals.players.values()]
      .map((p) => ({
        ...p,
        pointsPerGame: rate(p.points, p.games),
        shootingPercentage: p.shotsOnGoal > 0 ? rate(p.goals, p.shotsOnGoal) : null,
        savePercentage: p.shotsAgainst > 0 ? rate(p.saves, p.shotsAgainst) : null,
      }))
      .sort((a, b) => {
        if (b.points !== a.points) return b.points - a.points;
        if (b.goals !== a.goals) return b.goals - a.goals;
        return a.playerId.localeCompare(b.playerId);
      });
  }

  if (includeLines) {
    agg.units = [...totals.units.values()]
      .map(({ epSum, ...u }) => ({
        ...u,
        goalDifferential: u.goalsFor - u.goalsAgainst,
        averageEffectivePerformance: rate(epSum, u.games),
      }))
      .sort((a, b) => {
        if (b.shiftCount !== a.shiftCount) return b.shiftCount - a.shiftCount;
        return `${a.teamSide}:${a.unitKey}`.localeCompare(`${b.teamSide}:${b.unitKey}`);
      });
  }

  return agg;
}
