import { createHash } from 'node:crypto';
import {
  FHM_ENGINE_VERSION,
  F11_SIMULATION_MODE,
  PERIOD_DURATION_SECONDS,
  REGULATION_PERIODS,
  canonicalizeSimulationInput,
  isF11CompatibleBalanceConfig,
  validateSimulationInput,
  type SimulationInput,
  type SimulationPlayerProfile,
  type SimulationTeamInput,
} from '@fhm/engine';
import { prisma } from '../db/client.js';
import { getActiveBalanceSnapshot } from './balance-config.js';
import { getTeamChemistry } from './chemistry.js';
import {
  buildValidationForTeam,
  lineupPresenceFromValidation,
  serializeAssignments,
  type LineupPlayerRow,
} from './lineup-helpers.js';
import { publicPlayerModelDetail, resolveModelStatus, type PlayerModelRow } from './player-model.js';
import { buildTeamReadiness, type TeamReadinessPlayerRow } from './team-readiness.js';

export class SimulationHttpError extends Error {
  statusCode: number;
  code: string;
  details?: unknown;

  constructor(statusCode: number, code: string, message: string, details?: unknown) {
    super(message);
    this.name = code;
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
  }
}

export function hashSimulationInput(input: SimulationInput): string {
  return createHash('sha256').update(canonicalizeSimulationInput(input), 'utf8').digest('hex');
}

function toPlayerProfile(row: LineupPlayerRow, slot: string): SimulationPlayerProfile | null {
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
    skaterAttributes: row.skaterAttributes as never,
    goalieAttributes: row.goalieAttributes as never,
  };
  if (resolveModelStatus(modelRow) !== 'COMPLETE') return null;
  const detail = publicPlayerModelDetail(modelRow);
  if (detail.modelStatus !== 'COMPLETE') return null;
  if (detail.kind === 'skater') {
    return {
      playerId: row.id,
      firstName: row.firstName ?? '',
      lastName: row.lastName ?? '',
      primaryPosition: row.primaryPosition as SimulationPlayerProfile['primaryPosition'],
      lineupSlot: slot,
      currentAbility: detail.currentAbility,
      offensiveRating: detail.offensiveRating,
      defensiveRating: detail.defensiveRating,
      role: detail.role,
      roleRating: detail.roleRating,
      effectivePerformance: null,
    };
  }
  return {
    playerId: row.id,
    firstName: row.firstName ?? '',
    lastName: row.lastName ?? '',
    primaryPosition: 'G',
    lineupSlot: slot,
    currentAbility: detail.currentAbility,
    offensiveRating: null,
    defensiveRating: null,
    role: detail.role,
    roleRating: detail.roleRating,
    effectivePerformance: null,
  };
}

async function assertTeamSimulationReady(teamId: string): Promise<void> {
  const team = await prisma.team.findUnique({
    where: { id: teamId },
    include: {
      coach: true,
      lineup: { include: { assignments: true } },
      players: {
        include: { skaterAttributes: true, goalieAttributes: true, secondaryPositions: true },
      },
    },
  });
  if (!team) {
    throw new SimulationHttpError(404, 'TeamNotFound', 'Team not found', { teamId });
  }

  const assignments = team.lineup ? serializeAssignments(team.lineup.assignments) : [];
  const validation = buildValidationForTeam(team.players as LineupPlayerRow[], assignments);
  const presence = lineupPresenceFromValidation(Boolean(team.lineup), team.lineup ? validation : null);
  const readiness = buildTeamReadiness({
    hasHeadCoach: Boolean(team.coach),
    tacticalStyle: team.tacticalStyle,
    players: team.players as TeamReadinessPlayerRow[],
    lineupPresence: presence,
  });

  if (readiness.status !== 'READY' || validation.status !== 'VALID') {
    throw new SimulationHttpError(409, 'TeamNotSimulationReady', 'Team is not ready for F11 simulation', {
      teamId,
      readinessStatus: readiness.status,
      lineupStatus: validation.status,
      checks: readiness.checks,
    });
  }
}

