import { createRng, nextFloat, chance } from '../../simulation/match/rng.js';
import { stableDigest } from '../../simulation/batch/hash.js';
import type { CompetitionPointsRules } from '../types.js';
import type { ScheduledMatchSpec } from '../regular-season/types.js';
import type {
  AggregatedDecisionType,
  AggregatedGameSummary,
  AggregatedSeasonConfig,
  AggregatedTeamStrengthSnapshot,
} from './types.js';

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

function poissonSample(rngSeed: string, lambda: number): { count: number; nextSeed: string } {
  let rng = createRng(rngSeed);
  const L = Math.exp(-Math.max(0.05, lambda));
  let k = 0;
  let p = 1;
  do {
    k += 1;
    const step = nextFloat(rng);
    rng = step.rng;
    p *= step.value;
  } while (p > L && k < 20);
  return { count: k - 1, nextSeed: `${rngSeed}:${k}` };
}

function expectedGoals(
  offense: number,
  oppDefense: number,
  oppGoalie: number,
  config: AggregatedSeasonConfig,
  homeBoost: number,
): number {
  const gap = offense - 0.55 * oppDefense - 0.45 * oppGoalie + homeBoost;
  const mid =
    (config.minimumTeamGoalsPerGame + config.maximumTeamGoalsPerGame) / 2;
  const span = (config.maximumTeamGoalsPerGame - config.minimumTeamGoalsPerGame) / 2;
  return clamp(mid + gap * span * 1.4, config.minimumTeamGoalsPerGame, config.maximumTeamGoalsPerGame);
}

export function deriveGameSeed(seasonSeed: string, scheduleKey: string): string {
  return stableDigest(`${seasonSeed}|game|${scheduleKey}`).slice(0, 32);
}

