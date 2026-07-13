import type { MatchCompletionBalanceSection, MatchBalanceSection } from '../../balance/types.js';
import { isF14CompatibleBalanceConfig } from '../../balance/schema.js';
import { OVERTIME_DURATION_SECONDS } from './constants.js';
import { IncompatibleBalanceConfigError } from './errors.js';
import {
  computeShotOpportunityProbability,
  createShotAttempt,
  clamp,
  getShotsConfig,
} from './shots.js';
import { chance, nextFloat, nextInt, pick } from './rng.js';
import type {
  ActiveLines,
  MatchEvent,
  MatchEventType,
  MatchState,
  PossessionSide,
  PossessionZone,
  SimulationInput,
} from './types.js';

export function getOvertimeConfig(input: SimulationInput): MatchCompletionBalanceSection['overtime'] {
  if (!isF14CompatibleBalanceConfig(input.balance.snapshot)) {
    throw new IncompatibleBalanceConfigError(
      `Balance schemaVersion ${input.balance.snapshot.schemaVersion} is not F14-compatible`,
    );
  }
  return input.balance.snapshot.matchCompletion.overtime;
}

export function overtimePeriodDuration(input: SimulationInput): number {
  return getOvertimeConfig(input).durationSeconds ?? OVERTIME_DURATION_SECONDS;
}

/** Deterministic 2F+1D unit for 3v3 overtime. */
export function select3v3Unit(
  input: SimulationInput,
  side: 'HOME' | 'AWAY',
  unitIndex: number,
): { forwardIds: string[]; defenseId: string; skaterIds: string[] } {
  const team = side === 'HOME' ? input.homeTeam : input.awayTeam;
  const forwards = team.lineupAssignments
    .filter((a) => a.slot.startsWith('F'))
    .sort((a, b) => a.slot.localeCompare(b.slot))
    .map((a) => a.playerId);
  const defense = team.lineupAssignments
    .filter((a) => a.slot.startsWith('D'))
    .sort((a, b) => a.slot.localeCompare(b.slot))
    .map((a) => a.playerId);
  if (forwards.length < 2 || defense.length < 1) {
    throw new IncompatibleBalanceConfigError('Insufficient skaters for 3v3 overtime unit');
  }
  const f1 = forwards[unitIndex % forwards.length]!;
  const f2 = forwards[(unitIndex + 1) % forwards.length]!;
  const d = defense[unitIndex % defense.length]!;
  return { forwardIds: [f1, f2], defenseId: d, skaterIds: [f1, f2, d] };
}

export function buildOvertimeLines(input: SimulationInput, unitIndex: number): ActiveLines {
  const home = select3v3Unit(input, 'HOME', unitIndex);
  const away = select3v3Unit(input, 'AWAY', unitIndex);
  return {
    homeForwardLineKey: 'OT_3V3',
    homeDefensePairKey: 'OT_3V3',
    homeGoalieId: input.homeTeam.starterGoalie.playerIds[0]!,
    awayForwardLineKey: 'OT_3V3',
    awayDefensePairKey: 'OT_3V3',
    awayGoalieId: input.awayTeam.starterGoalie.playerIds[0]!,
    homeForwardPlayerIds: home.forwardIds,
    homeDefensePlayerIds: [home.defenseId],
    awayForwardPlayerIds: away.forwardIds,
    awayDefensePlayerIds: [away.defenseId],
  };
}

function unitEp3v3(input: SimulationInput, side: PossessionSide, lines: ActiveLines): number {
  const team = side === 'HOME' ? input.homeTeam : input.awayTeam;
  const ids =
    side === 'HOME'
      ? [...lines.homeForwardPlayerIds, ...lines.homeDefensePlayerIds]
      : [...lines.awayForwardPlayerIds, ...lines.awayDefensePlayerIds];
  let sum = 0;
  for (const id of ids) {
    const p = team.players.find((pl) => pl.playerId === id);
    sum += p?.currentAbility ?? 50;
  }
  return sum / Math.max(1, ids.length);
}

function boundedCompare(att: number, def: number, homeBonus: number, isHomeAttacking: boolean): number {
  const diff = att - def;
  let p = 0.5 + Math.max(-0.35, Math.min(0.35, diff / 120));
  if (isHomeAttacking) p += homeBonus;
  else p -= homeBonus;
  return Math.min(0.92, Math.max(0.08, p));
}

function periodRemaining(state: MatchState, periodDuration: number): number {
  return Math.max(0, periodDuration - state.clockElapsedSeconds);
}

type EmitFn = (
  input: SimulationInput,
  state: MatchState,
  events: MatchEvent[],
  type: MatchEventType,
  extra?: Partial<MatchEvent> & { details?: Record<string, unknown> },
  timeCost?: number,
) => { state: MatchState; events: MatchEvent[] };

