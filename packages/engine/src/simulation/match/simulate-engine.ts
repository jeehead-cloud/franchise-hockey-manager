import type { MatchBalanceSection, PenaltiesBalanceSection } from '../../balance/types.js';
import { isF13CompatibleBalanceConfig } from '../../balance/schema.js';
import {
  FHM_ENGINE_VERSION,
  F13_SIMULATION_MODE,
  FORBIDDEN_F14_EVENT_TYPES,
  SNAPSHOT_SCHEMA_VERSION,
} from './constants.js';
import { IllegalStateTransitionError, InvalidSnapshotError, SafetyLimitExceededError } from './errors.js';
import { getMatchConfig, isF14PlayableMatch, validateSimulationInput } from './input.js';
import { computeTraceHash } from './hash.js';
import {
  getPenaltiesConfig,
  maybeAssessPenalty,
  applyPenaltyClock,
  clampTimeCostForPenalty,
  expireActivePenalty,
} from './penalties.js';
import { createRng, nextFloat, nextInt, chance, weightedPick, pick } from './rng.js';
import {
  computeShotOpportunityProbability,
  createShotAttempt,
  resolvePendingShot,
  clamp,
} from './shots.js';
import { reduceStatistics } from './statistics.js';
import { reconcileStatistics } from './reconciliation.js';
import { selectSpecialTeamLines, specialTeamUnitEp } from './special-teams.js';
import { isPowerPlayForSide, isShortHandedForSide } from './strength-state.js';
import {
  buildOvertimeLines,
  overtimePeriodDuration,
  resolveOvertimePossessionAction,
} from './overtime.js';
import { initializeShootoutState, resolveShootoutAttempt } from './shootout.js';
import type {
  ActiveLines,
  FinalMatchResult,
  MatchDecisionType,
  MatchEvent,
  MatchEventType,
  MatchScore,
  MatchSnapshot,
  MatchState,
  PossessionSide,
  PossessionZone,
  SimulationDiagnostics,
  SimulationInput,
  SimulationResult,
  StepMode,
  StepResult,
} from './types.js';

function periodDurationForState(state: MatchState, input: SimulationInput): number {
  if (state.matchSegment === 'OVERTIME') return overtimePeriodDuration(input);
  if (state.matchSegment === 'SHOOTOUT') return 0;
  return input.rules.periodDurationSeconds;
}

function periodRemaining(state: MatchState, input: SimulationInput): number {
  const periodDuration = periodDurationForState(state, input);
  return Math.max(0, periodDuration - state.clockElapsedSeconds);
}

function makeEvent(
  state: MatchState,
  input: SimulationInput,
  type: MatchEventType,
  extra: Partial<MatchEvent> & { details?: Record<string, unknown> },
): MatchEvent {
  const periodDuration = periodDurationForState(state, input);
  return {
    index: state.eventIndex + 1,
    type,
    period: state.period,
    elapsedSeconds: state.clockElapsedSeconds,
    remainingSeconds: periodRemaining(state, input),
    teamId: extra.teamId ?? null,
    playerIds: extra.playerIds ?? [],
    zone: extra.zone ?? state.zone,
    possession: extra.possession ?? state.possession,
    strengthState: state.strengthState,
    shiftNumber: state.currentShift?.shiftNumber ?? null,
    visibility:
      extra.visibility ??
      (type === 'PERIOD_START' ||
      type === 'FACEOFF' ||
      type === 'GOAL' ||
      type === 'SAVE' ||
      type === 'SHOT' ||
      type === 'SHOT_BLOCKED' ||
      type === 'SHOT_MISSED' ||
      type === 'PENALTY' ||
      type === 'PENALTY_EXPIRED' ||
      type === 'OVERTIME_START' ||
      type === 'OVERTIME_END' ||
      type === 'SHOOTOUT_START' ||
      type === 'SHOOTOUT_ATTEMPT' ||
      type === 'SHOOTOUT_END' ||
      type === 'MATCH_END'
        ? 'PUBLIC'
        : 'TECHNICAL'),
    details: extra.details ?? {},
  };
}

function advanceClock(state: MatchState, seconds: number, input: SimulationInput): MatchState {
  const periodDuration = periodDurationForState(state, input);
  const advance = Math.max(0, seconds);
  const elapsed = Math.min(periodDuration, state.clockElapsedSeconds + advance);
  const next = {
    ...state,
    clockElapsedSeconds: elapsed,
    clockRemainingSeconds: Math.max(0, periodDuration - elapsed),
  };
  if (state.matchSegment === 'REGULATION') {
    return applyPenaltyClock(next, elapsed - state.clockElapsedSeconds);
  }
  return next;
}

function teamIdForSide(input: SimulationInput, side: PossessionSide): string | null {
  if (side === 'HOME') return input.homeTeam.teamId;
  if (side === 'AWAY') return input.awayTeam.teamId;
  return null;
}

function unitEp(
  input: SimulationInput,
  side: PossessionSide,
  lines: ActiveLines,
  skater: boolean,
  state: MatchState,
): number {
  const team = side === 'HOME' ? input.homeTeam : input.awayTeam;
  if (skater) {
    if (
      state.activePenalty &&
      isF13CompatibleBalanceConfig(input.balance.snapshot) &&
      (side === 'HOME' || side === 'AWAY')
    ) {
      const lineKey = side === 'HOME' ? lines.homeForwardLineKey : lines.awayForwardLineKey;
      if (lineKey === 'PP' || lineKey === 'PK') {
        return specialTeamUnitEp(
          input,
          side,
          lines,
          lineKey,
          getPenaltiesConfig(input),
        );
      }
    }
    const fk = side === 'HOME' ? lines.homeForwardLineKey : lines.awayForwardLineKey;
    const dk = side === 'HOME' ? lines.homeDefensePairKey : lines.awayDefensePairKey;
    const f = team.forwardLines.find((u) => u.unitKey === fk)?.effectivePerformance ?? 50;
    const d = team.defensePairs.find((u) => u.unitKey === dk)?.effectivePerformance ?? 50;
    return (f + d) / 2;
  }
  return team.starterGoalie.effectivePerformance;
}

