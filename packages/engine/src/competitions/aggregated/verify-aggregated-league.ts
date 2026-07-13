/**
 * F21 aggregated-league verifier — deterministic season + no detailed match path.
 */
import {
  runAggregatedSeason,
  type AggregatedRosterPlayer,
  type AggregatedTeamStrengthInput,
} from './index.js';

const POINTS = {
  regulationWin: 2,
  overtimeWin: 2,
  shootoutWin: 2,
  overtimeLoss: 1,
  shootoutLoss: 1,
  regulationLoss: 0,
  tie: 1,
};

function team(id: string, ability: number): AggregatedTeamStrengthInput {
  const players: AggregatedRosterPlayer[] = [];
  for (let i = 0; i < 12; i += 1) {
    players.push({
      playerId: `${id}-s${i}`,
      firstName: id,
      lastName: `S${i}`,
      position: i < 8 ? 'C' : 'LD',
      isGoalie: false,
      ability: ability - (i % 3),
      offense: ability,
      defense: ability - 1,
    });
  }
  players.push({
    playerId: `${id}-g`,
    firstName: id,
    lastName: 'G',
    position: 'G',
    isGoalie: true,
    ability,
    offense: 1,
    defense: ability,
  });
  return {
    competitionParticipantId: id,
    teamId: `t-${id}`,
    teamNameSnapshot: id,
    players,
    chemistryModifier: 0,
    coachingModifier: 0,
  };
}

function main() {
  const teams = [team('a', 14), team('b', 12), team('c', 11), team('d', 10)];
  const started = Date.now();
  const r1 = runAggregatedSeason({
    competitionEditionId: 'ed',
    competitionStageId: 'st',
    seed: 'verify-agg',
    teams,
    pointsRules: POINTS,
    tiebreakers: ['GOAL_DIFFERENCE', 'GOALS_FOR'],
    tiesAllowed: false,
  });
  const r2 = runAggregatedSeason({
    competitionEditionId: 'ed',
    competitionStageId: 'st',
    seed: 'verify-agg',
    teams,
    pointsRules: POINTS,
    tiebreakers: ['GOAL_DIFFERENCE', 'GOALS_FOR'],
    tiesAllowed: false,
  });
  if (r1.resultHash !== r2.resultHash) throw new Error('result hash not stable');
  if (r1.inputHash !== r2.inputHash) throw new Error('input hash not stable');
  const other = runAggregatedSeason({
    competitionEditionId: 'ed',
    competitionStageId: 'st',
    seed: 'verify-agg-other',
    teams,
    pointsRules: POINTS,
    tiebreakers: ['GOAL_DIFFERENCE', 'GOALS_FOR'],
    tiesAllowed: false,
  });
  if (other.resultHash === r1.resultHash) throw new Error('seed did not change result');
  if (!r1.championParticipantId) throw new Error('missing champion');
  const durationMs = Date.now() - started;
  console.log(
    JSON.stringify({
      ok: true,
      games: r1.games.length,
      resultHash: r1.resultHash,
      inputHash: r1.inputHash,
      configHash: r1.configHash,
      scheduleHash: r1.scheduleHash,
      championParticipantId: r1.championParticipantId,
      anomalyCount: r1.anomalies.length,
      durationMs,
      note: 'Pure engine verifier — no Prisma Match/MatchEvent rows',
    }),
  );
}

main();