export function resolveOvertimePossessionAction(
  input: SimulationInput,
  state: MatchState,
  events: MatchEvent[],
  emit: EmitFn,
  matchCfg: MatchBalanceSection,
): { state: MatchState; events: MatchEvent[] } {
  if (!state.currentShift || state.possession === 'NONE' || !state.zone) {
    throw new IncompatibleBalanceConfigError('Cannot resolve OT possession without shift/possession/zone');
  }
  const otCfg = getOvertimeConfig(input);
  const otDuration = overtimePeriodDuration(input);
  const lines = state.currentShift.lines;
  const atk = state.possession;
  const def: PossessionSide = atk === 'HOME' ? 'AWAY' : 'HOME';
  const attEp = unitEp3v3(input, atk, lines);
  const defEp = unitEp3v3(input, def, lines);
  const isHomeAttacking = atk === 'HOME';
  let rng = state.rng;
  const z = matchCfg.zoneTransitionWeights;
  const durationRoll = nextInt(rng, matchCfg.minimumPossessionSeconds, matchCfg.maximumPossessionSeconds);
  rng = durationRoll.rng;
  const timeCost = Math.min(durationRoll.value, periodRemaining(state, otDuration));

  const possessionP = (base: number) => {
    let p = boundedCompare(attEp, defEp, matchCfg.homeIcePossessionBonus, isHomeAttacking) * base;
    p = Math.min(0.92, Math.max(0.08, p * (1 + otCfg.possessionModifier)));
    return p;
  };

  if (state.zone === 'NEUTRAL') {
    const roll = chance(rng, possessionP(z.neutralZoneEntry));
    rng = roll.rng;
    if (roll.value) {
      const s = { ...state, rng, zone: 'OFFENSIVE' as PossessionZone, possession: atk };
      const teamId = atk === 'HOME' ? input.homeTeam.teamId : input.awayTeam.teamId;
      return emit(input, s, events, 'ZONE_ENTRY', { teamId, zone: 'OFFENSIVE', possession: atk }, timeCost);
    }
    const s = { ...state, rng, possession: def, zone: 'OFFENSIVE' as PossessionZone };
    const teamId = def === 'HOME' ? input.homeTeam.teamId : input.awayTeam.teamId;
    return emit(input, s, events, 'TURNOVER', { teamId, zone: 'OFFENSIVE', possession: def }, timeCost);
  }

  if (state.zone === 'DEFENSIVE') {
    const roll = chance(rng, possessionP(z.defensiveZoneExit));
    rng = roll.rng;
    if (roll.value) {
      const s = { ...state, rng, zone: 'NEUTRAL' as PossessionZone, possession: atk };
      const teamId = atk === 'HOME' ? input.homeTeam.teamId : input.awayTeam.teamId;
      return emit(input, s, events, 'ZONE_EXIT', { teamId, zone: 'NEUTRAL', possession: atk }, timeCost);
    }
    const s = { ...state, rng, possession: def, zone: 'DEFENSIVE' as PossessionZone };
    const teamId = def === 'HOME' ? input.homeTeam.teamId : input.awayTeam.teamId;
    return emit(input, s, events, 'TURNOVER', { teamId, zone: 'DEFENSIVE', possession: def }, timeCost);
  }

  // OFFENSIVE — no penalties in OT
  let shotOppP = computeShotOpportunityProbability(
    attEp,
    defEp,
    matchCfg,
    getShotsConfig(input),
  );
  shotOppP *= 1 + otCfg.shotOpportunityModifier;
  shotOppP = clamp(shotOppP, 0.05, 0.75);
  const continuedP = matchCfg.offensiveZoneContinuedPossessionProbability;
  const turnoverP = matchCfg.turnoverBaseProbability * z.offensiveTurnover;
  const stoppageP = z.offensiveStoppage;
  const roll = nextFloat(rng);
  rng = roll.rng;
  const r = roll.value;
  let s: MatchState = { ...state, rng };

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
    const teamId = def === 'HOME' ? input.homeTeam.teamId : input.awayTeam.teamId;
    return emit(input, next, events, 'TURNOVER', { teamId, zone: 'DEFENSIVE', possession: def }, timeCost);
  }
  if (r < shotOppP + turnoverP + stoppageP) {
    const next = {
      ...s,
      possession: 'NONE' as PossessionSide,
      zone: null,
      passChainPlayerIds: [],
      phase: 'AWAITING_STOPPAGE_FACEOFF' as const,
    };
    const teamId = atk === 'HOME' ? input.homeTeam.teamId : input.awayTeam.teamId;
    return emit(input, next, events, 'STOPPAGE', { teamId, details: { reason: 'PUCK_FROZEN' } }, timeCost);
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
    const teamId = atk === 'HOME' ? input.homeTeam.teamId : input.awayTeam.teamId;
    return emit(input, next, events, 'POSSESSION_GAIN', { teamId, zone: 'OFFENSIVE', possession: atk }, timeCost);
  }
  const next = { ...s, zone: 'OFFENSIVE' as PossessionZone, possession: atk };
  const teamId = atk === 'HOME' ? input.homeTeam.teamId : input.awayTeam.teamId;
  return emit(input, next, events, 'POSSESSION_GAIN', { teamId, zone: 'OFFENSIVE', possession: atk }, timeCost);
}
