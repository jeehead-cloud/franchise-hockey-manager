import type { Prisma } from '@prisma/client';
import { assertPickTradeEligibility, assertPlayerTradeEligibility, assertRightTradeEligibility, stableTradeHash } from '@fhm/engine';
import { prisma } from '../db/client.js';
import { derivePublicPlayerModel, compactPlayerModelFields } from './player-model.js';
import { TradeHttpError } from './trade-errors.js';

export interface PlayerAssetRow {
  player: {
    id: string;
    firstName: string;
    lastName: string;
    primaryPosition: string;
    dateOfBirth: Date;
    rosterStatus: string;
    currentTeamId: string | null;
    skaterAttributes: any;
    goalieAttributes: any;
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
  };
  contracts: Array<{
    id: string;
    teamId: string;
    status: string;
    annualSalary: number;
    startSeasonOrderSnapshot: number;
    endSeasonOrderSnapshot: number;
    updatedAt: Date;
  }>;
}

const playerInclude = {
  nationality: true,
  skaterAttributes: true,
  goalieAttributes: true,
  contracts: { orderBy: { createdAt: 'asc' } },
} as const;
type LoadedPlayer = Prisma.PlayerGetPayload<{ include: typeof playerInclude }>;

export const fullName = (p: { firstName: string; lastName: string }) => `${p.firstName} ${p.lastName}`;
const seasonDate = (startYear: number) => `${startYear}-09-15`;
const isoDate = (d: Date) => d.toISOString().slice(0, 10);

/** Look up a scouting report's current-ability/potential estimate for a team. */
function reportEstimate(reportJson: string | null | undefined): { estimate: number | null; confidence: number; stale: boolean } | null {
  if (!reportJson) return null;
  try {
    const r = JSON.parse(reportJson);
    return {
      estimate: typeof r?.currentAbility?.estimate === 'number' ? r.currentAbility.estimate : null,
      confidence: typeof r?.confidence === 'number' ? r.confidence : 0,
      stale: false,
    };
  } catch {
    return null;
  }
}
function reportPotential(reportJson: string | null | undefined): { estimate: number | null; confidence: number; stale: boolean } | null {
  if (!reportJson) return null;
  try {
    const r = JSON.parse(reportJson);
    return {
      estimate: typeof r?.potential?.estimate === 'number' ? r.potential.estimate : null,
      confidence: typeof r?.confidence === 'number' ? r.confidence : 0,
      stale: false,
    };
  } catch {
    return null;
  }
}

export async function loadTeamScoutingReports(teamId: string): Promise<Map<string, { reportJson: string; sourcePlayerStateHash: string }>> {
  const rows = await prisma.teamScoutingReport.findMany({
    where: { teamId },
    select: { playerId: true, reportJson: true, sourcePlayerStateHash: true, versionNumber: true },
    orderBy: { versionNumber: 'desc' },
  });
  const map = new Map<string, { reportJson: string; sourcePlayerStateHash: string }>();
  for (const r of rows) if (!map.has(r.playerId)) map.set(r.playerId, { reportJson: r.reportJson, sourcePlayerStateHash: r.sourcePlayerStateHash });
  return map;
}

/** Build the engine player-asset DTO from a Team's visibility context (estimates only). */
export function buildPlayerAssetDto(
  player: LoadedPlayer,
  teamReports: Map<string, { reportJson: string }>,
  effectiveYear: number,
  sourceTeamId: string,
): {
  dto: import('@fhm/engine').TradePlayerAssetDto;
  activeContract: LoadedPlayer['contracts'][number] | undefined;
  futureContract: LoadedPlayer['contracts'][number] | undefined;
  eligibility: ReturnType<typeof assertPlayerTradeEligibility>;
} {
  const active = player.contracts.find((c) => c.status === 'ACTIVE');
  const future = player.contracts.find((c) => c.status === 'FUTURE');
  const report = teamReports.get(player.id)?.reportJson;
  const modelRow = {
    primaryPosition: player.primaryPosition,
    preferredCoachingStyle: player.preferredCoachingStyle,
    preferredTactics: player.preferredTactics,
    personality: player.personality,
    heroRating: player.heroRating,
    stability: player.stability,
    developmentRate: player.developmentRate,
    developmentRisk: player.developmentRisk,
    potentialFloor: player.potentialFloor,
    potentialCeiling: player.potentialCeiling,
    publicPotentialEstimate: player.publicPotentialEstimate,
    skaterAttributes: player.skaterAttributes,
    goalieAttributes: player.goalieAttributes,
  };
  const derived = derivePublicPlayerModel(modelRow as any);
  const isProspect = player.rosterStatus === 'PROSPECT';
  const visibleAbility = !isProspect && derived ? Math.round(derived.ratings.currentAbility) : null;
  const scoutingCA = report ? reportEstimate(report)?.estimate ?? null : null;
  const ability = isProspect ? scoutingCA : visibleAbility;
  const potentialEstimate = isProspect && report ? reportPotential(report) : null;
  const eligibility = assertPlayerTradeEligibility({
    playerId: player.id,
    rosterStatus: player.rosterStatus,
    currentTeamId: player.currentTeamId,
    sourceTeamId,
    activeContractTeamId: active?.teamId ?? null,
    activeContractId: active?.id ?? null,
    hasFutureContract: Boolean(future),
    futureContractTeamId: future?.teamId ?? null,
  });
  const dto = {
    playerId: player.id,
    playerName: fullName(player),
    position: player.primaryPosition,
    dateOfBirth: isoDate(player.dateOfBirth),
    effectiveDate: seasonDate(effectiveYear),
    currentAbility: ability,
    roleRating: derived?.ratings.roleRating ?? null,
    projectedRole: derived?.role.role ?? null,
    recentPerformance: null,
    developmentTrend: null,
    rosterStatus: player.rosterStatus,
    activeContractId: active?.id ?? '',
    activeContractTeamId: active?.teamId ?? '',
    activeAnnualSalary: active?.annualSalary ?? 0,
    activeContractEndOrder: active?.endSeasonOrderSnapshot ?? null,
    hasFutureContract: Boolean(future),
    potentialEstimate,
    retirementRisk: null,
  };
  return { dto, activeContract: active, futureContract: future, eligibility };
}

