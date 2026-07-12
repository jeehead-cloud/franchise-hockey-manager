import type {
  GoaliesBalanceSection,
  MatchBalanceSection,
  ShotsBalanceSection,
} from '../../balance/types.js';
import { isF13CompatibleBalanceConfig } from '../../balance/schema.js';
import type { GoalieAttributes, SkaterAttributes } from '../../players/types.js';
import { GOALIE_ATTRIBUTE_KEYS, SKATER_ATTRIBUTE_KEYS } from '../../players/types.js';
import { cancelPenaltyOnPowerPlayGoal, getPenaltiesConfig, regulationSeconds } from './penalties.js';
import { isPowerPlayForSide, isShortHandedForSide } from './strength-state.js';
import type { GoalStrength } from './penalty-types.js';
import { NET_FRONT_POSITIONS, NET_FRONT_SHOT_ROLES } from './constants.js';
import { deriveAssists } from './assists.js';
import { IncompatibleBalanceConfigError, IllegalStateTransitionError } from './errors.js';
import { chance, nextFloat, weightedPick } from './rng.js';
import { SHOT_TYPES, type ShotType } from './shot-types.js';
import type {
  ActiveLines,
  MatchEvent,
  MatchScore,
  MatchState,
  MissReason,
  PendingShot,
  PossessionSide,
  ReboundOutcome,
  ShotResolutionDetails,
  SimulationInput,
  SimulationPlayerProfile,
} from './types.js';

const ATTR_SCALE = 100;

export function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.min(1, Math.max(0, n));
}

export function clamp(n: number, min: number, max: number): number {
  if (!Number.isFinite(n)) return min;
  return Math.min(max, Math.max(min, n));
}

export function logistic(x: number): number {
  if (x >= 20) return 1;
  if (x <= -20) return 0;
  return 1 / (1 + Math.exp(-x));
}

export function getShotsConfig(input: SimulationInput): ShotsBalanceSection {
  if (!isF13CompatibleBalanceConfig(input.balance.snapshot)) {
    throw new IncompatibleBalanceConfigError(
      `Active balance schemaVersion ${input.balance.snapshot.schemaVersion} is not F13-compatible (requires schemaVersion >= 4 with active match/shots/goalies/penalties)`,
    );
  }
  return input.balance.snapshot.shots;
}

export function getGoaliesConfig(input: SimulationInput): GoaliesBalanceSection {
  if (!isF13CompatibleBalanceConfig(input.balance.snapshot)) {
    throw new IncompatibleBalanceConfigError(
      `Active balance schemaVersion ${input.balance.snapshot.schemaVersion} is not F13-compatible (requires schemaVersion >= 4 with active match/shots/goalies/penalties)`,
    );
  }
  return input.balance.snapshot.goalies;
}

export function getMatchConfigForShots(input: SimulationInput): MatchBalanceSection {
  if (!isF13CompatibleBalanceConfig(input.balance.snapshot)) {
    throw new IncompatibleBalanceConfigError(
      `Active balance schemaVersion ${input.balance.snapshot.schemaVersion} is not F13-compatible`,
    );
  }
  return input.balance.snapshot.match;
}

function findPlayer(input: SimulationInput, playerId: string): SimulationPlayerProfile | undefined {
  return (
    input.homeTeam.players.find((p) => p.playerId === playerId) ??
    input.awayTeam.players.find((p) => p.playerId === playerId)
  );
}

function defaultSkaterAttributes(ca: number): SkaterAttributes {
  const v = clamp(ca, 1, 99);
  const out = {} as SkaterAttributes;
  for (const key of SKATER_ATTRIBUTE_KEYS) out[key] = v;
  return out;
}

function defaultGoalieAttributes(ca: number): GoalieAttributes {
  const v = clamp(ca, 1, 99);
  const out = {} as GoalieAttributes;
  for (const key of GOALIE_ATTRIBUTE_KEYS) out[key] = v;
  return out;
}

export function resolveSkaterAttributes(player: SimulationPlayerProfile): SkaterAttributes {
  if (player.skaterAttributes) return player.skaterAttributes;
  return defaultSkaterAttributes(player.currentAbility);
}

export function resolveGoalieAttributes(player: SimulationPlayerProfile): GoalieAttributes {
  if (player.goalieAttributes) return player.goalieAttributes;
  return defaultGoalieAttributes(player.currentAbility);
}

export function getAttackingSkaterIds(lines: ActiveLines, attackingSide: PossessionSide): string[] {
  if (attackingSide === 'HOME') {
    return [...lines.homeForwardPlayerIds, ...lines.homeDefensePlayerIds];
  }
  if (attackingSide === 'AWAY') {
    return [...lines.awayForwardPlayerIds, ...lines.awayDefensePlayerIds];
  }
  return [];
}

