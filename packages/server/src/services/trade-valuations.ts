import type { Prisma, PrismaClient, PlayerContract, DraftPick, PlayerDraftRight, TradeAssetType, TradeSide } from '@prisma/client';
import { evaluateFairness, stableTradeHash, valuePickAsset, valuePlayerAsset, valueProspectFromEstimates, valueRightAsset, type TradeAssetValuation, type TradeConfig, type TradeProposalValuation, type TradeSideValuation } from '@fhm/engine';
import { prisma } from '../db/client.js';
import { derivePublicPlayerModel } from './player-model.js';
import { buildPlayerAssetDto, fullName, loadTeamScoutingReports, playerAssetSnapshot, pickAssetSnapshot, rightAssetSnapshot, validatePickAsset, validateRightAsset, type LoadedPlayer, playerInclude } from './trade-assets.js';
import { getActiveTradeSnapshot, type TradeDbClient } from './trade-config.js';
import { TradeHttpError } from './trade-errors.js';

export interface AssetDescriptor {
  assetType: TradeAssetType;
  playerContractId?: string | null;
  draftPickId?: string | null;
  playerDraftRightId?: string | null;
}

async function currentSeasonOrder(): Promise<number> {
  const season = (await prisma.worldSeason.findFirst({ where: { status: 'ACTIVE' }, orderBy: { startYear: 'asc' } })) ?? (await prisma.worldSeason.findFirst({ orderBy: { startYear: 'asc' } }));
  return season?.startYear ?? new Date().getFullYear();
}

interface LoadedPlayerForValuation extends LoadedPlayer {}

/** Resolve an evaluating team's scouting estimate DTOs for a prospect. */
function prospectEstimates(player: LoadedPlayerForValuation, teamReports: Map<string, { reportJson: string }>) {
  const report = teamReports.get(player.id)?.reportJson;
  if (!report) return { potentialEstimate: null, currentAbilityEstimate: null };
  try {
    const r = JSON.parse(report);
    return {
      potentialEstimate: { estimate: typeof r?.potential?.estimate === 'number' ? r.potential.estimate : null, confidence: typeof r?.confidence === 'number' ? r.confidence : 0, stale: false },
      currentAbilityEstimate: { estimate: typeof r?.currentAbility?.estimate === 'number' ? r.currentAbility.estimate : null, confidence: typeof r?.confidence === 'number' ? r.confidence : 0, stale: false },
    };
  } catch {
    return { potentialEstimate: null, currentAbilityEstimate: null };
  }
}

/** Compute a single Team-context asset valuation (advisory, never true potential). */
async function valueAsset(descriptor: AssetDescriptor, sourceTeamId: string, evaluatingTeamId: string, config: TradeConfig, teamReports: Map<string, { reportJson: string }>): Promise<{ valuation: TradeAssetValuation; snapshotText: string; snapshot: Record<string, unknown>; loaded: { player?: any; contract?: PlayerContract; pick?: any; right?: any } }> {
  const effectiveYear = await currentSeasonOrder();
  if (descriptor.assetType === 'PLAYER_CONTRACT') {
    if (!descriptor.playerContractId) throw new TradeHttpError(422, 'InvalidTradeAsset', 'playerContractId required for PLAYER_CONTRACT');
    const contractRow = await prisma.playerContract.findUnique({ where: { id: descriptor.playerContractId }, select: { id: true, playerId: true } });
    if (!contractRow) throw new TradeHttpError(404, 'ContractNotFound', 'Contract not found');
    const player = await prisma.player.findUniqueOrThrow({ where: { id: contractRow.playerId }, include: playerInclude });
    const { dto, activeContract, futureContract, eligibility } = buildPlayerAssetDto(player, teamReports, effectiveYear, sourceTeamId);
    if (!eligibility.eligible) throw new TradeHttpError(409, 'PlayerNotTradeEligible', eligibility.reasons.join('; '));
    if (!activeContract || activeContract.id !== descriptor.playerContractId) throw new TradeHttpError(409, 'ActiveContractRequired', 'The referenced contract is not the player\'s active contract');
    const valuation = valuePlayerAsset(dto, config);
    const derived = derivePublicPlayerModel({
      primaryPosition: player.primaryPosition, preferredCoachingStyle: player.preferredCoachingStyle, preferredTactics: player.preferredTactics,
      personality: player.personality, heroRating: player.heroRating, stability: player.stability, developmentRate: player.developmentRate, developmentRisk: player.developmentRisk,
      potentialFloor: player.potentialFloor, potentialCeiling: player.potentialCeiling, publicPotentialEstimate: player.publicPotentialEstimate,
      skaterAttributes: player.skaterAttributes as any, goalieAttributes: player.goalieAttributes as any,
    } as any);
    const snapshotText = playerAssetSnapshot(player, activeContract, futureContract, derived?.role.role ?? null, derived ? Math.round(derived.ratings.currentAbility) : null);
    return { valuation, snapshotText, snapshot: JSON.parse(snapshotText), loaded: { player, contract: activeContract as unknown as PlayerContract } };
  }
  if (descriptor.assetType === 'DRAFT_PICK') {
    if (!descriptor.draftPickId) throw new TradeHttpError(422, 'InvalidTradeAsset', 'draftPickId required for DRAFT_PICK');
    const { pick, eligibility } = await validatePickAsset(descriptor.draftPickId, sourceTeamId);
    if (!eligibility.eligible) throw new TradeHttpError(409, 'DraftPickNotTradeEligible', eligibility.reasons.join('; '));
    const draftSeasonOrder = (pick as any).draftEvent?.worldSeason?.startYear ?? null;
    const valuation = valuePickAsset({
      pickId: pick.id, draftEventId: pick.draftEventId, draftEventStatus: (pick as any).draftEvent.status, roundNumber: pick.roundNumber,
      overallPick: pick.overallPick, pickStatus: pick.status, originalTeamId: pick.originalTeamId, currentTeamId: pick.currentTeamId,
      draftSeasonOrder, currentSeasonOrder: effectiveYear,
    }, config);
    const snapshotText = pickAssetSnapshot(pick as any);
    return { valuation, snapshotText, snapshot: JSON.parse(snapshotText), loaded: { pick } };
  }
  if (descriptor.assetType === 'PLAYER_DRAFT_RIGHT') {
    if (!descriptor.playerDraftRightId) throw new TradeHttpError(422, 'InvalidTradeAsset', 'playerDraftRightId required for PLAYER_DRAFT_RIGHT');
    const { right, eligibility } = await validateRightAsset(descriptor.playerDraftRightId, sourceTeamId);
    if (!eligibility.eligible) throw new TradeHttpError(409, 'DraftRightNotTradeEligible', eligibility.reasons.join('; '));
    const player = await prisma.player.findUnique({ where: { id: right.playerId }, include: playerInclude });
    const estimates = player ? prospectEstimates(player!, teamReports) : { potentialEstimate: null, currentAbilityEstimate: null };
    const derived = player ? derivePublicPlayerModel({ primaryPosition: player.primaryPosition, preferredCoachingStyle: player.preferredCoachingStyle, preferredTactics: player.preferredTactics, personality: player.personality, heroRating: player.heroRating, stability: player.stability, developmentRate: player.developmentRate, developmentRisk: player.developmentRisk, potentialFloor: player.potentialFloor, potentialCeiling: player.potentialCeiling, publicPotentialEstimate: player.publicPotentialEstimate, skaterAttributes: player.skaterAttributes as any, goalieAttributes: player.goalieAttributes as any } as any) : null;
    const valuation = valueRightAsset({
      rightId: right.id, playerId: right.playerId, playerName: right.playerNameSnapshot, position: right.player.primaryPosition,
      dateOfBirth: isoDate(right.player.dateOfBirth), effectiveDate: seasonDate(effectiveYear), status: right.status,
      originatingRound: (right as any).draftPick?.roundNumber ?? null, potentialEstimate: estimates.potentialEstimate,
      currentAbilityEstimate: estimates.currentAbilityEstimate, projectedRole: derived?.role.role ?? null,
    }, config);
    const snapshotText = rightAssetSnapshot(right as any);
    return { valuation, snapshotText, snapshot: JSON.parse(snapshotText), loaded: { right } };
  }
  throw new TradeHttpError(422, 'InvalidTradeAsset', `Unsupported asset type ${descriptor.assetType}`);
}

