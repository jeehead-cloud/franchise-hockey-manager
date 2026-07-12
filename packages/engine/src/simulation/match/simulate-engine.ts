import type { MatchBalanceSection } from '../../balance/types.js';
import { FHM_ENGINE_VERSION, FORBIDDEN_F11_EVENT_TYPES } from './constants.js';
import { IllegalStateTransitionError, InvalidSnapshotError, SafetyLimitExceededError } from './errors.js';
import { getMatchConfig, validateSimulationInput } from './input.js';
import { computeTraceHash } from './hash.js';
import { createRng, nextFloat, nextInt, chance, weightedPick } from './rng.js';
import type {
  ActiveLines,
  MatchEvent,
  MatchEventType,
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

function periodRemaining(state: MatchState, periodDuration: number): number {
  return Math.max(0, periodDuration - state.clockElapsedSeconds);
}

function makeEvent(
  state: MatchState,
  input: SimulationInput,
  type: MatchEventType,
  extra: Partial<MatchEvent> & { details?: Record<string, unknown> },
): MatchEvent {
  const periodDuration = input.rules.periodDurationSeconds;
  return {
    index: state.eventIndex + 1,
    type,
    period: state.period,
    elapsedSeconds: state.clockElapsedSeconds,
    remainingSeconds: periodRemaining(state, periodDuration),
    teamId: extra.teamId ?? null,
    playerIds: extra.playerIds ?? [],
    zone: extra.zone ?? state.zone,
    possession: extra.possession ?? state.possession,
    strengthState: 'EVEN_5V5',
    shiftNumber: state.currentShift?.shiftNumber ?? null,
    visibility: extra.visibility ?? (type === 'PERIOD_START' || type === 'FACEOFF' ? 'PUBLIC' : 'TECHNICAL'),
    details: extra.details ?? {},
  };
}

function advanceClock(state: MatchState, seconds: number, periodDuration: number): MatchState {
  const elapsed = Math.min(periodDuration, state.clockElapsedSeconds + Math.max(0, seconds));
  return {
    ...state,
    clockElapsedSeconds: elapsed,
    clockRemainingSeconds: Math.max(0, periodDuration - elapsed),
  };
}

function teamIdForSide(input: SimulationInput, side: PossessionSide): string | null {
  if (side === 'HOME') return input.homeTeam.teamId;
  if (side === 'AWAY') return input.awayTeam.teamId;
  return null;
}

function unitEp(input: SimulationInput, side: PossessionSide, lines: ActiveLines, skater: boolean): number {
  const team = side === 'HOME' ? input.homeTeam : input.awayTeam;
  if (skater) {
    const fk = side === 'HOME' ? lines.homeForwardLineKey : lines.awayForwardLineKey;
    const dk = side === 'HOME' ? lines.homeDefensePairKey : lines.awayDefensePairKey;
    const f = team.forwardLines.find((u) => u.unitKey === fk)?.effectivePerformance ?? 50;
    const d = team.defensePairs.find((u) => u.unitKey === dk)?.effectivePerformance ?? 50;
    return (f + d) / 2;
  }
  return team.starterGoalie.effectivePerformance;
}

function selectLines(input: SimulationInput, state: MatchState, cfg: MatchBalanceSection): { lines: ActiveLines; rng: MatchState['rng'] } {
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
  if (FORBIDDEN_F11_EVENT_TYPES.includes(type as never)) {
    throw new IllegalStateTransitionError(`Forbidden event type ${type}`);
  }
  const ev = makeEvent(state, input, type, extra);
  let next = {
    ...state,
    eventIndex: state.eventIndex + 1,
    safetyEventsEmitted: state.safetyEventsEmitted + 1,
  };
  if (timeCost > 0) {
    next = advanceClock(next, timeCost, input.rules.periodDurationSeconds);
  }
  return { state: next, events: [...events, ev] };
}

function startShift(input: SimulationInput, state: MatchState, events: MatchEvent[]): { state: MatchState; events: MatchEvent[] } {
  const cfg = getMatchConfig(input);
  const selected = selectLines(input, state, cfg);
  const lines = selected.lines;
  let r = selected.rng;
  const remaining = periodRemaining(state, cfg.periodDurationSeconds);
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
    details: { lines, plannedDurationSeconds: planned },
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

function resolvePossessionAction(input: SimulationInput, state: MatchState, events: MatchEvent[]): { state: MatchState; events: MatchEvent[] } {
  const cfg = getMatchConfig(input);
  if (!state.currentShift || state.possession === 'NONE' || !state.zone) {
    throw new IllegalStateTransitionError('Cannot resolve possession without active shift/possession/zone');
  }
  const lines = state.currentShift.lines;
  const atk = state.possession;
  const def: PossessionSide = atk === 'HOME' ? 'AWAY' : 'HOME';
  const attEp = unitEp(input, atk, lines, true);
  const defEp = unitEp(input, def, lines, true);
  const isHomeAttacking = atk === 'HOME';
  let rng = state.rng;
  const z = cfg.zoneTransitionWeights;
  const durationRoll = nextInt(rng, cfg.minimumPossessionSeconds, cfg.maximumPossessionSeconds);
  rng = durationRoll.rng;
  let timeCost = Math.min(durationRoll.value, periodRemaining(state, cfg.periodDurationSeconds));

  if (state.zone === 'NEUTRAL') {
    const p = boundedCompare(attEp, defEp, cfg.homeIcePossessionBonus, isHomeAttacking) * z.neutralZoneEntry;
    const roll = chance(rng, p);
    rng = roll.rng;
    if (roll.value) {
      let s = { ...state, rng, zone: 'OFFENSIVE' as PossessionZone, possession: atk };
      const out = emit(input, s, events, 'ZONE_ENTRY', { teamId: teamIdForSide(input, atk), zone: 'OFFENSIVE', possession: atk }, timeCost);
      return { state: out.state, events: out.events };
    }
    const s = { ...state, rng, possession: def, zone: 'OFFENSIVE' as PossessionZone };
    const out = emit(input, s, events, 'TURNOVER', { teamId: teamIdForSide(input, def), zone: 'OFFENSIVE', possession: def }, timeCost);
    return { state: out.state, events: out.events };
  }

  if (state.zone === 'DEFENSIVE') {
    const p = boundedCompare(attEp, defEp, cfg.homeIcePossessionBonus, isHomeAttacking) * z.defensiveZoneExit;
    const roll = chance(rng, p);
    rng = roll.rng;
    if (roll.value) {
      let s = { ...state, rng, zone: 'NEUTRAL' as PossessionZone, possession: atk };
      const out = emit(input, s, events, 'ZONE_EXIT', { teamId: teamIdForSide(input, atk), zone: 'NEUTRAL', possession: atk }, timeCost);
      return { state: out.state, events: out.events };
    }
    const s = { ...state, rng, possession: def, zone: 'DEFENSIVE' as PossessionZone };
    const out = emit(input, s, events, 'TURNOVER', { teamId: teamIdForSide(input, def), zone: 'DEFENSIVE', possession: def }, timeCost);
    return { state: out.state, events: out.events };
  }

  // OFFENSIVE
  const turnoverP = cfg.turnoverBaseProbability * z.offensiveTurnover;
  const stoppageP = z.offensiveStoppage;
  const roll = nextFloat(rng);
  rng = roll.rng;
  if (roll.value < turnoverP) {
    const s = { ...state, rng, possession: def, zone: 'DEFENSIVE' as PossessionZone };
    const out = emit(input, s, events, 'TURNOVER', { teamId: teamIdForSide(input, def), zone: 'DEFENSIVE', possession: def }, timeCost);
    return { state: out.state, events: out.events };
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
  if (state.phase === 'COMPLETE' || state.simulationStatus === 'REGULATION_COMPLETE') {
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
      const shiftStart = startShift(input, s, events);
      s = shiftStart.state;
      events = shiftStart.events;
      const pg = emit(input, s, events, 'POSSESSION_GAIN', { teamId: teamIdForSide(input, side), zone: 'NEUTRAL', possession: side }, 0);
      s = pg.state;
      events = pg.events;
      break;
    }
    case 'AWAITING_STOPPAGE_FACEOFF': {
      const { side, rng } = faceoffWinner(input, s, cfg);
      s = { ...s, rng, possession: side, zone: 'NEUTRAL', phase: 'IN_SHIFT' as const };
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
      const shift = s.currentShift!;
      const shiftDuration = s.clockElapsedSeconds - shift.startElapsedSeconds;
      if (shiftDuration >= shift.plannedDurationSeconds) {
        const out = emit(input, s, events, 'SHIFT_END', { details: { durationSeconds: shiftDuration } });
        s = { ...out.state, currentShift: null, shiftElapsedSeconds: 0 };
        events = out.events;
        if (periodRemaining(s, cfg.periodDurationSeconds) <= 0) {
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
      const out = emit(input, s, events, 'REGULATION_END', { visibility: 'PUBLIC', details: { score: s.score } });
      s = {
        ...out.state,
        phase: 'COMPLETE',
        simulationStatus: 'REGULATION_COMPLETE',
      };
      events = out.events;
      return { state: s, events, completed: true };
    }
    default:
      throw new IllegalStateTransitionError(`Unsupported phase ${s.phase}`);
  }

  const completed = s.phase === 'COMPLETE' || s.simulationStatus === 'REGULATION_COMPLETE';
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
  return { state: s, events, completed: s.phase === 'COMPLETE' };
}

export function simulateRegulation(input: SimulationInput): SimulationResult {
  validateSimulationInput(input);
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
  const diagnostics = computeDiagnostics(input, events, state, false);
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
    completed: run.state.phase === 'COMPLETE',
  };
}

export function computeDiagnostics(
  input: SimulationInput,
  events: MatchEvent[],
  state: MatchState,
  safetyLimitHit: boolean,
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
  };
}

export function serializeMatchSnapshot(
  input: SimulationInput,
  state: MatchState,
  events: MatchEvent[],
): MatchSnapshot {
  return {
    schemaVersion: 1,
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
    throw new InvalidSnapshotError(`Unsupported snapshot engineVersion ${snapshot.engineVersion}`);
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
