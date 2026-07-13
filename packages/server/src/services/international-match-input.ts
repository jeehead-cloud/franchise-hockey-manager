/**
 * F23 — National-team → F14 simulation input (no club TeamLineup / currentTeamId mutation).
 */
import { createHash } from 'node:crypto';
import {
  FHM_ENGINE_VERSION,
  F14_SIMULATION_MODE,
  PERIOD_DURATION_SECONDS,
  REGULATION_PERIODS,
  canonicalizeSimulationInput,
  chemistryRuntimeFromBalance,
  evaluateLineupChemistry,
  isF14CompatibleBalanceConfig,
  validateSimulationInput,
  type ChemistryContext,
  type ChemistryPlayerInput,
  type MatchCompletionRules,
  type SimulationInput,
  type SimulationPlayerProfile,
  type SimulationTeamInput,
} from '@fhm/engine';
import { prisma } from '../db/client.js';
import { getActiveBalanceSnapshot } from './balance-config.js';
import {
  compactPlayerModelFields,
  publicPlayerModelDetail,
  resolveModelStatus,
  type PlayerModelRow,
} from './player-model.js';
import { SimulationHttpError } from './simulation-input.js';

export function mapNationalSlotToF14(
  unitType: string,
  unitNumber: number,
  slotType: string,
): string | null {
  if (unitType === 'FORWARD_LINE' && unitNumber >= 1 && unitNumber <= 4) {
    if (slotType === 'LW') return `F${unitNumber}_LW`;
    if (slotType === 'C') return `F${unitNumber}_C`;
    if (slotType === 'RW') return `F${unitNumber}_RW`;
  }
  if (unitType === 'DEFENSE_PAIR' && unitNumber >= 1 && unitNumber <= 3) {
    if (slotType === 'LD') return `D${unitNumber}_LD`;
    if (slotType === 'RD') return `D${unitNumber}_RD`;
  }
  if (unitType === 'GOALIE') {
    if (slotType === 'STARTER') return 'G_STARTER';
    if (slotType === 'BACKUP') return 'G_BACKUP';
    if (slotType === 'THIRD') return 'G_THIRD';
  }
  return null;
}

function stripAttr(row: { playerId?: string; createdAt?: Date; updatedAt?: Date } | null | undefined) {
  if (!row) return undefined;
  const { playerId: _p, createdAt: _c, updatedAt: _u, ...attrs } = row;
  return attrs as Record<string, number>;
}

function toPlayerProfile(
  row: {
    id: string;
    firstName: string;
    lastName: string;
    primaryPosition: string;
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
    skaterAttributes: unknown;
    goalieAttributes: unknown;
  },
  slot: string,
): SimulationPlayerProfile | null {
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
      skaterAttributes: detail.attributes,
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
    goalieAttributes: detail.attributes,
  };
}

