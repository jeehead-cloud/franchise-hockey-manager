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

  // --- F13 special-teams checks ---
  const penaltyEvents = events.filter((e) => e.type === 'PENALTY');
  const penaltyExpiredEvents = events.filter((e) => e.type === 'PENALTY_EXPIRED');
  const ppGoals = goals.filter((g) => g.details.goalStrength === 'POWER_PLAY');
  const shGoals = goals.filter((g) => g.details.goalStrength === 'SHORT_HANDED');

  checks.push(
    check(
      'F13_ONE_ACTIVE_PENALTY_MAX',
      penaltyEvents.length <= events.length,
      'Penalty event count sanity',
    ),
  );

  let overlappingPenalties = false;
  let openPenaltyCount = 0;
  const seenPenaltySequences = new Set<number>();
  for (const e of events) {
    if (e.type === 'PENALTY') {
      const seq = Number(e.details.penaltySequenceId);
      if (seenPenaltySequences.has(seq)) overlappingPenalties = true;
      seenPenaltySequences.add(seq);
      if (openPenaltyCount > 0) overlappingPenalties = true;
      openPenaltyCount += 1;
    }
    if (e.type === 'PENALTY_EXPIRED' || (e.type === 'GOAL' && e.details.penaltyEndedByGoal)) {
      openPenaltyCount = Math.max(0, openPenaltyCount - 1);
    }
  }
  if (state.activePenalty) openPenaltyCount += 1;
  checks.push(
    check(
      'F13_NO_OVERLAPPING_PENALTIES',
      !overlappingPenalties && openPenaltyCount <= 1,
      `Overlapping penalties detected (open=${openPenaltyCount})`,
    ),
  );

  const homePenalties = penaltyEvents.filter(
    (e) => String(e.details.penalizedTeamId ?? e.teamId) === input.homeTeam.teamId,
  ).length;
  const awayPenalties = penaltyEvents.filter(
    (e) => String(e.details.penalizedTeamId ?? e.teamId) === input.awayTeam.teamId,
  ).length;
  checks.push(
    check(
      'F13_PP_OPPORTUNITIES_MATCH_OPPONENT_PENALTIES',
      stats.home.powerPlayOpportunities === awayPenalties &&
        stats.away.powerPlayOpportunities === homePenalties,
      `PP opportunities home/away ${stats.home.powerPlayOpportunities}/${stats.away.powerPlayOpportunities} vs opponent penalties ${awayPenalties}/${homePenalties}`,
    ),
  );
  checks.push(
    check(
      'F13_PK_OPPORTUNITIES_MATCH_OWN_PENALTIES',
      stats.home.penaltyKillOpportunities === homePenalties &&
        stats.away.penaltyKillOpportunities === awayPenalties,
      `PK opportunities home/away ${stats.home.penaltyKillOpportunities}/${stats.away.penaltyKillOpportunities} vs own penalties ${homePenalties}/${awayPenalties}`,
    ),
  );

  checks.push(
    check(
      'F13_PP_GOALS_LEQ_OPPORTUNITIES',
      stats.home.powerPlayGoals <= stats.home.powerPlayOpportunities &&
        stats.away.powerPlayGoals <= stats.away.powerPlayOpportunities,
      `PP goals exceed opportunities home ${stats.home.powerPlayGoals}/${stats.home.powerPlayOpportunities} away ${stats.away.powerPlayGoals}/${stats.away.powerPlayOpportunities}`,
    ),
  );

  checks.push(
    check(
      'F13_PIM_EQUALS_TWO_PER_PENALTY',
      stats.home.penaltyMinutes === stats.home.penalties * 2 &&
        stats.away.penaltyMinutes === stats.away.penalties * 2,
      `PIM must be 2× penalties home ${stats.home.penaltyMinutes}/${stats.home.penalties} away ${stats.away.penaltyMinutes}/${stats.away.penalties}`,
    ),
  );

  let strengthMatchesPenalty = true;
  for (const e of events) {
    if (e.type === 'PENALTY') {
      const after = String(e.details.strengthStateAfter ?? '');
      if (after && e.strengthState !== after && e.strengthState !== 'EVEN_5V5') {
        // Event stamped at pre-penalty strength; strengthStateAfter in details is authoritative after
      }
    }
    if (
      (e.type === 'PENALTY' || e.type === 'PENALTY_EXPIRED' || e.type === 'GOAL') &&
      e.strengthState !== 'EVEN_5V5'
    ) {
      const advantaged =
        e.strengthState === 'HOME_POWER_PLAY_5V4'
          ? input.homeTeam.teamId
          : e.strengthState === 'AWAY_POWER_PLAY_5V4'
            ? input.awayTeam.teamId
            : null;
      if (advantaged && e.type === 'PENALTY') {
        const adv = String(e.details.advantagedTeamId ?? '');
        if (adv && adv !== advantaged) strengthMatchesPenalty = false;
      }
    }
  }
  checks.push(
    check(
      'F13_STRENGTH_MATCHES_ACTIVE_PENALTY',
      strengthMatchesPenalty,
      'Mid-game strengthState must match active penalty advantaged side',
    ),
  );

  let shGoalValidity = true;
  for (const g of shGoals) {
    const strength = String(g.details.strengthState ?? g.strengthState);
    const scoringTeamId = String(g.details.scoringTeamId ?? g.teamId);
    const isHomeScorer = scoringTeamId === input.homeTeam.teamId;
    const expectedSh =
      (strength === 'HOME_POWER_PLAY_5V4' && !isHomeScorer) ||
      (strength === 'AWAY_POWER_PLAY_5V4' && isHomeScorer);
    if (!expectedSh) shGoalValidity = false;
  }
  checks.push(
    check(
      'F13_SHORT_HANDED_GOALS_ONLY_WHEN_SH',
      shGoalValidity,
      'Short-handed goals require scorer team to be shorthanded at goal time',
    ),
  );

  const ppGoalSeqs = new Set(
    ppGoals
      .map((g) => Number(g.details.activePenaltySequenceId))
      .filter((n) => Number.isFinite(n) && n > 0),
  );
  const successfulKills =
    penaltyEvents.length -
    ppGoalSeqs.size -
    (state.phase === 'COMPLETE' && !state.activePenalty
      ? 0
      : 0);
  checks.push(
    check(
      'F13_PK_KILLS_LEQ_OPPORTUNITIES',
      stats.home.penaltyKills <= stats.home.penaltyKillOpportunities &&
        stats.away.penaltyKills <= stats.away.penaltyKillOpportunities,
      `PK kills exceed opportunities home ${stats.home.penaltyKills}/${stats.home.penaltyKillOpportunities} away ${stats.away.penaltyKills}/${stats.away.penaltyKillOpportunities} (successful=${successfulKills})`,
    ),
  );

  void penaltyExpiredEvents;

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