export function simulateAggregatedGame(input: {
  match: ScheduledMatchSpec;
  home: AggregatedTeamStrengthSnapshot;
  away: AggregatedTeamStrengthSnapshot;
  config: AggregatedSeasonConfig;
  seasonSeed: string;
  pointsRules: CompetitionPointsRules;
  tiesAllowed: boolean;
}): AggregatedGameSummary {
  const seed = deriveGameSeed(input.seasonSeed, input.match.scheduleKey);
  let rng = createRng(seed);
  const noise = () => {
    const step = nextFloat(rng);
    rng = step.rng;
    return (step.value - 0.5) * 2 * input.config.strengthRandomness;
  };

  const homeExp = expectedGoals(
    input.home.offenseStrength + noise(),
    input.away.defenseStrength,
    input.away.goalieStrength,
    input.config,
    input.config.homeAdvantage,
  );
  const awayExp = expectedGoals(
    input.away.offenseStrength + noise(),
    input.home.defenseStrength,
    input.home.goalieStrength,
    input.config,
    -input.config.homeAdvantage * 0.5,
  );

  const homeReg = poissonSample(`${seed}:hg`, homeExp * (1 + noise() * input.config.scoreVariance));
  const awayReg = poissonSample(`${seed}:ag`, awayExp * (1 + noise() * input.config.scoreVariance));
  let homeRegulationScore = homeReg.count;
  let awayRegulationScore = awayReg.count;
  let homeScore = homeRegulationScore;
  let awayScore = awayRegulationScore;
  let decisionType: AggregatedDecisionType = 'REGULATION';
  let winnerParticipantId: string | null = null;

  if (homeScore !== awayScore) {
    winnerParticipantId =
      homeScore > awayScore
        ? input.home.competitionParticipantId
        : input.away.competitionParticipantId;
  } else if (input.tiesAllowed) {
    decisionType = 'TIE';
  } else {
    rng = createRng(`${seed}:extra`);
    const soChance = chance(rng, input.config.shootoutRateTarget);
    rng = soChance.rng;
    decisionType = soChance.value ? 'SHOOTOUT' : 'OVERTIME';
    const winnerRoll = nextFloat(rng);
    rng = winnerRoll.rng;
    const homeWinProb =
      0.5 +
      (input.home.overallStrength - input.away.overallStrength) * 0.35 +
      input.config.homeAdvantage;
    const homeWins = winnerRoll.value < clamp(homeWinProb, 0.2, 0.8);
    if (homeWins) {
      homeScore += 1;
      winnerParticipantId = input.home.competitionParticipantId;
    } else {
      awayScore += 1;
      winnerParticipantId = input.away.competitionParticipantId;
    }
  }

  let homePoints = 0;
  let awayPoints = 0;
  const pr = input.pointsRules;
  if (decisionType === 'TIE') {
    homePoints = pr.tie;
    awayPoints = pr.tie;
  } else if (winnerParticipantId === input.home.competitionParticipantId) {
    homePoints =
      decisionType === 'REGULATION'
        ? pr.regulationWin
        : decisionType === 'OVERTIME'
          ? pr.overtimeWin
          : pr.shootoutWin;
    awayPoints =
      decisionType === 'REGULATION'
        ? pr.regulationLoss
        : decisionType === 'OVERTIME'
          ? pr.overtimeLoss
          : pr.shootoutLoss;
  } else {
    awayPoints =
      decisionType === 'REGULATION'
        ? pr.regulationWin
        : decisionType === 'OVERTIME'
          ? pr.overtimeWin
          : pr.shootoutWin;
    homePoints =
      decisionType === 'REGULATION'
        ? pr.regulationLoss
        : decisionType === 'OVERTIME'
          ? pr.overtimeLoss
          : pr.shootoutLoss;
  }

  const homeShots = clamp(Math.round(28 + homeExp * 4 + noise() * 6), 15, 55);
  const awayShots = clamp(Math.round(28 + awayExp * 4 + noise() * 6), 15, 55);
  const homeSaves = Math.max(0, awayShots - awayScore);
  const awaySaves = Math.max(0, homeShots - homeScore);
  const homePenalties = clamp(Math.round(3 + noise()), 0, 8);
  const awayPenalties = clamp(Math.round(3 + noise()), 0, 8);
  const homePpOpportunities = awayPenalties;
  const awayPpOpportunities = homePenalties;
  const homePpGoals = clamp(Math.round(homeScore * 0.25), 0, homeScore);
  const awayPpGoals = clamp(Math.round(awayScore * 0.25), 0, awayScore);
  const homePossession = clamp(0.5 + (input.home.offenseStrength - input.away.offenseStrength) * 0.2, 0.35, 0.65);

  const summary: AggregatedGameSummary = {
    scheduleKey: input.match.scheduleKey,
    scheduleOrder: input.match.scheduleOrder,
    roundNumber: input.match.roundNumber,
    slotNumber: input.match.slotNumber,
    homeCompetitionParticipantId: input.home.competitionParticipantId,
    awayCompetitionParticipantId: input.away.competitionParticipantId,
    homeTeamNameSnapshot: input.home.teamNameSnapshot,
    awayTeamNameSnapshot: input.away.teamNameSnapshot,
    homeScore,
    awayScore,
    homeRegulationScore,
    awayRegulationScore,
    decisionType,
    homePoints,
    awayPoints,
    winnerParticipantId,
    homeShots,
    awayShots,
    homeSaves,
    awaySaves,
    homePenalties,
    awayPenalties,
    homePim: homePenalties * 2,
    awayPim: awayPenalties * 2,
    homePpOpportunities,
    awayPpOpportunities,
    homePpGoals,
    awayPpGoals,
    homePossessionEstimate: homePossession,
    awayPossessionEstimate: 1 - homePossession,
    seed,
    resultHash: '',
  };
  summary.resultHash = stableDigest(
    JSON.stringify({
      scheduleKey: summary.scheduleKey,
      homeScore: summary.homeScore,
      awayScore: summary.awayScore,
      decisionType: summary.decisionType,
      winnerParticipantId: summary.winnerParticipantId,
      seed: summary.seed,
    }),
  );
  return summary;
}
