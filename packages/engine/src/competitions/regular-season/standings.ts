import { stableDigest } from '../../simulation/batch/hash.js';
import type { CompetitionPointsRules, TiebreakerCode } from '../types.js';
import type {
  StandingMatchResult,
  StandingParticipant,
  StandingRow,
  StandingsResult,
} from './types.js';
import { RegularSeasonError } from './types.js';

interface Acc {
  participantId: string;
  teamId: string;
  teamNameSnapshot: string;
  gamesPlayed: number;
  regulationWins: number;
  overtimeWins: number;
  shootoutWins: number;
  regulationLosses: number;
  overtimeLosses: number;
  shootoutLosses: number;
  ties: number;
  goalsFor: number;
  goalsAgainst: number;
  points: number;
}

function emptyAcc(p: StandingParticipant): Acc {
  return {
    participantId: p.participantId,
    teamId: p.teamId,
    teamNameSnapshot: p.teamNameSnapshot,
    gamesPlayed: 0,
    regulationWins: 0,
    overtimeWins: 0,
    shootoutWins: 0,
    regulationLosses: 0,
    overtimeLosses: 0,
    shootoutLosses: 0,
    ties: 0,
    goalsFor: 0,
    goalsAgainst: 0,
    points: 0,
  };
}

function applyResult(
  acc: Map<string, Acc>,
  match: StandingMatchResult,
  points: CompetitionPointsRules,
): void {
  const home = acc.get(match.homeParticipantId);
  const away = acc.get(match.awayParticipantId);
  if (!home || !away) {
    throw new RegularSeasonError(
      'StandingsReconciliationFailed',
      'Match references unknown participant',
    );
  }
  home.gamesPlayed += 1;
  away.gamesPlayed += 1;
  home.goalsFor += match.homeScore;
  home.goalsAgainst += match.awayScore;
  away.goalsFor += match.awayScore;
  away.goalsAgainst += match.homeScore;

  if (match.decisionType === 'TIE') {
    home.ties += 1;
    away.ties += 1;
    home.points += points.tie;
    away.points += points.tie;
    return;
  }

  const homeWon = match.winnerParticipantId === match.homeParticipantId;
  const winner = homeWon ? home : away;
  const loser = homeWon ? away : home;

  switch (match.decisionType) {
    case 'REGULATION':
      winner.regulationWins += 1;
      loser.regulationLosses += 1;
      winner.points += points.regulationWin;
      loser.points += points.regulationLoss;
      break;
    case 'OVERTIME':
      winner.overtimeWins += 1;
      loser.overtimeLosses += 1;
      winner.points += points.overtimeWin;
      loser.points += points.overtimeLoss;
      break;
    case 'SHOOTOUT':
      winner.shootoutWins += 1;
      loser.shootoutLosses += 1;
      winner.points += points.shootoutWin;
      loser.points += points.shootoutLoss;
      break;
    default: {
      const _e: never = match.decisionType;
      throw new RegularSeasonError('StandingsReconciliationFailed', `Unknown decision ${_e}`);
    }
  }
}

function totalWins(a: Acc): number {
  return a.regulationWins + a.overtimeWins + a.shootoutWins;
}

function compareByTiebreakers(
  a: Acc,
  b: Acc,
  tiebreakers: TiebreakerCode[],
  matches: StandingMatchResult[],
  standingsSeed: string,
): { cmp: number; rule: string } {
  for (const rule of tiebreakers) {
    let cmp = 0;
    switch (rule) {
      case 'POINTS':
        cmp = b.points - a.points;
        break;
      case 'REGULATION_WINS':
        cmp = b.regulationWins - a.regulationWins;
        break;
      case 'TOTAL_WINS':
        cmp = totalWins(b) - totalWins(a);
        break;
      case 'GOAL_DIFFERENCE':
        cmp = b.goalsFor - b.goalsAgainst - (a.goalsFor - a.goalsAgainst);
        break;
      case 'GOALS_FOR':
        cmp = b.goalsFor - a.goalsFor;
        break;
      case 'HEAD_TO_HEAD': {
        let aPts = 0;
        let bPts = 0;
        for (const m of matches) {
          const pair = new Set([m.homeParticipantId, m.awayParticipantId]);
          if (!pair.has(a.participantId) || !pair.has(b.participantId)) continue;
          if (m.decisionType === 'TIE') {
            aPts += 1;
            bPts += 1;
          } else if (m.winnerParticipantId === a.participantId) aPts += 2;
          else if (m.winnerParticipantId === b.participantId) bPts += 2;
        }
        cmp = bPts - aPts;
        break;
      }
      case 'RANDOM_DRAW': {
        const da = stableDigest(`${standingsSeed}:draw:${a.participantId}`);
        const db = stableDigest(`${standingsSeed}:draw:${b.participantId}`);
        cmp = da < db ? -1 : da > db ? 1 : 0;
        break;
      }
      default: {
        const _e: never = rule;
        throw new RegularSeasonError('InvalidScheduleConfiguration', `Unsupported tiebreaker ${_e}`);
      }
    }
    if (cmp !== 0) return { cmp, rule };
  }
  // stable fallback
  const cmp =
    a.participantId < b.participantId ? -1 : a.participantId > b.participantId ? 1 : 0;
  return { cmp, rule: 'PARTICIPANT_ID' };
}

