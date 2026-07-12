import { isF13CompatibleBalanceConfig } from '../../balance/schema.js';
import type { PenaltiesBalanceSection } from '../../balance/types.js';
import { MINOR_PENALTY_SECONDS } from './constants.js';
import { IllegalStateTransitionError } from './errors.js';
import { chance, nextFloat, weightedPick } from './rng.js';
import { strengthFromActivePenalty } from './strength-state.js';
import type {
  ActiveLines,
  ActivePenalty,
  MatchEvent,
  MatchState,
  PossessionSide,
  SimulationInput,
  SimulationPlayerProfile,
} from './types.js';
import type { PenaltyEndReason, PenaltyInfraction } from './penalty-types.js';

export function getPenaltiesConfig(input: SimulationInput): PenaltiesBalanceSection {
  if (!isF13CompatibleBalanceConfig(input.balance.snapshot)) {
    throw new IllegalStateTransitionError('Active balance is not F13-compatible for penalties');
  }
  return input.balance.snapshot.penalties;
}

export function regulationSeconds(state: MatchState, periodDuration: number): number {
  return (state.period - 1) * periodDuration + state.clockElapsedSeconds;
}

function defendingSkatersOnIce(
  input: SimulationInput,
  lines: ActiveLines,
  defendingSide: 'HOME' | 'AWAY',
): SimulationPlayerProfile[] {
  const team = defendingSide === 'HOME' ? input.homeTeam : input.awayTeam;
  const ids =
    defendingSide === 'HOME'
      ? [...lines.homeForwardPlayerIds, ...lines.homeDefensePlayerIds]
      : [...lines.awayForwardPlayerIds, ...lines.awayDefensePlayerIds];
  return ids
    .map((id) => team.players.find((p) => p.playerId === id))
    .filter((p): p is SimulationPlayerProfile => p != null && p.primaryPosition !== 'G');
}

function playerPenaltyWeight(
  p: SimulationPlayerProfile,
  cfg: PenaltiesBalanceSection,
): number {
  const attrs = p.skaterAttributes!;
  const tier = cfg.rolePenaltyTendencies[p.role] ?? 'medium';
  const roleMul = cfg.rolePenaltyTendencyMultipliers[tier];
  const aggression = attrs.aggression / 20;
  const awareness = attrs.defensiveAwareness / 20;
  return Math.max(
    0.05,
    (cfg.aggressionWeight * aggression +
      cfg.defensiveAwarenessWeight * (1 - awareness) +
      0.35) *
      roleMul,
  );
}

export function computePenaltyOpportunityProbability(
  defendingPlayers: SimulationPlayerProfile[],
  cfg: PenaltiesBalanceSection,
  pressure: number,
): number {
  if (defendingPlayers.length === 0) return 0;
  const avgAggression =
    defendingPlayers.reduce((n, p) => n + (p.skaterAttributes?.aggression ?? 10), 0) /
    defendingPlayers.length /
    20;
  const avgAwareness =
    defendingPlayers.reduce((n, p) => n + (p.skaterAttributes?.defensiveAwareness ?? 10), 0) /
    defendingPlayers.length /
    20;
  let p =
    cfg.baseOpportunityProbability *
    (1 + cfg.aggressionWeight * (avgAggression - 0.5) * 0.8) *
    (1 - cfg.defensiveAwarenessWeight * (avgAwareness - 0.5) * 0.5) *
    (1 + cfg.pressureWeight * (pressure - 0.5) * 0.4) *
    (1 + cfg.penaltyVariance * 0.1);
  return Math.min(0.25, Math.max(0.005, p));
}

export function selectPenalizedPlayer(
  candidates: SimulationPlayerProfile[],
  cfg: PenaltiesBalanceSection,
  rng: MatchState['rng'],
): { playerId: string; rng: MatchState['rng'] } {
  if (candidates.length === 0) {
    throw new IllegalStateTransitionError('No eligible skaters for penalty');
  }
  const weights: Record<string, number> = {};
  for (const p of candidates) {
    weights[p.playerId] = playerPenaltyWeight(p, cfg);
  }
  const pick = weightedPick(rng, weights);
  return { playerId: pick.value, rng: pick.rng };
}