const isoDate = (d: Date) => d.toISOString().slice(0, 10);
const seasonDate = (startYear: number) => `${startYear}-09-15`;

export interface SideValuationInput {
  teamId: string;
  evaluatingTeamId: string;
  assets: AssetDescriptor[];
}

/** Compute both-side valuations + fairness for a proposal preview (no writes). */
export async function computeProposalValuation(proposing: SideValuationInput, receiving: SideValuationInput, config: TradeConfig): Promise<TradeProposalValuation & { assetSnapshots: { side: TradeSide; descriptor: AssetDescriptor; snapshot: Record<string, unknown>; valuation: TradeAssetValuation }[] }> {
  const proposingReports = await loadTeamScoutingReports(proposing.evaluatingTeamId);
  const receivingReports = await loadTeamScoutingReports(receiving.evaluatingTeamId);
  const proposingResults = await Promise.all(proposing.assets.map(async (a) => {
    const r = await valueAsset(a, proposing.teamId, proposing.evaluatingTeamId, config, proposingReports);
    return { side: 'PROPOSING' as const, descriptor: a, snapshot: r.snapshot, valuation: r.valuation, loaded: r.loaded, snapshotText: r.snapshotText };
  }));
  const receivingResults = await Promise.all(receiving.assets.map(async (a) => {
    const r = await valueAsset(a, receiving.teamId, receiving.evaluatingTeamId, config, receivingReports);
    return { side: 'RECEIVING' as const, descriptor: a, snapshot: r.snapshot, valuation: r.valuation, loaded: r.loaded, snapshotText: r.snapshotText };
  }));
  const proposingTotal = proposingResults.reduce((n, r) => n + r.valuation.value, 0);
  const receivingTotal = receivingResults.reduce((n, r) => n + r.valuation.value, 0);
  const fairness = evaluateFairness(proposingTotal, receivingTotal, config);
  type SideResult = { valuation: TradeAssetValuation };
  const sideValuation = (side: TradeSide, teamId: string, results: SideResult[]): TradeSideValuation => ({
    side, teamId, totalValue: Math.round(results.reduce((n, r) => n + r.valuation.value, 0) * 100) / 100, assets: results.map((r) => r.valuation),
  });
  return {
    proposing: sideValuation('PROPOSING', proposing.teamId, proposingResults),
    receiving: sideValuation('RECEIVING', receiving.teamId, receivingResults),
    fairness,
    assetSnapshots: [...proposingResults, ...receivingResults].map((r) => ({ side: r.side, descriptor: r.descriptor, snapshot: r.snapshot, valuation: r.valuation })),
  };
}

export { valueAsset };