export function getDefendingSkaterIds(lines: ActiveLines, attackingSide: PossessionSide): string[] {
  if (attackingSide === 'HOME') {
    return [...lines.awayForwardPlayerIds, ...lines.awayDefensePlayerIds];
  }
  if (attackingSide === 'AWAY') {
    return [...lines.homeForwardPlayerIds, ...lines.homeDefensePlayerIds];
  }
  return [];
}

function defendingSide(attacking: Exclude<PossessionSide, 'NONE'>): Exclude<PossessionSide, 'NONE'> {
  return attacking === 'HOME' ? 'AWAY' : 'HOME';
}

function teamIdForSide(input: SimulationInput, side: Exclude<PossessionSide, 'NONE'>): string {
  return side === 'HOME' ? input.homeTeam.teamId : input.awayTeam.teamId;
}

function goalieIdForDefending(lines: ActiveLines, attacking: Exclude<PossessionSide, 'NONE'>): string {
  return attacking === 'HOME' ? lines.awayGoalieId : lines.homeGoalieId;
}

function unitEp(
  input: SimulationInput,
  side: Exclude<PossessionSide, 'NONE'>,
  lines: ActiveLines,
): number {
  const team = side === 'HOME' ? input.homeTeam : input.awayTeam;
  const fk = side === 'HOME' ? lines.homeForwardLineKey : lines.awayForwardLineKey;
  const dk = side === 'HOME' ? lines.homeDefensePairKey : lines.awayDefensePairKey;
  const f = team.forwardLines.find((u) => u.unitKey === fk)?.effectivePerformance ?? 50;
  const d = team.defensePairs.find((u) => u.unitKey === dk)?.effectivePerformance ?? 50;
  return (f + d) / 2;
}

function roleTendencyMultiplier(role: string, shotsCfg: ShotsBalanceSection): number {
  const tier = shotsCfg.roleShotTendencies[role] ?? 'medium';
  return shotsCfg.roleShotTendencyMultipliers[tier] ?? 1;
}

function isNetFrontEligible(player: SimulationPlayerProfile): boolean {
  if ((NET_FRONT_SHOT_ROLES as readonly string[]).includes(player.role)) return true;
  return (NET_FRONT_POSITIONS as readonly string[]).includes(player.primaryPosition);
}

/**
 * base × bounded attack-vs-defense adjustment, clamped to a safe range.
 */
export function computeShotOpportunityProbability(
  attEp: number,
  defEp: number,
  matchCfg: MatchBalanceSection,
  _shotsCfg: ShotsBalanceSection,
): number {
  const base = matchCfg.offensiveZoneShotOpportunityProbability;
  const adj = 1 + clamp((attEp - defEp) / 100, -0.35, 0.35);
  return clamp(base * adj, 0.05, 0.75);
}

export function selectShooter(
  input: SimulationInput,
  attackingIds: readonly string[],
  shotsCfg: ShotsBalanceSection,
  rng: MatchState['rng'],
): { shooterId: string; rng: MatchState['rng'] } {
  if (attackingIds.length === 0) {
    throw new IllegalStateTransitionError('Cannot select shooter from empty attacking unit');
  }
  const weights: Record<string, number> = {};
  const w = shotsCfg.shooterAttributeWeights;
  for (const id of attackingIds) {
    const player = findPlayer(input, id);
    if (!player || player.primaryPosition === 'G') continue;
    const attrs = resolveSkaterAttributes(player);
    const raw =
      (attrs.shooting / ATTR_SCALE) * w.shooting +
      (attrs.offensiveAwareness / ATTR_SCALE) * w.offensiveAwareness +
      (player.currentAbility / ATTR_SCALE) * w.currentAbility;
    const tendency = roleTendencyMultiplier(player.role, shotsCfg);
    weights[id] = Math.max(0.01, raw * tendency);
  }
  if (Object.keys(weights).length === 0) {
    throw new IllegalStateTransitionError('No eligible shooters on attacking unit');
  }
  const pick = weightedPick(rng, weights);
  return { shooterId: pick.value, rng: pick.rng };
}

/**
 * Build 0–2 passers from attacking skaters excluding the shooter.
 * Ordered oldest → newest.
 */