function selectLines(input: SimulationInput, state: MatchState, cfg: MatchBalanceSection): { lines: ActiveLines; rng: MatchState['rng'] } {
  if (state.activePenalty && isF13CompatibleBalanceConfig(input.balance.snapshot)) {
    const selected = selectSpecialTeamLines(input, state, getPenaltiesConfig(input));
    return { lines: selected.lines, rng: state.rng };
  }
  let rng = state.rng;
  const pickLine = (team: typeof input.homeTeam, side: 'home' | 'away') => {
    const fk = weightedPick(rng, cfg.forwardLineUsageWeights as Record<string, number>);
    rng = fk.rng;
    const dk = weightedPick(rng, cfg.defensePairUsageWeights as Record<string, number>);
    rng = dk.rng;
    const forward = team.forwardLines.find((u) => u.unitKey === fk.value)!;
    const defense = team.defensePairs.find((u) => u.unitKey === dk.value)!;
    return {
      forwardKey: fk.value,
      defenseKey: dk.value,
      forwardIds: forward.playerIds,
      defenseIds: defense.playerIds,
      goalieId: team.starterGoalie.playerIds[0]!,
    };
  };
  const home = pickLine(input.homeTeam, 'home');
  const away = pickLine(input.awayTeam, 'away');
  return {
    lines: {
      homeForwardLineKey: home.forwardKey,
      homeDefensePairKey: home.defenseKey,
      homeGoalieId: home.goalieId,
      awayForwardLineKey: away.forwardKey,
      awayDefensePairKey: away.defenseKey,
      awayGoalieId: away.goalieId,
      homeForwardPlayerIds: home.forwardIds,
      homeDefensePlayerIds: home.defenseIds,
      awayForwardPlayerIds: away.forwardIds,
      awayDefensePlayerIds: away.defenseIds,
    },
    rng,
  };
}

function centerForFaceoff(input: SimulationInput, side: PossessionSide, lines?: ActiveLines): string | undefined {
  const team = side === 'HOME' ? input.homeTeam : input.awayTeam;
  if (lines) {
    const lineKey = side === 'HOME' ? lines.homeForwardLineKey : lines.awayForwardLineKey;
    const slot = `${lineKey}_C`;
    const assigned = team.lineupAssignments.find((a) => a.slot === slot);
    if (assigned) return assigned.playerId;
  }
  const f1 = team.lineupAssignments.find((a) => a.slot === 'F1_C');
  return f1?.playerId ?? team.players.find((p) => p.primaryPosition === 'C')?.playerId;
}

function faceoffWinner(input: SimulationInput, state: MatchState, cfg: MatchBalanceSection): { side: PossessionSide; rng: MatchState['rng'] } {
  let rng = state.rng;
  const homeCenterId = centerForFaceoff(input, 'HOME', state.currentShift?.lines ?? undefined);
  const awayCenterId = centerForFaceoff(input, 'AWAY', state.currentShift?.lines ?? undefined);
  const homeCenter = input.homeTeam.players.find((p) => p.playerId === homeCenterId);
  const awayCenter = input.awayTeam.players.find((p) => p.playerId === awayCenterId);
  const homeScore = (homeCenter?.currentAbility ?? 50) + (homeCenter?.roleRating ?? 50) * 0.05 + cfg.faceoffHomeAdvantage * 100;
  const awayScore = (awayCenter?.currentAbility ?? 50) + (awayCenter?.roleRating ?? 50) * 0.05;
  const diff = (homeScore - awayScore) / 100;
  const homeProb = Math.min(0.85, Math.max(0.15, 0.5 + diff * 0.35));
  const roll = chance(rng, homeProb);
  rng = roll.rng;
  return { side: roll.value ? 'HOME' : 'AWAY', rng };
}

function boundedCompare(att: number, def: number, homeBonus: number, isHomeAttacking: boolean): number {
  const diff = att - def;
  let p = 0.5 + Math.max(-0.35, Math.min(0.35, diff / 120));
  if (isHomeAttacking) p += homeBonus;
  else p -= homeBonus;
  return Math.min(0.92, Math.max(0.08, p));
}

function possessionCompare(
  attEp: number,
  defEp: number,
  matchCfg: MatchBalanceSection,
  isHomeAttacking: boolean,
  attackingSide: PossessionSide,
  state: MatchState,
  penaltiesCfg: PenaltiesBalanceSection | null,
): number {
  let p = boundedCompare(attEp, defEp, matchCfg.homeIcePossessionBonus, isHomeAttacking);
  if (penaltiesCfg && state.activePenalty && attackingSide !== 'NONE') {
    if (isPowerPlayForSide(state.strengthState, attackingSide)) {
      p = Math.min(0.92, p * (1 + penaltiesCfg.powerPlayPossessionModifier));
    } else if (isShortHandedForSide(state.strengthState, attackingSide)) {
      p = Math.max(0.08, p * (1 + penaltiesCfg.penaltyKillPossessionModifier));
    }
  }
  return p;
}

function contestPressure(zone: PossessionZone): number {
  if (zone === 'OFFENSIVE') return 0.85;
  if (zone === 'NEUTRAL') return 0.5;
  return 0.35;
}

export function createInitialMatchState(input: SimulationInput): MatchState {
  validateSimulationInput(input);
  getMatchConfig(input);
  const periodDuration = input.rules.periodDurationSeconds;
  return {
    engineVersion: FHM_ENGINE_VERSION,
    simulationStatus: 'NOT_STARTED',
    phase: 'AWAITING_MATCH_START',
    period: 1,
    clockElapsedSeconds: 0,
    clockRemainingSeconds: periodDuration,
    score: { home: 0, away: 0 },
    strengthState: 'EVEN_5V5',
    possession: 'NONE',
    zone: null,
    currentShift: null,
    shiftElapsedSeconds: 0,
    eventIndex: 0,
    rng: createRng(input.seed),
    safetyEventsEmitted: 0,
    passChainPlayerIds: [],
    pendingShot: null,
    shotSequenceId: 0,
    activePenalty: null,
    penaltySequenceId: 0,
    lastPenaltyEndedRegulationSeconds: null,
    regulationScore: { home: 0, away: 0 },
    overtimeScore: { home: 0, away: 0 },
    shootoutScore: { home: 0, away: 0 },
    matchSegment: 'REGULATION',
    shootoutState: null,
  };
}

function isMatchComplete(state: MatchState): boolean {
  return state.phase === 'COMPLETE' || state.simulationStatus === 'MATCH_COMPLETE';
}

function winnerSideFromScore(score: MatchScore): 'HOME' | 'AWAY' | null {
  if (score.home > score.away) return 'HOME';
  if (score.away > score.home) return 'AWAY';
  return null;
}

function displayScoreFromState(state: MatchState): MatchScore {
  return {
    home: state.regulationScore.home + state.overtimeScore.home,
    away: state.regulationScore.away + state.overtimeScore.away,
  };
}

export function buildFinalMatchResult(state: MatchState): FinalMatchResult {
  const displayScore = displayScoreFromState(state);
  const regulationTied = state.regulationScore.home === state.regulationScore.away;
  const hasOtGoals = state.overtimeScore.home > 0 || state.overtimeScore.away > 0;
  const shootoutPlayed =
    state.shootoutState != null &&
    (state.shootoutState.homeAttempts > 0 || state.shootoutState.awayAttempts > 0);
  const soWinner = winnerSideFromScore(state.shootoutScore);

  let decisionType: MatchDecisionType = 'REGULATION';
  let winnerSide: 'HOME' | 'AWAY' | null = winnerSideFromScore(displayScore);

  if (shootoutPlayed && displayScore.home === displayScore.away) {
    decisionType = 'SHOOTOUT';
    winnerSide = soWinner;
  } else if (!regulationTied && !hasOtGoals) {
    decisionType = 'REGULATION';
    winnerSide = winnerSideFromScore(state.regulationScore);
  } else if (hasOtGoals && winnerSide != null) {
    decisionType = 'OVERTIME';
  } else if (displayScore.home === displayScore.away) {
    decisionType = 'TIE';
    winnerSide = null;
  }

  return {
    decisionType,
    winnerSide,
    regulationScore: { ...state.regulationScore },
    overtimeScore: { ...state.overtimeScore },
    shootoutScore: { ...state.shootoutScore },
    displayScore,
  };
}

