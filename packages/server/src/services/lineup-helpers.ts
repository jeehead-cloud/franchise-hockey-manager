import {
  generateAutoLineup,
  isEligibleForLineup,
  positionFit,
  summarizeValidation,
  validateLineup,
  validateSecondaryPositions,
  type LineupAssignmentInput,
  type LineupCandidate,
  type LineupPresence,
  type LineupSlot,
  type LineupValidationResult,
  type TeamReadinessLineupPresence,
} from '@fhm/engine';
import type { LineupSlot as PrismaLineupSlot, Prisma } from '@prisma/client';
import { prisma } from '../db/client.js';
import { compactPlayerModelFields, resolveModelStatus, type PlayerModelRow } from './player-model.js';

type Attr = Record<string, number> | null | undefined;

function stripAttr(row: { playerId?: string; createdAt?: Date; updatedAt?: Date } | null | undefined): Attr {
  if (!row) return undefined;
  const { playerId: _p, createdAt: _c, updatedAt: _u, ...attrs } = row;
  return attrs as Record<string, number>;
}

export type LineupPlayerRow = {
  id: string;
  firstName?: string;
  lastName?: string;
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
  skaterAttributes?: Attr | { playerId?: string; createdAt?: Date; updatedAt?: Date } | null;
  goalieAttributes?: Attr | { playerId?: string; createdAt?: Date; updatedAt?: Date } | null;
  secondaryPositions?: { position: string }[];
};

export function toLineupCandidate(row: LineupPlayerRow): LineupCandidate {
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
    skaterAttributes: stripAttr(row.skaterAttributes as never) ?? undefined,
    goalieAttributes: stripAttr(row.goalieAttributes as never) ?? undefined,
  };
  const modelStatus = resolveModelStatus(modelRow);
  let currentAbility: number | null = null;
  let role: string | null = null;
  let roleRating: number | null = null;
  if (modelStatus === 'COMPLETE') {
    const compact = compactPlayerModelFields(modelRow);
    currentAbility = compact.currentAbility;
    role = compact.role;
    roleRating = compact.roleRating;
  }
  return {
    id: row.id,
    primaryPosition: row.primaryPosition as LineupCandidate['primaryPosition'],
    secondaryPositions: (row.secondaryPositions ?? []).map(
      (s) => s.position as LineupCandidate['primaryPosition'],
    ),
    rosterStatus: row.rosterStatus as LineupCandidate['rosterStatus'],
    modelStatus,
    currentAbility,
    role,
    roleRating,
  };
}

export function lineupPresenceFromValidation(
  hasLineup: boolean,
  validation: LineupValidationResult | null,
): LineupPresence {
  if (!hasLineup || !validation) return 'ABSENT';
  if (validation.status === 'INVALID') return 'INVALID';
  if (validation.status === 'INCOMPLETE') return 'INCOMPLETE';
  return 'VALID';
}

export function readinessLineupPresence(presence: LineupPresence): TeamReadinessLineupPresence {
  return presence;
}

export function mapAssignmentPlayer(row: LineupPlayerRow, slot: LineupSlot) {
  const candidate = toLineupCandidate(row);
  const fit = positionFit(candidate, slot);
  return {
    id: row.id,
    firstName: row.firstName ?? '',
    lastName: row.lastName ?? '',
    primaryPosition: row.primaryPosition,
    secondaryPositions: candidate.secondaryPositions,
    rosterStatus: row.rosterStatus,
    currentAbility: candidate.currentAbility,
    role: candidate.role,
    roleRating: candidate.roleRating,
    modelStatus: candidate.modelStatus,
    positionFit: fit,
    eligible: isEligibleForLineup(candidate),
  };
}

export async function loadTeamPlayersForLineup(teamId: string): Promise<LineupPlayerRow[]> {
  return prisma.player.findMany({
    where: { currentTeamId: teamId },
    include: {
      skaterAttributes: true,
      goalieAttributes: true,
      secondaryPositions: { select: { position: true } },
    },
    orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
  });
}

export function buildValidationForTeam(
  players: LineupPlayerRow[],
  assignments: LineupAssignmentInput[],
): LineupValidationResult {
  const candidatesById = new Map(players.map((p) => [p.id, toLineupCandidate(p)]));
  return validateLineup({ assignments, candidatesById });
}

export function runAutoLineup(
  players: LineupPlayerRow[],
  mode: 'REPLACE' | 'FILL_EMPTY',
  existing: LineupAssignmentInput[],
) {
  return generateAutoLineup({
    candidates: players.map(toLineupCandidate),
    mode,
    existingAssignments: existing,
  });
}

export function toPrismaSlots(
  assignments: LineupAssignmentInput[],
): { slot: PrismaLineupSlot; playerId: string }[] {
  return assignments.map((a) => ({ slot: a.slot as PrismaLineupSlot, playerId: a.playerId }));
}

export function serializeAssignments(
  rows: { slot: string; playerId: string }[],
): LineupAssignmentInput[] {
  return rows.map((r) => ({ slot: r.slot as LineupSlot, playerId: r.playerId }));
}

export function validateSecondaryList(
  primary: string,
  secondary: string[],
): ReturnType<typeof validateSecondaryPositions> {
  return validateSecondaryPositions(
    primary as LineupCandidate['primaryPosition'],
    secondary as LineupCandidate['primaryPosition'][],
  );
}

export function validationSummaryText(result: LineupValidationResult): string {
  return summarizeValidation(result);
}

export type LineupWithAssignments = Prisma.TeamLineupGetPayload<{
  include: {
    assignments: {
      include: {
        player: {
          include: {
            skaterAttributes: true;
            goalieAttributes: true;
            secondaryPositions: true;
          };
        };
      };
    };
  };
}>;
