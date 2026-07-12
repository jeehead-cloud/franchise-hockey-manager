import {
  evaluateTeamReadiness,
  type TeamReadinessInput,
  type TeamReadinessResult,
  type TeamReadinessRosterMember,
} from '@fhm/engine';
import { resolveModelStatus, type PlayerModelRow } from './player-model.js';

type AttrRow = Record<string, number | string | Date> | null | undefined;

export type TeamReadinessPlayerRow = {
  primaryPosition: string;
  rosterStatus: string;
  preferredCoachingStyle: string | null;
  preferredTactics: string | null;
  personality: string | null;
  heroRating: number | null;
  stability: number | null;
  developmentRate: number | null;
  developmentRisk: number | null;
  potentialFloor: number | null;
  potentialCeiling: number | null;
  publicPotentialEstimate: string | null;
  skaterAttributes?: AttrRow;
  goalieAttributes?: AttrRow;
};

function stripAttr(
  row: { playerId?: string; createdAt?: Date; updatedAt?: Date } | null | undefined,
): AttrRow {
  if (!row) return undefined;
  const { playerId: _p, createdAt: _c, updatedAt: _u, ...attrs } = row;
  return attrs as Record<string, number>;
}

export function toReadinessRosterMember(row: TeamReadinessPlayerRow): TeamReadinessRosterMember {
  const modelRow: PlayerModelRow = {
    primaryPosition: row.primaryPosition,
    preferredCoachingStyle: row.preferredCoachingStyle,
    preferredTactics: row.preferredTactics,
    personality: row.personality,
    heroRating: row.heroRating,
    stability: row.stability,
    developmentRate: row.developmentRate,
    developmentRisk: row.developmentRisk,
    potentialFloor: row.potentialFloor,
    potentialCeiling: row.potentialCeiling,
    publicPotentialEstimate: row.publicPotentialEstimate,
    skaterAttributes: (stripAttr(row.skaterAttributes as never) as Record<string, number> | undefined) ?? undefined,
    goalieAttributes: (stripAttr(row.goalieAttributes as never) as Record<string, number> | undefined) ?? undefined,
  };
  return {
    position: row.primaryPosition as TeamReadinessRosterMember['position'],
    rosterStatus: row.rosterStatus as TeamReadinessRosterMember['rosterStatus'],
    modelComplete: resolveModelStatus(modelRow) === 'COMPLETE',
  };
}

export function buildTeamReadiness(opts: {
  hasHeadCoach: boolean;
  tacticalStyle: string | null | undefined;
  players: TeamReadinessPlayerRow[];
}): TeamReadinessResult {
  const input: TeamReadinessInput = {
    hasHeadCoach: opts.hasHeadCoach,
    hasTacticalStyle: Boolean(opts.tacticalStyle),
    roster: opts.players.map(toReadinessRosterMember),
  };
  return evaluateTeamReadiness(input);
}