function emit(
  input: SimulationInput,
  state: MatchState,
  events: MatchEvent[],
  type: MatchEventType,
  extra: Partial<MatchEvent> & { details?: Record<string, unknown> } = {},
  timeCost = 0,
): { state: MatchState; events: MatchEvent[] } {
  const cfg = getMatchConfig(input);
  if (state.safetyEventsEmitted >= cfg.eventSafetyLimit) {
    throw new SafetyLimitExceededError(`Event safety limit ${cfg.eventSafetyLimit} exceeded`);
  }
  if (FORBIDDEN_F14_EVENT_TYPES.includes(type as never)) {
    throw new IllegalStateTransitionError(`Forbidden event type ${type}`);
  }
  const ev = makeEvent(state, input, type, extra);
  let next = {
    ...state,
    eventIndex: state.eventIndex + 1,
    safetyEventsEmitted: state.safetyEventsEmitted + 1,
  };
  if (timeCost > 0) {
    const effectiveTimeCost = clampTimeCostForPenalty(state, timeCost);
    next = advanceClock(next, effectiveTimeCost, input);
  }
  return { state: next, events: [...events, ev] };
}

function afterPossessionContest(
  input: SimulationInput,
  result: { state: MatchState; events: MatchEvent[] },
  defendingSide: 'HOME' | 'AWAY',
  pressure: number,
): { state: MatchState; events: MatchEvent[] } {
  const assessed = maybeAssessPenalty(input, result.state, result.events, emit, {
    defendingSide,
    pressure,
  });
  if (assessed.assessed) {
    return { state: assessed.state, events: assessed.events };
  }
  return result;
}

function startShift(input: SimulationInput, state: MatchState, events: MatchEvent[]): { state: MatchState; events: MatchEvent[] } {
  const cfg = getMatchConfig(input);
  const selected = selectLines(input, state, cfg);
  const lines = selected.lines;
  let r = selected.rng;
  const remaining = periodRemaining(state, input);
  const plannedRoll = nextInt(r, cfg.minimumShiftSeconds, cfg.maximumShiftSeconds);
  r = plannedRoll.rng;
  const planned = Math.min(remaining, plannedRoll.value);
  const shiftNumber = (state.currentShift?.shiftNumber ?? 0) + 1;
  const shift = {
    shiftNumber,
    startElapsedSeconds: state.clockElapsedSeconds,
    plannedDurationSeconds: planned,
    lines,
  };
  let s: MatchState = { ...state, rng: r, currentShift: shift, shiftElapsedSeconds: 0, phase: 'IN_SHIFT', simulationStatus: 'IN_PROGRESS' };
  const out = emit(input, s, events, 'SHIFT_START', {
    details: {
      lines,
      plannedDurationSeconds: planned,
      strengthState: s.strengthState,
      activePenaltySequenceId: s.activePenalty?.penaltySequenceId ?? null,
    },
    playerIds: [
      ...lines.homeForwardPlayerIds,
      ...lines.homeDefensePlayerIds,
      ...lines.awayForwardPlayerIds,
      ...lines.awayDefensePlayerIds,
      lines.homeGoalieId,
      lines.awayGoalieId,
    ],
  });
  s = out.state;
  return { state: s, events: out.events };
}

function startOvertimeShift(
  input: SimulationInput,
  state: MatchState,
  events: MatchEvent[],
): { state: MatchState; events: MatchEvent[] } {
  const cfg = getMatchConfig(input);
  const unitIndex = state.currentShift?.shiftNumber ?? 0;
  const lines = buildOvertimeLines(input, unitIndex);
  const remaining = periodRemaining(state, input);
  const plannedRoll = nextInt(state.rng, cfg.minimumShiftSeconds, cfg.maximumShiftSeconds);
  const planned = Math.min(remaining, plannedRoll.value);
  const shiftNumber = (state.currentShift?.shiftNumber ?? 0) + 1;
  const shift = {
    shiftNumber,
    startElapsedSeconds: state.clockElapsedSeconds,
    plannedDurationSeconds: planned,
    lines,
  };
  let s: MatchState = {
    ...state,
    rng: plannedRoll.rng,
    currentShift: shift,
    shiftElapsedSeconds: 0,
    phase: 'IN_OVERTIME',
    simulationStatus: 'IN_PROGRESS',
    strengthState: 'EVEN_3V3',
  };
  const out = emit(input, s, events, 'SHIFT_START', {
    details: {
      lines,
      plannedDurationSeconds: planned,
      strengthState: 'EVEN_3V3',
      segment: 'OVERTIME',
    },
    playerIds: [
      ...lines.homeForwardPlayerIds,
      ...lines.homeDefensePlayerIds,
      ...lines.awayForwardPlayerIds,
      ...lines.awayDefensePlayerIds,
      lines.homeGoalieId,
      lines.awayGoalieId,
    ],
  });
  return { state: out.state, events: out.events };
}

function beginShootout(
  input: SimulationInput,
  state: MatchState,
  events: MatchEvent[],
): { state: MatchState; events: MatchEvent[] } {
  const soStart = emit(input, state, events, 'SHOOTOUT_START', {
    visibility: 'PUBLIC',
    details: { initialRounds: input.balance.snapshot.matchCompletion?.active ? input.balance.snapshot.matchCompletion.shootout.initialRounds : 3 },
  });
  return {
    state: {
      ...soStart.state,
      phase: 'IN_SHOOTOUT',
      matchSegment: 'SHOOTOUT',
      shootoutState: initializeShootoutState(input),
      currentShift: null,
      possession: 'NONE',
      zone: null,
    },
    events: soStart.events,
  };
}

function finishMatch(
  input: SimulationInput,
  state: MatchState,
  events: MatchEvent[],
  emitShootoutEnd: boolean,
): { state: MatchState; events: MatchEvent[]; completed: boolean } {
  let s = state;
  let evts = events;
  if (emitShootoutEnd) {
    const soEnd = emit(input, s, evts, 'SHOOTOUT_END', {
      visibility: 'PUBLIC',
      details: { shootoutScore: s.shootoutScore },
    });
    s = soEnd.state;
    evts = soEnd.events;
  }
  const finalResult = buildFinalMatchResult(s);
  const matchEnd = emit(input, s, evts, 'MATCH_END', {
    visibility: 'PUBLIC',
    details: {
      decisionType: finalResult.decisionType,
      winnerSide: finalResult.winnerSide,
      regulationScore: finalResult.regulationScore,
      overtimeScore: finalResult.overtimeScore,
      shootoutScore: finalResult.shootoutScore,
      displayScore: finalResult.displayScore,
      score: finalResult.displayScore,
    },
  });
  s = {
    ...matchEnd.state,
    phase: 'COMPLETE',
    simulationStatus: 'MATCH_COMPLETE',
    matchSegment: 'COMPLETE',
  };
  return { state: s, events: matchEnd.events, completed: true };
}