function toChemistryPlayer(row: {
  id: string;
  primaryPosition: string;
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
  skaterAttributes: unknown;
  goalieAttributes: unknown;
}): ChemistryPlayerInput | null {
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

async function loadLockedNationalTeamBundle(
  competitionEditionId: string,
  teamId: string,
): Promise<{
  teamId: string;
  teamName: string;
  tacticalStyle: string;
  coach: {
    coachingStyle: string;
    tacticalStyle: string;
    overallCoaching: number;
    offense: number;
    defense: number;
  };
  lineupAssignments: Array<{ slot: string; playerId: string }>;
  players: SimulationPlayerProfile[];
  forwardLines: SimulationTeamInput['forwardLines'];
  defensePairs: SimulationTeamInput['defensePairs'];
  starterGoalie: SimulationTeamInput['starterGoalie'];
}> {
  const ntEdition = await prisma.nationalTeamEdition.findFirst({
    where: {
      competitionEditionId,
      status: 'LOCKED',
      participant: { teamId },
    },
    include: {
      participant: true,
      tactics: true,
      staff: true,
      lineup: { include: { slots: { orderBy: { slotOrder: 'asc' } } } },
    },
  });
  if (!ntEdition) {
    throw new SimulationHttpError(
      409,
      'NationalTeamsNotLocked',
      'Locked national-team edition required for international match simulation',
      { competitionEditionId, teamId },
    );
  }
  if (!ntEdition.lineup || !ntEdition.tactics) {
    throw new SimulationHttpError(
      409,
      'NationalTeamNotSimulationReady',
      'National-team edition missing locked lineup or tactics',
      { nationalTeamEditionId: ntEdition.id },
    );
  }

  const headCoachAssignment = ntEdition.staff.find((s) => s.role === 'HEAD_COACH');
  if (!headCoachAssignment) {
    throw new SimulationHttpError(
      409,
      'NationalTeamNotSimulationReady',
      'National-team edition missing HEAD_COACH staff assignment',
      { nationalTeamEditionId: ntEdition.id },
    );
  }
  const coach = await prisma.coach.findUnique({ where: { id: headCoachAssignment.sourceCoachId } });
  if (!coach) {
    throw new SimulationHttpError(
      409,
      'NationalTeamNotSimulationReady',
      'National-team head coach not found',
      { coachId: headCoachAssignment.sourceCoachId },
    );
  }

  const lineupAssignments: Array<{ slot: string; playerId: string }> = [];
  for (const slot of ntEdition.lineup.slots) {
    const f14 = mapNationalSlotToF14(slot.unitType, slot.unitNumber, slot.slotType);
    if (!f14) continue;
    lineupAssignments.push({ slot: f14, playerId: slot.sourcePlayerId });
  }
  if (lineupAssignments.length === 0) {
    throw new SimulationHttpError(
      409,
      'NationalTeamNotSimulationReady',
      'National-team lineup has no mappable primary slots',
      { nationalTeamEditionId: ntEdition.id },
    );
  }

  const playerIds = [...new Set(lineupAssignments.map((a) => a.playerId))];
  const playerRows = await prisma.player.findMany({
    where: { id: { in: playerIds } },
    include: { skaterAttributes: true, goalieAttributes: true },
  });
  const byId = new Map(playerRows.map((p) => [p.id, p]));

  const players: SimulationPlayerProfile[] = [];
  for (const assignment of lineupAssignments) {
    const row = byId.get(assignment.playerId);
    if (!row) {
      throw new SimulationHttpError(
        422,
        'InvalidSimulationInput',
        `National-team lineup references missing player ${assignment.playerId}`,
      );
    }
    const profile = toPlayerProfile(row, assignment.slot);
    if (!profile) {
      throw new SimulationHttpError(
        422,
        'InvalidSimulationInput',
        `Incomplete player model for national-team player ${assignment.playerId}`,
      );
    }
    players.push(profile);
  }

  const snapshot = await getActiveBalanceSnapshot();
  const chemistryConfig = chemistryRuntimeFromBalance(snapshot.config.chemistry);
  const chemBySlot = new Map<string, ChemistryPlayerInput | null>();
  for (const assignment of lineupAssignments) {
    const row = byId.get(assignment.playerId);
    chemBySlot.set(assignment.slot, row ? toChemistryPlayer(row) : null);
  }
  const slotPlayer = (slot: string) => chemBySlot.get(slot) ?? null;
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
  const starter = slotPlayer('G_STARTER');
  const context: ChemistryContext = {
    coach: {
      coachingStyle: coach.coachingStyle as NonNullable<ChemistryContext['coach']>['coachingStyle'],
      tacticalStyle: coach.tacticalStyle as NonNullable<ChemistryContext['coach']>['tacticalStyle'],
      overallCoaching: coach.overallCoaching ?? 10,
      offense: coach.offense ?? 10,
      defense: coach.defense ?? 10,
    },
    teamTacticalStyle: ntEdition.tactics.tacticalStyle as ChemistryContext['teamTacticalStyle'],
    familiarity: 0,
  };
  const chemistry = evaluateLineupChemistry({
    forwardLines,
    defensePairs,
    starterGoalie: starter,
    backupGoalie: slotPlayer('G_BACKUP'),
    context,
    chemistryConfig,
  });

  const epByPlayer = new Map<string, number>();
  for (const unit of [
    ...chemistry.forwardLines,
    ...chemistry.defensePairs,
    chemistry.goalies.starter,
  ]) {
    if (unit.effectivePerformance == null) continue;
    for (const pid of unit.playerIds) {
      epByPlayer.set(pid, unit.effectivePerformance);
    }
  }
  for (const p of players) {
    p.effectivePerformance = epByPlayer.get(p.playerId) ?? p.currentAbility;
  }

  return {
    teamId,
    teamName: ntEdition.teamNameSnapshot,
    tacticalStyle: ntEdition.tactics.tacticalStyle,
    coach: {
      coachingStyle: coach.coachingStyle,
      tacticalStyle: coach.tacticalStyle,
      overallCoaching: coach.overallCoaching ?? 10,
      offense: coach.offense ?? 10,
      defense: coach.defense ?? 10,
    },
    lineupAssignments,
    players,
    forwardLines: chemistry.forwardLines
      .filter((u) => u.effectivePerformance != null)
      .map((u) => ({
        unitKey: u.unitKey,
        playerIds: u.playerIds,
        effectivePerformance: u.effectivePerformance!,
      })),
    defensePairs: chemistry.defensePairs
      .filter((u) => u.effectivePerformance != null)
      .map((u) => ({
        unitKey: u.unitKey,
        playerIds: u.playerIds,
        effectivePerformance: u.effectivePerformance!,
      })),
    starterGoalie: {
      unitKey: chemistry.goalies.starter.unitKey,
      playerIds: chemistry.goalies.starter.playerIds,
      effectivePerformance: chemistry.goalies.starter.effectivePerformance ?? 50,
    },
  };
}

function toTeamInput(
  side: 'HOME' | 'AWAY',
  bundle: Awaited<ReturnType<typeof loadLockedNationalTeamBundle>>,
): SimulationTeamInput {
  return {
    teamId: bundle.teamId,
    teamName: bundle.teamName,
    side,
    coach: bundle.coach,
    tacticalStyle: bundle.tacticalStyle,
    lineupAssignments: bundle.lineupAssignments,
    players: bundle.players,
    forwardLines: bundle.forwardLines,
    defensePairs: bundle.defensePairs,
    starterGoalie: bundle.starterGoalie,
  };
}

export async function buildInternationalMatchSimulationInput(opts: {
  competitionEditionId: string;
  homeTeamId: string;
  awayTeamId: string;
  seed: string | number;
  matchId?: string;
  completionRules?: MatchCompletionRules;
  rules?: { regulationPeriods: number; periodDurationSeconds: number };
}): Promise<SimulationInput> {
  if (opts.homeTeamId === opts.awayTeamId) {
    throw new SimulationHttpError(400, 'InvalidSimulationRequest', 'Home and away teams must differ');
  }
  if (opts.seed === '' || opts.seed == null) {
    throw new SimulationHttpError(400, 'InvalidSimulationRequest', 'Seed is required');
  }

  const snapshot = await getActiveBalanceSnapshot();
  if (!isF14CompatibleBalanceConfig(snapshot.config)) {
    throw new SimulationHttpError(
      409,
      'IncompatibleBalanceConfiguration',
      'Balance configuration is not F14-compatible',
      { schemaVersion: snapshot.version.schemaVersion, versionId: snapshot.version.id },
    );
  }

  const [homeBundle, awayBundle] = await Promise.all([
    loadLockedNationalTeamBundle(opts.competitionEditionId, opts.homeTeamId),
    loadLockedNationalTeamBundle(opts.competitionEditionId, opts.awayTeamId),
  ]);

  const draft: Omit<SimulationInput, 'inputFingerprint'> = {
    matchId: opts.matchId ?? `intl-${opts.homeTeamId}-${opts.awayTeamId}`,
    engineVersion: FHM_ENGINE_VERSION,
    simulationMode: F14_SIMULATION_MODE,
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
    homeTeam: toTeamInput('HOME', homeBundle),
    awayTeam: toTeamInput('AWAY', awayBundle),
    rules: {
      regulationPeriods: opts.rules?.regulationPeriods ?? REGULATION_PERIODS,
      periodDurationSeconds: opts.rules?.periodDurationSeconds ?? PERIOD_DURATION_SECONDS,
    },
    completionRules: opts.completionRules ?? {
      overtimeEnabled: true,
      shootoutEnabled: true,
      tiesAllowed: false,
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

/** Assert NATIONAL teams have LOCKED NT editions with lineup/tactics/coach (no complete-model check). */
export async function assertNationalTeamSimulationReady(
  competitionEditionId: string,
  teamId: string,
): Promise<void> {
  const ntEdition = await prisma.nationalTeamEdition.findFirst({
    where: {
      competitionEditionId,
      status: 'LOCKED',
      participant: { teamId },
    },
    include: {
      tactics: true,
      staff: true,
      lineup: { include: { slots: true } },
    },
  });
  if (!ntEdition) {
    throw new SimulationHttpError(
      409,
      'NationalTeamsNotLocked',
      'Locked national-team edition required for international match simulation',
      { competitionEditionId, teamId },
    );
  }
  if (!ntEdition.lineup || ntEdition.lineup.slots.length === 0) {
    throw new SimulationHttpError(
      409,
      'NationalTeamNotSimulationReady',
      'National-team edition missing locked lineup',
      { nationalTeamEditionId: ntEdition.id },
    );
  }
  if (!ntEdition.tactics) {
    throw new SimulationHttpError(
      409,
      'NationalTeamNotSimulationReady',
      'National-team edition missing tactics',
      { nationalTeamEditionId: ntEdition.id },
    );
  }
  if (!ntEdition.staff.some((s) => s.role === 'HEAD_COACH')) {
    throw new SimulationHttpError(
      409,
      'NationalTeamNotSimulationReady',
      'National-team edition missing HEAD_COACH',
      { nationalTeamEditionId: ntEdition.id },
    );
  }
}
