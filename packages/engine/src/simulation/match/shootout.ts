import type { MatchCompletionBalanceSection } from '../../balance/types.js';
import { isF14CompatibleBalanceConfig } from '../../balance/schema.js';
import { IncompatibleBalanceConfigError } from './errors.js';
import { clamp } from './shots.js';
import { chance } from './rng.js';
import type {
  MatchEvent,
  MatchEventType,
  MatchScore,
  MatchState,
  ShootoutState,
  SimulationInput,
  SimulationPlayerProfile,
} from './types.js';

export function getShootoutConfig(input: SimulationInput): MatchCompletionBalanceSection['shootout'] {
  if (!isF14CompatibleBalanceConfig(input.balance.snapshot)) {
    throw new IncompatibleBalanceConfigError(
      `Balance schemaVersion ${input.balance.snapshot.schemaVersion} is not F14-compatible`,
    );
  }
  return input.balance.snapshot.matchCompletion.shootout;
}

function skatersForTeam(input: SimulationInput, side: 'HOME' | 'AWAY'): SimulationPlayerProfile[] {
  const team = side === 'HOME' ? input.homeTeam : input.awayTeam;
  return team.players
    .filter((p) => p.primaryPosition !== 'G')
    .sort((a, b) => a.lineupSlot.localeCompare(b.lineupSlot));
}

/** Deterministic shooter order: lineup slot order, cycling when exhausted. */
export function selectNextShooter(
  input: SimulationInput,
  side: 'HOME' | 'AWAY',
  usedShooters: string[],
  attemptIndex: number,
): string {
  const skaters = skatersForTeam(input, side);
  if (skaters.length === 0) {
    throw new IncompatibleBalanceConfigError(`No skaters available for ${side} shootout`);
  }
  const unused = skaters.filter((s) => !usedShooters.includes(s.playerId));
  const pool = unused.length > 0 ? unused : skaters;
  return pool[attemptIndex % pool.length]!.playerId;
}

export function initializeShootoutState(input: SimulationInput): ShootoutState {
  const cfg = getShootoutConfig(input);
  return {
    round: 1,
    homeAttempts: 0,
    awayAttempts: 0,
    homeGoals: 0,
    awayGoals: 0,
    usedHomeShooters: [],
    usedAwayShooters: [],
    nextSide: 'HOME',
    suddenDeath: false,
  };
}

function shooterScore(player: SimulationPlayerProfile, cfg: MatchCompletionBalanceSection['shootout']): number {
  const attrs = player.skaterAttributes;
  if (!attrs) return player.currentAbility / 100;
  const w = cfg.shooterWeights;
  const total =
    w.shooting + w.offensiveAwareness + w.stickhandling + w.currentAbility;
  const raw =
    (attrs.shooting * w.shooting +
      attrs.offensiveAwareness * w.offensiveAwareness +
      attrs.stickhandling * w.stickhandling +
      player.currentAbility * w.currentAbility) /
    (total * 100);
  return raw + cfg.heroRatingWeight * ((player.roleRating - 50) / 100);
}

function goalieScore(player: SimulationPlayerProfile, cfg: MatchCompletionBalanceSection['shootout']): number {
  const attrs = player.goalieAttributes;
  if (!attrs) return player.currentAbility / 100;
  const w = cfg.goalieWeights;
  const total = w.reflexes + w.positioning + w.consistency;
  return (
    (attrs.reflexes * w.reflexes +
      attrs.positioning * w.positioning +
      attrs.consistency * w.consistency) /
    (total * 100)
  );
}

export function computeShootoutGoalProbability(
  input: SimulationInput,
  shooterId: string,
  goalieId: string,
): number {
  const cfg = getShootoutConfig(input);
  const shooter =
    input.homeTeam.players.find((p) => p.playerId === shooterId) ??
    input.awayTeam.players.find((p) => p.playerId === shooterId);
  const goalie =
    input.homeTeam.players.find((p) => p.playerId === goalieId) ??
    input.awayTeam.players.find((p) => p.playerId === goalieId);
  if (!shooter || !goalie) return cfg.probabilityFloor;
  const attack = shooterScore(shooter, cfg);
  const defense = goalieScore(goalie, cfg);
  const raw = 0.42 + (attack - defense) * 0.55;
  return clamp(raw, cfg.probabilityFloor, cfg.probabilityCeiling);
}

type EmitFn = (
  input: SimulationInput,
  state: MatchState,
  events: MatchEvent[],
  type: MatchEventType,
  extra?: Partial<MatchEvent> & { details?: Record<string, unknown> },
  timeCost?: number,
) => { state: MatchState; events: MatchEvent[] };