function resolvePossessionAction(input: SimulationInput, state: MatchState, events: MatchEvent[]): { state: MatchState; events: MatchEvent[] } {
  const cfg = getMatchConfig(input);
  if (!state.currentShift || state.possession === 'NONE' || !state.zone) {
    throw new IllegalStateTransitionError('Cannot resolve possession without active shift/possession/zone');
  }
  const lines = state.currentShift.lines;
  const atk = state.possession;
  const def: PossessionSide = atk === 'HOME' ? 'AWAY' : 'HOME';
  const attEp = unitEp(input, atk, lines, true, state);
  const defEp = unitEp(input, def, lines, true, state);
  const isHomeAttacking = atk === 'HOME';
  const penaltiesCfg = isF13CompatibleBalanceConfig(input.balance.snapshot)
    ? input.balance.snapshot.penalties
    : null;
  let rng = state.rng;
  const z = cfg.zoneTransitionWeights;
  const durationRoll = nextInt(rng, cfg.minimumPossessionSeconds, cfg.maximumPossessionSeconds);
  rng = durationRoll.rng;
  let timeCost = Math.min(durationRoll.value, periodRemaining(state, input));

  if (state.zone === 'NEUTRAL') {
    const p =
      possessionCompare(attEp, defEp, cfg, isHomeAttacking, atk, state, penaltiesCfg) * z.neutralZoneEntry;
    const roll = chance(rng, p);
    rng = roll.rng;
    if (roll.value) {
      let s = { ...state, rng, zone: 'OFFENSIVE' as PossessionZone, possession: atk };
      const out = emit(input, s, events, 'ZONE_ENTRY', { teamId: teamIdForSide(input, atk), zone: 'OFFENSIVE', possession: atk }, timeCost);
      return afterPossessionContest(input, { state: out.state, events: out.events }, def, contestPressure('NEUTRAL'));
    }
    const s = { ...state, rng, possession: def, zone: 'OFFENSIVE' as PossessionZone };
    const out = emit(input, s, events, 'TURNOVER', { teamId: teamIdForSide(input, def), zone: 'OFFENSIVE', possession: def }, timeCost);
    return afterPossessionContest(input, { state: out.state, events: out.events }, def, contestPressure('NEUTRAL'));
  }

  if (state.zone === 'DEFENSIVE') {
    const p =
      possessionCompare(attEp, defEp, cfg, isHomeAttacking, atk, state, penaltiesCfg) * z.defensiveZoneExit;
    const roll = chance(rng, p);
    rng = roll.rng;
    if (roll.value) {
      let s = { ...state, rng, zone: 'NEUTRAL' as PossessionZone, possession: atk };
      const out = emit(input, s, events, 'ZONE_EXIT', { teamId: teamIdForSide(input, atk), zone: 'NEUTRAL', possession: atk }, timeCost);
      return { state: out.state, events: out.events };
    }
    const s = { ...state, rng, possession: def, zone: 'DEFENSIVE' as PossessionZone };
    const out = emit(input, s, events, 'TURNOVER', { teamId: teamIdForSide(input, def), zone: 'DEFENSIVE', possession: def }, timeCost);
    return afterPossessionContest(input, { state: out.state, events: out.events }, def, contestPressure('DEFENSIVE'));
  }

  // OFFENSIVE
  if (isF13CompatibleBalanceConfig(input.balance.snapshot)) {
    const matchCfg = input.balance.snapshot.match;
    let shotOppP = computeShotOpportunityProbability(
      attEp,
      defEp,
      matchCfg,
      input.balance.snapshot.shots,
    );
    if (penaltiesCfg) {
      if (isPowerPlayForSide(state.strengthState, atk)) {
        shotOppP *= 1 + penaltiesCfg.powerPlayShotOpportunityModifier;
      } else if (isShortHandedForSide(state.strengthState, atk)) {
        shotOppP *= 1 + penaltiesCfg.shortHandedShotOpportunityModifier;
      }
      shotOppP = clamp(shotOppP, 0.05, 0.75);
    }
    const continuedP = matchCfg.offensiveZoneContinuedPossessionProbability;
    const turnoverP = cfg.turnoverBaseProbability * z.offensiveTurnover;
    const stoppageP = z.offensiveStoppage;
    const roll = nextFloat(rng);
    rng = roll.rng;
    const r = roll.value;
    let s = advanceClock({ ...state, rng }, timeCost, input);

    if (r < shotOppP) {
      return createShotAttempt(input, s, events);
    }
    if (r < shotOppP + turnoverP) {
      const next = {
        ...s,
        possession: def,
        zone: 'DEFENSIVE' as PossessionZone,
        passChainPlayerIds: [],
      };
      const out = emit(
        input,
        next,
        events,
        'TURNOVER',
        { teamId: teamIdForSide(input, def), zone: 'DEFENSIVE', possession: def },
        0,
      );
      return afterPossessionContest(
        input,
        { state: out.state, events: out.events },
        def,
        contestPressure('OFFENSIVE'),
      );
    }
    if (r < shotOppP + turnoverP + stoppageP) {
      const next = {
        ...s,
        possession: 'NONE' as PossessionSide,
        zone: null,
        passChainPlayerIds: [],
        phase: 'AWAITING_STOPPAGE_FACEOFF' as const,
      };
      const out = emit(
        input,
        next,
        events,
        'STOPPAGE',
        { teamId: teamIdForSide(input, atk), details: { reason: 'PUCK_FROZEN' } },
        0,
      );
      return { state: out.state, events: out.events };
    }
    if (r < shotOppP + turnoverP + stoppageP + continuedP) {
      const attackingIds =
        atk === 'HOME'
          ? [...lines.homeForwardPlayerIds, ...lines.homeDefensePlayerIds]
          : [...lines.awayForwardPlayerIds, ...lines.awayDefensePlayerIds];
      let chain = [...state.passChainPlayerIds];
      if (attackingIds.length > 0) {
        const passer = pick(rng, attackingIds);
        rng = passer.rng;
        chain = [...chain, passer.value].slice(-2);
      }
      const next = { ...s, rng, passChainPlayerIds: chain, zone: 'OFFENSIVE' as PossessionZone, possession: atk };
      const out = emit(
        input,
        next,
        events,
        'POSSESSION_GAIN',
        { teamId: teamIdForSide(input, atk), zone: 'OFFENSIVE', possession: atk },
        0,
      );
      return { state: out.state, events: out.events };
    }
    const next = { ...s, zone: 'OFFENSIVE' as PossessionZone, possession: atk };
    const out = emit(
      input,
      next,
      events,
      'POSSESSION_GAIN',
      { teamId: teamIdForSide(input, atk), zone: 'OFFENSIVE', possession: atk },
      0,
    );
    return { state: out.state, events: out.events };
  }

  const turnoverP = cfg.turnoverBaseProbability * z.offensiveTurnover;
  const stoppageP = z.offensiveStoppage;
  const roll = nextFloat(rng);
  rng = roll.rng;
  if (roll.value < turnoverP) {
    const s = { ...state, rng, possession: def, zone: 'DEFENSIVE' as PossessionZone };
    const out = emit(input, s, events, 'TURNOVER', { teamId: teamIdForSide(input, def), zone: 'DEFENSIVE', possession: def }, timeCost);
    return afterPossessionContest(
      input,
      { state: out.state, events: out.events },
      def,
      contestPressure('OFFENSIVE'),
    );
  }
  if (roll.value < turnoverP + stoppageP) {
    const s = { ...state, rng, possession: 'NONE' as PossessionSide, zone: null, phase: 'AWAITING_STOPPAGE_FACEOFF' as const };
    const out = emit(input, s, events, 'STOPPAGE', { teamId: teamIdForSide(input, atk), details: { reason: 'PUCK_FROZEN' } }, timeCost);
    return { state: out.state, events: out.events };
  }
  const s = { ...state, rng, zone: 'OFFENSIVE' as PossessionZone, possession: atk };
  const out = emit(input, s, events, 'POSSESSION_GAIN', { teamId: teamIdForSide(input, atk), zone: 'OFFENSIVE', possession: atk }, timeCost);
  return { state: out.state, events: out.events };
}