/** Sanitized, immutable asset snapshot text (no hidden truth / private scouting). */
export function playerAssetSnapshot(player: LoadedPlayer, active: LoadedPlayer['contracts'][number] | undefined, future: LoadedPlayer['contracts'][number] | undefined, derivedRole: string | null, visibleAbility: number | null): string {
  return JSON.stringify({
    kind: 'PLAYER_CONTRACT' as const,
    playerId: player.id,
    playerName: fullName(player),
    position: player.primaryPosition,
    rosterStatus: player.rosterStatus,
    activeContractId: active?.id ?? null,
    activeAnnualSalary: active?.annualSalary ?? null,
    activeContractEndOrder: active?.endSeasonOrderSnapshot ?? null,
    futureContractId: future?.id ?? null,
    visibleRole: derivedRole,
    visibleCurrentAbility: player.rosterStatus === 'PROSPECT' ? null : visibleAbility,
  });
}

/** Eligibility check for a draft pick owned by sourceTeamId. */
export async function validatePickAsset(pickId: string, sourceTeamId: string) {
  const pick = await prisma.draftPick.findUnique({
    where: { id: pickId },
    include: { draftEvent: { select: { id: true, status: true, worldSeasonId: true, worldSeason: { select: { startYear: true } } } } },
  });
  if (!pick) throw new TradeHttpError(404, 'DraftPickNotFound', 'Draft pick not found');
  const eligibility = assertPickTradeEligibility({
    pickId: pick.id,
    currentTeamId: pick.currentTeamId,
    sourceTeamId,
    pickStatus: pick.status,
    draftEventStatus: pick.draftEvent.status,
  });
  return { pick, eligibility };
}

export function pickAssetSnapshot(pick: { id: string; roundNumber: number; pickInRound: number; overallPick: number; originalTeamId: string; currentTeamId: string; status: string; draftEvent: { id: string; status: string } }): string {
  return JSON.stringify({
    kind: 'DRAFT_PICK' as const,
    pickId: pick.id,
    draftEventId: pick.draftEvent.id,
    draftEventStatus: pick.draftEvent.status,
    roundNumber: pick.roundNumber,
    pickInRound: pick.pickInRound,
    overallPick: pick.overallPick,
    originalTeamId: pick.originalTeamId,
    currentTeamId: pick.currentTeamId,
    pickStatus: pick.status,
  });
}

/** Eligibility check for a draft right held by sourceTeamId. */
export async function validateRightAsset(rightId: string, sourceTeamId: string) {
  const right = await prisma.playerDraftRight.findUnique({
    where: { id: rightId },
    include: { player: { include: { nationality: true } }, draftPick: { select: { roundNumber: true } } },
  });
  if (!right) throw new TradeHttpError(404, 'DraftRightNotFound', 'Draft right not found');
  const eligibility = assertRightTradeEligibility({
    rightId: right.id,
    playerId: right.playerId,
    status: right.status,
    teamId: right.teamId,
    sourceTeamId,
    playerCurrentTeamId: right.player.currentTeamId,
  });
  return { right, eligibility };
}

export function rightAssetSnapshot(right: { id: string; playerId: string; playerNameSnapshot: string; teamId: string; status: string; player: { primaryPosition: string; currentTeamId: string | null }; draftPick: { roundNumber: number } | null }): string {
  return JSON.stringify({
    kind: 'PLAYER_DRAFT_RIGHT' as const,
    rightId: right.id,
    playerId: right.playerId,
    playerName: right.playerNameSnapshot,
    position: right.player.primaryPosition,
    teamId: right.teamId,
    status: right.status,
    originatingRound: right.draftPick?.roundNumber ?? null,
  });
}

export { playerInclude, type LoadedPlayer };
export { compactPlayerModelFields };
export const assetHash = (snapshot: string) => stableTradeHash(snapshot);
