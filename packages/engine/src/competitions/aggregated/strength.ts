import { stableDigest } from '../../simulation/batch/hash.js';
import {
  AggregatedLeagueError,
  type AggregatedRosterPlayer,
  type AggregatedTeamStrengthInput,
  type AggregatedTeamStrengthSnapshot,
  type StrengthTier,
} from './types.js';

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function topNMean(values: number[], n: number): number {
  const sorted = [...values].sort((a, b) => b - a);
  return mean(sorted.slice(0, Math.max(1, n)));
}

export function strengthTier(value: number): StrengthTier {
  if (value < 0.35) return 'VERY_WEAK';
  if (value < 0.45) return 'WEAK';
  if (value < 0.55) return 'AVERAGE';
  if (value < 0.65) return 'STRONG';
  return 'VERY_STRONG';
}

/** Normalize 1–20 ability to 0–1. */
function normAbility(ability: number): number {
  return clamp((ability - 1) / 19, 0, 1);
}

export function computeTeamStrength(
  input: AggregatedTeamStrengthInput,
): AggregatedTeamStrengthSnapshot {
  const skaters = input.players.filter((p) => !p.isGoalie);
  const goalies = input.players.filter((p) => p.isGoalie);
  if (skaters.length < 6) {
    throw new AggregatedLeagueError(
      'AggregatedRosterNotReady',
      `${input.teamNameSnapshot}: need at least 6 eligible skaters`,
    );
  }
  if (goalies.length < 1) {
    throw new AggregatedLeagueError(
      'AggregatedRosterNotReady',
      `${input.teamNameSnapshot}: need at least 1 eligible goalie`,
    );
  }

  const forwards = skaters.filter((p) => ['C', 'LW', 'RW'].includes(p.position));
  const defense = skaters.filter((p) => ['LD', 'RD', 'D'].includes(p.position));
  const offensePool = (forwards.length >= 3 ? forwards : skaters).map((p) =>
    normAbility(p.offense || p.ability),
  );
  const defensePool = (defense.length >= 2 ? defense : skaters).map((p) =>
    normAbility(p.defense || p.ability),
  );
  const goaliePool = goalies.map((p) => normAbility(p.ability));

  const offenseStrength = clamp(
    0.65 * topNMean(offensePool, 6) + 0.35 * mean(offensePool),
    0,
    1,
  );
  const defenseStrength = clamp(
    0.65 * topNMean(defensePool, 4) + 0.35 * mean(defensePool),
    0,
    1,
  );
  const goalieStrength = clamp(
    0.75 * Math.max(...goaliePool) + 0.25 * mean(goaliePool),
    0,
    1,
  );
  const skaterStrength = clamp(0.55 * offenseStrength + 0.45 * defenseStrength, 0, 1);
  const specialTeamsStrength = clamp(0.5 * offenseStrength + 0.5 * defenseStrength, 0, 1);
  const depthStrength = clamp(
    mean(skaters.map((p) => normAbility(p.ability))) *
      Math.min(1, skaters.length / 12),
    0,
    1,
  );

  const chemistryModifier = clamp(input.chemistryModifier, -0.15, 0.15);
  const coachingModifier = clamp(input.coachingModifier, -0.1, 0.1);
  const depthPenalty = skaters.length < 10 ? -0.04 : 0;

  const overallStrength = clamp(
    0.32 * offenseStrength +
      0.28 * defenseStrength +
      0.25 * goalieStrength +
      0.1 * specialTeamsStrength +
      0.05 * depthStrength +
      chemistryModifier +
      coachingModifier +
      depthPenalty,
    0.05,
    0.95,
  );

  const rosterPayload = {
    teamId: input.teamId,
    players: [...input.players]
      .map((p) => ({
        playerId: p.playerId,
        position: p.position,
        isGoalie: p.isGoalie,
        ability: p.ability,
        offense: p.offense,
        defense: p.defense,
      }))
      .sort((a, b) => a.playerId.localeCompare(b.playerId)),
    chemistryModifier,
    coachingModifier,
  };

  return {
    competitionParticipantId: input.competitionParticipantId,
    teamId: input.teamId,
    teamNameSnapshot: input.teamNameSnapshot,
    rosterHash: stableDigest(JSON.stringify(rosterPayload)),
    skaterStrength,
    goalieStrength,
    offenseStrength,
    defenseStrength,
    specialTeamsStrength,
    depthStrength,
    chemistryModifier,
    coachingModifier,
    overallStrength,
    overallTier: strengthTier(overallStrength),
    offenseTier: strengthTier(offenseStrength),
    defenseTier: strengthTier(defenseStrength),
    goaltendingTier: strengthTier(goalieStrength),
    eligibleSkaterCount: skaters.length,
    eligibleGoalieCount: goalies.length,
    depthWarning: skaters.length < 10 ? 'Thin roster depth' : null,
  };
}

export function computeLeagueStrengthSnapshots(
  teams: AggregatedTeamStrengthInput[],
): AggregatedTeamStrengthSnapshot[] {
  return teams
    .map((t) => computeTeamStrength(t))
    .sort((a, b) => a.competitionParticipantId.localeCompare(b.competitionParticipantId));
}

export function assertRosterPlayer(p: AggregatedRosterPlayer): void {
  if (!p.playerId || !p.position) {
    throw new AggregatedLeagueError('AggregatedRosterNotReady', 'Invalid roster player');
  }
}
