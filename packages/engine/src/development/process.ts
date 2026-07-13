import { ageOnEffectiveDate } from './age.js';
import { calculateDevelopmentBudget } from './budget.js';
import { updateAnnualForm } from './form.js';
import { developGoalieAttributes } from './goalie.js';
import {
  hashDevelopmentRunInput,
  hashDevelopmentRunResult,
  hashDevelopmentPlayerInput,
  hashPlayerDevelopmentConfig,
  hashPlayerDevelopmentResult,
} from './hashing.js';
import { evaluateRetirement } from './retirement.js';
import { deriveRoleAfter, recalculateCurrentAbility } from './role.js';
import { developSkaterAttributes } from './skater.js';
import type {
  DevelopmentPlayerInput,
  DevelopmentPlayerResult,
  DevelopmentRunSummary,
  PlayerDevelopmentConfig,
} from './types.js';
import { PlayerDevelopmentError } from './types.js';

export function developPlayer(input: {
  player: DevelopmentPlayerInput;
  config: PlayerDevelopmentConfig;
  effectiveDate: string;
  baseSeed: string;
  includeRetiredPlayers?: boolean;
}): DevelopmentPlayerResult {
  const { player, config, effectiveDate, baseSeed } = input;
  const warnings: string[] = [];

  if (
    player.lifecycleStatus === 'RETIRED' &&
    !(input.includeRetiredPlayers ?? false)
  ) {
    throw new PlayerDevelopmentError(
      'InvalidPlayerDevelopmentInput',
      `Player ${player.playerId} is already retired`,
    );
  }

  const age = ageOnEffectiveDate(player.birthDate, effectiveDate);
  if (player.currentAbility > player.potentialCeiling) {
    warnings.push('current_ability_exceeds_potential');
  }

  const budget = calculateDevelopmentBudget({
    player,
    config,
    effectiveDate,
    baseSeed,
  });

  const allocation =
    player.playerType === 'GOALIE'
      ? developGoalieAttributes({
          player,
          budget: budget.finalBudget,
          config,
          baseSeed,
          effectiveDate,
        })
      : developSkaterAttributes({
          player,
          budget: budget.finalBudget,
          config,
          baseSeed,
          effectiveDate,
        });

  const abilityAfter = recalculateCurrentAbility(
    player.playerType,
    allocation.attributesAfter,
  );
  const roleAfter = deriveRoleAfter(
    player.playerType,
    player.position,
    allocation.attributesAfter,
  );
  const form = updateAnnualForm({
    formBefore: player.form,
    config,
    playerId: player.playerId,
    baseSeed,
    effectiveDate,
  });

  const retirement = evaluateRetirement({
    player,
    age,
    currentAbilityAfter: abilityAfter,
    config,
    baseSeed,
    effectiveDate,
  });

  const abilityDelta = abilityAfter - player.currentAbility;
  let direction: DevelopmentPlayerResult['direction'] = 'FLAT';
  if (abilityDelta > 0) direction = 'UP';
  else if (abilityDelta < 0) direction = 'DOWN';

  let outcome: DevelopmentPlayerResult['outcome'] = 'STABLE';
  if (retirement.retired) outcome = 'RETIRED';
  else if (direction === 'UP') outcome = 'DEVELOPED';
  else if (direction === 'DOWN') outcome = 'DECLINED';

  const lifecycleAfter = retirement.retired ? 'RETIRED' : player.lifecycleStatus;

  const partial: Omit<DevelopmentPlayerResult, 'resultHash'> = {
    playerId: player.playerId,
    playerType: player.playerType,
    position: player.position,
    ageOnEffectiveDate: age,
    lifecycleBefore: player.lifecycleStatus,
    lifecycleAfter,
    currentAbilityBefore: player.currentAbility,
    currentAbilityAfter: abilityAfter,
    potentialCeiling: player.potentialCeiling,
    roleBefore: player.currentRole,
    roleAfter,
    roleChanged: roleAfter !== player.currentRole,
    form,
    budget,
    usedBudget: allocation.usedBudget,
    unusedBudget: allocation.unusedBudget,
    direction,
    outcome,
    retired: retirement.retired,
    retirement,
    attributeChanges: allocation.changes,
    attributesAfter: allocation.attributesAfter,
    warnings,
  };

  const result: DevelopmentPlayerResult = {
    ...partial,
    resultHash: '',
  };
  result.resultHash = hashPlayerDevelopmentResult(result);
  return result;
}

export function developPlayers(input: {
  players: DevelopmentPlayerInput[];
  config: PlayerDevelopmentConfig;
  worldSeasonId: string;
  effectiveDate: string;
  baseSeed: string;
  includeRetiredPlayers?: boolean;
}): { results: DevelopmentPlayerResult[]; summary: DevelopmentRunSummary } {
  const configHash = hashPlayerDevelopmentConfig(input.config);
  const results: DevelopmentPlayerResult[] = [];
  const playerInputHashes: string[] = [];

  const ordered = [...input.players].sort((a, b) =>
    a.playerId.localeCompare(b.playerId),
  );

  for (const player of ordered) {
    playerInputHashes.push(hashDevelopmentPlayerInput(player));
    results.push(
      developPlayer({
        player,
        config: input.config,
        effectiveDate: input.effectiveDate,
        baseSeed: input.baseSeed,
        includeRetiredPlayers: input.includeRetiredPlayers,
      }),
    );
  }

  const inputHash = hashDevelopmentRunInput({
    worldSeasonId: input.worldSeasonId,
    effectiveDate: input.effectiveDate,
    baseSeed: input.baseSeed,
    configHash,
    playerInputHashes,
  });
  const resultHash = hashDevelopmentRunResult({
    effectiveDate: input.effectiveDate,
    baseSeed: input.baseSeed,
    configHash,
    playerResultHashes: results.map((r) => r.resultHash),
  });

  let developedCount = 0;
  let declinedCount = 0;
  let stableCount = 0;
  let retiredCount = 0;
  let warningCount = 0;
  let abilitySum = 0;
  for (const r of results) {
    if (r.retired) retiredCount += 1;
    if (r.direction === 'UP') developedCount += 1;
    else if (r.direction === 'DOWN') declinedCount += 1;
    else stableCount += 1;
    warningCount += r.warnings.length;
    abilitySum += r.currentAbilityAfter - r.currentAbilityBefore;
  }

  return {
    results,
    summary: {
      totalPlayers: results.length,
      developedCount,
      declinedCount,
      stableCount,
      retiredCount,
      warningCount,
      averageAbilityChange:
        results.length === 0
          ? 0
          : Math.round((abilitySum / results.length) * 1000) / 1000,
      inputHash,
      resultHash,
    },
  };
}