export function simulateNextEvent(input: SimulationInput, state: MatchState, existingEvents: MatchEvent[] = []): {
  state: MatchState;
  events: MatchEvent[];
  completed: boolean;
} {
  validateSimulationInput(input);
  const cfg = getMatchConfig(input);
  if (isMatchComplete(state)) {
    return { state, events: [], completed: true };
  }

  let s = state;
  let events = [...existingEvents];

  switch (s.phase) {
    case 'AWAITING_MATCH_START': {
      const out = emit(input, s, events, 'MATCH_START', { visibility: 'PUBLIC' });
      s = { ...out.state, phase: 'AWAITING_PERIOD_START', simulationStatus: 'IN_PROGRESS' };
      events = out.events;
      break;
    }
    case 'AWAITING_PERIOD_START': {
      const out = emit(input, s, events, 'PERIOD_START', { visibility: 'PUBLIC', details: { period: s.period } });
      s = { ...out.state, phase: 'AWAITING_FACEOFF', clockElapsedSeconds: 0, clockRemainingSeconds: cfg.periodDurationSeconds };
      events = out.events;
      break;
    }
    case 'AWAITING_FACEOFF': {
      const { side, rng } = faceoffWinner(input, s, cfg);
      s = { ...s, rng, possession: side, zone: 'NEUTRAL' };
      const centerId = centerForFaceoff(input, side);
      const out = emit(input, s, events, 'FACEOFF', {
        teamId: teamIdForSide(input, side),
        playerIds: centerId ? [centerId] : [],
        zone: 'NEUTRAL',
        possession: side,
        visibility: 'PUBLIC',
      }, cfg.stoppageSeconds);
      s = out.state;
      events = out.events;
      const shiftStart =
        s.matchSegment === 'OVERTIME' ? startOvertimeShift(input, s, events) : startShift(input, s, events);
      s = shiftStart.state;
      events = shiftStart.events;
      const pg = emit(input, s, events, 'POSSESSION_GAIN', { teamId: teamIdForSide(input, side), zone: 'NEUTRAL', possession: side }, 0);
      s = pg.state;
      events = pg.events;
      break;
    }
    case 'AWAITING_STOPPAGE_FACEOFF': {
      const { side, rng } = faceoffWinner(input, s, cfg);
      const resumePhase = s.matchSegment === 'OVERTIME' ? ('IN_OVERTIME' as const) : ('IN_SHIFT' as const);
      s = { ...s, rng, possession: side, zone: 'NEUTRAL', phase: resumePhase };
      const centerId = centerForFaceoff(input, side, s.currentShift?.lines);
      const out = emit(input, s, events, 'FACEOFF', {
        teamId: teamIdForSide(input, side),
        playerIds: centerId ? [centerId] : [],
        zone: 'NEUTRAL',
        possession: side,
        visibility: 'PUBLIC',
      }, cfg.stoppageSeconds);
      s = out.state;
      events = out.events;
      if (!s.currentShift) {
        const shiftStart =
          s.matchSegment === 'OVERTIME' ? startOvertimeShift(input, s, events) : startShift(input, s, events);
        s = shiftStart.state;
        events = shiftStart.events;
      }
      const pg = emit(input, s, events, 'POSSESSION_GAIN', { teamId: teamIdForSide(input, side), zone: 'NEUTRAL', possession: side }, 0);
      s = pg.state;
      events = pg.events;
      break;
    }
    case 'IN_SHIFT': {
      if (s.clockElapsedSeconds >= cfg.periodDurationSeconds) {
        s = { ...s, phase: 'AWAITING_PERIOD_END' };
        break;
      }
      if (s.pendingShot) {
        const resolved = resolvePendingShot(input, s, events);
        s = resolved.state;
        events = resolved.events;
        break;
      }
      if (s.activePenalty && s.activePenalty.remainingSeconds <= 0) {
        const expired = expireActivePenalty(input, s, events, 'EXPIRED', emit);
        s = expired.state;
        events = expired.events;
        break;
      }
      const shift = s.currentShift!;
      const shiftDuration = s.clockElapsedSeconds - shift.startElapsedSeconds;
      if (shiftDuration >= shift.plannedDurationSeconds) {
        const out = emit(input, s, events, 'SHIFT_END', { details: { durationSeconds: shiftDuration } });
        s = { ...out.state, currentShift: null, shiftElapsedSeconds: 0 };
        events = out.events;
        if (periodRemaining(s, input) <= 0) {
          s = { ...s, phase: 'AWAITING_PERIOD_END' };
        } else {
          s = { ...s, phase: 'AWAITING_FACEOFF', possession: 'NONE', zone: null };
        }
        break;
      }
      const resolved = resolvePossessionAction(input, s, events);
      s = resolved.state;
      events = resolved.events;
      if (s.phase === 'AWAITING_STOPPAGE_FACEOFF') break;
      break;
    }
    case 'IN_OVERTIME': {
      const otDuration = overtimePeriodDuration(input);
      if (s.clockElapsedSeconds >= otDuration) {
        s = { ...s, phase: 'AWAITING_OVERTIME_END' };
        break;
      }
      if (s.pendingShot) {
        const resolved = resolvePendingShot(input, s, events);
        s = resolved.state;
        events = resolved.events;
        break;
      }
      const shift = s.currentShift!;
      const shiftDuration = s.clockElapsedSeconds - shift.startElapsedSeconds;
      if (shiftDuration >= shift.plannedDurationSeconds) {
        const out = emit(input, s, events, 'SHIFT_END', { details: { durationSeconds: shiftDuration, segment: 'OVERTIME' } });
        s = { ...out.state, currentShift: null, shiftElapsedSeconds: 0 };
        events = out.events;
        if (periodRemaining(s, input) <= 0) {
          s = { ...s, phase: 'AWAITING_OVERTIME_END' };
        } else {
          s = { ...s, phase: 'AWAITING_FACEOFF', possession: 'NONE', zone: null };
        }
        break;
      }
      const resolved = resolveOvertimePossessionAction(input, s, events, emit, cfg);
      s = resolved.state;
      events = resolved.events;
      if (s.phase === 'AWAITING_STOPPAGE_FACEOFF' || s.phase === 'AWAITING_OVERTIME_END') break;
      break;
    }
    case 'AWAITING_PERIOD_END': {
      const out = emit(input, s, events, 'PERIOD_END', { visibility: 'PUBLIC' });
      s = { ...out.state, simulationStatus: 'PERIOD_COMPLETE' as const, possession: 'NONE', zone: null, currentShift: null };
      events = out.events;
      if (s.period >= cfg.regulationPeriods) {
        s = { ...s, phase: 'AWAITING_REGULATION_END' };
      } else {
        s = { ...s, period: s.period + 1, phase: 'AWAITING_PERIOD_START', simulationStatus: 'IN_PROGRESS' as const };
      }
      break;
    }
    case 'AWAITING_REGULATION_END': {
      const openPenalty = s.activePenalty;
      const regulationDetails: Record<string, unknown> = { score: s.score };
      if (openPenalty && !openPenalty.powerPlayGoalScored) {
        regulationDetails.openPenaltyResolvedAsKill = true;
        regulationDetails.openPenaltySequenceId = openPenalty.penaltySequenceId;
      }
      const out = emit(input, s, events, 'REGULATION_END', {
        visibility: 'PUBLIC',
        details: regulationDetails,
      });
      const clearedPenalty = openPenalty && !openPenalty.powerPlayGoalScored;
      if (isF14PlayableMatch(input)) {
        s = {
          ...out.state,
          phase: 'AWAITING_POST_REGULATION',
          simulationStatus: 'REGULATION_COMPLETE',
          regulationScore: { ...s.score },
          activePenalty: clearedPenalty ? null : s.activePenalty,
          strengthState: clearedPenalty ? 'EVEN_5V5' : s.strengthState,
        };
        events = out.events;
        break;
      }
      s = {
        ...out.state,
        phase: 'COMPLETE',
        simulationStatus: 'REGULATION_COMPLETE',
        regulationScore: { ...s.score },
        matchSegment: 'COMPLETE',
        activePenalty: clearedPenalty ? null : s.activePenalty,
        strengthState: clearedPenalty ? 'EVEN_5V5' : s.strengthState,
      };
      events = out.events;
      return { state: s, events, completed: true };
    }
    case 'AWAITING_POST_REGULATION': {
      const rules = input.completionRules!;
      const completion = input.balance.snapshot.matchCompletion;
      const tied = s.score.home === s.score.away;
      if (!tied) {
        const done = finishMatch(input, s, events, false);
        return done;
      }
      if (
        rules.overtimeEnabled &&
        completion?.active === true &&
        completion.overtime.enabled
      ) {
        const otDuration = overtimePeriodDuration(input);
        const otStart = emit(input, s, events, 'OVERTIME_START', {
          visibility: 'PUBLIC',
          details: { durationSeconds: otDuration, score: s.score },
        });
        s = {
          ...otStart.state,
          phase: 'AWAITING_FACEOFF',
          period: 4,
          clockElapsedSeconds: 0,
          clockRemainingSeconds: otDuration,
          strengthState: 'EVEN_3V3',
          matchSegment: 'OVERTIME',
          activePenalty: null,
          currentShift: null,
          possession: 'NONE',
          zone: null,
        };
        events = otStart.events;
        break;
      }
      if (
        rules.shootoutEnabled &&
        completion?.active === true &&
        completion.shootout.enabled
      ) {
        const started = beginShootout(input, s, events);
        s = started.state;
        events = started.events;
        break;
      }
      if (rules.tiesAllowed) {
        const done = finishMatch(input, s, events, false);
        return done;
      }
      throw new IllegalStateTransitionError('Tied regulation with no overtime, shootout, or tiesAllowed');
    }
    case 'AWAITING_OVERTIME_END': {
      const otEnd = emit(input, s, events, 'OVERTIME_END', {
        visibility: 'PUBLIC',
        details: { overtimeScore: s.overtimeScore, score: s.score },
      });
      s = otEnd.state;
      events = otEnd.events;
      if (s.score.home !== s.score.away) {
        return finishMatch(input, s, events, false);
      }
      const rules = input.completionRules!;
      const completion = input.balance.snapshot.matchCompletion;
      if (
        rules.shootoutEnabled &&
        completion?.active === true &&
        completion.shootout.enabled
      ) {
        const started = beginShootout(input, s, events);
        s = started.state;
        events = started.events;
        break;
      }
      if (rules.tiesAllowed) {
        return finishMatch(input, s, events, false);
      }
      throw new IllegalStateTransitionError('Tied after overtime with no shootout or tiesAllowed');
    }
    case 'IN_SHOOTOUT': {
      const attempt = resolveShootoutAttempt(input, s, events, emit);
      s = attempt.state;
      events = attempt.events;
      if (s.phase === 'AWAITING_MATCH_END') {
        return finishMatch(input, s, events, true);
      }
      break;
    }
    case 'AWAITING_MATCH_END': {
      return finishMatch(input, s, events, s.matchSegment === 'SHOOTOUT');
    }
    default:
      throw new IllegalStateTransitionError(`Unsupported phase ${s.phase}`);
  }

  const completed = isMatchComplete(s);
  return { state: s, events, completed };
}