export function buildPassChain(
  input: SimulationInput,
  attackingIds: readonly string[],
  shooterId: string,
  existingChain: readonly string[],
  shotsCfg: ShotsBalanceSection,
  rng: MatchState['rng'],
): { passChain: string[]; rng: MatchState['rng'] } {
  let r = rng;
  const candidates = attackingIds.filter((id) => id !== shooterId);
  if (candidates.length === 0) return { passChain: [], rng: r };

  const countRoll = nextFloat(r);
  r = countRoll.rng;
  // ~40% unassisted, ~40% one passer, ~20% two
  let targetCount = 0;
  if (countRoll.value < 0.4) targetCount = 0;
  else if (countRoll.value < 0.8) targetCount = 1;
  else targetCount = Math.min(2, candidates.length);

  targetCount = Math.min(targetCount, candidates.length);
  if (targetCount === 0) {
    // Prefer existing possession participants when present and still on ice
    const retained = existingChain.filter((id) => id !== shooterId && candidates.includes(id)).slice(-2);
    return { passChain: retained, rng: r };
  }

  const selected: string[] = [];
  const remaining = new Set(candidates);
  for (let i = 0; i < targetCount; i += 1) {
    const weights: Record<string, number> = {};
    for (const id of remaining) {
      const player = findPlayer(input, id);
      if (!player) continue;
      const attrs = resolveSkaterAttributes(player);
      weights[id] = Math.max(
        0.01,
        (attrs.passing / ATTR_SCALE) * 0.6 + (attrs.offensiveAwareness / ATTR_SCALE) * 0.4,
      );
    }
    if (Object.keys(weights).length === 0) break;
    const pick = weightedPick(r, weights);
    r = pick.rng;
    selected.push(pick.value);
    remaining.delete(pick.value);
  }

  // Blend with existing chain: keep unique, max 2, newest last
  const merged: string[] = [];
  for (const id of [...existingChain.filter((x) => x !== shooterId), ...selected]) {
    if (!merged.includes(id) && id !== shooterId && candidates.includes(id)) merged.push(id);
  }
  return { passChain: merged.slice(-2), rng: r };
}

export function selectShotType(
  input: SimulationInput,
  shooterId: string,
  passChain: readonly string[],
  shotsCfg: ShotsBalanceSection,
  rng: MatchState['rng'],
): { shotType: ShotType; rng: MatchState['rng'] } {
  const shooter = findPlayer(input, shooterId);
  if (!shooter) throw new IllegalStateTransitionError(`Unknown shooter ${shooterId}`);

  const weights: Record<ShotType, number> = { ...shotsCfg.shotTypeWeights };
  const isD = shooter.primaryPosition === 'LD' || shooter.primaryPosition === 'RD';
  const netFront = isNetFrontEligible(shooter);
  const hasPass = passChain.length > 0;

  if (isD || shooter.role === 'POINT_SHOOTER' || shooter.role === 'ATTACKING_D' || shooter.role === 'QUARTERBACK') {
    weights.SLAP *= 1.6;
    weights.WRIST *= 1.1;
  }
  if (shooter.role === 'ROCKET' || shooter.role === 'PLAYMAKER') {
    weights.SNAP *= 1.35;
    weights.WRIST *= 1.15;
  }
  if (!netFront || !hasPass) {
    weights.TIP = 0;
    weights.DEFLECTION = 0;
  } else {
    if (shooter.role === 'DEFLECTOR') {
      weights.TIP *= 2.2;
      weights.DEFLECTION *= 1.8;
    }
    if (shooter.role === 'SCREENER' || shooter.role === 'GARBAGE_COLLECTOR') {
      weights.TIP *= 1.6;
      weights.DEFLECTION *= 1.8;
    }
  }

  // Ensure at least one positive weight
  const total = SHOT_TYPES.reduce((s, t) => s + (weights[t] ?? 0), 0);
  if (!(total > 0)) {
    weights.WRIST = 1;
  }
  const pick = weightedPick(rng, weights);
  return { shotType: pick.value, rng: pick.rng };
}

export function computeDefensivePressure(
  input: SimulationInput,
  defendingIds: readonly string[],
  defendingUnitEp: number,
  shotsCfg: ShotsBalanceSection,
): number {
  const w = shotsCfg.defensivePressureWeights;
  if (defendingIds.length === 0) {
    return clamp01((defendingUnitEp / ATTR_SCALE) * w.defendingUnitEffectivePerformance);
  }
  let sum = 0;
  for (const id of defendingIds) {
    const player = findPlayer(input, id);
    if (!player || player.primaryPosition === 'G') continue;
    const attrs = resolveSkaterAttributes(player);
    sum +=
      (attrs.defensiveAwareness / ATTR_SCALE) * w.defensiveAwareness +
      (attrs.strength / ATTR_SCALE) * w.strength +
      (attrs.balance / ATTR_SCALE) * w.balance;
  }
  const avg = sum / Math.max(1, defendingIds.length);
  const unitTerm = (defendingUnitEp / ATTR_SCALE) * w.defendingUnitEffectivePerformance;
  return clamp01(avg + unitTerm);
}

