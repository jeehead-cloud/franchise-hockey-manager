import { StatisticsReconciliationError } from './errors.js';
import type {
  MatchEvent,
  MatchState,
  MatchStatistics,
  ReconciliationCheck,
  ReconciliationResult,
  SimulationInput,
} from './types.js';

function check(code: string, ok: boolean, message: string): ReconciliationCheck {
  return { code, ok, message };
}

/**
 * Verify score / stats / event-chain invariants.
 * Throws StatisticsReconciliationError when `ok` is false (preferred completion gate).
 */
export function reconcileStatistics(
  input: SimulationInput,
  events: MatchEvent[],
  state: MatchState,
  stats: MatchStatistics,
): ReconciliationResult {
  const checks: ReconciliationCheck[] = [];

  const goals = events.filter((e) => e.type === 'GOAL');
  const saves = events.filter((e) => e.type === 'SAVE');
  const shots = events.filter((e) => e.type === 'SHOT');
  const blocked = events.filter((e) => e.type === 'SHOT_BLOCKED');
  const missed = events.filter((e) => e.type === 'SHOT_MISSED');

  const goalCountHome = goals.filter(
    (e) => String(e.details.scoringTeamId ?? e.teamId) === input.homeTeam.teamId,
  ).length;
  const goalCountAway = goals.filter(
    (e) => String(e.details.scoringTeamId ?? e.teamId) === input.awayTeam.teamId,
  ).length;

  checks.push(
    check(
      'SCORE_EQUALS_GOAL_EVENTS',
      state.score.home === goalCountHome && state.score.away === goalCountAway,
      `State score ${state.score.home}-${state.score.away} vs GOAL events ${goalCountHome}-${goalCountAway}`,
    ),
  );

  checks.push(
    check(
      'TEAM_GOALS_EQUAL_EVENTS',
      stats.home.goals === goalCountHome && stats.away.goals === goalCountAway,
      `Team goals ${stats.home.goals}-${stats.away.goals} vs events ${goalCountHome}-${goalCountAway}`,
    ),
  );

  const skaterGoalsHome = stats.skaters
    .filter((s) => s.teamId === input.homeTeam.teamId)
    .reduce((n, s) => n + s.goals, 0);
  const skaterGoalsAway = stats.skaters
    .filter((s) => s.teamId === input.awayTeam.teamId)
    .reduce((n, s) => n + s.goals, 0);
  checks.push(
    check(
      'PLAYER_GOALS_SUM_TO_TEAM',
      skaterGoalsHome === stats.home.goals && skaterGoalsAway === stats.away.goals,
      `Player goal sums ${skaterGoalsHome}/${skaterGoalsAway} vs team ${stats.home.goals}/${stats.away.goals}`,
    ),
  );

  let pointsOk = true;
  for (const s of stats.skaters) {
    if (s.points !== s.goals + s.assists) {
      pointsOk = false;
      break;
    }
    if (s.assists !== s.primaryAssists + s.secondaryAssists) {
      pointsOk = false;
      break;
    }
  }
  checks.push(check('POINTS_EQUALS_GOALS_PLUS_ASSISTS', pointsOk, 'Player points must equal goals + assists'));

  let assistsPerGoalOk = true;
  for (const g of goals) {
    const primary = g.details.primaryAssistId == null ? null : String(g.details.primaryAssistId);
    const secondary = g.details.secondaryAssistId == null ? null : String(g.details.secondaryAssistId);
    const scorer = String(g.details.scorerId ?? '');
    const ids = [primary, secondary].filter(Boolean) as string[];
    if (ids.length > 2) assistsPerGoalOk = false;
    if (primary && primary === scorer) assistsPerGoalOk = false;
    if (secondary && secondary === scorer) assistsPerGoalOk = false;
    if (primary && secondary && primary === secondary) assistsPerGoalOk = false;
  }
  checks.push(
    check('ASSISTS_RULES', assistsPerGoalOk, 'Each goal has 0–2 distinct non-scorer assists from pass chain'),
  );

  const homeSog = stats.home.shotsOnGoal;
  const awaySog = stats.away.shotsOnGoal;
  const homeGoalieSa = stats.goalies
    .filter((g) => g.teamId === input.homeTeam.teamId)
    .reduce((n, g) => n + g.shotsAgainst, 0);
  const awayGoalieSa = stats.goalies
    .filter((g) => g.teamId === input.awayTeam.teamId)
    .reduce((n, g) => n + g.shotsAgainst, 0);
  const homeGoalieSv = stats.goalies
    .filter((g) => g.teamId === input.homeTeam.teamId)
    .reduce((n, g) => n + g.saves, 0);
  const awayGoalieSv = stats.goalies
    .filter((g) => g.teamId === input.awayTeam.teamId)
    .reduce((n, g) => n + g.saves, 0);
  const homeGa = stats.goalies
    .filter((g) => g.teamId === input.homeTeam.teamId)
    .reduce((n, g) => n + g.goalsAgainst, 0);
  const awayGa = stats.goalies
    .filter((g) => g.teamId === input.awayTeam.teamId)
    .reduce((n, g) => n + g.goalsAgainst, 0);

  checks.push(
    check(
      'SOG_EQUALS_OPP_SAVES_PLUS_GA',
      homeSog === awayGoalieSv + awayGa && awaySog === homeGoalieSv + homeGa,
      `SOG home/away ${homeSog}/${awaySog} vs opp SV+GA ${awayGoalieSv + awayGa}/${homeGoalieSv + homeGa}`,
    ),
  );

  let goalieIdentityOk = true;
  for (const g of stats.goalies) {
    if (g.shotsAgainst !== g.saves + g.goalsAgainst) goalieIdentityOk = false;
    if (g.shotsAgainst > 0 && !Number.isFinite(g.savePercentage)) goalieIdentityOk = false;
    if (g.saves < 0 || g.goalsAgainst < 0 || g.shotsAgainst < 0) goalieIdentityOk = false;
  }
  checks.push(
    check('GOALIE_SA_EQUALS_SV_PLUS_GA', goalieIdentityOk, 'Goalie shots against must equal saves + GA'),
  );

  const resolvedByShot = new Map<number, string>();
  let shotResolutionOk = true;
  for (const e of [...blocked, ...missed, ...saves, ...goals]) {
    const shotIndex = Number(e.details.shotEventIndex);
    if (!Number.isFinite(shotIndex)) {
      shotResolutionOk = false;
      continue;
    }
    if (resolvedByShot.has(shotIndex)) {
      shotResolutionOk = false;
      continue;
    }
    resolvedByShot.set(shotIndex, e.type);
  }

  for (const shot of shots) {
    if (!resolvedByShot.has(shot.index)) {
      // Pending shot at end of incomplete sim is allowed only if state still has pendingShot
      if (!(state.pendingShot && state.pendingShot.shotEventIndex === shot.index)) {
        shotResolutionOk = false;
      }
    }
  }

  for (const shotIndex of resolvedByShot.keys()) {
    if (!shots.some((s) => s.index === shotIndex)) shotResolutionOk = false;
  }

  checks.push(
    check(
      'EVERY_SHOT_RESOLVES_ONCE',
      shotResolutionOk &&
        blocked.length + missed.length + saves.length + goals.length ===
          shots.length - (state.pendingShot ? 1 : 0),
      `Shots=${shots.length} resolutions=${blocked.length + missed.length + saves.length + goals.length} pending=${state.pendingShot ? 1 : 0}`,
    ),
  );

  checks.push(
    check(
      'SOG_EQUALS_SAVES_PLUS_GOALS',
      saves.length + goals.length === homeSog + awaySog,
      `SAVE+GOAL events ${saves.length + goals.length} vs total SOG ${homeSog + awaySog}`,
    ),
  );

  const periodSumHome = stats.periodScores.reduce((n, p) => n + p.home, 0);
  const periodSumAway = stats.periodScores.reduce((n, p) => n + p.away, 0);
  checks.push(
    check(
      'PERIOD_SCORES_SUM',
      periodSumHome === stats.home.goals && periodSumAway === stats.away.goals,
      `Period score sums ${periodSumHome}-${periodSumAway} vs team goals ${stats.home.goals}-${stats.away.goals}`,
    ),
  );

  let nonNegative = true;
  for (const s of stats.skaters) {
    for (const key of [
      'goals',
      'assists',
      'points',
      'shotsOnGoal',
      'shotAttempts',
      'blockedAttempts',
      'missedAttempts',
      'blocks',
    ] as const) {
      if (s[key] < 0) nonNegative = false;
    }
  }
  checks.push(check('NON_NEGATIVE_STATS', nonNegative, 'No negative player statistics'));

  const lineupSkaters =
    input.homeTeam.lineupAssignments.filter((a) => !a.slot.startsWith('G_')).length +
    input.awayTeam.lineupAssignments.filter((a) => !a.slot.startsWith('G_')).length;
  const lineupGoalies =
    input.homeTeam.lineupAssignments.filter((a) => a.slot.startsWith('G_')).length +
    input.awayTeam.lineupAssignments.filter((a) => a.slot.startsWith('G_')).length;
  checks.push(
    check(
      'COMPLETE_LINEUP_ROWS',
      stats.skaters.length === lineupSkaters && stats.goalies.length === lineupGoalies,
      `Expected ${lineupSkaters} skaters / ${lineupGoalies} goalies, got ${stats.skaters.length}/${stats.goalies.length}`,
    ),
  );

  const failures = checks.filter((c) => !c.ok).map((c) => `${c.code}: ${c.message}`);
  const result: ReconciliationResult = {
    ok: failures.length === 0,
    checks,
    failures,
  };

  if (!result.ok) {
    throw new StatisticsReconciliationError(
      `Statistics reconciliation failed (${failures.length} check(s))`,
      failures,
    );
  }

  return result;
}
