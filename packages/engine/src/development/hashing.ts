import { sortJsonValue } from '../balance/canonicalize.js';
import { stableDigest } from '../simulation/batch/hash.js';
import { canonicalizePlayerDevelopmentConfig } from './config.js';
import type {
  DevelopmentPlayerInput,
  DevelopmentPlayerResult,
  PlayerDevelopmentConfig,
} from './types.js';

export function hashPlayerDevelopmentConfig(config: PlayerDevelopmentConfig): string {
  return stableDigest(canonicalizePlayerDevelopmentConfig(config));
}

export function hashDevelopmentPlayerInput(player: DevelopmentPlayerInput): string {
  return stableDigest(
    JSON.stringify(
      sortJsonValue({
        playerId: player.playerId,
        playerType: player.playerType,
        birthDate: player.birthDate,
        position: player.position,
        currentRole: player.currentRole,
        lifecycleStatus: player.lifecycleStatus,
        currentTeamId: player.currentTeamId,
        currentAbility: player.currentAbility,
        potentialCeiling: player.potentialCeiling,
        potentialFloor: player.potentialFloor,
        form: player.form,
        attributes: player.attributes,
        contractStatus: player.contractStatus,
        sourceType: player.sourceType,
        developmentRate: player.developmentRate ?? null,
      }),
    ),
  );
}

export function hashDevelopmentRunInput(input: {
  worldSeasonId: string;
  effectiveDate: string;
  baseSeed: string;
  configHash: string;
  playerInputHashes: string[];
}): string {
  const ordered = [...input.playerInputHashes].sort((a, b) => a.localeCompare(b));
  return stableDigest(
    JSON.stringify({
      worldSeasonId: input.worldSeasonId,
      effectiveDate: input.effectiveDate,
      baseSeed: input.baseSeed,
      configHash: input.configHash,
      playerInputHashes: ordered,
    }),
  );
}

export function hashPlayerDevelopmentResult(result: DevelopmentPlayerResult): string {
  return stableDigest(
    JSON.stringify(
      sortJsonValue({
        playerId: result.playerId,
        playerType: result.playerType,
        position: result.position,
        ageOnEffectiveDate: result.ageOnEffectiveDate,
        lifecycleBefore: result.lifecycleBefore,
        lifecycleAfter: result.lifecycleAfter,
        currentAbilityBefore: result.currentAbilityBefore,
        currentAbilityAfter: result.currentAbilityAfter,
        potentialCeiling: result.potentialCeiling,
        roleBefore: result.roleBefore,
        roleAfter: result.roleAfter,
        form: result.form,
        budget: result.budget,
        usedBudget: result.usedBudget,
        unusedBudget: result.unusedBudget,
        direction: result.direction,
        outcome: result.outcome,
        retired: result.retired,
        retirement: result.retirement
          ? {
              retired: result.retirement.retired,
              forced: result.retirement.forced,
              probability: result.retirement.probability,
              sample: result.retirement.sample,
            }
          : null,
        attributeChanges: result.attributeChanges,
        attributesAfter: result.attributesAfter,
      }),
    ),
  );
}

export function hashDevelopmentRunResult(input: {
  effectiveDate: string;
  baseSeed: string;
  configHash: string;
  playerResultHashes: string[];
}): string {
  const ordered = [...input.playerResultHashes].sort((a, b) => a.localeCompare(b));
  return stableDigest(
    JSON.stringify({
      effectiveDate: input.effectiveDate,
      baseSeed: input.baseSeed,
      configHash: input.configHash,
      playerResultHashes: ordered,
    }),
  );
}