export function resolveShootoutAttempt(
  input: SimulationInput,
  state: MatchState,
  events: MatchEvent[],
  emit: EmitFn,
): { state: MatchState; events: MatchEvent[]; completed: boolean } {
  const cfg = getShootoutConfig(input);
  const so = state.shootoutState;
  if (!so) {
    throw new IncompatibleBalanceConfigError('Missing shootoutState');
  }
  const side = so.nextSide;
  const used = side === 'HOME' ? so.usedHomeShooters : so.usedAwayShooters;
  const attemptIndex = side === 'HOME' ? so.homeAttempts : so.awayAttempts;
  const shooterId = selectNextShooter(input, side, used, attemptIndex);
  const goalieId =
    side === 'HOME'
      ? input.awayTeam.starterGoalie.playerIds[0]!
      : input.homeTeam.starterGoalie.playerIds[0]!;
  const shootingTeamId = side === 'HOME' ? input.homeTeam.teamId : input.awayTeam.teamId;
  const defendingTeamId = side === 'HOME' ? input.awayTeam.teamId : input.homeTeam.teamId;

  const goalProb = computeShootoutGoalProbability(input, shooterId, goalieId);
  const roll = chance(state.rng, goalProb);
  const scored = roll.value;

  const shootoutScore: MatchScore = {
    home: so.homeGoals + (scored && side === 'HOME' ? 1 : 0),
    away: so.awayGoals + (scored && side === 'AWAY' ? 1 : 0),
  };

  const out = emit(
    input,
    { ...state, rng: roll.rng },
    events,
    'SHOOTOUT_ATTEMPT',
    {
      teamId: shootingTeamId,
      playerIds: [shooterId, goalieId],
      visibility: 'PUBLIC',
      details: {
        shooterId,
        goalieId,
        shootingTeamId,
        defendingTeamId,
        scored,
        goalProbability: goalProb,
        round: so.round,
        attemptNumber: attemptIndex + 1,
        side,
        shootoutScore,
      },
    },
    0,
  );

  const nextUsedHome =
    side === 'HOME' ? [...so.usedHomeShooters, shooterId] : so.usedHomeShooters;
  const nextUsedAway =
    side === 'AWAY' ? [...so.usedAwayShooters, shooterId] : so.usedAwayShooters;
  const nextHomeAttempts = side === 'HOME' ? so.homeAttempts + 1 : so.homeAttempts;
  const nextAwayAttempts = side === 'AWAY' ? so.awayAttempts + 1 : so.awayAttempts;
  const nextHomeGoals = shootoutScore.home;
  const nextAwayGoals = shootoutScore.away;

  let nextRound = so.round;
  let suddenDeath = so.suddenDeath;
  if (!suddenDeath && nextHomeAttempts >= cfg.initialRounds && nextAwayAttempts >= cfg.initialRounds) {
    if (nextHomeGoals !== nextAwayGoals) {
      return {
        state: {
          ...out.state,
          shootoutScore,
          shootoutState: {
            ...so,
            homeAttempts: nextHomeAttempts,
            awayAttempts: nextAwayAttempts,
            homeGoals: nextHomeGoals,
            awayGoals: nextAwayGoals,
            usedHomeShooters: nextUsedHome,
            usedAwayShooters: nextUsedAway,
          },
          phase: 'AWAITING_MATCH_END',
        },
        events: out.events,
        completed: false,
      };
    }
    suddenDeath = cfg.suddenDeath;
    nextRound = cfg.initialRounds + 1;
  } else if (suddenDeath && nextHomeAttempts > cfg.initialRounds && nextAwayAttempts > cfg.initialRounds) {
    if (nextHomeGoals !== nextAwayGoals) {
      return {
        state: {
          ...out.state,
          shootoutScore,
          shootoutState: {
            ...so,
            homeAttempts: nextHomeAttempts,
            awayAttempts: nextAwayAttempts,
            homeGoals: nextHomeGoals,
            awayGoals: nextAwayGoals,
            usedHomeShooters: nextUsedHome,
            usedAwayShooters: nextUsedAway,
            suddenDeath,
            round: nextRound,
          },
          phase: 'AWAITING_MATCH_END',
        },
        events: out.events,
        completed: false,
      };
    }
    nextRound += 1;
  }

  const nextSide: 'HOME' | 'AWAY' = side === 'HOME' ? 'AWAY' : 'HOME';

  return {
    state: {
      ...out.state,
      shootoutScore,
      shootoutState: {
        round: nextRound,
        homeAttempts: nextHomeAttempts,
        awayAttempts: nextAwayAttempts,
        homeGoals: nextHomeGoals,
        awayGoals: nextAwayGoals,
        usedHomeShooters: nextUsedHome,
        usedAwayShooters: nextUsedAway,
        nextSide,
        suddenDeath,
      },
      phase: 'IN_SHOOTOUT',
    },
    events: out.events,
    completed: false,
  };
}