export function computeShotQuality(
  input: SimulationInput,
  shooterId: string,
  shotType: ShotType,
  passChain: readonly string[],
  attackingUnitEp: number,
  defensivePressure: number,
  shotsCfg: ShotsBalanceSection,
  rng: MatchState['rng'],
): { shotQuality: number; screenFactor: number; rng: MatchState['rng'] } {
  const shooter = findPlayer(input, shooterId);
  if (!shooter) throw new IllegalStateTransitionError(`Unknown shooter ${shooterId}`);
  const attrs = resolveSkaterAttributes(shooter);
  const w = shotsCfg.shotQualityWeights;

  let quality =
    (attrs.shooting / ATTR_SCALE) * w.shooting +
    (attrs.offensiveAwareness / ATTR_SCALE) * w.offensiveAwareness +
    (attrs.stickhandling / ATTR_SCALE) * w.stickhandling +
    (attackingUnitEp / ATTR_SCALE) * w.attackingUnitEffectivePerformance +
    defensivePressure * w.defensivePressure;

  if (passChain.length > 0) {
    quality += shotsCfg.passQualityContribution * Math.min(1, passChain.length / 2);
  }

  let screenFactor = 0;
  if (shotType === 'TIP' || shotType === 'DEFLECTION') {
    quality += shotsCfg.deflectionContribution;
    screenFactor = shotsCfg.screenContribution;
    quality += screenFactor;
  } else if (isNetFrontEligible(shooter)) {
    screenFactor = shotsCfg.screenContribution * 0.5;
    quality += screenFactor;
  }

  const randomness = input.balance.snapshot.randomness.finishingVariance;
  const varRoll = nextFloat(rng);
  const noise = (varRoll.value - 0.5) * 2 * shotsCfg.shotQualityVariance * randomness;
  quality = clamp01(quality + noise);
  return { shotQuality: quality, screenFactor, rng: varRoll.rng };
}

export function computeBlockMissOnTargetProbabilities(
  shotQuality: number,
  defensivePressure: number,
  shotsCfg: ShotsBalanceSection,
): { blockProbability: number; missProbability: number; onTargetProbability: number } {
  let blockP = clamp01(shotsCfg.blockProbability * (0.65 + defensivePressure * 0.7));
  let missP = clamp01(
    shotsCfg.missProbability * (0.7 + defensivePressure * 0.5) * (1.15 - shotQuality * 0.5),
  );
  let onTarget = clamp(1 - blockP - missP, shotsCfg.onTargetFloor, shotsCfg.onTargetCeiling);

  // Renormalize so the three outcomes sum to 1 while respecting floors/ceilings as soft guides
  const rawSum = blockP + missP + onTarget;
  if (rawSum > 0) {
    blockP /= rawSum;
    missP /= rawSum;
    onTarget /= rawSum;
  } else {
    blockP = 0.2;
    missP = 0.3;
    onTarget = 0.5;
  }
  return {
    blockProbability: clamp01(blockP),
    missProbability: clamp01(missP),
    onTargetProbability: clamp01(onTarget),
  };
}