export function selectInfraction(
  cfg: PenaltiesBalanceSection,
  rng: MatchState['rng'],
): { infraction: PenaltyInfraction; rng: MatchState['rng'] } {
  const pick = weightedPick(rng, cfg.infractionWeights);
  return { infraction: pick.value as PenaltyInfraction, rng: pick.rng };
}

/**
 * Evaluate a penalty opportunity at a stable transition (EVEN_5V5 only).
 * F13 simplification: suppressed while any penalty is active.
 */
export function maybeAssessPenalty(
  input: SimulationInput,
  state: MatchState,
  events: MatchEvent[],
  makeEmit: (
    input: SimulationInput,
    state: MatchState,
    events: MatchEvent[],
    type: 'PENALTY',
    extra: Partial<MatchEvent> & { details?: Record<string, unknown> },
    timeCost?: number,
  ) => { state: MatchState; events: MatchEvent[] },
  context: { defendingSide: 'HOME' | 'AWAY'; pressure?: number },
): { state: MatchState; events: MatchEvent[]; assessed: boolean } {
  if (!isF13CompatibleBalanceConfig(input.balance.snapshot)) {
    return { state, events, assessed: false };
  }
  const cfg = input.balance.snapshot.penalties;
  if (!cfg.enabled) return { state, events, assessed: false };
  if (state.activePenalty) return { state, events, assessed: false };
  if (state.strengthState !== 'EVEN_5V5') return { state, events, assessed: false };
  if (state.pendingShot) return { state, events, assessed: false };
  if (!state.currentShift) return { state, events, assessed: false };
  if (state.phase !== 'IN_SHIFT') return { state, events, assessed: false };

  const periodDuration = input.rules.periodDurationSeconds;
  const now = regulationSeconds(state, periodDuration);
  if (
    state.lastPenaltyEndedRegulationSeconds != null &&
    now - state.lastPenaltyEndedRegulationSeconds < cfg.minimumSecondsBetweenPenalties
  ) {
    return { state, events, assessed: false };
  }

  const candidates = defendingSkatersOnIce(input, state.currentShift.lines, context.defendingSide);
  const probability = computePenaltyOpportunityProbability(
    candidates,
    cfg,
    context.pressure ?? 0.5,
  );
  let rng = state.rng;
  const roll = chance(rng, probability);
  rng = roll.rng;
  if (!roll.value) {
    return { state: { ...state, rng }, events, assessed: false };
  }

  const selected = selectPenalizedPlayer(candidates, cfg, rng);
  rng = selected.rng;
  const inf = selectInfraction(cfg, rng);
  rng = inf.rng;

  const penalizedSide = context.defendingSide;
  const advantagedSide: 'HOME' | 'AWAY' = penalizedSide === 'HOME' ? 'AWAY' : 'HOME';
  const penalizedTeamId =
    penalizedSide === 'HOME' ? input.homeTeam.teamId : input.awayTeam.teamId;
  const advantagedTeamId =
    advantagedSide === 'HOME' ? input.homeTeam.teamId : input.awayTeam.teamId;
  const penaltySequenceId = state.penaltySequenceId + 1;
  const duration = cfg.durationSeconds || MINOR_PENALTY_SECONDS;

  const activePenalty: ActivePenalty = {
    penaltySequenceId,
    penalizedTeamId,
    advantagedTeamId,
    penalizedSide,
    advantagedSide,
    penalizedPlayerId: selected.playerId,
    infraction: inf.infraction,
    startedPeriod: state.period,
    startedElapsedSeconds: state.clockElapsedSeconds,
    durationSeconds: duration,
    remainingSeconds: duration,
    powerPlayGoalScored: false,
  };

  const strengthState = strengthFromActivePenalty(activePenalty);
  let s: MatchState = {
    ...state,
    rng,
    activePenalty,
    penaltySequenceId,
    strengthState,
    possession: 'NONE',
    zone: null,
    passChainPlayerIds: [],
    phase: 'AWAITING_STOPPAGE_FACEOFF',
    currentShift: null,
  };

  const out = makeEmit(
    input,
    s,
    events,
    'PENALTY',
    {
      teamId: penalizedTeamId,
      playerIds: [selected.playerId],
      visibility: 'PUBLIC',
      details: {
        penalizedTeamId,
        advantagedTeamId,
        penalizedPlayerId: selected.playerId,
        infraction: inf.infraction,
        durationSeconds: duration,
        penaltyMinutes: 2,
        strengthStateAfter: strengthState,
        penaltySequenceId,
        source: 'POSSESSION_CONTEST',
      },
    },
    0,
  );
  s = { ...out.state, strengthState, activePenalty, penaltySequenceId, phase: 'AWAITING_STOPPAGE_FACEOFF' };
  return { state: s, events: out.events, assessed: true };
}