export function simulateUntil(
  input: SimulationInput,
  state: MatchState,
  existingEvents: MatchEvent[],
  stopWhen: (s: MatchState) => boolean,
  maxSteps = 20000,
): { state: MatchState; events: MatchEvent[]; completed: boolean } {
  let s = state;
  let events = [...existingEvents];
  let steps = 0;
  while (!stopWhen(s) && steps < maxSteps) {
    const step = simulateNextEvent(input, s, events);
    s = step.state;
    events = step.events;
    steps += 1;
    if (step.completed) break;
  }
  return { state: s, events, completed: isMatchComplete(s) };
}

export function simulateRegulation(input: SimulationInput): SimulationResult {
  validateSimulationInput(input);
  if (input.simulationMode !== F13_SIMULATION_MODE) {
    throw new IllegalStateTransitionError(
      `simulateRegulation requires ${F13_SIMULATION_MODE} (use simulateCompleteMatch for F14)`,
    );
  }
  let state = createInitialMatchState(input);
  let events: MatchEvent[] = [];
  const cfg = getMatchConfig(input);
  while (state.phase !== 'COMPLETE' && state.safetyEventsEmitted < cfg.eventSafetyLimit) {
    const step = simulateNextEvent(input, state, events);
    state = step.state;
    events = step.events;
    if (step.completed) break;
  }
  if (state.phase !== 'COMPLETE') {
    throw new SafetyLimitExceededError('Regulation simulation did not complete before safety limit');
  }
  const statistics = reduceStatistics(input, events, state);
  const reconciliation = reconcileStatistics(input, events, state, statistics);
  const diagnostics = computeDiagnostics(input, events, state, false, reconciliation.ok);
  return {
    metadata: {
      engineVersion: FHM_ENGINE_VERSION,
      simulationMode: input.simulationMode,
      balancePresetId: input.balance.presetId,
      balanceVersionId: input.balance.versionId,
      balanceVersionNumber: input.balance.versionNumber,
      balanceHash: input.balance.configHash,
      seed: input.seed,
      inputFingerprint: input.inputFingerprint,
    },
    finalState: state,
    events,
    diagnostics,
    statistics,
    reconciliation,
    periodScores: statistics.periodScores,
  };
}

