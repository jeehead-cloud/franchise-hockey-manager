import {
  evaluateLineupChemistry,
  type ChemistryContext,
  type ChemistryPlayerInput,
  type LineupChemistrySummary,
} from '@fhm/engine';
import { prisma } from '../db/client.js';
import { toLineupCandidate, type LineupPlayerRow, buildValidationForTeam, lineupPresenceFromValidation, serializeAssignments } from './lineup-helpers.js';
import { compactPlayerModelFields, resolveModelStatus, type PlayerModelRow } from './player-model.js';

function stripAttr(row: { playerId?: string; createdAt?: Date; updatedAt?: Date } | null | undefined) {
  if (!row) return undefined;
  const { playerId: _p, createdAt: _c, updatedAt: _u, ...attrs } = row;
  return attrs as Record<string, number>;
}

function toChemistryPlayer(row: LineupPlayerRow): ChemistryPlayerInput | null {
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
  if (resolveModelStatus(modelRow) !== 'COMPLETE') return null;
  if (!row.preferredCoachingStyle || !row.preferredTactics || !row.personality) return null;
  const compact = compactPlayerModelFields(modelRow);
  if (compact.currentAbility == null || !compact.role) return null;
  return {
    id: row.id,
    position: row.primaryPosition as ChemistryPlayerInput['position'],
    currentAbility: compact.currentAbility,
    role: compact.role,
    roleRating: compact.roleRating ?? 50,
    personality: row.personality as ChemistryPlayerInput['personality'],
    preferredCoachingStyle: row.preferredCoachingStyle as ChemistryPlayerInput['preferredCoachingStyle'],
    preferredTactics: row.preferredTactics as ChemistryPlayerInput['preferredTactics'],
  };
}

export async function getTeamChemistry(teamId: string): Promise<{
  team: { id: string; name: string; shortName: string | null; tacticalStyle: string | null };
  coach: {
    id: string;
    firstName: string;
    lastName: string;
    coachingStyle: string;
    tacticalStyle: string;
    overallCoaching: number | null;
    offense: number | null;
    defense: number | null;
  } | null;
  lineup: { exists: boolean; presence: string; validationStatus: string | null };
  chemistry: LineupChemistrySummary;
} | null> {
  const team = await prisma.team.findUnique({
    where: { id: teamId },
    include: {
      coach: true,
      lineup: { include: { assignments: true } },
      players: {
        include: {
          skaterAttributes: true,
          goalieAttributes: true,
          secondaryPositions: { select: { position: true } },
        },
      },
    },
  });
  if (!team) return null;

  const byId = new Map(team.players.map((p) => [p.id, p]));
  const slotPlayer = (slot: string) => {
    const assignment = team.lineup?.assignments.find((a) => a.slot === slot);
    if (!assignment) return null;
    const row = byId.get(assignment.playerId);
    if (!row) return null;
    return toChemistryPlayer(row as LineupPlayerRow);
  };

  const forwardLines = [1, 2, 3, 4].map((n) =>
    [`F${n}_LW`, `F${n}_C`, `F${n}_RW`]
      .map((slot) => slotPlayer(slot))
      .filter((p): p is ChemistryPlayerInput => Boolean(p)),
  );
  const defensePairs = [1, 2, 3].map((n) =>
    [`D${n}_LD`, `D${n}_RD`]
      .map((slot) => slotPlayer(slot))
      .filter((p): p is ChemistryPlayerInput => Boolean(p)),
  );

  // If a slot is filled but player is ineligible for chemistry, treat as incomplete unit
  // by only counting successfully mapped players (already filtered).

  const context: ChemistryContext = {
    coach: team.coach
      ? {
          coachingStyle: team.coach.coachingStyle as NonNullable<ChemistryContext['coach']>['coachingStyle'],
          tacticalStyle: team.coach.tacticalStyle as NonNullable<ChemistryContext['coach']>['tacticalStyle'],
          overallCoaching: team.coach.overallCoaching ?? 10,
          offense: team.coach.offense ?? 10,
          defense: team.coach.defense ?? 10,
        }
      : null,
    teamTacticalStyle: (team.tacticalStyle as ChemistryContext['teamTacticalStyle']) ?? null,
    familiarity: 0,
  };

  const chemistry = evaluateLineupChemistry({
    forwardLines,
    defensePairs,
    starterGoalie: slotPlayer('G_STARTER'),
    backupGoalie: slotPlayer('G_BACKUP'),
    context,
  });

  const assignments = team.lineup ? serializeAssignments(team.lineup.assignments) : [];
  const validation = buildValidationForTeam(team.players as LineupPlayerRow[], assignments);
  const presence = lineupPresenceFromValidation(Boolean(team.lineup), team.lineup ? validation : null);

  return {
    team: {
      id: team.id,
      name: team.name,
      shortName: team.shortName,
      tacticalStyle: team.tacticalStyle,
    },
    coach: team.coach
      ? {
          id: team.coach.id,
          firstName: team.coach.firstName,
          lastName: team.coach.lastName,
          coachingStyle: team.coach.coachingStyle,
          tacticalStyle: team.coach.tacticalStyle,
          overallCoaching: team.coach.overallCoaching,
          offense: team.coach.offense,
          defense: team.coach.defense,
        }
      : null,
    lineup: {
      exists: Boolean(team.lineup),
      presence,
      validationStatus: team.lineup ? validation.status : null,
    },
    chemistry,
  };
}