function buildTeamInputFromLoaded(
  side: 'HOME' | 'AWAY',
  teamRow: {
    id: string;
    name: string;
    tacticalStyle: string | null;
    coach: {
      coachingStyle: string;
      tacticalStyle: string;
      overallCoaching: number | null;
      offense: number | null;
      defense: number | null;
    } | null;
    lineup: { assignments: { slot: string; playerId: string }[] } | null;
    players: LineupPlayerRow[];
  },
  chemistry: NonNullable<Awaited<ReturnType<typeof getTeamChemistry>>>,
): SimulationTeamInput {
  if (!teamRow.coach || !teamRow.tacticalStyle || !teamRow.lineup) {
    throw new SimulationHttpError(409, 'TeamNotSimulationReady', 'Team missing coach, tactics, or lineup');
  }

  const byId = new Map(teamRow.players.map((p) => [p.id, p]));
  const lineupAssignments = teamRow.lineup.assignments.map((a) => ({ slot: a.slot, playerId: a.playerId }));
  const players: SimulationPlayerProfile[] = [];
  for (const assignment of lineupAssignments) {
    const row = byId.get(assignment.playerId);
    if (!row) {
      throw new SimulationHttpError(422, 'InvalidSimulationInput', `Lineup references missing player ${assignment.playerId}`);
    }
    const profile = toPlayerProfile(row, assignment.slot);
    if (!profile) {
      throw new SimulationHttpError(422, 'InvalidSimulationInput', `Incomplete player model for ${assignment.playerId}`);
    }
    players.push(profile);
  }

  const epByPlayer = new Map<string, number>();
  for (const unit of [...chemistry.chemistry.forwardLines, ...chemistry.chemistry.defensePairs, chemistry.chemistry.goalies.starter]) {
    if (unit.effectivePerformance == null) continue;
    for (const pid of unit.playerIds) {
      epByPlayer.set(pid, unit.effectivePerformance);
    }
  }
  for (const p of players) {
    p.effectivePerformance = epByPlayer.get(p.playerId) ?? p.currentAbility;
  }

  return {
    teamId: teamRow.id,
    teamName: teamRow.name,
    side,
    coach: {
      coachingStyle: teamRow.coach.coachingStyle,
      tacticalStyle: teamRow.coach.tacticalStyle,
      overallCoaching: teamRow.coach.overallCoaching ?? 10,
      offense: teamRow.coach.offense ?? 10,
      defense: teamRow.coach.defense ?? 10,
    },
    tacticalStyle: teamRow.tacticalStyle,
    lineupAssignments,
    players,
    forwardLines: chemistry.chemistry.forwardLines
      .filter((u) => u.effectivePerformance != null)
      .map((u) => ({
        unitKey: u.unitKey,
        playerIds: u.playerIds,
        effectivePerformance: u.effectivePerformance!,
      })),
    defensePairs: chemistry.chemistry.defensePairs
      .filter((u) => u.effectivePerformance != null)
      .map((u) => ({
        unitKey: u.unitKey,
        playerIds: u.playerIds,
        effectivePerformance: u.effectivePerformance!,
      })),
    starterGoalie: {
      unitKey: chemistry.chemistry.goalies.starter.unitKey,
      playerIds: chemistry.chemistry.goalies.starter.playerIds,
      effectivePerformance: chemistry.chemistry.goalies.starter.effectivePerformance ?? 50,
    },
  };
}

async function loadTeamBundle(teamId: string) {
  const team = await prisma.team.findUnique({
    where: { id: teamId },
    include: {
      coach: true,
      lineup: { include: { assignments: true } },
      players: {
        include: { skaterAttributes: true, goalieAttributes: true, secondaryPositions: true },
      },
    },
  });
  if (!team) return null;
  const chemistry = await getTeamChemistry(teamId);
  if (!chemistry) return null;
  return { team, chemistry };
}

export async function buildSimulationInput(opts: {
  homeTeamId: string;
  awayTeamId: string;
  seed: string | number;
  matchId?: string;
}): Promise<SimulationInput> {
  if (opts.homeTeamId === opts.awayTeamId) {
    throw new SimulationHttpError(400, 'InvalidSimulationRequest', 'Home and away teams must differ');
  }
  if (opts.seed === '' || opts.seed == null) {
    throw new SimulationHttpError(400, 'InvalidSimulationRequest', 'Seed is required');
  }

  await assertTeamSimulationReady(opts.homeTeamId);
  await assertTeamSimulationReady(opts.awayTeamId);

  const snapshot = await getActiveBalanceSnapshot();
  if (!isF11CompatibleBalanceConfig(snapshot.config)) {
    throw new SimulationHttpError(
      409,
      'IncompatibleBalanceConfiguration',
      'Active balance configuration is not F11-compatible (requires schemaVersion >= 2 with active match section)',
      { schemaVersion: snapshot.version.schemaVersion },
    );
  }

  const [homeBundle, awayBundle] = await Promise.all([
    loadTeamBundle(opts.homeTeamId),
    loadTeamBundle(opts.awayTeamId),
  ]);
  if (!homeBundle || !awayBundle) {
    throw new SimulationHttpError(404, 'TeamNotFound', 'Home or away team not found');
  }

  const homeTeam = buildTeamInputFromLoaded('HOME', homeBundle.team as never, homeBundle.chemistry);
  const awayTeam = buildTeamInputFromLoaded('AWAY', awayBundle.team as never, awayBundle.chemistry);

  const draft: Omit<SimulationInput, 'inputFingerprint'> = {
    matchId: opts.matchId ?? `debug-${opts.homeTeamId}-${opts.awayTeamId}`,
    engineVersion: FHM_ENGINE_VERSION,
    simulationMode: F11_SIMULATION_MODE,
    seed: opts.seed,
    balance: {
      presetId: snapshot.preset.id,
      presetName: snapshot.preset.name,
      versionId: snapshot.version.id,
      versionNumber: snapshot.version.versionNumber,
      schemaVersion: snapshot.version.schemaVersion,
      configHash: snapshot.version.configHash,
      snapshot: snapshot.config,
    },
    homeTeam,
    awayTeam,
    rules: {
      regulationPeriods: REGULATION_PERIODS,
      periodDurationSeconds: PERIOD_DURATION_SECONDS,
    },
  };

  const fingerprint = createHash('sha256')
    .update(canonicalizeSimulationInput({ ...draft, inputFingerprint: 'placeholder' }), 'utf8')
    .digest('hex');
  const input: SimulationInput = { ...draft, inputFingerprint: fingerprint };

  try {
    validateSimulationInput(input);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Invalid simulation input';
    throw new SimulationHttpError(422, 'InvalidSimulationInput', message);
  }

  return input;
}