export function simulateCompleteMatch(
  input: SimulationInput,
): SimulationResult & { finalResult: FinalMatchResult } {
  validateSimulationInput(input);
  if (!isF14PlayableMatch(input)) {
    throw new IllegalStateTransitionError('simulateCompleteMatch requires F14_PLAYABLE_MATCH mode');
  }
  let state = createInitialMatchState(input);
  let events: MatchEvent[] = [];
  const cfg = getMatchConfig(input);
  while (!isMatchComplete(state) && state.safetyEventsEmitted < cfg.eventSafetyLimit) {
    const step = simulateNextEvent(input, state, events);
    state = step.state;
    events = step.events;
    if (step.completed) break;
  }
  if (!isMatchComplete(state)) {
    throw new SafetyLimitExceededError('Complete match simulation did not finish before safety limit');
  }
  const statistics = reduceStatistics(input, events, state);
  const reconciliation = reconcileStatistics(input, events, state, statistics);
  const diagnostics = computeDiagnostics(input, events, state, false, reconciliation.ok);
  const finalResult = buildFinalMatchResult(state);
  return {
    metadata: {
      engineVersion: FHM_ENGINE_VERSION,
      simulationMode: input.simulationMode,
      balancePresetId: input.balance.presetId,
      balanceVersionId: input.balance.versionId,
      balanceVersionNumber: input.balance.versionNumber,
      balanceHash: input.balance.configHash,
      seed: input.seed,
      inputFingerprint: input.inputFingerprint,
    },
    finalState: state,
    events,
    diagnostics,
    statistics,
    reconciliation,
    periodScores: statistics.periodScores,
    finalResult,
  };
}

export function simulateStep(
  input: SimulationInput,
  snapshot: MatchSnapshot | null,
  mode: StepMode,
): StepResult {
  validateSimulationInput(input);
  let state: MatchState;
  let events: MatchEvent[];
  if (snapshot) {
    const restored = restoreMatchSnapshot(snapshot, input);
    state = restored.state;
    events = restored.events;
  } else {
    state = createInitialMatchState(input);
    events = [];
  }

  const stopWhen = (s: MatchState): boolean => {
    if (mode === 'NEXT_EVENT') return false;
    if (mode === 'NEXT_SHIFT') return s.phase === 'AWAITING_FACEOFF' || s.phase === 'AWAITING_STOPPAGE_FACEOFF' || s.phase === 'AWAITING_PERIOD_END' || s.phase === 'COMPLETE';
    if (mode === 'END_PERIOD') return s.phase === 'AWAITING_PERIOD_START' && s.period > state.period || s.phase === 'AWAITING_REGULATION_END' || s.phase === 'COMPLETE';
    if (mode === 'END_REGULATION') return s.phase === 'COMPLETE';
    return false;
  };

  if (mode === 'NEXT_EVENT') {
    const beforeLen = events.length;
    const step = simulateNextEvent(input, state, events);
    const snap = serializeMatchSnapshot(input, step.state, step.events);
    return {
      state: step.state,
      events: step.events.slice(beforeLen),
      snapshot: snap,
      diagnostics: computeDiagnostics(input, step.events, step.state, false),
      completed: step.completed,
    };
  }

  const beforeLen = events.length;
  const run = simulateUntil(input, state, events, stopWhen);
  const newEvents = run.events.slice(beforeLen);
  const snap = serializeMatchSnapshot(input, run.state, run.events);
  return {
    state: run.state,
    events: newEvents,
    snapshot: snap,
    diagnostics: computeDiagnostics(input, run.events, run.state, false),
    completed: isMatchComplete(run.state),
  };
}