export function computeGoalProbability(
  input: SimulationInput,
  goalieId: string,
  shotType: ShotType,
  shotQuality: number,
  screenFactor: number,
  passChainLength: number,
  shotsCfg: ShotsBalanceSection,
  goaliesCfg: GoaliesBalanceSection,
  rng: MatchState['rng'],
): { goalProbability: number; rng: MatchState['rng'] } {
  const goalie = findPlayer(input, goalieId);
  if (!goalie) throw new IllegalStateTransitionError(`Unknown goalie ${goalieId}`);
  const attrs = resolveGoalieAttributes(goalie);
  const typeWeights = goaliesCfg.attributeWeightsByShotType[shotType] ?? {};

  let weightSum = 0;
  let scoreSum = 0;
  for (const [key, weight] of Object.entries(typeWeights)) {
    if (!weight || weight <= 0) continue;
    const attrKey = key as keyof GoalieAttributes;
    const value = attrs[attrKey] ?? 50;
    weightSum += weight;
    scoreSum += (value / ATTR_SCALE) * weight;
  }
  const goalieMatchup = weightSum > 0 ? scoreSum / weightSum : attrs.positioning / ATTR_SCALE;

  // Active attrs: reflexes, positioning, glove, blocker, movement, consistency (via variance).
  // Unused / minimal in F12: stamina, puckHandling (not central to stopping).
  let movementBonus = 0;
  if (passChainLength > 0) {
    movementBonus = (attrs.movement / ATTR_SCALE) * goaliesCfg.lateralMovementEffect;
  }

  const curve = goaliesCfg.saveProbabilityCurve;
  // Higher shot quality → lower save; stronger goalie → higher save
  let saveRaw =
    curve.intercept +
    curve.shotQualitySlope * shotQuality +
    (goalieMatchup - 0.5) * 0.55 +
    movementBonus -
    screenFactor * goaliesCfg.screenPenalty;

  const consistency = attrs.consistency / ATTR_SCALE;
  const varianceScale =
    (1 - consistency) *
    goaliesCfg.consistencyVarianceEffect *
    input.balance.snapshot.randomness.goalieVariance;
  const noiseRoll = nextFloat(rng);
  const noise = (noiseRoll.value - 0.5) * 2 * varianceScale;
  saveRaw = clamp01(saveRaw + noise);

  // Logistic blend of shot quality vs goalie for final goal probability
  const matchupDiff = shotQuality - goalieMatchup;
  const logisticGoal = logistic(matchupDiff * 3.2 - 0.35);
  const curveGoal = 1 - saveRaw;
  const blended = clamp01(0.55 * logisticGoal + 0.45 * curveGoal);

  return {
    goalProbability: clamp(blended, shotsCfg.goalProbabilityFloor, shotsCfg.goalProbabilityCeiling),
    rng: noiseRoll.rng,
  };
}

export function selectBlocker(
  input: SimulationInput,
  defendingIds: readonly string[],
  rng: MatchState['rng'],
): { blockerId: string; rng: MatchState['rng'] } {
  if (defendingIds.length === 0) {
    throw new IllegalStateTransitionError('Cannot select blocker from empty defending unit');
  }
  const weights: Record<string, number> = {};
  for (const id of defendingIds) {
    const player = findPlayer(input, id);
    if (!player || player.primaryPosition === 'G') continue;
    const attrs = resolveSkaterAttributes(player);
    weights[id] = Math.max(
      0.01,
      (attrs.defensiveAwareness / ATTR_SCALE) * 0.35 +
        (attrs.strength / ATTR_SCALE) * 0.25 +
        (attrs.balance / ATTR_SCALE) * 0.2 +
        (attrs.aggression / ATTR_SCALE) * 0.2,
    );
  }
  if (Object.keys(weights).length === 0) {
    throw new IllegalStateTransitionError('No eligible blockers');
  }
  const pick = weightedPick(rng, weights);
  return { blockerId: pick.value, rng: pick.rng };
}

function pickMissReason(rng: MatchState['rng']): { reason: MissReason; rng: MatchState['rng'] } {
  const pick = weightedPick(rng, { WIDE: 0.45, HIGH: 0.4, POST: 0.15 } as Record<MissReason, number>);
  return { reason: pick.value, rng: pick.rng };
}

function pickReboundOutcome(
  goalieId: string,
  input: SimulationInput,
  goaliesCfg: GoaliesBalanceSection,
  rng: MatchState['rng'],
): { outcome: ReboundOutcome; rng: MatchState['rng'] } {
  const goalie = findPlayer(input, goalieId);
  const reboundControl = goalie ? resolveGoalieAttributes(goalie).reboundControl / ATTR_SCALE : 0.5;
  const base = goaliesCfg.reboundOutcomeWeights;
  const weights = {
    CONTROLLED: base.controlled * (0.7 + reboundControl * 0.6),
    REBOUND: base.rebound * (1.2 - reboundControl * 0.6),
    FROZEN: base.frozen * (0.8 + reboundControl * 0.5),
  };
  const pick = weightedPick(rng, weights);
  return { outcome: pick.value as ReboundOutcome, rng: pick.rng };
}