export function expireActivePenalty(
  input: SimulationInput,
  state: MatchState,
  events: MatchEvent[],
  reason: PenaltyEndReason,
  makeEmit: (
    input: SimulationInput,
    state: MatchState,
    events: MatchEvent[],
    type: 'PENALTY_EXPIRED',
    extra: Partial<MatchEvent> & { details?: Record<string, unknown> },
    timeCost?: number,
  ) => { state: MatchState; events: MatchEvent[] },
): { state: MatchState; events: MatchEvent[] } {
  const penalty = state.activePenalty;
  if (!penalty) {
    throw new IllegalStateTransitionError('No active penalty to expire');
  }
  const periodDuration = input.rules.periodDurationSeconds;
  const endedAt = regulationSeconds(state, periodDuration);
  let s: MatchState = {
    ...state,
    activePenalty: null,
    strengthState: 'EVEN_5V5',
    lastPenaltyEndedRegulationSeconds: endedAt,
    currentShift: null,
    possession: 'NONE',
    zone: null,
    passChainPlayerIds: [],
    phase: state.clockElapsedSeconds >= periodDuration ? state.phase : 'AWAITING_FACEOFF',
  };
  const out = makeEmit(
    input,
    s,
    events,
    'PENALTY_EXPIRED',
    {
      teamId: penalty.penalizedTeamId,
      playerIds: [penalty.penalizedPlayerId],
      visibility: 'PUBLIC',
      details: {
        penaltySequenceId: penalty.penaltySequenceId,
        penalizedPlayerId: penalty.penalizedPlayerId,
        infraction: penalty.infraction,
        reason,
        strengthStateAfter: 'EVEN_5V5',
        remainingSecondsAtEnd: penalty.remainingSeconds,
      },
    },
    0,
  );
  s = {
    ...out.state,
    activePenalty: null,
    strengthState: 'EVEN_5V5',
    lastPenaltyEndedRegulationSeconds: endedAt,
    phase: out.state.clockElapsedSeconds >= periodDuration ? 'AWAITING_PERIOD_END' : 'AWAITING_FACEOFF',
    currentShift: null,
    possession: 'NONE',
    zone: null,
  };
  return { state: s, events: out.events };
}

/**
 * Decrement penalty clock by game seconds consumed. Clamps advance so remaining never goes negative.
 * Returns whether remaining hit exactly zero (caller should emit PENALTY_EXPIRED on next step).
 */
export function applyPenaltyClock(
  state: MatchState,
  secondsAdvanced: number,
): MatchState {
  if (!state.activePenalty || secondsAdvanced <= 0) return state;
  const remaining = Math.max(0, state.activePenalty.remainingSeconds - secondsAdvanced);
  return {
    ...state,
    activePenalty: {
      ...state.activePenalty,
      remainingSeconds: remaining,
    },
  };
}

export function clampTimeCostForPenalty(state: MatchState, timeCost: number): number {
  if (!state.activePenalty) return timeCost;
  if (state.activePenalty.remainingSeconds <= 0) return 0;
  return Math.min(timeCost, state.activePenalty.remainingSeconds);
}

export function cancelPenaltyOnPowerPlayGoal(state: MatchState): MatchState {
  const penalty = state.activePenalty;
  if (!penalty) return state;
  return {
    ...state,
    activePenalty: null,
    strengthState: 'EVEN_5V5',
  };
}

export function defendingSideForPossession(possession: PossessionSide): 'HOME' | 'AWAY' | null {
  if (possession === 'HOME') return 'AWAY';
  if (possession === 'AWAY') return 'HOME';
  return null;
}
