import { computeStandings } from '../regular-season/standings.js';
import type { CompetitionPointsRules, TiebreakerCode } from '../types.js';
import { allocatePlayerStats, accumulateTeamStats } from './allocation.js';
import { parseAggregatedSeasonConfig } from './config.js';
import { hashAggregatedConfig, hashAggregatedInput, hashAggregatedResult } from './hashing.js';
import { simulateAggregatedGame } from './match-summary.js';
import { detectAggregatedAnomalies } from './reconciliation.js';
import { generateAggregatedSchedule } from './schedule.js';
import { computeLeagueStrengthSnapshots } from './strength.js';
import type {
  AggregatedRosterPlayer,
  AggregatedSeasonConfig,
  AggregatedSeasonResult,
  AggregatedTeamStrengthInput,
} from './types.js';
import { assertReconciled, reconcileAggregatedSeason } from './validation.js';

export function runAggregatedSeason(input: {
  competitionEditionId: string;
  competitionStageId: string;
  seed: string;
  config?: unknown;
  teams: AggregatedTeamStrengthInput[];
  pointsRules: CompetitionPointsRules;
  tiebreakers: TiebreakerCode[];
  tiesAllowed: boolean;
  balanceHash?: string | null;
}): AggregatedSeasonResult & {
  config: AggregatedSeasonConfig;
  strengths: ReturnType<typeof computeLeagueStrengthSnapshots>;
  standingsHash: string;
} {
  const config = parseAggregatedSeasonConfig(input.config);
  const strengths = computeLeagueStrengthSnapshots(input.teams);
  const byId = new Map(strengths.map((s) => [s.competitionParticipantId, s]));
  const schedule = generateAggregatedSchedule({
    participantIds: strengths.map((s) => s.competitionParticipantId),
    config,
    seed: input.seed,
  });

  const games = schedule.matches.map((m) =>
    simulateAggregatedGame({
      match: m,
      home: byId.get(m.homeParticipantId)!,
      away: byId.get(m.awayParticipantId)!,
      config,
      seasonSeed: input.seed,
      pointsRules: input.pointsRules,
      tiesAllowed: input.tiesAllowed,
    }),
  );

  const teamStats = accumulateTeamStats(strengths, games);
  const rosters = new Map<string, AggregatedRosterPlayer[]>();
  for (const t of input.teams) {
    rosters.set(t.competitionParticipantId, t.players);
  }
  const playerStats = allocatePlayerStats({ strengths, teamStats, rosters, config });

  const standingMatches = games.map((g) => ({
    scheduleOrder: g.scheduleOrder,
    homeParticipantId: g.homeCompetitionParticipantId,
    awayParticipantId: g.awayCompetitionParticipantId,
    homeTeamId: byId.get(g.homeCompetitionParticipantId)!.teamId,
    awayTeamId: byId.get(g.awayCompetitionParticipantId)!.teamId,
    homeScore: g.homeScore,
    awayScore: g.awayScore,
    homeRegulationScore: g.homeRegulationScore,
    awayRegulationScore: g.awayRegulationScore,
    decisionType: g.decisionType,
    winnerParticipantId: g.winnerParticipantId,
  }));

  const standings = computeStandings({
    participants: strengths.map((s) => ({
      participantId: s.competitionParticipantId,
      teamId: s.teamId,
      teamNameSnapshot: s.teamNameSnapshot,
    })),
    matches: standingMatches,
    pointsRules: input.pointsRules,
    tiebreakers: input.tiebreakers,
    qualifiersCount: config.qualifiersCount,
    scheduledMatchCount: games.length,
    standingsSeed: `${input.seed}:standings`,
    provisional: false,
  });

  const championParticipantId = standings.rows[0]?.participantId ?? null;
  const configHash = hashAggregatedConfig(config);
  const inputHash = hashAggregatedInput({
    competitionEditionId: input.competitionEditionId,
    competitionStageId: input.competitionStageId,
    strengths,
    balanceHash: input.balanceHash ?? null,
    seed: input.seed,
  });
  const resultHash = hashAggregatedResult({
    scheduleHash: schedule.scheduleHash,
    gameResultHashes: games.map((g) => g.resultHash),
    standingsHash: standings.standingsHash,
    championParticipantId,
  });

  const recon = reconcileAggregatedSeason({
    expectedScheduleKeys: schedule.matches.map((m) => m.scheduleKey),
    games,
    teamStats,
    playerStats,
    participantCount: strengths.length,
    championParticipantId,
    rank1ParticipantId: championParticipantId,
  });
  assertReconciled(recon);

  const anomalies = detectAggregatedAnomalies({
    strengths,
    games,
    teamStats,
    playerStats,
  });

  return {
    games,
    teamStats,
    playerStats,
    scheduleHash: schedule.scheduleHash,
    resultHash,
    inputHash,
    configHash,
    championParticipantId,
    anomalies,
    config,
    strengths,
    standingsHash: standings.standingsHash,
  };
}

export type { AggregatedSeasonResult };