export function computeStandings(input: {
  participants: StandingParticipant[];
  matches: StandingMatchResult[];
  pointsRules: CompetitionPointsRules;
  tiebreakers: TiebreakerCode[];
  qualifiersCount: number;
  scheduledMatchCount: number;
  standingsSeed: string;
  provisional: boolean;
}): StandingsResult {
  if (!input.pointsRules) {
    throw new RegularSeasonError('InvalidScheduleConfiguration', 'pointsRules required');
  }
  if (!input.tiebreakers?.length) {
    throw new RegularSeasonError('InvalidScheduleConfiguration', 'tiebreakers required');
  }

  const acc = new Map<string, Acc>();
  for (const p of input.participants) {
    if (acc.has(p.participantId)) {
      throw new RegularSeasonError('StandingsReconciliationFailed', 'Duplicate participant');
    }
    acc.set(p.participantId, emptyAcc(p));
  }

  for (const m of input.matches) {
    applyResult(acc, m, input.pointsRules);
  }

  const list = [...acc.values()];
  const explanations = new Map<string, string>();

  list.sort((a, b) => {
    const { cmp, rule } = compareByTiebreakers(
      a,
      b,
      input.tiebreakers,
      input.matches,
      input.standingsSeed,
    );
    if (cmp !== 0) {
      const key = [a.participantId, b.participantId].sort().join('|');
      explanations.set(key, rule);
    }
    return cmp;
  });

  const rows: StandingRow[] = list.map((a, idx) => {
    const wins = totalWins(a);
    const losses = a.regulationLosses + a.overtimeLosses + a.shootoutLosses;
    const gd = a.goalsFor - a.goalsAgainst;
    const prev = idx > 0 ? list[idx - 1]! : null;
    let tiebreakerSummary = '—';
    if (prev) {
      const key = [a.participantId, prev.participantId].sort().join('|');
      const rule = explanations.get(key) ?? 'PARTICIPANT_ID';
      tiebreakerSummary = `Separated from rank ${idx} by ${rule}`;
    }
    return {
      rank: idx + 1,
      participantId: a.participantId,
      teamId: a.teamId,
      teamNameSnapshot: a.teamNameSnapshot,
      gamesPlayed: a.gamesPlayed,
      regulationWins: a.regulationWins,
      overtimeWins: a.overtimeWins,
      shootoutWins: a.shootoutWins,
      regulationLosses: a.regulationLosses,
      overtimeLosses: a.overtimeLosses,
      shootoutLosses: a.shootoutLosses,
      ties: a.ties,
      wins,
      losses,
      goalsFor: a.goalsFor,
      goalsAgainst: a.goalsAgainst,
      goalDifference: gd,
      points: a.points,
      pointsPercentage: a.gamesPlayed > 0 ? a.points / (a.gamesPlayed * Math.max(input.pointsRules.regulationWin, 1)) : 0,
      qualified: idx < input.qualifiersCount,
      tiebreakerSummary,
    };
  });

  // Fix qualification strictly by rank
  for (const row of rows) {
    row.qualified = row.rank <= input.qualifiersCount && input.qualifiersCount > 0;
  }

  const standingsHash = stableDigest(
    JSON.stringify({
      provisional: input.provisional,
      rows: rows.map((r) => ({
        rank: r.rank,
        participantId: r.participantId,
        points: r.points,
        gf: r.goalsFor,
        ga: r.goalsAgainst,
        qualified: r.qualified,
      })),
      seed: input.standingsSeed,
    }),
  );

  return {
    provisional: input.provisional,
    rows,
    standingsHash,
    qualificationParticipantIds: rows.filter((r) => r.qualified).map((r) => r.participantId),
    pointsRules: input.pointsRules,
    tiebreakers: input.tiebreakers,
    completedMatchCount: input.matches.length,
    scheduledMatchCount: input.scheduledMatchCount,
  };
}

export function reconcileStandingsBasics(input: {
  standings: StandingsResult;
  completedMatches: number;
}): string[] {
  const errors: string[] = [];
  const rows = input.standings.rows;
  const totalGp = rows.reduce((s, r) => s + r.gamesPlayed, 0);
  if (totalGp !== input.completedMatches * 2) {
    errors.push(`gamesPlayed sum ${totalGp} != 2 * matches ${input.completedMatches}`);
  }
  const gf = rows.reduce((s, r) => s + r.goalsFor, 0);
  const ga = rows.reduce((s, r) => s + r.goalsAgainst, 0);
  if (gf !== ga) errors.push(`goalsFor ${gf} != goalsAgainst ${ga}`);
  const ranks = new Set(rows.map((r) => r.rank));
  if (ranks.size !== rows.length) errors.push('Duplicate ranks');
  return errors;
}