export function computeDiagnostics(
  input: SimulationInput,
  events: MatchEvent[],
  state: MatchState,
  safetyLimitHit: boolean,
  reconciliationOk: boolean | null = null,
): SimulationDiagnostics {
  const eventsByType: Record<string, number> = {};
  const shiftsByTeamLine: Record<string, number> = {};
  const possessionSecondsByTeam = { home: 0, away: 0, none: 0 };
  const zoneSecondsByTeam: Record<string, { defensive: number; neutral: number; offensive: number }> = {
    [input.homeTeam.teamId]: { defensive: 0, neutral: 0, offensive: 0 },
    [input.awayTeam.teamId]: { defensive: 0, neutral: 0, offensive: 0 },
  };
  const turnoversByTeam = { home: 0, away: 0 };
  let stoppages = 0;
  const faceoffWins = { home: 0, away: 0 };

  let prevElapsed = 0;
  let prevPossession: PossessionSide = 'NONE';
  for (const e of events) {
    eventsByType[e.type] = (eventsByType[e.type] ?? 0) + 1;
    const delta = Math.max(0, e.elapsedSeconds - prevElapsed);
    if (prevPossession === 'HOME') possessionSecondsByTeam.home += delta;
    else if (prevPossession === 'AWAY') possessionSecondsByTeam.away += delta;
    else possessionSecondsByTeam.none += delta;
    prevElapsed = e.elapsedSeconds;
    prevPossession = e.possession;

    if (e.type === 'SHIFT_START' && e.details.lines) {
      const lines = e.details.lines as ActiveLines;
      shiftsByTeamLine[`${input.homeTeam.teamId}:${lines.homeForwardLineKey}`] =
        (shiftsByTeamLine[`${input.homeTeam.teamId}:${lines.homeForwardLineKey}`] ?? 0) + 1;
      shiftsByTeamLine[`${input.awayTeam.teamId}:${lines.awayForwardLineKey}`] =
        (shiftsByTeamLine[`${input.awayTeam.teamId}:${lines.awayForwardLineKey}`] ?? 0) + 1;
    }
    if (e.type === 'TURNOVER') {
      if (e.teamId === input.homeTeam.teamId) turnoversByTeam.home += 1;
      if (e.teamId === input.awayTeam.teamId) turnoversByTeam.away += 1;
    }
    if (e.type === 'STOPPAGE') stoppages += 1;
    if (e.type === 'FACEOFF' && e.teamId === input.homeTeam.teamId) faceoffWins.home += 1;
    if (e.type === 'FACEOFF' && e.teamId === input.awayTeam.teamId) faceoffWins.away += 1;
  }

  const shotAttempts = events.filter((e) => e.type === 'SHOT').length;
  const shotsBlocked = events.filter((e) => e.type === 'SHOT_BLOCKED').length;
  const shotsMissed = events.filter((e) => e.type === 'SHOT_MISSED').length;
  const shotsOnGoal = events.filter((e) => e.type === 'SAVE' || e.type === 'GOAL').length;
  const saves = events.filter((e) => e.type === 'SAVE').length;
  const goals = events.filter((e) => e.type === 'GOAL').length;
  const shotTypes: Record<string, number> = {};
  const shotsByPeriod: Record<number, number> = {};
  const goalsByPeriod: Record<number, number> = {};
  let qualitySum = 0;
  let qualityCount = 0;
  for (const e of events) {
    if (e.type === 'SHOT') {
      const st = String(e.details.shotType ?? 'UNKNOWN');
      shotTypes[st] = (shotTypes[st] ?? 0) + 1;
      shotsByPeriod[e.period] = (shotsByPeriod[e.period] ?? 0) + 1;
      const q = e.details.shotQuality;
      if (typeof q === 'number') {
        qualitySum += q;
        qualityCount += 1;
      }
    }
    if (e.type === 'GOAL') {
      goalsByPeriod[e.period] = (goalsByPeriod[e.period] ?? 0) + 1;
    }
  }
  const stats = reduceStatistics(input, events, state);
  const topShooters = stats.skaters
    .filter((s) => s.shotsOnGoal > 0 || s.goals > 0)
    .sort((a, b) => b.goals - a.goals || b.shotsOnGoal - a.shotsOnGoal)
    .slice(0, 5)
    .map((s) => ({ playerId: s.playerId, shotsOnGoal: s.shotsOnGoal, goals: s.goals }));

  const penaltyEvents = events.filter((e) => e.type === 'PENALTY');
  const penaltiesByInfraction: Record<string, number> = {};
  for (const p of penaltyEvents) {
    const inf = String(p.details.infraction ?? 'UNKNOWN');
    penaltiesByInfraction[inf] = (penaltiesByInfraction[inf] ?? 0) + 1;
  }
  const ppGoals = events.filter(
    (e) => e.type === 'GOAL' && e.details.goalStrength === 'POWER_PLAY',
  ).length;
  const shGoals = events.filter(
    (e) => e.type === 'GOAL' && e.details.goalStrength === 'SHORT_HANDED',
  ).length;
  const evenStrengthGoals = goals - ppGoals - shGoals;
  const ppOpportunities = stats.home.powerPlayOpportunities + stats.away.powerPlayOpportunities;
  const totalPpGoals = stats.home.powerPlayGoals + stats.away.powerPlayGoals;

  return {
    totalEvents: events.length,
    eventsByType,
    shiftsByTeamLine,
    possessionSecondsByTeam,
    zoneSecondsByTeam,
    turnoversByTeam,
    stoppages,
    faceoffWins,
    regulationDurationSeconds: input.rules.regulationPeriods * input.rules.periodDurationSeconds,
    safetyLimitHit,
    traceHash: computeTraceHash(events),
    shotAttempts,
    shotsBlocked,
    shotsMissed,
    shotsOnGoal,
    saves,
    goals,
    shootingPercentage: shotsOnGoal > 0 ? goals / shotsOnGoal : 0,
    savePercentage: shotsOnGoal > 0 ? saves / shotsOnGoal : 0,
    shotsByPeriod,
    goalsByPeriod,
    shotTypes,
    averageShotQuality: qualityCount > 0 ? qualitySum / qualityCount : 0,
    topShooters,
    goalieSummaries: stats.goalies.map((g) => ({
      playerId: g.playerId,
      shotsAgainst: g.shotsAgainst,
      saves: g.saves,
      goalsAgainst: g.goalsAgainst,
      savePercentage: g.savePercentage,
    })),
    reconciliationOk,
    penalties: penaltyEvents.length,
    powerPlayOpportunities: ppOpportunities,
    powerPlayGoals: totalPpGoals,
    powerPlayPercentage: ppOpportunities > 0 ? totalPpGoals / ppOpportunities : 0,
    shortHandedGoals: shGoals,
    penaltiesByInfraction,
    evenStrengthGoals,
  };
}

export function serializeMatchSnapshot(
  input: SimulationInput,
  state: MatchState,
  events: MatchEvent[],
): MatchSnapshot {
  return {
    schemaVersion: SNAPSHOT_SCHEMA_VERSION,
    engineVersion: FHM_ENGINE_VERSION,
    simulationMode: input.simulationMode,
    inputFingerprint: input.inputFingerprint,
    balanceHash: input.balance.configHash,
    seed: input.seed,
    rng: state.rng,
    state: { ...state },
    events: [...events],
    traceHash: computeTraceHash(events),
  };
}

export function restoreMatchSnapshot(snapshot: MatchSnapshot, input: SimulationInput): {
  state: MatchState;
  events: MatchEvent[];
} {
  if (snapshot.engineVersion !== FHM_ENGINE_VERSION) {
    throw new InvalidSnapshotError(
      `Unsupported snapshot engineVersion ${snapshot.engineVersion} (requires ${FHM_ENGINE_VERSION})`,
    );
  }
  if (snapshot.schemaVersion !== SNAPSHOT_SCHEMA_VERSION) {
    throw new InvalidSnapshotError(
      `Unsupported snapshot schemaVersion ${snapshot.schemaVersion} (requires ${SNAPSHOT_SCHEMA_VERSION})`,
    );
  }
  if (snapshot.inputFingerprint !== input.inputFingerprint) {
    throw new InvalidSnapshotError('Snapshot inputFingerprint mismatch');
  }
  if (snapshot.balanceHash !== input.balance.configHash) {
    throw new InvalidSnapshotError('Snapshot balanceHash mismatch');
  }
  if (snapshot.seed !== input.seed) {
    throw new InvalidSnapshotError('Snapshot seed mismatch');
  }
  return { state: { ...snapshot.state }, events: [...snapshot.events] };
}
