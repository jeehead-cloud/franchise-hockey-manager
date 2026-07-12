import { prisma } from '../db/client.js';
import {
  buildValidationForTeam,
  lineupPresenceFromValidation,
  loadTeamPlayersForLineup,
  mapAssignmentPlayer,
  serializeAssignments,
} from './lineup-helpers.js';
import type { LineupSlot } from '@fhm/engine';

function groupAssignments(
  assignments: {
    slot: string;
    player: ReturnType<typeof mapAssignmentPlayer>;
  }[],
) {
  const bySlot = Object.fromEntries(assignments.map((a) => [a.slot, a.player]));
  const line = (n: 1 | 2 | 3 | 4) => ({
    lw: bySlot[`F${n}_LW`] ?? null,
    c: bySlot[`F${n}_C`] ?? null,
    rw: bySlot[`F${n}_RW`] ?? null,
  });
  const pair = (n: 1 | 2 | 3) => ({
    ld: bySlot[`D${n}_LD`] ?? null,
    rd: bySlot[`D${n}_RD`] ?? null,
  });
  return {
    forwardLines: [line(1), line(2), line(3), line(4)],
    defensePairs: [pair(1), pair(2), pair(3)],
    goalies: {
      starter: bySlot.G_STARTER ?? null,
      backup: bySlot.G_BACKUP ?? null,
    },
  };
}

export async function getTeamLineup(teamId: string) {
  const team = await prisma.team.findUnique({
    where: { id: teamId },
    select: { id: true, name: true, shortName: true },
  });
  if (!team) return null;

  const players = await loadTeamPlayersForLineup(teamId);
  const lineup = await prisma.teamLineup.findUnique({
    where: { teamId },
    include: {
      assignments: {
        include: {
          player: {
            include: {
              skaterAttributes: true,
              goalieAttributes: true,
              secondaryPositions: true,
            },
          },
        },
      },
    },
  });

  if (!lineup) {
    const validation = buildValidationForTeam(players, []);
    return {
      team,
      exists: false,
      updatedAt: null,
      version: null,
      assignments: [],
      board: groupAssignments([]),
      validation,
      presence: 'ABSENT' as const,
      filledSlots: 0,
      requiredSlots: 20,
    };
  }

  const assignmentInputs = serializeAssignments(lineup.assignments);
  const validation = buildValidationForTeam(players, assignmentInputs);
  const mapped = lineup.assignments.map((a) => ({
    slot: a.slot as LineupSlot,
    playerId: a.playerId,
    player: mapAssignmentPlayer(a.player, a.slot as LineupSlot),
  }));

  return {
    team,
    exists: true,
    id: lineup.id,
    updatedAt: lineup.updatedAt.toISOString(),
    version: lineup.version,
    assignments: mapped.map(({ slot, playerId, player }) => ({ slot, playerId, player })),
    board: groupAssignments(mapped.map(({ slot, player }) => ({ slot, player }))),
    validation,
    presence: lineupPresenceFromValidation(true, validation),
    filledSlots: validation.filledSlots,
    requiredSlots: validation.requiredSlots,
  };
}

export async function getTeamLineupSummary(teamId: string) {
  const lineup = await getTeamLineup(teamId);
  if (!lineup) return null;
  return {
    presence: lineup.presence,
    validationStatus: lineup.validation.status,
    filledSlots: lineup.filledSlots,
    requiredSlots: lineup.requiredSlots,
    updatedAt: lineup.updatedAt,
  };
}