export function resolveShotOutcome(
  input: SimulationInput,
  pending: PendingShot,
  defendingIds: readonly string[],
  rng: MatchState['rng'],
): { details: ShotResolutionDetails; rng: MatchState['rng'] } {
  let r = rng;
  const roll = nextFloat(r);
  r = roll.rng;
  const blockCut = pending.blockProbability;
  const missCut = pending.blockProbability + pending.missProbability;

  if (roll.value < blockCut) {
    const blocker = selectBlocker(input, defendingIds, r);
    return { details: { type: 'SHOT_BLOCKED', blockerId: blocker.blockerId }, rng: blocker.rng };
  }
  if (roll.value < missCut) {
    const miss = pickMissReason(r);
    return { details: { type: 'SHOT_MISSED', missReason: miss.reason }, rng: miss.rng };
  }

  const goalRoll = chance(r, pending.goalProbability);
  r = goalRoll.rng;
  if (goalRoll.value) {
    const assists = deriveAssists(pending.passChain, pending.shooterId);
    return {
      details: {
        type: 'GOAL',
        primaryAssistId: assists.primaryAssistId,
        secondaryAssistId: assists.secondaryAssistId,
      },
      rng: r,
    };
  }

  const goaliesCfg = getGoaliesConfig(input);
  const rebound = pickReboundOutcome(pending.goalieId, input, goaliesCfg, r);
  return {
    details: { type: 'SAVE', reboundOutcome: rebound.outcome },
    rng: rebound.rng,
  };
}

function makeShotEvent(
  state: MatchState,
  input: SimulationInput,
  type: MatchEvent['type'],
  extra: Partial<MatchEvent> & { details?: Record<string, unknown> },
): MatchEvent {
  return {
    index: state.eventIndex + 1,
    type,
    period: state.period,
    elapsedSeconds: state.clockElapsedSeconds,
    remainingSeconds: state.clockRemainingSeconds,
    teamId: extra.teamId ?? null,
    playerIds: extra.playerIds ?? [],
    zone: extra.zone ?? state.zone,
    possession: extra.possession ?? state.possession,
    strengthState: state.strengthState,
    shiftNumber: state.currentShift?.shiftNumber ?? null,
    visibility: extra.visibility ?? (type === 'GOAL' || type === 'SAVE' ? 'PUBLIC' : 'TECHNICAL'),
    details: extra.details ?? {},
  };
}

function bumpEvent(state: MatchState): MatchState {
  return {
    ...state,
    eventIndex: state.eventIndex + 1,
    safetyEventsEmitted: state.safetyEventsEmitted + 1,
  };
}

/**
 * Create a SHOT attempt and park resolution in `pendingShot`.
 * Caller must be in offensive-zone possession with an active shift.
 */
export function createShotAttempt(
  input: SimulationInput,
  state: MatchState,
  events: MatchEvent[],
): { state: MatchState; events: MatchEvent[] } {
  if (!state.currentShift) {
    throw new IllegalStateTransitionError('Cannot create shot without active shift');
  }
  if (state.possession !== 'HOME' && state.possession !== 'AWAY') {
    throw new IllegalStateTransitionError('Cannot create shot without team possession');
  }
  if (state.zone !== 'OFFENSIVE') {
    throw new IllegalStateTransitionError('Shots only from offensive-zone possession');
  }
  if (state.pendingShot) {
    throw new IllegalStateTransitionError('Cannot create shot while another shot is pending');
  }

  const shotsCfg = getShotsConfig(input);
  const goaliesCfg = getGoaliesConfig(input);
  const matchCfg = getMatchConfigForShots(input);
  void matchCfg;

  const attacking = state.possession;
  const lines = state.currentShift.lines;
  const attackingIds = getAttackingSkaterIds(lines, attacking);
  const defendingIds = getDefendingSkaterIds(lines, attacking);
  const attEp = unitEp(input, attacking, lines);
  const defEp = unitEp(input, defendingSide(attacking), lines);

  let rng = state.rng;
  const shooterPick = selectShooter(input, attackingIds, shotsCfg, rng);
  rng = shooterPick.rng;
  const shooterId = shooterPick.shooterId;

  const chain = buildPassChain(input, attackingIds, shooterId, state.passChainPlayerIds, shotsCfg, rng);
  rng = chain.rng;

  const typePick = selectShotType(input, shooterId, chain.passChain, shotsCfg, rng);
  rng = typePick.rng;

  const pressure = computeDefensivePressure(input, defendingIds, defEp, shotsCfg);
  const quality = computeShotQuality(
    input,
    shooterId,
    typePick.shotType,
    chain.passChain,
    attEp,
    pressure,
    shotsCfg,
    rng,
  );
  rng = quality.rng;
  let shotQuality = quality.shotQuality;
  if (isF13CompatibleBalanceConfig(input.balance.snapshot) && isPowerPlayForSide(state.strengthState, attacking)) {
    shotQuality = clamp01(shotQuality * (1 + getPenaltiesConfig(input).powerPlayShotQualityModifier));
  }

  const probs = computeBlockMissOnTargetProbabilities(shotQuality, pressure, shotsCfg);
  const goalieId = goalieIdForDefending(lines, attacking);
  const goalProb = computeGoalProbability(
    input,
    goalieId,
    typePick.shotType,
    shotQuality,
    quality.screenFactor,
    chain.passChain.length,
    shotsCfg,
    goaliesCfg,
    rng,
  );
  rng = goalProb.rng;

  const shotSequenceId = state.shotSequenceId + 1;
  const attackingTeamId = teamIdForSide(input, attacking);
  const defendingTeamId = teamIdForSide(input, defendingSide(attacking));

  const shotEventIndex = state.eventIndex + 1;
  const attemptCreatorId = chain.passChain.length > 0 ? chain.passChain[chain.passChain.length - 1]! : null;

  const pending: PendingShot = {
    shotSequenceId,
    shotEventIndex,
    shooterId,
    goalieId,
    shotType: typePick.shotType,
    shotQuality,
    defensivePressure: pressure,
    screenFactor: quality.screenFactor,
    passChain: chain.passChain,
    attackingSide: attacking,
    attackingTeamId,
    defendingTeamId,
    blockProbability: probs.blockProbability,
    missProbability: probs.missProbability,
    onTargetProbability: probs.onTargetProbability,
    goalProbability: goalProb.goalProbability,
    attemptCreatorId,
  };

  const ev = makeShotEvent(state, input, 'SHOT', {
    teamId: attackingTeamId,
    playerIds: [shooterId, goalieId, ...chain.passChain],
    zone: 'OFFENSIVE',
    possession: attacking,
    visibility: 'PUBLIC',
    details: {
      shotSequenceId,
      shootingTeamId: attackingTeamId,
      shooterId,
      goalieId,
      shotType: typePick.shotType,
      shotQuality,
      defensivePressure: pressure,
      screenFactor: quality.screenFactor,
      passChainPlayerIds: chain.passChain,
      primaryPasserCandidateId: chain.passChain[chain.passChain.length - 1] ?? null,
      secondaryPasserCandidateId: chain.passChain[chain.passChain.length - 2] ?? null,
      attemptCreatorId,
      onTargetProbability: probs.onTargetProbability,
      blockProbability: probs.blockProbability,
      missProbability: probs.missProbability,
      goalProbability: goalProb.goalProbability,
      attackingUnitEp: attEp,
      defendingUnitEp: defEp,
    },
  });

  const nextState: MatchState = {
    ...bumpEvent(state),
    rng,
    pendingShot: pending,
    shotSequenceId,
    passChainPlayerIds: chain.passChain,
  };

  return { state: nextState, events: [...events, ev] };
}

/**
 * Resolve `state.pendingShot` into exactly one of SHOT_BLOCKED / SHOT_MISSED / SAVE / GOAL.
 */
export function resolvePendingShot(
  input: SimulationInput,
  state: MatchState,
  events: MatchEvent[],
): { state: MatchState; events: MatchEvent[] } {
  const pending = state.pendingShot;
  if (!pending) {
    throw new IllegalStateTransitionError('No pending shot to resolve');
  }
  if (!state.currentShift) {
    throw new IllegalStateTransitionError('Cannot resolve shot without active shift');
  }

  const lines = state.currentShift.lines;
  const defendingIds = getDefendingSkaterIds(lines, pending.attackingSide);
  const resolved = resolveShotOutcome(input, pending, defendingIds, state.rng);
  let rng = resolved.rng;
  const details = resolved.details;

  const commonDetails = {
    shotSequenceId: pending.shotSequenceId,
    shotEventIndex: pending.shotEventIndex,
    shooterId: pending.shooterId,
    goalieId: pending.goalieId,
    shotType: pending.shotType,
    shotQuality: pending.shotQuality,
    defensivePressure: pending.defensivePressure,
    passChainPlayerIds: pending.passChain,
  };

  if (details.type === 'SHOT_BLOCKED') {
    const ev = makeShotEvent(state, input, 'SHOT_BLOCKED', {
      teamId: pending.defendingTeamId,
      playerIds: [pending.shooterId, details.blockerId!],
      zone: 'OFFENSIVE',
      possession: pending.attackingSide,
      details: {
        ...commonDetails,
        blockerId: details.blockerId,
        attackingTeamId: pending.attackingTeamId,
        defendingTeamId: pending.defendingTeamId,
      },
    });
    // Block often flips possession to defending team in their defensive zone conceptually —
    // leave possession sequencing to the integrator; clear pending and keep possession for now.
    const next: MatchState = {
      ...bumpEvent({ ...state, rng }),
      pendingShot: null,
      passChainPlayerIds: [],
      possession: defendingSide(pending.attackingSide),
      zone: 'DEFENSIVE',
    };
    return { state: next, events: [...events, ev] };
  }

  if (details.type === 'SHOT_MISSED') {
    const ev = makeShotEvent(state, input, 'SHOT_MISSED', {
      teamId: pending.attackingTeamId,
      playerIds: [pending.shooterId],
      zone: 'OFFENSIVE',
      possession: pending.attackingSide,
      details: {
        ...commonDetails,
        missReason: details.missReason,
        attackingTeamId: pending.attackingTeamId,
      },
    });
    const next: MatchState = {
      ...bumpEvent({ ...state, rng }),
      pendingShot: null,
      passChainPlayerIds: [],
      possession: 'NONE',
      zone: null,
      phase: 'AWAITING_STOPPAGE_FACEOFF',
    };
    return { state: next, events: [...events, ev] };
  }

  if (details.type === 'SAVE') {
    const ev = makeShotEvent(state, input, 'SAVE', {
      teamId: pending.defendingTeamId,
      playerIds: [pending.goalieId, pending.shooterId],
      zone: 'OFFENSIVE',
      possession: pending.attackingSide,
      visibility: 'PUBLIC',
      details: {
        ...commonDetails,
        saveProbability: 1 - pending.goalProbability,
        reboundOutcome: details.reboundOutcome,
        goalProbability: pending.goalProbability,
      },
    });
    let nextPossession: PossessionSide = pending.attackingSide;
    let nextZone: MatchState['zone'] = 'OFFENSIVE';
    let nextPhase = state.phase;
    if (details.reboundOutcome === 'FROZEN' || details.reboundOutcome === 'CONTROLLED') {
      nextPossession = 'NONE';
      nextZone = null;
      nextPhase = 'AWAITING_STOPPAGE_FACEOFF';
    } else {
      // REBOUND: attacking team keeps offensive possession
      nextPossession = pending.attackingSide;
      nextZone = 'OFFENSIVE';
    }
    const next: MatchState = {
      ...bumpEvent({ ...state, rng }),
      pendingShot: null,
      passChainPlayerIds: [],
      possession: nextPossession,
      zone: nextZone,
      phase: nextPhase,
    };
    return { state: next, events: [...events, ev] };
  }

  // GOAL
  const strengthBefore = state.strengthState;
  let goalStrength: GoalStrength = 'EVEN_STRENGTH';
  if (isPowerPlayForSide(strengthBefore, pending.attackingSide)) {
    goalStrength = 'POWER_PLAY';
  } else if (isShortHandedForSide(strengthBefore, pending.attackingSide)) {
    goalStrength = 'SHORT_HANDED';
  }

  const activePenaltySequenceId = state.activePenalty?.penaltySequenceId ?? null;
  const penaltyEndedByGoal = goalStrength === 'POWER_PLAY' && state.activePenalty != null;

  const scoreAfter: MatchScore =
    pending.attackingSide === 'HOME'
      ? { home: state.score.home + 1, away: state.score.away }
      : { home: state.score.home, away: state.score.away + 1 };

  const assistIds = [details.primaryAssistId, details.secondaryAssistId].filter(
    (id): id is string => Boolean(id),
  );

  const ev = makeShotEvent(state, input, 'GOAL', {
    teamId: pending.attackingTeamId,
    playerIds: [pending.shooterId, pending.goalieId, ...assistIds],
    zone: 'OFFENSIVE',
    possession: pending.attackingSide,
    visibility: 'PUBLIC',
    details: {
      ...commonDetails,
      scoringTeamId: pending.attackingTeamId,
      concedingTeamId: pending.defendingTeamId,
      scorerId: pending.shooterId,
      primaryAssistId: details.primaryAssistId ?? null,
      secondaryAssistId: details.secondaryAssistId ?? null,
      scoreAfter,
      goalProbability: pending.goalProbability,
      goalStrength,
      strengthState: strengthBefore,
      activePenaltySequenceId,
      penaltyEndedByGoal,
      ...(penaltyEndedByGoal ? { reason: 'POWER_PLAY_GOAL' as const } : {}),
    },
  });

  const periodDuration = input.rules.periodDurationSeconds;
  let next: MatchState = {
    ...bumpEvent({ ...state, rng }),
    pendingShot: null,
    passChainPlayerIds: [],
    score: scoreAfter,
    possession: 'NONE',
    zone: null,
    phase: 'AWAITING_STOPPAGE_FACEOFF',
  };

  if (penaltyEndedByGoal) {
    next = {
      ...cancelPenaltyOnPowerPlayGoal(next),
      lastPenaltyEndedRegulationSeconds: regulationSeconds(state, periodDuration),
    };
  }

  return { state: next, events: [...events, ev] };
}
